import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PetImage } from '@pet-adoption/models';

import { PETS } from './demo-data';
import {
  demoImagesToUpload,
  findDemoImages,
  parseDemoImageName,
  planDemoImagePreparation,
} from './demo-images';

// Only the leading bytes matter for type detection.
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32),
]);
const OTHER_JPEG = Buffer.concat([JPEG, Buffer.from('different')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

let dir: string;

const write = (files: Record<string, Buffer | string>) => {
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), data);
  }
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'demo-images-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseDemoImageName', () => {
  it.each([
    ['max.jpg', { pet: 'max', position: 1, extension: '.jpg' }],
    ['max-2.webp', { pet: 'max', position: 2, extension: '.webp' }],
    ['maxi-5.jpeg', { pet: 'maxi', position: 5, extension: '.jpeg' }],
  ])('reads %s', (fileName, expected) => {
    expect(parseDemoImageName(fileName)).toEqual(expected);
  });

  it.each([
    'Max.jpg',
    'max-1.jpg',
    'max-6.jpg',
    'max.gif',
    'cat.4001.jpg',
    'max_2.jpg',
  ])('ignores %s', (fileName) => {
    expect(parseDemoImageName(fileName)).toBeNull();
  });
});

describe('findDemoImages', () => {
  it('matches the whole pet name, in photo order', () => {
    write({
      'max-3.png': PNG,
      'max.jpg': JPEG,
      'max-2.webp': JPEG,
      'maxi.jpg': JPEG,
      'maxi-2.jpg': JPEG,
      'cat.4001.jpg': JPEG,
    });

    expect(findDemoImages(dir, 'Max')).toEqual([
      'max.jpg',
      'max-2.webp',
      'max-3.png',
    ]);
    expect(findDemoImages(dir, 'Maxi')).toEqual(['maxi.jpg', 'maxi-2.jpg']);
  });

  it('prefers .jpg, .jpeg, .png, .webp when a position exists twice', () => {
    write({
      'max.webp': JPEG,
      'max.png': PNG,
      'max-2.jpeg': JPEG,
      'max-2.jpg': JPEG,
    });

    expect(findDemoImages(dir, 'Max')).toEqual(['max.png', 'max-2.jpg']);
  });

  it('returns nothing for a pet without files or a missing folder', () => {
    expect(findDemoImages(dir, 'Rex')).toEqual([]);
    expect(findDemoImages(path.join(dir, 'missing'), 'Rex')).toEqual([]);
  });
});

describe('demoImagesToUpload (seed reruns)', () => {
  const photo: PetImage = { _id: 'a', url: 'http://x/uploads/pets/a.jpg' };

  it('uploads all photos to a pet without photos', () => {
    expect(
      demoImagesToUpload({ images: [] }, ['max.jpg', 'max-2.jpg']),
    ).toEqual(['max.jpg', 'max-2.jpg']);
  });

  it('leaves a pet that already has photos alone', () => {
    expect(
      demoImagesToUpload({ images: [photo] }, ['max.jpg', 'max-2.jpg']),
    ).toEqual([]);
  });
});

describe('planDemoImagePreparation', () => {
  const plan = (pets: Record<string, string[]>) =>
    planDemoImagePreparation({ pets }, PETS, dir);

  it('plans copies to the naming rule, keeping the extension', () => {
    write({ 'dog.1.jpg': JPEG, 'dog.2.jpeg': JPEG, 'cat.1.png': PNG });

    const result = plan({
      max: ['dog.1.jpg', 'dog.2.jpeg'],
      luna: ['cat.1.png'],
    });

    expect(result.errors).toEqual([]);
    expect(result.steps).toEqual([
      { pet: 'max', source: 'dog.1.jpg', target: 'max.jpg', action: 'copy' },
      {
        pet: 'max',
        source: 'dog.2.jpeg',
        target: 'max-2.jpeg',
        action: 'copy',
      },
      { pet: 'luna', source: 'cat.1.png', target: 'luna.png', action: 'copy' },
    ]);
  });

  it('is safe to rerun: identical targets are left as they are', () => {
    write({ 'dog.1.jpg': JPEG });
    copyFileSync(path.join(dir, 'dog.1.jpg'), path.join(dir, 'max.jpg'));

    const result = plan({ max: ['dog.1.jpg'] });

    expect(result.errors).toEqual([]);
    expect(result.steps).toEqual([
      {
        pet: 'max',
        source: 'dog.1.jpg',
        target: 'max.jpg',
        action: 'unchanged',
      },
    ]);
  });

  it('never plans to overwrite a different file', () => {
    write({ 'dog.1.jpg': JPEG, 'max.jpg': OTHER_JPEG });

    const result = plan({ max: ['dog.1.jpg'] });

    expect(result.steps).toEqual([]);
    expect(result.errors).toEqual([
      expect.stringContaining('max.jpg already exists with different content'),
    ]);
  });

  it.each([
    [{ maximus: ['dog.1.jpg'] }, 'is not a demo pet'],
    [{ max: Array.from({ length: 6 }, (_, i) => `dog.${i}.jpg`) }, 'at most 5'],
    [{ max: ['cat.1.jpg'] }, 'a cat photo for a dog'],
    [{ luna: ['dog.1.jpg'] }, 'a dog photo for a cat'],
    [{ max: ['missing.jpg'] }, 'file not found'],
    [{ max: ['notes.jpg'] }, 'not a JPG image'],
    [{ max: ['dog.1.jpg'], rex: ['dog.1.jpg'] }, 'already used for max'],
    [{ max: ['max-2.jpg'] }, 'already a prepared name'],
    [{ max: ['../dog.1.jpg'] }, 'not a path'],
  ])('reports %j: "%s"', (pets, message) => {
    write({
      'dog.1.jpg': JPEG,
      'cat.1.jpg': JPEG,
      'notes.jpg': 'just text',
      'max-2.jpg': JPEG,
    });

    expect(plan(pets).errors).toEqual(
      expect.arrayContaining([expect.stringContaining(message)]),
    );
  });

  it('warns about prepared files the mapping does not produce', () => {
    write({ 'dog.1.jpg': JPEG, 'max-4.jpg': JPEG });

    const result = plan({ max: ['dog.1.jpg'] });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('max-4.jpg')]);
  });
});
