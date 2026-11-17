import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_MESSAGE_MAX_LENGTH,
  DEFAULT_PET_PROFILE,
  type Conversation,
  type ConversationMessage,
  type Pet,
  type User,
} from '@pet-adoption/models';

import '../../i18n/config';
import { ApiError } from '../../lib/api-client';
import { pageOf } from '../../lib/testing/page-of';
import { getCurrentUser } from '../auth/api/get-current-user';
import { getUserProfile } from '../users/api/users';
import {
  getConversation,
  getConversationMessages,
  getConversations,
  messagePetOwner,
  sendMessage,
} from './api/conversations';
import { PetContactSection } from './components/pet-contact-section';
import { ConversationPage } from './pages/conversation-page';
import { ConversationsPage } from './pages/conversations-page';

vi.mock('./api/conversations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/conversations')>()),
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  messagePetOwner: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../users/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../users/api/users')>()),
  getUserProfile: vi.fn(),
}));

vi.mock('../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const adopter: User = {
  _id: 'adopter-1',
  email: 'marko@example.com',
  name: 'Marko',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const pet: Pet = {
  _id: 'pet-1',
  owner: 'owner-1',
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  ...DEFAULT_PET_PROFILE,
  hidden: false,
  imageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const conversation: Conversation = {
  _id: 'conv-1',
  pet: {
    _id: 'pet-1',
    name: 'Milo',
    species: 'dog',
    status: 'available',
    imageUrl: null,
  },
  role: 'adopter',
  otherParticipant: { _id: 'owner-1', name: 'Ana' },
  lastMessage: {
    body: 'Yes, he loves kids.',
    fromMe: false,
    createdAt: '2026-01-03T10:00:00.000Z',
  },
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T10:00:00.000Z',
};

const message = (
  id: string,
  body: string,
  fromMe: boolean,
): ConversationMessage => ({
  _id: id,
  body,
  fromMe,
  createdAt: '2026-01-03T10:00:00.000Z',
});

const renderAt = (path: string, user: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);

  const router = createMemoryRouter(
    [
      { path: '/pets/:id', element: <PetContactSection pet={pet} /> },
      { path: '/messages', element: <ConversationsPage /> },
      { path: '/messages/:id', element: <ConversationPage /> },
      { path: '/login', element: <p>Login page</p> },
    ],
    { initialEntries: [path] },
  );

  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserProfile).mockResolvedValue({
    _id: 'owner-1',
    name: 'Ana',
    memberSince: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(getConversations).mockResolvedValue(pageOf([]));
  vi.mocked(getConversation).mockResolvedValue(conversation);
  vi.mocked(getConversationMessages).mockResolvedValue({
    items: [
      message('m1', 'Is Milo good with children?', true),
      message('m2', 'Yes, he loves kids.', false),
    ],
    hasOlder: false,
  });
});

describe('PetContactSection', () => {
  it('starts a conversation and opens it', async () => {
    vi.mocked(messagePetOwner).mockResolvedValue(conversation);
    const router = renderAt('/pets/pet-1', adopter);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Message the owner' }),
    );
    const field = await screen.findByLabelText(/Your message to Ana/);
    fireEvent.change(field, { target: { value: '  Is he good with kids?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/messages/conv-1'),
    );
    // Only the text is sent; the API takes the sender from the session.
    expect(messagePetOwner).toHaveBeenCalledWith('pet-1', {
      body: 'Is he good with kids?',
    });
  });

  it('rejects an empty message without calling the API', async () => {
    renderAt('/pets/pet-1', adopter);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Message the owner' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send message' }),
    );

    expect(await screen.findByText('Please write a message.')).toBeTruthy();
    expect(messagePetOwner).not.toHaveBeenCalled();
  });

  it('limits the text to the maximum length', async () => {
    renderAt('/pets/pet-1', adopter);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Message the owner' }),
    );

    expect(
      (await screen.findByLabelText(/Your message to Ana/)).getAttribute(
        'maxLength',
      ),
    ).toBe(String(CONVERSATION_MESSAGE_MAX_LENGTH));
  });

  it('keeps the text and explains a failed send', async () => {
    vi.mocked(messagePetOwner).mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED'),
    );
    renderAt('/pets/pet-1', adopter);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Message the owner' }),
    );
    const field = await screen.findByLabelText(/Your message to Ana/);
    fireEvent.change(field, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Please wait a few minutes and try again.',
    );
    expect((field as HTMLTextAreaElement).value).toBe('Hello');
  });

  it('links to an existing conversation instead of a new one', async () => {
    vi.mocked(getConversations).mockResolvedValue(pageOf([conversation]));
    renderAt('/pets/pet-1', adopter);

    const link = await screen.findByRole('link', {
      name: 'Continue conversation',
    });
    expect(link.getAttribute('href')).toBe('/messages/conv-1');
    expect(
      screen.queryByRole('button', { name: 'Message the owner' }),
    ).toBeNull();
  });
});

describe('ConversationsPage', () => {
  it('sends signed-out visitors to the login page', async () => {
    renderAt('/messages', null);

    expect(await screen.findByText('Login page')).toBeTruthy();
  });

  it('lists conversations with the pet, the other person and the last message', async () => {
    vi.mocked(getConversations).mockResolvedValue(pageOf([conversation]));
    renderAt('/messages', adopter);

    const link = await screen.findByRole('link', { name: 'Milo' });
    expect(link.getAttribute('href')).toBe('/messages/conv-1');
    const item = link.closest('li') as HTMLElement;
    expect(within(item).getByText(/with Ana/)).toBeTruthy();
    expect(within(item).getByText('Yes, he loves kids.')).toBeTruthy();
    expect(within(item).getByText('You asked')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    renderAt('/messages', adopter);

    expect(await screen.findByText('No conversations yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse pets' })).toBeTruthy();
  });

  it('shows an error with a retry button', async () => {
    vi.mocked(getConversations).mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR'),
    );
    renderAt('/messages', adopter);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The server could not be reached.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });
});

describe('ConversationPage', () => {
  it('shows each message with its sender and time', async () => {
    renderAt('/messages/conv-1', adopter);

    expect(
      await screen.findByRole('heading', { name: 'Conversation with Ana' }),
    ).toBeTruthy();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('You')).toBeTruthy();
    expect(
      within(items[0]).getByText('Is Milo good with children?'),
    ).toBeTruthy();
    expect(within(items[1]).getByText('Ana')).toBeTruthy();
    expect(items[1].querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-01-03T10:00:00.000Z',
    );
    expect(
      screen
        .getByRole('link', { name: "View Ana's profile" })
        .getAttribute('href'),
    ).toBe('/users/owner-1');
  });

  it('sends a reply and clears the form', async () => {
    vi.mocked(sendMessage).mockResolvedValue(message('m3', 'Great!', true));
    renderAt('/messages/conv-1', adopter);

    const field = await screen.findByLabelText(/Reply to Ana/);
    fireEvent.change(field, { target: { value: 'Great!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('conv-1', { body: 'Great!' }),
    );
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('loads earlier messages on request', async () => {
    vi.mocked(getConversationMessages)
      .mockResolvedValueOnce({
        items: [message('m2', 'Newer', false)],
        hasOlder: true,
      })
      .mockResolvedValueOnce({
        items: [message('m1', 'Older', true)],
        hasOlder: false,
      });
    renderAt('/messages/conv-1', adopter);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Load earlier messages' }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(2),
    );
    expect(getConversationMessages).toHaveBeenLastCalledWith('conv-1', {
      before: 'm2',
    });
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Older')).toBeTruthy();
    expect(within(second).getByText('Newer')).toBeTruthy();
  });

  it("treats someone else's conversation as not found", async () => {
    vi.mocked(getConversation).mockRejectedValue(
      new ApiError(404, 'CONVERSATION_NOT_FOUND'),
    );
    renderAt('/messages/conv-1', adopter);

    expect(
      await screen.findByRole('heading', { name: 'Conversation not found' }),
    ).toBeTruthy();
    expect(getConversationMessages).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Reply to/)).toBeNull();
  });
});
