/**
 * SMS → ParsedTxn parser executing the shared templates. Spec §7.
 * Order: ignore check → full templates in order → fields fallback.
 * Pure module: no Expo imports.
 */

import { parseAmountSafe } from '../../utils/money';
import { toLocalDate } from '../../utils/dates';
import {
  DEFAULT_IGNORE_PATTERNS,
  GENERIC_FALLBACK,
  TEMPLATES,
} from './templates';
import type { DateFormat, FieldsTemplate, FullTemplate } from './templates';

export type ParsedTxn = {
  templateId: string;
  direction: 'debit' | 'credit';
  /** Paise, integer. */
  amountMinor: number;
  accountLast4: string | null;
  reference: string | null;
  counterparty: string | null;
  description: string | null;
  channel: 'upi' | 'other';
  /** 'YYYY-MM-DD' from the body (or receipt date for dateless fallback). */
  txnDate: string;
  balanceAfterMinor: number | null;
  lowConfidence: boolean;
};

export type ParseResult = ParsedTxn | null | 'ignored';

export type ParseOptions = {
  ignorePatterns?: string[];
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Normalize a captured body date to 'YYYY-MM-DD' per the template's dateFormat. */
export function parseBodyDate(dateStr: string, format: DateFormat | string): string | null {
  const clean = dateStr.trim();
  if (format === 'dd-MMM-yy') {
    const m = /^(\d{2})-([A-Za-z]{3})-(\d{2})$/.exec(clean);
    if (!m) return null;
    const mon = MONTHS[(m[2] as string).toLowerCase()];
    if (!mon) return null;
    return `20${m[3]}-${mon}-${m[1]}`;
  }
  const sep = format.startsWith('dd/') ? '/' : '-';
  const parts = clean.split(sep);
  if (parts.length !== 3) return null;
  const [dd, mm, yyRaw] = parts as [string, string, string];
  if (!/^\d{2}$/.test(dd) || !/^\d{2}$/.test(mm) || !/^(\d{2}|\d{4})$/.test(yyRaw)) {
    return null;
  }
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm}-${dd}`;
}

/** Generic fallback date (dd-MM-yy or dd-MM-yyyy, '-' or '/') -> 'YYYY-MM-DD'. */
function parseGenericDate(dateStr: string): string | null {
  const m = /^(\d{2})([-/])(\d{2})\2(\d{2}|\d{4})$/.exec(dateStr.trim());
  if (!m) return null;
  const yyyy = (m[4] as string).length === 2 ? `20${m[4]}` : (m[4] as string);
  return `${yyyy}-${m[3]}-${m[1]}`;
}

function firstGroup(pattern: string, body: string): string | null {
  const m = new RegExp(pattern, 'i').exec(body);
  if (!m) return null;
  const v = m[1];
  return typeof v === 'string' && v !== '' ? v : null;
}

function matchesAny(patterns: string[], body: string): boolean {
  return patterns.some((p) => new RegExp(p, 'i').test(body));
}

function cleanOpt(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function tryFull(body: string, tpl: FullTemplate): Omit<ParsedTxn, 'lowConfidence'> | null {
  const m = new RegExp(tpl.pattern, tpl.flags).exec(body);
  if (!m || !m.groups) return null;
  const g = m.groups as Record<string, string | undefined>;
  const amtRaw = cleanOpt(g['amt']);
  const dateRaw = cleanOpt(g['date']);
  if (amtRaw === null || dateRaw === null) return null;
  const amountMinor = parseAmountSafe(amtRaw);
  const txnDate = parseBodyDate(dateRaw, tpl.dateFormat);
  if (amountMinor === null || txnDate === null) return null;
  const balRaw = cleanOpt(g['bal']);
  const reference = cleanOpt(g['ref']);
  return {
    templateId: tpl.id,
    direction: tpl.direction,
    amountMinor,
    accountLast4: cleanOpt(g['acct']),
    reference,
    counterparty: cleanOpt(g['payee']),
    description: cleanOpt(g['desc']),
    // channel = 'upi' iff a reference was captured.
    channel: reference !== null ? 'upi' : 'other',
    txnDate,
    balanceAfterMinor: balRaw !== null ? parseAmountSafe(balRaw) : null,
  };
}

function keywordIndex(haystack: string, keywords: string[]): number {
  let best = -1;
  for (const k of keywords) {
    const i = haystack.indexOf(k.toLowerCase());
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

function tryFields(body: string, receivedAtMs: number, tpl: FieldsTemplate): ParsedTxn | null {
  const f = tpl.fields;
  if (!f['amt']) return null;
  const amtRaw = firstGroup(f['amt'], body);
  if (amtRaw === null) return null;
  const amountMinor = parseAmountSafe(amtRaw);
  if (amountMinor === null) return null;

  const lower = body.toLowerCase();
  const debitAt = keywordIndex(lower, tpl.debitKeywords);
  const creditAt = keywordIndex(lower, tpl.creditKeywords);
  let direction: 'debit' | 'credit' | null = null;
  if (debitAt !== -1 && creditAt === -1) direction = 'debit';
  else if (creditAt !== -1 && debitAt === -1) direction = 'credit';
  else if (debitAt !== -1 && creditAt !== -1) direction = debitAt <= creditAt ? 'debit' : 'credit';
  if (direction === null) return null;

  let txnDate: string | null = null;
  if (f['date']) {
    const dateRaw = firstGroup(f['date'], body);
    if (dateRaw !== null) txnDate = parseGenericDate(dateRaw);
  }
  if (txnDate === null) txnDate = toLocalDate(receivedAtMs);

  const refRaw = f['ref'] ? firstGroup(f['ref'], body) : null;
  const balRaw = f['bal'] ? firstGroup(f['bal'], body) : null;
  const payeeRaw = f['payee'] ? firstGroup(f['payee'], body) : null;
  return {
    templateId: tpl.id,
    direction,
    amountMinor,
    accountLast4: f['acct'] ? firstGroup(f['acct'], body) : null,
    reference: refRaw !== null ? refRaw.trim() : null,
    counterparty: payeeRaw !== null ? payeeRaw.trim() : null,
    description: null,
    channel: refRaw !== null ? 'upi' : 'other',
    txnDate,
    balanceAfterMinor: balRaw !== null ? parseAmountSafe(balRaw) : null,
    lowConfidence: true,
  };
}

/**
 * Parse an SMS body. Returns 'ignored' for non-transaction messages,
 * a ParsedTxn on success, or null when no template matches.
 */
export function parseSms(body: string, receivedAtMs: number, opts?: ParseOptions): ParseResult {
  const text = body.trim();
  const ignorePatterns = opts?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
  if (matchesAny(ignorePatterns, text)) {
    return 'ignored';
  }
  for (const tpl of TEMPLATES) {
    if (tpl.mode !== 'full') continue;
    const hit = tryFull(text, tpl as FullTemplate);
    if (hit !== null) return { ...hit, lowConfidence: false };
  }
  const fallback = tryFields(text, receivedAtMs, GENERIC_FALLBACK);
  if (fallback !== null) return fallback;
  return null;
}
