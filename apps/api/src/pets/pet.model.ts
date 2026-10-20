import { Schema, model, type Types } from 'mongoose';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SPECIES,
  PET_STATUSES,
  type Pet,
} from '@pet-adoption/models';

/**
 * A pet as stored in MongoDB: the API `Pet` fields with real ids and dates.
 * The photo is stored as a storage key; the API turns it into `imageUrl`, so
 * moving files to another storage changes no data.
 */
export type PetRecord = Omit<
  Pet,
  '_id' | 'owner' | 'imageUrl' | 'createdAt' | 'updatedAt'
> & {
  owner: Types.ObjectId;
  imageKey?: string;
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
    // e.g. "pets/3f2a….jpg"; never accepted from clients.
    imageKey: {
      type: String,
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
