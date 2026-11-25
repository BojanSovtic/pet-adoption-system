import type { Pet, ReceivedApplication } from '@pet-adoption/models';

/**
 * Safety rules of seed-demo, kept apart from the runner so they can be tested.
 *
 * Seed-managed data is whatever a demo account (USERS in demo-data.ts) owns
 * or sent. The seed acts only with those accounts' sessions, so the API's own
 * authorization keeps it away from everyone else's data; these rules cover
 * the cases where that alone isn't enough.
 */

const ID = '[0-9a-f]{24}';

/**
 * Every request the seed may send. Anything else (deleting, editing, admin
 * routes) is refused before it leaves the script, so a bug in the seed can't
 * remove or change data.
 */
const ALLOWED_REQUESTS: ReadonlyArray<{
  method: 'GET' | 'POST';
  path: RegExp;
}> = [
  { method: 'GET', path: /^\/pets\/mine$/ },
  { method: 'GET', path: /^\/applications\/(mine|received)$/ },
  { method: 'POST', path: /^\/auth\/(login|register)$/ },
  { method: 'POST', path: /^\/pets$/ },
  { method: 'POST', path: new RegExp(`^/pets/${ID}/(images|applications)$`) },
  {
    method: 'POST',
    path: new RegExp(`^/applications/${ID}/(accept|reject|withdraw)$`),
  },
];

/** Whether the seed may send this request (`apiPath` may have a query). */
export const isAllowedSeedRequest = (
  method: string,
  apiPath: string,
): boolean => {
  const pathOnly = apiPath.split('?')[0];

  return ALLOWED_REQUESTS.some(
    (allowed) => allowed.method === method && allowed.path.test(pathOnly),
  );
};

/**
 * Requests that change no data, so sending one twice does no harm: reads,
 * and signing in (it only starts a session). These are the only requests a
 * dry run sends, and the only ones retried after a lost response.
 */
export const isRepeatSafeRequest = (method: string, apiPath: string): boolean =>
  method === 'GET' ||
  (method === 'POST' && apiPath.split('?')[0] === '/auth/login');

/**
 * The owner's existing pet for a demo pet, from the owner's own pets
 * (`GET /pets/mine`, which includes hidden ones). Matching by exact name and
 * owner id; two matches mean the seed can't tell which one it manages, so it
 * stops instead of guessing.
 */
export const findSeedPet = (
  ownPets: readonly Pet[],
  name: string,
  ownerId: string,
): Pet | undefined => {
  const matches = ownPets.filter(
    (pet) => pet.name === name && pet.owner === ownerId,
  );

  if (matches.length > 1) {
    throw new Error(
      `The owner has ${matches.length} pets named ${name}, so the seed can't tell which one is the demo pet. ` +
        'Rename or delete the extra one as that owner, then seed again.',
    );
  }

  return matches[0];
};

/**
 * Accepting an application auto-rejects every other pending application for
 * the pet. These are the ones that don't come from a demo account: if there
 * are any, the seed must not accept, because it would decide a real person's
 * application.
 */
export const pendingApplicationsOutsideSeed = (
  received: readonly ReceivedApplication[],
  petId: string,
  acceptedId: string,
  seedUserIds: ReadonlySet<string>,
): ReceivedApplication[] =>
  received.filter(
    (application) =>
      application.pet._id === petId &&
      application._id !== acceptedId &&
      application.status === 'pending' &&
      !seedUserIds.has(application.applicant._id),
  );
