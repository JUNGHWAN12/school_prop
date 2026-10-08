import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { describeVat } from '../lib/vat';
import { useStore } from '../store/useStore';

/** 분석 결과 안내·경고·오류를 모아 보여주는 패널 (넓은 화면에서는 왼쪽 고정 영역) */
export function NoticePanel() {
  const { status, error, errorDetail, warnings, meta } = useStore();

  return (
    <aside aria-label="분석 안내" className="space-y-3 text-sm xl:sticky xl:top-4 xl:self-start">
      <p className="flex items-start gap-1.5 rounded-lg bg-white p-3 text-xs text-slate-600 shadow-sm">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        전화번호·주민등록번호·계좌번호·이메일·대표자(담당자) 이름·주소는 AI 전송 전에 자동으로 마스킹됩니다.
      </p>

      {status === 'idle' && (
        <p className="flex items-start gap-1.5 rounded-lg bg-white p-3 text-slate-500 shadow-sm">
          <Info size={16} className="mt-0.5 shrink-0" />
          견적서를 올리면 분석 결과와 확인이 필요한 항목이 여기에 표시됩니다.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          <p className="font-medium">분석 실패</p>
          <p className="mt-1">{error}</p>
          {errorDetail && <p className="mt-1 break-all text-xs text-red-500">오류 상세: {errorDetail}</p>}
        </div>
      )}

      {status === 'done' && meta && (
        <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 p-3 text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            분석 완료{meta.vendorName && <> · 공급자 {meta.vendorName}</>}
            <br />
            <span className="text-xs text-emerald-700">
              처리: {meta.provider === 'gemini' ? 'Gemini' : 'Upstage Solar'}{meta.fallbackUsed && ' (폴백)'}
            </span>
            {describeVat(meta.vatMode, meta.vatSource) && (
              <>
                <br />
                <span className="text-xs text-emerald-700">단가 기준: {describeVat(meta.vatMode, meta.vatSource)}</span>
              </>
            )}
          </span>
        </p>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle size={16} /> 확인 필요 {warnings.length}건</p>
          <ul className="list-disc space-y-1.5 pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </aside>
  );
}
