import type { InboxItemLike } from './ingest';
import type { ParserConfig } from './nativeConfig';

/** Mirror of the native `RawSms` (§6.3), defined locally. */
export interface RawSmsLike {
  smsHash: string;
  sender: string;
  body: string;
  receivedAt: number;
}

/** Inbox rows as returned by `drainInbox` (ingest shape + native row id). */
export type DrainedItem = InboxItemLike & { id: number };

export interface SmsSyncDeps {
  /** Build the current ParserConfig from the DB. */
  buildConfig: () => Promise<ParserConfig> | ParserConfig;
  /** Stable hash of a config (avoid redundant `configure()` calls). */
  getHash: (config: ParserConfig) => Promise<string> | string;
  /** Push config to the native module. */
  configure: (config: ParserConfig) => Promise<void>;
  /** Unacked native inbox rows. */
  drainInbox: () => Promise<DrainedItem[]>;
  /** Mark native rows as acked after ingest. */
  ackInbox: (ids: number[]) => Promise<void>;
  /** Safety-net backfill source (device SMS store). */
  readSmsInbox: (
    sinceEpochMs: number,
    limit: number,
  ) => Promise<RawSmsLike[]>;
  /** Idempotent ledger ingest. */
  ingest: (items: InboxItemLike[]) => Promise<unknown>;
  // --- Optional persistence / parsing hooks (default = in-memory no-op) ---
  getStoredConfigHash?: () => Promise<string | null> | string | null;
  saveStoredConfigHash?: (hash: string) => Promise<void> | void;
  /** Epoch ms of the last successful backfill (0 = never). */
  getLastSmsSyncAt?: () => Promise<number> | number;
  saveLastSmsSyncAt?: (ms: number) => Promise<void> | void;
  /**
   * Parse a backfilled raw SMS with the TS templates. Return null to skip.
   * When absent, backfilled SMS are ingested as `unparsed` (no ledger row).
   */
  parseRawSms?: (sms: RawSmsLike) => InboxItemLike | null;
  now?: () => number;
  /** Called after any ingest so UI (dbVersion) refreshes. */
  onDbChanged?: () => void;
}

export interface SmsSyncResult {
  configured: boolean;
  drained: number;
  backfilled: number;
  backfillSkipped: number;
}

const DAY_MS = 86_400_000;
const BACKFILL_LIMIT = 500;

function senderMatches(sender: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p, 'i').test(sender);
    } catch {
      return sender.toLowerCase().includes(p.toLowerCase());
    }
  });
}

/**
 * Spec §9.2 — app-open sync:
 * 1. Build ParserConfig; `configure()` only when its hash changed.
 * 2. `drainInbox()` → ingest → `ackInbox()`.
 * 3. Safety-net backfill: `readSmsInbox(last_sms_sync_at − 24h)` → filter by
 *    monitored senders → ingest unknown items as pending (no notification).
 */
export async function syncOnAppOpen(
  deps: SmsSyncDeps,
): Promise<SmsSyncResult> {
  const now = deps.now?.() ?? Date.now();
  const result: SmsSyncResult = {
    configured: false,
    drained: 0,
    backfilled: 0,
    backfillSkipped: 0,
  };

  // 1. Config push (hash-guarded).
  const config = await deps.buildConfig();
  const hash = await deps.getHash(config);
  const stored = (await deps.getStoredConfigHash?.()) ?? null;
  if (stored !== hash) {
    await deps.configure(config);
    await deps.saveStoredConfigHash?.(hash);
    result.configured = true;
  }

  // 2. Drain → ingest → ack.
  const drained = await deps.drainInbox();
  if (drained.length > 0) {
    await deps.ingest(drained);
    await deps.ackInbox(drained.map((d) => d.id));
    result.drained = drained.length;
    deps.onDbChanged?.();
  }

  // 3. Backfill safety net.
  const lastSync = (await deps.getLastSmsSyncAt?.()) ?? 0;
  const since = Math.max(0, (lastSync || now) - DAY_MS);
  const raw = await deps.readSmsInbox(since, BACKFILL_LIMIT);
  const patterns = config.monitoredSenderPatterns ?? [];
  const items: InboxItemLike[] = [];
  for (const sms of raw) {
    if (!senderMatches(sms.sender, patterns)) {
      result.backfillSkipped += 1;
      continue;
    }
    const parsed = deps.parseRawSms?.(sms) ?? null;
    items.push(
      parsed ?? {
        smsHash: sms.smsHash,
        sender: sms.sender,
        body: sms.body,
        receivedAt: sms.receivedAt,
        parsed: null,
        state: 'pending',
        categoryId: null,
      },
    );
  }
  if (items.length > 0) {
    await deps.ingest(items);
    result.backfilled = items.length;
    deps.onDbChanged?.();
  }
  await deps.saveLastSmsSyncAt?.(now);

  return result;
}
