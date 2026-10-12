import { useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDb } from '@/db/client';
import { createAccount, listAccounts, updateAccount } from '@/repositories/accounts';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { formatINR } from '@/utils/money';

export default function AccountsScreen() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const accs = (() => {
    try {
      return listAccounts(getDb(), true);
    } catch {
      return [];
    }
  })();
  void dbVersion;

  const add = () => {
    if (!name.trim()) {
      setErr('Name required.');
      return;
    }
    try {
      createAccount(getDb(), { name: name.trim(), type: 'bank' });
      setName('');
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed.');
    }
  };

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.h, { color: t.text }]}>Accounts</Text>
      {accs.map((a) => (
        <View key={a.id} style={[styles.card, { borderColor: t.border, backgroundColor: t.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{a.name}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {a.type}
              {a.last4 ? ` ••${a.last4}` : ''}
              {a.latestBalanceMinor != null ? ` · Bal ₹${formatINR(a.latestBalanceMinor)}` : ''}
              {a.isArchived === 1 ? ' · archived' : ''}
            </Text>
          </View>
          {a.isArchived === 0 ? (
            <Pressable onPress={() => { try { updateAccount(getDb(), a.id, { isArchived: 1 }); } catch { /* ignore */ } }}>
              <Text style={{ color: t.danger }}>Archive</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => { try { updateAccount(getDb(), a.id, { isArchived: 0 }); } catch { /* ignore */ } }}>
              <Text style={{ color: t.primary }}>Restore</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text style={[styles.h, { color: t.text }]}>Add account</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. HDFC ••1234"
        placeholderTextColor={t.textMuted}
        style={[styles.input, { borderColor: t.border, color: t.text }]}
      />
      {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
      <Button title="Add" onPress={add} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  h: { fontSize: 16, fontWeight: '800', marginVertical: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
});
