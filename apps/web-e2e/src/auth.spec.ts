import { expect, test } from '@playwright/test';

import { makeUser, registerUser } from './support/api';

test.describe('registration and login', () => {
  test('a visitor can register and is signed in', async ({ page }) => {
    const user = makeUser('Visitor');

    await page.goto('/register');
    await page.getByLabel('Name').fill(user.name);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/pets$/);
    await expect(page.getByText(user.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('a registered user can sign in', async ({ page, request }) => {
    // Registered through a separate API context, so the browser starts
    // signed out.
    const user = makeUser('Member');
    await registerUser(request, user);

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/pets$/);
    await expect(page.getByText(user.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('wrong credentials show an error and keep the user signed out', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Incorrect email or password.',
    );
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  });
});
