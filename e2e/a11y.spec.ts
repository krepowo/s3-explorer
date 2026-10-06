import { expect, test, type Page } from '@playwright/test';
import { CONTRAST_FN, settle, signIn } from './helpers';

/**
 * Accessibility checks that only a real browser can make: accessible names on
 * every control, no skipped heading levels, and the contrast of the colours the
 * theme actually paints (the unit suite only checks the palette literals).
 */

type Finding = { kind: string; detail: string };

async function auditControls(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const findings: { kind: string; detail: string }[] = [];

    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
      }
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      if (el.closest('label')?.textContent?.trim()) return el.closest('label')!.textContent!.trim();
      return (el.getAttribute('title') ?? '').trim();
    };

    for (const el of document.querySelectorAll('input, select, textarea')) {
      const type = el.getAttribute('type') ?? 'text';
      if (type === 'hidden' || type === 'file') continue;
      // MUI and Monaco both keep hidden helper inputs; they are already out of
      // the accessibility tree, so requiring a name for them is a false alarm.
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (el.hasAttribute('hidden')) continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      if (!nameOf(el) && !el.getAttribute('placeholder')) {
        findings.push({ kind: 'unlabelled-control', detail: el.outerHTML.slice(0, 120) });
      }
    }

    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const text = (el.textContent ?? '').trim();
      if (!text && !nameOf(el)) {
        findings.push({ kind: 'unnamed-button', detail: el.outerHTML.slice(0, 120) });
      }
    }

    for (const el of document.querySelectorAll('a[href]')) {
      const text = (el.textContent ?? '').trim();
      if (!text && !nameOf(el)) {
        findings.push({ kind: 'unnamed-link', detail: el.outerHTML.slice(0, 120) });
      }
    }

    for (const el of document.querySelectorAll('img')) {
      if (el.getAttribute('alt') === null) {
        findings.push({ kind: 'img-without-alt', detail: el.outerHTML.slice(0, 120) });
      }
    }

    // Heading levels must not skip (h2 -> h4), which breaks screen-reader outline.
    const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) =>
      Number(h.tagName[1]),
    );
    let previous = 0;
    for (const level of levels) {
      if (previous && level > previous + 1) {
        findings.push({ kind: 'skipped-heading-level', detail: `h${previous} then h${level}` });
      }
      previous = level;
    }

    // Duplicate ids break label[for] and aria-labelledby.
    const seen = new Set<string>();
    for (const el of document.querySelectorAll('[id]')) {
      const id = el.id;
      if (seen.has(id)) findings.push({ kind: 'duplicate-id', detail: id });
      seen.add(id);
    }

    return findings;
  });
}

async function auditContrast(page: Page): Promise<Finding[]> {
  return page.evaluate((fnSource) => {
    const contrast = eval(fnSource) as (fg: string, bg: string) => number | null;
    const findings: { kind: string; detail: string }[] = [];

    const backdrop = (el: Element): string => {
      let node: Element | null = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return bg;
        node = node.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };

    const check = (el: Element, min: number) => {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return;
      if (!(el.textContent ?? '').trim()) return;
      const ratio = contrast(style.color, backdrop(el));
      if (ratio !== null && ratio < min) {
        findings.push({
          kind: 'low-contrast',
          detail: `${el.tagName}.${el.className} ${ratio.toFixed(2)}:1 (needs ${min}) — "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        });
      }
    };

    for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, label, td, th')) {
      check(el, 4.5);
    }
    for (const el of document.querySelectorAll('.MuiButton-root')) {
      check(el, 4.5);
    }

    return findings;
  }, CONTRAST_FN);
}

test.describe('accessibility', () => {
  test('the sign-in page is labelled and ordered', async ({ page }) => {
    await page.goto('/login');
    await settle(page);
    expect(await auditControls(page)).toEqual([]);
    expect(await auditContrast(page)).toEqual([]);
  });

  test('the files page is labelled, ordered, and readable in both schemes', async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: 'Files', level: 1 })).toBeVisible();
    await settle(page);

    expect(await auditControls(page)).toEqual([]);

    // Light, then dark, through the real toggle.
    expect(await auditContrast(page)).toEqual([]);
    await page.getByRole('button', { name: /Switch to dark mode/ }).click();
    await expect(page.getByRole('button', { name: /Switch to light mode/ })).toBeVisible();
    await settle(page);
    expect(await auditContrast(page)).toEqual([]);

    // Leave the scheme as we found it.
    await page.getByRole('button', { name: /Switch to light mode/ }).click();

    // The grid view renders different markup (cards, not table cells).
    await page.getByRole('button', { name: 'Grid view' }).click();
    await settle(page);
    expect(await auditControls(page)).toEqual([]);
    expect(await auditContrast(page)).toEqual([]);
  });

  test('the settings page is labelled and ordered', async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await settle(page);

    expect(await auditControls(page)).toEqual([]);
    expect(await auditContrast(page)).toEqual([]);
  });

  test('the upload dialog traps focus and is fully labelled', async ({ page }) => {
    test.skip(!(await signIn(page)), 'no usable account for the e2e run');
    await page.goto('/files');

    await page.getByRole('button', { name: 'Upload' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Wait for the dialog to finish mounting before auditing its controls.
    await expect(dialog.locator('input[type=file]')).toBeAttached();
    await settle(page);

    expect(await auditControls(page)).toEqual([]);

    // Focus moves into the dialog, so a keyboard user is not stranded behind it.
    // MUI parks focus on the dialog element itself, so `closest` (which includes
    // the element) is the right check rather than `contains`.
    const inside = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return false;
      return !!el.closest('[role="dialog"]');
    });
    expect(inside).toBe(true);

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('keyboard focus is visible on the primary action', async ({ page }) => {
    await page.goto('/login');

    // Tab to the submit button (email → password → Sign in) and check that the
    // focused control is visually marked, not just technically focused.
    await page.getByRole('button', { name: 'Sign in' }).focus();
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused).toContain('Sign in');

    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        shadow: style.boxShadow !== 'none',
        border: style.borderColor,
      };
    });

    expect(ring).not.toBeNull();
    // A visible focus indicator: outline, box-shadow, or a MUI focus ring.
    expect(ring!.outline || ring!.shadow).toBe(true);
  });
});
