import { describe, expect, it } from 'vitest';
import { describeVat, loadVatChoice, parseVatChoice, saveVatChoice, VAT_OPTIONS } from './vat';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('vat', () => {
  it('저장된 값 복원(허용값만, 나머지는 자동)', () => {
    const s = fakeStorage();
    expect(loadVatChoice(s)).toBe('auto');
    saveVatChoice('excluded', s);
    expect(loadVatChoice(s)).toBe('excluded');
    s.setItem('edu-approval-vat', 'garbage');
    expect(loadVatChoice(s)).toBe('auto');
    expect(parseVatChoice('exempt')).toBe('exempt');
  });
  it('저장소가 예외를 던져도 안전', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadVatChoice(broken)).toBe('auto');
    expect(() => saveVatChoice('included', broken)).not.toThrow();
  });
  it('안내 문구', () => {
    expect(describeVat('excluded', 'user')).toBe('VAT 별도 (직접 선택)');
    expect(describeVat('included', 'total')).toBe('VAT 포함 (합계금액 기준 자동 판별)');
    expect(describeVat('exempt', 'model')).toBe('면세 (AI 판단)');
    expect(describeVat(undefined)).toBeUndefined();
  });
  it('선택지 4개, 자동이 첫 번째', () => {
    expect(VAT_OPTIONS.map((o) => o.value)).toEqual(['auto', 'included', 'excluded', 'exempt']);
  });
});
