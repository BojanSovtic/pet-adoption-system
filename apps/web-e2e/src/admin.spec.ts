import { expect, test } from '@playwright/test';

import { grantAdmin } from './support/admin';
import { makeUser, registerUser } from './support/api';
import { E2E_API_URL } from './support/config';

test('an admin reviews the platform and makes another user an admin', async ({
  page,
  request,
}) => {
  // The admin registers like anyone else and is promoted by the CLI. The
  // browser is already signed in: the new role applies to the next request.
  const admin = makeUser('Admin');
  await registerUser(page.request, admin);
  grantAdmin(admin.email);

  // Someone to promote, signed in elsewhere.
  const colleague = makeUser('Colleague');
  await registerUser(request, colleague);

  await page.goto('/pets');
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administration' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  const sections = page.getByRole('navigation', {
    name: 'Administration sections',
  });
  await sections.getByRole('link', { name: 'Users' }).click();
  await page
    .getByRole('searchbox', { name: 'Search by name or email...' })
    .fill(colleague.email);
  await expect(page.getByText('1 user', { exact: true })).toBeVisible();

  await page
    .getByRole('button', { name: `Make admin: ${colleague.name}` })
    .click();
  await page.getByRole('button', { name: 'Yes, change role' }).click();

  await expect(
    page.getByText(`${colleague.name} is now an admin.`),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Remove admin: ${colleague.name}` }),
  ).toBeVisible();

  // The colleague's existing session has admin access at once.
  const stats = await request.get(`${E2E_API_URL}/admin/stats`);
  expect(stats.status()).toBe(200);

  // The change is in the audit log on the overview.
  await sections.getByRole('link', { name: 'Overview' }).click();
  await expect(
    page.getByText(
      `${admin.name} changed ${colleague.name} from User to Admin`,
    ),
  ).toBeVisible();
});

test('ordinary users cannot reach the admin area or its API', async ({
  page,
}) => {
  const user = makeUser('Member');
  await registerUser(page.request, user);

  await page.goto('/pets');
  await page.getByRole('button', { name: /Account menu/ }).click();
  await expect(page.getByRole('link', { name: 'My pets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

  // Direct navigation shows the forbidden page, not admin data.
  await page.goto('/admin/users');
  await expect(
    page.getByRole('heading', { name: 'Admins only' }),
  ).toBeVisible();

  // The API refuses on its own, whatever the UI shows.
  const me = await page.request.get(`${E2E_API_URL}/auth/me`);
  const { _id: userId } = await me.json();

  const list = await page.request.get(`${E2E_API_URL}/admin/users`);
  expect(list.status()).toBe(403);
  expect(await list.json()).toEqual({ code: 'ADMIN_REQUIRED' });

  const selfPromotion = await page.request.put(
    `${E2E_API_URL}/admin/users/${userId}/role`,
    { data: { role: 'admin' } },
  );
  expect(selfPromotion.status()).toBe(403);

  // Registering with a role field doesn't help either.
  const sneaky = makeUser('Sneaky');
  const registration = await page.request.post(`${E2E_API_URL}/auth/register`, {
    data: { ...sneaky, role: 'admin' },
  });
  expect((await registration.json()).role).toBe('user');
});
