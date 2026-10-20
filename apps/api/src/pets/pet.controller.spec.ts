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

describe('GET /api/pets', () => {
  it('is public and returns all pets, newest first', async () => {
    const owner = await createSignedInAgent();
    await createPetAs(owner, { ...validPet, name: 'Milo' });
    await createPetAs(owner, { ...validPet, name: 'Luna' });

    const response = await request(app).get('/api/pets');

    expect(response.status).toBe(200);
    expect(response.body.map((pet: { name: string }) => pet.name)).toEqual([
      'Luna',
      'Milo',
    ]);
    expect(response.body[0].owner).toBe(owner.userId);
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
