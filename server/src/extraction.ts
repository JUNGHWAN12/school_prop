/** AI가 반환하는 원시 JSON → 화면용 QuoteExtraction 정규화 (VAT 포함 단가 환산, 검증 경고) */
export type VatMode = 'included' | 'excluded' | 'exempt' | 'unknown';
export type TemplateType = 'TEMPLATE_PURCHASE' | 'TEMPLATE_EVENT' | 'TEMPLATE_MEAL';

export interface RawItem {
  item_name: string;
  spec?: string;
  unit?: string;
  quantity: number;
  /** 견적서에 적힌 단가 */
  unit_price: number;
  /** 견적서에 적힌 해당 품목 금액(공급가액 또는 합계) */
  line_amount?: number;
  /** 품목별 세액(없으면 0) */
  line_tax?: number;
}
export interface RawExtraction {
  suggested_template?: string;
  vendor_name?: string;
  business_no?: string;
  quote_date?: string;
  vat_mode?: VatMode;
  items: RawItem[];
}

export interface NormalizedItem { itemName: string; spec: string; unit: string; quantity: number; unitPrice: number }
export interface Normalized {
  suggestedTemplate: TemplateType;
  vendorName?: string;
  businessNo?: string;
  quoteDate?: string;
  items: NormalizedItem[];
  warnings: string[];
}

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    suggested_template: { type: 'string', enum: ['TEMPLATE_PURCHASE', 'TEMPLATE_EVENT', 'TEMPLATE_MEAL'] },
    vendor_name: { type: 'string' },
    business_no: { type: 'string' },
    quote_date: { type: 'string' },
    vat_mode: { type: 'string', enum: ['included', 'excluded', 'exempt', 'unknown'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item_name: { type: 'string' },
          spec: { type: 'string' },
          unit: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          line_amount: { type: 'number' },
          line_tax: { type: 'number' },
        },
        required: ['item_name', 'quantity', 'unit_price'],
      },
    },
  },
  required: ['items'],
} as const;

export const SYSTEM_PROMPT = `당신은 한국 학교 행정용 견적서 분석기입니다. 입력은 견적서 OCR 텍스트(개인정보는 이미 마스킹됨)입니다.
견적서 양식은 업체마다 다릅니다. 다음 JSON만 출력하세요(설명·코드블록 금지).
- items: 실제 구매 품목만(합계/공급가액 합계/세액 합계/배송비·할인 요약 행은 제외). 문서 순서 유지.
  - item_name 품명, spec 규격(없으면 ""), unit 단위(없으면 도서는 "권", 그 외 "개"), quantity 수량(숫자),
    unit_price 견적서에 적힌 단가(숫자, 콤마 제거), line_amount 해당 품목 금액, line_tax 해당 품목 세액(없으면 0).
- vat_mode: 단가가 부가세 포함이면 "included", 별도(공급가액 기준)이면 "excluded", 면세(도서 등)이면 "exempt", 불명확하면 "unknown".
- suggested_template: 도서·소모품 구매=TEMPLATE_PURCHASE, 대회/연수/행사 참가비=TEMPLATE_EVENT, 식비·급량비·다과=TEMPLATE_MEAL.
- vendor_name, business_no(사업자등록번호), quote_date(견적일자)는 보이는 대로. 없으면 생략.
숫자는 읽은 값 그대로 쓰고 추측으로 만들지 마세요.`;

const TEMPLATES = new Set(['TEMPLATE_PURCHASE', 'TEMPLATE_EVENT', 'TEMPLATE_MEAL']);

export function normalizeExtraction(raw: RawExtraction): Normalized {
  const warnings: string[] = [];
  const mode: VatMode = raw.vat_mode ?? 'unknown';
  if (mode === 'unknown') warnings.push('부가세 포함 여부를 판단하지 못했습니다. 단가를 확인해 주세요.');

  const items: NormalizedItem[] = [];
  for (const [idx, r] of (raw.items ?? []).entries()) {
    const name = String(r.item_name ?? '').trim();
    const qty = Number(r.quantity);
    const price = Number(r.unit_price);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      warnings.push(`${idx + 1}번째 항목을 해석하지 못해 제외했습니다.`);
      continue;
    }
    let unitPrice = price;
    const tax = Number(r.line_tax) || 0;
    const amount = Number(r.line_amount);
    if (mode === 'excluded') {
      unitPrice = tax > 0 && Number.isFinite(amount) && amount > 0 ? Math.round((amount + tax) / qty) : Math.round(price * 1.1);
      warnings.push(`'${name}': 부가세 별도 단가를 VAT 포함(${unitPrice.toLocaleString('ko-KR')}원)으로 환산했습니다.`);
    }
    if (mode !== 'excluded' && Number.isFinite(amount) && amount > 0 && Math.abs(qty * price - amount) > 1) {
      warnings.push(`'${name}': 수량×단가(${Math.round(qty * price).toLocaleString('ko-KR')})가 견적서 금액(${amount.toLocaleString('ko-KR')})과 다릅니다. 확인해 주세요.`);
    }
    items.push({
      itemName: name,
      spec: String(r.spec ?? '').trim(),
      unit: String(r.unit ?? '').trim() || '개',
      quantity: qty,
      unitPrice,
    });
  }
  if (items.length === 0) warnings.push('품목을 찾지 못했습니다. 직접 입력해 주세요.');

  return {
    suggestedTemplate: TEMPLATES.has(raw.suggested_template ?? '') ? (raw.suggested_template as TemplateType) : 'TEMPLATE_PURCHASE',
    vendorName: raw.vendor_name?.trim() || undefined,
    businessNo: raw.business_no?.trim() || undefined,
    quoteDate: raw.quote_date?.trim() || undefined,
    items,
    warnings,
  };
}

/** 모델 응답 텍스트에서 JSON 객체 추출 (코드펜스/잡음 허용) */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('JSON을 파싱할 수 없습니다');
  }
}

export function assertRaw(x: unknown): RawExtraction {
  if (!x || typeof x !== 'object' || !Array.isArray((x as RawExtraction).items)) {
    throw new Error('응답 스키마가 올바르지 않습니다');
  }
  return x as RawExtraction;
}
