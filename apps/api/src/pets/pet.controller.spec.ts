import request from 'supertest';

import { app } from '../app';

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
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.errors).toBeInstanceOf(Array);
  });
});
