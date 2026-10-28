import type { AdminAuditSource } from '@pet-adoption/models';

import { ForbiddenError, NotFoundError } from '../errors/app-error';
import { PetModel, type PetRecord } from '../pets/pet.model';
import { lockPet } from '../pets/pet.service';
import { UserModel } from '../users/user.model';
import { runAudited } from './admin-audit.service';

type ModerationInput = {
  petId: string;
  actorId: string;
  source: AdminAuditSource;
};

/**
 * Hides or restores a listing. Reversible: nothing is deleted. Runs like the
 * adoption actions: the pet is locked first, so it can't race with a new
 * application (which checks `hiddenAt` after the same lock). Pet status and
 * existing applications are untouched: the owner can still decide them, and
 * applicants can still withdraw. Only new applications are refused.
 */
const setHidden = async (
  { petId, actorId, source }: ModerationInput,
  hidden: boolean,
  reason?: string,
): Promise<PetRecord> =>
  runAudited(
    {
      action: hidden ? 'pet.hidden' : 'pet.restored',
      actorId,
      targetPetId: petId,
      source,
      metadata: hidden ? { reason } : {},
    },
    async (session) => {
      const pet = await lockPet(session, petId);

      if (!pet) {
        throw new NotFoundError('PET_NOT_FOUND');
      }

      // Same rule as for user changes: the actor must be an active admin now.
      const actorIsAdmin = await UserModel.exists({
        _id: actorId,
        role: 'admin',
        suspendedAt: null,
      }).session(session);

      if (!actorIsAdmin) {
        throw new ForbiddenError('ADMIN_REQUIRED');
      }

      if (Boolean(pet.hiddenAt) === hidden) {
        return { result: pet, metadata: null };
      }

      const updated = await PetModel.findByIdAndUpdate(
        petId,
        { hiddenAt: hidden ? new Date() : null },
        { session, returnDocument: 'after', timestamps: false },
      ).lean<PetRecord>();

      if (!updated) {
        throw new NotFoundError('PET_NOT_FOUND');
      }

      return { result: updated, metadata: {} };
    },
  );

export const hidePet = (input: ModerationInput & { reason?: string }) =>
  setHidden(input, true, input.reason);

export const restorePet = (input: ModerationInput) => setHidden(input, false);
