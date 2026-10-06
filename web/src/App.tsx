import { ItemGrid } from './components/ItemGrid';
import { TemplatePanel } from './components/TemplatePanel';
import { UploadPanel } from './components/UploadPanel';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-4 py-3">
        <h1 className="font-semibold">Edu-Approval : K-에듀파인 품의문 &amp; 품목내역 자동 생성기</h1>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-2">
        <UploadPanel />
        <TemplatePanel />
        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2"><ItemGrid /></div>
      </main>
    </div>
  );
}
