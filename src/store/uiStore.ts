import { create } from 'zustand';

export type PeriodMode = 'week' | 'month' | 'year';

export interface Period {
  /** 'week' | 'month' | 'year' */
  mode: PeriodMode;
  /** Anchor date 'YYYY-MM-DD' inside the selected period. */
  anchor: string;
}

export type TxnDirectionFilter = 'all' | 'debit' | 'credit';
export type TxnSourceFilter = 'all' | 'sms' | 'manual';

export interface TxnFilters {
  query: string;
  direction: TxnDirectionFilter;
  categoryIds: number[];
  accountId: number | null;
  source: TxnSourceFilter;
}

export const DEFAULT_FILTERS: TxnFilters = {
  query: '',
  direction: 'all',
  categoryIds: [],
  accountId: null,
  source: 'all',
};

interface UiState {
  /** Bumped after every committed DB write; read hooks depend on it. */
  dbVersion: number;
  bump: () => void;
  period: Period;
  setPeriod: (p: Partial<Period>) => void;
  filters: TxnFilters;
  setFilters: (f: Partial<TxnFilters>) => void;
  resetFilters: () => void;
  /** Currently highlighted/selected category id (charts, filters). */
  selectedCategory: number | null;
  setSelectedCategory: (id: number | null) => void;
}

function todayLocal(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const useUiStore = create<UiState>()((set) => ({
  dbVersion: 0,
  bump: () => set((s) => ({ dbVersion: s.dbVersion + 1 })),
  period: { mode: 'month', anchor: todayLocal() },
  setPeriod: (p) => set((s) => ({ period: { ...s.period, ...p } })),
  filters: DEFAULT_FILTERS,
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  selectedCategory: null,
  setSelectedCategory: (id) => set({ selectedCategory: id }),
}));
