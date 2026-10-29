import mongoose from 'mongoose';
import type { Request, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/require-auth';
import { BadRequestError, NotFoundError } from '../errors/app-error';
import { parseInput } from '../middleware/validate';
import {
  conversationListQuerySchema,
  conversationMessagesQuerySchema,
} from './conversation.schema';
import {
  getConversationView,
  listConversations,
  listMessages,
  sendMessageAboutPet,
  sendReply,
} from './conversation.service';

const getObjectIdParam = (req: Request, name: string, code: string): string => {
  const value = req.params[name];

  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestError(code);
  }

  return value;
};

const getConversationId = (req: Request): string =>
  getObjectIdParam(req, 'id', 'INVALID_CONVERSATION_ID');

/**
 * POST /api/pets/:petId/conversations: message the pet's owner. Starts the
 * conversation (201) or continues the existing one (200). The sender is
 * always the signed-in user.
 */
export const sendMessageAboutPetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const petId = getObjectIdParam(req, 'petId', 'INVALID_PET_ID');

  const { conversationId, created } = await sendMessageAboutPet(
    petId,
    userId,
    req.body.body,
  );

  res
    .status(created ? 201 : 200)
    .json(await getConversationView(conversationId, userId));
};

export const listConversationsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(conversationListQuerySchema, req.query);

  res.json(await listConversations(getAuthenticatedUserId(req), query));
};

export const getConversationController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const view = await getConversationView(
    getConversationId(req),
    getAuthenticatedUserId(req),
  );

  if (!view) {
    throw new NotFoundError('CONVERSATION_NOT_FOUND');
  }

  res.json(view);
};

export const listMessagesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const conversationId = getConversationId(req);
  const { before } = parseInput(conversationMessagesQuerySchema, req.query);

  const page = await listMessages(
    conversationId,
    getAuthenticatedUserId(req),
    before,
  );

  if (!page) {
    throw new NotFoundError('CONVERSATION_NOT_FOUND');
  }

  res.json(page);
};

export const sendReplyController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const message = await sendReply(
    getConversationId(req),
    getAuthenticatedUserId(req),
    req.body.body,
  );

  res.status(201).json(message);
};
