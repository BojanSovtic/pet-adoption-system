import { expect, test } from '@playwright/test';

import { grantAdmin } from './support/admin';
import { createPet, makeUser, registerUser, uniqueId } from './support/api';
import { E2E_API_URL } from './support/config';

test('an admin suspends a user and hides their listing', async ({
  page,
  browser,
}) => {
  const admin = makeUser('Moderator');
  await registerUser(page.request, admin);
  grantAdmin(admin.email);

  // The member is signed in in their own browser and posts a pet.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const member = makeUser('Member');
  await registerUser(memberPage.request, member);
  const pet = await createPet(memberPage.request, {
    name: `Shadow ${uniqueId()}`,
  });

  // Hide the listing.
  await page.goto('/admin/pets');
  await page
    .getByRole('searchbox', { name: 'Search pets by name...' })
    .fill(pet.name);
  await page.getByRole('button', { name: `Hide listing: ${pet.name}` }).click();
  await page
    .getByLabel('Reason (optional, kept in the audit log)')
    .fill('Duplicate listing');
  await page.getByRole('button', { name: 'Yes, hide' }).click();
  await expect(page.getByText(`${pet.name} is hidden.`)).toBeVisible();

  // Visitors (a fresh, signed-out browser) no longer find it.
  const anonymous = await browser.newContext();
  const visitorView = await anonymous.request.get(
    `${E2E_API_URL}/pets/${pet._id}`,
  );
  expect(visitorView.status()).toBe(404);
  await anonymous.close();

  // Suspend the member.
  await page.goto('/admin/users');
  await page
    .getByRole('searchbox', { name: 'Search by name or email...' })
    .fill(member.email);
  await page.getByRole('button', { name: `Suspend: ${member.name}` }).click();
  await page.getByRole('button', { name: 'Yes, suspend' }).click();
  await expect(page.getByText(`${member.name} is suspended.`)).toBeVisible();

  // The member's open session stops working on its next request.
  const blocked = await memberPage.request.post(`${E2E_API_URL}/pets`, {
    data: { name: 'Another', species: 'dog', age: 1, description: 'Hi' },
  });
  expect(blocked.status()).toBe(403);
  expect(await blocked.json()).toEqual({ code: 'ACCOUNT_SUSPENDED' });

  await memberPage.goto('/pets');
  await expect(memberPage.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await memberContext.close();

  // Both actions are in the audit log.
  await page.goto('/admin/audit');
  await expect(
    page.getByText(`${admin.name} suspended ${member.name}`),
  ).toBeVisible();
  await expect(
    page.getByText(`${admin.name} hid the listing ${pet.name}`),
  ).toBeVisible();
  await expect(page.getByText('Reason: Duplicate listing')).toBeVisible();
});
