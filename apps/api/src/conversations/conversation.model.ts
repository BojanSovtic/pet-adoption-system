import { Schema, model, type Types } from 'mongoose';
import { CONVERSATION_MESSAGE_MAX_LENGTH } from '@pet-adoption/models';

/** How much of the newest message the conversation keeps for list previews. */
export const LAST_MESSAGE_PREVIEW_LENGTH = 200;

export type ConversationRecord = {
  pet: Types.ObjectId;
  /**
   * Copy of the pet's owner (pets never change owner), so participant checks
   * and lists never need to load the pet.
   */
  petOwner: Types.ObjectId;
  /** The user who started the conversation from the pet page. */
  adopter: Types.ObjectId;
  /** The newest message, for list previews and ordering. */
  lastMessage: {
    body: string;
    sender: Types.ObjectId;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type MessageRecord = {
  conversation: Types.ObjectId;
  /** Always the signed-in user from the session, never from the request. */
  sender: Types.ObjectId;
  body: string;
  createdAt: Date;
};

const conversationSchema = new Schema<ConversationRecord>(
  {
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    petOwner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adopter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: {
      body: { type: String, required: true },
      sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, required: true },
    },
  },
  { timestamps: true },
);

// One conversation per pet and adopter: contacting the owner again continues it.
conversationSchema.index({ pet: 1, adopter: 1 }, { unique: true });
// "My conversations", newest activity first, for either side.
conversationSchema.index({ adopter: 1, 'lastMessage.createdAt': -1, _id: -1 });
conversationSchema.index({
  petOwner: 1,
  'lastMessage.createdAt': -1,
  _id: -1,
});

// Messages never change after they are sent, so there is no `updatedAt`.
const messageSchema = new Schema<MessageRecord>({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: CONVERSATION_MESSAGE_MAX_LENGTH,
  },
  createdAt: { type: Date, required: true },
});

// Newest first within a conversation; `_id` is the paging cursor.
messageSchema.index({ conversation: 1, _id: -1 });

export const ConversationModel = model<ConversationRecord>(
  'Conversation',
  conversationSchema,
);

export const MessageModel = model<MessageRecord>('Message', messageSchema);
