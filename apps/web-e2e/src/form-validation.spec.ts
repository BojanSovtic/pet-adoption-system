import { expect, test } from '@playwright/test';

import { makeUser, registerUser } from './support/api';

// A phone-sized screen, where the pet form is much taller than the viewport.
test.use({ viewport: { width: 375, height: 667 } });

test('a failed submit of the long pet form focuses and shows the first invalid field', async ({
  page,
}) => {
  await registerUser(page.request, makeUser('Owner'));
  await page.goto('/pets/new');

  const name = page.getByLabel('Name', { exact: true });
  // Name stays empty; the other required fields are valid.
  await page.getByLabel('Age (years)').fill('3');
  await page.getByLabel('Description').fill('Calm and friendly.');

  const submit = page.getByRole('button', { name: 'Create pet' });
  await submit.scrollIntoViewIfNeeded();
  await expect(name).not.toBeInViewport();

  await submit.click();

  await expect(page.getByText('Name is required.')).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport({ ratio: 1 });
  await expect(page).toHaveURL(/\/pets\/new$/);
});
