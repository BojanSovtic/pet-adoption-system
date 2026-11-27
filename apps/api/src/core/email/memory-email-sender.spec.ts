import { describe, expect, it } from 'vitest';

import { createEmailSender } from './create-email-sender';
import { emailSender } from './index';
import {
  createMemoryEmailSender,
  isMemoryEmailSender,
} from './memory-email-sender';
import { sentEmails } from '../../test/email-capture';

const from = { address: 'no-reply@example.com', name: 'Pet Adoption' };
const message = {
  to: 'milo@example.com',
  subject: 'Hello',
  text: 'Hello Milo',
  html: '<p>Hello Milo</p>',
};

describe('createMemoryEmailSender', () => {
  it('keeps sent emails in order, with ids and the sender', async () => {
    const sender = createMemoryEmailSender(from);

    expect(await sender.send(message)).toEqual({ id: 'memory-1' });
    await sender.send({ ...message, subject: 'Second' });

    expect(sender.sent()).toEqual([
      { ...message, id: 'memory-1', from },
      { ...message, subject: 'Second', id: 'memory-2', from },
    ]);
  });

  it('keeps instances apart', async () => {
    const first = createMemoryEmailSender(from);
    const second = createMemoryEmailSender(from);

    await first.send(message);

    expect(first.sent()).toHaveLength(1);
    expect(second.sent()).toEqual([]);
  });

  it('is not changed by later changes to the message or the returned list', async () => {
    const sender = createMemoryEmailSender(from);
    const input = { ...message };

    await sender.send(input);
    input.subject = 'Changed';
    const list = sender.sent();
    list[0].text = 'Changed';
    list.pop();

    expect(sender.sent()).toEqual([{ ...message, id: 'memory-1', from }]);
  });

  it('clears the captured emails', async () => {
    const sender = createMemoryEmailSender(from);

    await sender.send(message);
    sender.clear();

    expect(sender.sent()).toEqual([]);
  });
});

describe('the app email sender in API tests', () => {
  it('is a memory sender', () => {
    expect(isMemoryEmailSender(emailSender)).toBe(true);
  });

  // The two tests below run in order: the first sends, the second must not
  // see it (email-capture.ts clears after each test).
  it('captures what the app sends', async () => {
    await emailSender.send(message);

    expect(sentEmails()).toEqual([
      { ...message, id: expect.any(String), from: expect.any(Object) },
    ]);
  });

  it('starts every test without emails', () => {
    expect(sentEmails()).toEqual([]);
  });
});

describe('createEmailSender', () => {
  it('builds the driver the configuration names', () => {
    expect(
      isMemoryEmailSender(createEmailSender({ driver: 'memory', from })),
    ).toBe(true);
    expect(
      isMemoryEmailSender(
        createEmailSender({ driver: 'outbox', from, directory: '/tmp/x' }),
      ),
    ).toBe(false);
  });
});
