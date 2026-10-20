/**
 * Where uploaded files live. The app only talks to this interface, so moving
 * from local disk to object storage (S3, Cloudflare R2, MinIO) means adding
 * one implementation and changing configuration; nothing else changes.
 */
export type FileStorage = {
  /** Stores `data` under `key` (e.g. "pets/3f2a….jpg"). */
  save: (key: string, data: Buffer, contentType: string) => Promise<void>;
  /** Removes the file; a missing file is not an error. */
  delete: (key: string) => Promise<void>;
  /** The URL browsers use to load the file. */
  publicUrl: (key: string) => string;
};
