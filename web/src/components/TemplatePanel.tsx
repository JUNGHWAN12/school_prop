import { useState } from 'react';
import { ClipboardCopy, RefreshCw } from 'lucide-react';
import { renderTemplate, TEMPLATE_LABELS, type TemplateParams } from '../lib/templates';
import { useStore } from '../store/useStore';
import type { TemplateType } from '../types';

type F = { key: keyof TemplateParams; label: string; type?: 'number' };

const FIELDS: Record<TemplateType, F[]> = {
  TEMPLATE_PURCHASE: [
    { key: 'purpose', label: '사업/목적명' },
    { key: 'category', label: '품목 구분 (도서, 소모품 등)' },
  ],
  TEMPLATE_EVENT: [
    { key: 'relatedDept', label: '관련 공문 부서/기관' },
    { key: 'relatedDocNo', label: '문서번호' },
    { key: 'relatedDate', label: '시행일자' },
    { key: 'relatedTitle', label: '관련문서 제목' },
    { key: 'eventName', label: '행사명' },
    { key: 'organizer', label: '주최/주관' },
    { key: 'schedule1Name', label: '세부일정1 이름' },
    { key: 'schedule1Date', label: '세부일정1 일시' },
    { key: 'schedule2Name', label: '세부일정2 이름(선택)' },
    { key: 'schedule2Date', label: '세부일정2 일시(선택)' },
    { key: 'target', label: '참가 대상' },
    { key: 'headcount', label: '참가 인원(명)', type: 'number' },
    { key: 'perPerson', label: '1인당 금액(원)', type: 'number' },
  ],
  TEMPLATE_MEAL: [
    { key: 'relatedDocNo', label: '관련 문서번호(선택)' },
    { key: 'relatedTitle', label: '관련 문서 제목(선택)' },
    { key: 'eventName', label: '행사/사업명' },
    { key: 'eventDate', label: '행사 일시' },
    { key: 'mealKind', label: '식사 구분(점심/저녁/간식)' },
    { key: 'mealDate', label: '식사 제공 일시' },
    { key: 'target', label: '대상' },
    { key: 'headcount', label: '인원(명)', type: 'number' },
    { key: 'perPerson', label: '1인당 금액(원) · 품목이 없을 때 사용', type: 'number' },
  ],
};

export function TemplatePanel() {
  const { template, setTemplate, params, setParams, items, bodyOverride, setBody } = useStore();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const rendered = renderTemplate(template, { ...params, items });
  const text = bodyOverride ?? rendered;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('fail'); // 클립보드 권한 없음 → 텍스트를 직접 선택해 복사
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section className="space-y-3">
      <div role="radiogroup" aria-label="품의 템플릿" className="flex flex-wrap gap-2">
        {(Object.keys(TEMPLATE_LABELS) as TemplateType[]).map((t) => (
          <label key={t} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${template === t ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white'}`}>
            <input type="radio" name="tpl" className="sr-only" checked={template === t} onChange={() => setTemplate(t)} />
            {TEMPLATE_LABELS[t]}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FIELDS[template].map((f) => (
          <label key={f.key} className="text-sm">
            <span className="text-slate-600">{f.label}</span>
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              min={f.type === 'number' ? 0 : undefined}
              value={(params[f.key] as string | number) || ''}
              onChange={(e) => setParams({ [f.key]: f.type === 'number' ? Number(e.target.value) || 0 : e.target.value } as Partial<TemplateParams>)}
              className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>
        ))}
      </div>

      <label className="block text-sm">
        <span className="text-slate-600">품의문 본문 (직접 수정 가능)</span>
        <textarea
          value={text}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="mt-0.5 w-full rounded border border-slate-300 p-2 font-mono text-sm leading-relaxed"
        />
      </label>
      <div className="flex gap-2">
        <button onClick={copy} className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white">
          <ClipboardCopy size={16} /> 품의문 클립보드 복사
        </button>
        {bodyOverride !== null && (
          <button onClick={() => setBody(null)} className="flex items-center gap-1 rounded border px-3 py-2 text-sm">
            <RefreshCw size={16} /> 입력값으로 다시 생성
          </button>
        )}
        <span role="status" className="self-center text-sm text-slate-600">
          {copied === 'ok' && '복사되었습니다.'}
          {copied === 'fail' && '자동 복사에 실패했습니다. 본문을 직접 선택해 복사하세요.'}
        </span>
      </div>
    </section>
  );
}
