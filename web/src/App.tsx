import { LogOut } from 'lucide-react';
import { ItemGrid } from './components/ItemGrid';
import { LoginGate } from './components/LoginGate';
import { TemplatePanel } from './components/TemplatePanel';
import { UploadPanel } from './components/UploadPanel';
import { useStore } from './store/useStore';

export function App() {
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  if (!token) return <LoginGate />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="font-semibold">Edu-Approval : K-에듀파인 품의문 &amp; 품목내역 자동 생성기</h1>
        <button onClick={logout} className="flex items-center gap-1 text-sm text-slate-600"><LogOut size={16} /> 나가기</button>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-2">
        <UploadPanel />
        <TemplatePanel />
        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2"><ItemGrid /></div>
      </main>
    </div>
  );
}
