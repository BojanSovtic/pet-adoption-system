import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import { app } from './app';
import { env } from './core/config/env';
import { PetModel } from './features/pets/pet.model';
import { createSignedInAgent } from './test/auth-test-helpers';
import { createTestImage } from './test/image-fixtures';
import { listStoredFiles } from './test/upload-test-helpers';

// The real app with STORAGE_DRIVER=cloudinary. `fetch` is replaced by an
// in-memory stand-in for Cloudinary's API: no request leaves the machine.
vi.mock('./core/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core/config/env')>();

  return {
    env: {
      ...actual.env,
      storageDriver: 'cloudinary',
      cloudinary: {
        cloudName: 'test-cloud',
        apiKey: '123456789012345',
        apiSecret: 'test-api-secret-0123456789',
      },
    },
  };
});

const FORMATS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Public ids currently "stored in Cloudinary", and the requests made. */
const cloud = {
  assets: new Set<string>(),
  requests: [] as Array<{ operation: string; publicId: string }>,
  failUploads: false,
};

const fakeCloudinary = async (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => {
  const url = String(input);
  const form = init?.body as FormData;
  const publicId = String(form.get('public_id'));
  const operation = url.endsWith('/image/upload') ? 'upload' : 'destroy';

  expect(url.startsWith('https://api.cloudinary.com/v1_1/test-cloud/')).toBe(
    true,
  );
  cloud.requests.push({ operation, publicId });

  if (operation === 'upload') {
    if (cloud.failUploads) {
      return Response.json({ error: { message: 'boom' } }, { status: 500 });
    }

    const file = form.get('file') as Blob;
    cloud.assets.add(publicId);

    return Response.json({ public_id: publicId, format: FORMATS[file.type] });
  }

  const existed = cloud.assets.delete(publicId);

  return Response.json({ result: existed ? 'ok' : 'not found' });
};

let PNG: Buffer;
let JPEG: Buffer;

beforeAll(async () => {
  [PNG, JPEG] = await Promise.all([
    createTestImage('png'),
    createTestImage('jpeg'),
  ]);
});

beforeEach(() => {
  cloud.assets.clear();
  cloud.requests = [];
  cloud.failUploads = false;
  vi.stubGlobal('fetch', vi.fn(fakeCloudinary));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const createPetWithPhotos = async () => {
  const owner = await createSignedInAgent();
  const created = await owner.agent.post('/api/pets').send({
    name: 'Milo',
    species: 'dog',
    age: 3,
    description: 'A friendly dog.',
  });
  const petId: string = created.body._id;
  const added = await owner.agent
    .post(`/api/pets/${petId}/images`)
    .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });

  return { owner, petId, added };
};

describe('app with Cloudinary storage', { timeout: 20_000 }, () => {
  it('uses the Cloudinary driver', () => {
    expect(env.storageDriver).toBe('cloudinary');
  });

  it('stores photos in Cloudinary under the usual keys and returns CDN URLs', async () => {
    const { petId, added } = await createPetWithPhotos();

    expect(added.status).toBe(200);
    const keys = (await PetModel.findById(petId).lean())?.images?.map(
      (image) => image.key,
    );

    expect(keys).toHaveLength(2);
    expect(keys?.[0]).toMatch(/^pets\/[0-9a-f-]{36}\.png$/);
    expect(keys?.[1]).toMatch(/^pets\/[0-9a-f-]{36}\.jpg$/);
    expect(
      added.body.images.map((image: { url: string }) => image.url),
    ).toEqual(
      keys?.map(
        (key) => `https://res.cloudinary.com/test-cloud/image/upload/${key}`,
      ),
    );
    expect(added.body.imageUrl).toBe(added.body.images[0].url);
    // In Cloudinary, without the extension; nothing on the API's disk.
    expect([...cloud.assets].sort()).toEqual(
      keys?.map((key) => key.replace(/\.[a-z]+$/, '')).sort(),
    );
    expect(await listStoredFiles('pets')).toEqual([]);
  });

  it('deletes the photo from Cloudinary when it is removed', async () => {
    const { owner, petId, added } = await createPetWithPhotos();
    const [first, second] = added.body.images;

    const response = await owner.agent.delete(
      `/api/pets/${petId}/images/${first._id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.images).toEqual([second]);
    expect(cloud.assets.size).toBe(1);
    expect(cloud.requests.at(-1)?.operation).toBe('destroy');
  });

  it('deletes every photo from Cloudinary when the pet is deleted', async () => {
    const { owner, petId } = await createPetWithPhotos();

    const response = await owner.agent.delete(`/api/pets/${petId}`);

    expect(response.status).toBe(204);
    expect(cloud.assets.size).toBe(0);
  });

  it('leaves the pet unchanged and cleans up when an upload fails', async () => {
    const owner = await createSignedInAgent();
    const created = await owner.agent.post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });
    cloud.failUploads = true;

    const response = await owner.agent
      .post(`/api/pets/${created.body._id}/images`)
      .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expect(response.text).not.toContain('test-api-secret');
    expect(
      (await PetModel.findById(created.body._id).lean())?.images ?? [],
    ).toEqual([]);
    // The key that failed is removed again, in case the upload landed anyway.
    expect(cloud.requests.map((entry) => entry.operation)).toEqual([
      'upload',
      'destroy',
    ]);
  });

  it('does not serve /uploads from the disk', async () => {
    const uploadsDir = inject('uploadsDir');
    await mkdir(path.join(uploadsDir, 'pets'), { recursive: true });
    await writeFile(path.join(uploadsDir, 'pets', 'photo.png'), PNG);

    const response = await request(app).get('/uploads/pets/photo.png');

    expect(response.status).toBe(404);
  });
});
