import mongoose from 'mongoose';
import request from 'supertest';

import { app } from '../app';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { UserModel } from '../users/user.model';
import { PetModel } from './pet.model';

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  imageUrls: ['https://example.com/milo.jpg'],
};

const missingPetId = '507f1f77bcf86cd799439011';

const createPetAs = async (
  { agent }: SignedInAgent,
  pet: object = validPet,
): Promise<string> => {
  const response = await agent.post('/api/pets').send(pet);

  return response.body._id;
};

type SeedPet = {
  name?: string;
  species?: string;
  status?: string;
  age?: number;
  createdAt?: Date;
};

/**
 * Inserts pets directly (much faster than the API) with predictable
 * `createdAt` values: each pet is one minute newer than the previous one.
 */
const seedPets = async (pets: SeedPet[]): Promise<void> => {
  const owner = new mongoose.Types.ObjectId();
  const start = Date.UTC(2026, 0, 1);

  await PetModel.collection.insertMany(
    pets.map((pet, index) => {
      const createdAt = pet.createdAt ?? new Date(start + index * 60_000);

      return {
        owner,
        name: `Pet ${index}`,
        species: 'dog',
        status: 'available',
        age: 1,
        description: 'A pet.',
        imageUrls: [],
        ...pet,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );
};

const names = (response: { body: { items: Array<{ name: string }> } }) =>
  response.body.items.map((pet) => pet.name);

describe('GET /api/pets', () => {
  it('is public and returns pets newest first with their owner', async () => {
    const owner = await createSignedInAgent();
    await createPetAs(owner, { ...validPet, name: 'Milo' });
    await createPetAs(owner, { ...validPet, name: 'Luna' });

    const response = await request(app).get('/api/pets');

    expect(response.status).toBe(200);
    expect(names(response)).toEqual(['Luna', 'Milo']);
    expect(response.body.items[0].owner).toBe(owner.userId);
  });

  describe('pagination', () => {
    it('returns the first 12 pets and metadata by default', async () => {
      await seedPets(Array.from({ length: 15 }, () => ({})));

      const response = await request(app).get('/api/pets');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        page: 1,
        pageSize: 12,
        totalItems: 15,
        totalPages: 2,
      });
      expect(response.body.items).toHaveLength(12);
      // Newest first: the last inserted pet comes first.
      expect(response.body.items[0].name).toBe('Pet 14');
    });

    it('returns later pages', async () => {
      await seedPets(Array.from({ length: 15 }, () => ({})));

      const response = await request(app).get('/api/pets?page=2');

      expect(response.body.page).toBe(2);
      expect(names(response)).toEqual(['Pet 2', 'Pet 1', 'Pet 0']);
    });

    it('returns an empty page past the end, with correct totals', async () => {
      await seedPets([{}, {}]);

      const response = await request(app).get('/api/pets?page=5&pageSize=1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [],
        page: 5,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
      });
    });

    it('reports zero pages when there are no pets', async () => {
      const response = await request(app).get('/api/pets');

      expect(response.body).toEqual({
        items: [],
        page: 1,
        pageSize: 12,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it('accepts the maximum page size', async () => {
      await seedPets(Array.from({ length: 51 }, () => ({})));

      const response = await request(app).get('/api/pets?pageSize=50');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(50);
    });

    it('keeps a stable order across pages when sort values are equal', async () => {
      const sameTime = new Date(Date.UTC(2026, 0, 1));
      await seedPets(
        Array.from({ length: 5 }, () => ({ createdAt: sameTime })),
      );

      const pages = await Promise.all(
        [1, 2, 3].map((page) =>
          request(app).get(`/api/pets?pageSize=2&page=${page}`),
        ),
      );
      const ids = pages.flatMap((page) =>
        page.body.items.map((pet: { _id: string }) => pet._id),
      );

      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
    });

    it('treats empty parameters as not set', async () => {
      await seedPets([{}]);

      const response = await request(app).get(
        '/api/pets?page=&pageSize=&species=&status=&sort=&search=',
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 12 });
    });
  });

  describe('validation', () => {
    it.each([
      ['page=0', 'page', 'too_small'],
      ['page=abc', 'page', 'invalid_type'],
      ['page=1.5', 'page', 'invalid_type'],
      ['page=10001', 'page', 'too_big'],
      ['pageSize=0', 'pageSize', 'too_small'],
      ['pageSize=51', 'pageSize', 'too_big'],
      ['species=dragon', 'species', 'invalid_value'],
      ['species=dog&species=cat', 'species', 'invalid_value'],
      ['status=lost', 'status', 'invalid_value'],
      ['sort=price', 'sort', 'invalid_value'],
      [`search=${'a'.repeat(101)}`, 'search', 'too_big'],
    ])('rejects %s', async (query, field, code) => {
      const response = await request(app).get(`/api/pets?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.details).toContainEqual({ field, code });
    });

    it('ignores unknown parameters', async () => {
      const response = await request(app).get('/api/pets?color=brown');

      expect(response.status).toBe(200);
    });
  });

  describe('search and filters', () => {
    it('searches names case-insensitively, anywhere in the name', async () => {
      await seedPets([{ name: 'Milo' }, { name: 'Luna' }, { name: 'Camilo' }]);

      const response = await request(app).get('/api/pets?search=MIL');

      expect(names(response)).toEqual(['Camilo', 'Milo']);
      expect(response.body.totalItems).toBe(2);
    });

    it('matches the search text literally, not as a pattern', async () => {
      await seedPets([{ name: 'a.b' }, { name: 'axb' }, { name: 'a*' }]);

      const dot = await request(app).get('/api/pets?search=a.b');
      const star = await request(app).get(
        `/api/pets?search=${encodeURIComponent('a*')}`,
      );

      expect(names(dot)).toEqual(['a.b']);
      expect(names(star)).toEqual(['a*']);
    });

    it('filters by species and status', async () => {
      await seedPets([
        { name: 'Rex', species: 'dog', status: 'available' },
        { name: 'Tom', species: 'cat', status: 'available' },
        { name: 'Kit', species: 'cat', status: 'adopted' },
      ]);

      const cats = await request(app).get('/api/pets?species=cat');
      const adopted = await request(app).get('/api/pets?status=adopted');

      expect(names(cats)).toEqual(['Kit', 'Tom']);
      expect(names(adopted)).toEqual(['Kit']);
    });

    it('combines search, filters and paging, counting only matches', async () => {
      await seedPets([
        ...Array.from({ length: 4 }, (_, i) => ({
          name: `Cat ${i}`,
          species: 'cat',
        })),
        { name: 'Cat adopted', species: 'cat', status: 'adopted' },
        ...Array.from({ length: 10 }, (_, i) => ({ name: `Cat-dog ${i}` })),
      ]);

      const response = await request(app).get(
        '/api/pets?search=cat&species=cat&status=available&pageSize=3&page=2',
      );

      expect(response.body).toMatchObject({
        page: 2,
        pageSize: 3,
        totalItems: 4,
        totalPages: 2,
      });
      expect(names(response)).toEqual(['Cat 0']);
    });
  });

  describe('sorting', () => {
    beforeEach(async () => {
      await seedPets([
        { name: 'charlie', age: 2 },
        { name: 'Bella', age: 7 },
        { name: 'alfie', age: 1 },
      ]);
    });

    it.each([
      ['newest', ['alfie', 'Bella', 'charlie']],
      ['oldest', ['charlie', 'Bella', 'alfie']],
      ['name', ['alfie', 'Bella', 'charlie']],
      ['age', ['alfie', 'charlie', 'Bella']],
    ])('sorts by %s', async (sort, expected) => {
      const response = await request(app).get(`/api/pets?sort=${sort}`);

      expect(names(response)).toEqual(expected);
    });
  });
});

describe('GET /api/pets/:id', () => {
  it('is public and includes the owner id', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await request(app).get(`/api/pets/${petId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: petId,
      owner: owner.userId,
      name: 'Milo',
    });
  });

  it('returns 404 when the pet does not exist', async () => {
    const response = await request(app).get(`/api/pets/${missingPetId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'PET_NOT_FOUND' });
  });

  it('rejects an invalid pet id', async () => {
    const response = await request(app).get('/api/pets/banana');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_PET_ID' });
  });
});

describe('POST /api/pets', () => {
  it('requires authentication', async () => {
    const response = await request(app).post('/api/pets').send(validPet);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    expect(await PetModel.countDocuments()).toBe(0);
  });

  it('creates a pet owned by the signed-in user', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.post('/api/pets').send(validPet);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ...validPet,
      owner: owner.userId,
      status: 'available',
    });
  });

  it('ignores an owner id supplied in the body', async () => {
    const victim = await createSignedInAgent('victim@example.com');
    const attacker = await createSignedInAgent('attacker@example.com');

    const response = await attacker.agent
      .post('/api/pets')
      .send({ ...validPet, owner: victim.userId });

    expect(response.status).toBe(201);
    expect(response.body.owner).toBe(attacker.userId);
  });

  it('rejects a session whose user no longer exists', async () => {
    const owner = await createSignedInAgent();
    await UserModel.deleteMany({});

    const response = await owner.agent.post('/api/pets').send(validPet);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    expect(await PetModel.countDocuments()).toBe(0);
  });

  it('rejects an invalid pet', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.post('/api/pets').send({
      name: '',
      species: 'dragon',
      age: -5,
      description: '',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'name', code: 'too_small' },
        { field: 'species', code: 'invalid_value' },
        { field: 'age', code: 'too_small' },
        { field: 'description', code: 'too_small' },
      ],
    });
  });

  it('reports the path of an invalid array item', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.post('/api/pets').send({
      ...validPet,
      imageUrls: ['https://example.com/milo.jpg', 'not-a-url'],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'imageUrls.1', code: 'invalid_format' }],
    });
  });

  it('rejects a malformed JSON body', async () => {
    const response = await request(app)
      .post('/api/pets')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_JSON' });
  });
});

describe('PUT /api/pets/:id', () => {
  it('requires authentication', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await request(app)
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, name: 'Hijacked' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    expect((await PetModel.findById(petId))?.name).toBe('Milo');
  });

  it('lets the owner replace all editable fields', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent.put(`/api/pets/${petId}`).send({
      name: 'Milo Jr.',
      species: 'other',
      age: 4,
      description: 'An even friendlier dog.',
      imageUrls: ['https://example.com/milo-jr.jpg'],
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: petId,
      owner: owner.userId,
      name: 'Milo Jr.',
      species: 'other',
      age: 4,
      description: 'An even friendlier dog.',
      status: 'available',
      imageUrls: ['https://example.com/milo-jr.jpg'],
    });
  });

  it("forbids changing another user's pet", async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const other = await createSignedInAgent('other@example.com');
    const petId = await createPetAs(owner);

    const response = await other.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, name: 'Hijacked' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'NOT_PET_OWNER' });
    expect((await PetModel.findById(petId))?.name).toBe('Milo');
  });

  it('cannot transfer ownership through the body', async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const other = await createSignedInAgent('other@example.com');
    const petId = await createPetAs(owner);

    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, owner: other.userId });

    expect(response.status).toBe(200);
    expect(response.body.owner).toBe(owner.userId);
  });

  it('clears image URLs when an empty list is sent', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, imageUrls: [] });

    expect(response.status).toBe(200);
    expect(response.body.imageUrls).toEqual([]);
  });

  it('clears image URLs when they are omitted', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    // JSON serialization drops `undefined`, so the field is not sent at all.
    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, imageUrls: undefined });

    expect(response.status).toBe(200);
    expect(response.body.imageUrls).toEqual([]);
  });

  it('rejects a partial body', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ name: 'Milo Jr.' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(
      response.body.details.map((issue: { field: string }) => issue.field),
    ).toEqual(['species', 'age', 'description']);
  });

  it('does not allow status to be updated', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, status: 'adopted' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('available');
  });

  it('returns 404 when the pet does not exist', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent
      .put(`/api/pets/${missingPetId}`)
      .send(validPet);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'PET_NOT_FOUND' });
  });

  it('rejects an invalid pet id', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.put('/api/pets/banana').send(validPet);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_PET_ID' });
  });

  it('rejects invalid update data', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, name: '', age: -1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'name', code: 'too_small' },
        { field: 'age', code: 'too_small' },
      ],
    });
  });
});

describe('DELETE /api/pets/:id', () => {
  it('requires authentication', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await request(app).delete(`/api/pets/${petId}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    expect(await PetModel.exists({ _id: petId })).not.toBeNull();
  });

  it('lets the owner delete their pet', async () => {
    const owner = await createSignedInAgent();
    const petId = await createPetAs(owner);

    const response = await owner.agent.delete(`/api/pets/${petId}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const getResponse = await request(app).get(`/api/pets/${petId}`);

    expect(getResponse.status).toBe(404);
  });

  it("forbids deleting another user's pet", async () => {
    const owner = await createSignedInAgent('owner@example.com');
    const other = await createSignedInAgent('other@example.com');
    const petId = await createPetAs(owner);

    const response = await other.agent.delete(`/api/pets/${petId}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'NOT_PET_OWNER' });
    expect(await PetModel.exists({ _id: petId })).not.toBeNull();
  });

  it('returns 404 when the pet does not exist', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.delete(`/api/pets/${missingPetId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'PET_NOT_FOUND' });
  });

  it('rejects an invalid pet id', async () => {
    const owner = await createSignedInAgent();

    const response = await owner.agent.delete('/api/pets/banana');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_PET_ID' });
  });
});
