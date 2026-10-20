import type { ClientSession, Types } from 'mongoose';
import {
  canTransitionPetStatus,
  type CreatePetInput,
  type PetStatus,
  type UpdatePetInput,
} from '@pet-adoption/models';

import { ApplicationModel } from '../applications/application.model';
import { withTransaction } from '../config/database';
import { ConflictError } from '../errors/app-error';
import { PetModel, type PetRecord } from './pet.model';

type StoredPet = PetRecord & { _id: Types.ObjectId };

export const getPets = async (): Promise<PetRecord[]> => {
  return PetModel.find().sort({ createdAt: -1 }).lean();
};

export const getPetById = async (id: string): Promise<PetRecord | null> => {
  return PetModel.findById(id).lean();
};

export const petExists = async (id: string): Promise<boolean> => {
  return (await PetModel.exists({ _id: id })) !== null;
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
 * with it. Returns `false` if no owned pet matched.
 */
export const deleteOwnedPet = (id: string, ownerId: string): Promise<boolean> =>
  withTransaction(async (session) => {
    const pet = await lockPet(session, id, ownerId);

    if (!pet) {
      return false;
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

    return true;
  });
