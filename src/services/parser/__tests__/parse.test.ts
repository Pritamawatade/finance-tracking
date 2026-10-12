import { parseBodyDate, parseSms } from '../parse';
import type { ParsedTxn } from '../parse';
import { counterpartyKey, dedupeKey, resolveOccurred, sha256HexSync, smsHash } from '../normalize';
import { DEFAULT_IGNORE_PATTERNS } from '../templates';
import rawFixtures from '../../../../fixtures/sms.json';

type FixtureExpected = {
  templateId: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  accountLast4: string | null;
  reference: string | null;
  counterparty: string | null;
  description: string | null;
  channel: 'upi' | 'other';
  txnDate: string;
  balanceAfterMinor: number | null;
};

type Fixture = {
  id: string;
  sender: string;
  body: string;
  receivedAt: string;
  expected: FixtureExpected | 'ignored';
};

const fixtures = rawFixtures as unknown as Fixture[];

function receivedMs(f: Fixture): number {
  return new Date(f.receivedAt).getTime();
}

describe('fixtures/sms.json', () => {
  it('parses the 3 reference messages exactly', () => {
    const refs = fixtures.filter((f) => f.id.startsWith('equitas-'));
    expect(refs).toHaveLength(3);
    for (const f of refs) {
      const expected = f.expected;
      if (expected === 'ignored') throw new Error(`fixture ${f.id} should not be ignored`);
      const got = parseSms(f.body, receivedMs(f));
      expect(got).not.toBeNull();
      expect(got).not.toBe('ignored');
      const txn = got as ParsedTxn;
      expect(txn.templateId).toBe(expected.templateId);
      expect(txn.direction).toBe(expected.direction);
      expect(txn.amountMinor).toBe(expected.amountMinor);
      expect(txn.accountLast4).toBe(expected.accountLast4);
      expect(txn.reference).toBe(expected.reference);
      expect(txn.counterparty).toBe(expected.counterparty);
      expect(txn.description).toBe(expected.description);
      expect(txn.channel).toBe(expected.channel);
      expect(txn.txnDate).toBe(expected.txnDate);
      expect(txn.balanceAfterMinor).toBe(expected.balanceAfterMinor);
      expect(txn.lowConfidence).toBe(false);
    }
  });

  it('ignores the OTP message', () => {
    const otp = fixtures.find((f) => f.id === 'otp-ignore');
    if (!otp) throw new Error('otp-ignore fixture missing');
    expect(parseSms(otp.body, receivedMs(otp))).toBe('ignored');
  });

  it('parses the HDFC message via generic fallback with lowConfidence', () => {
    const hdfc = fixtures.find((f) => f.id === 'hdfc-generic-debit');
    if (!hdfc) throw new Error('hdfc-generic-debit fixture missing');
    const expected = hdfc.expected;
    if (expected === 'ignored') throw new Error('hdfc fixture should not be ignored');
    const got = parseSms(hdfc.body, receivedMs(hdfc));
    const txn = got as ParsedTxn;
    expect(txn.templateId).toBe('generic-v1');
    expect(txn.lowConfidence).toBe(true);
    expect(txn.direction).toBe(expected.direction);
    expect(txn.amountMinor).toBe(expected.amountMinor);
    expect(txn.accountLast4).toBe(expected.accountLast4);
    expect(txn.txnDate).toBe(expected.txnDate);
    expect(txn.balanceAfterMinor).toBe(expected.balanceAfterMinor);
  });
});

describe('ignore patterns', () => {
  it('does not match any of the 3 reference fixtures', () => {
    for (const f of fixtures.filter((x) => x.id.startsWith('equitas-'))) {
      const hit = DEFAULT_IGNORE_PATTERNS.some((p) => new RegExp(p, 'i').test(f.body));
      expect(hit).toBe(false);
    }
  });
  it('ignores OTP, collect requests, statements and dues', () => {
    expect(parseSms('Your OTP is 123456. Do not share.', Date.now())).toBe('ignored');
    expect(parseSms('A collect request of INR 500 is pending approval.', Date.now())).toBe('ignored');
    expect(parseSms('Your credit card statement is generated.', Date.now())).toBe('ignored');
    expect(parseSms('Your EMI is due on 05-10-26. Please pay.', Date.now())).toBe('ignored');
    expect(parseSms('INR 100 will be debited tomorrow.', Date.now())).toBe('ignored');
    expect(parseSms('Maintain minimum balance in your account.', Date.now())).toBe('ignored');
  });
  it('returns null for unmatched non-ignored messages', () => {
    expect(parseSms('Have a nice day! Visit our branch.', Date.now())).toBeNull();
  });
});

describe('parseBodyDate', () => {
  it('parses dd-MM-yy to 20xx', () => {
    expect(parseBodyDate('02-10-26', 'dd-MM-yy')).toBe('2026-10-02');
  });
  it('parses dd-MM-yyyy and dd/MM/yy', () => {
    expect(parseBodyDate('02-10-2026', 'dd-MM-yyyy')).toBe('2026-10-02');
    expect(parseBodyDate('02/10/26', 'dd/MM/yy')).toBe('2026-10-02');
  });
});

describe('normalize', () => {
  it('sha256HexSync matches the known vector', () => {
    expect(sha256HexSync('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('smsHash trims before hashing', () => {
    expect(smsHash('  hello  ')).toBe(sha256HexSync('hello'));
  });
  it('counterpartyKey normalizes names', () => {
    expect(counterpartyKey('Vikas Munshilal')).toBe('vikas munshilal');
    expect(counterpartyKey('SANYOG  NANASAH.')).toBe('sanyog nanasah');
  });
  it('dedupeKey prefers reference, falls back to hash', () => {
    expect(dedupeKey('867186099240', 'abc')).toBe('ref:867186099240');
    expect(dedupeKey(null, 'abc')).toBe('sms:abc');
  });
  it('resolveOccurred passes through null body dates', () => {
    const now = Date.now();
    expect(resolveOccurred(null, now)).toBe(now);
  });
});
