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
  items: Omit<Item, 'id'>[];
  provider?: string;
  fallbackUsed?: boolean;
  warnings?: string[];
}
