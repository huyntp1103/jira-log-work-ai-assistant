import { describe, it, expect } from 'vitest';
import { calculateProgress, currentProgress } from '../progress.js';

describe('calculateProgress', () => {
  const HP = 4; // hoursPerPoint

  it('returns N/A when no story points', () => {
    expect(calculateProgress(3600, 3600, 0, HP)).toBe('N/A');
  });

  it('returns N/A when story points is null/undefined', () => {
    expect(calculateProgress(3600, 3600, null, HP)).toBe('N/A');
    expect(calculateProgress(3600, 3600, undefined, HP)).toBe('N/A');
  });

  it('calculates simple progress (no cap needed)', () => {
    // 2 SP * 4h = 8h goal
    // Total: 4h (50%), Target: 2h (25%)
    // Prev: (4-2)/8 = 25%, Current: 4/8 = 50%
    // rawMax=50 <= 90 cap, no scaling
    const result = calculateProgress(4 * 3600, 2 * 3600, 2, HP);
    expect(result).toBe('25% ➔ 50%');
  });

  it('caps progress at 90% when exceeding goal', () => {
    // 1 SP * 4h = 4h goal
    // Total: 6h (150%), Target: 2h
    // Prev: 4/4 = 100%, Current: 6/4 = 150%
    // rawMax=150, ratio=90/150=0.6
    // prev=100*0.6=60, current=150*0.6=90
    const result = calculateProgress(6 * 3600, 2 * 3600, 1, HP);
    expect(result).toBe('60% ➔ 90%');
  });

  it('shows 100% for done status (QA READY)', () => {
    const result = calculateProgress(4 * 3600, 2 * 3600, 2, HP, 'QA READY');
    // prev raw = (4-2)/8 * 100 = 25%, rawMax=25 <= 90, no scaling → 25%
    expect(result).toBe('25% ➔ 100%');
  });

  it('shows 100% for done status (QA Success)', () => {
    const result = calculateProgress(8 * 3600, 4 * 3600, 2, HP, 'QA Success');
    // prev raw = (8-4)/8 * 100 = 50%, rawMax=50 <= 90, no scaling → 50%
    expect(result).toBe('50% ➔ 100%');
  });

  it('done status with over-spent previous still caps at 90%', () => {
    // 1 SP * 4h = 4h goal. Total: 8h, Target: 2h
    // prev raw = 6/4 * 100 = 150%, rawMax=150, ratio=90/150=0.6
    // prev = 150*0.6 = 90
    const result = calculateProgress(8 * 3600, 2 * 3600, 1, HP, 'QA READY');
    expect(result).toBe('90% ➔ 100%');
  });

  it('handles zero previous time (first log)', () => {
    // 2 SP * 4h = 8h goal. Total: 2h, Target: 2h
    // prev=0, current=25%
    const result = calculateProgress(2 * 3600, 2 * 3600, 2, HP);
    expect(result).toBe('0% ➔ 25%');
  });

  it('never shows negative progress', () => {
    // Edge case: secondsOnTarget > totalSpentSeconds shouldn't happen,
    // but if it does, prev should be 0% not negative
    const result = calculateProgress(1 * 3600, 2 * 3600, 2, HP);
    expect(result).toMatch(/^0% ➔/);
  });
});

describe('currentProgress', () => {
  const HP = 4;

  it('returns 100 for QA READY status', () => {
    expect(currentProgress(0, 2, HP, 'QA READY')).toBe(100);
  });

  it('returns 100 for QA Success status', () => {
    expect(currentProgress(0, 2, HP, 'QA Success')).toBe(100);
  });

  it('returns 0 when no story points', () => {
    expect(currentProgress(3600, 0, HP)).toBe(0);
  });

  it('calculates progress percentage', () => {
    // 2 SP * 4h = 8h goal. Spent: 4h → 50%
    expect(currentProgress(4 * 3600, 2, HP)).toBe(50);
  });

  it('caps at 90% when over goal', () => {
    // 1 SP * 4h = 4h goal. Spent: 8h → raw 200%
    // scaleWithCap(200, 200, 90) → 200 * (90/200) = 90
    expect(currentProgress(8 * 3600, 1, HP)).toBe(90);
  });

  it('returns exact value when under cap', () => {
    // 2 SP * 4h = 8h goal. Spent: 2h → 25%
    expect(currentProgress(2 * 3600, 2, HP)).toBe(25);
  });
});
