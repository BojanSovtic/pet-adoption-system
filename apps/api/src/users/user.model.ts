import { Schema, model } from 'mongoose';
import {
  EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_ROLES,
  type UserRole,
} from '@pet-adoption/models';

export type UserRecord = {
  email: string;
  name: string;
  /**
   * Argon2id hash. Optional because a user's identity is independent of the
   * sign-in method: a future OAuth-only user would have no password.
   */
  passwordHash?: string;
  /**
   * Missing on users created before roles existed; they are ordinary users.
   * Admin checks query `role: 'admin'` explicitly, so a missing role never
   * grants access. Changed only through `changeUserRole`.
   */
  role?: UserRole;
  /**
   * Set by an admin (`suspendUser`); missing or null while the account is
   * active. A suspended user can't sign in, and `requireAuth` ends their
   * existing sessions on the next request. Admins are never suspended.
   */
  suspendedAt?: Date | null;
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
    role: {
      type: String,
      enum: [...USER_ROLES],
      default: 'user',
      // The admin list filters by role, and admin counts use it.
      index: true,
    },
    // Who suspended the account is in the admin audit log.
    suspendedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export const UserModel = model<UserRecord>('User', userSchema);
