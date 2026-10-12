import { Platform } from 'react-native';

export type SmsBridgeModule = typeof import('../../modules/sms-bridge/src/index');

let cached: SmsBridgeModule | null = null;
let attempted = false;

/**
 * Web-safe lazy access to the native sms-bridge module.
 * Returns null on web / Node / when the native module is absent
 * (e.g. Expo Go). All callers must handle null.
 */
export async function getBridge(): Promise<SmsBridgeModule | null> {
  if (Platform.OS !== 'android') return null;
  if (cached) return cached;
  if (attempted) return cached;
  attempted = true;
  try {
    const mod = await import('../../modules/sms-bridge/src/index');
    cached = mod;
    return mod;
  } catch {
    return null;
  }
}

export function isAndroid(): boolean {
  return Platform.OS === 'android';
}
