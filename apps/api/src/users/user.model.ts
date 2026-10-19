import { Schema, model } from 'mongoose';
import { EMAIL_MAX_LENGTH, USER_NAME_MAX_LENGTH } from '@pet-adoption/models';

export type UserRecord = {
  email: string;
  name: string;
  /**
   * Argon2id hash. Optional because a user's identity is independent of the
   * sign-in method: a future OAuth-only user would have no password.
   */
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserRecord>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: USER_NAME_MAX_LENGTH,
    },
    passwordHash: {
      type: String,
      // Never loaded unless a query explicitly asks for it.
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

export const UserModel = model<UserRecord>('User', userSchema);
