import { useState } from 'react';
import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDb } from '@/db/client';
import {
  archiveCategory,
  createCategory,
  listCategories,
  unarchiveCategory,
  updateCategory,
} from '@/repositories/categories';
import { useUiStore } from '@/store/uiStore';
import { useAppTheme } from '@/theme/useTheme';
import { categoryColors } from '@/theme/tokens';

export default function CategoriesScreen() {
  const t = useAppTheme();
  const dbVersion = useUiStore((s) => s.dbVersion);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState('');

  const cats = (() => {
    try {
      return listCategories(getDb(), showArchived);
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
      createCategory(getDb(), {
        name: name.trim(),
        kind,
        icon: '📦',
        color: categoryColors[name.length % categoryColors.length] as string,
      });
      setName('');
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed.');
    }
  };

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: t.background }]}>
      <Text style={[styles.h, { color: t.text }]}>Add category</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={t.textMuted}
        style={[styles.input, { borderColor: t.border, color: t.text }]}
      />
      <View style={styles.row}>
        {(['expense', 'income'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={[styles.kind, { backgroundColor: kind === k ? t.primary : t.surfaceMuted }]}
          >
            <Text style={{ color: kind === k ? '#fff' : t.text }}>{k}</Text>
          </Pressable>
        ))}
        <Button title="Add" onPress={add} />
      </View>
      {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
      <Pressable onPress={() => setShowArchived((s) => !s)}>
        <Text style={{ color: t.primary }}>{showArchived ? 'Hide archived' : 'Show archived'}</Text>
      </Pressable>
      {cats.map((c) => (
        <View key={c.id} style={[styles.card, { borderColor: t.border, backgroundColor: t.card }]}>
          <View style={[styles.dot, { backgroundColor: c.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text }}>
              {c.icon} {c.name} · {c.kind}
              {c.isArchived === 1 ? ' (archived)' : ''}
              {c.isSystem === 1 ? ' · system' : ''}
            </Text>
          </View>
          {c.isSystem !== 1 && c.isArchived === 0 && (
            <Pressable
              onPress={() => {
                Alert.alert('Archive?', c.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Archive',
                    onPress: () => {
                      try { archiveCategory(getDb(), c.id); } catch { /* ignore */ }
                    },
                  },
                ]);
              }}
            >
              <Text style={{ color: t.danger }}>Archive</Text>
            </Pressable>
          )}
          {c.isArchived === 1 && (
            <Pressable onPress={() => { try { unarchiveCategory(getDb(), c.id); } catch { /* ignore */ } }}>
              <Text style={{ color: t.primary }}>Restore</Text>
            </Pressable>
          )}
          {c.isSystem !== 1 && c.isArchived === 0 && (
            <Pressable
              onPress={() => {
                try { updateCategory(getDb(), c.id, { sortOrder: c.sortOrder }); } catch { /* ignore */ }
              }}
            >
              <Text />
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  h: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  kind: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
