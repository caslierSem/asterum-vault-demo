import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, KeyRound, Lock } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import { storeGuestPasscode, verifyGuestPasscode } from '@/lib/guestAccess';
import { signInOwner, type Role } from '@/lib/session';

interface RoleGateProps {
  onSelect: (role: Role) => void;
  initialError?: string | null;
}

export default function RoleGate({ onSelect, initialError = null }: RoleGateProps) {
  const [step, setStep] = useState<'choose' | 'password' | 'guest_code'>(
    initialError ? 'guest_code' : 'choose',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const handleOwnerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInOwner(email.trim(), password);
      onSelect('owner');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  // 点击“访客登入”时，先尝试免密校验（若管理员关闭了口令限制则直接放行）
  const handleGuestClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const isPublicOpen = await verifyGuestPasscode('');
      if (isPublicOpen) {
        storeGuestPasscode('');
        onSelect('guest');
      } else {
        setStep('guest_code');
      }
    } catch {
      setStep('guest_code');
    } finally {
      setBusy(false);
    }
  };

  const handleGuestCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyGuestPasscode(passcode);
      if (!ok) {
        setError('访客口令不正确或已失效，请重新输入。');
        return;
      }
      storeGuestPasscode(passcode);
      onSelect('guest');
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setStep('choose');
    setPassword('');
    setPasscode('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-gate-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="role-gate-title" className="text-lg font-semibold text-slate-900">
          {step === 'guest_code' ? '输入访客口令' : '选择登入身份'}
        </h2>

        {step === 'choose' && (
          <div className="mt-5 grid gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('password')}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-600 hover:bg-teal-50 active:scale-[0.99]"
            >
              <KeyRound className="h-5 w-5 shrink-0 text-teal-700" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">管理员登入</span>
                <span className="block text-xs text-slate-500">可录入、编辑、交易与管理全部数据</span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGuestClick()}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99]"
            >
              <Eye className="h-5 w-5 shrink-0 text-slate-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">访客登入</span>
                <span className="block text-xs text-slate-500">需凭访客口令或专属分享链接进入</span>
              </span>
            </button>
          </div>
        )}

        {step === 'password' && (
          <form onSubmit={handleOwnerSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="owner-email" className={labelClass}>管理员邮箱</label>
              <input
                id="owner-email"
                type="email"
                autoFocus
                required
                autoComplete="username"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="owner-password" className={labelClass}>管理员密码</label>
              <input
                id="owner-password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className={inputClass}
              />
            </div>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={goBack} className={secondaryButtonClass} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> 返回
              </button>
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                {busy ? '处理中…' : '确认登入'}
              </button>
            </div>
          </form>
        )}

        {step === 'guest_code' && (
          <form onSubmit={handleGuestCodeSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="guest-passcode" className={labelClass}>访问口令</label>
              <div className="relative">
                <input
                  id="guest-passcode"
                  type="text"
                  autoFocus
                  required
                  placeholder="请输入管理员提供的暗号"
                  value={passcode}
                  onChange={(e) => { setPasscode(e.target.value); setError(null); }}
                  className={inputClass}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                如果你收到了带暗号的专属链接，直接点击链接即可免输进入。
              </p>
            </div>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={goBack} className={secondaryButtonClass} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> 返回
              </button>
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                <Lock className="h-4 w-4" />
                {busy ? '验证中…' : '确认进入'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
