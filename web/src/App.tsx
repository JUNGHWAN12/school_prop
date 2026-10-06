import { ItemGrid } from './components/ItemGrid';
import { NoticePanel } from './components/NoticePanel';
import { TemplatePanel } from './components/TemplatePanel';
import { UploadPanel } from './components/UploadPanel';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-4 py-3">
        <h1 className="font-semibold">Edu-Approval : K-에듀파인 품의문 &amp; 품목내역 자동 생성기</h1>
      </header>
      {/* 넓은 화면(xl): [안내 | 업로드·미리보기 | 템플릿], 그보다 좁으면 업로드 → 안내 → 템플릿 순으로 쌓임 */}
      <main className="mx-auto grid max-w-[1600px] gap-6 p-4 xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 xl:order-none xl:col-start-1 xl:row-start-1"><NoticePanel /></div>
        <div className="order-1 xl:order-none xl:col-start-2 xl:row-start-1"><UploadPanel /></div>
        <div className="order-3 xl:order-none xl:col-start-3 xl:row-start-1"><TemplatePanel /></div>
        <div className="order-4 rounded-xl bg-white p-4 shadow-sm xl:order-none xl:col-span-3"><ItemGrid /></div>
      </main>
    </div>
  );
}
