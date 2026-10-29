import request from 'supertest';
import {
  CONVERSATION_MESSAGE_MAX_LENGTH,
  CONVERSATION_MESSAGES_PAGE_SIZE,
} from '@pet-adoption/models';

import { app } from '../app';
import { ApplicationModel } from '../applications/application.model';
import { USER_WRITE_LIMITS } from '../middleware/rate-limit';
import { PetModel } from '../pets/pet.model';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { ConversationModel, MessageModel } from './conversation.model';

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
};

const missingId = '507f1f77bcf86cd799439011';

type Scenario = {
  owner: SignedInAgent;
  adopter: SignedInAgent;
  petId: string;
};

const setUp = async (): Promise<Scenario> => {
  const owner = await createSignedInAgent('owner@example.com', 'Ana');
  const adopter = await createSignedInAgent('adopter@example.com', 'Marko');
  const pet = await owner.agent.post('/api/pets').send(validPet);

  return { owner, adopter, petId: pet.body._id };
};

const contactOwner = (
  user: SignedInAgent,
  petId: string,
  body: object = { body: 'Is Milo good with children?' },
) => user.agent.post(`/api/pets/${petId}/conversations`).send(body);

const reply = (
  user: SignedInAgent,
  conversationId: string,
  body: object = { body: 'Yes, very.' },
) =>
  user.agent.post(`/api/conversations/${conversationId}/messages`).send(body);

const startConversation = async ({ adopter, petId }: Scenario) =>
  (await contactOwner(adopter, petId)).body._id as string;

// Several users are registered per test (Argon2id hashing).
describe('conversations', { timeout: 30_000 }, () => {
  describe('starting from a pet', () => {
    it('requires authentication', async () => {
      const { petId } = await setUp();

      const response = await request(app)
        .post(`/api/pets/${petId}/conversations`)
        .send({ body: 'Hello' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
      expect(await ConversationModel.countDocuments()).toBe(0);
    });

    it('starts a conversation with the owner, without private details', async () => {
      const scenario = await setUp();

      const response = await contactOwner(scenario.adopter, scenario.petId, {
        body: '  Is Milo good with children?  ',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        role: 'adopter',
        pet: { _id: scenario.petId, name: 'Milo', status: 'available' },
        otherParticipant: { _id: scenario.owner.userId, name: 'Ana' },
        lastMessage: { body: 'Is Milo good with children?', fromMe: true },
      });

      // No emails, and no sender ids beyond the other participant's.
      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain('@example.com');
      expect(raw).not.toContain(scenario.adopter.userId);
    });

    it('takes the sender from the session, never from the request', async () => {
      const scenario = await setUp();

      const response = await contactOwner(scenario.adopter, scenario.petId, {
        body: 'Hello',
        sender: scenario.owner.userId,
        adopter: scenario.owner.userId,
        petOwner: scenario.adopter.userId,
      });

      expect(response.status).toBe(201);

      const conversation = await ConversationModel.findById(
        response.body._id,
      ).lean();
      expect(conversation?.adopter.toString()).toBe(scenario.adopter.userId);
      expect(conversation?.petOwner.toString()).toBe(scenario.owner.userId);

      const messages = await MessageModel.find().lean();
      expect(messages).toHaveLength(1);
      expect(messages[0].sender.toString()).toBe(scenario.adopter.userId);
    });

    it('continues the existing conversation instead of starting another', async () => {
      const scenario = await setUp();
      const first = await contactOwner(scenario.adopter, scenario.petId);

      const second = await contactOwner(scenario.adopter, scenario.petId, {
        body: 'Another question.',
      });

      expect(second.status).toBe(200);
      expect(second.body._id).toBe(first.body._id);
      expect(await ConversationModel.countDocuments()).toBe(1);
      expect(await MessageModel.countDocuments()).toBe(2);
    });

    it('refuses messages to oneself (own pet)', async () => {
      const { owner, petId } = await setUp();

      const response = await contactOwner(owner, petId);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'CANNOT_MESSAGE_OWN_PET' });
      expect(await ConversationModel.countDocuments()).toBe(0);
      expect(await MessageModel.countDocuments()).toBe(0);
    });

    it('answers 404 for a missing or hidden pet and 400 for an invalid id', async () => {
      const { adopter, petId } = await setUp();

      const missing = await contactOwner(adopter, missingId);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'PET_NOT_FOUND' });

      await PetModel.updateOne({ _id: petId }, { hiddenAt: new Date() });
      const hidden = await contactOwner(adopter, petId);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual({ code: 'PET_NOT_FOUND' });

      const invalid = await contactOwner(adopter, 'not-an-id');
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'INVALID_PET_ID' });

      expect(await ConversationModel.countDocuments()).toBe(0);
    });

    it('starts no new conversation about an adopted pet, but continues an existing one', async () => {
      const scenario = await setUp();
      const latecomer = await createSignedInAgent('late@example.com');
      const conversationId = await startConversation(scenario);
      await PetModel.updateOne({ _id: scenario.petId }, { status: 'adopted' });

      const fresh = await contactOwner(latecomer, scenario.petId);
      expect(fresh.status).toBe(409);
      expect(fresh.body).toEqual({ code: 'PET_NOT_AVAILABLE' });

      const continued = await contactOwner(scenario.adopter, scenario.petId);
      expect(continued.status).toBe(200);
      expect(continued.body._id).toBe(conversationId);

      const ownerReply = await reply(scenario.owner, conversationId);
      expect(ownerReply.status).toBe(201);
    });

    it('leaves the pet and the adoption workflow untouched', async () => {
      const scenario = await setUp();

      await startConversation(scenario);

      const pet = await PetModel.findById(scenario.petId).lean();
      expect(pet?.status).toBe('available');
      expect(await ApplicationModel.countDocuments()).toBe(0);

      // Applying still works as before.
      const application = await scenario.adopter.agent
        .post(`/api/pets/${scenario.petId}/applications`)
        .send({ message: 'We have a garden.' });
      expect(application.status).toBe(201);
    });
  });

  describe('message validation', () => {
    it.each([
      ['an empty body', { body: '' }],
      ['only whitespace', { body: '   \n ' }],
      ['a missing body', {}],
      ['a non-string body', { body: 42 }],
      [
        'a body over the limit',
        { body: 'a'.repeat(CONVERSATION_MESSAGE_MAX_LENGTH + 1) },
      ],
    ])('rejects %s', async (_label, body) => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);

      const start = await contactOwner(scenario.adopter, scenario.petId, body);
      expect(start.status).toBe(400);
      expect(start.body.code).toBe('VALIDATION_FAILED');
      expect(start.body.details).toEqual([
        expect.objectContaining({ field: 'body' }),
      ]);

      const replyResponse = await reply(scenario.owner, conversationId, body);
      expect(replyResponse.status).toBe(400);
      expect(replyResponse.body.code).toBe('VALIDATION_FAILED');

      // Only the message that started the conversation was stored.
      expect(await MessageModel.countDocuments()).toBe(1);
    });

    it('accepts a body of exactly the maximum length', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);

      const response = await reply(scenario.owner, conversationId, {
        body: 'a'.repeat(CONVERSATION_MESSAGE_MAX_LENGTH),
      });

      expect(response.status).toBe(201);
      expect(response.body.body).toHaveLength(CONVERSATION_MESSAGE_MAX_LENGTH);
    });
  });

  describe('exchanging messages', () => {
    it('lets the owner and the adopter read and reply', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);

      // The owner finds it in their list, from their side.
      const ownerList = await scenario.owner.agent.get('/api/conversations');
      expect(ownerList.status).toBe(200);
      expect(ownerList.body).toMatchObject({ totalItems: 1 });
      expect(ownerList.body.items[0]).toMatchObject({
        _id: conversationId,
        role: 'owner',
        otherParticipant: { _id: scenario.adopter.userId, name: 'Marko' },
        lastMessage: { fromMe: false },
      });

      const ownerReply = await reply(scenario.owner, conversationId, {
        body: 'Yes, he loves kids.',
        // Ignored: the sender is the signed-in owner.
        sender: scenario.adopter.userId,
      });
      expect(ownerReply.status).toBe(201);
      expect(ownerReply.body).toMatchObject({
        body: 'Yes, he loves kids.',
        fromMe: true,
      });
      expect(Object.keys(ownerReply.body).sort()).toEqual([
        '_id',
        'body',
        'createdAt',
        'fromMe',
      ]);

      const stored = await MessageModel.findById(ownerReply.body._id).lean();
      expect(stored?.sender.toString()).toBe(scenario.owner.userId);

      // The adopter sees both messages, oldest first, from their side.
      const thread = await scenario.adopter.agent.get(
        `/api/conversations/${conversationId}/messages`,
      );
      expect(thread.status).toBe(200);
      expect(thread.body).toMatchObject({
        hasOlder: false,
        items: [
          { body: 'Is Milo good with children?', fromMe: true },
          { body: 'Yes, he loves kids.', fromMe: false },
        ],
      });

      const details = await scenario.adopter.agent.get(
        `/api/conversations/${conversationId}`,
      );
      expect(details.status).toBe(200);
      expect(details.body).toMatchObject({
        role: 'adopter',
        lastMessage: { body: 'Yes, he loves kids.', fromMe: false },
      });
    });

    it('lists the newest activity first and can filter by pet', async () => {
      const scenario = await setUp();
      const otherPet = await scenario.owner.agent
        .post('/api/pets')
        .send({ ...validPet, name: 'Luna' });
      const first = await startConversation(scenario);
      const second = (await contactOwner(scenario.adopter, otherPet.body._id))
        .body._id;

      const all = await scenario.adopter.agent.get('/api/conversations');
      expect(all.body.items.map((item: { _id: string }) => item._id)).toEqual([
        second,
        first,
      ]);

      const filtered = await scenario.adopter.agent.get(
        `/api/conversations?pet=${scenario.petId}&pageSize=1`,
      );
      expect(filtered.body).toMatchObject({ totalItems: 1, pageSize: 1 });
      expect(filtered.body.items[0]._id).toBe(first);

      const invalid = await scenario.adopter.agent.get(
        '/api/conversations?pet=nope',
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');
    });

    it('pages older messages with a cursor', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);
      const conversation = await ConversationModel.findById(conversationId);
      const start = Date.now();

      await MessageModel.insertMany(
        Array.from({ length: CONVERSATION_MESSAGES_PAGE_SIZE }, (_, index) => ({
          conversation: conversationId,
          sender: conversation?.petOwner,
          body: `Message ${index}`,
          createdAt: new Date(start + index),
        })),
      );

      const newest = await scenario.adopter.agent.get(
        `/api/conversations/${conversationId}/messages`,
      );
      expect(newest.body.hasOlder).toBe(true);
      expect(newest.body.items).toHaveLength(CONVERSATION_MESSAGES_PAGE_SIZE);
      expect(newest.body.items.at(-1).body).toBe(
        `Message ${CONVERSATION_MESSAGES_PAGE_SIZE - 1}`,
      );

      const older = await scenario.adopter.agent.get(
        `/api/conversations/${conversationId}/messages?before=${newest.body.items[0]._id}`,
      );
      expect(older.body).toMatchObject({
        hasOlder: false,
        items: [{ body: 'Is Milo good with children?', fromMe: true }],
      });
    });
  });

  describe('access by other users', () => {
    it('hides a conversation from everyone but its two participants', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);
      const stranger = await createSignedInAgent('stranger@example.com');

      const list = await stranger.agent.get('/api/conversations');
      expect(list.body).toMatchObject({ items: [], totalItems: 0 });

      const byPet = await stranger.agent.get(
        `/api/conversations?pet=${scenario.petId}`,
      );
      expect(byPet.body.totalItems).toBe(0);

      for (const path of [
        `/api/conversations/${conversationId}`,
        `/api/conversations/${conversationId}/messages`,
      ]) {
        const response = await stranger.agent.get(path);
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ code: 'CONVERSATION_NOT_FOUND' });
      }

      const post = await reply(stranger, conversationId, { body: 'Hi!' });
      expect(post.status).toBe(404);
      expect(post.body).toEqual({ code: 'CONVERSATION_NOT_FOUND' });
      expect(await MessageModel.countDocuments()).toBe(1);
    });

    it('does not leak messages through a cursor from another conversation', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);
      const stranger = await createSignedInAgent('stranger@example.com');
      const own = await contactOwner(stranger, scenario.petId, {
        body: 'My own question.',
      });
      const [foreignMessage] = await MessageModel.find({
        conversation: conversationId,
      }).lean();

      const response = await stranger.agent.get(
        `/api/conversations/${own.body._id}/messages?before=ffffffffffffffffffffffff`,
      );

      expect(response.status).toBe(200);
      expect(
        response.body.items.map((m: { _id: string }) => m._id),
      ).not.toContain(foreignMessage._id.toString());
      expect(response.body.items).toEqual([
        expect.objectContaining({ body: 'My own question.', fromMe: true }),
      ]);
    });

    it('requires authentication and valid ids everywhere', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);

      for (const path of [
        '/api/conversations',
        `/api/conversations/${conversationId}`,
        `/api/conversations/${conversationId}/messages`,
      ]) {
        const response = await request(app).get(path);
        expect(response.status).toBe(401);
      }

      const anonymousReply = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .send({ body: 'Hi' });
      expect(anonymousReply.status).toBe(401);

      const invalid = await scenario.adopter.agent.get(
        '/api/conversations/not-an-id',
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'INVALID_CONVERSATION_ID' });

      const missing = await reply(scenario.adopter, missingId);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ code: 'CONVERSATION_NOT_FOUND' });
    });
  });

  describe('pet deletion and rate limits', () => {
    it('deletes the pet’s conversations and messages with the pet', async () => {
      const scenario = await setUp();
      await startConversation(scenario);

      const response = await scenario.owner.agent.delete(
        `/api/pets/${scenario.petId}`,
      );

      expect(response.status).toBe(204);
      expect(await ConversationModel.countDocuments()).toBe(0);
      expect(await MessageModel.countDocuments()).toBe(0);
    });

    it('limits messages per user', async () => {
      const scenario = await setUp();
      const conversationId = await startConversation(scenario);
      const { limit } = USER_WRITE_LIMITS.messageSend.burst;

      // The message that started the conversation counts too.
      for (let index = 1; index < limit; index += 1) {
        const response = await reply(scenario.adopter, conversationId);
        expect(response.status).toBe(201);
      }

      const limited = await reply(scenario.adopter, conversationId);
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({ code: 'RATE_LIMITED' });

      // The other participant has their own budget.
      const ownerReply = await reply(scenario.owner, conversationId);
      expect(ownerReply.status).toBe(201);
    });
  });
});
