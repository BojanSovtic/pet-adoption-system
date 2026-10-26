import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';

import { E2E_API_URL } from './config';

// There is no seed data: each test creates its own users and pets through
// the real API, with unique names, so tests are independent of each other
// and of the order they run in.

export type TestUser = { name: string; email: string; password: string };

export type TestPet = { _id: string; name: string };

export const uniqueId = (): string => randomUUID().slice(0, 8);

export const makeUser = (label: string): TestUser => {
  const id = uniqueId();

  return {
    name: `${label} ${id}`,
    email: `${label.toLowerCase()}-${id}@example.com`,
    password: 'correct horse battery',
  };
};

/**
 * Registers a user, which also signs them in. With `page.request` the
 * session cookie lands in the browser context, so the page is signed in too.
 */
export const registerUser = async (
  request: APIRequestContext,
  user: TestUser,
): Promise<void> => {
  const response = await request.post(`${E2E_API_URL}/auth/register`, {
    data: user,
  });

  expect(response.status(), 'register').toBe(201);
};

/** Creates a pet as the signed-in user of `request`. */
export const createPet = async (
  request: APIRequestContext,
  pet: { name: string; species?: string },
): Promise<TestPet> => {
  const response = await request.post(`${E2E_API_URL}/pets`, {
    data: {
      species: 'dog',
      age: 3,
      description: 'Friendly and house-trained.',
      ...pet,
    },
  });

  expect(response.status(), 'create pet').toBe(201);

  return response.json();
};

/** Submits an adoption application as the signed-in user of `request`. */
export const applyForPet = async (
  request: APIRequestContext,
  petId: string,
  message: string,
): Promise<void> => {
  const response = await request.post(
    `${E2E_API_URL}/pets/${petId}/applications`,
    { data: { message } },
  );

  expect(response.status(), 'apply').toBe(201);
};
