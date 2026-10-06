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

describe('정가와 공급가가 다른 견적서(도서 할인)', () => {
  const books = [
    { item_name: '운영체제', quantity: 1, unit_price: 35000, line_amount: 35000 },
    { item_name: '왜 건물은 지진에 무너지지 않을까?-절판', quantity: 0, unit_price: 0 },
    { item_name: '빅데이터 시대', quantity: 1, unit_price: 16000, line_amount: 14400 },
    { item_name: '게임 프로그래밍 패턴', quantity: 1, unit_price: 35000, line_amount: 31500 },
    { item_name: '피지컬AI 2026', quantity: 1, unit_price: 25000, line_amount: 22500 },
    { item_name: '운영체제', quantity: 1, unit_price: 39000, line_amount: 39000 },
  ];
  it('합계금액과 맞는 공급가 기준으로 단가를 정한다', () => {
    const n = normalizeExtraction({ vat_mode: 'exempt', total_amount: 142400, items: books });
    expect(n.items.map((i) => i.unitPrice)).toEqual([35000, 14400, 31500, 22500, 39000]);
    expect(n.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0)).toBe(142400);
    expect(n.warnings.some((w) => w.includes('공급가 기준'))).toBe(true);
    expect(n.warnings.some((w) => w.includes('다릅니다'))).toBe(false);
    expect(n.warnings.some((w) => w.includes('절판'))).toBe(true);
  });
  it('수량이 2 이상이면 공급가/수량으로 단가 계산', () => {
    const n = normalizeExtraction({ vat_mode: 'exempt', total_amount: 28800, items: [{ item_name: 'A', quantity: 2, unit_price: 16000, line_amount: 28800 }] });
    expect(n.items[0].unitPrice).toBe(14400);
  });
  it('합계금액이 없으면 임의로 바꾸지 않고 불일치만 경고', () => {
    const n = normalizeExtraction({ vat_mode: 'exempt', items: [{ item_name: 'A', quantity: 1, unit_price: 16000, line_amount: 14400 }] });
    expect(n.items[0].unitPrice).toBe(16000);
    expect(n.warnings.some((w) => w.includes('다릅니다'))).toBe(true);
  });
  it('정가 합계가 합계금액과 맞으면 정가 유지', () => {
    const n = normalizeExtraction({ vat_mode: 'included', total_amount: 16000, items: [{ item_name: 'A', quantity: 1, unit_price: 16000, line_amount: 14400 }] });
    expect(n.items[0].unitPrice).toBe(16000);
  });
});

describe('parse', () => {
  it('코드펜스 허용', () => expect(parseJsonLoose('```json\n{"items":[]}\n```')).toEqual({ items: [] }));
  it('스키마 위반', () => expect(() => assertRaw({ a: 1 })).toThrow());
});
