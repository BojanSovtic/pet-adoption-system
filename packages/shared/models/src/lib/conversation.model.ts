import type { Pet } from './pet.model.js';

/**
 * Text-only conversations between a pet's owner and one interested user (the
 * adopter), about that pet. At most one conversation per pet and adopter;
 * starting again from the pet page continues it. Senders always come from the
 * server-side session.
 */
export const CONVERSATION_MESSAGE_MAX_LENGTH = 2000;

export const CONVERSATION_LIST_DEFAULT_PAGE_SIZE = 10;
export const CONVERSATION_LIST_MAX_PAGE_SIZE = 50;
/** Messages per request; older ones load with `?before=<oldest message id>`. */
export const CONVERSATION_MESSAGES_PAGE_SIZE = 30;

/** The signed-in user's side of a conversation. */
export type ConversationRole = 'owner' | 'adopter';

/** The other participant: a name for display and an id for the profile link. */
export type ConversationParticipant = {
  _id: string;
  name: string;
};

export type ConversationPetSummary = Pick<
  Pet,
  '_id' | 'name' | 'species' | 'status' | 'imageUrl'
>;

/**
 * One message as the signed-in participant sees it. `fromMe` replaces a
 * sender id: the other sender is always `otherParticipant`.
 */
export type ConversationMessage = {
  _id: string;
  body: string;
  fromMe: boolean;
  createdAt: string;
};

export type Conversation = {
  _id: string;
  pet: ConversationPetSummary;
  role: ConversationRole;
  otherParticipant: ConversationParticipant;
  /** The newest message, shortened for list previews. */
  lastMessage: Omit<ConversationMessage, '_id'>;
  createdAt: string;
  updatedAt: string;
};

/** One page of messages, oldest first. */
export type ConversationMessagesPage = {
  items: ConversationMessage[];
  /** More (older) messages exist before `items[0]`. */
  hasOlder: boolean;
};

export type SendMessageInput = {
  body: string;
};

/** Query parameters of `GET /api/conversations`. */
export type ConversationListQuery = {
  page?: number;
  pageSize?: number;
  /** Only the conversation about this pet (used by the pet page). */
  pet?: string;
};

/** Query parameters of `GET /api/conversations/:id/messages`. */
export type ConversationMessagesQuery = {
  /** A message id; returns the messages before it. */
  before?: string;
};
