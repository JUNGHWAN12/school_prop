import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { amountToKoreanWon, numberToKorean } from './koreanAmount';
import { buildWorkbook, excelFileName, validateWorkbook, workbookToBytes, HEADERS, SHEET_NAME } from './excel';
import { representativeName, totalAmount } from './summary';
import { defaultParams, renderEvent, renderMeal, renderPurchase } from './templates';
import type { Item } from '../types';

const item = (n: string, q: number, p: number): Item => ({ id: n, itemName: n, spec: '', unit: '권', quantity: q, unitPrice: p });

describe('koreanAmount', () => {
  it.each([
    [0, '영'], [10, '십'], [100, '백'], [1000, '천'], [10000, '일만'], [24000, '이만사천'],
    [85770, '팔만오천칠백칠십'], [100000000, '일억'], [123456789, '일억이천삼백사십오만육천칠백팔십구'],
    [100010000, '일억일만'], [15300, '일만오천삼백'],
  ])('%i → %s', (n, s) => expect(numberToKorean(n)).toBe(s));
  it('금 …원 형식', () => expect(amountToKoreanWon(85770)).toBe('금팔만오천칠백칠십원'));
  it('음수 거부', () => expect(() => numberToKorean(-1)).toThrow());
});

describe('summary', () => {
  it('대표 품목', () => {
    expect(representativeName([item('A', 1, 1)])).toBe('A');
    expect(representativeName([item('A', 1, 1), item('B', 1, 1), item('C', 1, 1)])).toBe('A 외 2건');
    expect(representativeName([])).toBe('');
  });
  it('합계', () => expect(totalAmount([item('A', 2, 15300), item('B', 1, 55170)])).toBe(85770));
});

describe('templates', () => {
  const items = [item('공간이 만든 공간', 1, 15300), item('B', 1, 70470)];
  it('약식', () => {
    const t = renderPurchase({ ...defaultParams(), items, purpose: '독서교육', category: '도서' });
    expect(t).toContain('독서교육을 위한 도서를 다음과 같이 구입하겠습니다.');
    expect(t).toContain('1. 품목: 공간이 만든 공간 외 1건');
    expect(t).toContain('금 85,770원 (금 팔만오천칠백칠십원).  끝.');
  });
  it('행사', () => {
    const t = renderEvent({ ...defaultParams(), eventName: '비버챌린지 2026', perPerson: 3000, headcount: 8, target: '학생' });
    expect(t).toContain('가. 총 소요액: 금24,000원 (금이만사천원)');
    expect(t).toContain('나. 산출 내역: 3,000원 × 8명 = 24,000원');
    expect(t).toContain('붙임  비버챌린지 2026 참가학생 명단 1부.  끝.');
  });
  it('식비', () => {
    const t = renderMeal({ ...defaultParams(), eventName: '대회', perPerson: 8000, headcount: 5 });
    expect(t).toContain('라. 소요예산액: 금40,000원 (금사만원)');
  });
});

describe('excel', () => {
  const items = [item('공간이 만든 공간', 1, 15300)];
  it('기본 형식은 xlsx이며 왕복 후에도 검증 통과', () => {
    const wb = buildWorkbook(items);
    const bytes = workbookToBytes(wb);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK'); // xlsx = zip
    const back = XLSX.read(bytes, { type: 'array' });
    expect(validateWorkbook(back)).toEqual([]);
    expect(back.Sheets[SHEET_NAME]['E2'].v).toBe(15300);
    expect(back.Sheets[SHEET_NAME]['D2'].t).toBe('n');
  });
  it('검증 통과 및 xls 왕복', () => {
    const wb = buildWorkbook(items);
    expect(validateWorkbook(wb)).toEqual([]);
    const back = XLSX.read(workbookToBytes(wb, 'xls'), { type: 'array' });
    expect(validateWorkbook(back)).toEqual([]);
    const ws = back.Sheets[SHEET_NAME];
    expect(ws['D2'].t).toBe('n');
    expect(ws['E2'].v).toBe(15300);
  });
  it('원본 서식과 헤더·시트명 일치', () => {
    const buf = readFileSync(new URL('../../../docs/samples/품목내역(통합)_원본서식.xls', import.meta.url));
    const orig = XLSX.read(buf);
    expect(orig.SheetNames).toEqual([SHEET_NAME]);
    const row = XLSX.utils.sheet_to_json<string[]>(orig.Sheets[SHEET_NAME], { header: 1 })[0];
    expect(row).toEqual([...HEADERS]);
  });
  it('숫자가 아니면 검증 실패', () => {
    const wb = buildWorkbook([{ ...items[0], quantity: NaN }]);
    expect(validateWorkbook(wb).length).toBeGreaterThan(0);
  });
  it('파일명', () => {
    expect(excelFileName([item('a/b:c', 1, 1)], new Date(2026, 9, 6))).toBe('품목내역(통합)_a_b_c_20261006.xlsx');
    expect(excelFileName([item('a', 1, 1)], new Date(2026, 9, 6), 'xls')).toBe('품목내역(통합)_a_20261006.xls');
  });
});
