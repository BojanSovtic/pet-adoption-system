import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import type {
  AdminAuditAction,
  ModerationInput,
  UpdateUserRoleInput,
} from '@pet-adoption/models';

import { listAllApplications } from '../applications/application.service';
import { getAuthenticatedUserId } from '../auth/require-auth';
import { BadRequestError } from '../errors/app-error';
import { parseInput } from '../middleware/validate';
import { toPetView } from '../pets/pet-view';
import { toPublicUser } from '../users/user.service';
import { listAuditEntries, recordAudit } from './admin-audit.service';
import {
  adminApplicationListQuerySchema,
  adminAuditListQuerySchema,
  adminPetListQuerySchema,
  adminUserListQuerySchema,
} from './admin.schema';
import { getAdminStats, listAdminPets, listAdminUsers } from './admin.service';
import { hidePet, restorePet } from './pet-moderation.service';
import {
  changeUserRole,
  reinstateUser,
  suspendUser,
} from './user-role.service';

// Every handler here runs behind `requireAdmin` (see admin.routes.ts). The
// acting admin always comes from the session, never from the request.

type Params = Record<string, string>;

const getUserId = (req: Request<Params>): string => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_USER_ID');
  }

  return req.params.id;
};

const getPetId = (req: Request<Params>): string => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_PET_ID');
  }

  return req.params.id;
};

/**
 * Records that an admin looked at a list showing other people's names and
 * email addresses: which list, page, which filters, how many rows. Never the
 * search text (it can itself be someone's email) or the rows' contents.
 */
const recordListView = (
  req: Request,
  action: AdminAuditAction,
  query: Record<string, unknown> & { page: number },
  resultCount: number,
) =>
  recordAudit({
    action,
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
    metadata: {
      page: query.page,
      search: Boolean(query.search),
      filters: Object.keys(query)
        .filter(
          (name) =>
            !['search', 'page', 'pageSize', 'sort'].includes(name) &&
            query[name] !== undefined,
        )
        .sort(),
      resultCount,
    },
  });

export const getAdminStatsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(await getAdminStats());
};

export const listAdminUsersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(adminUserListQuerySchema, req.query);
  const page = await listAdminUsers(query);

  await recordListView(req, 'users.viewed', query, page.items.length);
  res.json(page);
};

export const updateUserRoleController = async (
  req: Request<Params, unknown, UpdateUserRoleInput>,
  res: Response,
): Promise<void> => {
  const { user } = await changeUserRole({
    targetId: getUserId(req),
    role: req.body.role,
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
  });

  res.json(toPublicUser(user));
};

export const suspendUserController = async (
  req: Request<Params, unknown, ModerationInput>,
  res: Response,
): Promise<void> => {
  const user = await suspendUser({
    targetId: getUserId(req),
    reason: req.body.reason,
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
  });

  res.json(toPublicUser(user));
};

export const reinstateUserController = async (
  req: Request<Params>,
  res: Response,
): Promise<void> => {
  const user = await reinstateUser({
    targetId: getUserId(req),
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
  });

  res.json(toPublicUser(user));
};

export const listAdminPetsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(adminPetListQuerySchema, req.query);
  const page = await listAdminPets(query);

  await recordListView(req, 'pets.viewed', query, page.items.length);
  res.json(page);
};

export const hidePetController = async (
  req: Request<Params, unknown, ModerationInput>,
  res: Response,
): Promise<void> => {
  const pet = await hidePet({
    petId: getPetId(req),
    reason: req.body.reason,
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
  });

  res.json(toPetView(pet));
};

export const restorePetController = async (
  req: Request<Params>,
  res: Response,
): Promise<void> => {
  const pet = await restorePet({
    petId: getPetId(req),
    actorId: getAuthenticatedUserId(req),
    source: 'admin-ui',
  });

  res.json(toPetView(pet));
};

export const listAdminApplicationsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(adminApplicationListQuerySchema, req.query);
  const page = await listAllApplications(query);

  await recordListView(req, 'applications.viewed', query, page.items.length);
  res.json(page);
};

/** Reading the audit log itself isn't recorded (it holds no new data). */
export const listAdminAuditController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { action, page, pageSize } = parseInput(
    adminAuditListQuerySchema,
    req.query,
  );

  res.json(
    await listAuditEntries({
      actions: action ? [action] : undefined,
      page,
      pageSize,
    }),
  );
};
