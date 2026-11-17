import { expect, test } from '@playwright/test';

import { createPet, makeUser, registerUser, uniqueId } from './support/api';
import { E2E_API_URL } from './support/config';

test('an owner adds a pet from the account menu and manages it on My pets', async ({
  page,
  request,
}) => {
  // Someone else's pet, which must never show on this user's page.
  await registerUser(request, makeUser('Other'));
  const otherPet = await createPet(request, { name: `Other ${uniqueId()}` });

  await registerUser(page.request, makeUser('Owner'));
  await page.goto('/pets');
  const menuButton = page.getByRole('button', { name: /Account menu/ });
  const menu = page.getByRole('navigation', { name: 'Account menu' });

  // Empty state first.
  await menuButton.click();
  await menu.getByRole('link', { name: 'My pets' }).click();
  await expect(page).toHaveURL(/\/my-pets$/);
  await expect(page.getByText("You haven't added any pets yet")).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

  // "Add a pet" from the menu opens the existing form, which lands on the pet.
  const name = `Pickle ${uniqueId()}`;
  await menuButton.click();
  await menu.getByRole('link', { name: 'Add a pet' }).click();
  await expect(page).toHaveURL(/\/pets\/new$/);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Age (years)').fill('2');
  await page.getByLabel('Description').fill('Loves naps in the sun.');
  await page.getByRole('button', { name: 'Create pet' }).click();
  await expect(
    page.getByRole('heading', { name, exact: true, level: 1 }),
  ).toBeVisible();

  // My pets lists only this user's pet, and deleting it keeps the user there.
  await menuButton.click();
  await menu.getByRole('link', { name: 'My pets' }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: otherPet.name, exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText(`${name} was deleted.`)).toBeVisible();
  await expect(page).toHaveURL(/\/my-pets$/);
  await expect(page.getByText("You haven't added any pets yet")).toBeVisible();
});

test('My pets requires sign-in, in the app and in the API', async ({
  page,
}) => {
  await page.goto('/my-pets');
  await expect(page).toHaveURL(/\/login$/);

  const response = await page.request.get(`${E2E_API_URL}/pets/mine`);
  expect(response.status()).toBe(401);
});
