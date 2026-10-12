import { and, desc, eq, sql } from 'drizzle-orm';
import { appSettings, categories, merchantRules } from '../db/schema';
import type { AppDb } from '../db/types';

/**
 * Builds the native `ParserConfig` (§6.3) from the JS-owned DB.
 * All types are defined locally so this file never imports the native
 * module — it stays importable in Node tests.
 */

export interface QuickCategory {
  id: number;
  name: string;
  emoji: string;
}

export interface NativeRule {
  match: 'exact' | 'contains';
  /** Normalized key (spec §7.4). */
  key: string;
  direction: 'debit' | 'credit' | 'any';
  categoryId: number;
  autoConfirm: boolean;
}

export interface ParserTemplateLike {
  id: string;
  [k: string]: unknown;
}

export interface ParserConfig {
  /** Bump on any change. */
  version: number;
  /** Regex strings, case-insensitive, matched on sender address. */
  monitoredSenderPatterns: string[];
  /** Regex strings; body match => ignore. */
  ignorePatterns: string[];
  templates: ParserTemplateLike[];
  /** Top 2 per direction, ordered. */
  quickCategories: { debit: QuickCategory[]; credit: QuickCategory[] };
  rules: NativeRule[];
  promptNotificationsEnabled: boolean;
  silentConfirmationsEnabled: boolean;
}

export const DEFAULT_SENDER_PATTERNS = ['EQUTAS', 'EQUITAS'];

/** Spec §7.3 — must not match the 3 acceptance fixtures. */
export const DEFAULT_IGNORE_PATTERNS = [
  '\\bOTP\\b',
  'will be (debited|credited)',
  '(collect|payment) request',
  'minimum balance',
  'statement',
  'is due',
];

export const DEFAULT_QUICK_DEBIT = ['Food & Dining', 'Transport & Fuel'];
export const DEFAULT_QUICK_CREDIT = ['Salary', 'Received from People'];

export interface BuildConfigOptions {
  templates?: ParserTemplateLike[];
  ignorePatterns?: string[];
  /** Epoch ms "now" (injectable for tests). */
  now?: number;
}

function readSetting(db: AppDb, key: string, fallback: string): string {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row ? row.value : fallback;
}

function parsePatterns(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      return v.length > 0 ? (v as string[]) : DEFAULT_SENDER_PATTERNS;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_SENDER_PATTERNS;
}

function dayString(epochMs: number): string {
  const d = new Date(epochMs);
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * Spec §9.4 — the 2 most-used categories per direction over the last 90
 * days (confirmed only); falls back to defaults.
 */
export function quickCategoriesFor(
  db: AppDb,
  direction: 'debit' | 'credit',
  opts: { now?: number } = {},
): QuickCategory[] {
  const now = opts.now ?? Date.now();
  const since = dayString(now - 90 * 86_400_000);
  const rows = db
    .all<{ id: number; name: string; icon: string; n: number }>(sql`
      SELECT c.id AS id, c.name AS name, c.icon AS icon, COUNT(*) AS n
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.status = 'confirmed'
        AND t.direction = ${direction}
        AND t.local_date >= ${since}
        AND c.is_archived = 0
      GROUP BY c.id
      ORDER BY n DESC
      LIMIT 2
    `);
  const top: QuickCategory[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.icon,
  }));
  if (top.length >= 2) return top;

  // Fill from defaults (by name), skipping duplicates.
  const defaults =
    direction === 'debit' ? DEFAULT_QUICK_DEBIT : DEFAULT_QUICK_CREDIT;
  const seen = new Set(top.map((t) => t.id));
  for (const name of defaults) {
    if (top.length >= 2) break;
    const cat = db
      .select()
      .from(categories)
      .where(and(eq(categories.name, name), eq(categories.isArchived, 0)))
      .get();
    if (cat && !seen.has(cat.id)) {
      seen.add(cat.id);
      top.push({ id: cat.id, name: cat.name, emoji: cat.icon });
    }
  }
  return top;
}

export function buildParserConfig(
  db: AppDb,
  opts: BuildConfigOptions = {},
): ParserConfig {
  const version = Number.parseInt(
    readSetting(db, 'native_config_version', '1'),
    10,
  );
  const monitoredSenderPatterns = parsePatterns(
    readSetting(
      db,
      'monitored_sender_patterns',
      JSON.stringify(DEFAULT_SENDER_PATTERNS),
    ),
  );
  const promptNotificationsEnabled =
    readSetting(db, 'prompt_notifications', '1') === '1';
  const silentConfirmationsEnabled =
    readSetting(db, 'silent_confirmations', '1') === '1';

  const rules = db
    .select()
    .from(merchantRules)
    .orderBy(desc(merchantRules.hitCount))
    .all()
    .map((r) => ({
      match: r.matchType,
      key: r.matchKey,
      direction: r.direction,
      categoryId: r.categoryId,
      autoConfirm: r.autoConfirm === 1,
    }));

  return {
    version: Number.isFinite(version) ? version : 1,
    monitoredSenderPatterns,
    ignorePatterns: opts.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
    templates: opts.templates ?? [],
    quickCategories: {
      debit: quickCategoriesFor(db, 'debit', { now: opts.now }),
      credit: quickCategoriesFor(db, 'credit', { now: opts.now }),
    },
    rules,
    promptNotificationsEnabled,
    silentConfirmationsEnabled,
  };
}

/** Stable (key-sorted) JSON so config hashing is deterministic. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * Sync djb2 hash (hex) of the stable config JSON. Pure TS — no expo-crypto
 * so this file runs in Node tests. (App code may swap in SHA-256; the
 * contract is only "stable string in → stable string out".)
 */
export function hashParserConfig(config: ParserConfig): string {
  const s = stableStringify(config);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
