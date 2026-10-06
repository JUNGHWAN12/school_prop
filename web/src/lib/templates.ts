import type { Item, TemplateType } from '../types';
import { amountToKoreanWon, formatWon } from './koreanAmount';
import { representativeName, totalAmount } from './summary';

export interface TemplateParams {
  items: Item[];
  /** 약식: 사업/목적명, 품목 구분 */
  purpose: string;
  category: string;
  /** 행사형 */
  relatedDept: string;
  relatedDocNo: string;
  relatedDate: string;
  relatedTitle: string;
  eventName: string;
  organizer: string;
  schedule1Name: string;
  schedule1Date: string;
  schedule2Name: string;
  schedule2Date: string;
  target: string;
  headcount: number;
  perPerson: number;
  /** 식비형 */
  eventDate: string;
  mealDate: string;
  mealKind: string; // 점심 | 저녁 | 간식 등
}

export const defaultParams = (): TemplateParams => ({
  items: [],
  purpose: '',
  category: '도서',
  relatedDept: '',
  relatedDocNo: '',
  relatedDate: '',
  relatedTitle: '',
  eventName: '',
  organizer: '',
  schedule1Name: '',
  schedule1Date: '',
  schedule2Name: '',
  schedule2Date: '',
  target: '',
  headcount: 0,
  perPerson: 0,
  eventDate: '',
  mealDate: '',
  mealKind: '점심',
});

const blank = (v: string, ph: string) => (v.trim() ? v.trim() : `{${ph}}`);

export function renderPurchase(p: TemplateParams): string {
  const total = totalAmount(p.items);
  return [
    `${blank(p.purpose, '사업/목적명')}을 위한 ${blank(p.category, '품목 구분')}를 다음과 같이 구입하겠습니다.`,
    `  1. 품목: ${representativeName(p.items) || '{대표품목명}'}`,
    `  2. 금액: 금 ${formatWon(total)}원 (${amountToKoreanWon(total).replace('금', '금 ')}).  끝.`,
  ].join('\n');
}

export function renderEvent(p: TemplateParams): string {
  const total = p.items.length ? totalAmount(p.items) : p.perPerson * p.headcount;
  const lines = [
    `1. 관련: ${blank(p.relatedDept, '부서/기관명')}-${blank(p.relatedDocNo, '문서번호')}(${blank(p.relatedDate, '시행일자')}) 「${blank(p.relatedTitle, '관련문서제목')}」`,
    '',
    '2. 행사 개요',
    `  가. 행사명: ${blank(p.eventName, '행사명')}`,
    `  나. 주최/주관: ${blank(p.organizer, '주최기관')}`,
    '  다. 참가 기간:',
    `    1) [${blank(p.schedule1Name, '세부일정1')}] ${blank(p.schedule1Date, '일시/기간')}`,
  ];
  if (p.schedule2Name.trim() || p.schedule2Date.trim()) {
    lines.push(`    2) [${blank(p.schedule2Name, '세부일정2')}] ${blank(p.schedule2Date, '일시/기간')}`);
  }
  lines.push(
    `  라. 참가 인원: ${blank(p.target, '대상')} 총 ${p.headcount || '{인원}'}명`,
    '',
    '3. 소요 예산 내역',
    `  가. 총 소요액: 금${formatWon(total)}원 (${amountToKoreanWon(total)})`,
    `  나. 산출 내역: ${formatWon(p.perPerson)}원 × ${p.headcount}명 = ${formatWon(p.perPerson * p.headcount)}원`,
    '',
    `붙임  ${blank(p.eventName, '행사명')} 참가학생 명단 1부.  끝.`,
  );
  return lines.join('\n');
}

export function renderMeal(p: TemplateParams): string {
  const total = p.items.length ? totalAmount(p.items) : p.perPerson * p.headcount;
  const related = p.relatedDocNo.trim() || p.relatedTitle.trim()
    ? `${p.relatedDocNo.trim()} ${p.relatedTitle.trim()}`.trim()
    : '';
  return [
    `1. 관련: ${related}`.trimEnd(),
    '',
    `2. ${blank(p.eventName, '행사/사업명')}에 따른 학생(교직원) ${p.mealKind || '점심'} 식비를 지출하겠습니다.`,
    `  가. ${blank(p.eventName, '행사명')} 일시: ${blank(p.eventDate, '행사일시')}`,
    `  나. 식비지출일정: ${blank(p.mealDate, '식사제공일시')}`,
    `  다. 대상: ${blank(p.target, '대상 설명')} ${p.headcount || '{인원}'}명`,
    `  라. 소요예산액: 금${formatWon(total)}원 (${amountToKoreanWon(total)})`,
    '',
    `붙임  ${blank(p.eventName, '행사명')} 참가학생 명단.  끝.`,
  ].join('\n');
}

export function renderTemplate(type: TemplateType, p: TemplateParams): string {
  switch (type) {
    case 'TEMPLATE_PURCHASE':
      return renderPurchase(p);
    case 'TEMPLATE_EVENT':
      return renderEvent(p);
    case 'TEMPLATE_MEAL':
      return renderMeal(p);
  }
}

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  TEMPLATE_PURCHASE: '약식 구매(도서·소모품)',
  TEMPLATE_EVENT: '행사·대회 참가',
  TEMPLATE_MEAL: '식비·급량비',
};
