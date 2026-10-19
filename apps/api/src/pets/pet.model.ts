import { Schema, model } from 'mongoose';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SPECIES,
  PET_STATUSES,
  type Pet,
} from '@pet-adoption/models';

/** A pet as stored in MongoDB: the API `Pet` fields, with real dates. */
export type PetRecord = Omit<Pet, '_id' | 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

const petSchema = new Schema<PetRecord>(
  {
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
    imageUrls: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const PetModel = model<PetRecord>('Pet', petSchema);
