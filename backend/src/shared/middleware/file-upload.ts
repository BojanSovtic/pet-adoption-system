import { randomUUID } from "crypto";
import multer from "multer";

const MIME_TYPE_MAP: { [key: string]: string } = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
};

// Generic storage factory
const createStorage = (folder: string) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const ext = MIME_TYPE_MAP[file.mimetype];
      cb(null, `${randomUUID()}.${ext}`);
    },
  });

// Generic file filter (same as before)
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const isValid = !!MIME_TYPE_MAP[file.mimetype];
  const error = isValid
    ? null
    : new Error("Invalid file type. Only JPEG, JPG, and PNG are allowed.");
  cb(error as any, isValid);
};

// Reusable function to create multer middleware
const createUpload = (folder: string, maxFiles = 1) =>
  multer({
    storage: createStorage(folder),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter,
  })[maxFiles > 1 ? "array" : "single"](
    maxFiles > 1 ? "images" : "image",
    maxFiles
  );

export const avatarUpload = createUpload("uploads/avatars");
export const petUpload = createUpload("uploads/pets", 10);
