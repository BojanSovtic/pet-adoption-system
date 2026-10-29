import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { asyncHandler } from '../middleware/async-handler';
import { messageSendRateLimit } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import { sendMessageSchema } from './conversation.schema';
import {
  getConversationController,
  listConversationsController,
  listMessagesController,
  sendMessageAboutPetController,
  sendReplyController,
} from './conversation.controller';

// Mounted at /api. Every route requires a signed-in user; only the two
// participants can see or post in a conversation (checked in the service,
// anyone else gets 404). Sending passes the per-user message rate limit
// (429 RATE_LIMITED, see middleware/rate-limit.ts).
export const conversationRouter: Router = Router();

conversationRouter.post(
  '/pets/:petId/conversations',
  requireAuth,
  messageSendRateLimit,
  validateBody(sendMessageSchema),
  asyncHandler(sendMessageAboutPetController),
);

conversationRouter.get(
  '/conversations',
  requireAuth,
  asyncHandler(listConversationsController),
);

conversationRouter.get(
  '/conversations/:id',
  requireAuth,
  asyncHandler(getConversationController),
);

conversationRouter.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(listMessagesController),
);

conversationRouter.post(
  '/conversations/:id/messages',
  requireAuth,
  messageSendRateLimit,
  validateBody(sendMessageSchema),
  asyncHandler(sendReplyController),
);
