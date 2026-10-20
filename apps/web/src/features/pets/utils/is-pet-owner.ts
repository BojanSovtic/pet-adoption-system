import type { Pet, User } from '@pet-adoption/models';

/**
 * Whether the signed-in user posted this pet. Only decides what the UI shows;
 * the API enforces ownership on every change.
 */
export const isPetOwner = (pet: Pet, user: User | null | undefined): boolean =>
  Boolean(user) && pet.owner === user?._id;
