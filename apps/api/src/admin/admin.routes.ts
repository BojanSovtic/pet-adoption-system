import { Router } from 'express';

import { requireAdmin } from '../auth/require-auth';
import { asyncHandler } from '../middleware/async-handler';
import {
  adminReadRateLimit,
  adminWriteRateLimit,
} from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import {
  getAdminStatsController,
  hidePetController,
  listAdminApplicationsController,
  listAdminAuditController,
  listAdminPetsController,
  listAdminUsersController,
  reinstateUserController,
  restorePetController,
  suspendUserController,
  updateUserRoleController,
} from './admin.controller';
import { moderationSchema, updateUserRoleSchema } from './admin.schema';

// Mounted at /api/admin. For every request on this router, including paths
// that match no route: `requireAdmin` (401 signed out, 403 suspended or not
// an admin), then the per-admin rate limits (reads and changes counted
// separately, 429 RATE_LIMITED). Nothing here is reachable without a
// current, active admin.
export const adminRouter: Router = Router();

adminRouter.use(requireAdmin, adminReadRateLimit, adminWriteRateLimit);

adminRouter.get('/stats', asyncHandler(getAdminStatsController));

adminRouter.get('/audit', asyncHandler(listAdminAuditController));

adminRouter.get('/users', asyncHandler(listAdminUsersController));

adminRouter.put(
  '/users/:id/role',
  validateBody(updateUserRoleSchema),
  asyncHandler(updateUserRoleController),
);

// Suspension: reversible, keeps all data; see user-role.service.ts.
adminRouter.post(
  '/users/:id/suspend',
  validateBody(moderationSchema),
  asyncHandler(suspendUserController),
);

adminRouter.post('/users/:id/reinstate', asyncHandler(reinstateUserController));

adminRouter.get('/pets', asyncHandler(listAdminPetsController));

// Listing moderation: reversible; existing applications are untouched and
// still decided by the owner (see pet-moderation.service.ts).
adminRouter.post(
  '/pets/:id/hide',
  validateBody(moderationSchema),
  asyncHandler(hidePetController),
);

adminRouter.post('/pets/:id/restore', asyncHandler(restorePetController));

// Read-only oversight: applications change only through the owner and
// applicant actions, which keep the adoption rules and locking.
adminRouter.get('/applications', asyncHandler(listAdminApplicationsController));
