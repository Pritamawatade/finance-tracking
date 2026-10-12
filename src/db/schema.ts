import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Main DB schema (`finance.db`), mirroring spec §8.3 DDL.
 * Column names/types match the spec exactly; CHECKs are expressed via `sql`.
 */

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['bank', 'cash', 'wallet', 'credit_card'],
    })
      .notNull()
      .default('bank'),
    bankName: text('bank_name'),
    last4: text('last4'),
    currency: text('currency').notNull().default('INR'),
    latestBalanceMinor: integer('latest_balance_minor'),
    latestBalanceAt: integer('latest_balance_at'),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('ux_accounts_bank_last4')
      .on(t.bankName, t.last4)
      .where(sql`${t.last4} IS NOT NULL`),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['expense', 'income', 'neutral'] }).notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: integer('is_system').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('ux_categories_name_kind').on(t.name, t.kind)],
);

export const smsMessages = sqliteTable('sms_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  smsHash: text('sms_hash').notNull().unique(),
  sender: text('sender').notNull(),
  body: text('body').notNull(),
  receivedAt: integer('received_at').notNull(),
  parseStatus: text('parse_status', {
    enum: ['parsed', 'ignored', 'unparsed'],
  }).notNull(),
  templateId: text('template_id'),
  createdAt: integer('created_at').notNull(),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'restrict',
    }),
    direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    occurredAt: integer('occurred_at').notNull(),
    localDate: text('local_date').notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'ignored'],
    })
      .notNull()
      .default('confirmed'),
    counterpartyName: text('counterparty_name'),
    counterpartyKey: text('counterparty_key'),
    channel: text('channel', {
      enum: ['upi', 'imps', 'neft', 'card', 'atm', 'cash', 'other'],
    }),
    reference: text('reference'),
    description: text('description'),
    note: text('note'),
    balanceAfterMinor: integer('balance_after_minor'),
    source: text('source', { enum: ['sms', 'manual'] }).notNull(),
    smsMessageId: integer('sms_message_id').references(() => smsMessages.id, {
      onDelete: 'set null',
    }),
    dedupeKey: text('dedupe_key').unique(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('ix_txn_status_date').on(t.status, t.localDate),
    index('ix_txn_category_date').on(t.categoryId, t.localDate),
    index('ix_txn_account_date').on(t.accountId, t.localDate),
    index('ix_txn_cpkey').on(t.counterpartyKey),
    // CHECK (amount_minor > 0)
    check('chk_txn_amount_positive', sql`${t.amountMinor} > 0`),
  ],
);

export const merchantRules = sqliteTable(
  'merchant_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchType: text('match_type', { enum: ['exact', 'contains'] })
      .notNull()
      .default('exact'),
    matchKey: text('match_key').notNull(),
    direction: text('direction', {
      enum: ['debit', 'credit', 'any'],
    }).notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    autoConfirm: integer('auto_confirm').notNull().default(0),
    hitCount: integer('hit_count').notNull().default(1),
    lastUsedAt: integer('last_used_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('ux_rules_match').on(t.matchType, t.matchKey, t.direction),
  ],
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type NewSmsMessage = typeof smsMessages.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type MerchantRule = typeof merchantRules.$inferSelect;
export type NewMerchantRule = typeof merchantRules.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
