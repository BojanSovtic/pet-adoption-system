import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from './support/accessibility';
import { grantAdmin } from './support/admin';
import {
  applyForPet,
  createPet,
  makeUser,
  registerUser,
  uniqueId,
} from './support/api';

// Automated WCAG 2.2 A/AA checks (axe) of representative pages and states.
// Each check runs after the state is visible; the journeys themselves are
// covered by the other specs. The @a11y tag selects these tests for the
// Markdown report (support/accessibility-reporter.ts).

test.describe('accessibility (axe, WCAG 2.2 A/AA rules) @a11y', () => {
  test('public pages, signed out', async ({ page, request }) => {
    // A registration with the production Argon2 parameters, five page loads
    // and five scans: just past the default 30 s on a loaded machine.
    test.slow();

    await registerUser(request, makeUser('Owner'));
    const pet = await createPet(request, { name: `Axel ${uniqueId()}` });

    await page.goto('/pets');
    await expect(page.getByRole('heading', { name: pet.name })).toBeVisible();
    await expectNoAccessibilityViolations(page, 'pets list');

    await page.goto(`/pets/${pet._id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: pet.name }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'pet details, signed out');

    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'sign-in');

    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Name')).toBeFocused();
    await expectNoAccessibilityViolations(
      page,
      'registration with field errors',
    );

    await page.goto('/no-such-page');
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'not found');
  });

  test('signed-in pages, forms and dialogs', async ({ page, request }) => {
    // Two registrations with the production Argon2 parameters and seven page
    // states, each scanned.
    test.slow();

    const owner = makeUser('Owner');
    await registerUser(request, owner);
    const othersPet = await createPet(request, { name: `Bran ${uniqueId()}` });

    await registerUser(page.request, makeUser('Member'));
    const ownPet = await createPet(page.request, {
      name: `Cleo ${uniqueId()}`,
    });

    // Someone else's pet: the application form and the contact section.
    await page.goto(`/pets/${othersPet._id}`);
    await expect(
      page.getByRole('button', { name: 'Send application' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'pet details, can apply');

    const menuButton = page.getByRole('button', { name: /Account menu/ });
    await menuButton.click();
    await expect(
      page.getByRole('navigation', { name: 'Account menu' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'account menu open');
    await menuButton.click();

    await page.goto('/pets/new');
    await page.getByRole('button', { name: 'Create pet' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await expectNoAccessibilityViolations(page, 'pet form with field errors');

    await page.goto('/my-pets');
    await expect(
      page.getByRole('link', { name: ownPet.name, exact: true }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'my pets');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expectNoAccessibilityViolations(page, 'delete confirmation dialog');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await applyForPet(page.request, othersPet._id, 'We have a big garden.');
    await page.goto('/applications');
    await expect(
      page.getByRole('link', { name: othersPet.name }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'applications');

    await page.goto('/messages');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Messages' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'messages, empty');
  });

  test('admin area', async ({ page }) => {
    const admin = makeUser('Admin');
    await registerUser(page.request, admin);
    grantAdmin(admin.email);

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Administration' }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, 'admin overview');

    await page.goto('/admin/users');
    await expect(page.getByText(admin.email)).toBeVisible();
    await expectNoAccessibilityViolations(page, 'admin users');
  });
});
