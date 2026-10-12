import { Platform } from 'react-native';
import { getSetting, setSetting } from '../repositories/settings';
import type { AppDb } from '../db/types';

/**
 * Spec §9.6 — month-end summary notification via expo-notifications
 * (one-shot DATE trigger, 09:00 on the 1st of next month).
 * All expo imports are dynamic so web never crashes at import time.
 */

export function nextMonthFirst0900(now: Date = new Date()): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  return new Date(y, m + 1, 1, 9, 0, 0, 0);
}

export function monthKeyForSummary(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}

/** Cancel + re-schedule the month-end notification. Safe on all platforms. */
export async function rescheduleMonthEnd(db: AppDb): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const enabled = getSetting(db, 'month_end_notification', '1') === '1';
    const Notifications = await import('expo-notifications');
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    if (!enabled) return;
    const trigger = nextMonthFirst0900(new Date());
    const month = monthKeyForSummary(new Date());
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your monthly summary is ready',
        body: 'Tap to see what you received, spent and saved.',
        data: { url: `financetracker://summary/${month}` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
    }).catch(() => undefined);
    setSetting(db, 'month_end_last_scheduled', new Date().toISOString());
  } catch {
    // Notifications unavailable (web, tests) — ignore.
  }
}

/** Request notification permission (used by onboarding). Returns granted flag. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}
