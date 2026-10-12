/**
 * Money utilities — minor units (paise) only. Money is never a float.
 * Pure module: no Expo/RN imports so it runs in Node (Jest) unchanged.
 */

/** Convert a decimal amount string (e.g. "1,00,000.50", "30") to integer paise. */
export function amountToMinor(amountStr: string): number {
  const s = amountStr.trim().replace(/,/g, '');
  if (s.length === 0) {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  let sign = 1;
  let rest = s;
  const first = rest[0];
  if (first === '-' || first === '+') {
    sign = first === '-' ? -1 : 1;
    rest = rest.slice(1);
  }
  const parts = rest.split('.');
  if (parts.length > 2) {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  const intPart = parts[0] ?? '';
  const fracRaw = parts[1] ?? '';
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracRaw)) {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  if (intPart === '' && fracRaw === '') {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  const fracPart = fracRaw.padEnd(2, '0').slice(0, 2);
  const minor = parseInt(intPart === '' ? '0' : intPart, 10) * 100 + parseInt(fracPart, 10);
  return sign * minor;
}

/** Non-throwing variant of amountToMinor; returns null for invalid input. */
export function parseAmountSafe(amountStr: string): number | null {
  try {
    return amountToMinor(amountStr);
  } catch {
    return null;
  }
}

/** Convert integer paise back to a float (display only — never for math). */
export function minorToFloat(minor: number): number {
  return minor / 100;
}

function groupIndian(intStr: string): string {
  if (intStr.length <= 3) {
    return intStr;
  }
  const last3 = intStr.slice(-3);
  const head = intStr.slice(0, -3);
  const groups: string[] = [];
  let i = head.length;
  while (i > 0) {
    const start = Math.max(0, i - 2);
    groups.unshift(head.slice(start, i));
    i = start;
  }
  return `${groups.join(',')},${last3}`;
}

/**
 * Format integer paise with Indian digit grouping, e.g. 123456700 -> "12,34,567.00".
 * No currency symbol (callers add ₹). No Intl dependency (Hermes-safe).
 */
export function formatINR(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  return `${sign}${groupIndian(String(rupees))}.${String(paise).padStart(2, '0')}`;
}
