import { useEffect, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../db/migrations/migrations';
import { ensureSeeded } from '../db/seed';
import { getDb } from '../db/client';
import { useUiStore } from '../store/uiStore';
import { darkTheme, lightTheme } from '../theme/tokens';
import { buildParserConfig, hashParserConfig } from '../services/nativeConfig';
import { TEMPLATES } from '../services/parser/templates';
import { parseSms } from '../services/parser/parse';
import { ingestInboxItems, type InboxItemLike } from '../services/ingest';
import { syncOnAppOpen } from '../services/smsSync';
import { getSetting, setSetting } from '../repositories/settings';
import { rescheduleMonthEnd } from '../services/monthEnd';
import { getBridge } from '../services/bridge';

async function bootstrapSmsSync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const bridge = await getBridge();
    if (!bridge) return;
    const db = getDb();
    await syncOnAppOpen({
      buildConfig: () => ({
        ...buildParserConfig(db, { templates: TEMPLATES }),
        templates: TEMPLATES,
      }),
      getHash: (c) => hashParserConfig(c),
      configure: (c) =>
        bridge.configure({
          ...c,
          templates: c.templates as unknown as [],
        }),
      drainInbox: () => bridge.drainInbox() as Promise<(InboxItemLike & { id: number })[]>,
      ackInbox: (ids) => bridge.ackInbox(ids),
      readSmsInbox: (since, limit) => bridge.readSmsInbox(since, limit),
      ingest: async (items) => ingestInboxItems(db, items),
      getStoredConfigHash: () => getSetting(db, 'native_config_hash', ''),
      saveStoredConfigHash: (h) => setSetting(db, 'native_config_hash', h),
      getLastSmsSyncAt: () => Number(getSetting(db, 'last_sms_sync_at', '0') || '0'),
      saveLastSmsSyncAt: (ms) => setSetting(db, 'last_sms_sync_at', String(ms)),
      parseRawSms: (sms) => {
        const r = parseSms(sms.body, sms.receivedAt);
        if (r === null || r === 'ignored') {
          return {
            smsHash: sms.smsHash,
            sender: sms.sender,
            body: sms.body,
            receivedAt: sms.receivedAt,
            parsed: null,
            state: 'pending' as const,
            categoryId: null,
          };
        }
        return {
          smsHash: sms.smsHash,
          sender: sms.sender,
          body: sms.body,
          receivedAt: sms.receivedAt,
          parsed: {
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
          state: 'pending' as const,
          categoryId: null,
        };
      },
      onDbChanged: () => useUiStore.getState().bump(),
    });
    await rescheduleMonthEnd(db).catch(() => undefined);
  } catch {
    // Never crash the app for sync failures.
  }
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [ready, setReady] = useState(false);

  // Migration gate: useMigrations needs its own drizzle handle.
  const expoDb = openDatabaseSync('finance.db');
  const migDb = drizzle(expoDb);
  const { success, error } = useMigrations(migDb, migrations);

  // Migration gate + seed + SMS sync bootstrap (fetch-on-mount pattern).
  useEffect(() => {
    if (!success) return;
    try {
      ensureSeeded(getDb());
    } catch {
      // web/node: DB unavailable — still render.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    void bootstrapSmsSync();
  }, [success]);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void bootstrapSmsSync();
    });
    let inboxSub: { remove: () => void } | null = null;
    void (async () => {
      const bridge = await getBridge();
      if (bridge) {
        try {
          inboxSub = bridge.addInboxListener(() => void bootstrapSmsSync());
        } catch {
          inboxSub = null;
        }
      }
    })();
    return () => {
      sub.remove();
      inboxSub?.remove();
    };
  }, [ready]);

  void error;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: scheme === 'dark' ? darkTheme.card : lightTheme.card,
              },
              headerTintColor: scheme === 'dark' ? darkTheme.text : lightTheme.text,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen
              name="transaction/new"
              options={{ presentation: 'modal', title: 'Add transaction' }}
            />
            <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
            <Stack.Screen name="review/index" options={{ title: 'Needs review' }} />
            <Stack.Screen
              name="review/[id]"
              options={{ presentation: 'modal', title: 'Categorize' }}
            />
            <Stack.Screen name="summary/[month]" options={{ title: 'Month summary' }} />
            <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
            <Stack.Screen name="accounts/index" options={{ title: 'Accounts' }} />
            <Stack.Screen name="debug/unparsed" options={{ title: 'Unparsed SMS' }} />
            <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
          </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
