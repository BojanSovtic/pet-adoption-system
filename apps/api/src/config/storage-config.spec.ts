import { describe, expect, it } from 'vitest';

import { env } from './env';
import { readCloudinaryConfig, readStorageDriver } from './storage-config';

describe('readStorageDriver', () => {
  it.each([undefined, '', '  '])('defaults to local (%j)', (value) => {
    expect(readStorageDriver({ STORAGE_DRIVER: value })).toBe('local');
  });

  it.each(['local', 'cloudinary', ' cloudinary '])('accepts %j', (value) => {
    expect(readStorageDriver({ STORAGE_DRIVER: value })).toBe(value.trim());
  });

  it.each(['s3', 'Cloudinary', 'disk'])('refuses %j', (value) => {
    expect(() => readStorageDriver({ STORAGE_DRIVER: value })).toThrow(
      /STORAGE_DRIVER must be one of local, cloudinary/,
    );
  });

  it('is local in the test environment', () => {
    expect(env.storageDriver).toBe('local');
    expect(env.cloudinary).toBeNull();
  });
});

describe('readCloudinaryConfig', () => {
  const valid = {
    CLOUDINARY_CLOUD_NAME: 'demo-cloud_1',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'abcdefghijklmnop-QRSTUV_wxyz',
  };

  it('reads the three settings', () => {
    expect(readCloudinaryConfig(valid)).toEqual({
      cloudName: 'demo-cloud_1',
      apiKey: '123456789012345',
      apiSecret: 'abcdefghijklmnop-QRSTUV_wxyz',
    });
  });

  it.each([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('requires %s', (name) => {
    expect(() => readCloudinaryConfig({ ...valid, [name]: undefined })).toThrow(
      `${name} is required when STORAGE_DRIVER=cloudinary`,
    );
    expect(() => readCloudinaryConfig({ ...valid, [name]: '' })).toThrow(
      `${name} is required`,
    );
  });

  it.each([
    ['CLOUDINARY_CLOUD_NAME', 'my cloud'],
    ['CLOUDINARY_CLOUD_NAME', '"demo"'],
    ['CLOUDINARY_API_KEY', '12345abc'],
    ['CLOUDINARY_API_KEY', ' 123456'],
    ['CLOUDINARY_API_SECRET', 'short'],
    ['CLOUDINARY_API_SECRET', 'abcdefghijklmnop qrst'],
  ])('refuses a malformed %s without revealing it', (name, value) => {
    let message = '';

    try {
      readCloudinaryConfig({ ...valid, [name]: value });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain(`${name} is malformed`);
    expect(message).not.toContain(value);
  });
});
