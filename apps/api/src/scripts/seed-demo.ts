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

import { resolveSeedRun, type SeedTarget } from './demo-config';
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
  isRepeatSafeRequest,
  pendingApplicationsOutsideSeed,
} from './seed-guards';
import { sendWithRetry, waitUntilReady } from './seed-retry';

/**
 * Creates the portfolio demo data through the HTTP API, so it passes the same
 * validation, hashing, transactions and state machines as real use. Safe to
 * run again: each step first checks what already exists. It never deletes
 * anything (QA has pnpm qa:reset; development data is never reset by script).
 * Targets: pnpm dev:seed (--dev), pnpm qa:seed (--qa) or
 * pnpm prod:seed (--prod: a dry run unless both production confirmations are
 * given; then a read-only preflight runs first), see demo-config.ts.
 *
 * Photos: up to 5 per pet from apps/api/src/scripts/demo-images/, named
 * `max.jpg`, `max-2.webp` … (see demo-images.ts and pnpm demo:images).
 * They are uploaded only to pets that have no photos yet.
 *
 * Seed-managed data is what the demo accounts own or sent (seed-guards.ts).
 * The seed only sends the requests it needs (never deletes or edits), finds
 * pets among each owner's own pets, and doesn't accept an application if
 * that would auto-reject one from an account outside the demo data.
 *
 * Dry run (--dry-run): the same steps, but every change is listed instead of
 * sent; only reads and sign-ins go out. Transient failures are retried within
 * limits (seed-retry.ts); a change whose outcome is unknown stops the run.
 */

/** Set once at the start of main (see resolveSeedRun). */
let target: SeedTarget;
let demoPassword = '';
let dryRun = false;

/** A dry run's findings: changes it would make, and problems it found. */
const planned: string[] = [];
const conflicts: string[] = [];

/** One try may take this long; a timed-out change counts as uncertain. */
const REQUEST_TIMEOUT_MS = 60_000;
const READY_CHECK_INTERVAL_MS = 5_000;

// The development database has no reset command on purpose: it may hold
// the developer's own data. Production has none either.
const resetCommand = () =>
  target.name === 'qa'
    ? 'pnpm qa:reset --yes'
    : target.name === 'prod'
      ? 'fix it by hand as that account; production has no reset'
      : 'remove the conflicting data by hand; the development database has no reset command';

const rateLimitHint = () =>
  'Sign-in and registration are limited to 20 attempts per 15 minutes. ' +
  (target.name === 'prod'
    ? 'Wait 15 minutes and run it again.'
    : `Wait, or restart the API (${
        target.name === 'qa'
          ? 'pnpm qa:down, then pnpm qa:up'
          : 'restart pnpm nx serve @pet-adoption/api'
      }); the counters are kept in memory and the data stays.`);

type Session = { user: User; cookie: string };

type ApiResult<T> = { status: number; data: T; cookies: string[] };

/** A read the API answers without a session (probes before signing in). */
const probe = (apiPath: string) =>
  sendWithRetry('GET', apiPath, () =>
    fetch(`${target.apiUrl}${apiPath}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );

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

  // The last line of defence for a dry run: a change that slipped past the
  // dry-run branches below is refused here.
  if (dryRun && !isRepeatSafeRequest(method, apiPath)) {
    throw new Error(
      `A dry run never sends ${method} ${apiPath.split('?')[0]}.`,
    );
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

  const response = await sendWithRetry(method, apiPath, () =>
    fetch(`${target.apiUrl}${apiPath}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );
  const text = await response.text();

  return {
    status: response.status,
    data: parseJson(text) as T,
    cookies: response.headers.getSetCookie(),
  };
};

/** The body as JSON; `null` if it is empty or not JSON (e.g. a proxy's HTML error page). */
const parseJson = (text: string): unknown => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
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

/** A dry run lists the change instead of making it. */
const plan = (change: string) => {
  planned.push(change);
  console.log(`  ~ would ${change}`);
};

/**
 * Signs in, or registers the account if it doesn't exist yet. Signing in
 * first keeps reruns to one auth request per user (see the rate limit).
 *
 * An account counts as a demo account only if the seed's password signs in
 * to it, or if the seed just registered it. Registration is open and the demo
 * addresses are public, so an address registered with another password may
 * belong to someone else: the seed stops then, before it creates or decides
 * anything, and never changes that account.
 *
 * In a dry run, an account the password doesn't open is `null`: the API
 * answers a free address and one registered with another password the same
 * way, so only the real run can tell them apart.
 */
const signIn = async (key: UserKey): Promise<Session | null> => {
  const { name, email } = USERS[key];
  const loggedIn = await call<User>('/auth/login', {
    method: 'POST',
    json: { email, password: demoPassword },
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

  if (dryRun) {
    plan(
      `register ${email} (if the address is free; if it is taken, the real run stops here)`,
    );
    return null;
  }

  const registered = await call<User & { code?: string }>('/auth/register', {
    method: 'POST',
    json: { name, email, password: demoPassword },
  });

  if (registered.status === 429) {
    throw new Error(rateLimitHint());
  }

  if (registered.data?.code === 'EMAIL_ALREADY_REGISTERED') {
    throw new Error(
      `${email} is already registered, but not with the seed's password, so the seed can't tell ` +
        'whether it is a demo account. It stopped before creating any pets or applications, and left that account alone. ' +
        (target.name === 'prod'
          ? 'If it is yours, set DEMO_PASSWORD to its password; otherwise an admin should review that account, and the dataset needs another address for this user.'
          : `If it is yours, set DEMO_PASSWORD to its password; otherwise ${resetCommand()}.`),
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

const photoNote = (files: string[]) =>
  files.length > 0 ? ` with ${files.length} photo(s)` : '';

/**
 * Finds the owner's pet by exact name, or creates it; adds its demo photos.
 * `null` only in a dry run, for a pet that doesn't exist yet.
 */
const ensurePet = async (
  spec: PetSpec,
  owner: Session | null,
  existing: readonly Pet[],
): Promise<Pet | null> => {
  let pet = owner
    ? findSeedPet(existing, spec.name, owner.user._id)
    : undefined;
  const photos = findDemoImages(DEMO_IMAGE_DIR, spec.name);

  if (pet) {
    console.log(`  = pet ${spec.name}`);
  } else if (dryRun || !owner) {
    plan(`create pet ${spec.name}${photoNote(photos)}`);
    return null;
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
  const imageFiles = demoImagesToUpload(pet, photos);

  if (imageFiles.length > 0 && dryRun) {
    plan(`upload ${imageFiles.length} photo(s) to ${spec.name}`);
  } else if (imageFiles.length > 0 && owner) {
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

const decisionFor = (outcome: Outcome) =>
  outcome === 'accepted'
    ? 'accept'
    : outcome === 'rejected'
      ? 'reject'
      : outcome === 'withdrawn'
        ? 'withdraw'
        : undefined;

const labelOf = (spec: ApplicationSpec) => `${spec.applicant} → ${spec.pet}`;

/** Dry run: applications pass 1 would submit (pass 2 then plans the decision). */
const plannedSubmissions = new Set<string>();

/**
 * Pass 1: makes sure the application exists. All applications are submitted
 * before any decision, because accepting one adopts the pet, after which
 * nobody can apply for it.
 */
const ensureSubmitted = async (
  spec: ApplicationSpec,
  pet: Pet | null,
  applicant: Session | null,
): Promise<void> => {
  const label = labelOf(spec);
  const application =
    pet && applicant ? await newestApplication(applicant, pet._id) : undefined;

  // None yet, or only a withdrawn one that isn't the intended end state.
  if (
    !application ||
    (application.status === 'withdrawn' && spec.outcome !== 'withdrawn')
  ) {
    if (dryRun || !pet || !applicant) {
      plan(`submit application ${label}`);
      plannedSubmissions.add(label);
      return;
    }

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
  pet: Pet | null,
  applicant: Session | null,
  owner: Session | null,
  seedUserIds: ReadonlySet<string>,
): Promise<void> => {
  const label = labelOf(spec);
  const action = decisionFor(spec.outcome);

  // Dry run: the application doesn't exist yet. Whether an accept would be
  // skipped can only be checked once it does.
  if (plannedSubmissions.has(label) || !pet || !applicant || !owner) {
    if (action) {
      plan(`${action} application ${label}`);
    }
    return;
  }

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
      const message =
        `accept ${label} skipped: it would auto-reject ${outside.length} pending application(s) ` +
        'from accounts outside the demo data.';
      console.warn(`  ! ${message}`);
      conflicts.push(message);
      return;
    }
  }

  if (action && dryRun) {
    plan(`${action} application ${label}`);
  } else if (action) {
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
const checkApiSupportsDemoData = async () => {
  const fix =
    target.name === 'dev'
      ? 'Restart "pnpm nx serve @pet-adoption/api" with the current code.'
      : target.name === 'qa'
        ? 'Rebuild it with "pnpm qa:up".'
        : 'Deploy the current code first.';
  const species = [...new Set(PETS.map((pet) => pet.species))];

  for (const value of species) {
    const response = await probe(`/pets?species=${value}&pageSize=1`);

    if (response.status === 400) {
      throw new Error(
        `The API at ${target.apiUrl} rejects the species "${value}", so it runs older code than this seed. ${fix}`,
      );
    }
  }

  // Signed out, /pets/mine answers 401. Older code reads "mine" as a pet id.
  const mine = await probe('/pets/mine');

  if (mine.status !== 401) {
    throw new Error(
      `The API at ${target.apiUrl} has no /pets/mine (HTTP ${mine.status}), so it runs older code than this seed. ${fix}`,
    );
  }
};

const LABELS: Record<SeedTarget['name'], string> = {
  dev: 'development API: the database in apps/api/.env',
  qa: 'Docker QA stack',
  prod: 'live demo',
};

const START_HINTS: Record<SeedTarget['name'], string> = {
  dev: 'Start it with "pnpm nx serve @pet-adoption/api".',
  qa: 'Start it with "pnpm qa:up".',
  prod: 'It may still be waking up (Render Free) or down; check the site and try again later.',
};

/**
 * One pass over the dataset: accounts, pets, applications, then the final
 * check. In a dry run it only reads and lists changes; otherwise it makes
 * them. Returns the applications whose state differs from the dataset
 * (a dry run leaves out what the planned changes would still settle).
 */
const seedPass = async (): Promise<string[]> => {
  planned.length = 0;
  conflicts.length = 0;
  plannedSubmissions.clear();

  const sessions = {} as Record<UserKey, Session | null>;

  for (const key of Object.keys(USERS) as UserKey[]) {
    sessions[key] = await signIn(key);
  }

  const seedUserIds = new Set(
    Object.values(sessions).flatMap((session) =>
      session ? [session.user._id] : [],
    ),
  );
  const existingPets = new Map<UserKey, Pet[]>();
  const pets = new Map<string, Pet | null>();

  for (const spec of PETS) {
    const owner = sessions[spec.owner];

    if (owner && !existingPets.has(spec.owner)) {
      existingPets.set(spec.owner, await ownPets(owner));
    }

    pets.set(
      spec.name,
      await ensurePet(spec, owner, existingPets.get(spec.owner) ?? []),
    );
  }

  const ownerOf = (petName: string) =>
    sessions[PETS.find((pet) => pet.name === petName)?.owner ?? 'ana'];

  const petFor = (spec: ApplicationSpec): Pet | null => {
    const pet = pets.get(spec.pet);

    if (pet === undefined) {
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
  // A dry run leaves out what the planned changes would still settle.
  const mismatches: string[] = [];

  for (const spec of APPLICATIONS) {
    const pet = pets.get(spec.pet);
    const applicant = sessions[spec.applicant];
    const label = labelOf(spec);

    if (dryRun && (!pet || !applicant || plannedSubmissions.has(label))) {
      continue;
    }

    const application =
      pet && applicant
        ? await newestApplication(applicant, pet._id)
        : undefined;
    const expected = expectedStatus(spec.outcome);

    if (dryRun && application?.status === 'pending') {
      continue;
    }

    if (application?.status !== expected) {
      mismatches.push(
        `${label}: expected ${expected}, found ${application?.status ?? 'none'}`,
      );
    }
  }

  return mismatches;
};

const main = async () => {
  ({
    target,
    dryRun,
    password: demoPassword,
  } = resolveSeedRun(process.argv, process.env, QA_API_URL));

  console.log(
    dryRun
      ? `Dry run (nothing is changed) through ${target.apiUrl} (${LABELS[target.name]})`
      : target.confirmHost
        ? `CONFIRMED RUN: changing data on ${target.apiUrl} (${LABELS[target.name]}), after a read-only preflight`
        : `Seeding demo data through ${target.apiUrl} (${LABELS[target.name]})`,
  );

  try {
    const checks = await waitUntilReady(
      async () => (await probe('/ready')).status === 200,
      {
        timeoutMs: target.startupTimeoutMs,
        intervalMs: READY_CHECK_INTERVAL_MS,
      },
    );
    console.log(`  API ready (${checks} check(s))`);
  } catch (error) {
    throw new Error(
      `The API at ${target.apiUrl} is not reachable or not ready. ${START_HINTS[target.name]} ` +
        `(${error instanceof Error ? error.message : error})`,
    );
  }

  await checkApiSupportsDemoData();
  console.log('  API supports the demo data and /pets/mine');

  // A confirmed production run first makes the whole pass as a dry run and
  // changes nothing unless that is clean: conflicts there (a duplicate pet,
  // an accept a visitor's application blocks, a decision that ended
  // differently) are for a person to resolve, not the seed.
  if (target.confirmHost && !dryRun) {
    console.log('\nPreflight (read-only):');
    dryRun = true;
    const preflightMismatches = await seedPass();
    dryRun = false;
    const problems = [...conflicts, ...preflightMismatches];

    if (problems.length > 0) {
      throw new Error(
        `The preflight found ${problems.length} problem(s), so nothing was changed:\n  ${problems.join('\n  ')}\n` +
          'Resolve them by hand, run pnpm prod:seed (dry run) until it reports none, then confirm again.',
      );
    }

    console.log(
      `Preflight clean: ${planned.length} change(s) to make.\n\nSeeding:`,
    );
  }

  const mismatches = await seedPass();

  if (dryRun) {
    const problems = [...conflicts, ...mismatches];

    console.log(
      `\nDry run finished: nothing was changed on ${target.apiUrl}.\n` +
        `Changes a real run would make (${planned.length}):` +
        (planned.length > 0 ? `\n  ${planned.join('\n  ')}` : ' none') +
        `\nProblems (${problems.length}):` +
        (problems.length > 0 ? `\n  ${problems.join('\n  ')}` : ' none'),
    );

    if (problems.length > 0) {
      process.exitCode = 1;
    }

    return;
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
