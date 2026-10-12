/**
 * Design tokens: 16-color category palette, spacing, radii, light/dark themes.
 * Pure TypeScript — safe to import in Node tests and on all platforms.
 */

/** 16 distinct, accessible colors used for categories and charts. */
export const palette = {
  orange: '#F97316',
  amber: '#F59E0B',
  yellow: '#EAB308',
  lime: '#84CC16',
  green: '#22C55E',
  emerald: '#10B981',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  purple: '#A855F7',
  pink: '#EC4899',
  rose: '#F43F5E',
  slate: '#64748B',
} as const;

export type PaletteName = keyof typeof palette;

/** Ordered list of the 16 palette hexes (used for seed assignment + charts). */
export const categoryColors: string[] = [
  palette.orange,
  palette.amber,
  palette.yellow,
  palette.lime,
  palette.green,
  palette.emerald,
  palette.teal,
  palette.cyan,
  palette.sky,
  palette.blue,
  palette.indigo,
  palette.violet,
  palette.purple,
  palette.pink,
  palette.rose,
  palette.slate,
];

export const UNCATEGORIZED_COLOR = '#9CA3AF';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export interface ThemeTokens {
  mode: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  primary: string;
  danger: string;
  success: string;
  border: string;
  card: string;
}

export const lightTheme: ThemeTokens = {
  mode: 'light',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#208AEF',
  danger: '#DC2626',
  success: '#16A34A',
  border: '#E2E8F0',
  card: '#FFFFFF',
};

export const darkTheme: ThemeTokens = {
  mode: 'dark',
  background: '#0B0F14',
  surface: '#111827',
  surfaceMuted: '#1F2937',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  primary: '#38BDF8',
  danger: '#F87171',
  success: '#4ADE80',
  border: '#1F2937',
  card: '#111827',
};
