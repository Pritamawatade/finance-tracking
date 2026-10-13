import { useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/repositories/settings';
import { ingestInboxItems, type InboxItemLike } from '@/services/ingest';
import { parseSms } from '@/services/parser/parse';
import { useAppTheme } from '@/theme/useTheme';
import { ScreenView } from '@/components/ui/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { getBridge } from '@/services/bridge';

type SenderRow = { sender: string; count: number; matches: boolean; sample: string };

function StepShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.step}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>{body}</Text>
      {children}
    </View>
  );
}

async function sha256Hex(s: string): Promise<string> {
  if (Platform.OS === 'web') {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }
  const Crypto = await import('expo-crypto');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s.trim());
}

export default function Onboarding() {
  const t = useAppTheme();
  const [step, setStep] = useState(0);
  const [sysState, setSysState] = useState<string>('Not checked yet');
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [picked, setPicked] = useState<string[]>(['EQUTAS', 'EQUITAS']);
  const [busy, setBusy] = useState(false);

  const checkState = async () => {
    const bridge = await getBridge();
    if (!bridge) {
      setSysState('SMS bridge unavailable on this platform.');
      return;
    }
    try {
      const s = await bridge.getSystemState();
      setSysState(
        `receiveSms=${s.receiveSms} readSms=${s.readSms} notifications=${s.notifications} batteryIgnored=${s.batteryOptimizationIgnored}`,
      );
    } catch (e) {
      setSysState(`check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const requestPerms = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const { PermissionsAndroid } = await import('react-native');
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      ]);
    } catch {
      // ignore
    }
    await checkState();
  };

  const loadSenders = async () => {
    setBusy(true);
    try {
      const bridge = await getBridge();
      if (!bridge) {
        setSenders([]);
        return;
      }
      const rows = await bridge.readSmsInbox(Date.now() - 90 * 86400000, 500);
      const groups = new Map<string, { count: number; sample: string }>();
      for (const r of rows) {
        const g = groups.get(r.sender) ?? { count: 0, sample: r.body };
        g.count += 1;
        groups.set(r.sender, g);
      }
      const out: SenderRow[] = [...groups.entries()]
        .map(([sender, g]) => ({
          sender,
          count: g.count,
          matches: parseSms(g.sample, Date.now()) !== null,
          sample: g.sample,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
      setSenders(out);
      setPicked(out.filter((r) => r.matches).map((r) => r.sender));
    } finally {
      setBusy(false);
    }
  };

  const importHistory = async (mode: 'month' | '3mo' | 'skip') => {
    if (mode === 'skip') {
      setStep(4);
      return;
    }
    setBusy(true);
    try {
      const bridge = await getBridge();
      const db = getDb();
      if (bridge) {
        const now = new Date();
        const start =
          mode === 'month'
            ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
            : Date.now() - 90 * 86400000;
        const rows = await bridge.readSmsInbox(start, 500);
        const items: InboxItemLike[] = [];
        for (const sms of rows) {
          const r = parseSms(sms.body, sms.receivedAt);
          items.push({
            smsHash: sms.smsHash || (await sha256Hex(sms.body)),
            sender: sms.sender,
            body: sms.body,
            receivedAt: sms.receivedAt,
            parsed:
              r === null || r === 'ignored'
                ? null
                : {
                    templateId: r.templateId,
                    direction: r.direction,
                    amountMinor: r.amountMinor,
                    accountLast4: r.accountLast4,
                    bankName: 'Equitas',
                    reference: r.reference,
                    counterparty: r.counterparty,
                    description: r.description,
                    channel: r.channel,
                    txnDate: r.txnDate,
                    balanceAfterMinor: r.balanceAfterMinor,
                    lowConfidence: r.lowConfidence,
                  },
            state: 'pending',
            categoryId: null,
          });
        }
        if (items.length > 0) ingestInboxItems(db, items);
      }
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    try {
      const db = getDb();
      setSetting(db, 'monitored_sender_patterns', JSON.stringify(picked));
      setSetting(db, 'onboarding_done', '1');
    } catch {
      // ignore
    }
    router.replace('/(tabs)');
  };

  return (
    <ScreenView contentStyle={{ backgroundColor: t.background }}>
      {step === 0 && (
        <StepShell
          title="Welcome"
          body="Finance Tracker keeps everything on this phone. No accounts, no cloud — your SMS and money data never leave the device."
        >
          <AppButton title="Continue" onPress={() => setStep(1)} />
        </StepShell>
      )}
      {step === 1 && (
        <StepShell
          title="Permissions"
          body="Bank SMS detection needs SMS + notification permission. On Android 13+ sideloaded apps may need 'Allow restricted settings' first (App info menu)."
        >
          <AppButton title="Request permissions" onPress={requestPerms} />
          <View style={{ height: 8 }} />
          <AppButton title="Check again" onPress={checkState} />
          <Text style={[styles.mono, { color: t.textMuted }]}>{sysState}</Text>
          <OpenSettingsRow />
          <View style={{ height: 8 }} />
          <AppButton title="Continue" onPress={() => { void loadSenders(); setStep(2); }} />
        </StepShell>
      )}
      {step === 2 && (
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Pick bank senders</Text>
          <Text style={[styles.body, { color: t.textMuted }]}>
            Senders from the last 90 days. Check = looks like a bank SMS.
          </Text>
          {busy ? <Text>Loading…</Text> : null}
          <FlatList
            data={senders}
            keyExtractor={(r) => r.sender}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item }) => {
              const on = picked.includes(item.sender);
              return (
                <Pressable
                  onPress={() =>
                    setPicked((p) =>
                      on ? p.filter((s) => s !== item.sender) : [...p, item.sender],
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Sender ${item.sender}`}
                  accessibilityState={{ checked: on }}
                  style={[styles.senderRow, { borderColor: t.border }]}
                >
                  <Text style={{ color: t.text }}>
                    {on ? '☑' : '☐'} {item.sender} ({item.count}) {item.matches ? '✓' : ''}
                  </Text>
                  <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {item.sample}
                  </Text>
                </Pressable>
              );
            }}
          />
          <AppButton title="Continue" onPress={() => setStep(3)} />
        </View>
      )}
      {step === 3 && (
        <StepShell title="Import history" body="Imported items arrive as pending in Review — no notification flood.">
          <AppButton title="This month" onPress={() => void importHistory('month')} />
          <View style={{ height: 8 }} />
          <AppButton title="Last 3 months" onPress={() => void importHistory('3mo')} />
          <View style={{ height: 8 }} />
          <AppButton title="Skip" onPress={() => void importHistory('skip')} />
          {busy ? <Text>Importing…</Text> : null}
        </StepShell>
      )}
      {step === 4 && (
        <StepShell
          title="Reliability tips"
          body="Disable battery optimization for this app so SMS detection keeps working when the phone sleeps. Force-stopping the app disables detection until next launch."
        >
          <OpenBatteryRow />
          <View style={{ height: 8 }} />
          <AppButton title="Done" onPress={finish} />
          <View style={{ height: 12 }} />
          <Link href="/(tabs)" style={{ color: t.primary }}>
            Skip to app
          </Link>
        </StepShell>
      )}
      <GuardNote />
    </ScreenView>
  );
}

function OpenSettingsRow() {
  return (
    <AppButton
      title="Open app settings"
      onPress={() => {
        void (async () => (await getBridge())?.openAppSettings())();
      }}
    />
  );
}

function OpenBatteryRow() {
  return (
    <AppButton
      title="Open battery settings"
      onPress={() => {
        void (async () => (await getBridge())?.openBatteryOptimizationSettings())();
      }}
    />
  );
}

function GuardNote() {
  void getSetting;
  return null;
}

const styles = StyleSheet.create({
  step: { gap: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 14, marginBottom: 12 },
  mono: { fontSize: 12, marginVertical: 8 },
  senderRow: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, minHeight: 52 },
});
