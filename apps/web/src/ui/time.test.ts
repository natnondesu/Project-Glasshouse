import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const before = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

describe('relativeTime', () => {
  it('says nothing for the last minute, so the caller can say "just now"', () => {
    expect(relativeTime(before(30_000), NOW, 'en')).toBeNull();
  });

  it('picks the largest whole unit, in English', () => {
    expect(relativeTime(before(5 * MIN), NOW, 'en')).toBe('5 minutes ago');
    expect(relativeTime(before(3 * 60 * MIN), NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(before(1 * DAY), NOW, 'en')).toBe('yesterday');
    expect(relativeTime(before(3 * DAY), NOW, 'en')).toBe('3 days ago');
    expect(relativeTime(before(15 * DAY), NOW, 'en')).toBe('2 weeks ago');
    expect(relativeTime(before(8 * DAY), NOW, 'en')).toBe('1 week ago');
    expect(relativeTime(before(40 * DAY), NOW, 'en')).toBe('1 month ago');
    expect(relativeTime(before(95 * DAY), NOW, 'en')).toBe('3 months ago');
    expect(relativeTime(before(800 * DAY), NOW, 'en')).toBe('2 years ago');
  });

  it('reads in Thai', () => {
    expect(relativeTime(before(3 * DAY), NOW, 'th')).toBe('3 วันที่ผ่านมา');
    expect(relativeTime(before(1 * DAY), NOW, 'th')).toBe('เมื่อวาน');
  });

  it('shows a dash for a date it cannot read, like the other time formats', () => {
    expect(relativeTime('not a date', NOW, 'en')).toBe('—');
  });
});
