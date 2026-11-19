import { useState, useEffect, type FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, Loader2, X } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import {
  buildGuestShareLink,
  fetchCurrentGuestPasscode,
  updateGuestPasscode,
} from '@/lib/guestAccess';

interface GuestPasscodeModalProps {
  onClose: () => void;
}

export default function GuestPasscodeModal({ onClose }: GuestPasscodeModalProps) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCode, setShowCode] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchCurrentGuestPasscode()
      .then((code) => setPasscode(code))
      .catch((err) => setMessage({ type: 'error', text: err instanceof Error ? err.message : '加载失败' }))
      .finally(() => setLoading(false));
  }, []);

  const shareLink = buildGuestShareLink(passcode);

  const handleCopy = async (text: string, target: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (target === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      setMessage({ type: 'error', text: '复制失败，请手动选中文本复制' });
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateGuestPasscode(passcode);
      setMessage({
        type: 'success',
        text: passcode.trim()
          ? '访客口令已更新！旧口令及旧专属链接已立即失效。'
          : '口令已清空，当前已切换为全公开访问模式。',
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <KeyRound className="h-5 w-5 text-teal-700" />
            访客口令与分享链接
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-5">
            {/* 专属免密分享链接展示区 */}
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                  <Link2 className="h-4 w-4 text-teal-700" />
                  {passcode.trim() ? '访客专属免密链接' : '当前公开访问链接'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy(shareLink, 'link')}
                  className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-teal-800 active:scale-95"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedLink ? '已复制链接' : '复制专属链接'}
                </button>
              </div>
              <p className="break-all rounded-lg bg-white px-2.5 py-2 text-xs font-mono text-slate-600 border border-teal-100/80 select-all">
                {shareLink}
              </p>
              <p className="text-[11px] text-teal-800/80">
                买家点开此链接将自动完成口令验证并直接进入列表，无需手动输入。
              </p>
            </div>

            {/* 修改口令输入区 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="admin-guest-code" className={labelClass}>当前访客口令</label>
                {passcode.trim() && (
                  <button
                    type="button"
                    onClick={() => void handleCopy(passcode.trim(), 'code')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-teal-700"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? '已复制暗号' : '仅复制口令'}
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  id="admin-guest-code"
                  type={showCode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => { setPasscode(e.target.value); setMessage(null); }}
                  placeholder="留空保存即关闭口令限制（全公开）"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-700"
                  title={showCode ? '隐藏口令' : '显示口令'}
                >
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                修改并保存后，之前发出去的旧口令和旧专属链接将立刻作废。
              </p>
            </div>

            {message && (
              <p className={`rounded-lg px-3 py-2 text-xs font-medium ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'
              }`}>
                {message.text}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
                关闭
              </button>
              <button type="submit" className={primaryButtonClass} disabled={saving}>
                {saving ? '保存中…' : '更新口令'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
