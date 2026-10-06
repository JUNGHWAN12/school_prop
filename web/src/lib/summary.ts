import type { Item } from '../types';

/** 대표 품목 요약: "첫 품목명 외 N건" (품목 1개면 품목명만) */
export function representativeName(items: Pick<Item, 'itemName'>[]): string {
  const named = items.filter((i) => i.itemName.trim());
  if (named.length === 0) return '';
  const first = named[0].itemName.trim();
  return named.length === 1 ? first : `${first} 외 ${named.length - 1}건`;
}

export const lineAmount = (i: Pick<Item, 'quantity' | 'unitPrice'>) =>
  Math.round(i.quantity * i.unitPrice);

export const totalAmount = (items: Pick<Item, 'quantity' | 'unitPrice'>[]) =>
  items.reduce((sum, i) => sum + lineAmount(i), 0);
