import { expect, test } from '@playwright/test';

import { createPet, makeUser, registerUser, uniqueId } from './support/api';

test('a signed-in user can apply to adopt another user’s pet', async ({
  page,
  request,
}) => {
  // The owner (separate API context) posts the pet.
  await registerUser(request, makeUser('Owner'));
  const pet = await createPet(request, { name: `Biscuit ${uniqueId()}` });

  // The applicant is signed in in the browser.
  await registerUser(page.request, makeUser('Applicant'));

  await page.goto(`/pets/${pet._id}`);
  await page
    .getByLabel(`Why would you like to adopt ${pet.name}?`)
    .fill('We have a garden and work from home.');
  await page.getByRole('button', { name: 'Send application' }).click();

  await expect(page.getByText('Your application was sent.')).toBeVisible();
  await expect(page.getByText('Your application:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send application' }),
  ).toHaveCount(0);

  // The application is listed as pending under "My applications".
  await page.goto('/applications');

  await expect(page.getByRole('link', { name: pet.name })).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
});
