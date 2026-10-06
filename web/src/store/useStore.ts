import { create } from 'zustand';
import { ApiError, extract, login as apiLogin } from '../lib/api';
import { defaultParams, type TemplateParams } from '../lib/templates';
import type { Item, TemplateType } from '../types';

const TOKEN_KEY = 'edu-approval-token';
const readToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
};
const saveToken = (t: string) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* 저장소 사용 불가 */ }
};

let seq = 0;
export const newItem = (p: Partial<Item> = {}): Item => ({ id: `i${++seq}`, itemName: '', spec: '', unit: '개', quantity: 1, unitPrice: 0, ...p });

interface State {
  token: string;
  file: File | null;
  previewUrl: string | null;
  status: 'idle' | 'loading' | 'done' | 'error';
  error: string | null;
  warnings: string[];
  meta: { provider?: string; fallbackUsed?: boolean; vendorName?: string } | null;
  items: Item[];
  template: TemplateType;
  params: TemplateParams;
  bodyOverride: string | null;

  login(code: string): Promise<void>;
  logout(): void;
  analyze(file: File): Promise<void>;
  setTemplate(t: TemplateType): void;
  setParams(p: Partial<TemplateParams>): void;
  setBody(text: string | null): void;
  updateItem(id: string, patch: Partial<Item>): void;
  addItem(): void;
  removeItem(id: string): void;
}

export const useStore = create<State>((set, get) => ({
  token: readToken(),
  file: null,
  previewUrl: null,
  status: 'idle',
  error: null,
  warnings: [],
  meta: null,
  items: [newItem()],
  template: 'TEMPLATE_PURCHASE',
  params: defaultParams(),
  bodyOverride: null,

  async login(code) {
    const token = await apiLogin(code);
    saveToken(token);
    set({ token });
  },
  logout() {
    saveToken('');
    set({ token: '' });
  },
  async analyze(file) {
    const prev = get().previewUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ file, previewUrl: URL.createObjectURL(file), status: 'loading', error: null, warnings: [], meta: null });
    try {
      const r = await extract(file, get().token);
      set({
        status: 'done',
        items: r.items.length ? r.items.map((i) => newItem(i)) : [newItem()],
        template: r.suggestedTemplate,
        bodyOverride: null,
        warnings: r.warnings ?? [],
        meta: { provider: r.provider, fallbackUsed: r.fallbackUsed, vendorName: r.vendorName },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) get().logout();
      set({ status: 'error', error: e instanceof Error ? e.message : '알 수 없는 오류' });
    }
  },
  setTemplate: (template) => set({ template, bodyOverride: null }),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p }, bodyOverride: null })),
  setBody: (bodyOverride) => set({ bodyOverride }),
  updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), bodyOverride: null })),
  addItem: () => set((s) => ({ items: [...s.items, newItem()] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), bodyOverride: null })),
}));
