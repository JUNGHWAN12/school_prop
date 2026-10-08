import { useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { VAT_OPTIONS } from '../lib/vat';
import { useStore } from '../store/useStore';

const MAX = 10 * 1024 * 1024;
const OK = ['application/pdf', 'image/jpeg', 'image/png'];

export function UploadPanel() {
  const { analyze, status, file, previewUrl, vatChoice, setVatChoice } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const pick = (f?: File) => {
    if (!f) return;
    if (!OK.includes(f.type)) return setLocalErr('PDF, JPG, PNG 파일만 지원합니다.');
    if (f.size > MAX) return setLocalErr('파일은 10MB 이하여야 합니다.');
    setLocalErr('');
    void analyze(f);
  };

  return (
    <section className="space-y-3">
      <fieldset className="rounded-lg bg-white p-3 shadow-sm">
        <legend className="px-1 text-xs font-medium text-slate-600">견적서 단가 기준</legend>
        <div role="radiogroup" aria-label="견적서 단가 기준" className="flex flex-wrap gap-2">
          {VAT_OPTIONS.map((o) => (
            <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${vatChoice === o.value ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white'}`}>
              <input type="radio" name="vat" className="sr-only" checked={vatChoice === o.value} onChange={() => setVatChoice(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{VAT_OPTIONS.find((o) => o.value === vatChoice)?.help}. 업로드 전에 선택하세요.</p>
      </fieldset>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}`}
      >
        {status === 'loading' ? (
          <div className="flex items-center justify-center gap-2 text-slate-600"><Loader2 className="animate-spin" size={20} /> 견적서 분석 중… (보통 10~20초, 최대 1분 정도 걸릴 수 있습니다)</div>
        ) : (
          <div className="space-y-1 text-slate-600">
            <UploadCloud className="mx-auto" />
            <p>견적서(PDF/JPG/PNG, 10MB 이하)를 끌어놓거나 클릭해서 선택</p>
          </div>
        )}
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {localErr && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{localErr}</p>}

      {previewUrl && file && (
        <div className="overflow-hidden rounded-lg border bg-white">
          {file.type === 'application/pdf'
            ? <iframe title="견적서 미리보기" src={previewUrl} className="h-[480px] w-full" />
            : <img alt="견적서 미리보기" src={previewUrl} className="max-h-[480px] w-full object-contain" />}
        </div>
      )}
    </section>
  );
}
