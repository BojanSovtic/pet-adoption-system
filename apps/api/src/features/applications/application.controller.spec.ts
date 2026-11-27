import mongoose from 'mongoose';
import request from 'supertest';

import { app } from '../../app';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../../test/auth-test-helpers';
import { PetModel } from '../pets/pet.model';
import { ApplicationModel } from './application.model';

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
};

const message = 'I have a big garden and lots of time for walks.';
const missingId = '507f1f77bcf86cd799439011';

type Scenario = {
  owner: SignedInAgent;
  petId: string;
};

const createOwnerWithPet = async (): Promise<Scenario> => {
  const owner = await createSignedInAgent('owner@example.com');
  const response = await owner.agent.post('/api/pets').send(validPet);

  return { owner, petId: response.body._id };
};

const apply = (
  applicant: SignedInAgent,
  petId: string,
  body: object = { message },
) => applicant.agent.post(`/api/pets/${petId}/applications`).send(body);

const applyAndGetId = async (
  applicant: SignedInAgent,
  petId: string,
): Promise<string> => (await apply(applicant, petId)).body._id;

const reason = 'We are looking for a home with a garden.';

/** Rejections send a valid reason unless the test passes its own body. */
const act = (
  user: SignedInAgent,
  applicationId: string,
  action: 'accept' | 'reject' | 'withdraw',
  body: object | undefined = action === 'reject' ? { reason } : undefined,
) => {
  const call = user.agent.post(`/api/applications/${applicationId}/${action}`);

  return body === undefined ? call : call.send(body);
};

const petStatus = async (petId: string) =>
  (await PetModel.findById(petId).lean())?.status;

const applicationStatus = async (applicationId: string) =>
  (await ApplicationModel.findById(applicationId).lean())?.status;

// Several users are registered per test, each with a deliberately slow
// Argon2id hash.
describe('adoption applications', { timeout: 20_000 }, () => {
  describe('POST /api/pets/:petId/applications', () => {
    it('requires authentication', async () => {
      const { petId } = await createOwnerWithPet();

      const response = await request(app)
        .post(`/api/pets/${petId}/applications`)
        .send({ message });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    });

    it('creates a pending application and marks the pet pending', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');

      const response = await apply(applicant, petId, {
        message: `  ${message}  `,
        // Server-managed fields in the body are ignored.
        status: 'accepted',
        applicant: missingId,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        message,
        status: 'pending',
        pet: { _id: petId, name: 'Milo', status: 'pending' },
      });
      // The applicant view never contains applicant or owner details.
      expect(response.body).not.toHaveProperty('applicant');
      expect(response.body.pet).not.toHaveProperty('owner');

      const stored = await ApplicationModel.findById(response.body._id).lean();
      expect(stored?.applicant.toString()).toBe(applicant.userId);
      expect(await petStatus(petId)).toBe('pending');
    });

    it('validates the message', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');

      const response = await apply(applicant, petId, { message: '   ' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'message', code: 'too_small' }],
      });
    });

    it('rejects invalid and unknown pet ids', async () => {
      const applicant = await createSignedInAgent('applicant@example.com');

      const invalid = await apply(applicant, 'banana');
      const missing = await apply(applicant, missingId);

      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'INVALID_PET_ID' });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'PET_NOT_FOUND' });
    });

    it('does not allow applying for your own pet', async () => {
      const { owner, petId } = await createOwnerWithPet();

      const response = await apply(owner, petId);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'CANNOT_APPLY_TO_OWN_PET' });
      expect(await petStatus(petId)).toBe('available');
    });

    it('does not allow a second application for the same pet', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      await apply(applicant, petId);

      const response = await apply(applicant, petId);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'ALREADY_APPLIED' });
    });

    it('does not allow reapplying after rejection', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      await act(owner, applicationId, 'reject');

      const response = await apply(applicant, petId);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'ALREADY_APPLIED' });
    });

    it('allows replacing a withdrawn application', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      await act(applicant, applicationId, 'withdraw');

      const response = await apply(applicant, petId);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('pending');
    });

    it('does not accept applications for adopted pets', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const first = await createSignedInAgent('first@example.com');
      const late = await createSignedInAgent('late@example.com');
      await act(owner, await applyAndGetId(first, petId), 'accept');

      const response = await apply(late, petId);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'PET_NOT_AVAILABLE' });
    });

    it('does not accept applications for pets without an owner', async () => {
      // A pet created before ownership existed.
      const { insertedId } = await PetModel.collection.insertOne({
        ...validPet,
        status: 'available',
      });
      const applicant = await createSignedInAgent('applicant@example.com');

      const response = await apply(applicant, insertedId.toString());

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'PET_NOT_AVAILABLE' });
    });
  });

  describe('visibility', () => {
    it('shows applicants only their own applications', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const other = await createSignedInAgent('other@example.com');
      await apply(applicant, petId);

      const mine = await applicant.agent.get('/api/applications/mine');
      const othersMine = await other.agent.get('/api/applications/mine');

      expect(mine.status).toBe(200);
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0]).toMatchObject({ message, status: 'pending' });
      expect(mine.body.items[0]).not.toHaveProperty('applicant');
      expect(othersMine.body.items).toEqual([]);
    });

    it("shows owners applicants' names and emails for their own pets only", async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const other = await createSignedInAgent('other@example.com');
      await apply(applicant, petId);

      const received = await owner.agent.get('/api/applications/received');
      const othersReceived = await other.agent.get(
        '/api/applications/received',
      );

      expect(received.status).toBe(200);
      expect(received.body.items).toHaveLength(1);
      expect(received.body.items[0].applicant).toEqual({
        _id: applicant.userId,
        name: 'Test User',
        email: 'applicant@example.com',
      });
      expect(othersReceived.body.items).toEqual([]);
    });

    it('requires authentication to list applications', async () => {
      const mine = await request(app).get('/api/applications/mine');
      const received = await request(app).get('/api/applications/received');

      expect(mine.status).toBe(401);
      expect(received.status).toBe(401);
    });

    it("hides other people's applications as not found", async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const stranger = await createSignedInAgent('stranger@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      for (const action of ['accept', 'reject', 'withdraw'] as const) {
        const response = await act(stranger, applicationId, action);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ code: 'APPLICATION_NOT_FOUND' });
      }

      expect(await applicationStatus(applicationId)).toBe('pending');
    });

    it('rejects invalid application ids', async () => {
      const user = await createSignedInAgent();

      const response = await act(user, 'banana', 'accept');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ code: 'INVALID_APPLICATION_ID' });
    });
  });

  describe('pagination', () => {
    /** One owner with `count` pets; one applicant applies to each, in order. */
    const createApplications = async (count: number) => {
      const owner = await createSignedInAgent('owner@example.com');
      const applicant = await createSignedInAgent('applicant@example.com');
      const petIds: string[] = [];

      for (let index = 0; index < count; index += 1) {
        const pet = await owner.agent
          .post('/api/pets')
          .send({ ...validPet, name: `Pet ${index}` });
        petIds.push(pet.body._id);
        await apply(applicant, pet.body._id);
      }

      return { owner, applicant, petIds };
    };

    const petNames = (body: { items: Array<{ pet: { name: string } }> }) =>
      body.items.map((item) => item.pet.name);

    it('returns pages newest first with metadata', async () => {
      const { owner, applicant } = await createApplications(3);

      for (const [user, path] of [
        [applicant, '/api/applications/mine'],
        [owner, '/api/applications/received'],
      ] as const) {
        const first = await user.agent.get(`${path}?pageSize=2`);
        const second = await user.agent.get(`${path}?pageSize=2&page=2`);

        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
          page: 1,
          pageSize: 2,
          totalItems: 3,
          totalPages: 2,
        });
        expect(petNames(first.body)).toEqual(['Pet 2', 'Pet 1']);
        expect(petNames(second.body)).toEqual(['Pet 0']);
      }
    });

    it('uses a default page size of 10', async () => {
      const { owner } = await createApplications(1);

      const response = await owner.agent.get('/api/applications/received');

      expect(response.body).toMatchObject({
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('returns an empty page past the end', async () => {
      const { applicant } = await createApplications(1);

      const response = await applicant.agent.get(
        '/api/applications/mine?page=5',
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        items: [],
        page: 5,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it.each([
      ['page=0', 'page'],
      ['page=abc', 'page'],
      ['pageSize=51', 'pageSize'],
      ['page=1&page=2', 'page'],
    ])('rejects ?%s', async (queryString, field) => {
      const user = await createSignedInAgent();

      for (const path of ['mine', 'received']) {
        const response = await user.agent.get(
          `/api/applications/${path}?${queryString}`,
        );

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_FAILED');
        expect(response.body.details[0].field).toBe(field);
      }
    });

    it('narrows my applications to one pet', async () => {
      const { applicant, petIds } = await createApplications(2);

      const response = await applicant.agent.get(
        `/api/applications/mine?pet=${petIds[0]}`,
      );

      expect(response.body.totalItems).toBe(1);
      expect(petNames(response.body)).toEqual(['Pet 0']);
    });

    it('rejects an invalid pet filter', async () => {
      const user = await createSignedInAgent();

      const response = await user.agent.get('/api/applications/mine?pet=abc');

      expect(response.status).toBe(400);
      expect(response.body.details[0].field).toBe('pet');
    });

    it("never pages through other users' applications", async () => {
      const { petIds } = await createApplications(2);
      const stranger = await createSignedInAgent('stranger@example.com');

      const received = await stranger.agent.get('/api/applications/received');
      const mine = await stranger.agent.get(
        `/api/applications/mine?pet=${petIds[0]}`,
      );

      expect(received.body).toMatchObject({ items: [], totalItems: 0 });
      expect(mine.body).toMatchObject({ items: [], totalItems: 0 });
    });
  });

  describe('state transitions', () => {
    it('lets only the owner accept or reject, and only the applicant withdraw', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      const applicantAccepts = await act(applicant, applicationId, 'accept');
      const applicantRejects = await act(applicant, applicationId, 'reject');
      const ownerWithdraws = await act(owner, applicationId, 'withdraw');

      expect(applicantAccepts.status).toBe(403);
      expect(applicantAccepts.body).toEqual({ code: 'NOT_PET_OWNER' });
      expect(applicantRejects.status).toBe(403);
      expect(ownerWithdraws.status).toBe(403);
      expect(ownerWithdraws.body).toEqual({ code: 'NOT_APPLICANT' });
      expect(await applicationStatus(applicationId)).toBe('pending');
    });

    it('rejecting the last pending application makes the pet available again', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      const response = await act(owner, applicationId, 'reject');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'rejected',
        applicant: { email: 'applicant@example.com' },
      });
      expect(await petStatus(petId)).toBe('available');
    });

    it('keeps the pet pending while other applications are pending', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const first = await createSignedInAgent('first@example.com');
      const second = await createSignedInAgent('second@example.com');
      const firstId = await applyAndGetId(first, petId);
      await apply(second, petId);

      await act(owner, firstId, 'reject');

      expect(await petStatus(petId)).toBe('pending');
    });

    it('withdrawing the last pending application makes the pet available again', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      const response = await act(applicant, applicationId, 'withdraw');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('withdrawn');
      expect(response.body).not.toHaveProperty('applicant');
      expect(await petStatus(petId)).toBe('available');
    });

    it('treats accepted, rejected and withdrawn as final', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      await act(owner, applicationId, 'reject');

      const rejectAgain = await act(owner, applicationId, 'reject');
      const withdrawRejected = await act(applicant, applicationId, 'withdraw');

      expect(rejectAgain.status).toBe(409);
      expect(rejectAgain.body).toEqual({ code: 'INVALID_STATUS_TRANSITION' });
      expect(withdrawRejected.status).toBe(409);
      expect(await applicationStatus(applicationId)).toBe('rejected');
    });

    it('accepting adopts the pet and rejects the other pending applications', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const chosen = await createSignedInAgent('chosen@example.com');
      const other = await createSignedInAgent('other@example.com');
      const withdrawn = await createSignedInAgent('withdrawn@example.com');
      const chosenId = await applyAndGetId(chosen, petId);
      const otherId = await applyAndGetId(other, petId);
      const withdrawnId = await applyAndGetId(withdrawn, petId);
      await act(withdrawn, withdrawnId, 'withdraw');

      const response = await act(owner, chosenId, 'accept');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'accepted',
        pet: { status: 'adopted' },
      });
      expect(await petStatus(petId)).toBe('adopted');
      expect(await applicationStatus(otherId)).toBe('rejected');
      // Already-final applications are left alone.
      expect(await applicationStatus(withdrawnId)).toBe('withdrawn');

      const acceptAnother = await act(owner, otherId, 'accept');

      expect(acceptAnother.status).toBe(409);
      expect(acceptAnother.body).toEqual({ code: 'PET_NOT_AVAILABLE' });
    });
  });

  describe('rejection reasons', () => {
    const storedReason = async (applicationId: string) =>
      (await ApplicationModel.findById(applicationId).lean())?.rejectionReason;

    it.each([
      ['missing', {}, 'invalid_type'],
      ['empty', { reason: '' }, 'too_small'],
      ['whitespace only', { reason: ' \n\t ' }, 'too_small'],
      ['too long', { reason: 'x'.repeat(1001) }, 'too_big'],
    ])('requires a reason (%s)', async (_label, body, code) => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      const response = await act(owner, applicationId, 'reject', body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'reason', code }],
      });
      expect(await applicationStatus(applicationId)).toBe('pending');
      expect(await petStatus(petId)).toBe('pending');
    });

    it('stores the trimmed reason and shows it to the owner and the applicant only', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const other = await createSignedInAgent('other@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      await apply(other, petId);

      const response = await act(owner, applicationId, 'reject', {
        reason: `  ${reason}\n`,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'rejected',
        rejectionReason: reason,
      });
      expect(await storedReason(applicationId)).toBe(reason);

      const mine = await applicant.agent.get('/api/applications/mine');
      const received = await owner.agent.get('/api/applications/received');
      const othersMine = await other.agent.get('/api/applications/mine');

      expect(mine.body.items[0]).toMatchObject({
        _id: applicationId,
        status: 'rejected',
        rejectionReason: reason,
        pet: { _id: petId },
      });
      expect(
        received.body.items.find(
          (item: { _id: string }) => item._id === applicationId,
        ),
      ).toMatchObject({ rejectionReason: reason });
      // The other applicant's own application never carries it.
      expect(othersMine.body.items).toHaveLength(1);
      expect(othersMine.body.items[0]).not.toHaveProperty('rejectionReason');
    });

    it('lets nobody but the owner reject, even with a valid reason', async () => {
      const { petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const stranger = await createSignedInAgent('stranger@example.com');
      const applicationId = await applyAndGetId(applicant, petId);

      const byApplicant = await act(applicant, applicationId, 'reject');
      const byStranger = await act(stranger, applicationId, 'reject');

      expect(byApplicant.status).toBe(403);
      expect(byStranger.status).toBe(404);
      expect(await applicationStatus(applicationId)).toBe('pending');
      expect(await storedReason(applicationId)).toBeUndefined();
    });

    it('never overwrites a reason once the application is rejected', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      await act(owner, applicationId, 'reject');

      const again = await act(owner, applicationId, 'reject', {
        reason: 'A different reason.',
      });
      const withdraw = await act(applicant, applicationId, 'withdraw', {
        rejectionReason: 'Changed by the applicant.',
      });

      expect(again.status).toBe(409);
      expect(withdraw.status).toBe(409);
      expect(await storedReason(applicationId)).toBe(reason);
    });

    it('ignores a reason sent with accept and adds none to auto-rejected applications', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const chosen = await createSignedInAgent('chosen@example.com');
      const other = await createSignedInAgent('other@example.com');
      const chosenId = await applyAndGetId(chosen, petId);
      const otherId = await applyAndGetId(other, petId);

      const response = await act(owner, chosenId, 'accept', {
        reason: 'Not used.',
        rejectionReason: 'Not used either.',
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('rejectionReason');
      expect(await storedReason(chosenId)).toBeUndefined();
      expect(await applicationStatus(otherId)).toBe('rejected');
      expect(await storedReason(otherId)).toBeUndefined();

      const othersMine = await other.agent.get('/api/applications/mine');
      expect(othersMine.body.items[0]).toMatchObject({ status: 'rejected' });
      expect(othersMine.body.items[0]).not.toHaveProperty('rejectionReason');
    });

    it('returns older rejected applications without a reason unchanged', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      const applicationId = await applyAndGetId(applicant, petId);
      // As stored before reasons existed: no field at all.
      await ApplicationModel.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(applicationId) },
        { $set: { status: 'rejected' } },
      );

      const mine = await applicant.agent.get('/api/applications/mine');
      const received = await owner.agent.get('/api/applications/received');

      expect(mine.body.items[0].status).toBe('rejected');
      expect(mine.body.items[0]).not.toHaveProperty('rejectionReason');
      expect(received.body.items[0]).not.toHaveProperty('rejectionReason');
    });
  });

  describe('pending count (GET /api/applications/received?status=pending)', () => {
    it("counts only the owner's own pending applications and follows decisions", async () => {
      const { owner, petId } = await createOwnerWithPet();
      const otherOwner = await createSignedInAgent('other-owner@example.com');
      const otherPet = await otherOwner.agent
        .post('/api/pets')
        .send({ ...validPet, name: 'Luna' });
      const first = await createSignedInAgent('first@example.com');
      const second = await createSignedInAgent('second@example.com');
      const third = await createSignedInAgent('third@example.com');
      const firstId = await applyAndGetId(first, petId);
      const secondId = await applyAndGetId(second, petId);
      await apply(third, petId);
      // Pending, but for someone else's pet.
      await apply(first, otherPet.body._id);

      const pendingCount = async (user: SignedInAgent) => {
        const response = await user.agent.get(
          '/api/applications/received?status=pending&pageSize=1',
        );
        expect(response.status).toBe(200);
        return response.body.totalItems;
      };

      expect(await pendingCount(owner)).toBe(3);
      expect(await pendingCount(otherOwner)).toBe(1);
      // An applicant receives nothing.
      expect(await pendingCount(first)).toBe(0);

      await act(owner, firstId, 'reject');
      expect(await pendingCount(owner)).toBe(2);

      await act(owner, secondId, 'accept');
      // The third was auto-rejected.
      expect(await pendingCount(owner)).toBe(0);
      expect(await pendingCount(otherOwner)).toBe(1);
    });

    it('lists only applications of the requested status', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const first = await createSignedInAgent('first@example.com');
      const second = await createSignedInAgent('second@example.com');
      const firstId = await applyAndGetId(first, petId);
      const secondId = await applyAndGetId(second, petId);
      await act(owner, firstId, 'reject');

      const pending = await owner.agent.get(
        '/api/applications/received?status=pending',
      );
      const rejected = await owner.agent.get(
        '/api/applications/received?status=rejected',
      );

      expect(
        pending.body.items.map((item: { _id: string }) => item._id),
      ).toEqual([secondId]);
      expect(
        rejected.body.items.map((item: { _id: string }) => item._id),
      ).toEqual([firstId]);
    });

    it('rejects an unknown status', async () => {
      const owner = await createSignedInAgent('owner@example.com');

      const response = await owner.agent.get(
        '/api/applications/received?status=open',
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'status' }],
      });
    });
  });

  describe('transactions and concurrency', () => {
    it('rolls back everything when acceptance fails part-way', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const chosen = await createSignedInAgent('chosen@example.com');
      const other = await createSignedInAgent('other@example.com');
      const chosenId = await applyAndGetId(chosen, petId);
      const otherId = await applyAndGetId(other, petId);

      // Fail after the chosen application was already updated inside the
      // transaction.
      const updateMany = vi
        .spyOn(ApplicationModel, 'updateMany')
        .mockImplementationOnce(() => {
          throw new Error('simulated database failure');
        });

      const response = await act(owner, chosenId, 'accept');
      updateMany.mockRestore();

      expect(response.status).toBe(500);
      expect(await applicationStatus(chosenId)).toBe('pending');
      expect(await applicationStatus(otherId)).toBe('pending');
      expect(await petStatus(petId)).toBe('pending');
    });

    it('lets only one of two simultaneous acceptances succeed', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const first = await createSignedInAgent('first@example.com');
      const second = await createSignedInAgent('second@example.com');
      const firstId = await applyAndGetId(first, petId);
      const secondId = await applyAndGetId(second, petId);

      const responses = await Promise.all([
        act(owner, firstId, 'accept'),
        act(owner, secondId, 'accept'),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(
        await ApplicationModel.countDocuments({
          pet: petId,
          status: 'accepted',
        }),
      ).toBe(1);
      expect(
        await ApplicationModel.countDocuments({
          pet: petId,
          status: 'rejected',
        }),
      ).toBe(1);
      expect(await petStatus(petId)).toBe('adopted');
    });

    it('makes the pet available when the last two pending applications end at the same time', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const first = await createSignedInAgent('first@example.com');
      const second = await createSignedInAgent('second@example.com');
      const firstId = await applyAndGetId(first, petId);
      const secondId = await applyAndGetId(second, petId);

      // Without the pet lock, each transaction would still see the other
      // application as pending, and the pet would stay pending forever.
      const responses = await Promise.all([
        act(first, firstId, 'withdraw'),
        act(owner, secondId, 'reject'),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(await petStatus(petId)).toBe('available');
    });
  });

  describe('DELETE /api/pets/:id with applications', () => {
    it('is blocked while an application is pending', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      await apply(applicant, petId);

      const response = await owner.agent.delete(`/api/pets/${petId}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'PET_HAS_ACTIVE_APPLICATIONS' });
      expect(await PetModel.exists({ _id: petId })).not.toBeNull();
    });

    it('is blocked once an application is accepted', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      await act(owner, await applyAndGetId(applicant, petId), 'accept');

      const response = await owner.agent.delete(`/api/pets/${petId}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'PET_HAS_ACTIVE_APPLICATIONS' });
    });

    it('deletes the pet and its inactive applications otherwise', async () => {
      const { owner, petId } = await createOwnerWithPet();
      const applicant = await createSignedInAgent('applicant@example.com');
      await act(owner, await applyAndGetId(applicant, petId), 'reject');

      const response = await owner.agent.delete(`/api/pets/${petId}`);

      expect(response.status).toBe(204);
      expect(await ApplicationModel.countDocuments({ pet: petId })).toBe(0);
    });
  });
});
