import request from 'supertest';

import { app } from '../app';

describe('GET /api/pets', () => {
  it('returns all pets', async () => {
    await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    await request(app).post('/api/pets').send({
      name: 'Luna',
      species: 'cat',
      age: 2,
      description: 'A curious cat.',
    });

    const response = await request(app).get('/api/pets');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((pet: { name: string }) => pet.name)).toEqual([
      'Luna',
      'Milo',
    ]);
  });
});

describe('GET /api/pets/:id', () => {
  it('returns a pet by id', async () => {
    const createResponse = await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    const petId = createResponse.body._id;

    const response = await request(app).get(`/api/pets/${petId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: petId,
      name: 'Milo',
      species: 'dog',
      age: 3,
    });
  });

  it('returns 404 when the pet does not exist', async () => {
    const response = await request(app).get(
      '/api/pets/507f1f77bcf86cd799439011',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'PET_NOT_FOUND',
    });
  });

  it('rejects an invalid pet id', async () => {
    const response = await request(app).get('/api/pets/banana');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'INVALID_PET_ID',
    });
  });
});

describe('POST /api/pets', () => {
  it('creates a pet with valid data', async () => {
    const response = await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
      status: 'available',
      imageUrls: [],
    });
  });

  it('rejects an invalid pet', async () => {
    const response = await request(app).post('/api/pets').send({
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
    const response = await request(app)
      .post('/api/pets')
      .send({
        name: 'Milo',
        species: 'dog',
        age: 3,
        description: 'A friendly dog.',
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
  it('updates a pet with valid data', async () => {
    const createResponse = await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    const petId = createResponse.body._id;

    const response = await request(app).put(`/api/pets/${petId}`).send({
      name: 'Milo Jr.',
      age: 4,
      description: 'An even friendlier dog.',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: petId,
      name: 'Milo Jr.',
      species: 'dog',
      age: 4,
      description: 'An even friendlier dog.',
      status: 'available',
      imageUrls: [],
    });
  });

  it('does not allow status to be updated', async () => {
    const createResponse = await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    const petId = createResponse.body._id;

    const response = await request(app).put(`/api/pets/${petId}`).send({
      name: 'Milo Updated',
      status: 'adopted',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'Milo Updated',
      status: 'available',
    });
  });

  it('returns 404 when the pet does not exist', async () => {
    const response = await request(app)
      .put('/api/pets/507f1f77bcf86cd799439011')
      .send({
        name: 'Updated name',
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'PET_NOT_FOUND',
    });
  });

  it('rejects an invalid pet id', async () => {
    const response = await request(app).put('/api/pets/banana').send({
      name: 'Updated name',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'INVALID_PET_ID',
    });
  });

  it('rejects invalid update data', async () => {
    const createResponse = await request(app).post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    const petId = createResponse.body._id;

    const response = await request(app).put(`/api/pets/${petId}`).send({
      name: '',
      age: -1,
    });

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
