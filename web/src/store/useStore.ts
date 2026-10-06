import { create } from 'zustand';
import { ApiError, extract } from '../lib/api';
import { defaultParams, type TemplateParams } from '../lib/templates';
import type { Item, TemplateType } from '../types';

let seq = 0;
export const newItem = (p: Partial<Item> = {}): Item => ({ id: `i${++seq}`, itemName: '', spec: '', unit: '개', quantity: 1, unitPrice: 0, ...p });

interface State {
  file: File | null;
  previewUrl: string | null;
  status: 'idle' | 'loading' | 'done' | 'error';
  error: string | null;
  errorDetail: string | null;
  warnings: string[];
  meta: { provider?: string; fallbackUsed?: boolean; vendorName?: string; statedTotal?: number } | null;
  items: Item[];
  template: TemplateType;
  params: TemplateParams;
  bodyOverride: string | null;

  analyze(file: File): Promise<void>;
  setTemplate(t: TemplateType): void;
  setParams(p: Partial<TemplateParams>): void;
  setBody(text: string | null): void;
  updateItem(id: string, patch: Partial<Item>): void;
  addItem(): void;
  removeItem(id: string): void;
}

export const useStore = create<State>((set, get) => ({
  file: null,
  previewUrl: null,
  status: 'idle',
  error: null,
  errorDetail: null,
  warnings: [],
  meta: null,
  items: [newItem()],
  template: 'TEMPLATE_PURCHASE',
  params: defaultParams(),
  bodyOverride: null,

  async analyze(file) {
    const prev = get().previewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ file, previewUrl: URL.createObjectURL(file), status: 'loading', error: null, errorDetail: null, warnings: [], meta: null });
    try {
      const r = await extract(file);
      set({
        status: 'done',
        items: r.items.length ? r.items.map((i) => newItem(i)) : [newItem()],
        template: r.suggestedTemplate,
        bodyOverride: null,
        warnings: r.warnings ?? [],
        meta: { provider: r.provider, fallbackUsed: r.fallbackUsed, vendorName: r.vendorName, statedTotal: r.statedTotal },
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : '알 수 없는 오류', errorDetail: e instanceof ApiError ? e.detail || null : null });
    }
  },
  setTemplate: (template) => set({ template, bodyOverride: null }),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p }, bodyOverride: null })),
  setBody: (bodyOverride) => set({ bodyOverride }),
  updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), bodyOverride: null })),
  addItem: () => set((s) => ({ items: [...s.items, newItem()] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), bodyOverride: null })),
}));
