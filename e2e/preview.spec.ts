import { expect, test, type Page } from '@playwright/test';
import { removeFile, signIn, uploadFile } from './helpers';

/** Reads the saved text straight from the API — the authoritative check. */
async function savedText(page: Page, filename: string): Promise<string> {
  return page.evaluate(async (name) => {
    const list = await fetch(`/api/uploads?search=${encodeURIComponent(name)}`).then((r) => r.json());
    const file = list.files?.[0];
    if (!file) return '__missing__';
    const res = await fetch(`/api/uploads/${file.id}/text`);
    const data = await res.json();
    return data.content ?? '__error__';
  }, filename);
}

async function publicUrl(page: Page, filename: string): Promise<string> {
  return page.evaluate(async (name) => {
    const list = await fetch(`/api/uploads?search=${encodeURIComponent(name)}`).then((r) => r.json());
    return list.files?.[0]?.publicUrl ?? '';
  }, filename);
}

/**
 * Preview and edit a text file through the real editor, then confirm the public
 * link serves what was saved.
 */
test.describe('preview', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
  });

  test('opens a text file, edits it, and saves', async ({ page }) => {
    const name = `e2e-preview-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'first draft');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Preview' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Monaco renders into an EditContext-backed element, not a plain textarea.
    const editor = dialog.getByRole('textbox', { name: 'Editor content' });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    // The button only becomes Save once there are changes to save.
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
    expect(await savedText(page, name)).toBe('first draft');

    // Monaco's content layer swallows clicks, so focus it directly.
    await editor.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('second draft', { delay: 50 });

    // Dirty state is surfaced by turning Close into Discard.
    await expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 15_000 });
    expect(await savedText(page, name)).toBe('second draft');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);

    // The public link serves the saved bytes, with no session.
    const url = await publicUrl(page, name);
    expect(url).toBeTruthy();
    const served = await page.request.get(url);
    expect(served.status()).toBe(200);
    expect(await served.text()).toBe('second draft');

    await removeFile(page, name);
  });

  test('plays a video in the dialog, without leaving the list', async ({ page }) => {
    const name = `e2e-clip-${Date.now()}.mp4`;
    await page.goto('/files');
    // The bytes do not matter: the kind is decided from the extension.
    await uploadFile(page, name, 'not really a video', 'video/mp4');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Preview' }).click();

    // Scoped by filename: the grid view's thumbnails are also <video>.
    const dialog = page.getByRole('dialog').filter({ hasText: name });
    const player = dialog.locator('video');
    await expect(player).toBeVisible({ timeout: 15_000 });
    await expect(player).toHaveAttribute('src', /files\//);
    await expect(player).toHaveAttribute('controls', '');
    // No navigation — this is the point of the change.
    await expect(page).toHaveURL(/\/files$/);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('warns before discarding unsaved edits', async ({ page }) => {
    const name = `e2e-dirty-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'do not lose me');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Preview' }).click();

    // Scoped by filename so it stays unambiguous once the confirm dialog opens.
    const dialog = page.getByRole('dialog').filter({ hasText: name });
    const editor = dialog.getByRole('textbox', { name: 'Editor content' });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    // Monaco's content layer swallows clicks, so focus it directly.
    await editor.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('edited but not saved', { delay: 50 });

    // Unsaved edits turn the footer button into Discard.
    const discard = dialog.getByRole('button', { name: 'Discard', exact: true });
    await expect(discard).toBeVisible();
    await discard.click();

    // The confirmation is an in-app dialog, not window.confirm.
    const confirm = page.getByRole('dialog').filter({ hasText: 'Discard changes' });
    await expect(confirm).toBeVisible();

    // Cancelling keeps the editor open and the edit unwritten.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(await savedText(page, name)).toBe('do not lose me');

    // Confirming closes the editor without saving.
    await discard.click();
    await confirm.getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog).toHaveCount(0);

    await removeFile(page, name);
  });
});
