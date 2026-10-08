/** 견적서 단가 기준(VAT). 업로드 전에 사용자가 고르고, 'auto'면 서버가 합계금액 대조 → AI 판단 순으로 결정한다. */
export type VatChoice = 'auto' | 'included' | 'excluded' | 'exempt';
export type VatSource = 'user' | 'total' | 'model';

export const VAT_OPTIONS: { value: VatChoice; label: string; help: string }[] = [
  { value: 'auto', label: '자동 판별', help: '견적서 합계금액과 비교해 자동으로 판단합니다' },
  { value: 'included', label: 'VAT 포함', help: '단가에 부가세가 이미 포함된 견적서' },
  { value: 'excluded', label: 'VAT 별도', help: "단가가 공급가 기준(부가세 별도). 단가에 10%를 더합니다" },
  { value: 'exempt', label: '면세', help: '부가세가 없는 견적서(도서 등)' },
];

const VAT_KEY = 'edu-approval-vat';
export const parseVatChoice = (v: unknown): VatChoice =>
  v === 'included' || v === 'excluded' || v === 'exempt' ? v : 'auto';

export function loadVatChoice(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): VatChoice {
  try {
    return parseVatChoice(storage?.getItem(VAT_KEY));
  } catch {
    return 'auto'; // 저장소 사용 불가(시크릿 모드 등)
  }
}

export function saveVatChoice(v: VatChoice, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(VAT_KEY, v);
  } catch {
    /* 저장 실패는 무시 */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const MODE_LABEL: Record<string, string> = { included: 'VAT 포함', excluded: 'VAT 별도', exempt: '면세', unknown: '불명' };
const SOURCE_LABEL: Record<VatSource, string> = { user: '직접 선택', total: '합계금액 기준 자동 판별', model: 'AI 판단' };

/** 안내 패널용: "VAT 별도 (직접 선택)" */
export function describeVat(mode?: string, source?: VatSource): string | undefined {
  if (!mode) return undefined;
  return `${MODE_LABEL[mode] ?? mode}${source ? ` (${SOURCE_LABEL[source]})` : ''}`;
}
