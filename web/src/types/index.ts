export type TemplateType = 'TEMPLATE_PURCHASE' | 'TEMPLATE_EVENT' | 'TEMPLATE_MEAL';

export interface Item {
  id: string;
  itemName: string;
  spec: string;
  unit: string;
  quantity: number;
  /** VAT 포함 단가 (K-에듀파인 `예상단가`) */
  unitPrice: number;
}

export interface QuoteExtraction {
  suggestedTemplate: TemplateType;
  vendorName?: string;
  businessNo?: string;
  quoteDate?: string;
  /** 견적서에 적힌 최종 합계금액(VAT 포함) */
  statedTotal?: number;
  /** 적용된 단가 기준과 그 근거 */
  vatMode?: 'included' | 'excluded' | 'exempt' | 'unknown';
  vatSource?: 'user' | 'total' | 'model';
  items: Omit<Item, 'id'>[];
  provider?: string;
  fallbackUsed?: boolean;
  warnings?: string[];
}
