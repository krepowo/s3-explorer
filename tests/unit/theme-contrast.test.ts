import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.1 contrast audit for the theme's colour pairs.
 *
 * Checking the palette directly (rather than scraping rendered pixels) keeps this
 * fast and deterministic while still catching the thing that matters: a text
 * colour that cannot be read on the surface it sits on.
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA for normal body text. */
const AA_TEXT = 4.5;
/** WCAG AA for large text and non-text UI (icons, borders, controls). */
const AA_LARGE = 3;

const LIGHT = {
  bg: '#F9F9FE',
  paper: '#FFFFFF',
  textPrimary: '#1C2025',
  textSecondary: '#434D5B',
  primary: '#0072E5',
  onPrimary: '#FFFFFF',
  appBar: '#FFFFFF',
  appBarText: '#1C2025',
  drawer: '#FFFFFF',
  navSelected: '#0059B2',
};

const DARK = {
  bg: '#090E10',
  paper: '#0A1929',
  textPrimary: '#E5EAF2',
  textSecondary: '#ADC2D9',
  primary: '#3399FF',
  onPrimary: '#06131F',
  appBar: '#0A1929',
  appBarText: '#E5EAF2',
  drawer: '#0A2744',
  navSelected: '#66B2FF',
};

describe('theme contrast — light', () => {
  it('body text on both surfaces', () => {
    expect(contrast(LIGHT.textPrimary, LIGHT.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(LIGHT.textPrimary, LIGHT.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('secondary text on both surfaces', () => {
    expect(contrast(LIGHT.textSecondary, LIGHT.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(LIGHT.textSecondary, LIGHT.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('button label on the primary fill', () => {
    expect(contrast(LIGHT.onPrimary, LIGHT.primary)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('app bar and drawer text', () => {
    expect(contrast(LIGHT.appBarText, LIGHT.appBar)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(LIGHT.textPrimary, LIGHT.drawer)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the selected navigation item is readable', () => {
    expect(contrast(LIGHT.navSelected, LIGHT.drawer)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('primary is distinguishable as an icon or control colour', () => {
    expect(contrast(LIGHT.primary, LIGHT.paper)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('theme contrast — dark', () => {
  it('body text on both surfaces', () => {
    expect(contrast(DARK.textPrimary, DARK.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(DARK.textPrimary, DARK.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('secondary text on both surfaces', () => {
    expect(contrast(DARK.textSecondary, DARK.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(DARK.textSecondary, DARK.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('button label on the primary fill', () => {
    expect(contrast(DARK.onPrimary, DARK.primary)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('app bar and drawer text', () => {
    expect(contrast(DARK.appBarText, DARK.appBar)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(DARK.textPrimary, DARK.drawer)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the selected navigation item is readable', () => {
    expect(contrast(DARK.navSelected, DARK.drawer)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('primary is distinguishable as an icon or control colour', () => {
    expect(contrast(DARK.primary, DARK.paper)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('contrast helper', () => {
  it('matches the known extremes', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrast('#0072E5', '#FFFFFF')).toBeCloseTo(contrast('#FFFFFF', '#0072E5'), 5);
  });
});
