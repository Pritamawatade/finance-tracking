import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';

/**
 * Node test helper: in-memory better-sqlite3 DB with the real spec §8.3 DDL,
 * wrapped with drizzle. Mirrors `drizzle.config.ts` out migrations.
 */
export const TEST_DDL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE accounts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'bank'
                        CHECK (type IN ('bank','cash','wallet','credit_card')),
  bank_name             TEXT,
  last4                 TEXT,
  currency              TEXT NOT NULL DEFAULT 'INR',
  latest_balance_minor  INTEGER,
  latest_balance_at     INTEGER,
  is_archived           INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_accounts_bank_last4 ON accounts(bank_name, last4) WHERE last4 IS NOT NULL;

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('expense','income','neutral')),
  icon        TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_categories_name_kind ON categories(name, kind);

CREATE TABLE sms_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_hash      TEXT NOT NULL UNIQUE,
  sender        TEXT NOT NULL,
  body          TEXT NOT NULL,
  received_at   INTEGER NOT NULL,
  parse_status  TEXT NOT NULL CHECK (parse_status IN ('parsed','ignored','unparsed')),
  template_id   TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE transactions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id           INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id          INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  direction            TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor         INTEGER NOT NULL CHECK (amount_minor > 0),
  currency             TEXT NOT NULL DEFAULT 'INR',
  occurred_at          INTEGER NOT NULL,
  local_date           TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('pending','confirmed','ignored')),
  counterparty_name    TEXT,
  counterparty_key     TEXT,
  channel              TEXT CHECK (channel IN ('upi','imps','neft','card','atm','cash','other')),
  reference            TEXT,
  description          TEXT,
  note                 TEXT,
  balance_after_minor  INTEGER,
  source               TEXT NOT NULL CHECK (source IN ('sms','manual')),
  sms_message_id       INTEGER REFERENCES sms_messages(id) ON DELETE SET NULL,
  dedupe_key           TEXT UNIQUE,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX ix_txn_status_date   ON transactions(status, local_date);
CREATE INDEX ix_txn_category_date ON transactions(category_id, local_date);
CREATE INDEX ix_txn_account_date  ON transactions(account_id, local_date);
CREATE INDEX ix_txn_cpkey         ON transactions(counterparty_key);

CREATE TABLE merchant_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_type    TEXT NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact','contains')),
  match_key     TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('debit','credit','any')),
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  auto_confirm  INTEGER NOT NULL DEFAULT 0,
  hit_count     INTEGER NOT NULL DEFAULT 1,
  last_used_at  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (match_type, match_key, direction)
);

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
`;

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(TEST_DDL);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export type TestDb = ReturnType<typeof createTestDb>['db'];
