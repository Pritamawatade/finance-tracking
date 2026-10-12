import { useState } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { smsMessages } from '@/db/schema';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { EmptyState } from '@/components/ui/EmptyState';

/** Debug list of SMS that matched a sender but no template (parse_status=unparsed). */
export default function Unparsed() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [copied, setCopied] = useState<number | null>(null);

  const rows = (() => {
    try {
      return getDb()
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.parseStatus, 'unparsed'))
        .all();
    } catch {
      return [];
    }
  })();
  void dbVersion;

  const copy = async (id: number, body: string) => {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(body);
        setCopied(id);
      } catch {
        // clipboard unavailable
      }
      return;
    }
    // Native without expo-clipboard dep: body text is selectable for manual copy.
    setCopied(id);
  };

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.h, { color: t.text }]}>Unparsed ({rows.length})</Text>
      {rows.length === 0 ? (
        <EmptyState title="Nothing unparsed" hint="SMS from monitored senders that match no template show up here." />
      ) : (
        rows.map((r) => (
          <View key={r.id} style={[styles.card, { borderColor: t.border, backgroundColor: t.card }]}>
            <Text style={[styles.sender, { color: t.text }]}>{r.sender}</Text>
            <Text selectable style={[styles.body, { color: t.textMuted }]}>{r.body}</Text>
            <Button title={copied === r.id ? 'Copied ✓' : 'Copy text'} onPress={() => void copy(r.id, r.body)} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  h: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  sender: { fontWeight: '700', marginBottom: 4 },
  body: { fontSize: 13, marginBottom: 8 },
});
