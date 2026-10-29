import type {
  Conversation,
  ConversationListQuery,
  ConversationMessage,
  ConversationMessagesPage,
  ConversationMessagesQuery,
  Paginated,
  SendMessageInput,
} from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/**
 * All conversation data belongs to the signed-in user (removed on every
 * identity change, see `setCurrentUser`). Every request parameter is part of
 * the key; invalidating `all` refreshes lists, details and messages.
 */
export const conversationQueryKeys = {
  all: ['conversations'] as const,
  list: (query: ConversationListQuery) =>
    ['conversations', 'list', query] as const,
  detail: (id: string) => ['conversations', 'detail', id] as const,
  messages: (id: string) => ['conversations', 'messages', id] as const,
};

export const getConversations = async (
  query: ConversationListQuery,
): Promise<Paginated<Conversation>> => {
  const { data } = await http.get<Paginated<Conversation>>('/conversations', {
    params: query,
  });
  return data;
};

export const getConversation = async (id: string): Promise<Conversation> => {
  const { data } = await http.get<Conversation>(`/conversations/${id}`);
  return data;
};

export const getConversationMessages = async (
  id: string,
  query: ConversationMessagesQuery,
): Promise<ConversationMessagesPage> => {
  const { data } = await http.get<ConversationMessagesPage>(
    `/conversations/${id}/messages`,
    { params: query },
  );
  return data;
};

/** Starts a conversation about a pet, or continues the existing one. */
export const messagePetOwner = async (
  petId: string,
  input: SendMessageInput,
): Promise<Conversation> => {
  const { data } = await http.post<Conversation>(
    `/pets/${petId}/conversations`,
    input,
  );
  return data;
};

export const sendMessage = async (
  conversationId: string,
  input: SendMessageInput,
): Promise<ConversationMessage> => {
  const { data } = await http.post<ConversationMessage>(
    `/conversations/${conversationId}/messages`,
    input,
  );
  return data;
};
