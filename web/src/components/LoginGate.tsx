import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useStore } from '../store/useStore';

export function LoginGate() {
  const login = useStore((s) => s.login);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(code);
    } catch (x) {
      setErr(x instanceof Error ? x.message : '로그인 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold"><Lock size={20} /> Edu-Approval</div>
        <p className="text-sm text-slate-600">학교 공용 접속 코드를 입력하세요.</p>
        <input
          type="password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="접속 코드"
          className="w-full rounded border border-slate-300 px-3 py-2"
        />
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || !code} className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
          {busy ? '확인 중…' : '입장'}
        </button>
      </form>
    </div>
  );
}
