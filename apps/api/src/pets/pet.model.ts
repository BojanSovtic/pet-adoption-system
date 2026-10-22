import { Schema, model, type Types } from 'mongoose';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SPECIES,
  PET_STATUSES,
  type Pet,
} from '@pet-adoption/models';

/** One stored photo: a storage key such as "pets/3f2a….jpg". */
export type PetImageRecord = {
  _id: Types.ObjectId;
  key: string;
};

/**
 * A pet as stored in MongoDB: the API `Pet` fields with real ids and dates.
 * Photos are stored as storage keys; the API turns them into URLs, so moving
 * files to another storage changes no data. Pets saved before photo galleries
 * had a single `imageKey`; `backfillPetImages` moves it into `images`.
 */
export type PetRecord = Omit<
  Pet,
  '_id' | 'owner' | 'imageUrl' | 'images' | 'createdAt' | 'updatedAt'
> & {
  owner: Types.ObjectId;
  /** At most PET_IMAGE_MAX_COUNT; the first is the primary photo. */
  images?: PetImageRecord[];
  createdAt: Date;
  updatedAt: Date;
};

const petSchema = new Schema<PetRecord>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Ownership checks filter by owner.
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: PET_NAME_MAX_LENGTH,
    },
    species: {
      type: String,
      enum: [...PET_SPECIES],
      required: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: PET_DESCRIPTION_MAX_LENGTH,
    },
    status: {
      type: String,
      enum: [...PET_STATUSES],
      default: 'available',
      required: true,
    },
    // Never accepted from clients; only the photo endpoints change it. The
    // count limit is enforced by the photo update queries themselves.
    images: {
      type: [
        new Schema<PetImageRecord>({ key: { type: String, required: true } }),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Serves the default list order (newest first, `_id` as tie-breaker) and,
// read backwards, "oldest": MongoDB walks the index and stops after one page
// instead of sorting every pet in memory.
petSchema.index({ createdAt: -1, _id: -1 });

export const PetModel = model<PetRecord>('Pet', petSchema);
