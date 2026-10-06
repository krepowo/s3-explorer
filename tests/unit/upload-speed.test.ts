import { describe, expect, it } from 'vitest';
import { createSpeedSampler } from '@/components/files/upload';

describe('createSpeedSampler', () => {
  it('reports nothing on the first event, which only sets the baseline', () => {
    const sampler = createSpeedSampler(300);
    expect(sampler.sample(0, 1_000)).toBe(0);
  });

  it('reports bytes per second once a window has passed', () => {
    const sampler = createSpeedSampler(300);
    sampler.sample(0, 1_000);
    // 1 MB over 0.5 s = 2 MB/s
    expect(sampler.sample(1_000_000, 1_500)).toBe(2_000_000);
  });

  it('holds the last value for events inside the window', () => {
    const sampler = createSpeedSampler(300);
    sampler.sample(0, 1_000);
    const rate = sampler.sample(1_000_000, 1_500);
    // 100 ms later: too soon to resample, so the number does not flicker.
    expect(sampler.sample(1_200_000, 1_600)).toBe(rate);
  });

  it('smooths a burst instead of reporting it raw', () => {
    const sampler = createSpeedSampler(300);
    sampler.sample(0, 1_000);
    sampler.sample(1_000_000, 1_500); // 2 MB/s
    // A 25 MB/s burst must move the reading, but not all the way.
    const blended = sampler.sample(11_000_000, 1_900);
    expect(blended).toBeGreaterThan(2_000_000);
    expect(blended).toBeLessThan(25_000_000);
  });

  it('follows a steady stream closely', () => {
    const sampler = createSpeedSampler(300);
    sampler.sample(0, 0);
    let rate = 0;
    for (let i = 1; i <= 10; i += 1) {
      // 3 MB/s, sampled every 400 ms
      rate = sampler.sample(i * 1_200_000, i * 400);
    }
    expect(rate).toBeGreaterThan(2_500_000);
    expect(rate).toBeLessThan(3_500_000);
  });

  it('does not divide by zero when two events share a timestamp', () => {
    const sampler = createSpeedSampler(0);
    sampler.sample(0, 1_000);
    expect(Number.isFinite(sampler.sample(500_000, 1_000))).toBe(true);
  });
});
