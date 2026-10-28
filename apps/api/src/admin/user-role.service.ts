import type { ClientSession, Types } from 'mongoose';
import type { AdminAuditSource, UserRole } from '@pet-adoption/models';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error';
import { UserModel, type UserRecord } from '../users/user.model';
import {
  ROLE_CHANGE_GUARD_ID,
  RoleChangeGuardModel,
} from './admin-audit.model';
import { runAudited } from './admin-audit.service';

type StoredUser = UserRecord & { _id: Types.ObjectId };

type Actor = {
  /** The acting admin; omitted for the CLI (trusted operator). */
  actorId?: string;
  source: AdminAuditSource;
};

export type RoleChangeResult = {
  user: StoredUser;
  /** `false` when the user already had the role (nothing written). */
  changed: boolean;
};

/**
 * Makes sure the guard exists before any transaction uses it. Outside a
 * transaction MongoDB retries concurrent upserts of the same _id, so two
 * first-ever changes can't fail with a duplicate key.
 */
const prepareGuard = async (): Promise<void> => {
  await RoleChangeGuardModel.updateOne(
    { _id: ROLE_CHANGE_GUARD_ID },
    { $setOnInsert: { changedAt: new Date() } },
    { upsert: true },
  );
};

/**
 * The common start of every role or suspension change, inside its
 * transaction: serialize with all other such changes (guard), confirm the
 * actor is still an active admin, and load the target.
 */
const beginAccessChange = async (
  session: ClientSession,
  targetId: string,
  actorId: string | undefined,
): Promise<StoredUser> => {
  await RoleChangeGuardModel.updateOne(
    { _id: ROLE_CHANGE_GUARD_ID },
    { $currentDate: { changedAt: true } },
    { session },
  );

  if (actorId) {
    // `suspendedAt: null` also matches a missing field (older users).
    const actorIsAdmin = await UserModel.exists({
      _id: actorId,
      role: 'admin',
      suspendedAt: null,
    }).session(session);

    if (!actorIsAdmin) {
      throw new ForbiddenError('ADMIN_REQUIRED');
    }
  }

  const target = await UserModel.findById(targetId)
    .session(session)
    .lean<StoredUser>();

  if (!target) {
    throw new NotFoundError('USER_NOT_FOUND');
  }

  return target;
};

const updateUser = async (
  session: ClientSession,
  targetId: string,
  update: Partial<UserRecord>,
): Promise<StoredUser> => {
  const user = await UserModel.findByIdAndUpdate(targetId, update, {
    session,
    returnDocument: 'after',
    runValidators: true,
  }).lean<StoredUser>();

  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND');
  }

  return user;
};

/**
 * The only way a role changes. Rules, checked inside one audited transaction:
 * - the acting admin must still be an active admin (no stale privileges);
 * - nobody changes their own role (no self-promotion or accidental lock-out);
 * - suspended users can't be made admins;
 * - the last admin can't be demoted, so the platform always has one.
 */
export const changeUserRole = async ({
  targetId,
  role,
  actorId,
  source,
}: Actor & { targetId: string; role: UserRole }): Promise<RoleChangeResult> =>
  runAudited<RoleChangeResult>(
    { action: 'user.role.changed', actorId, targetUserId: targetId, source },
    async (session) => {
      if (actorId && actorId === targetId) {
        throw new ForbiddenError('CANNOT_CHANGE_OWN_ROLE');
      }

      const target = await beginAccessChange(session, targetId, actorId);
      const currentRole = target.role ?? 'user';

      if (currentRole === role) {
        return { result: { user: target, changed: false }, metadata: null };
      }

      if (role === 'admin' && target.suspendedAt) {
        throw new ConflictError('USER_SUSPENDED');
      }

      if (currentRole === 'admin') {
        const admins = await UserModel.countDocuments({
          role: 'admin',
        }).session(session);

        if (admins <= 1) {
          throw new ConflictError('LAST_ADMIN');
        }
      }

      const user = await updateUser(session, targetId, { role });

      return {
        result: { user, changed: true },
        metadata: { from: currentRole, to: role },
      };
    },
    prepareGuard,
  );

/**
 * Suspends an account: the user can't sign in, and every existing session
 * stops working on its next request (`requireAuth`). Data and history stay.
 * Admins can't be suspended (demote first), so an active admin always
 * remains; nobody suspends themselves.
 */
export const suspendUser = async ({
  targetId,
  reason,
  actorId,
  source,
}: Actor & { targetId: string; reason?: string }): Promise<StoredUser> =>
  runAudited(
    {
      action: 'user.suspended',
      actorId,
      targetUserId: targetId,
      source,
      metadata: { reason },
    },
    async (session) => {
      if (actorId && actorId === targetId) {
        throw new ForbiddenError('CANNOT_SUSPEND_SELF');
      }

      const target = await beginAccessChange(session, targetId, actorId);

      if (target.role === 'admin') {
        throw new ConflictError('CANNOT_SUSPEND_ADMIN');
      }

      if (target.suspendedAt) {
        return { result: target, metadata: null };
      }

      const user = await updateUser(session, targetId, {
        suspendedAt: new Date(),
      });

      return { result: user, metadata: {} };
    },
    prepareGuard,
  );

/** Lifts a suspension; the user can sign in again. Nothing else changes. */
export const reinstateUser = async ({
  targetId,
  actorId,
  source,
}: Actor & { targetId: string }): Promise<StoredUser> =>
  runAudited(
    { action: 'user.reinstated', actorId, targetUserId: targetId, source },
    async (session) => {
      const target = await beginAccessChange(session, targetId, actorId);

      if (!target.suspendedAt) {
        return { result: target, metadata: null };
      }

      const user = await updateUser(session, targetId, { suspendedAt: null });

      return { result: user, metadata: {} };
    },
    prepareGuard,
  );
