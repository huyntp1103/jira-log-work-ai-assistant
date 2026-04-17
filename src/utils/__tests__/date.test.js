import { describe, it, expect } from 'vitest';
import { DateHelper } from '../date.js';

describe('DateHelper.getTargetDate', () => {
  it('Monday returns previous Friday', () => {
    // Monday 2026-04-06
    const monday = new Date(2026, 3, 6);
    expect(DateHelper.getTargetDate(monday)).toBe('2026-04-03');
  });

  it('Sunday returns previous Friday', () => {
    // Sunday 2026-04-05
    const sunday = new Date(2026, 3, 5);
    expect(DateHelper.getTargetDate(sunday)).toBe('2026-04-03');
  });

  it('Tuesday returns Monday (yesterday)', () => {
    const tuesday = new Date(2026, 3, 7);
    expect(DateHelper.getTargetDate(tuesday)).toBe('2026-04-06');
  });

  it('Wednesday returns Tuesday', () => {
    const wednesday = new Date(2026, 3, 8);
    expect(DateHelper.getTargetDate(wednesday)).toBe('2026-04-07');
  });

  it('Thursday returns Wednesday', () => {
    const thursday = new Date(2026, 3, 9);
    expect(DateHelper.getTargetDate(thursday)).toBe('2026-04-08');
  });

  it('Friday returns Thursday', () => {
    const friday = new Date(2026, 3, 10);
    expect(DateHelper.getTargetDate(friday)).toBe('2026-04-09');
  });

  it('Saturday returns Friday', () => {
    const saturday = new Date(2026, 3, 11);
    expect(DateHelper.getTargetDate(saturday)).toBe('2026-04-10');
  });

  it('handles month boundary (March Monday → February Friday)', () => {
    // Monday 2026-03-02
    const monday = new Date(2026, 2, 2);
    expect(DateHelper.getTargetDate(monday)).toBe('2026-02-27');
  });

  it('handles year boundary (Jan 1 Thursday → Dec 31 Wednesday)', () => {
    // Thursday 2026-01-01
    const jan1 = new Date(2026, 0, 1);
    expect(DateHelper.getTargetDate(jan1)).toBe('2025-12-31');
  });
});

describe('DateHelper.getReportDate', () => {
  it('Wednesday work date → Thursday report date', () => {
    // 2026-04-15 is a Wednesday
    expect(DateHelper.getReportDate('2026-04-15')).toBe('2026-04-16');
  });

  it('Friday work date → Monday report date (skip weekend)', () => {
    // 2026-04-17 is a Friday
    expect(DateHelper.getReportDate('2026-04-17')).toBe('2026-04-20');
  });

  it('Saturday work date → Monday report date', () => {
    // 2026-04-18 is a Saturday
    expect(DateHelper.getReportDate('2026-04-18')).toBe('2026-04-20');
  });

  it('Sunday work date → Monday report date', () => {
    // 2026-04-19 is a Sunday
    expect(DateHelper.getReportDate('2026-04-19')).toBe('2026-04-20');
  });

  it('Monday work date → Tuesday report date', () => {
    // 2026-04-13 is a Monday
    expect(DateHelper.getReportDate('2026-04-13')).toBe('2026-04-14');
  });

  it('handles month boundary (April 30 Thursday → May 1 Friday)', () => {
    expect(DateHelper.getReportDate('2026-04-30')).toBe('2026-05-01');
  });

  it('handles year boundary (Dec 31 Wednesday → Jan 1 Thursday)', () => {
    expect(DateHelper.getReportDate('2025-12-31')).toBe('2026-01-01');
  });
});

describe('DateHelper.formatDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date(2026, 3, 8);
    expect(DateHelper.formatDate(date)).toBe('2026-04-08');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5);
    expect(DateHelper.formatDate(date)).toBe('2026-01-05');
  });

  it('handles December correctly', () => {
    const date = new Date(2025, 11, 31);
    expect(DateHelper.formatDate(date)).toBe('2025-12-31');
  });
});
