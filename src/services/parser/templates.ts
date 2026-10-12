/**
 * SMS parser templates — the single source of truth shared by the TS parser
 * and the Kotlin parser (pushed to native via ParserConfig). Spec §7.2–7.3.
 * Pure module: no Expo imports.
 */

export type DateFormat = 'dd-MM-yy' | 'dd-MM-yyyy' | 'dd/MM/yy' | 'dd-MMM-yy';

export type FullTemplate = {
  id: string;
  mode: 'full';
  bankName: string;
  senderMatch?: string;
  direction: 'debit' | 'credit';
  /** Java- and JS-compatible regex source. Named groups: amt, acct, ref, payee, desc, date, bal. */
  pattern: string;
  flags: 'i' | '';
  dateFormat: DateFormat;
};

export type FieldName = 'amt' | 'acct' | 'ref' | 'payee' | 'bal' | 'date';

export type FieldsTemplate = {
  id: string;
  mode: 'fields';
  bankName: string;
  /** Each regex: group 1 = value. */
  fields: Partial<Record<FieldName, string>>;
  debitKeywords: string[];
  creditKeywords: string[];
  dateFormats: string[];
};

export type ParserTemplate = FullTemplate | FieldsTemplate;

export const EQUITAS_DEBIT: FullTemplate = {
  id: 'equitas-debit-v1',
  mode: 'full',
  bankName: 'Equitas',
  direction: 'debit',
  flags: 'i',
  dateFormat: 'dd-MM-yy',
  pattern: String.raw`^INR\s(?<amt>[\d,]+\.?\d*)\s(?:has been\s)?debited\sfrom\sEquitas(?:\sA\/c\s|-)(?<acct>\d{3,4})\s(?:via\sUPI\s-?Ref:(?<ref>\d+)\sto\s(?<payee>.+?)|towards\s(?<desc>.+?))\son\s(?<date>\d{2}-\d{2}-\d{2})\.\s?(?:Avl\s)?Bal(?:\sis)?\sINR\s(?<bal>[\d,]+\.?\d*)`,
};

export const EQUITAS_CREDIT: FullTemplate = {
  id: 'equitas-credit-v1',
  mode: 'full',
  bankName: 'Equitas',
  direction: 'credit',
  flags: 'i',
  dateFormat: 'dd-MM-yy',
  pattern: String.raw`^INR\s(?<amt>[\d,]+\.?\d*)\scredited(?:\svia\sUPI)?\sto\sEquitas(?:\sA\/c\s|-)(?<acct>\d{3,4})\s-?Ref:(?<ref>\d+)\son\s(?<date>\d{2}-\d{2}-\d{2})\sfrom\s(?<payee>.+?)\.\s?(?:Avl\s)?Bal(?:\sis)?\sINR\s(?<bal>[\d,]+\.?\d*)`,
};

export const GENERIC_FALLBACK: FieldsTemplate = {
  id: 'generic-v1',
  mode: 'fields',
  bankName: 'Generic',
  fields: {
    amt: String.raw`(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d{1,2})?)`,
    acct: String.raw`(?:A\/c|a\/c|ac|account|card)[\s\-]*(?:no\.?)?\s*[Xx*]*(\d{3,4})`,
    ref: String.raw`(?:Ref(?:erence)?(?:\s?No\.?)?|UTR|RRN)[:\s\-]*([A-Za-z0-9]{6,})`,
    payee: String.raw`(?:from|to)\s+([A-Za-z][A-Za-z0-9 .&'\-]{1,60}?)(?=\s+on\s|\.|,|\s*$)`,
    bal: String.raw`(?:Avl\.?\s*)?Bal(?:ance)?(?:\s*is)?[:\s]*(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d{1,2})?)`,
    date: String.raw`(\d{2}[-/]\d{2}[-/]\d{2,4})`,
  },
  debitKeywords: ['debited', 'spent', 'withdrawn', 'paid', 'sent'],
  creditKeywords: ['credited', 'received', 'deposited'],
  dateFormats: ['dd-MM-yy', 'dd-MM-yyyy', 'dd/MM/yy'],
};

/** Templates are evaluated in order; first match wins. Full first, generic last. */
export const TEMPLATES: ParserTemplate[] = [EQUITAS_DEBIT, EQUITAS_CREDIT, GENERIC_FALLBACK];

/** A body matching any of these is not a transaction — must not match the fixtures. */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  String.raw`\bOTP\b`,
  String.raw`will be (debited|credited)`,
  String.raw`(collect|payment) request`,
  String.raw`minimum balance`,
  String.raw`statement`,
  String.raw`is due`,
];

/** Sender IDs are user-picked in onboarding; these are the defaults. */
export const DEFAULT_SENDER_PATTERNS: string[] = ['EQUTAS', 'EQUITAS'];
