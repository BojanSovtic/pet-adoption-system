import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
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
