import { expect, test } from '@playwright/test';

import { createPet, makeUser, registerUser, uniqueId } from './support/api';
import { E2E_WEB_URL } from './support/config';

test('an adopter and an owner exchange messages about a pet', async ({
  browser,
  page,
}) => {
  // The owner has their own browser context (separate session cookie).
  const ownerContext = await browser.newContext({ baseURL: E2E_WEB_URL });
  const ownerPage = await ownerContext.newPage();
  const owner = makeUser('Owner');
  await registerUser(ownerPage.request, owner);
  const pet = await createPet(ownerPage.request, {
    name: `Hazel ${uniqueId()}`,
  });

  // The adopter sees who listed the pet and can open their profile.
  const adopter = makeUser('Adopter');
  await registerUser(page.request, adopter);
  await page.goto(`/pets/${pet._id}`);

  const contact = page.locator('section', {
    has: page.getByRole('heading', { name: 'Listed by' }),
  });
  await expect(contact.getByText(owner.name)).toBeVisible();

  await contact.getByRole('link', { name: 'View profile' }).click();
  await expect(page.getByRole('heading', { name: owner.name })).toBeVisible();
  await expect(page.getByRole('link', { name: pet.name })).toBeVisible();
  // The profile shows no private contact details.
  await expect(page.getByText(owner.email)).toHaveCount(0);
  await page.goBack();

  // The adopter starts the conversation from the listing.
  await page.getByRole('button', { name: 'Message the owner' }).click();
  await page
    .getByLabel(`Your message to ${owner.name}`)
    .fill('Is Hazel good with cats?');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByText('Message sent.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Conversation with ${owner.name}` }),
  ).toBeVisible();
  await expect(page.getByText('Is Hazel good with cats?')).toBeVisible();

  // The owner finds it under Messages and replies.
  await ownerPage.goto('/messages');
  await ownerPage.getByRole('link', { name: pet.name }).click();
  await expect(ownerPage.getByText('Is Hazel good with cats?')).toBeVisible();
  await ownerPage
    .getByLabel(`Reply to ${adopter.name}`)
    .fill('Yes, she lives with two cats.');
  await ownerPage.getByRole('button', { name: 'Send message' }).click();
  await expect(ownerPage.getByText('Message sent.')).toBeVisible();

  // The adopter sees the reply, from the owner.
  await page.reload();
  const reply = page
    .getByRole('listitem')
    .filter({ hasText: 'Yes, she lives with two cats.' });
  await expect(reply).toBeVisible();
  await expect(reply.getByText(owner.name)).toBeVisible();

  // Back on the listing, the adopter continues instead of starting again.
  await page.goto(`/pets/${pet._id}`);
  await expect(
    page.getByRole('link', { name: 'Continue conversation' }),
  ).toBeVisible();

  // The owner gets no contact controls on their own listing.
  await ownerPage.goto(`/pets/${pet._id}`);
  await expect(ownerPage.getByRole('link', { name: 'Edit pet' })).toBeVisible();
  await expect(
    ownerPage.getByRole('button', { name: 'Message the owner' }),
  ).toHaveCount(0);

  await ownerContext.close();
});
