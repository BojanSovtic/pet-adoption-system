import { randomUUID } from 'node:crypto';
import {
  Types,
  type ClientSession,
  type QueryFilter,
  type SortOrder,
} from 'mongoose';
import {
  canTransitionPetStatus,
  PET_IMAGE_MAX_COUNT,
  type CreatePetInput,
  type Paginated,
  type PetImageType,
  type PetSort,
  type PetStatus,
  type UpdatePetInput,
} from '@pet-adoption/models';

import { ApplicationModel } from '../applications/application.model';
import { withTransaction } from '../config/database';
import { ConflictError, NotFoundError } from '../errors/app-error';
import { deleteStoredFileQuietly, storage } from '../storage';
import { IMAGE_EXTENSIONS, tooManyImagesError } from './pet-image';
import { PetModel, type PetRecord } from './pet.model';
import type { ParsedPetListQuery } from './pet.schema';

type StoredPet = PetRecord & { _id: Types.ObjectId };

// The sort whitelist. `_id` breaks ties so the order is stable across pages;
// without it, pets with equal values could appear on two pages or none.
const SORTS: Record<PetSort, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  age: { age: 1, _id: 1 },
};

// Case-insensitive ordering for names ("luna" next to "Luna", not after "Z").
const NAME_COLLATION = { locale: 'en', strength: 2 };

/** User input is matched literally: "a.b" must not match "axb". */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One page of pets. Search and filters apply before paging, and the count uses
 * the same filter, so the metadata matches the results.
 */
/**
 * Which pets a list may contain: the public list only shows visible pets;
 * the admin list can show hidden ones too.
 */
export type PetVisibility = 'visible' | 'hidden' | 'all';

export const listPets = async (
  { search, species, status, sort, page, pageSize }: ParsedPetListQuery,
  visibility: PetVisibility = 'visible',
): Promise<Paginated<PetRecord>> => {
  const filter: QueryFilter<PetRecord> = {};

  if (visibility === 'visible') {
    filter.hiddenAt = null;
  } else if (visibility === 'hidden') {
    filter.hiddenAt = { $ne: null };
  }

  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }

  if (species) {
    filter.species = species;
  }

  if (status) {
    filter.status = status;
  }

  const findPage = PetModel.find(filter)
    .sort(SORTS[sort])
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  if (sort === 'name') {
    findPage.collation(NAME_COLLATION);
  }

  const [items, totalItems] = await Promise.all([
    findPage.lean(),
    PetModel.countDocuments(filter),
  ]);

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
};

export const getPetById = async (id: string): Promise<PetRecord | null> => {
  return PetModel.findById(id).lean();
};

export const petExists = async (id: string): Promise<boolean> => {
  return (await PetModel.exists({ _id: id })) !== null;
};

export const isPetOwnedBy = async (
  id: string,
  ownerId: string,
): Promise<boolean> => {
  return (await PetModel.exists({ _id: id, owner: ownerId })) !== null;
};

export const createPet = async (
  input: CreatePetInput,
  ownerId: string,
): Promise<PetRecord> => {
  // `owner` comes last so nothing in the input can override it.
  const pet = await PetModel.create({ ...input, owner: ownerId });

  return pet.toObject();
};

/**
 * Updates the pet only if `ownerId` owns it; the ownership check is part of
 * the query, so it cannot race. Returns `null` if no owned pet matched.
 * Status is not part of the input, so this never changes the pet's status.
 */
export const updateOwnedPet = async (
  id: string,
  ownerId: string,
  input: UpdatePetInput,
): Promise<PetRecord | null> => {
  return PetModel.findOneAndUpdate({ _id: id, owner: ownerId }, input, {
    returnDocument: 'after',
    runValidators: true,
  }).lean();
};

/**
 * Writes to the pet as the first step of a transaction and returns its current
 * state. MongoDB allows only one open transaction to modify a document, so
 * concurrent transactions on the same pet conflict and are retried one after
 * another instead of acting on stale data.
 */
export const lockPet = async (
  session: ClientSession,
  petId: string | Types.ObjectId,
  ownerId?: string,
): Promise<StoredPet | null> => {
  return PetModel.findOneAndUpdate(
    ownerId ? { _id: petId, owner: ownerId } : { _id: petId },
    { $currentDate: { updatedAt: true } },
    { session, timestamps: false, returnDocument: 'after' },
  ).lean<StoredPet>();
};

/** Applies a pet status change allowed by the pet state machine. */
export const transitionPetStatus = async (
  session: ClientSession,
  pet: Pick<StoredPet, '_id' | 'status'>,
  to: PetStatus,
): Promise<void> => {
  if (!canTransitionPetStatus(pet.status, to)) {
    throw new ConflictError('INVALID_STATUS_TRANSITION');
  }

  const result = await PetModel.updateOne(
    { _id: pet._id, status: pet.status },
    { status: to },
    { session },
  );

  if (result.matchedCount === 0) {
    throw new ConflictError('INVALID_STATUS_TRANSITION');
  }
};

/**
 * Deletes the pet only if `ownerId` owns it and it has no pending or accepted
 * applications. Its inactive (rejected/withdrawn) applications are deleted
 * with it. Returns the deleted pet (so the caller can remove its photo after
 * the transaction), or `null` if no owned pet matched.
 */
export const deleteOwnedPet = (
  id: string,
  ownerId: string,
): Promise<StoredPet | null> =>
  withTransaction(async (session) => {
    const pet = await lockPet(session, id, ownerId);

    if (!pet) {
      return null;
    }

    const hasActiveApplications = await ApplicationModel.exists({
      pet: pet._id,
      status: { $in: ['pending', 'accepted'] },
    }).session(session);

    if (hasActiveApplications) {
      throw new ConflictError('PET_HAS_ACTIVE_APPLICATIONS');
    }

    await ApplicationModel.deleteMany({ pet: pet._id }, { session });
    await PetModel.deleteOne({ _id: pet._id }, { session });

    return pet;
  });

type ImageFile = { data: Buffer; type: PetImageType };

/** The storage keys of a pet's photos. */
export const petImageKeys = (pet: Pick<PetRecord, 'images'>): string[] =>
  (pet.images ?? []).map((image) => image.key);

const deleteStoredFilesQuietly = (keys: string[]): Promise<unknown> =>
  Promise.all(keys.map(deleteStoredFileQuietly));

/**
 * Writes the files to storage under new random keys. If one write fails, the
 * ones already written are removed again. Keys are never reused, so a file
 * always belongs to exactly one photo.
 */
const storeImageFiles = async (files: ImageFile[]): Promise<string[]> => {
  const keys = files.map(
    ({ type }) => `pets/${randomUUID()}.${IMAGE_EXTENSIONS[type]}`,
  );

  try {
    await Promise.all(
      files.map(({ data, type }, index) =>
        storage.save(keys[index], data, type),
      ),
    );
  } catch (error) {
    await deleteStoredFilesQuietly(keys);
    throw error;
  }

  return keys;
};

/**
 * Runs a photo update that points the pet at `newKeys`. If the update fails
 * or matches no pet, the database never referenced the new files, so they are
 * removed again.
 */
const updateWithNewFiles = async (
  newKeys: string[],
  update: () => Promise<PetRecord | null>,
): Promise<PetRecord | null> => {
  let result: PetRecord | null;

  try {
    result = await update();
  } catch (error) {
    await deleteStoredFilesQuietly(newKeys);
    throw error;
  }

  if (!result) {
    await deleteStoredFilesQuietly(newKeys);
  }

  return result;
};

/**
 * Adds photos after the existing ones. The count limit is part of the update
 * query, so two concurrent uploads can't exceed it together. Returns `null`
 * if no owned pet matched; throws TOO_MANY_IMAGES if the pet has no room.
 */
export const addPetImages = async (
  id: string,
  ownerId: string,
  files: ImageFile[],
): Promise<PetRecord | null> => {
  const keys = await storeImageFiles(files);
  const maxExisting = PET_IMAGE_MAX_COUNT - files.length;

  const pet = await updateWithNewFiles(keys, () =>
    PetModel.findOneAndUpdate(
      {
        _id: id,
        owner: ownerId,
        $expr: {
          $lte: [{ $size: { $ifNull: ['$images', []] } }, maxExisting],
        },
      },
      { $push: { images: { $each: keys.map((key) => ({ key })) } } },
      { returnDocument: 'after' },
    ).lean(),
  );

  if (!pet && (await isPetOwnedBy(id, ownerId))) {
    throw tooManyImagesError();
  }

  return pet;
};

/**
 * Removes one photo and then its file. `returnDocument: 'before'` reports the
 * removed photo's key from the update itself. Returns `null` if no owned pet
 * matched; throws IMAGE_NOT_FOUND if the pet has no such photo.
 */
export const removePetImageById = async (
  id: string,
  ownerId: string,
  imageId: string,
): Promise<PetRecord | null> => {
  const previous = await PetModel.findOneAndUpdate(
    { _id: id, owner: ownerId, 'images._id': imageId },
    { $pull: { images: { _id: imageId } } },
    { returnDocument: 'before' },
  ).lean();

  if (!previous) {
    if (await isPetOwnedBy(id, ownerId)) {
      throw new NotFoundError('IMAGE_NOT_FOUND');
    }

    return null;
  }

  const removed = previous.images?.find((image) => image._id.equals(imageId));

  if (removed) {
    await deleteStoredFileQuietly(removed.key);
  }

  return PetModel.findById(id).lean();
};

/**
 * Moves one photo to the front, which makes it the main photo (`imageUrl`,
 * used on cards). A single pipeline update, so it can't interleave with
 * another photo change. Returns `null` if no owned pet matched; throws
 * IMAGE_NOT_FOUND if the pet has no such photo.
 */
export const setMainPetImage = async (
  id: string,
  ownerId: string,
  imageId: string,
): Promise<PetRecord | null> => {
  // Pipelines aren't cast by Mongoose, so the id must already be an ObjectId.
  const imageObjectId = new Types.ObjectId(imageId);
  const isChosen = { $eq: ['$$this._id', imageObjectId] };

  const pet = await PetModel.findOneAndUpdate(
    { _id: id, owner: ownerId, 'images._id': imageObjectId },
    [
      {
        $set: {
          images: {
            $concatArrays: [
              { $filter: { input: '$images', cond: isChosen } },
              { $filter: { input: '$images', cond: { $not: [isChosen] } } },
            ],
          },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).lean();

  if (!pet && (await isPetOwnedBy(id, ownerId))) {
    throw new NotFoundError('IMAGE_NOT_FOUND');
  }

  return pet;
};

/**
 * Replaces all photos with one (`PUT /api/pets/:id/image`, the single-photo
 * endpoint kept for existing clients). The replaced files are deleted after
 * the update. Returns `null` (and stores nothing) if no owned pet matched.
 */
export const setPetImage = async (
  id: string,
  ownerId: string,
  file: ImageFile,
): Promise<PetRecord | null> => {
  const keys = await storeImageFiles([file]);
  const previous = await updateWithNewFiles(keys, () =>
    PetModel.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: { images: [{ key: keys[0] }] } },
      { returnDocument: 'before' },
    ).lean(),
  );

  if (!previous) {
    return null;
  }

  await deleteStoredFilesQuietly(petImageKeys(previous));

  return PetModel.findById(id).lean();
};

/** Removes all photos. Returns `null` if no owned pet matched. */
export const removePetImages = async (
  id: string,
  ownerId: string,
): Promise<PetRecord | null> => {
  const previous = await PetModel.findOneAndUpdate(
    { _id: id, owner: ownerId },
    { $set: { images: [] } },
    { returnDocument: 'before' },
  ).lean();

  if (!previous) {
    return null;
  }

  await deleteStoredFilesQuietly(petImageKeys(previous));

  return PetModel.findById(id).lean();
};

/**
 * Moves the single `imageKey` of pets saved before photo galleries into
 * `images`. Runs at startup and does nothing once every pet is converted.
 * `imageKey` is no longer part of the schema, so it is read from the raw
 * collection and removed with `strict: false`. Returns how many pets were
 * converted.
 */
export const backfillPetImages = async (): Promise<number> => {
  const legacy = await PetModel.collection
    .find(
      { imageKey: { $exists: true } },
      { projection: { imageKey: 1, images: 1 } },
    )
    .toArray();

  for (const pet of legacy) {
    const legacyKey: unknown = pet.imageKey;
    const images: Array<{ key?: unknown }> = Array.isArray(pet.images)
      ? pet.images
      : [];
    const needsMove =
      typeof legacyKey === 'string' &&
      legacyKey !== '' &&
      !images.some((image) => image.key === legacyKey);

    await PetModel.updateOne(
      { _id: pet._id },
      {
        // The legacy photo goes last, so it never displaces newer photos.
        ...(needsMove ? { $push: { images: { key: legacyKey } } } : {}),
        $unset: { imageKey: '' },
      },
      { strict: false },
    );
  }

  return legacy.length;
};
