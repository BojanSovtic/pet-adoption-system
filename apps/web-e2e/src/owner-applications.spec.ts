import { expect, test } from '@playwright/test';

import {
  applyForPet,
  createPet,
  makeUser,
  registerUser,
  uniqueId,
} from './support/api';
import { E2E_API_URL } from './support/config';

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
  // Accepting is final, so the app asks for confirmation.
  await page.getByRole('button', { name: 'Yes, accept' }).click();

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

test('an owner sees pending applications and rejects one with a reason the applicant can read', async ({
  page,
  browser,
  request,
}) => {
  // Two registrations in the browser contexts and one through the API, with
  // production Argon2 parameters.
  test.slow();

  // The owner is signed in in this page and posts a pet.
  await registerUser(page.request, makeUser('Owner'));
  const pet = await createPet(page.request, { name: `Hazel ${uniqueId()}` });

  // The rejected applicant has their own browser; another applies by API.
  const applicantContext = await browser.newContext();
  const applicantPage = await applicantContext.newPage();
  const applicant = makeUser('Applicant');
  await registerUser(applicantPage.request, applicant);
  await applyForPet(applicantPage.request, pet._id, 'I work from home.');
  const other = makeUser('Other');
  await registerUser(request, other);
  await applyForPet(request, pet._id, 'We have a big garden.');

  // The pending count is on the account menu and in the received list.
  await page.goto('/pets');
  await expect(
    page.getByRole('button', {
      name: /Account menu.*2 applications waiting for your decision/,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page
    .getByRole('link', { name: /Applications.*2 applications waiting/ })
    .click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByText('2 applications are waiting for your decision.'),
  ).toBeVisible();

  // Rejecting needs a reason; only spaces don't count.
  const card = page
    .locator('[data-slot="card"]')
    .filter({ hasText: applicant.email });
  await card.getByRole('button', { name: 'Reject' }).click();
  const reasonField = page.getByRole('textbox', {
    name: /Reason for the applicant/,
  });
  await reasonField.fill('   ');
  await page.getByRole('button', { name: 'Yes, reject' }).click();
  await expect(
    page.getByText('Please explain why you are rejecting this application.'),
  ).toBeVisible();
  await expect(reasonField).toBeFocused();

  const reason = 'Hazel needs a home without other cats. Thank you!';
  await reasonField.fill(reason);
  await page.getByRole('button', { name: 'Yes, reject' }).click();

  await expect(page.getByText('Application rejected.')).toBeVisible();
  await expect(card.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(card.getByText(reason)).toBeVisible();
  // One left, everywhere.
  await expect(
    page.getByText('1 application is waiting for your decision.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Account menu.*1 application waiting for your decision/,
    }),
  ).toBeVisible();

  // The applicant reads the explanation, also after a reload and on the
  // pet's page.
  await applicantPage.goto('/applications');
  const myCard = applicantPage
    .locator('[data-slot="card"]')
    .filter({ hasText: pet.name });
  await expect(myCard.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(myCard.getByText("Owner's explanation")).toBeVisible();
  await expect(myCard.getByText(reason)).toBeVisible();

  await applicantPage.reload();
  await expect(myCard.getByText(reason)).toBeVisible();

  await applicantPage.goto(`/pets/${pet._id}`);
  await expect(applicantPage.getByText(reason)).toBeVisible();

  // The other applicant's application stays pending and carries no reason.
  const othersApplications = await request.get(
    `${E2E_API_URL}/applications/mine`,
  );
  const [othersApplication] = (await othersApplications.json()).items;
  expect(othersApplication.status).toBe('pending');
  expect(othersApplication).not.toHaveProperty('rejectionReason');

  await applicantContext.close();
});
