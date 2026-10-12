import { amountToMinor, formatINR, minorToFloat, parseAmountSafe } from '../money';

describe('amountToMinor', () => {
  it('converts plain rupees to paise', () => {
    expect(amountToMinor('30')).toBe(3000);
  });
  it('converts decimals without float math', () => {
    expect(amountToMinor('6.73')).toBe(673);
    expect(amountToMinor('2,500.00')).toBe(250000);
  });
  it('handles Indian grouping commas', () => {
    expect(amountToMinor('1,00,000.50')).toBe(10000050);
    expect(amountToMinor('3,364.45')).toBe(336445);
  });
  it('pads single-digit fractions', () => {
    expect(amountToMinor('10.5')).toBe(1050);
  });
  it('treats missing fraction as .00', () => {
    expect(amountToMinor('1,00')).toBe(10000);
  });
  it('rejects invalid input', () => {
    expect(() => amountToMinor('')).toThrow();
    expect(() => amountToMinor('abc')).toThrow();
    expect(() => amountToMinor('12.34.56')).toThrow();
  });
});

describe('parseAmountSafe', () => {
  it('returns null for invalid input instead of throwing', () => {
    expect(parseAmountSafe('abc')).toBeNull();
    expect(parseAmountSafe('')).toBeNull();
    expect(parseAmountSafe('42.5')).toBe(4250);
  });
});

describe('minorToFloat', () => {
  it('converts paise to rupees for display only', () => {
    expect(minorToFloat(673)).toBe(6.73);
    expect(minorToFloat(250000)).toBe(2500);
  });
});

describe('formatINR (Indian grouping)', () => {
  it('formats small amounts', () => {
    expect(formatINR(673)).toBe('6.73');
    expect(formatINR(3000)).toBe('30.00');
  });
  it('groups thousands as 3 then 2 (Indian system)', () => {
    expect(formatINR(336445)).toBe('3,364.45');
    expect(formatINR(10000050)).toBe('1,00,000.50');
    expect(formatINR(123456700)).toBe('12,34,567.00');
  });
  it('handles zero and negatives', () => {
    expect(formatINR(0)).toBe('0.00');
    expect(formatINR(-3000)).toBe('-30.00');
  });
});
