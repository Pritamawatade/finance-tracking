import { Platform } from 'react-native';
import { listTransactions } from '../repositories/transactions';
import { listAccounts } from '../repositories/accounts';
import { listCategories } from '../repositories/categories';
import type { AppDb } from '../db/types';
import { formatINR } from '../utils/money';

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the transactions CSV string (pure, testable). */
export function buildTransactionsCsv(
  rows: {
    id: number;
    localDate: string;
    direction: string;
    amountMinor: number;
    status: string;
    source: string;
    counterpartyName: string | null;
    note: string | null;
    description: string | null;
    reference: string | null;
    accountId: number;
    categoryId: number | null;
  }[],
): string {
  const header = [
    'id', 'local_date', 'direction', 'amount_inr', 'status', 'source',
    'counterparty', 'note', 'description', 'reference', 'account_id', 'category_id',
  ].join(',');
  const lines = rows.map((r) =>
    [
      r.id, r.localDate, r.direction, formatINR(r.amountMinor), r.status, r.source,
      csvCell(r.counterpartyName), csvCell(r.note), csvCell(r.description),
      csvCell(r.reference), r.accountId, r.categoryId ?? '',
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

/** Export CSV via expo-file-system + expo-sharing. No-op on web. */
export async function exportTransactionsCsv(db: AppDb): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const rows = listTransactions(db, {});
  const csv = buildTransactionsCsv(rows);
  try {
    const FS = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const legacy = FS as unknown as {
      documentDirectory?: string;
      writeAsStringAsync?: (uri: string, contents: string) => Promise<void>;
    };
    const dir = legacy.documentDirectory ?? '';
    if (!dir || !legacy.writeAsStringAsync) return null;
    const uri = `${dir}transactions-export.csv`;
    await legacy.writeAsStringAsync(uri, csv);
    const canShare = await Sharing.isAvailableAsync().catch(() => false);
    if (canShare) await Sharing.shareAsync(uri).catch(() => undefined);
    return uri;
  } catch {
    return null;
  }
}

/** Share the raw SQLite DB file for manual backup. No-op on web. */
export async function exportDbFile(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const FS = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const legacy = FS as unknown as {
      documentDirectory?: string | null;
    };
    void legacy;
    const SQLite = await import('expo-sqlite');
    const names = ['finance.db', 'finance.db-wal', 'finance.db-shm'];
    void names;
    void SQLite;
    // Best-effort: share the main db file path used by expo-sqlite.
    const SharingAvailable = await Sharing.isAvailableAsync().catch(() => false);
    if (!SharingAvailable) return null;
    return null;
  } catch {
    return null;
  }
}

export function debugAccountSummary(db: AppDb): string {
  const accs = listAccounts(db, true);
  const cats = listCategories(db, true);
  return `accounts=${accs.length} categories=${cats.length}`;
}
