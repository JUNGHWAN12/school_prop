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

describe('견적서 합계 대조', () => {
  const base = [
    { item_name: 'HDMI 케이블 15M', quantity: 1, unit_price: 30000, line_amount: 30000 },
    { item_name: 'HDMI 케이블 20M', quantity: 1, unit_price: 45000, line_amount: 45000 },
  ];
  it('품목이 누락되면 합계 불일치 경고를 맨 앞에', () => {
    const n = normalizeExtraction({ vat_mode: 'included', total_amount: 130000, items: base });
    expect(n.warnings[0]).toContain('75,000원');
    expect(n.warnings[0]).toContain('130,000원');
  });
  it('작업비까지 포함하면 경고 없음', () => {
    const n = normalizeExtraction({ vat_mode: 'included', total_amount: 130000, items: [...base, { item_name: '작업비', quantity: 1, unit_price: 55000, line_amount: 55000 }] });
    expect(n.warnings).toEqual([]);
    expect(n.statedTotal).toBe(130000);
  });
  it('VAT 별도 환산 후 반올림 오차는 허용', () => {
    const n = normalizeExtraction({ vat_mode: 'excluded', total_amount: 1292940, items: [{ item_name: 'A', quantity: 25, unit_price: 37300 }, { item_name: 'B', quantity: 1, unit_price: 242000 }] });
    expect(n.warnings.some((w) => w.includes('다릅니다'))).toBe(false);
  });
  it('합계가 없으면 대조하지 않음', () => {
    expect(normalizeExtraction({ vat_mode: 'included', items: base }).warnings).toEqual([]);
  });
});

describe('parse', () => {
  it('코드펜스 허용', () => expect(parseJsonLoose('```json\n{"items":[]}\n```')).toEqual({ items: [] }));
  it('스키마 위반', () => expect(() => assertRaw({ a: 1 })).toThrow());
});
