import { requireNativeModule } from 'expo-modules-core';

// Mirrors spec §7.2 — must stay in sync with TemplateParser.kt and src/services/parser/templates.ts.
export type ParserTemplateFull = {
  id: string;
  mode: 'full';
  bankName: string;
  senderMatch?: string;
  direction: 'debit' | 'credit';
  pattern: string; // Java- and JS-compatible regex source
  flags: 'i' | '';
  dateFormat: 'dd-MM-yy' | 'dd-MM-yyyy' | 'dd/MM/yy' | 'dd-MMM-yy';
};

export type ParserTemplateFields = {
  id: string;
  mode: 'fields';
  bankName: string;
  fields: Partial<Record<'amt' | 'acct' | 'ref' | 'payee' | 'bal' | 'date', string>>;
  debitKeywords: string[];
  creditKeywords: string[];
  dateFormats: string[];
};

export type ParserTemplate = ParserTemplateFull | ParserTemplateFields;

export type QuickCategory = { id: number; name: string; emoji: string };

export type NativeRule = {
  match: 'exact' | 'contains';
  key: string; // normalized (see spec §7.4)
  direction: 'debit' | 'credit' | 'any';
  categoryId: number;
  autoConfirm: boolean;
};

export type ParserConfig = {
  version: number; // bump on any change
  monitoredSenderPatterns: string[]; // regex strings, case-insensitive, matched on sender address
  ignorePatterns: string[]; // regex strings; body match => ignore
  templates: ParserTemplate[]; // see spec §7.2
  quickCategories: { debit: QuickCategory[]; credit: QuickCategory[] }; // top 2 each, ordered
  rules: NativeRule[];
  promptNotificationsEnabled: boolean;
  silentConfirmationsEnabled: boolean;
};

export type ParsedTxn = {
  templateId: string;
  direction: 'debit' | 'credit';
  amountMinor: number; // paise, integer
  accountLast4: string | null;
  reference: string | null;
  counterparty: string | null;
  description: string | null;
  channel: 'upi' | 'other';
  txnDate: string; // 'YYYY-MM-DD' (from body)
  balanceAfterMinor: number | null;
  lowConfidence: boolean;
};

export type InboxItem = {
  id: number;
  smsHash: string;
  sender: string;
  body: string;
  receivedAt: number;
  parsed: ParsedTxn | null;
  state: 'pending' | 'confirmed' | 'auto_confirmed' | 'ignored';
  categoryId: number | null;
};

export type RawSms = { smsHash: string; sender: string; body: string; receivedAt: number };

export type SystemState = {
  receiveSms: boolean;
  readSms: boolean;
  notifications: boolean;
  batteryOptimizationIgnored: boolean;
};

type SmsBridgeNativeModule = {
  configure(configJson: string): Promise<void>;
  drainInbox(): Promise<InboxItem[]>;
  ackInbox(ids: number[]): Promise<void>;
  readSmsInbox(sinceEpochMs: number, limit: number): Promise<RawSms[]>;
  cancelNotification(smsHash: string): Promise<void>;
  getSystemState(): Promise<SystemState>;
  openAppSettings(): void;
  openBatteryOptimizationSettings(): void;
  debugInjectSms(sender: string, body: string): Promise<void>;
};

const native = requireNativeModule<SmsBridgeNativeModule>('SmsBridge');

// Since Expo SDK 52 the native module object already implements the
// EventEmitter interface at runtime — no `new EventEmitter()` needed.
type InboxEmitter = {
  addListener(event: 'onInboxChanged', listener: () => void): { remove(): void };
};

const emitter = native as unknown as InboxEmitter;

export function configure(config: ParserConfig): Promise<void> {
  return native.configure(JSON.stringify(config));
}

export function drainInbox(): Promise<InboxItem[]> {
  return native.drainInbox();
}

export function ackInbox(ids: number[]): Promise<void> {
  return native.ackInbox(ids);
}

export function readSmsInbox(sinceEpochMs: number, limit: number): Promise<RawSms[]> {
  return native.readSmsInbox(sinceEpochMs, limit);
}

export function cancelNotification(smsHash: string): Promise<void> {
  return native.cancelNotification(smsHash);
}

export function getSystemState(): Promise<SystemState> {
  return native.getSystemState();
}

export function openAppSettings(): void {
  native.openAppSettings();
}

export function openBatteryOptimizationSettings(): void {
  native.openBatteryOptimizationSettings();
}

// Only works in debug builds; the native side throws in release builds.
export function debugInjectSms(sender: string, body: string): Promise<void> {
  return native.debugInjectSms(sender, body);
}

// Event: onInboxChanged
export function addInboxListener(cb: () => void): { remove(): void } {
  const sub = emitter.addListener('onInboxChanged', cb);
  return { remove: () => sub.remove() };
}
