import {
  addMonths,
  bodyDateToOccurred,
  monthBucket,
  monthRange,
  toLocalDate,
  weekBucket,
} from '../dates';

function localMs(y: number, m1: number, d: number, h = 12): number {
  return new Date(y, m1 - 1, d, h, 0, 0, 0).getTime();
}

describe('toLocalDate', () => {
  it('formats epoch ms as YYYY-MM-DD in device tz', () => {
    expect(toLocalDate(localMs(2026, 10, 2))).toBe('2026-10-02');
    expect(toLocalDate(localMs(2026, 1, 5))).toBe('2026-01-05');
  });
});

describe('bodyDateToOccurred', () => {
  it('returns receivedAt when body date matches receipt date', () => {
    const received = localMs(2026, 10, 2, 15);
    expect(bodyDateToOccurred('2026-10-02', received)).toBe(received);
  });
  it('returns noon local on the body date when it differs', () => {
    const received = localMs(2026, 10, 3, 1);
    const occurred = bodyDateToOccurred('2026-10-02', received);
    expect(toLocalDate(occurred)).toBe('2026-10-02');
    expect(new Date(occurred).getHours()).toBe(12);
  });
});

describe('weekBucket (Monday start)', () => {
  it('maps Sunday 2026-10-11 to Monday 2026-10-05', () => {
    expect(weekBucket('2026-10-11')).toBe('2026-10-05');
  });
  it('is identity on Mondays and maps mid-week days back', () => {
    expect(weekBucket('2026-10-12')).toBe('2026-10-12');
    expect(weekBucket('2026-10-07')).toBe('2026-10-05');
  });
  it('crosses month boundaries', () => {
    expect(weekBucket('2026-11-01')).toBe('2026-10-26');
  });
});

describe('month helpers', () => {
  it('monthBucket slices YYYY-MM', () => {
    expect(monthBucket('2026-10-11')).toBe('2026-10');
  });
  it('addMonths handles year rollover both ways', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });
  it('monthRange returns inclusive from / exclusive to', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});
