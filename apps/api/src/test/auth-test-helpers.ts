import request from 'supertest';

import { app } from '../app';

export type SignedInAgent = {
  /** Keeps the session cookie between requests, like a browser. */
  agent: ReturnType<typeof request.agent>;
  userId: string;
};

/** Registers a user (which signs them in) and returns a cookie-keeping agent. */
export const createSignedInAgent = async (
  email = 'owner@example.com',
): Promise<SignedInAgent> => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    email,
    name: 'Test User',
    password: 'correct horse battery',
  });

  if (response.status !== 201) {
    throw new Error(`Test registration failed with ${response.status}`);
  }

  return { agent, userId: response.body._id };
};
