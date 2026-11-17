import type { QueryFilter, Types } from 'mongoose';
import {
  CONVERSATION_MESSAGES_PAGE_SIZE,
  type Conversation,
  type ConversationMessage,
  type ConversationMessagesPage,
  type Paginated,
} from '@pet-adoption/models';

import { withTransaction } from '../config/database';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error';
import type { PetRecord } from '../pets/pet.model';
import { lockPet } from '../pets/pet.service';
import { storage } from '../storage';
import {
  ConversationModel,
  LAST_MESSAGE_PREVIEW_LENGTH,
  MessageModel,
  type ConversationRecord,
  type MessageRecord,
} from './conversation.model';
import type { ParsedConversationListQuery } from './conversation.schema';

type PopulatedPet = Pick<
  PetRecord,
  'name' | 'species' | 'status' | 'images'
> & {
  _id: Types.ObjectId;
};
type PopulatedUser = { _id: Types.ObjectId; name: string };
type PopulatedConversation = Omit<
  ConversationRecord,
  'pet' | 'petOwner' | 'adopter'
> & {
  _id: Types.ObjectId;
  pet: PopulatedPet;
  petOwner: PopulatedUser;
  adopter: PopulatedUser;
};

// Only what the conversation view shows: never emails or account data.
const PET_SUMMARY_FIELDS = 'name species status images';
const PARTICIPANT_FIELDS = 'name';

// Newest activity first; `_id` breaks ties so paging is stable.
const LATEST_ACTIVITY_FIRST = { 'lastMessage.createdAt': -1, _id: -1 } as const;

/**
 * Only the two participants ever match. Every read and write in this file is
 * scoped by it, so a guessed or foreign conversation id finds nothing (404).
 */
const participantFilter = (
  userId: string,
): QueryFilter<ConversationRecord> => ({
  $or: [{ adopter: userId }, { petOwner: userId }],
});

const toPreview = (body: string): string =>
  body.length > LAST_MESSAGE_PREVIEW_LENGTH
    ? `${body.slice(0, LAST_MESSAGE_PREVIEW_LENGTH - 1)}…`
    : body;

const toMessageView =
  (userId: string) =>
  (
    message: Pick<MessageRecord, 'body' | 'sender' | 'createdAt'> & {
      _id: Types.ObjectId;
    },
  ): ConversationMessage => ({
    _id: message._id.toString(),
    body: message.body,
    fromMe: message.sender.equals(userId),
    createdAt: message.createdAt.toISOString(),
  });

const toConversationView =
  (userId: string) =>
  (conversation: PopulatedConversation): Conversation => {
    const role = conversation.petOwner._id.equals(userId) ? 'owner' : 'adopter';
    const other =
      role === 'owner' ? conversation.adopter : conversation.petOwner;
    const { pet, lastMessage } = conversation;
    const mainImage = pet.images?.[0];

    return {
      _id: conversation._id.toString(),
      pet: {
        _id: pet._id.toString(),
        name: pet.name,
        species: pet.species,
        status: pet.status,
        imageUrl: mainImage ? storage.publicUrl(mainImage.key) : null,
      },
      role,
      otherParticipant: { _id: other._id.toString(), name: other.name },
      lastMessage: {
        body: lastMessage.body,
        fromMe: lastMessage.sender.equals(userId),
        createdAt: lastMessage.createdAt.toISOString(),
      },
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  };

// Conversations are deleted together with their pet (see `deleteOwnedPet`),
// and accounts can't be deleted, so the populated documents always exist.
const findConversationViews = async (
  userId: string,
  filter: QueryFilter<ConversationRecord>,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<Conversation[]> => {
  const conversations = await ConversationModel.find({
    ...filter,
    ...participantFilter(userId),
  })
    .sort(LATEST_ACTIVITY_FIRST)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .populate<{ pet: PopulatedPet }>('pet', PET_SUMMARY_FIELDS)
    .populate<{ petOwner: PopulatedUser }>('petOwner', PARTICIPANT_FIELDS)
    .populate<{ adopter: PopulatedUser }>('adopter', PARTICIPANT_FIELDS)
    .lean<PopulatedConversation[]>();

  return conversations.map(toConversationView(userId));
};

/** The user's conversations (either side), newest activity first. */
export const listConversations = async (
  userId: string,
  { pet, ...paging }: ParsedConversationListQuery,
): Promise<Paginated<Conversation>> => {
  const filter: QueryFilter<ConversationRecord> = pet ? { pet } : {};

  const [items, totalItems] = await Promise.all([
    findConversationViews(userId, filter, paging),
    ConversationModel.countDocuments({
      ...filter,
      ...participantFilter(userId),
    }),
  ]);

  return {
    items,
    page: paging.page,
    pageSize: paging.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / paging.pageSize),
  };
};

/** One conversation, or `null` if it doesn't exist or the user isn't in it. */
export const getConversationView = async (
  conversationId: string,
  userId: string,
): Promise<Conversation | null> => {
  const [view] = await findConversationViews(
    userId,
    { _id: conversationId },
    { page: 1, pageSize: 1 },
  );

  return view ?? null;
};

/**
 * One page of messages, oldest first: the newest page, or the page before the
 * message `before`. `null` if the user isn't a participant.
 */
export const listMessages = async (
  conversationId: string,
  userId: string,
  before?: string,
): Promise<ConversationMessagesPage | null> => {
  const isParticipant = await ConversationModel.exists({
    _id: conversationId,
    ...participantFilter(userId),
  });

  if (!isParticipant) {
    return null;
  }

  // Scoped by conversation, so a cursor from another conversation can't
  // reveal anything.
  const filter: QueryFilter<MessageRecord> = { conversation: conversationId };

  if (before) {
    filter._id = { $lt: before };
  }

  // One extra tells whether older messages exist.
  const messages = await MessageModel.find(filter)
    .sort({ _id: -1 })
    .limit(CONVERSATION_MESSAGES_PAGE_SIZE + 1)
    .lean();

  return {
    items: messages
      .slice(0, CONVERSATION_MESSAGES_PAGE_SIZE)
      .reverse()
      .map(toMessageView(userId)),
    hasOlder: messages.length > CONVERSATION_MESSAGES_PAGE_SIZE,
  };
};

/**
 * Sends a message about a pet to its owner, starting the conversation or
 * continuing the existing one. In one transaction that starts by locking the
 * pet, so it can't race with deleting or hiding the pet. Rules match
 * applications: hidden or missing pet → 404, own pet → 403, adopted pet → 409
 * for a new conversation (an existing one continues).
 */
export const sendMessageAboutPet = async (
  petId: string,
  senderId: string,
  body: string,
): Promise<{ conversationId: string; created: boolean }> =>
  withTransaction(async (session) => {
    const pet = await lockPet(session, petId);

    if (!pet || pet.hiddenAt) {
      throw new NotFoundError('PET_NOT_FOUND');
    }

    if (pet.owner?.equals(senderId)) {
      throw new ForbiddenError('CANNOT_MESSAGE_OWN_PET');
    }

    const createdAt = new Date();
    const lastMessage = { body: toPreview(body), sender: senderId, createdAt };

    const existing = await ConversationModel.findOneAndUpdate(
      { pet: pet._id, adopter: senderId },
      { $set: { lastMessage } },
      { session },
    ).lean();
    let conversationId = existing?._id;

    if (!conversationId) {
      // Pets created before ownership existed have nobody to contact.
      if (!pet.owner || pet.status === 'adopted') {
        throw new ConflictError('PET_NOT_AVAILABLE');
      }

      const [conversation] = await ConversationModel.create(
        [{ pet: pet._id, petOwner: pet.owner, adopter: senderId, lastMessage }],
        { session },
      );
      conversationId = conversation._id;
    }

    await MessageModel.create(
      [{ conversation: conversationId, sender: senderId, body, createdAt }],
      { session },
    );

    return { conversationId: conversationId.toString(), created: !existing };
  });

/**
 * Replies in an existing conversation. The first write updates the
 * conversation, scoped to its participants: it is both the access check and
 * a lock, so concurrent replies and pet deletion are serialized.
 */
export const sendReply = async (
  conversationId: string,
  senderId: string,
  body: string,
): Promise<ConversationMessage> =>
  withTransaction(async (session) => {
    const createdAt = new Date();

    const conversation = await ConversationModel.findOneAndUpdate(
      { _id: conversationId, ...participantFilter(senderId) },
      {
        $set: {
          lastMessage: { body: toPreview(body), sender: senderId, createdAt },
        },
      },
      { session },
    ).lean();

    if (!conversation) {
      throw new NotFoundError('CONVERSATION_NOT_FOUND');
    }

    const [message] = await MessageModel.create(
      [{ conversation: conversation._id, sender: senderId, body, createdAt }],
      { session },
    );

    return toMessageView(senderId)(message);
  });
