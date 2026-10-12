/**
 * Date utilities. Grouping/filtering always uses `local_date` (YYYY-MM-DD
 * in device timezone, computed once at insert). Pure module — no Expo imports.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Epoch ms -> 'YYYY-MM-DD' in device timezone. */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  return toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const parts = dateStr.split('-').map(Number);
  return { y: parts[0] as number, m: parts[1] as number, d: parts[2] as number };
}

/**
 * Resolve `occurred_at` for an SMS: use the received timestamp, unless the
 * date printed in the body differs from the local date of receipt — then use
 * the body date at 12:00 local time.
 */
export function bodyDateToOccurred(bodyDate: string, receivedAtMs: number): number {
  if (toLocalDate(receivedAtMs) === bodyDate) {
    return receivedAtMs;
  }
  const { y, m, d } = parseDateStr(bodyDate);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Monday (week start) of the week containing dateStr, as 'YYYY-MM-DD'. */
export function weekBucket(dateStr: string): string {
  const { y, m, d } = parseDateStr(dateStr);
  const dt = new Date(y, m - 1, d);
  const diff = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return toLocalDate(dt.getTime());
}

/** 'YYYY-MM-DD' -> 'YYYY-MM'. */
export function monthBucket(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Add delta months to 'YYYY-MM', returning 'YYYY-MM'. */
export function addMonths(yyyyMM: string, delta: number): string {
  const year = Number(yyyyMM.slice(0, 4));
  const month = Number(yyyyMM.slice(5, 7));
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, '0')}-${pad2(m)}`;
}

/** Month bounds as local-date strings: { from: inclusive, to: exclusive }. */
export function monthRange(yyyyMM: string): { from: string; to: string } {
  return { from: `${yyyyMM}-01`, to: `${addMonths(yyyyMM, 1)}-01` };
}
