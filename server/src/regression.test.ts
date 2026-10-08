import { describe, expect, it } from 'vitest';
import { CASES } from '../test/fixtures';
import { finalizeExtraction, findStatedTotal } from './extraction';
import { maskPersonalInfo } from './masking/mask';

describe.each(CASES)('회귀: $name — $description', (c) => {
  const { text: masked } = maskPersonalInfo(c.ocrText);

  it('개인정보는 가려지고 사업자등록번호·금액은 보존된다', () => {
    for (const s of c.maskedMustNotContain) expect(masked).not.toContain(s);
    for (const s of c.maskedMustContain) expect(masked).toContain(s);
  });

  it('OCR 원문에서 합계금액을 찾는다', () => {
    expect(findStatedTotal(masked)).toBe(c.expect.statedTotal);
  });

  it('모델 응답을 정규화한 결과가 기대와 같다', () => {
    const n = finalizeExtraction(structuredClone(c.modelRaw), masked, c.userVat ?? 'auto');
    expect(n.items).toHaveLength(c.expect.items.length);
    c.expect.items.forEach((e, i) => {
      expect(n.items[i].itemName).toContain(e.name);
      expect(n.items[i].quantity).toBe(e.quantity);
      expect(n.items[i].unitPrice).toBe(e.unitPrice);
    });
    expect(n.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0)).toBe(c.expect.total);
    expect(n.statedTotal).toBe(c.expect.statedTotal);
    if (c.expect.vat) expect({ mode: n.vatMode, source: n.vatSource }).toEqual(c.expect.vat);
    for (const w of c.expect.warnings?.include ?? []) expect(n.warnings.join('\n')).toContain(w);
    for (const w of c.expect.warnings?.exclude ?? []) expect(n.warnings.join('\n')).not.toContain(w);
  });
});

describe('마스킹 공통 규칙', () => {
  it('마스킹 후 전화번호 형식이 남아 있지 않다(사업자등록번호 제외)', () => {
    for (const c of CASES) {
      const { text } = maskPersonalInfo(c.ocrText);
      expect(text, c.name).not.toMatch(/(?<![\d-])\(?0\d{1,2}\)?[-. ]?\d{3,4}[-. ]?\d{4}(?![\d-])/);
    }
  });
  it('전화번호 표기 변형', () => {
    const cases: [string, string][] = [
      ['010 1234 5678', '010-****-5678'],
      ['010.1234.5678', '010-****-5678'],
      ['(02) 123-4567', '02-***-4567'],
      ['02)123-4567', '02-***-4567'],
      ['TEL:064-748-2257', 'TEL:064-***-2257'],
    ];
    for (const [input, out] of cases) expect(maskPersonalInfo(input).text).toBe(out);
  });
});
