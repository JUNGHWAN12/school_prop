import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { Env } from './env';
import { buildSystemPrompt, finalizeExtraction, inferVatModeFromTotal, parseVatChoice, SYSTEM_PROMPT, type RawExtraction } from './extraction';
import { resetBreaker } from './router';

describe('parseVatChoice / buildSystemPrompt', () => {
  it('허용값만 통과, 나머지는 auto', () => {
    expect(['included', 'excluded', 'exempt'].map(parseVatChoice)).toEqual(['included', 'excluded', 'exempt']);
    for (const v of [undefined, null, '', 'auto', 'unknown', 'EXCLUDED', 123, {}]) expect(parseVatChoice(v)).toBe('auto');
  });
  it('자동이면 기본 프롬프트 그대로, 지정하면 한 줄 힌트만 덧붙임', () => {
    expect(buildSystemPrompt('auto')).toBe(SYSTEM_PROMPT);
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
    const ex = buildSystemPrompt('excluded');
    expect(ex.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(ex).toContain('[사용자 지정]');
    expect(ex).toContain('부가세 별도(공급가 기준)');
    expect(buildSystemPrompt('included')).toContain('부가세 포함');
    expect(buildSystemPrompt('exempt')).toContain('면세');
    expect(ex.split('[사용자 지정]').length - 1).toBe(1);
  });
});

describe('inferVatModeFromTotal', () => {
  const items = [
    { item_name: 'A', quantity: 3, unit_price: 10000, line_amount: 30000 },
    { item_name: 'B', quantity: 2, unit_price: 20000, line_amount: 40000 },
  ];
  it('별도·포함 판별', () => {
    expect(inferVatModeFromTotal({ items }, 77000)).toBe('excluded');
    expect(inferVatModeFromTotal({ items }, 70000)).toBe('included');
    expect(inferVatModeFromTotal({ vat_mode: 'exempt', items }, 70000)).toBe('exempt');
  });
  it('둘 다 안 맞으면 판별 불가', () => {
    expect(inferVatModeFromTotal({ items }, 123456)).toBeUndefined();
  });
  it('반올림 오차 허용(0.2%)', () => {
    expect(inferVatModeFromTotal({ items }, 77050)).toBe('excluded');
  });
});

describe('finalizeExtraction 우선순위', () => {
  const raw = (vat: RawExtraction['vat_mode']): RawExtraction => ({
    vat_mode: vat,
    items: [{ item_name: 'A', quantity: 3, unit_price: 10000, line_amount: 30000 }],
  });
  it('사용자 선택 > 합계 판별 > 모델', () => {
    const text = '합계금액 : 삼만삼천 원정 ₩33,000';
    expect(finalizeExtraction(raw('included'), text, 'excluded')).toMatchObject({ vatMode: 'excluded', vatSource: 'user' });
    expect(finalizeExtraction(raw('included'), text)).toMatchObject({ vatMode: 'excluded', vatSource: 'total' });
    expect(finalizeExtraction(raw('excluded'), '')).toMatchObject({ vatMode: 'excluded', vatSource: 'model' });
  });
  it('모델이 불명이어도 합계로 판별되면 "부가세 포함 여부" 경고 없음', () => {
    const n = finalizeExtraction(raw('unknown'), '합계금액 : ₩33,000');
    expect(n.vatMode).toBe('excluded');
    expect(n.warnings.join('\n')).not.toContain('부가세 포함 여부');
  });
  it('불명이고 판별도 안 되면 기존대로 경고', () => {
    const n = finalizeExtraction(raw('unknown'), '');
    expect(n.warnings.join('\n')).toContain('부가세 포함 여부');
  });
});

describe('API: vat_mode 필드', () => {
  const ORIGIN = 'https://junghwan12.github.io';
  const env: Env = { UPSTAGE_API_KEY: 'u', GEMINI_API_KEY: 'g', ALLOWED_ORIGIN: ORIGIN };
  let solarBodies: string[];
  beforeEach(() => { solarBodies = []; resetBreaker(); });
  afterEach(() => vi.unstubAllGlobals());

  const call = async (vatField?: string) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('document-digitization')) return new Response(JSON.stringify({ content: { text: '견적서 마우스 3 10,000 30,000' } }));
      solarBodies.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ vat_mode: 'included', items: [{ item_name: '마우스', quantity: 3, unit_price: 10000, line_amount: 30000 }] }) } }] }));
    }));
    const fd = new FormData();
    fd.append('file', new File(['x'], 'q.pdf', { type: 'application/pdf' }));
    if (vatField !== undefined) fd.append('vat_mode', vatField);
    const r = await createApp(() => env).request('/api/extract', { method: 'POST', body: fd, headers: { origin: ORIGIN } });
    return (await r.json()) as { items: { unitPrice: number }[]; vatMode: string; vatSource: string };
  };

  it('excluded 선택: 모델에 힌트 전달, 단가에 10% 가산, 근거 user', async () => {
    const j = await call('excluded');
    expect(solarBodies[0]).toContain('[사용자 지정]');
    expect(j.items[0].unitPrice).toBe(11000);
    expect(j).toMatchObject({ vatMode: 'excluded', vatSource: 'user' });
  });
  it('필드가 없거나 잘못된 값이면 자동(힌트 없음)', async () => {
    for (const v of [undefined, 'auto', 'bogus']) {
      solarBodies = [];
      const j = await call(v);
      expect(solarBodies[0]).not.toContain('[사용자 지정]');
      expect(j).toMatchObject({ vatMode: 'included', vatSource: 'model' });
      expect(j.items[0].unitPrice).toBe(10000);
    }
  });
});
