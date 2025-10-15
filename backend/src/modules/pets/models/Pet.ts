import mongoose, { Document, Schema } from 'mongoose';

import { IUser } from '@/modules/users/models/User';

export interface IPet extends Document {
  name: string;
  species?: string;
  breed?: string;
  age?: number;
  description?: string;
  photos: string[];
  status: 'available' | 'adopted';
  owner?: mongoose.Types.ObjectId | IUser;
  adopter?: mongoose.Types.ObjectId | IUser;
}

const PetSchema: Schema = new Schema({
  name: { type: String, required: true },
  species: { type: String },
  breed: { type: String },
  age: { type: Number },
  description: { type: String },
  photos: [{ type: String }],
  status: { type: String, enum: ['available', 'adopted'], default: 'available' },
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  adopter: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model<IPet>('Pet', PetSchema);