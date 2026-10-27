import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { asyncHandler } from '../middleware/async-handler';
import {
  applicationSubmitRateLimit,
  otherWriteRateLimit,
} from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { createApplicationSchema } from './application.schema';
import {
  applicationActionController,
  listMyApplicationsController,
  listReceivedApplicationsController,
  submitApplicationController,
} from './application.controller';

// Mounted at /api. Every route requires a signed-in user; who may do what is
// checked in the service (applicant vs. pet owner). Changes pass the per-user
// rate limits after sign-in (429 RATE_LIMITED, see middleware/rate-limit.ts).
export const applicationRouter: Router = Router();

applicationRouter.post(
  '/pets/:petId/applications',
  requireAuth,
  applicationSubmitRateLimit,
  validateBody(createApplicationSchema),
  asyncHandler(submitApplicationController),
);

applicationRouter.get(
  '/applications/mine',
  requireAuth,
  asyncHandler(listMyApplicationsController),
);

applicationRouter.get(
  '/applications/received',
  requireAuth,
  asyncHandler(listReceivedApplicationsController),
);

// Explicit actions instead of "PATCH status": each maps to one state-machine
// transition with one allowed actor.
for (const action of ['accept', 'reject', 'withdraw'] as const) {
  applicationRouter.post(
    `/applications/:id/${action}`,
    requireAuth,
    otherWriteRateLimit,
    asyncHandler(applicationActionController(action)),
  );
}
