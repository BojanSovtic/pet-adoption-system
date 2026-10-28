import { expect, test } from '@playwright/test';

import { createPet, makeUser, registerUser, uniqueId } from './support/api';

test('visitors can browse, search and filter pets', async ({
  page,
  request,
}) => {
  // A unique word in every name keeps this test's pets apart from pets
  // created by other tests running at the same time.
  const tag = `Zed${uniqueId()}`;
  await registerUser(request, makeUser('Owner'));
  await createPet(request, { name: `${tag} Rex`, species: 'dog' });
  await createPet(request, { name: `${tag} Luna`, species: 'cat' });
  await createPet(request, { name: `${tag} Max`, species: 'dog' });

  // Browsing is public: this page is not signed in.
  await page.goto('/pets');

  for (const name of ['Rex', 'Luna', 'Max']) {
    await expect(
      page.getByRole('heading', { name: `${tag} ${name}` }),
    ).toBeVisible();
  }

  await page.getByRole('searchbox').fill(tag.toLowerCase());

  await expect(page).toHaveURL(new RegExp(`search=${tag.toLowerCase()}`));
  await expect(page.getByText('3 pets found')).toBeVisible();

  await page.getByLabel('Filter by species').selectOption({ label: 'Cat' });

  await expect(page.getByText('1 pet found')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `${tag} Luna` }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: `${tag} Rex` })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: `${tag} Max` })).toHaveCount(
    0,
  );
});
