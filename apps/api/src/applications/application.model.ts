import { Schema, model, type Types } from 'mongoose';
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@pet-adoption/models';

export type ApplicationRecord = {
  pet: Types.ObjectId;
  applicant: Types.ObjectId;
  message: string;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
};

const applicationSchema = new Schema<ApplicationRecord>(
  {
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: APPLICATION_MESSAGE_MAX_LENGTH,
    },
    status: {
      type: String,
      enum: [...APPLICATION_STATUSES],
      default: 'pending',
      required: true,
    },
  },
  { timestamps: true },
);

// One application per user and pet. Withdrawn applications are excluded, so
// they can be replaced; rejected ones are included, so no reapplying.
applicationSchema.index(
  { pet: 1, applicant: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'accepted', 'rejected'] },
    },
  },
);

// Database-level guarantee: at most one accepted application per pet.
applicationSchema.index(
  { pet: 1 },
  { unique: true, partialFilterExpression: { status: 'accepted' } },
);

applicationSchema.index({ pet: 1, status: 1 });
applicationSchema.index({ applicant: 1, createdAt: -1 });

export const ApplicationModel = model<ApplicationRecord>(
  'AdoptionApplication',
  applicationSchema,
);
