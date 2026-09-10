import request from 'supertest';

import { app } from './app';

describe('GET /api/health', () => {
  it('returns a healthy status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
    });
  });
});
