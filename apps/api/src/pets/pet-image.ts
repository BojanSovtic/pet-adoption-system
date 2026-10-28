import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import {
  PET_IMAGE_MAX_BYTES,
  PET_IMAGE_MAX_COUNT,
  type PetImageType,
} from '@pet-adoption/models';

import { AppError, BadRequestError } from '../errors/app-error';

// Uploads are kept in memory (at most 5 MB per file) so their content can be
// checked before anything is written to storage.
const singleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PET_IMAGE_MAX_BYTES, files: 1, fields: 0, parts: 1 },
}).single('image');

const multipleImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PET_IMAGE_MAX_BYTES,
    files: PET_IMAGE_MAX_COUNT,
    fields: 0,
  },
}).array('images', PET_IMAGE_MAX_COUNT);

export const tooManyImagesError = (): AppError =>
  new AppError('TOO_MANY_IMAGES', 409);

/** Runs a multer parser and turns its errors into the API's error format. */
const withUploadErrors =
  (parser: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    parser(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(new AppError('IMAGE_TOO_LARGE', 413));
          return;
        }

        if (error.code === 'LIMIT_FILE_COUNT') {
          next(tooManyImagesError());
          return;
        }
      }

      // Wrong field name, extra fields, or a malformed body.
      next(new BadRequestError('INVALID_IMAGE_UPLOAD'));
    });
  };

/** One file in the field "image" (`PUT /api/pets/:id/image`). */
export const parsePetImageUpload: RequestHandler =
  withUploadErrors(singleImage);

/** 1 to PET_IMAGE_MAX_COUNT files in the field "images". */
export const parsePetImagesUpload: RequestHandler =
  withUploadErrors(multipleImages);

const startsWith = (data: Buffer, bytes: number[], offset = 0): boolean =>
  data.length >= offset + bytes.length &&
  bytes.every((byte, index) => data[offset + index] === byte);

/**
 * Detects the image type from the file's first bytes ("magic numbers"). The
 * filename and the browser-provided MIME type are never trusted.
 */
export const detectImageType = (data: Buffer): PetImageType | null => {
  if (startsWith(data, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  // "RIFF" <size> "WEBP"
  if (
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
};

export const IMAGE_EXTENSIONS: Record<PetImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Image processing limits. Uploads are at most PET_IMAGE_MAX_BYTES, but a
 * small compressed file can decode to a huge bitmap, so the pixel count is
 * checked from the header before anything is decoded.
 *
 * - 40 megapixels covers every common phone camera (12–24 MP, 48 MP modes
 *   produce files over 5 MB anyway).
 * - Stored photos are at most 2000 px on their longest side, plenty for the
 *   details page and far less to store and send.
 */
export const PET_IMAGE_MAX_INPUT_PIXELS = 40_000_000;
export const PET_IMAGE_MAX_OUTPUT_SIDE = 2000;
const PROCESSING_TIMEOUT_SECONDS = 15;

// Each upload is a different image, so libvips' operation cache would only
// keep decoded data in memory for nothing.
sharp.cache(false);

/**
 * At most this many images are decoded/encoded at once in this process; more
 * wait their turn (in memory, already received and size-limited by multer).
 * sharp runs on Node's libuv thread pool (4 threads by default), which
 * Argon2 password hashing and file I/O also use: without a cap, a burst of
 * uploads from several users could occupy every thread and stall sign-ins.
 * Per-user request limits (middleware/rate-limit.ts) bound how much each
 * account can submit; this bounds how much runs at the same time.
 */
export const MAX_CONCURRENT_IMAGE_JOBS = 2;

/**
 * Runs at most `max` tasks at once; the rest start in arrival order as
 * running ones finish (successfully or not).
 */
export const createConcurrencyLimit = (max: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];

  const acquire = async (): Promise<void> => {
    if (running < max) {
      running += 1;
      return;
    }

    // The finishing task hands its slot over directly (see release).
    await new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = (): void => {
    const next = waiting.shift();

    if (next) {
      next();
    } else {
      running -= 1;
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();

    try {
      return await task();
    } finally {
      release();
    }
  };
};

const runImageJob = createConcurrencyLimit(MAX_CONCURRENT_IMAGE_JOBS);

/** sharp's name for each accepted type (as reported by `metadata().format`). */
const SHARP_FORMATS: Record<PetImageType, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ProcessedImage = { data: Buffer; type: PetImageType };

const invalidImageError = (): AppError => new AppError('INVALID_IMAGE', 400);
const unsupportedImageError = (): AppError =>
  new AppError('UNSUPPORTED_IMAGE_TYPE', 415);

const reencodeImage = async (upload: Buffer): Promise<ProcessedImage> => {
  const type = detectImageType(upload);

  if (!type) {
    throw unsupportedImageError();
  }

  // 'warning' also rejects truncated files that libvips could half-decode.
  const options: sharp.SharpOptions = {
    failOn: 'warning',
    limitInputPixels: PET_IMAGE_MAX_INPUT_PIXELS,
  };

  let metadata: sharp.Metadata;

  try {
    // Reads the header only.
    metadata = await sharp(upload, {
      ...options,
      limitInputPixels: false,
    }).metadata();
  } catch {
    throw invalidImageError();
  }

  if (metadata.format !== SHARP_FORMATS[type]) {
    throw invalidImageError();
  }

  if ((metadata.pages ?? 1) > 1) {
    // Animated WebP: only still photos are supported.
    throw unsupportedImageError();
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > PET_IMAGE_MAX_INPUT_PIXELS
  ) {
    throw new AppError('IMAGE_DIMENSIONS_TOO_LARGE', 413);
  }

  const pipeline = sharp(upload, options)
    .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
    .rotate()
    .resize({
      width: PET_IMAGE_MAX_OUTPUT_SIDE,
      height: PET_IMAGE_MAX_OUTPUT_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    });

  const encoded =
    type === 'image/jpeg'
      ? pipeline.jpeg({ quality: 85 })
      : type === 'image/png'
        ? pipeline.png()
        : pipeline.webp({ quality: 85 });

  try {
    return { data: await encoded.toBuffer(), type };
  } catch {
    throw invalidImageError();
  }
};

/**
 * Turns an untrusted upload into the bytes that are actually published:
 *
 * 1. The magic bytes must be JPEG, PNG or WebP, so other formats libvips can
 *    read (SVG, TIFF, GIF, HEIF, PDF, ...) never reach the decoder.
 * 2. The decoder must agree on the format; truncated or corrupt files and
 *    animations are rejected; the pixel count is limited.
 * 3. The image is decoded and encoded again in the same format: EXIF
 *    orientation is applied to the pixels, the size is capped, and sharp
 *    writes no metadata (no EXIF/GPS, XMP, IPTC or ICC profile; colours are
 *    converted to sRGB). Transparency in PNG and WebP is kept.
 *
 * The original bytes are never stored. Errors are client errors (4xx) and
 * carry no file content. At most MAX_CONCURRENT_IMAGE_JOBS run at once.
 */
export const processPetImage = (upload: Buffer): Promise<ProcessedImage> =>
  runImageJob(() => reencodeImage(upload));
