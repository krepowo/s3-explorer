import { expect, test } from '@playwright/test';
import { removeFile, signIn, uploadFile } from './helpers';

/**
 * Upload → list → rename → public link → delete → preview, driven through the
 * real UI.
 *
 * Needs a live S3 endpoint and an account. Provide:
 *   E2E_EMAIL, E2E_PASSWORD   (defaults to the seeded admin)
 * The suite skips itself when the account cannot sign in, so it is safe to run
 * without a database.
 */
const NAME = `e2e-${Date.now()}.txt`;
const RENAMED = `renamed-${Date.now()}.txt`;

/**
 * A real 1×1 PNG (68 bytes, CRC-checked). A text file dressed up with
 * `mimeType: 'image/png'` is not enough here: the browser fails to decode it and
 * the thumbnail correctly falls back to an icon, which is a different test.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.describe('files', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
  });

  test('uploads, renames, and deletes a file', async ({ page }) => {
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: 'Files', level: 1 })).toBeVisible();

    await uploadFile(page, NAME, 'e2e content');

    // Listed in the shared pool.
    const row = page.getByRole('row', { name: new RegExp(NAME) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Rename changes the public URL.
    await row.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel('Filename').fill(RENAMED);
    await page.getByRole('button', { name: 'Rename' }).last().click();
    await expect(page.getByRole('row', { name: new RegExp(RENAMED) })).toBeVisible({ timeout: 15_000 });

    await removeFile(page, RENAMED);
  });

  test('deletes only after the confirmation is accepted', async ({ page }) => {
    const name = `e2e-confirm-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'keep me');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Confirmation is an in-app dialog, not window.confirm.
    await row.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Cancelling leaves the file alone.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeVisible();

    await removeFile(page, name);
  });

  test('clicking the file name opens the preview', async ({ page }) => {
    const name = `e2e-nameclick-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'click my name');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // The name has to read as clickable, or nothing advertises the click.
    const fileName = row.getByText(name, { exact: true });
    await expect(fileName).toHaveCSS('cursor', 'pointer');

    await fileName.click();
    const dialog = page.getByRole('dialog').filter({ hasText: name });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('textbox', { name: 'Editor content' })).toBeVisible({
      timeout: 20_000,
    });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('only the file name opens the preview', async ({ page }) => {
    const name = `e2e-onlyname-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'only the name');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    let previewFetches = 0;
    page.on('request', (request) => {
      if (request.url().includes('/content-url')) previewFetches += 1;
    });

    // Anywhere else in the row is inert: a stray click must not open anything.
    await row.getByRole('cell').nth(3).click(); // Size
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(previewFetches).toBe(0);

    await row.getByText(name, { exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: name });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // Exactly one request: the click must not be handled twice.
    expect(previewFetches).toBe(1);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('shows a loading popup while the preview is being prepared', async ({ page }) => {
    const name = `e2e-loading-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'slow to open');

    // Hold the content URL back so the loading state is observable at all.
    await page.route(
      (url) => url.pathname.endsWith('/content-url'),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );

    await page.getByRole('row', { name: new RegExp(name) }).getByText(name, { exact: true }).click();

    const loading = page.getByRole('dialog').filter({ hasText: name });
    await expect(loading.getByText('Preparing preview…')).toBeVisible({ timeout: 5_000 });

    // It is replaced by the real preview, not left open behind it.
    await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Preparing preview…')).toHaveCount(0);

    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('clicking an unpreviewable file name explains itself instead', async ({ page }) => {
    const name = `e2e-archive-${Date.now()}.zip`;
    await page.goto('/files');
    await uploadFile(page, name, 'not really a zip', 'application/zip');

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByText(name, { exact: true }).click();

    // Nothing opens; a corner notification says why.
    await expect(page.getByText('cannot be previewed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await removeFile(page, name);
  });

  test('shows upload throughput while a file is in flight', async ({ page }) => {
    const name = `e2e-speed-${Date.now()}.bin`;

    // Throttle the upload so the meter has time to report: on localhost the
    // transfer would otherwise finish inside a single sampling window.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20,
      downloadThroughput: -1,
      uploadThroughput: 512 * 1024, // 0.5 MB/s
    });

    await page.goto('/files');
    await page.getByRole('button', { name: 'Upload' }).first().click();
    const dialog = page.getByRole('dialog');

    await dialog.locator('input[type=file]').setInputFiles({
      name,
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc(2 * 1024 * 1024, 7), // 2 MB ≈ 4 s at this speed
    });
    await dialog.getByRole('button', { name: /^Upload \d+ file/ }).click();

    // A reading like "13% · 497 KB/s", close to the throttle above.
    const rate = dialog.getByText(/\d+% · [\d.]+ [KMG]?B\/s/).first();
    await expect(rate).toBeVisible({ timeout: 30_000 });
    const kbPerSecond = Number((await rate.innerText()).match(/· ([\d.]+) KB\/s/)?.[1]);
    expect(kbPerSecond).toBeGreaterThan(100);

    await expect(dialog.getByText('Uploaded')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('serves an uploaded file over its public link with no session', async ({ page, request }) => {
    const name = `e2e-public-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, name, 'public payload');

    const url = await page.evaluate(async (fileName) => {
      const res = await fetch(`/api/uploads?search=${encodeURIComponent(fileName)}`);
      const data = await res.json();
      return data.files?.[0]?.publicUrl ?? '';
    }, name);
    expect(url).toBeTruthy();

    // `request` is a fresh context with no cookies, so this is genuinely anonymous.
    const anonymous = await request.get(url);
    expect(anonymous.status()).toBe(200);
    expect(await anonymous.text()).toBe('public payload');

    await removeFile(page, name);
  });

  test('tells the user that a file name click previews', async ({ page }) => {
    await page.goto('/files');
    // Discoverability is the whole point: nothing else hints at the click.
    await expect(page.getByText('Click a file name to preview it')).toBeVisible();
  });

  test('stages dropped files until Upload is pressed, so a connection can be chosen', async ({ page }) => {
    const name = `e2e-staged-${Date.now()}.txt`;
    await page.goto('/files');

    const dataTransfer = await page.evaluateHandle((filename) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['staged content'], filename, { type: 'text/plain' }));
      return dt;
    }, name);
    await page.dispatchEvent('main', 'dragenter', { dataTransfer });
    await page.dispatchEvent('main', 'drop', { dataTransfer });

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Ready to upload (1)')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(name)).toBeVisible();

    // Nothing may reach storage before the user presses Upload: the whole point
    // of staging is that the connection can still be picked.
    const stored = () =>
      page.evaluate(async (filename) => {
        const res = await fetch(`/api/uploads?search=${encodeURIComponent(filename)}`);
        const data = (await res.json()) as { files?: { filename: string }[] };
        return (data.files ?? []).filter((file) => file.filename === filename).length;
      }, name);
    await page.waitForTimeout(2000);
    expect(await stored()).toBe(0);

    // The picker is usable while staged, and locked only during the transfer.
    const picker = dialog.getByRole('combobox', { name: 'Connection' });
    if (await picker.count()) await expect(picker).toBeEnabled();

    await dialog.getByRole('button', { name: 'Upload 1 file' }).click();
    await expect(dialog.getByText('Uploaded')).toBeVisible({ timeout: 30_000 });
    await expect.poll(stored, { timeout: 15_000 }).toBe(1);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await removeFile(page, name);
  });

  test('uploads files dropped anywhere on the page, including a second drop while the dialog is up', async ({
    page,
  }) => {
    const first = `e2e-drop-a-${Date.now()}.txt`;
    const second = `e2e-drop-b-${Date.now()}.txt`;
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: 'Files', level: 1 })).toBeVisible();

    const drop = async (name: string) => {
      const dataTransfer = await page.evaluateHandle((filename) => {
        const dt = new DataTransfer();
        dt.items.add(new File(['dropped content'], filename, { type: 'text/plain' }));
        return dt;
      }, name);
      await page.dispatchEvent('main', 'dragenter', { dataTransfer });
      await page.dispatchEvent('main', 'drop', { dataTransfer });
    };

    await drop(first);
    // The drop opens the dialog with the file staged, and sending it is explicit.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Ready to upload (1)')).toBeVisible({ timeout: 15_000 });

    // Regression: the page's full-screen overlay used to paint over the dialog,
    // and a second drop while the dialog was up was silently ignored because the
    // dialog only ever consumed its first batch.
    await dialog.getByText('Drag files here, or click to choose').dispatchEvent('dragenter', {
      dataTransfer: await page.evaluateHandle((filename) => {
        const dt = new DataTransfer();
        dt.items.add(new File(['dropped content'], filename, { type: 'text/plain' }));
        return dt;
      }, second),
    });
    await expect(page.getByText('Drop to upload')).toHaveCount(0);

    await drop(second);
    // Both drops are staged together, so one press sends both.
    await expect(dialog.getByText('Ready to upload (2)')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Upload 2 files' }).click();
    await expect(dialog.getByText('Uploaded')).toHaveCount(2, { timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByRole('row', { name: new RegExp(first) })).toBeVisible({ timeout: 15_000 });
    await removeFile(page, first);
    await removeFile(page, second);
  });

  test('paints a real thumbnail for images in card view', async ({ page }) => {
    const name = `e2e-thumb-${Date.now()}.png`;
    await page.goto('/files');
    await page.getByRole('button', { name: 'Upload' }).first().click();
    const upload = page.getByRole('dialog');
    await upload.locator('input[type=file]').setInputFiles({
      name,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await upload.getByRole('button', { name: /^Upload \d+ file/ }).click();
    await expect(upload.getByText('Uploaded')).toBeVisible({ timeout: 30_000 });
    await upload.getByRole('button', { name: 'Close' }).click();

    const url = await page.evaluate(async (fileName) => {
      const res = await fetch(`/api/uploads?search=${encodeURIComponent(fileName)}`);
      const data = await res.json();
      return data.files?.[0]?.publicUrl ?? '';
    }, name);
    expect(url).toBeTruthy();

    await page.getByRole('button', { name: 'Grid view' }).click();
    // The card loads the file itself, not a generic icon.
    await expect(page.locator(`img[src="${url}"]`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Table view' }).click();
    await removeFile(page, name);
  });

  test('falls back to an icon when a thumbnail will not load', async ({ page }) => {
    const name = `e2e-rotted-${Date.now()}.png`;
    await page.goto('/files');
    await uploadFile(page, name, 'not really a png', 'image/png');

    const url = await page.evaluate(async (fileName) => {
      const res = await fetch(`/api/uploads?search=${encodeURIComponent(fileName)}`);
      const data = await res.json();
      return data.files?.[0]?.publicUrl ?? '';
    }, name);
    expect(url).toBeTruthy();

    // A public URL can rot — object deleted, CDN 404ing, connection misconfigured.
    await page.route((candidate) => candidate.href === url, (route) => route.abort());

    await page.getByRole('button', { name: 'Grid view' }).click();
    // The card must drop the image rather than keep the broken-image glyph.
    await expect(page.locator(`img[src="${url}"]`)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Table view' }).click();
    await removeFile(page, name);
  });

  test('deletes every selected file from the selection bar', async ({ page }) => {
    const first = `e2e-multi-a-${Date.now()}.txt`;
    const second = `e2e-multi-b-${Date.now()}.txt`;
    await page.goto('/files');
    await uploadFile(page, first, 'one');
    await uploadFile(page, second, 'two');

    await page.getByRole('checkbox', { name: `Select ${first}` }).check();
    await page.getByRole('checkbox', { name: `Select ${second}` }).check();
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Delete selected' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('2 files will be removed')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('row', { name: new RegExp(first) })).toHaveCount(0, {
      timeout: 15_000,
    });

    // A row can leave the list without being deleted, so confirm against the API.
    await expect
      .poll(
        () =>
          page.evaluate(async ([a, b]) => {
            const res = await fetch('/api/uploads?limit=100');
            const data = (await res.json()) as { files?: { filename: string }[] };
            const names = (data.files ?? []).map((file) => file.filename);
            return names.includes(a) || names.includes(b);
          }, [first, second]),
        { timeout: 15_000, message: 'bulk delete left a file behind' },
      )
      .toBe(false);
  });
});
