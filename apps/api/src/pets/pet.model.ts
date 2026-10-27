import { Schema, model, type Types } from 'mongoose';
import {
  DEFAULT_PET_PROFILE,
  PET_ALONE_TIME_VALUES,
  PET_BREED_MAX_LENGTH,
  PET_COMPATIBILITY_VALUES,
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SEXES,
  PET_SPECIES,
  PET_STATUSES,
  type Pet,
  type PetCompatibility,
  type PetProfile,
} from '@pet-adoption/models';

const compatibilityField = {
  type: String,
  enum: [...PET_COMPATIBILITY_VALUES],
  default: 'unknown',
};

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
  | '_id'
  | 'owner'
  | 'imageUrl'
  | 'images'
  | 'createdAt'
  | 'updatedAt'
  | 'hidden'
  | keyof PetProfile
> &
  // Pets saved before profile facts existed don't have them; the API reads
  // missing ones as DEFAULT_PET_PROFILE (see `withProfileDefaults`).
  Partial<Omit<PetProfile, 'compatibility'>> & {
    compatibility?: Partial<PetCompatibility>;
  } & {
    owner: Types.ObjectId;
    /** At most PET_IMAGE_MAX_COUNT; the first is the primary photo. */
    images?: PetImageRecord[];
    /**
     * Set when an admin hides the listing (`hidePet`); missing or null while
     * public. Never part of the owner's input, so owners can't unhide.
     * Who hid it is in the admin audit log.
     */
    hiddenAt?: Date | null;
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
    sex: {
      type: String,
      enum: [...PET_SEXES],
      default: DEFAULT_PET_PROFILE.sex,
    },
    breed: {
      type: String,
      trim: true,
      maxlength: PET_BREED_MAX_LENGTH,
      default: DEFAULT_PET_PROFILE.breed,
    },
    compatibility: {
      children: compatibilityField,
      dogs: compatibilityField,
      cats: compatibilityField,
    },
    aloneTime: {
      type: String,
      enum: [...PET_ALONE_TIME_VALUES],
      default: DEFAULT_PET_PROFILE.aloneTime,
    },
    // Moderation. Not in any owner input schema, so only admins change it.
    hiddenAt: { type: Date, default: null },
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

/**
 * The profile facts of a stored pet, with DEFAULT_PET_PROFILE for any that
 * are missing (pets saved before these fields existed). No migration needed.
 */
export const withProfileDefaults = ({
  sex,
  breed,
  compatibility,
  aloneTime,
}: PetRecord): PetProfile => ({
  sex: sex ?? DEFAULT_PET_PROFILE.sex,
  breed: breed ?? DEFAULT_PET_PROFILE.breed,
  compatibility: { ...DEFAULT_PET_PROFILE.compatibility, ...compatibility },
  aloneTime: aloneTime ?? DEFAULT_PET_PROFILE.aloneTime,
});
