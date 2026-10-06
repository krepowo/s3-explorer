import { expect, type Page } from '@playwright/test';

export const email = process.env.E2E_EMAIL ?? 'admin@example.com';
export const password = process.env.E2E_PASSWORD ?? 'changeme123';

/**
 * Signs in, or returns false when the credentials do not work — callers turn
 * that into `test.skip` so the suite can run without a seeded database.
 */
export async function signIn(page: Page): Promise<boolean> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  return page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

/** Uploads one file through the upload dialog and waits for it to land. */
export async function uploadFile(
  page: Page,
  name: string,
  body: string,
  mimeType = 'text/plain',
): Promise<void> {
  await page.getByRole('button', { name: 'Upload' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from(body),
  });
  // Choosing files only stages them — the dialog's Upload button sends them.
  await dialog.getByRole('button', { name: /^Upload \d+ file/ }).click();
  await expect(dialog.getByText('Uploaded')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Close' }).click();
}

/**
 * Stops CSS transitions. Measuring colours mid-transition reports whatever
 * intermediate value the animation happens to be on, which looks like a contrast
 * failure that is not really there.
 */
export async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
}

/** True when the API grants the signed-in account admin access. */
export async function isAdmin(page: Page): Promise<boolean> {
  return page.evaluate(async () => (await fetch('/api/admin/users')).ok);
}

/**
 * Deletes a file from the pool through the UI, including the in-app confirm
 * dialog (the app no longer uses window.confirm).
 */
export async function removeFile(page: Page, filename: string): Promise<void> {
  const row = page.getByRole('row', { name: new RegExp(filename) });
  // Wait for the list to load; otherwise cleanup silently no-ops and the
  // artifact stays in the pool.
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  // A row can leave the list for reasons other than a delete, so confirm
  // against the API. A leaked object outlives the run and reads as a phantom
  // file to whoever uses the pool next.
  await expect
    .poll(
      () =>
        page.evaluate(async (name) => {
          const res = await fetch(`/api/uploads?search=${encodeURIComponent(name)}`);
          const data = (await res.json()) as { files?: { filename: string }[] };
          return (data.files ?? []).some((file) => file.filename === name);
        }, filename),
      { timeout: 15_000, message: `cleanup did not delete ${filename}` },
    )
    .toBe(false);
}

/** WCAG relative-luminance contrast ratio, evaluated in the browser. */
export const CONTRAST_FN = `
  (fg, bg) => {
    const parse = (c) => {
      const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = parse(fg), b = parse(bg);
    if (!a || !b) return null;
    const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  }
`;
