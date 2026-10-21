import { Schema, model, type Types } from 'mongoose';
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@pet-adoption/models';

export type ApplicationRecord = {
  pet: Types.ObjectId;
  /**
   * Copy of the pet's owner, so an owner's applications can be queried and
   * paginated directly. Pets never change owner, so it cannot go stale.
   */
  petOwner: Types.ObjectId;
  applicant: Types.ObjectId;
  message: string;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
};

const applicationSchema = new Schema<ApplicationRecord>(
  {
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    petOwner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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
// The two list pages, newest first (`_id` keeps the order stable across pages).
applicationSchema.index({ applicant: 1, createdAt: -1, _id: -1 });
applicationSchema.index({ petOwner: 1, createdAt: -1, _id: -1 });

export const ApplicationModel = model<ApplicationRecord>(
  'AdoptionApplication',
  applicationSchema,
);
