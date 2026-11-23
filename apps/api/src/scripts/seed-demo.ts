import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ApplicationStatus,
  MyApplication,
  Paginated,
  Pet,
  ReceivedApplication,
  User,
} from '@pet-adoption/models';

import { resolveDemoPassword, resolveSeedTarget } from './demo-config';
import {
  APPLICATIONS,
  applicationMessage,
  PETS,
  USERS,
  type ApplicationSpec,
  type Outcome,
  type PetSpec,
  type UserKey,
} from './demo-data';
import {
  DEMO_IMAGE_DIR,
  demoImagesToUpload,
  demoImageType,
  findDemoImages,
} from './demo-images';
import { QA_API_URL } from './qa-config';
import {
  findSeedPet,
  isAllowedSeedRequest,
  pendingApplicationsOutsideSeed,
} from './seed-guards';

/**
 * Creates the portfolio demo data through the HTTP API, so it passes the same
 * validation, hashing, transactions and state machines as real use. Safe to
 * run again: each step first checks what already exists. It never deletes
 * anything (QA has pnpm qa:reset; development data is never reset by script).
 * Targets: pnpm dev:seed (--dev) or pnpm qa:seed (--qa), see demo-config.ts.
 *
 * Photos: up to 5 per pet from apps/api/src/scripts/demo-images/, named
 * `max.jpg`, `max-2.webp` … (see demo-images.ts and pnpm demo:images).
 * They are uploaded only to pets that have no photos yet.
 *
 * Seed-managed data is what the demo accounts own or sent (seed-guards.ts).
 * The seed only sends the requests it needs (never deletes or edits), finds
 * pets among each owner's own pets, and doesn't accept an application if
 * that would auto-reject one from an account outside the demo data.
 */

/** The demo accounts' password (dev and QA: the public one in the README). */
const DEMO_PASSWORD = resolveDemoPassword(process.env, {
  publicDefaultAllowed: true,
});

/** The API this run seeds; set once at the start (see resolveSeedTarget). */
let apiUrl = '';

// The development database has no reset command on purpose: it may hold
// the developer's own data.
const resetCommand = () =>
  apiUrl === QA_API_URL
    ? 'pnpm qa:reset --yes'
    : 'remove the conflicting data by hand; the development database has no reset command';

const restartCommand = () =>
  apiUrl === QA_API_URL
    ? 'pnpm qa:down, then pnpm qa:up'
    : 'restart pnpm nx serve @pet-adoption/api';

type Session = { user: User; cookie: string };

type ApiResult<T> = { status: number; data: T; cookies: string[] };

const call = async <T = unknown>(
  apiPath: string,
  options: {
    method?: string;
    session?: Session;
    json?: unknown;
    form?: FormData;
  } = {},
): Promise<ApiResult<T>> => {
  const method = options.method ?? 'GET';

  if (!isAllowedSeedRequest(method, apiPath)) {
    throw new Error(`The seed never sends ${method} ${apiPath.split('?')[0]}.`);
  }

  const headers: Record<string, string> = {};
  let body: string | FormData | undefined;

  if (options.session) {
    headers.Cookie = options.session.cookie;
  }

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  const response = await fetch(`${apiUrl}${apiPath}`, {
    method,
    headers,
    body,
  });
  const text = await response.text();

  return {
    status: response.status,
    data: (text ? JSON.parse(text) : null) as T,
    cookies: response.headers.getSetCookie(),
  };
};

const expectStatus = <T>(
  result: ApiResult<T>,
  expected: number[],
  what: string,
): T => {
  if (!expected.includes(result.status)) {
    throw new Error(
      `${what} failed: HTTP ${result.status} ${JSON.stringify(result.data)}`,
    );
  }

  return result.data;
};

const sessionCookie = (cookies: string[]): string => {
  const sid = cookies.find((cookie) => cookie.startsWith('sid='));

  if (!sid) {
    throw new Error('The API did not return a session cookie.');
  }

  return sid.split(';')[0];
};

const rateLimitHint = () =>
  'Sign-in and registration are limited to 20 attempts per 15 minutes. ' +
  `Wait, or restart the API (${restartCommand()}); the counters are kept in memory and the data stays.`;

/**
 * Signs in, or registers the account if it doesn't exist yet. Signing in
 * first keeps reruns to one auth request per user (see the rate limit).
 *
 * An account counts as a demo account only if the seed's password signs in
 * to it, or if the seed just registered it. Registration is open and the demo
 * addresses are public, so an address registered with another password may
 * belong to someone else: the seed stops then, before it creates or decides
 * anything, and never changes that account.
 */
const signIn = async (key: UserKey): Promise<Session> => {
  const { name, email } = USERS[key];
  const loggedIn = await call<User>('/auth/login', {
    method: 'POST',
    json: { email, password: DEMO_PASSWORD },
  });

  if (loggedIn.status === 429) {
    throw new Error(rateLimitHint());
  }

  if (loggedIn.status === 200) {
    console.log(`  = user ${email}`);
    return { user: loggedIn.data, cookie: sessionCookie(loggedIn.cookies) };
  }

  if (
    (loggedIn.data as { code?: string } | null)?.code === 'ACCOUNT_SUSPENDED'
  ) {
    throw new Error(
      `${email} is suspended. The seed doesn't change accounts; an admin can reinstate it.`,
    );
  }

  expectStatus(loggedIn, [401], `Signing in ${email}`);

  const registered = await call<User & { code?: string }>('/auth/register', {
    method: 'POST',
    json: { name, email, password: DEMO_PASSWORD },
  });

  if (registered.status === 429) {
    throw new Error(rateLimitHint());
  }

  if (registered.data?.code === 'EMAIL_ALREADY_REGISTERED') {
    throw new Error(
      `${email} is already registered, but not with the seed's password, so the seed can't tell ` +
        'whether it is a demo account. It stopped before creating any pets or applications, and left that account alone. ' +
        `If it is yours, set DEMO_PASSWORD to its password; otherwise ${resetCommand()}.`,
    );
  }

  const user = expectStatus(registered, [201], `Registering ${email}`);
  console.log(`  + user ${email}`);

  return { user, cookie: sessionCookie(registered.cookies) };
};

/** Every page of a paginated list the session can read. */
const listAll = async <T>(apiPath: string, session: Session, what: string) => {
  const items: T[] = [];

  for (let page = 1; ; page += 1) {
    const result = expectStatus(
      await call<Paginated<T>>(`${apiPath}?page=${page}&pageSize=50`, {
        session,
      }),
      [200],
      what,
    );
    items.push(...result.items);

    if (page >= result.totalPages) {
      return items;
    }
  }
};

/**
 * The owner's own pets, hidden ones included. The public list leaves hidden
 * pets out, so looking there would create a second copy of a hidden demo pet.
 */
const ownPets = (owner: Session) =>
  listAll<Pet>('/pets/mine', owner, `Listing the pets of ${owner.user.email}`);

/** Finds the owner's pet by exact name, or creates it; adds its demo photos. */
const ensurePet = async (
  spec: PetSpec,
  owner: Session,
  existing: readonly Pet[],
): Promise<Pet> => {
  let pet = findSeedPet(existing, spec.name, owner.user._id);

  if (pet) {
    console.log(`  = pet ${spec.name}`);
  } else {
    pet = expectStatus(
      await call<Pet>('/pets', {
        method: 'POST',
        session: owner,
        json: {
          name: spec.name,
          species: spec.species,
          age: spec.age,
          description: spec.description,
          sex: spec.sex,
          breed: spec.breed,
          compatibility: spec.compatibility,
          aloneTime: spec.aloneTime,
        },
      }),
      [201],
      `Creating ${spec.name}`,
    );
    console.log(`  + pet ${spec.name}`);
  }

  // All of a pet's photos in one request: they are stored all together or
  // not at all. Pets that already have photos are left alone.
  const imageFiles = demoImagesToUpload(
    pet,
    findDemoImages(DEMO_IMAGE_DIR, spec.name),
  );

  if (imageFiles.length > 0) {
    const form = new FormData();

    for (const fileName of imageFiles) {
      form.append(
        'images',
        new Blob([readFileSync(path.join(DEMO_IMAGE_DIR, fileName))], {
          type: demoImageType(fileName),
        }),
        fileName,
      );
    }

    pet = expectStatus(
      await call<Pet>(`/pets/${pet._id}/images`, {
        method: 'POST',
        session: owner,
        form,
      }),
      [200],
      `Uploading the photos of ${spec.name}`,
    );
    console.log(`    + photos ${imageFiles.join(', ')}`);
  }

  return pet;
};

/** The applicant's newest application for the pet, if any. */
const newestApplication = async (
  applicant: Session,
  petId: string,
): Promise<MyApplication | undefined> =>
  expectStatus(
    await call<Paginated<MyApplication>>(
      `/applications/mine?pet=${petId}&pageSize=1`,
      { session: applicant },
    ),
    [200],
    'Looking up an application',
  ).items[0];

const expectedStatus = (outcome: Outcome): ApplicationStatus =>
  outcome === 'autoRejected' ? 'rejected' : outcome;

/**
 * Pass 1: makes sure the application exists. All applications are submitted
 * before any decision, because accepting one adopts the pet, after which
 * nobody can apply for it.
 */
const ensureSubmitted = async (
  spec: ApplicationSpec,
  pet: Pet,
  applicant: Session,
): Promise<void> => {
  const label = `${spec.applicant} → ${spec.pet}`;
  const application = await newestApplication(applicant, pet._id);

  // None yet, or only a withdrawn one that isn't the intended end state.
  if (
    !application ||
    (application.status === 'withdrawn' && spec.outcome !== 'withdrawn')
  ) {
    const result = await call<{ code?: string }>(
      `/pets/${pet._id}/applications`,
      {
        method: 'POST',
        session: applicant,
        json: { message: applicationMessage(spec.pet) },
      },
    );

    // Already adopted (e.g. an earlier run stopped half-way): the final
    // check reports it.
    if (result.data?.code === 'PET_NOT_AVAILABLE') {
      console.warn(
        `  ! application ${label}: ${spec.pet} is no longer available`,
      );
      return;
    }

    expectStatus(result, [201], `Applying (${label})`);
    console.log(`  + application ${label}`);
  }
};

/**
 * Pass 2: accepts, rejects or withdraws a still-pending application. The
 * application is the demo applicant's own (from their /applications/mine)
 * for a demo owner's pet. Rejecting or withdrawing changes only that
 * application; accepting also auto-rejects the pet's other pending ones, so
 * it is skipped (and reported by the final check) if any of those comes
 * from an account outside the demo data.
 */
const ensureDecided = async (
  spec: ApplicationSpec,
  pet: Pet,
  applicant: Session,
  owner: Session,
  seedUserIds: ReadonlySet<string>,
): Promise<void> => {
  const label = `${spec.applicant} → ${spec.pet}`;

  if (pet.owner !== owner.user._id) {
    throw new Error(`${spec.pet} is not owned by ${owner.user.email}.`);
  }

  const application = await newestApplication(applicant, pet._id);

  if (application?.status !== 'pending') {
    return;
  }

  if (spec.outcome === 'accepted') {
    const outside = pendingApplicationsOutsideSeed(
      await listAll<ReceivedApplication>(
        '/applications/received',
        owner,
        `Listing the applications for ${owner.user.email}'s pets`,
      ),
      pet._id,
      application._id,
      seedUserIds,
    );

    // Only a count: the other applicants' names and emails stay out of logs.
    if (outside.length > 0) {
      console.warn(
        `  ! accept ${label} skipped: it would auto-reject ${outside.length} pending application(s) ` +
          'from accounts outside the demo data.',
      );
      return;
    }
  }

  const action =
    spec.outcome === 'accepted'
      ? 'accept'
      : spec.outcome === 'rejected'
        ? 'reject'
        : spec.outcome === 'withdrawn'
          ? 'withdraw'
          : undefined;

  if (action) {
    expectStatus(
      await call(`/applications/${application._id}/${action}`, {
        method: 'POST',
        session: action === 'withdraw' ? applicant : owner,
      }),
      [200],
      `${action} (${label})`,
    );
    console.log(`    ${expectedStatus(spec.outcome)}`);
  }
};

/**
 * Refuses to seed an API that runs older code than this script: it would
 * reject part of the data halfway through (e.g. a species added later). On
 * port 3333 that usually means the Docker app stack, built from an older
 * commit, is answering instead of the development API.
 */
const checkApiSupportsDemoData = async (isDev: boolean) => {
  const fix = isDev
    ? 'Restart "pnpm nx serve @pet-adoption/api" with the current code.'
    : 'Rebuild it with "pnpm qa:up".';
  const species = [...new Set(PETS.map((pet) => pet.species))];

  for (const value of species) {
    const response = await fetch(`${apiUrl}/pets?species=${value}&pageSize=1`);

    if (response.status === 400) {
      throw new Error(
        `The API at ${apiUrl} rejects the species "${value}", so it runs older code than this seed. ${fix}`,
      );
    }
  }

  // Signed out, /pets/mine answers 401. Older code reads "mine" as a pet id.
  const mine = await fetch(`${apiUrl}/pets/mine`);

  if (mine.status !== 401) {
    throw new Error(
      `The API at ${apiUrl} has no /pets/mine (HTTP ${mine.status}), so it runs older code than this seed. ${fix}`,
    );
  }
};

const main = async () => {
  const isQa = process.argv.includes('--qa');
  const isDev = process.argv.includes('--dev');
  apiUrl = resolveSeedTarget(process.argv, process.env, QA_API_URL);

  const label = isQa
    ? ' (Docker QA stack)'
    : ' (development API: the database in apps/api/.env)';
  console.log(`Seeding demo data through ${apiUrl}${label}`);

  const startCommand = isQa ? 'pnpm qa:up' : 'pnpm nx serve @pet-adoption/api';

  try {
    await fetch(`${apiUrl}/health`);
  } catch {
    throw new Error(
      `The API at ${apiUrl} is not reachable. Start it with "${startCommand}".`,
    );
  }

  await checkApiSupportsDemoData(isDev);

  const sessions = {} as Record<UserKey, Session>;

  for (const key of Object.keys(USERS) as UserKey[]) {
    sessions[key] = await signIn(key);
  }

  const seedUserIds = new Set(
    Object.values(sessions).map((session) => session.user._id),
  );
  const existingPets = new Map<UserKey, Pet[]>();
  const pets = new Map<string, Pet>();

  for (const spec of PETS) {
    const owner = sessions[spec.owner];

    if (!existingPets.has(spec.owner)) {
      existingPets.set(spec.owner, await ownPets(owner));
    }

    pets.set(
      spec.name,
      await ensurePet(spec, owner, existingPets.get(spec.owner) ?? []),
    );
  }

  const ownerOf = (petName: string) =>
    sessions[PETS.find((pet) => pet.name === petName)?.owner ?? 'ana'];

  const petFor = (spec: ApplicationSpec): Pet => {
    const pet = pets.get(spec.pet);

    if (!pet) {
      throw new Error(`Unknown demo pet ${spec.pet}`);
    }

    return pet;
  };

  for (const spec of APPLICATIONS) {
    await ensureSubmitted(spec, petFor(spec), sessions[spec.applicant]);
  }

  for (const spec of APPLICATIONS) {
    await ensureDecided(
      spec,
      petFor(spec),
      sessions[spec.applicant],
      ownerOf(spec.pet),
      seedUserIds,
    );
  }

  // Decisions are final, so data changed by hand can't be repaired; report it.
  const mismatches: string[] = [];

  for (const spec of APPLICATIONS) {
    const pet = pets.get(spec.pet);
    const application = pet
      ? await newestApplication(sessions[spec.applicant], pet._id)
      : undefined;
    const expected = expectedStatus(spec.outcome);

    if (application?.status !== expected) {
      mismatches.push(
        `${spec.applicant} → ${spec.pet}: expected ${expected}, found ${application?.status ?? 'none'}`,
      );
    }
  }

  if (mismatches.length > 0) {
    console.warn(
      `\nSome demo data differs from the intended state (changed by hand?):\n  ${mismatches.join('\n  ')}\n` +
        `Run "${resetCommand()}" and seed again to restore it.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nDone: ${Object.keys(USERS).length} users, ${PETS.length} pets, ${APPLICATIONS.length} applications.\n` +
      `Sign in as any of ${Object.values(USERS)
        .map((user) => user.email)
        .join(', ')} with the demo password.`,
  );
};

main().catch((error: unknown) => {
  console.error(`\n[ seed ] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
