import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ApplicationStatus,
  MyApplication,
  Paginated,
  Pet,
  User,
} from '@pet-adoption/models';

import { DEV_API_URL, resolveSeedTarget } from './demo-config';
import { PETS, USERS, type PetSpec, type UserKey } from './demo-data';
import {
  DEMO_IMAGE_DIR,
  demoImagesToUpload,
  demoImageType,
  findDemoImages,
} from './demo-images';
import { QA_API_URL } from './qa-config';

/**
 * Creates the portfolio demo data through the HTTP API, so it passes the same
 * validation, hashing, transactions and state machines as real use. Safe to
 * run again: each step first checks what already exists. It never deletes
 * anything (see reset-demo.ts).
 *
 * Photos: up to 5 per pet from apps/api/src/scripts/demo-images/, named
 * `max.jpg`, `max-2.webp` … (see demo-images.ts and pnpm demo:images).
 * They are uploaded only to pets that have no photos yet.
 */

/** Demo-only password for every demo account (documented in the README). */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password';

/** `autoRejected`: ends rejected because another application was accepted. */
type Outcome = ApplicationStatus | 'autoRejected';

type ApplicationSpec = {
  pet: string;
  applicant: UserKey;
  outcome: Outcome;
};

// Order matters: an accept must come after the applications it auto-rejects.
// Ana receives 11 applications: more than one page (10 per page).
const APPLICATIONS: ApplicationSpec[] = [
  { pet: 'Max', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Maxi', applicant: 'jelena', outcome: 'accepted' },
  { pet: 'Maxi', applicant: 'luka', outcome: 'autoRejected' },
  { pet: 'Bella', applicant: 'luka', outcome: 'rejected' },
  { pet: 'Luna', applicant: 'jelena', outcome: 'withdrawn' },
  { pet: 'Rex', applicant: 'luka', outcome: 'pending' },
  { pet: 'Rex', applicant: 'marko', outcome: 'pending' },
  { pet: 'Mila', applicant: 'marko', outcome: 'pending' },
  { pet: 'Kiki', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Toby', applicant: 'luka', outcome: 'pending' },
  { pet: 'Nala', applicant: 'jelena', outcome: 'pending' },
  { pet: 'Oscar', applicant: 'luka', outcome: 'accepted' },
  { pet: 'Pip', applicant: 'jelena', outcome: 'pending' },
];

const messageFor = (petName: string) =>
  `Hello! I would love to give ${petName} a loving home. I have experience with pets and time to care for them.`;

/** The API this run seeds; set once at the start (see resolveSeedTarget). */
let apiUrl = '';

// The development database has no reset command on purpose: it may hold
// the developer's own data.
const resetCommand = () =>
  apiUrl === QA_API_URL
    ? 'pnpm qa:reset --yes'
    : apiUrl === DEV_API_URL
      ? 'remove the conflicting data by hand; the development database has no reset command'
      : 'pnpm demo:reset --yes';

const restartCommand = () =>
  apiUrl === QA_API_URL
    ? 'pnpm qa:down, then pnpm qa:up'
    : apiUrl === DEV_API_URL
      ? 'restart pnpm nx serve @pet-adoption/api'
      : 'restart pnpm demo:start';

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
    method: options.method ?? 'GET',
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
      `${email} exists with a different password. Reset it (${resetCommand()}) or set DEMO_PASSWORD.`,
    );
  }

  const user = expectStatus(registered, [201], `Registering ${email}`);
  console.log(`  + user ${email}`);

  return { user, cookie: sessionCookie(registered.cookies) };
};

/** Finds the owner's pet by exact name, or creates it; adds its demo photos. */
const ensurePet = async (spec: PetSpec, owner: Session): Promise<Pet> => {
  const page = expectStatus(
    await call<Paginated<Pet>>(
      `/pets?search=${encodeURIComponent(spec.name)}&pageSize=50`,
    ),
    [200],
    `Looking up ${spec.name}`,
  );
  let pet = page.items.find(
    (item) => item.name === spec.name && item.owner === owner.user._id,
  );

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
        json: { message: messageFor(spec.pet) },
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

/** Pass 2: accepts, rejects or withdraws a still-pending application. */
const ensureDecided = async (
  spec: ApplicationSpec,
  pet: Pet,
  applicant: Session,
  owner: Session,
): Promise<void> => {
  const label = `${spec.applicant} → ${spec.pet}`;
  const application = await newestApplication(applicant, pet._id);

  if (application?.status !== 'pending') {
    return;
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
  const species = [...new Set(PETS.map((pet) => pet.species))];

  for (const value of species) {
    const response = await fetch(`${apiUrl}/pets?species=${value}&pageSize=1`);

    if (response.status === 400) {
      throw new Error(
        `The API at ${apiUrl} rejects the species "${value}", so it runs older code than this seed. ` +
          (isDev
            ? 'Port 3333 is probably the Docker app stack: check with "docker compose --profile app ps", stop it with "docker compose --profile app stop", then start "pnpm nx serve @pet-adoption/api".'
            : 'Rebuild or restart that API.'),
      );
    }
  }
};

const main = async () => {
  const isQa = process.argv.includes('--qa');
  const isDev = process.argv.includes('--dev');
  apiUrl = resolveSeedTarget(process.argv, process.env, QA_API_URL);

  const label = isQa
    ? ' (Docker QA stack)'
    : isDev
      ? ' (development API: the database in apps/api/.env)'
      : '';
  console.log(`Seeding demo data through ${apiUrl}${label}`);

  const startCommand = isQa
    ? 'pnpm qa:up'
    : isDev
      ? 'pnpm nx serve @pet-adoption/api'
      : 'pnpm demo:start';

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

  const pets = new Map<string, Pet>();

  for (const spec of PETS) {
    pets.set(spec.name, await ensurePet(spec, sessions[spec.owner]));
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
