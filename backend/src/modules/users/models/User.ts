import mongoose, { Document, Schema } from 'mongoose';

import { IPet } from '@/modules/pets/models/Pet';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
    pets: mongoose.Types.Array<mongoose.Types.ObjectId | IPet>; 
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  pets: {
      type: [Schema.Types.ObjectId],
      ref: "Pet",
      default: []
    }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);