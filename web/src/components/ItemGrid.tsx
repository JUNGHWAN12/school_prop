import { Download, Plus, X } from 'lucide-react';
import { downloadExcel, buildWorkbook, validateWorkbook } from '../lib/excel';
import { amountToKoreanWon, formatWon } from '../lib/koreanAmount';
import { lineAmount, totalAmount } from '../lib/summary';
import { useStore } from '../store/useStore';

const cell = 'w-full rounded border border-slate-300 px-2 py-1';

export function ItemGrid() {
  const { items, updateItem, addItem, removeItem } = useStore();
  const issues = validateWorkbook(buildWorkbook(items));
  const total = totalAmount(items);

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">K-에듀파인 품목내역 (편집·검증)</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="p-1">내용(품명)</th><th className="p-1">규격</th><th className="w-20 p-1">단위</th>
              <th className="w-24 p-1">수량</th><th className="w-32 p-1">예상단가(VAT포함)</th>
              <th className="w-28 p-1 text-right">금액(참고)</th><th className="w-10 p-1"><span className="sr-only">삭제</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={it.id}>
                <td className="p-1"><input aria-label={`${n + 1}행 품명`} className={cell} value={it.itemName} onChange={(e) => updateItem(it.id, { itemName: e.target.value })} /></td>
                <td className="p-1"><input aria-label={`${n + 1}행 규격`} className={cell} value={it.spec} onChange={(e) => updateItem(it.id, { spec: e.target.value })} /></td>
                <td className="p-1"><input aria-label={`${n + 1}행 단위`} className={cell} value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} /></td>
                <td className="p-1"><input aria-label={`${n + 1}행 수량`} type="number" min={0} className={cell} value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} /></td>
                <td className="p-1"><input aria-label={`${n + 1}행 예상단가`} type="number" min={0} className={cell} value={it.unitPrice} onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) })} /></td>
                <td className="p-1 text-right tabular-nums text-slate-600">{formatWon(lineAmount(it))}</td>
                <td className="p-1"><button aria-label={`${n + 1}행 삭제`} onClick={() => removeItem(it.id)} className="rounded p-1 hover:bg-slate-100"><X size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={addItem} className="flex items-center gap-1 rounded border px-3 py-2 text-sm"><Plus size={16} /> 품목 추가</button>
        <div className="text-sm">합계: <b>{amountToKoreanWon(total).replace('금', '금 ')}</b> ({formatWon(total)}원)</div>
      </div>

      {issues.length > 0 && (
        <ul role="alert" className="list-disc rounded bg-red-50 p-3 pl-6 text-sm text-red-700">
          {issues.map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <button disabled={issues.length > 0 || items.length === 0} onClick={() => downloadExcel(items, 'xlsx')} className="flex items-center gap-1 rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
          <Download size={16} /> K-에듀파인 엑셀 다운로드 (.xlsx)
        </button>
        <button disabled={issues.length > 0 || items.length === 0} onClick={() => downloadExcel(items, 'xls')} className="rounded border px-3 py-2 text-sm disabled:opacity-50" title="구형 엑셀 형식">.xls</button>
      </div>
    </section>
  );
}
