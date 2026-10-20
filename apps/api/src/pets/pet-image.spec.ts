import path from 'node:path';
import request from 'supertest';
import { PET_IMAGE_MAX_BYTES } from '@pet-adoption/models';

import { app } from '../app';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { listStoredFiles } from '../test/upload-test-helpers';
import { PetModel } from './pet.model';

// Only the leading "magic number" bytes matter for type detection.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(64),
]);

const missingPetId = '507f1f77bcf86cd799439011';

const storedFiles = () => listStoredFiles('pets');

const createPet = async ({ agent }: SignedInAgent): Promise<string> => {
  const response = await agent.post('/api/pets').send({
    name: 'Milo',
    species: 'dog',
    age: 3,
    description: 'A friendly dog.',
  });

  return response.body._id;
};

const upload = (
  agent: SignedInAgent['agent'] | ReturnType<typeof request>,
  petId: string,
  data: Buffer,
  { filename = 'photo.png', contentType = 'image/png', field = 'image' } = {},
) =>
  agent
    .put(`/api/pets/${petId}/image`)
    .attach(field, data, { filename, contentType });

/** The path part of an `imageUrl`, e.g. "/uploads/pets/….png". */
const uploadPath = (imageUrl: string) => new URL(imageUrl).pathname;

// Several users are registered per test, each with a slow Argon2id hash.
describe('pet photos', { timeout: 20_000 }, () => {
  describe('PUT /api/pets/:id/image', () => {
    it('requires authentication', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await upload(request(app), petId, PNG);

      expect(response.status).toBe(401);
      expect(await storedFiles()).toEqual([]);
    });

    it("forbids changing another user's pet, storing nothing", async () => {
      const owner = await createSignedInAgent('owner@example.com');
      const other = await createSignedInAgent('other@example.com');
      const petId = await createPet(owner);

      const response = await upload(other.agent, petId, PNG);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'NOT_PET_OWNER' });
      expect(await storedFiles()).toEqual([]);
    });

    it('rejects unknown and invalid pet ids', async () => {
      const owner = await createSignedInAgent();

      const missing = await upload(owner.agent, missingPetId, PNG);
      const invalid = await upload(owner.agent, 'banana', PNG);

      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'PET_NOT_FOUND' });
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'INVALID_PET_ID' });
    });

    it('stores a PNG and returns its public URL', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await upload(owner.agent, petId, PNG);

      expect(response.status).toBe(200);
      expect(response.body.imageUrl).toMatch(
        /^http:\/\/.+\/uploads\/pets\/[0-9a-f-]{36}\.png$/,
      );
      expect(response.body).not.toHaveProperty('imageKey');
      expect(await storedFiles()).toHaveLength(1);

      const file = await request(app).get(uploadPath(response.body.imageUrl));

      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['cache-control']).toContain('immutable');
    });

    it('trusts the content, not the filename or declared type', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      // JPEG bytes sent as "cat.png" / image/png are stored and served as JPEG.
      const response = await upload(owner.agent, petId, JPEG, {
        filename: 'cat.png',
        contentType: 'image/png',
      });

      expect(response.status).toBe(200);
      expect(response.body.imageUrl).toMatch(/\.jpg$/);

      const file = await request(app).get(uploadPath(response.body.imageUrl));
      expect(file.headers['content-type']).toBe('image/jpeg');
    });

    it('accepts WebP', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await upload(owner.agent, petId, WEBP, {
        filename: 'photo.webp',
        contentType: 'image/webp',
      });

      expect(response.status).toBe(200);
      expect(response.body.imageUrl).toMatch(/\.webp$/);
    });

    it('rejects a non-image disguised as a PNG', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await upload(
        owner.agent,
        petId,
        Buffer.from('<script>alert(1)</script>'),
        { filename: 'innocent.png', contentType: 'image/png' },
      );

      expect(response.status).toBe(415);
      expect(response.body).toEqual({ code: 'UNSUPPORTED_IMAGE_TYPE' });
      expect(await storedFiles()).toEqual([]);
    });

    it('rejects files over 5 MB', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const tooLarge = Buffer.concat([
        PNG,
        Buffer.alloc(PET_IMAGE_MAX_BYTES - PNG.length + 1),
      ]);

      const response = await upload(owner.agent, petId, tooLarge);

      expect(response.status).toBe(413);
      expect(response.body).toEqual({ code: 'IMAGE_TOO_LARGE' });
      expect(await storedFiles()).toEqual([]);
    });

    it('requires a file in the "image" field', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const missing = await owner.agent.put(`/api/pets/${petId}/image`);
      const wrongField = await upload(owner.agent, petId, PNG, {
        field: 'photo',
      });

      expect(missing.status).toBe(400);
      expect(missing.body).toEqual({ code: 'IMAGE_REQUIRED' });
      expect(wrongField.status).toBe(400);
      expect(wrongField.body).toEqual({ code: 'INVALID_IMAGE_UPLOAD' });
    });

    it('replaces the photo and deletes the old file', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const first = await upload(owner.agent, petId, PNG);

      const second = await upload(owner.agent, petId, JPEG, {
        filename: 'new.jpg',
        contentType: 'image/jpeg',
      });

      expect(second.status).toBe(200);
      expect(second.body.imageUrl).not.toBe(first.body.imageUrl);
      expect(await storedFiles()).toEqual([
        path.basename(second.body.imageUrl),
      ]);
    });

    it('removes the new file if saving to the database fails', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const update = vi
        .spyOn(PetModel, 'findOneAndUpdate')
        .mockImplementationOnce(() => {
          throw new Error('simulated database failure');
        });

      const response = await upload(owner.agent, petId, PNG);
      update.mockRestore();

      expect(response.status).toBe(500);
      expect(await storedFiles()).toEqual([]);
    });
  });

  describe('DELETE /api/pets/:id/image', () => {
    it('removes the photo and its file', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await upload(owner.agent, petId, PNG);

      const response = await owner.agent.delete(`/api/pets/${petId}/image`);

      expect(response.status).toBe(200);
      expect(response.body.imageUrl).toBeNull();
      expect(await storedFiles()).toEqual([]);
    });

    it('is only allowed for the owner', async () => {
      const owner = await createSignedInAgent('owner@example.com');
      const other = await createSignedInAgent('other@example.com');
      const petId = await createPet(owner);
      await upload(owner.agent, petId, PNG);

      const anonymous = await request(app).delete(`/api/pets/${petId}/image`);
      const notOwner = await other.agent.delete(`/api/pets/${petId}/image`);

      expect(anonymous.status).toBe(401);
      expect(notOwner.status).toBe(403);
      expect(await storedFiles()).toHaveLength(1);
    });
  });

  describe('pet responses and deletion', () => {
    it('returns imageUrl null for pets without a photo', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const detail = await request(app).get(`/api/pets/${petId}`);
      const list = await request(app).get('/api/pets');

      expect(detail.body.imageUrl).toBeNull();
      expect(list.body.items[0].imageUrl).toBeNull();
    });

    it("deletes the pet's photo when the pet is deleted", async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await upload(owner.agent, petId, PNG);

      const response = await owner.agent.delete(`/api/pets/${petId}`);

      expect(response.status).toBe(204);
      expect(await storedFiles()).toEqual([]);
    });
  });
});
