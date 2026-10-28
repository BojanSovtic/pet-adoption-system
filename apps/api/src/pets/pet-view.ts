import { storage } from '../storage';
import { withProfileDefaults, type PetRecord } from './pet.model';

/**
 * The API shape of a pet: storage keys become public URLs. `imageUrl` is the
 * primary (first) photo, so single-photo clients keep working. Missing profile
 * facts (older pets) are filled with their defaults. Moderation becomes a
 * plain `hidden` flag (the date is only in the admin view). Ids and dates
 * become strings when the result is sent as JSON.
 */
export const toPetView = ({ images = [], hiddenAt, ...pet }: PetRecord) => {
  const views = images.map(({ _id, key }) => ({
    _id: _id.toString(),
    url: storage.publicUrl(key),
  }));

  return {
    ...pet,
    ...withProfileDefaults(pet),
    hidden: Boolean(hiddenAt),
    imageUrl: views[0]?.url ?? null,
    images: views,
  };
};

/** Public listings: pets an admin hid are left out (missing field = visible). */
export const VISIBLE_PETS = { hiddenAt: null } as const;
