import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ApplicationStatus,
  MyApplication,
  Paginated,
  Pet,
  PetSpecies,
  User,
} from '@pet-adoption/models';

import { DEMO_API_URL } from './demo-config';

/**
 * Creates the portfolio demo data through the HTTP API, so it passes the same
 * validation, hashing, transactions and state machines as real use. Safe to
 * run again: each step first checks what already exists. It never deletes
 * anything (see reset-demo.ts).
 *
 * Optional photos: put `<pet name in lowercase>.jpg|.png|.webp` files in
 * apps/api/src/scripts/demo-images/ (own or CC0 photos, metadata removed).
 */

/** Demo-only password for every demo account (documented in the README). */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password';

const IMAGE_DIR = path.resolve('apps/api/src/scripts/demo-images');
const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const;

// `example.com` is reserved for examples, so these can't be real addresses.
const USERS = {
  ana: { name: 'Ana Petrović', email: 'ana@demo.example.com' },
  marko: { name: 'Marko Jovanović', email: 'marko@demo.example.com' },
  jelena: { name: 'Jelena Nikolić', email: 'jelena@demo.example.com' },
  luka: { name: 'Luka Ilić', email: 'luka@demo.example.com' },
} as const;

type UserKey = keyof typeof USERS;

type PetSpec = {
  owner: UserKey;
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
};

// 14 pets: more than one page of the pet list (12 per page). Similar names
// (Max/Maxi, Bella/Bello) make search easy to show.
const PETS: PetSpec[] = [
  {
    owner: 'ana',
    name: 'Max',
    species: 'dog',
    age: 3,
    description: 'Energetic Labrador mix who loves fetch and long walks.',
  },
  {
    owner: 'ana',
    name: 'Maxi',
    species: 'dog',
    age: 1,
    description: 'Playful terrier puppy, learning to walk on a leash.',
  },
  {
    owner: 'ana',
    name: 'Bella',
    species: 'cat',
    age: 2,
    description: 'Calm tabby who enjoys sunny windowsills.',
  },
  {
    owner: 'ana',
    name: 'Luna',
    species: 'cat',
    age: 5,
    description: 'Shy at first, very affectionate once she knows you.',
  },
  {
    owner: 'ana',
    name: 'Rex',
    species: 'dog',
    age: 7,
    description: 'Gentle German Shepherd, good with children.',
  },
  {
    owner: 'ana',
    name: 'Mila',
    species: 'cat',
    age: 0,
    description: 'Curious kitten, litter-trained.',
  },
  {
    owner: 'ana',
    name: 'Kiki',
    species: 'other',
    age: 2,
    description: 'Talkative budgie who whistles in the morning.',
  },
  {
    owner: 'ana',
    name: 'Toby',
    species: 'dog',
    age: 10,
    description: 'Senior beagle looking for a quiet home.',
  },
  {
    owner: 'ana',
    name: 'Nala',
    species: 'cat',
    age: 4,
    description: 'Independent cat, happy as the only pet.',
  },
  {
    owner: 'marko',
    name: 'Bello',
    species: 'dog',
    age: 6,
    description: 'Friendly mixed breed, house-trained.',
  },
  {
    owner: 'marko',
    name: 'Coco',
    species: 'other',
    age: 1,
    description: 'Gentle rabbit who likes fresh greens.',
  },
  {
    owner: 'marko',
    name: 'Oscar',
    species: 'cat',
    age: 12,
    description: 'Relaxed senior cat who loves naps.',
  },
  {
    owner: 'marko',
    name: 'Daisy',
    species: 'dog',
    age: 2,
    description: 'Small poodle mix with lots of energy.',
  },
  {
    owner: 'marko',
    name: 'Pip',
    species: 'other',
    age: 0,
    description: 'Young hamster, active in the evenings.',
  },
];

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

  const response = await fetch(`${DEMO_API_URL}${apiPath}`, {
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

const rateLimitHint =
  'Sign-in and registration are limited to 20 attempts per 15 minutes. ' +
  'Wait, or restart the demo API (the counters are kept in memory).';

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
    throw new Error(rateLimitHint);
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
    throw new Error(rateLimitHint);
  }

  if (registered.data?.code === 'EMAIL_ALREADY_REGISTERED') {
    throw new Error(
      `${email} exists with a different password. Reset the demo (pnpm demo:reset --yes) or set DEMO_PASSWORD.`,
    );
  }

  const user = expectStatus(registered, [201], `Registering ${email}`);
  console.log(`  + user ${email}`);

  return { user, cookie: sessionCookie(registered.cookies) };
};

const findImage = (petName: string): string | undefined =>
  Object.keys(IMAGE_TYPES)
    .map((extension) =>
      path.join(IMAGE_DIR, `${petName.toLowerCase()}${extension}`),
    )
    .find((file) => existsSync(file));

/** Finds the owner's pet by exact name, or creates it; adds a photo if one exists. */
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
        },
      }),
      [201],
      `Creating ${spec.name}`,
    );
    console.log(`  + pet ${spec.name}`);
  }

  const imageFile = pet.imageUrl ? undefined : findImage(spec.name);

  if (imageFile) {
    const type =
      IMAGE_TYPES[path.extname(imageFile) as keyof typeof IMAGE_TYPES];
    const form = new FormData();
    form.append(
      'image',
      new Blob([readFileSync(imageFile)], { type }),
      path.basename(imageFile),
    );

    pet = expectStatus(
      await call<Pet>(`/pets/${pet._id}/image`, {
        method: 'PUT',
        session: owner,
        form,
      }),
      [200],
      `Uploading the photo of ${spec.name}`,
    );
    console.log(`    + photo ${path.basename(imageFile)}`);
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

const main = async () => {
  const allowDevPort = process.argv.includes('--allow-port-3333');

  if (new URL(DEMO_API_URL).port === '3333' && !allowDevPort) {
    throw new Error(
      `${DEMO_API_URL} is the development/Docker API, which may hold your own data. ` +
        'Only seed it if that stack contains nothing but demo data, and pass --allow-port-3333.',
    );
  }

  console.log(`Seeding demo data through ${DEMO_API_URL}`);

  try {
    await fetch(`${DEMO_API_URL}/health`);
  } catch {
    throw new Error(
      `The API at ${DEMO_API_URL} is not reachable. Start it with "pnpm demo:start".`,
    );
  }

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
        'Run "pnpm demo:reset --yes" and seed again to restore it.',
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
