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
  /** 견적서에 적힌 최종 합계금액(부가세 포함, 청구 총액) */
  total_amount?: number;
  items: RawItem[];
}

export interface NormalizedItem { itemName: string; spec: string; unit: string; quantity: number; unitPrice: number }
export interface Normalized {
  statedTotal?: number;
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
    total_amount: { type: 'number' },
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
- items: 견적 표의 모든 순번 행을 빠짐없이 포함하세요. 작업비·설치비·공임·배송비·운반비·인건비 같은 용역/비용 행도 수량과 금액이 있으면 품목입니다(단위가 비어 있어도 포함).
  제외하는 것은 합계/소계/공급가액 합계/세액 합계 같은 집계 행뿐입니다. 문서 순서 유지.
  - item_name 품명, spec 규격(없으면 ""), unit 단위(없으면 도서는 "권", 그 외 "개"), quantity 수량(숫자),
    unit_price 견적서에 적힌 단가(숫자, 콤마 제거), line_amount 해당 행의 실제 청구 금액(공급가/금액 열), line_tax 해당 품목 세액(없으면 0).
    정가(할인 전)와 공급가가 함께 있으면 unit_price에는 정가를, line_amount에는 공급가를 그대로 쓰세요.
    수량이나 금액이 비어 있는 행(절판·품절 표시 등)은 품목에서 제외하세요.
- vat_mode: 단가가 부가세 포함이면 "included", 별도(공급가액 기준)이면 "excluded", 면세(도서 등, 부가세 언급이 없는 도서 견적 포함)이면 "exempt", 불명확하면 "unknown".
- suggested_template: 도서·소모품 구매=TEMPLATE_PURCHASE, 대회/연수/행사 참가비=TEMPLATE_EVENT, 식비·급량비·다과=TEMPLATE_MEAL.
- total_amount: 견적서에 적힌 최종 합계금액(부가세 포함 청구 총액, 숫자). 없으면 생략.
- vendor_name, business_no(사업자등록번호), quote_date(견적일자)는 보이는 대로. 없으면 생략.
숫자는 읽은 값 그대로 쓰고 추측으로 만들지 마세요.`;

const TEMPLATES = new Set(['TEMPLATE_PURCHASE', 'TEMPLATE_EVENT', 'TEMPLATE_MEAL']);

export function normalizeExtraction(raw: RawExtraction): Normalized {
  const warnings: string[] = [];
  const mode: VatMode = raw.vat_mode ?? 'unknown';

  const items: NormalizedItem[] = [];
  /** 견적서에 적힌 행별 청구 금액(공급가 열 등). 정가≠공급가인 견적서 처리에 사용 */
  const billed: (number | undefined)[] = [];
  const mismatches: string[] = [];
  let converted = 0;
  for (const [idx, r] of (raw.items ?? []).entries()) {
    const name = String(r.item_name ?? '').trim();
    const qty = Number(r.quantity);
    const price = Number(r.unit_price);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      warnings.push(`${idx + 1}번째 항목${name ? `('${name.slice(0, 30)}')` : ''}은 수량 또는 금액이 없어 제외했습니다. (절판·품절 등이면 정상입니다)`);
      continue;
    }
    let unitPrice = price;
    const tax = Number(r.line_tax) || 0;
    const amount = Number(r.line_amount);
    if (mode === 'excluded') {
      unitPrice = tax > 0 && Number.isFinite(amount) && amount > 0 ? Math.round((amount + tax) / qty) : Math.round(price * 1.1);
      converted += 1;
    }
    if (mode !== 'excluded' && Number.isFinite(amount) && amount > 0 && Math.abs(qty * price - amount) > 1) {
      mismatches.push(`'${name}': 수량×단가(${Math.round(qty * price).toLocaleString('ko-KR')})가 견적서 금액(${amount.toLocaleString('ko-KR')})과 다릅니다. 확인해 주세요.`);
    }
    billed.push(Number.isFinite(amount) && amount > 0 ? amount : undefined);
    items.push({
      itemName: name,
      spec: String(r.spec ?? '').trim(),
      unit: String(r.unit ?? '').trim() || '개',
      quantity: qty,
      unitPrice,
    });
  }
  const stated = Number(raw.total_amount);
  const hasStated = Number.isFinite(stated) && stated > 0;

  // 단가 열(정가)과 금액 열(공급가=실제 청구액)이 다른 견적서(도서 할인 등):
  // 금액 열이 실제 청구액이므로 기본은 금액 기준. 합계금액을 알면 합계에 더 가까운 쪽을 채택한다.
  let useBilled = false;
  if (mode !== 'excluded' && items.length > 0 && mismatches.length > 0) {
    const byPrice = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    const byBilled = items.reduce((a, i, k) => a + (billed[k] ?? i.quantity * i.unitPrice), 0);
    const billedWins = hasStated ? Math.abs(byBilled - stated) < Math.abs(byPrice - stated) : true;
    if (billedWins) {
      let n = 0;
      items.forEach((it, k) => {
        const b = billed[k];
        if (b !== undefined && Math.abs(it.quantity * it.unitPrice - b) > 1) {
          it.unitPrice = Math.round(b / it.quantity);
          n += 1;
        }
      });
      useBilled = n > 0;
      if (useBilled) {
        warnings.push(
          hasStated
            ? `견적서의 단가(정가)와 공급가(실제 청구액)가 달라, ${n}개 품목의 단가를 공급가 기준으로 맞췄습니다. 견적서 합계금액에 맞춘 결과입니다.`
            : `견적서의 단가(정가)와 공급가(실제 청구액)가 달라, ${n}개 품목의 단가를 공급가 기준으로 맞췄습니다. 견적서 합계금액을 확인하지 못했으니 합계를 원본과 비교해 주세요.`,
        );
      }
    }
  }
  if (!useBilled) warnings.push(...mismatches);

  if (items.length > 0 && hasStated) {
    const sum = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    const tolerance = Math.max(10, Math.round(stated * 0.002)); // 단가별 반올림 오차 허용
    if (Math.abs(sum - stated) > tolerance) {
      warnings.unshift(`품목 합계(${Math.round(sum).toLocaleString('ko-KR')}원)가 견적서 합계금액(${stated.toLocaleString('ko-KR')}원)과 다릅니다. 누락·중복된 품목이 없는지 원본과 비교해 주세요.`);
    }
  }
  // 부가세 여부를 모르더라도 품목 합계가 견적서 합계금액과 일치하면 금액이 검증된 것이므로 경고하지 않는다
  if (mode === 'unknown') {
    const sum = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    const verified = hasStated && Math.abs(sum - stated) <= Math.max(10, Math.round(stated * 0.002));
    if (!verified) warnings.unshift('부가세 포함 여부를 판단하지 못했습니다. 단가를 확인해 주세요.');
  }
  if (converted > 0) warnings.push(`견적서 단가가 부가세 별도라서 ${converted}개 품목의 단가를 VAT 포함(+10%)으로 환산했습니다. 합계를 견적서와 비교해 확인해 주세요.`);
  if (items.length === 0) warnings.push('품목을 찾지 못했습니다. 직접 입력해 주세요.');

  return {
    suggestedTemplate: TEMPLATES.has(raw.suggested_template ?? '') ? (raw.suggested_template as TemplateType) : 'TEMPLATE_PURCHASE',
    vendorName: raw.vendor_name?.trim() || undefined,
    businessNo: raw.business_no?.trim() || undefined,
    quoteDate: raw.quote_date?.trim() || undefined,
    items,
    statedTotal: hasStated ? stated : undefined,
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

/**
 * OCR 텍스트에서 견적서의 최종 합계금액을 직접 찾는다(모델이 total_amount를 빠뜨렸을 때의 대비책).
 * 예: "합계금액 : 일십사만이천사백 원정 ₩142,400" → 142400, "합계 (VAT 포함) 1,292,940원" → 1292940
 */
export function findStatedTotal(ocrText: string): number | undefined {
  const text = ocrText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const patterns = [
    /합\s*계\s*금\s*액[^\d]{0,40}?([\d][\d,]{2,})/,
    /총\s*합\s*계[^\d]{0,20}?([\d][\d,]{2,})/,
    /합\s*계\s*\(\s*VAT\s*포함\s*\)[^\d]{0,20}?([\d][\d,]{2,})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}
