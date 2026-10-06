import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Two regressions that are invisible to a code review but obvious in a browser:
 * the font dropping out after sign-in, and dark mode flashing light on load.
 */

test.describe('theme', () => {
  test('applies the stored colour scheme before any app JavaScript runs', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('mui-mode', 'dark'));

    // Block every app chunk: React never hydrates, so anything correct here can
    // only have come from the inline script in the server-rendered HTML.
    await context.route('**/_next/static/chunks/**', (route) => route.abort());

    const page = await context.newPage();
    await page.goto('/login');

    // The theme styles `[data-dark]`, so that is the attribute that must be set.
    await expect(page.locator('html')).toHaveAttribute('data-dark', '');
    // …and the page must actually paint dark, not light.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe('rgb(249, 249, 254)'); // light default

    await context.close();
  });

  test('keeps the app font after signing in, without a reload', async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');

    // signIn navigates client-side, which is exactly when the font used to break:
    // the (auth) route group rendered its own <html> and React dropped the root
    // layout's attributes on the way out, leaving the browser default font.
    const state = await page.evaluate(() => ({
      className: document.documentElement.className,
      family: getComputedStyle(document.body).fontFamily,
    }));

    expect(state.className).toMatch(/variable/);
    // The fallback family name only exists in the theme's font stack, so seeing
    // it proves the theme's styles are applied rather than the browser default.
    expect(state.family).toMatch(/IBM Plex Sans Fallback/);
  });
});
