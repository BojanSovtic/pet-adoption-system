import { z } from 'zod';
import {
  CONVERSATION_LIST_DEFAULT_PAGE_SIZE,
  CONVERSATION_LIST_MAX_PAGE_SIZE,
  CONVERSATION_MESSAGE_MAX_LENGTH,
  type ConversationListQuery,
  type ConversationMessagesQuery,
  type SendMessageInput,
} from '@pet-adoption/models';

// Only the text comes from the client. Sender, conversation, pet and time are
// set by the server; unknown fields (e.g. `sender`) are stripped.
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(CONVERSATION_MESSAGE_MAX_LENGTH),
}) satisfies z.ZodType<SendMessageInput>;

// Query strings: an empty value (e.g. "?page=") means "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const objectIdString = z.string().regex(/^[0-9a-f]{24}$/i);

/** Caps how deep offset pagination can skip (keeps `skip` cheap). */
const MAX_PAGE = 10_000;

export const conversationListQuerySchema = z.object({
  page: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  ),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(CONVERSATION_LIST_MAX_PAGE_SIZE)
      .default(CONVERSATION_LIST_DEFAULT_PAGE_SIZE),
  ),
  pet: z.preprocess(emptyToUndefined, objectIdString.optional()),
}) satisfies z.ZodType<ConversationListQuery>;

export const conversationMessagesQuerySchema = z.object({
  before: z.preprocess(emptyToUndefined, objectIdString.optional()),
}) satisfies z.ZodType<ConversationMessagesQuery>;

export type ParsedConversationListQuery = z.output<
  typeof conversationListQuerySchema
>;
