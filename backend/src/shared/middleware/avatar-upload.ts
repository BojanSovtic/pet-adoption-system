import { randomUUID } from "crypto";
import multer from "multer";

const MIME_TYPE_MAP: { [key: string]: string } = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/avatars");
  },
  filename: (req, file, cb) => {
    const ext = MIME_TYPE_MAP[file.mimetype];
    cb(null, `${randomUUID()}.${ext}`);
  },
});

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

export const avatarUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: fileFilter,
});
