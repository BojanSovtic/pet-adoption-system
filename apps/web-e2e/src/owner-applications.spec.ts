import { expect, test } from '@playwright/test';

import {
  applyForPet,
  createPet,
  makeUser,
  registerUser,
  uniqueId,
} from './support/api';

test('a pet owner reviews and accepts an application', async ({
  page,
  request,
}) => {
  // The owner is signed in in the browser and posts the pet.
  await registerUser(page.request, makeUser('Owner'));
  const pet = await createPet(page.request, { name: `Pepper ${uniqueId()}` });

  // Another user (separate API context) applies.
  const applicant = makeUser('Applicant');
  await registerUser(request, applicant);
  await applyForPet(request, pet._id, 'I would love to give Pepper a home.');

  await page.goto('/applications');

  await expect(
    page.getByText(`${applicant.name} (${applicant.email})`),
  ).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Accept' }).click();

  await expect(
    page.getByText('Application accepted. The pet is now adopted.'),
  ).toBeVisible();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);

  // The pet itself is now adopted.
  await page.goto(`/pets/${pet._id}`);

  await expect(page.getByText('Adopted', { exact: true })).toBeVisible();
});
