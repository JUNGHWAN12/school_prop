import { describe, expect, it } from 'vitest';
import { assertRaw, normalizeExtraction, parseJsonLoose } from './extraction';

describe('normalizeExtraction', () => {
  it('VAT 포함/면세는 단가 그대로', () => {
    const n = normalizeExtraction({ vat_mode: 'exempt', items: [{ item_name: '책', quantity: 2, unit_price: 15300, line_amount: 30600 }] });
    expect(n.items[0]).toMatchObject({ unitPrice: 15300, unit: '개', quantity: 2 });
    expect(n.warnings).toEqual([]);
  });
  it('VAT 별도는 세액으로 환산', () => {
    const n = normalizeExtraction({ vat_mode: 'excluded', items: [{ item_name: 'A', quantity: 2, unit_price: 1000, line_amount: 2000, line_tax: 200 }] });
    expect(n.items[0].unitPrice).toBe(1100);
  });
  it('VAT 환산 안내는 품목 수와 무관하게 한 줄', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ item_name: `A${i}`, quantity: 1, unit_price: 1000 }));
    const n = normalizeExtraction({ vat_mode: 'excluded', items });
    expect(n.warnings.filter((w) => w.includes('환산'))).toHaveLength(1);
    expect(n.warnings[0]).toContain('10개 품목');
  });
  it('VAT 별도에 세액이 없으면 10% 가산', () => {
    const n = normalizeExtraction({ vat_mode: 'excluded', items: [{ item_name: 'A', quantity: 1, unit_price: 1000 }] });
    expect(n.items[0].unitPrice).toBe(1100);
  });
  it('금액 불일치 경고, 잘못된 항목 제외', () => {
    const n = normalizeExtraction({ vat_mode: 'included', items: [
      { item_name: 'A', quantity: 2, unit_price: 1000, line_amount: 3000 },
      { item_name: '', quantity: 1, unit_price: 1 },
    ] });
    expect(n.items).toHaveLength(1);
    expect(n.warnings.some((w) => w.includes('다릅니다'))).toBe(true);
    expect(n.warnings.some((w) => w.includes('제외'))).toBe(true);
  });
  it('알 수 없는 템플릿은 약식', () => {
    expect(normalizeExtraction({ suggested_template: 'x', items: [] }).suggestedTemplate).toBe('TEMPLATE_PURCHASE');
  });
});

describe('parse', () => {
  it('코드펜스 허용', () => expect(parseJsonLoose('```json\n{"items":[]}\n```')).toEqual({ items: [] }));
  it('스키마 위반', () => expect(() => assertRaw({ a: 1 })).toThrow());
});
