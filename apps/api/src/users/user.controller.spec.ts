import request from 'supertest';

import { app } from '../app';
import { PetModel } from '../pets/pet.model';
import { createSignedInAgent } from '../test/auth-test-helpers';
import { UserModel } from './user.model';

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
};

const missingId = '507f1f77bcf86cd799439011';

// Several users are registered per test (Argon2id hashing).
describe('public user profiles', { timeout: 20_000 }, () => {
  describe('GET /api/users/:id', () => {
    it('requires authentication', async () => {
      const owner = await createSignedInAgent('owner@example.com', 'Ana');

      const response = await request(app).get(`/api/users/${owner.userId}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    });

    it('returns only the name and member-since date, never private fields', async () => {
      const owner = await createSignedInAgent('owner@example.com', 'Ana');
      const viewer = await createSignedInAgent('viewer@example.com', 'Marko');
      // Private account state that must never show on a profile.
      await UserModel.updateOne(
        { _id: owner.userId },
        { role: 'admin', suspendedAt: new Date() },
      );

      const response = await viewer.agent.get(`/api/users/${owner.userId}`);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual([
        '_id',
        'memberSince',
        'name',
      ]);
      expect(response.body).toMatchObject({ _id: owner.userId, name: 'Ana' });
      expect(Number.isNaN(Date.parse(response.body.memberSince))).toBe(false);

      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain('owner@example.com');
      expect(raw).not.toContain('argon2');
    });

    it('answers 404 for an unknown user and 400 for an invalid id', async () => {
      const viewer = await createSignedInAgent('viewer@example.com');

      const missing = await viewer.agent.get(`/api/users/${missingId}`);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'USER_NOT_FOUND' });

      const invalid = await viewer.agent.get('/api/users/not-an-id');
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'INVALID_USER_ID' });
    });
  });

  describe('editing profiles', () => {
    it.each(['put', 'patch', 'post', 'delete'] as const)(
      'has no %s route, so nobody can change another user',
      async (method) => {
        const owner = await createSignedInAgent('owner@example.com', 'Ana');
        const other = await createSignedInAgent('other@example.com', 'Eve');

        const response = await other.agent[method](
          `/api/users/${owner.userId}`,
        ).send({ name: 'Hacked', email: 'eve@example.com', role: 'admin' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ code: 'ROUTE_NOT_FOUND' });

        const stored = await UserModel.findById(owner.userId).lean();
        expect(stored).toMatchObject({
          name: 'Ana',
          email: 'owner@example.com',
          role: 'user',
        });
      },
    );
  });

  describe('GET /api/users/:id/pets', () => {
    it('lists only the user’s pets that are publicly listed and not adopted', async () => {
      const owner = await createSignedInAgent('owner@example.com', 'Ana');
      const other = await createSignedInAgent('other@example.com', 'Marko');

      await PetModel.insertMany([
        { ...validPet, name: 'Available', owner: owner.userId },
        {
          ...validPet,
          name: 'Pending',
          owner: owner.userId,
          status: 'pending',
        },
        {
          ...validPet,
          name: 'Adopted',
          owner: owner.userId,
          status: 'adopted',
        },
        {
          ...validPet,
          name: 'Hidden',
          owner: owner.userId,
          hiddenAt: new Date(),
        },
        { ...validPet, name: 'Someone else', owner: other.userId },
      ]);

      // Even the owner sees only what everyone else sees here.
      for (const viewer of [other, owner]) {
        const response = await viewer.agent.get(
          `/api/users/${owner.userId}/pets`,
        );

        expect(response.status).toBe(200);
        expect(
          response.body.items.map((pet: { name: string }) => pet.name).sort(),
        ).toEqual(['Available', 'Pending']);
        expect(response.body).toMatchObject({
          page: 1,
          totalItems: 2,
          totalPages: 1,
        });
      }
    });

    it('pages the list and validates paging', async () => {
      const owner = await createSignedInAgent('owner@example.com');
      await PetModel.insertMany(
        Array.from({ length: 3 }, (_, index) => ({
          ...validPet,
          name: `Pet ${index}`,
          owner: owner.userId,
        })),
      );

      const second = await owner.agent.get(
        `/api/users/${owner.userId}/pets?page=2&pageSize=2`,
      );
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({
        page: 2,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
      });
      expect(second.body.items).toHaveLength(1);

      const invalid = await owner.agent.get(
        `/api/users/${owner.userId}/pets?pageSize=500`,
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');
    });

    it('requires authentication and an existing user', async () => {
      const viewer = await createSignedInAgent('viewer@example.com');

      const anonymous = await request(app).get(
        `/api/users/${viewer.userId}/pets`,
      );
      expect(anonymous.status).toBe(401);

      const missing = await viewer.agent.get(`/api/users/${missingId}/pets`);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'USER_NOT_FOUND' });
    });
  });
});
