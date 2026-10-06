import { expect, test, type Page } from '@playwright/test';
import { isAdmin, signIn } from './helpers';

/**
 * Admin-only behaviour: the sidebar menu, logging out, and the guard in front of
 * the destructive token rotation.
 *
 * Rotating is only safe against a throwaway account, so this asserts the gate
 * rather than completing a rotation — the real rotation is covered by the
 * integration suite.
 */

/**
 * Both drawers render the same menu, so every item exists twice in the DOM; only
 * one copy is visible at a given viewport.
 *
 * Navigation entries are links; Log out is a button, because it performs an
 * action rather than navigating.
 */
function sidebarItem(page: Page, role: 'link' | 'button', name: string) {
  return page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole(role, { name, exact: true })
    .filter({ visible: true });
}

test.describe('admin shell', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    test.skip(!(await isAdmin(page)), 'signed-in account is not an admin');
  });

  // Regression: these two pages used to render the uploader menu for an admin.
  test('keeps the full admin menu on every page', async ({ page }) => {
    for (const path of ['/files', '/settings', '/dashboard']) {
      await page.goto(path);
      for (const label of ['Dashboard', 'Files', 'Users', 'Connections', 'Audit', 'Settings']) {
        await expect(sidebarItem(page, 'link', label)).toBeVisible();
      }
      // The log out action lives at the bottom of the same menu.
      await expect(sidebarItem(page, 'button', 'Log out')).toBeVisible();
    }
  });

  test('sends the wordmark home', async ({ page }) => {
    await page.goto('/files');
    await sidebarItem(page, 'link', 'S3 Explorer').click();
    // For an admin that is the dashboard, not the file list.
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // Regression: the thumbnail used `width: 100%`, which inside a flex list row
  // made it the flexible item — it swallowed the whole row and squeezed the
  // filename, size and date into a sliver clipped at the right edge.
  test('keeps recent-upload thumbnails square', async ({ page }) => {
    await page.goto('/dashboard');
    const row = page.locator('main li').first();
    // The dashboard fetches its stats, so the list is not in the first paint.
    const appeared = await row
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!appeared, 'no recent uploads to measure');

    const box = await row.locator('> *').first().boundingBox();
    const rowBox = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(rowBox).not.toBeNull();

    // Square, give or take rounding — never a full-width banner.
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
    expect(box!.width).toBeLessThan(rowBox!.width / 2);
  });

  test('logs out from the sidebar', async ({ page }) => {
    await page.goto('/files');
    await sidebarItem(page, 'button', 'Log out').click();

    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // The session is really gone: a protected page bounces back to the form.
    await page.goto('/files');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('admin users', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    test.skip(!(await isAdmin(page)), 'signed-in account is not an admin');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  });

  test('rotating a token demands the email typed back', async ({ page }) => {
    const rotate = page.getByRole('button', { name: 'Rotate public token' }).first();
    await expect(rotate).toBeVisible();

    await rotate.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Every public link/)).toBeVisible();

    const confirm = dialog.getByRole('button', { name: 'Rotate token' });
    await expect(confirm).toBeDisabled();

    // The wrong email does not unlock it.
    await dialog.getByLabel('Type the email to confirm').fill('not-the-email@example.com');
    await expect(confirm).toBeDisabled();

    // Escape backs out without rotating.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('admin connections', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    test.skip(!(await isAdmin(page)), 'signed-in account is not an admin');
    await page.goto('/admin/connections');
    await expect(page.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible();
  });

  test('marks exactly one connection as primary', async ({ page }) => {
    const connections = await page.evaluate(async () => {
      const res = await fetch('/api/admin/connections');
      return res.ok ? res.json() : [];
    });
    test.skip(connections.length === 0, 'no connection configured');

    // The point of the flag: uploads always have one default to fall back on.
    const primaries = connections.filter((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primaries).toHaveLength(1);

    const row = page.getByRole('row', { name: new RegExp(primaries[0].label) });
    await expect(row.getByText('Primary')).toBeVisible();
    await expect(row.getByRole('button', { name: `Make ${primaries[0].label} primary` })).toBeDisabled();
  });
});
