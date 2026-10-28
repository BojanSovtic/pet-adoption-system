import request from 'supertest';
import { afterEach, vi } from 'vitest';

import { app } from '../app';
import { ApplicationModel } from '../applications/application.model';
import { PetModel } from '../pets/pet.model';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { createTestImage } from '../test/image-fixtures';
import { listStoredFiles } from '../test/upload-test-helpers';
import { USER_WRITE_LIMITS, WRITES_PER_IP } from './rate-limit';

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
};

/** Pets inserted directly, so setting up doesn't use the pet-create budget. */
const insertPets = async (ownerId: string, count: number) =>
  (
    await PetModel.insertMany(
      Array.from({ length: count }, (_, index) => ({
        ...validPet,
        name: `Pet ${index}`,
        owner: ownerId,
      })),
    )
  ).map((pet) => pet._id.toString());

/** Sends `count` requests one after another; fails on the first non-`ok` status. */
const expectAllowed = async (
  count: number,
  ok: number,
  send: (index: number) => Promise<{ status: number }>,
) => {
  for (let index = 0; index < count; index += 1) {
    const response = await send(index);

    if (response.status !== ok) {
      throw new Error(
        `Request ${index + 1} of ${count} got ${response.status}, expected ${ok}`,
      );
    }
  }
};

const expectRateLimited = (response: request.Response) => {
  expect(response.status).toBe(429);
  expect(response.body).toEqual({ code: 'RATE_LIMITED' });
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
};

const createPet = (user: SignedInAgent, extra: object = {}) =>
  user.agent.post('/api/pets').send({ ...validPet, ...extra });

const apply = (user: SignedInAgent, petId: string) =>
  user.agent
    .post(`/api/pets/${petId}/applications`)
    .send({ message: 'We have a garden.' });

afterEach(() => {
  vi.useRealTimers();
});

// Many requests per test, several users with real Argon2id hashes.
describe('per-user write limits', { timeout: 60_000 }, () => {
  const petCreate = USER_WRITE_LIMITS.petCreate.burst.limit;
  const applications = USER_WRITE_LIMITS.applicationSubmit;
  const uploads = USER_WRITE_LIMITS.photoUpload.burst.limit;
  const otherWrites = USER_WRITE_LIMITS.otherWrite.burst.limit;

  it('allows new listings up to the limit, then refuses them', async () => {
    const owner = await createSignedInAgent('owner@example.com');

    await expectAllowed(petCreate, 201, () => createPet(owner));
    expectRateLimited(await createPet(owner));
    expect(await PetModel.countDocuments({ owner: owner.userId })).toBe(
      petCreate,
    );
  });

  it('sends rate-limit headers on allowed requests', async () => {
    const owner = await createSignedInAgent();

    const response = await createPet(owner);

    expect(response.status).toBe(201);
    const policy = String(response.headers['ratelimit-policy']);
    expect(policy).toContain('"petCreate-burst"; q=10; w=600');
    expect(policy).toContain('"petCreate-sustained"; q=30; w=86400');
    expect(policy).toContain('"writes-per-ip"');
  });

  it("gives every account its own budget; claimed ids don't change it", async () => {
    const first = await createSignedInAgent('first@example.com');
    const second = await createSignedInAgent('second@example.com');
    // Everything a client could use to pose as the second user.
    const claimSecond = (user: SignedInAgent) =>
      user.agent
        .post(`/api/pets?userId=${second.userId}&owner=${second.userId}`)
        .set('X-User-Id', second.userId)
        .send({
          ...validPet,
          owner: second.userId,
          userId: second.userId,
          role: 'admin',
        });

    await expectAllowed(petCreate, 201, () => claimSecond(first));

    expectRateLimited(await claimSecond(first));
    // The pets belong to the session's user, and the second user's budget is
    // untouched.
    expect(await PetModel.countDocuments({ owner: first.userId })).toBe(
      petCreate,
    );
    expect((await createPet(second)).status).toBe(201);
  });

  it('limits applications separately from other changes', async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const applicant = await createSignedInAgent('applicant@example.com');
    const petIds = await insertPets(owner.userId, applications.burst.limit + 1);

    await expectAllowed(applications.burst.limit, 201, (index) =>
      apply(applicant, petIds[index]),
    );

    expectRateLimited(await apply(applicant, petIds[applications.burst.limit]));
    expect(
      await ApplicationModel.countDocuments({ applicant: applicant.userId }),
    ).toBe(applications.burst.limit);

    // The same account can still post a pet; another account can still apply.
    expect((await createPet(applicant)).status).toBe(201);
    const other = await createSignedInAgent('other@example.com');
    expect((await apply(other, petIds[0])).status).toBe(201);
  });

  it('enforces the daily limit across burst windows', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date() });
    const owner = await createSignedInAgent('owner@example.com');
    const applicant = await createSignedInAgent('applicant@example.com');
    const petIds = await insertPets(
      owner.userId,
      applications.sustained.limit + 1,
    );
    const burstWindows =
      applications.sustained.limit / applications.burst.limit;
    let next = 0;

    for (let window = 0; window < burstWindows; window += 1) {
      await expectAllowed(applications.burst.limit, 201, () =>
        apply(applicant, petIds[next++]),
      );
      // Past the burst window, still inside the day.
      vi.setSystemTime(Date.now() + applications.burst.windowMs + 1000);
    }

    expectRateLimited(await apply(applicant, petIds[next]));

    vi.setSystemTime(Date.now() + applications.sustained.windowMs);
    expect((await apply(applicant, petIds[next])).status).toBe(201);
  });

  it('refuses photo uploads over the limit before reading the files', async () => {
    const owner = await createSignedInAgent();
    const [petId] = await insertPets(owner.userId, 1);
    const png = await createTestImage('png');
    const uploadPhoto = () =>
      owner.agent
        .put(`/api/pets/${petId}/image`)
        .attach('image', png, { filename: 'a.png', contentType: 'image/png' });

    await expectAllowed(uploads, 200, uploadPhoto);
    const stored = await listStoredFiles('pets');

    // Processed, these would be 415 (not an image) and 400 (wrong field):
    // the 429 shows that neither multer nor the decoder ran.
    const notAnImage = await owner.agent
      .put(`/api/pets/${petId}/image`)
      .attach('image', Buffer.from('<script>alert(1)</script>'), 'x.png');
    const wrongField = await owner.agent
      .post(`/api/pets/${petId}/images`)
      .attach('photo', png, 'a.png');

    expectRateLimited(notAnImage);
    expectRateLimited(wrongField);
    expect(await listStoredFiles('pets')).toEqual(stored);

    // Other kinds of changes have their own budgets.
    expect((await createPet(owner)).status).toBe(201);
    expect(
      (await owner.agent.put(`/api/pets/${petId}`).send(validPet)).status,
    ).toBe(200);
  });

  it('limits edits, deletions and application decisions together', async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const applicant = await createSignedInAgent('applicant@example.com');
    const [petId, otherPetId] = await insertPets(owner.userId, 2);
    const application = await apply(applicant, otherPetId);

    await expectAllowed(otherWrites, 200, (index) =>
      owner.agent
        .put(`/api/pets/${petId}`)
        .send({ ...validPet, name: `Milo ${index}` }),
    );

    expectRateLimited(
      await owner.agent.post(
        `/api/applications/${application.body._id}/reject`,
      ),
    );
    expectRateLimited(await owner.agent.delete(`/api/pets/${petId}`));
    expect(await PetModel.exists({ _id: petId })).not.toBeNull();
    expect(
      (await ApplicationModel.findById(application.body._id).lean())?.status,
    ).toBe('pending');

    // The applicant's own budget is separate.
    expect(
      (
        await applicant.agent.post(
          `/api/applications/${application.body._id}/withdraw`,
        )
      ).status,
    ).toBe(200);
  });

  it('still answers 401 for signed-out users and 403 for non-owners', async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const other = await createSignedInAgent('other@example.com');
    const [petId] = await insertPets(owner.userId, 1);

    const anonymous = await request(app).post('/api/pets').send(validPet);
    const notOwner = await other.agent.put(`/api/pets/${petId}`).send(validPet);

    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ code: 'UNAUTHENTICATED' });
    expect(notOwner.status).toBe(403);
    expect(notOwner.body).toEqual({ code: 'NOT_PET_OWNER' });
  });
});

describe('per-IP write limit', { timeout: 60_000 }, () => {
  it('caps changes from one address, signed in or not', async () => {
    // Signed-out requests are refused (401) but still counted.
    await expectAllowed(WRITES_PER_IP.limit, 401, () =>
      request(app).post('/api/pets').send(validPet),
    );

    expectRateLimited(await request(app).post('/api/pets').send(validPet));
    expectRateLimited(
      await request(app).delete('/api/pets/507f1f77bcf86cd799439011'),
    );

    // Reads and the sign-in routes (with their own limits) are not affected.
    expect((await request(app).get('/api/pets')).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'nobody@example.com', password: 'wrong password' })
      ).status,
    ).toBe(401);
  });

  it('ignores X-Forwarded-For while no proxy is trusted', async () => {
    await expectAllowed(WRITES_PER_IP.limit, 401, (index) =>
      request(app)
        .post('/api/pets')
        .set('X-Forwarded-For', `203.0.113.${index % 250}`)
        .send(validPet),
    );

    expectRateLimited(
      await request(app)
        .post('/api/pets')
        .set('X-Forwarded-For', '198.51.100.7')
        .send(validPet),
    );
  });
});
