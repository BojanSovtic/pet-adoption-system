import { createHash, createHmac } from 'node:crypto';
import { Types, type ClientSession, type QueryFilter } from 'mongoose';
import {
  ADMIN_CHANGE_ACTIONS,
  type AdminAuditAction,
  type AdminAuditEntry,
  type AdminAuditMetadata,
  type AdminAuditOutcome,
  type AdminAuditSource,
  type Paginated,
} from '@pet-adoption/models';

import { readAuditKey } from '../config/env-file';
import { withTransaction } from '../config/database';
import { AppError } from '../errors/app-error';
import {
  AdminAuditModel,
  AUDIT_CHAIN_HEAD_ID,
  AUDIT_GENESIS_HASH,
  AuditChainHeadModel,
  type AdminAuditRecord,
} from './admin-audit.model';

export type AuditEvent = {
  action: AdminAuditAction;
  actorId?: string;
  targetUserId?: string;
  targetPetId?: string;
  metadata?: AdminAuditMetadata;
  source: AdminAuditSource;
};

type HashedFields = Pick<
  AdminAuditRecord,
  | 'seq'
  | 'action'
  | 'outcome'
  | 'actor'
  | 'targetUser'
  | 'targetPet'
  | 'metadata'
  | 'source'
  | 'createdAt'
  | 'prevHash'
>;

/** Same JSON for the same entry, whatever order MongoDB returns keys in. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }

  return value;
};

/** The entry's hash: HMAC-SHA256 with AUDIT_HMAC_KEY, else SHA-256. */
export const hashAuditEntry = (
  fields: HashedFields,
  key: string | null,
): string => {
  const text = JSON.stringify([
    fields.seq,
    fields.action,
    fields.outcome,
    fields.actor?.toString() ?? null,
    fields.targetUser?.toString() ?? null,
    fields.targetPet?.toString() ?? null,
    canonical(fields.metadata ?? {}),
    fields.source,
    fields.createdAt.toISOString(),
    fields.prevHash,
  ]);

  return key
    ? createHmac('sha256', key).update(text).digest('hex')
    : createHash('sha256').update(text).digest('hex');
};

/**
 * Creates the chain head if needed. Run before a transaction that appends:
 * outside a transaction MongoDB retries concurrent upserts of the same _id,
 * so two first-ever appends can't fail with a duplicate key.
 */
export const prepareAudit = async (): Promise<void> => {
  await AuditChainHeadModel.updateOne(
    { _id: AUDIT_CHAIN_HEAD_ID },
    { $setOnInsert: { seq: 0, hash: AUDIT_GENESIS_HASH } },
    { upsert: true },
  );
};

/**
 * Appends one entry inside `session`'s transaction (call `prepareAudit`
 * first). The head update is a write to one shared document, so concurrent
 * appends are serialized and each links to the previous hash.
 */
export const appendAudit = async (
  event: AuditEvent,
  outcome: AdminAuditOutcome,
  session: ClientSession,
): Promise<void> => {
  const head = await AuditChainHeadModel.findOneAndUpdate(
    { _id: AUDIT_CHAIN_HEAD_ID },
    { $inc: { seq: 1 } },
    { session, returnDocument: 'before' },
  ).lean();

  if (!head) {
    throw new Error('The audit chain head is missing; call prepareAudit first');
  }

  const key = readAuditKey();
  const toId = (id?: string) => (id ? new Types.ObjectId(id) : undefined);
  const fields: HashedFields = {
    seq: head.seq + 1,
    action: event.action,
    outcome,
    actor: toId(event.actorId),
    targetUser: toId(event.targetUserId),
    targetPet: toId(event.targetPetId),
    // Stored exactly as hashed: the driver would store `undefined` as null.
    metadata: canonical(event.metadata ?? {}) as AdminAuditMetadata,
    source: event.source,
    createdAt: new Date(),
    prevHash: head.hash,
  };
  const hash = hashAuditEntry(fields, key);

  await AdminAuditModel.create([{ ...fields, hash, keyed: Boolean(key) }], {
    session,
  });
  await AuditChainHeadModel.updateOne(
    { _id: AUDIT_CHAIN_HEAD_ID },
    { $set: { hash } },
    { session },
  );
};

/** Appends one entry in its own transaction (reads, refused changes). */
export const recordAudit = async (
  event: AuditEvent,
  outcome: AdminAuditOutcome = 'succeeded',
): Promise<void> => {
  await prepareAudit();
  await withTransaction((session) => appendAudit(event, outcome, session));
};

/**
 * Runs an admin change in one transaction together with its audit entry, so
 * a change never exists without its record. `work` returns the metadata to
 * record, or `null` for a no-op (nothing changed, nothing recorded). A change
 * the rules refuse (an AppError such as LAST_ADMIN) is recorded as `denied`
 * with its code, then re-thrown.
 */
export const runAudited = async <T>(
  event: AuditEvent,
  work: (
    session: ClientSession,
  ) => Promise<{ result: T; metadata: AdminAuditMetadata | null }>,
  prepare?: () => Promise<void>,
): Promise<T> => {
  await prepareAudit();
  await prepare?.();

  try {
    return await withTransaction(async (session) => {
      const { result, metadata } = await work(session);

      if (metadata) {
        await appendAudit(
          { ...event, metadata: { ...event.metadata, ...metadata } },
          'succeeded',
          session,
        );
      }

      return result;
    });
  } catch (error) {
    if (error instanceof AppError) {
      try {
        await recordAudit(
          { ...event, metadata: { ...event.metadata, code: error.code } },
          'denied',
        );
      } catch (auditError) {
        // Keep the original error for the client; the failure is logged.
        console.error('[ audit ] Could not record a denied action', auditError);
      }
    }

    throw error;
  }
};

type SummaryFields = { _id: Types.ObjectId; name: string; email: string };

type PopulatedEntry = Omit<
  AdminAuditRecord,
  'actor' | 'targetUser' | 'targetPet'
> & {
  _id: Types.ObjectId;
  actor?: SummaryFields | null;
  targetUser?: SummaryFields | null;
  targetPet?: { _id: Types.ObjectId; name: string } | null;
};

const toEntry = (entry: PopulatedEntry): AdminAuditEntry => {
  const summary = (user?: SummaryFields | null) =>
    user
      ? { _id: user._id.toString(), name: user.name, email: user.email }
      : null;

  return {
    _id: entry._id.toString(),
    seq: entry.seq,
    action: entry.action,
    outcome: entry.outcome,
    actor: summary(entry.actor),
    targetUser: summary(entry.targetUser),
    targetPet: entry.targetPet
      ? { _id: entry.targetPet._id.toString(), name: entry.targetPet.name }
      : null,
    metadata: entry.metadata ?? {},
    source: entry.source,
    createdAt: entry.createdAt.toISOString(),
  };
};

/** Newest first (by chain position), with names instead of ids. */
export const listAuditEntries = async ({
  actions,
  page,
  pageSize,
}: {
  actions?: readonly AdminAuditAction[];
  page: number;
  pageSize: number;
}): Promise<Paginated<AdminAuditEntry>> => {
  const filter: QueryFilter<AdminAuditRecord> = actions
    ? { action: { $in: [...actions] } }
    : {};

  const [entries, totalItems] = await Promise.all([
    AdminAuditModel.find(filter)
      .sort({ seq: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate<{ actor?: SummaryFields | null }>('actor', 'name email')
      .populate<{ targetUser?: SummaryFields | null }>(
        'targetUser',
        'name email',
      )
      .populate<{
        targetPet?: { _id: Types.ObjectId; name: string } | null;
      }>('targetPet', 'name')
      .lean(),
    AdminAuditModel.countDocuments(filter),
  ]);

  return {
    items: entries.map(toEntry),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
};

/** The dashboard's "recent activity": changes only, not read events. */
export const listRecentChanges = async (
  limit: number,
): Promise<AdminAuditEntry[]> =>
  (
    await listAuditEntries({
      actions: ADMIN_CHANGE_ACTIONS,
      page: 1,
      pageSize: limit,
    })
  ).items;

export type AuditVerification = {
  ok: boolean;
  entries: number;
  problems: string[];
};

/**
 * Walks the whole chain: `seq` without gaps, each `prevHash` equal to the
 * previous `hash`, each hash recomputed, and the head matching the last
 * entry. Detects edited, deleted, inserted or reordered entries. It can't
 * detect a rewrite by someone who knows AUDIT_HMAC_KEY (or, without a key,
 * anyone who recomputes the chain), nor a truncated tail together with a
 * rewritten head; compare the head with an earlier copy for that.
 */
export const verifyAuditChain = async (): Promise<AuditVerification> => {
  const key = readAuditKey();
  const problems: string[] = [];
  let previousHash = AUDIT_GENESIS_HASH;
  let expectedSeq = 1;
  let entries = 0;

  for await (const entry of AdminAuditModel.find()
    .sort({ seq: 1 })
    .lean()
    .cursor()) {
    entries += 1;

    if (entry.seq !== expectedSeq) {
      problems.push(`Entry ${entry.seq}: expected seq ${expectedSeq}`);
    }

    if (entry.prevHash !== previousHash) {
      problems.push(`Entry ${entry.seq}: does not link to the previous entry`);
    }

    if (entry.keyed && !key) {
      problems.push(
        `Entry ${entry.seq}: keyed with AUDIT_HMAC_KEY, which is not set here`,
      );
    } else if (hashAuditEntry(entry, entry.keyed ? key : null) !== entry.hash) {
      problems.push(`Entry ${entry.seq}: content does not match its hash`);
    }

    previousHash = entry.hash;
    expectedSeq = entry.seq + 1;
  }

  const head = await AuditChainHeadModel.findById(AUDIT_CHAIN_HEAD_ID).lean();

  if (head && (head.seq !== expectedSeq - 1 || head.hash !== previousHash)) {
    problems.push(
      `The chain head (seq ${head.seq}) does not match the last entry (seq ${expectedSeq - 1})`,
    );
  }

  return { ok: problems.length === 0, entries, problems };
};
