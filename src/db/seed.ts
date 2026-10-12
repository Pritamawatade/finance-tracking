import { eq } from 'drizzle-orm';
import { accounts, appSettings, categories, merchantRules } from './schema';
import type { AppDb } from './types';
import { categoryColors } from '../theme/tokens';

export const SEED_FLAG = 'seed_v1';

type SeedKind = 'expense' | 'income' | 'neutral';

const EXPENSE: [string, string][] = [
  ['Food & Dining', '🍔'],
  ['Groceries', '🛒'],
  ['Transport & Fuel', '🚌'],
  ['Rent', '🏠'],
  ['Bills & Utilities', '💡'],
  ['Recharge & DTH', '📱'],
  ['Books', '📚'],
  ['Shopping', '🛍️'],
  ['Health', '💊'],
  ['Entertainment', '🎬'],
  ['Education', '🎓'],
  ['Travel', '✈️'],
  ['Subscriptions', '🔁'],
  ['EMI & Loans', '🏦'],
  ['Investments', '📈'],
  ['Personal Care', '💈'],
  ['Gifts & Donations', '🎁'],
  ['Fees & Charges', '🧾'],
  ['Other', '📦'],
];

const INCOME: [string, string][] = [
  ['Salary', '💼'],
  ['Business / Freelance', '🧑‍💻'],
  ['Refund & Cashback', '🔄'],
  ['Interest', '💰'],
  ['Received from People', '🤝'],
  ['Other Income', '➕'],
];

const NEUTRAL: [string, string][] = [['Transfer', '↔️']];

/** Default monitored sender patterns (Equitas), overridable in onboarding. */
export const DEFAULT_SENDER_PATTERNS = ['EQUTAS', 'EQUITAS'];

const DEFAULT_SETTINGS: [string, string][] = [
  ['week_start', 'mon'],
  ['currency', 'INR'],
  ['monitored_sender_patterns', JSON.stringify(DEFAULT_SENDER_PATTERNS)],
  ['last_sms_sync_at', '0'],
  ['native_config_hash', ''],
  ['native_config_version', '1'],
  ['prompt_notifications', '1'],
  ['silent_confirmations', '1'],
  ['theme', 'system'],
  ['month_end_notification', '1'],
  ['onboarding_done', '0'],
  ['app_lock', '0'],
];

function colorFor(i: number): string {
  return categoryColors[i % categoryColors.length];
}

/**
 * Idempotent seed. Guarded by app_settings `seed_v1`: returns true when it
 * seeded, false when the DB was already seeded.
 */
export function ensureSeeded(db: AppDb): boolean {
  const flag = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SEED_FLAG))
    .get();
  if (flag) return false;

  const now = Date.now();
  let order = 0;
  const insertCategory = (name: string, icon: string, kind: SeedKind) => {
    db.insert(categories)
      .values({
        name,
        kind,
        icon,
        color: colorFor(order),
        sortOrder: order,
        isSystem: kind === 'neutral' ? 1 : 0,
        isArchived: 0,
        createdAt: now,
      })
      .run();
    order += 1;
  };
  for (const [name, icon] of EXPENSE) insertCategory(name, icon, 'expense');
  for (const [name, icon] of INCOME) insertCategory(name, icon, 'income');
  for (const [name, icon] of NEUTRAL) insertCategory(name, icon, 'neutral');

  db.insert(accounts)
    .values({
      name: 'Cash',
      type: 'cash',
      bankName: null,
      last4: null,
      currency: 'INR',
      latestBalanceMinor: null,
      latestBalanceAt: null,
      isArchived: 0,
      createdAt: now,
    })
    .run();

  for (const [key, value] of DEFAULT_SETTINGS) {
    db.insert(appSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }

  // Seed rule: bank charge SMS ("...CHGS...") auto-saves as Fees & Charges.
  const fees = db
    .select()
    .from(categories)
    .where(eq(categories.name, 'Fees & Charges'))
    .get();
  if (fees) {
    db.insert(merchantRules)
      .values({
        matchType: 'contains',
        matchKey: 'chgs',
        direction: 'debit',
        categoryId: fees.id,
        autoConfirm: 1,
        hitCount: 1,
        lastUsedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  db.insert(appSettings)
    .values({ key: SEED_FLAG, value: '1', updatedAt: now })
    .onConflictDoNothing()
    .run();
  return true;
}
