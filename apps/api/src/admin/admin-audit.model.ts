import { Schema, model, type Types } from 'mongoose';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_OUTCOMES,
  ADMIN_AUDIT_SOURCES,
  type AdminAuditAction,
  type AdminAuditMetadata,
  type AdminAuditOutcome,
  type AdminAuditSource,
} from '@pet-adoption/models';

/**
 * Record of admin actions: changes (role, suspension, listing moderation),
 * refused change attempts, and reads of lists with personal data.
 *
 * Each entry is part of a hash chain (`seq`, `prevHash`, `hash`; see
 * admin-audit.service.ts), so editing, deleting or reordering entries is
 * *detectable* with `pnpm audit:verify`. It is not tamper-proof: anyone with
 * write access to the database can still change it, and without
 * AUDIT_HMAC_KEY they could also recompute the chain.
 */
export type AdminAuditRecord = {
  /** 1, 2, 3, … without gaps. */
  seq: number;
  action: AdminAuditAction;
  outcome: AdminAuditOutcome;
  /** The acting admin; absent for the CLI. */
  actor?: Types.ObjectId;
  targetUser?: Types.ObjectId;
  targetPet?: Types.ObjectId;
  metadata: AdminAuditMetadata;
  source: AdminAuditSource;
  createdAt: Date;
  prevHash: string;
  hash: string;
  /** Whether `hash` is an HMAC with AUDIT_HMAC_KEY (else a plain SHA-256). */
  keyed: boolean;
};

const adminAuditSchema = new Schema<AdminAuditRecord>(
  {
    seq: { type: Number, required: true, unique: true },
    action: { type: String, enum: [...ADMIN_AUDIT_ACTIONS], required: true },
    outcome: { type: String, enum: [...ADMIN_AUDIT_OUTCOMES], required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    targetPet: { type: Schema.Types.ObjectId, ref: 'Pet' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, enum: [...ADMIN_AUDIT_SOURCES], required: true },
    // Set by the service (it is part of the hash), not by Mongoose timestamps.
    createdAt: { type: Date, required: true },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    keyed: { type: Boolean, required: true },
  },
  { minimize: false },
);

// The audit page and the dashboard list newest first, optionally by action.
adminAuditSchema.index({ action: 1, seq: -1 });

// Append-only inside the application: no code path can update or delete an
// entry through the model. (Direct database access still can; see above.)
const refuse = () => {
  throw new Error('Admin audit entries are append-only');
};

adminAuditSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  refuse,
);

adminAuditSchema.pre('save', function () {
  if (!this.isNew) {
    refuse();
  }
});

export const AdminAuditModel = model<AdminAuditRecord>(
  'AdminAudit',
  adminAuditSchema,
);

/**
 * The end of the chain: the last `seq` and `hash`. Every append updates it in
 * the same transaction as the new entry, so appends happen one at a time and
 * the chain can't fork.
 */
type AuditChainHeadRecord = { _id: string; seq: number; hash: string };

export const AuditChainHeadModel = model<AuditChainHeadRecord>(
  'AuditChainHead',
  new Schema<AuditChainHeadRecord>({
    _id: { type: String, required: true },
    seq: { type: Number, required: true },
    hash: { type: String, required: true },
  }),
);

export const AUDIT_CHAIN_HEAD_ID = 'admin-audit';

/** `prevHash` of the first entry. */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/**
 * One fixed document that every role change and suspension writes first.
 * MongoDB lets only one open transaction modify a document, so these changes
 * run one after another. That rules out two admins demoting each other at the
 * same moment (leaving no admin), or promoting and suspending the same user
 * at once (leaving a suspended admin).
 */
type RoleChangeGuardRecord = { _id: string; changedAt: Date };

export const RoleChangeGuardModel = model<RoleChangeGuardRecord>(
  'RoleChangeGuard',
  new Schema<RoleChangeGuardRecord>({
    _id: { type: String, required: true },
    changedAt: { type: Date },
  }),
);

export const ROLE_CHANGE_GUARD_ID = 'user-roles';
