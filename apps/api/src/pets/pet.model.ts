import { Schema, model } from 'mongoose';

export type PetSpecies = 'dog' | 'cat' | 'other';

export type PetStatus = 'available' | 'pending' | 'adopted';

export interface Pet {
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  status: PetStatus;
  imageUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

const petSchema = new Schema<Pet>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    species: {
      type: String,
      enum: ['dog', 'cat', 'other'],
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
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['available', 'pending', 'adopted'],
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

export const PetModel = model<Pet>('Pet', petSchema);
