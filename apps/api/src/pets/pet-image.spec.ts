import path from 'node:path';
import { Types } from 'mongoose';
import request from 'supertest';
import { PET_IMAGE_MAX_BYTES } from '@pet-adoption/models';
import { backfillPetImages } from './pet.service';

import { app } from '../app';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import sharp from 'sharp';

import {
  createAnimatedWebp,
  createPhoneJpeg,
  createPngClaimingSize,
  createTestImage,
  hasGpsTag,
  METADATA_MARKER,
} from '../test/image-fixtures';
import { listStoredFiles } from '../test/upload-test-helpers';
import { PetModel } from './pet.model';

// Real images: uploads are decoded and re-encoded, so magic bytes alone are
// no longer enough.
let PNG: Buffer;
let JPEG: Buffer;
let WEBP: Buffer;

beforeAll(async () => {
  [PNG, JPEG, WEBP] = await Promise.all([
    createTestImage('png'),
    createTestImage('jpeg'),
    createTestImage('webp'),
  ]);
});

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

/** Adds photos through the gallery endpoint (field "images"). */
const addImages = (
  agent: SignedInAgent['agent'] | ReturnType<typeof request>,
  petId: string,
  files: Buffer[],
  field = 'images',
) =>
  files.reduce(
    (req, data, index) =>
      req.attach(field, data, {
        filename: `photo-${index}.png`,
        contentType: 'image/png',
      }),
    agent.post(`/api/pets/${petId}/images`),
  );

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

  describe('POST /api/pets/:id/images', () => {
    it('requires authentication and ownership, storing nothing', async () => {
      const owner = await createSignedInAgent('owner@example.com');
      const other = await createSignedInAgent('other@example.com');
      const petId = await createPet(owner);

      const anonymous = await addImages(request(app), petId, [PNG]);
      const notOwner = await addImages(other.agent, petId, [PNG]);

      expect(anonymous.status).toBe(401);
      expect(notOwner.status).toBe(403);
      expect(notOwner.body).toEqual({ code: 'NOT_PET_OWNER' });
      expect(await storedFiles()).toEqual([]);
    });

    it('adds several photos in order; the first is the primary one', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await addImages(owner.agent, petId, [PNG, JPEG, WEBP]);

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(3);
      expect(
        response.body.images.map((image: { url: string }) =>
          path.extname(image.url),
        ),
      ).toEqual(['.png', '.jpg', '.webp']);
      expect(response.body.imageUrl).toBe(response.body.images[0].url);
      expect(await storedFiles()).toHaveLength(3);

      const file = await request(app).get(
        uploadPath(response.body.images[1].url),
      );
      expect(file.headers['content-type']).toBe('image/jpeg');
    });

    it('appends to the existing photos', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const first = await addImages(owner.agent, petId, [PNG, PNG]);

      const second = await addImages(owner.agent, petId, [JPEG]);

      expect(second.status).toBe(200);
      expect(second.body.images.slice(0, 2)).toEqual(first.body.images);
      expect(second.body.images).toHaveLength(3);
    });

    it('allows 5 photos in total, counting the existing ones', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await addImages(owner.agent, petId, [PNG, PNG, PNG, PNG]);

      const tooMany = await addImages(owner.agent, petId, [PNG, PNG]);
      const fifth = await addImages(owner.agent, petId, [PNG]);
      const sixth = await addImages(owner.agent, petId, [PNG]);

      expect(tooMany.status).toBe(409);
      expect(tooMany.body).toEqual({ code: 'TOO_MANY_IMAGES' });
      expect(fifth.status).toBe(200);
      expect(fifth.body.images).toHaveLength(5);
      expect(sixth.status).toBe(409);
      expect(await storedFiles()).toHaveLength(5);
    });

    it('rejects more than 5 files in one request', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await addImages(owner.agent, petId, Array(6).fill(PNG));

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ code: 'TOO_MANY_IMAGES' });
      expect(await storedFiles()).toEqual([]);
    });

    it('never exceeds the limit with simultaneous uploads', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const responses = await Promise.all([
        addImages(owner.agent, petId, [PNG, PNG, PNG]),
        addImages(owner.agent, petId, [PNG, PNG, PNG]),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await PetModel.findById(petId).lean())?.images).toHaveLength(3);
      expect(await storedFiles()).toHaveLength(3);
    });

    it('stores nothing if any file is not a supported image', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const response = await addImages(owner.agent, petId, [
        PNG,
        Buffer.from('<script>alert(1)</script>'),
      ]);

      expect(response.status).toBe(415);
      expect(response.body).toEqual({ code: 'UNSUPPORTED_IMAGE_TYPE' });
      expect(await storedFiles()).toEqual([]);
    });

    it('rejects a file over 5 MB, storing nothing', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const tooLarge = Buffer.concat([
        PNG,
        Buffer.alloc(PET_IMAGE_MAX_BYTES - PNG.length + 1),
      ]);

      const response = await addImages(owner.agent, petId, [PNG, tooLarge]);

      expect(response.status).toBe(413);
      expect(response.body).toEqual({ code: 'IMAGE_TOO_LARGE' });
      expect(await storedFiles()).toEqual([]);
    });

    it('requires at least one file in the "images" field', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const none = await owner.agent.post(`/api/pets/${petId}/images`);
      const wrongField = await addImages(owner.agent, petId, [PNG], 'image');

      expect(none.status).toBe(400);
      expect(none.body).toEqual({ code: 'IMAGE_REQUIRED' });
      expect(wrongField.status).toBe(400);
      expect(wrongField.body).toEqual({ code: 'INVALID_IMAGE_UPLOAD' });
    });

    it('removes the new files if saving to the database fails', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const existing = await addImages(owner.agent, petId, [PNG]);
      const update = vi
        .spyOn(PetModel, 'findOneAndUpdate')
        .mockImplementationOnce(() => {
          throw new Error('simulated database failure');
        });

      const response = await addImages(owner.agent, petId, [JPEG, JPEG]);
      update.mockRestore();

      expect(response.status).toBe(500);
      // Only the photo that was already there is left.
      expect(await storedFiles()).toEqual([
        path.basename(existing.body.images[0].url),
      ]);
    });
  });

  describe('DELETE /api/pets/:id/images/:imageId', () => {
    it('removes one photo and only its file', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const added = await addImages(owner.agent, petId, [PNG, JPEG, WEBP]);
      const [first, second, third] = added.body.images;

      const response = await owner.agent.delete(
        `/api/pets/${petId}/images/${first._id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.images).toEqual([second, third]);
      // The next photo becomes the primary one.
      expect(response.body.imageUrl).toBe(second.url);
      expect((await storedFiles()).sort()).toEqual(
        [path.basename(second.url), path.basename(third.url)].sort(),
      );
    });

    it('returns 404 for a photo the pet does not have', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await addImages(owner.agent, petId, [PNG]);

      const unknown = await owner.agent.delete(
        `/api/pets/${petId}/images/${missingPetId}`,
      );
      const invalid = await owner.agent.delete(
        `/api/pets/${petId}/images/banana`,
      );

      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual({ code: 'IMAGE_NOT_FOUND' });
      expect(invalid.status).toBe(404);
      expect(await storedFiles()).toHaveLength(1);
    });

    it('is only allowed for the owner', async () => {
      const owner = await createSignedInAgent('owner@example.com');
      const other = await createSignedInAgent('other@example.com');
      const petId = await createPet(owner);
      const added = await addImages(owner.agent, petId, [PNG]);
      const imagePath = `/api/pets/${petId}/images/${added.body.images[0]._id}`;

      const anonymous = await request(app).delete(imagePath);
      const notOwner = await other.agent.delete(imagePath);

      expect(anonymous.status).toBe(401);
      expect(notOwner.status).toBe(403);
      expect(notOwner.body).toEqual({ code: 'NOT_PET_OWNER' });
      expect(await storedFiles()).toHaveLength(1);
    });
  });

  describe('single-photo endpoints with several photos', () => {
    it('PUT /image replaces all photos with one and deletes the old files', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await addImages(owner.agent, petId, [PNG, PNG, PNG]);

      const response = await upload(owner.agent, petId, JPEG, {
        filename: 'new.jpg',
        contentType: 'image/jpeg',
      });

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(1);
      expect(await storedFiles()).toEqual([
        path.basename(response.body.imageUrl),
      ]);
    });

    it('DELETE /image removes all photos and their files', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await addImages(owner.agent, petId, [PNG, PNG]);

      const response = await owner.agent.delete(`/api/pets/${petId}/image`);

      expect(response.body).toMatchObject({ imageUrl: null, images: [] });
      expect(await storedFiles()).toEqual([]);
    });
  });

  describe('re-encoding and validation', () => {
    /** Uploads through PUT /image and downloads what is actually served. */
    const uploadAndFetch = async (
      data: Buffer,
      options?: Parameters<typeof upload>[3],
    ) => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const response = await upload(owner.agent, petId, data, options);
      expect(response.status).toBe(200);

      const served = await request(app)
        .get(uploadPath(response.body.imageUrl))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(served.status).toBe(200);

      return { response, served, data: served.body as Buffer };
    };

    const expectRejected = async (
      data: Buffer,
      status: number,
      code: string,
    ) => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const single = await upload(owner.agent, petId, data);
      const gallery = await addImages(owner.agent, petId, [PNG, data]);

      expect(single.status).toBe(status);
      expect(single.body).toEqual({ code });
      expect(gallery.status).toBe(status);
      expect(gallery.body).toEqual({ code });
      // Nothing stored or half-written (readdir lists dot-files too).
      expect(await storedFiles()).toEqual([]);
      expect((await PetModel.findById(petId).lean())?.images).toEqual([]);
    };

    it('removes EXIF, GPS and XMP metadata and serves new bytes', async () => {
      const original = await createPhoneJpeg();
      const before = await sharp(original).metadata();
      // The fixture really carries the metadata.
      expect(before.exif).toBeDefined();
      expect(before.xmp).toBeDefined();
      expect(hasGpsTag(before.exif as Buffer)).toBe(true);
      expect(original.includes(METADATA_MARKER)).toBe(true);

      const { data } = await uploadAndFetch(original, {
        filename: 'IMG_0001.jpg',
        contentType: 'image/jpeg',
      });
      const after = await sharp(data).metadata();

      expect(data.equals(original)).toBe(false);
      expect(after.format).toBe('jpeg');
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(after.iptc).toBeUndefined();
      expect(after.icc).toBeUndefined();
      expect(after.orientation).toBeUndefined();
      expect(hasGpsTag(data)).toBe(false);
      expect(data.includes(METADATA_MARKER)).toBe(false);
      expect(data.includes('PhoneMaker')).toBe(false);
    });

    it('applies the EXIF orientation to the pixels', async () => {
      // Stored 40×20 (red left, blue right) with "rotate 90° clockwise".
      const { data } = await uploadAndFetch(await createPhoneJpeg(), {
        filename: 'IMG_0002.jpg',
        contentType: 'image/jpeg',
      });
      const { data: pixels, info } = await sharp(data)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => {
        const offset = (y * info.width + x) * info.channels;
        return { red: pixels[offset], blue: pixels[offset + 2] };
      };

      expect([info.width, info.height]).toEqual([20, 40]);
      // Rotated clockwise, the left (red) edge is now at the top.
      expect(pixel(10, 2).red).toBeGreaterThan(200);
      expect(pixel(10, 2).blue).toBeLessThan(60);
      expect(pixel(10, 37).blue).toBeGreaterThan(200);
      expect(pixel(10, 37).red).toBeLessThan(60);
    });

    it.each([
      ['png', 'image/png', '.png'],
      ['jpeg', 'image/jpeg', '.jpg'],
      ['webp', 'image/webp', '.webp'],
    ] as const)(
      'stores %s with a matching extension, content type and format',
      async (format, contentType, extension) => {
        const { response, served, data } = await uploadAndFetch(
          await createTestImage(format),
          // The declared name and type are deliberately wrong.
          { filename: 'upload.gif', contentType: 'application/octet-stream' },
        );

        expect(path.extname(response.body.imageUrl)).toBe(extension);
        expect(served.headers['content-type']).toBe(contentType);
        expect((await sharp(data).metadata()).format).toBe(format);
      },
    );

    it.each(['png', 'webp'] as const)(
      'keeps transparency in %s',
      async (format) => {
        const { data } = await uploadAndFetch(
          await createTestImage(format, { alpha: true }),
        );
        const { data: pixels, info } = await sharp(data)
          .raw()
          .toBuffer({ resolveWithObject: true });

        expect(info.channels).toBe(4);
        expect(pixels[3]).toBe(0);
      },
    );

    it('downscales large photos to 2000 px on the longest side', async () => {
      const { data } = await uploadAndFetch(
        await createTestImage('png', { width: 3000, height: 1500 }),
      );
      const metadata = await sharp(data).metadata();

      expect([metadata.width, metadata.height]).toEqual([2000, 1000]);
    });

    it('rejects an image whose header claims more than 40 megapixels', async () => {
      // 100 megapixels declared in a file of a few dozen bytes.
      await expectRejected(
        await createPngClaimingSize(10_000, 10_000),
        413,
        'IMAGE_DIMENSIONS_TOO_LARGE',
      );
    });

    it('rejects a truncated JPEG', async () => {
      const jpeg = await createTestImage('jpeg', { width: 64, height: 64 });

      await expectRejected(
        jpeg.subarray(0, Math.floor(jpeg.length / 2)),
        400,
        'INVALID_IMAGE',
      );
    });

    it('rejects valid magic bytes followed by garbage', async () => {
      await expectRejected(
        Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.from('<script>alert(1)</script>'.repeat(4)),
        ]),
        400,
        'INVALID_IMAGE',
      );
    });

    it('rejects an animated WebP', async () => {
      await expectRejected(
        await createAnimatedWebp(),
        415,
        'UNSUPPORTED_IMAGE_TYPE',
      );
    });

    it.each([
      [
        'SVG',
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ],
      ['GIF', 'GIF89a\x01\x00\x01\x00\x00\x00\x00;'],
      ['HTML', '<!doctype html><script>alert(1)</script>'],
    ])('rejects %s sent as image/png', async (_name, content) => {
      await expectRejected(
        Buffer.from(content, 'binary'),
        415,
        'UNSUPPORTED_IMAGE_TYPE',
      );
    });
  });

  describe('pet responses and deletion', () => {
    it('returns no photos for pets without one', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);

      const detail = await request(app).get(`/api/pets/${petId}`);
      const list = await request(app).get('/api/pets');

      expect(detail.body).toMatchObject({ imageUrl: null, images: [] });
      expect(list.body.items[0]).toMatchObject({ imageUrl: null, images: [] });
    });

    it("deletes all of the pet's photos when the pet is deleted", async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      await addImages(owner.agent, petId, [PNG, JPEG, WEBP]);

      const response = await owner.agent.delete(`/api/pets/${petId}`);

      expect(response.status).toBe(204);
      expect(await storedFiles()).toEqual([]);
    });

    it('converts pets saved with a single imageKey, once', async () => {
      const owner = await createSignedInAgent();
      const petId = await createPet(owner);
      const uploaded = await upload(owner.agent, petId, PNG);
      const key = `pets/${path.basename(uploaded.body.imageUrl)}`;
      // Recreate the old document shape directly in the database.
      await PetModel.collection.updateOne(
        { _id: new Types.ObjectId(petId) },
        { $set: { imageKey: key }, $unset: { images: '' } },
      );

      expect(await backfillPetImages()).toBe(1);
      expect(await backfillPetImages()).toBe(0);

      const detail = await request(app).get(`/api/pets/${petId}`);
      expect(detail.body.imageUrl).toBe(uploaded.body.imageUrl);
      expect(detail.body.images).toEqual([
        { _id: expect.any(String), url: uploaded.body.imageUrl },
      ]);
      expect(
        await PetModel.collection.findOne({ imageKey: { $exists: true } }),
      ).toBeNull();
    });
  });
});
