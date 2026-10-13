import { useEffect, useState } from 'react';
import { Button, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { getDb } from '@/db/client';
import { getAllSettings, getSetting, setSetting } from '@/repositories/settings';
import { listTransactions, updateTransaction } from '@/repositories/transactions';
import { exportTransactionsCsv } from '@/services/exportData';
import { rescheduleMonthEnd } from '@/services/monthEnd';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { getBridge } from '@/services/bridge';

export default function Settings() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [sys, setSys] = useState('Not checked yet');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [senders, setSenders] = useState('');
  const [ignored, setIgnored] = useState(0);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    try {
      setSettings(getAllSettings(getDb()));
      setSenders(getSetting(getDb(), 'monitored_sender_patterns', '["EQUTAS","EQUITAS"]'));
      setIgnored(listTransactions(getDb(), { status: 'ignored' }).length);
    } catch {
      // ignore on web
    }
    const bridge = await getBridge();
    if (!bridge) {
      setSys('SMS bridge unavailable on this platform.');
      return;
    }
    try {
      const s = await bridge.getSystemState();
      setSys(
        `receiveSms=${s.receiveSms} readSms=${s.readSms} notifications=${s.notifications} batteryIgnored=${s.batteryOptimizationIgnored}`,
      );
    } catch {
      setSys('check failed');
    }
  };

  // Fetch-on-mount refresh pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [dbVersion]);

  const saveSenders = () => {
    try {
      const parsed: unknown = JSON.parse(senders);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      setSetting(getDb(), 'monitored_sender_patterns', JSON.stringify(parsed));
      setMsg('Senders saved.');
    } catch {
      setMsg('Invalid JSON array.');
    }
  };

  const restoreIgnored = () => {
    try {
      const db = getDb();
      const rows = listTransactions(db, { status: 'ignored' });
      for (const r of rows) updateTransaction(db, r.id, { status: 'pending' });
      setMsg(`Restored ${rows.length} ignored items to Review.`);
    } catch {
      setMsg('Restore failed.');
    }
  };

  const toggle = (key: string, v: boolean) => {
    try {
      setSetting(getDb(), key, v ? '1' : '0');
      if (key === 'month_end_notification') void rescheduleMonthEnd(getDb());
    } catch {
      // ignore
    }
  };

  const on = (key: string, fallback = '0'): boolean =>
    (settings[key] ?? fallback) === '1';

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.h, { color: t.text }]}>SMS & notifications</Text>
      <Text style={[styles.mono, { color: t.textMuted }]}>{sys}</Text>
      <Button title="Refresh status" onPress={() => void refresh()} />
      <View style={{ height: 8 }} />
      <Button
        title="Open app settings"
        onPress={() => void (async () => (await getBridge())?.openAppSettings())()}
      />
      <View style={{ height: 8 }} />
      <Button
        title="Battery optimization settings"
        onPress={() => void (async () => (await getBridge())?.openBatteryOptimizationSettings())()}
      />

      <Text style={[styles.h, { color: t.text }]}>Monitored senders (regex JSON)</Text>
      <TextInput
        value={senders}
        onChangeText={setSenders}
        multiline
        style={[styles.input, { borderColor: t.border, color: t.text }]}
      />
      <Button title="Save senders" onPress={saveSenders} />

      <Text style={[styles.h, { color: t.text }]}>Manage</Text>
      <Link href="/categories" asChild>
        <Pressable style={StyleSheet.flatten([styles.link, { borderColor: t.border }])}>
          <Text style={{ color: t.text }}>Categories →</Text>
        </Pressable>
      </Link>
      <Link href="/accounts" asChild>
        <Pressable style={StyleSheet.flatten([styles.link, { borderColor: t.border }])}>
          <Text style={{ color: t.text }}>Accounts →</Text>
        </Pressable>
      </Link>
      <Link href="/debug/unparsed" asChild>
        <Pressable style={StyleSheet.flatten([styles.link, { borderColor: t.border }])}>
          <Text style={{ color: t.text }}>Unparsed messages →</Text>
        </Pressable>
      </Link>

      <Text style={[styles.h, { color: t.text }]}>Preferences</Text>
      {(
        [
          ['month_end_notification', 'Month-end summary notification'],
          ['prompt_notifications', 'Transaction prompt notifications'],
          ['silent_confirmations', 'Silent confirmations'],
          ['app_lock', 'App lock (biometric)'],
        ] as const
      ).map(([key, label]) => (
        <View key={key} style={styles.toggleRow}>
          <Text style={{ color: t.text, flex: 1 }}>{label}</Text>
          <Switch value={on(key, key === 'prompt_notifications' ? '1' : '0')} onValueChange={(v) => toggle(key, v)} />
        </View>
      ))}
      <View style={styles.toggleRow}>
        <Text style={{ color: t.text, flex: 1 }}>Theme ({settings['theme'] ?? 'system'})</Text>
      </View>
      <View style={styles.themeRow}>
        {(['system', 'light', 'dark'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              try { setSetting(getDb(), 'theme', m); } catch { /* ignore */ }
            }}
            style={[styles.themeBtn, { backgroundColor: (settings['theme'] ?? 'system') === m ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: (settings['theme'] ?? 'system') === m ? '#fff' : t.text }}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.h, { color: t.text }]}>Ignored items ({ignored})</Text>
      <Button title="Restore ignored to Review" onPress={restoreIgnored} />

      <Text style={[styles.h, { color: t.text }]}>Export</Text>
      <Button
        title="Export CSV"
        onPress={() => void (async () => {
          const uri = await exportTransactionsCsv(getDb());
          setMsg(uri ? `Exported: ${uri}` : 'Export unavailable on this platform.');
        })()}
      />

      {__DEV__ && Platform.OS === 'android' && (
        <>
          <Text style={[styles.h, { color: t.text }]}>Debug</Text>
          <Button
            title="Simulate SMS (Equitas debit)"
            onPress={() => void (async () => {
              await (await getBridge())?.debugInjectSms(
                'AX-EQUTAS-S',
                'INR 30.00 debited from Equitas-2825 via UPI -Ref:627951725402 to Vikas Munshilal on 06-10-26.Bal INR 864.45.',
              );
              setMsg('Simulated SMS injected.');
            })()}
          />
        </>
      )}
      {msg ? <Text style={[styles.msg, { color: t.primary }]}>{msg}</Text> : null}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  h: { fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  mono: { fontSize: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, marginBottom: 8 },
  link: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  msg: { marginTop: 12 },
});
