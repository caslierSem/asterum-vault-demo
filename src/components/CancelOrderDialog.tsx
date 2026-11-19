import { useEffect } from 'react';
import { Copy, Loader2, X, XCircle } from 'lucide-react';
import { secondaryButtonClass } from '@/lib/formStyles';

interface CancelOrderDialogProps {
  counterparty: string;
  busy: boolean;
  onClose: () => void;
  onCancelOnly: () => void;
  onCancelAndCopy: () => void;
}

export default function CancelOrderDialog({
  counterparty,
  busy,
  onClose,
  onCancelOnly,
  onCancelAndCopy,
}: CancelOrderDialogProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        className="w-full max-w-md sm:max-w-lg max-h-[90vh] flex flex-col bg-white/95 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/40 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="cancel-order-title" className="text-lg font-semibold text-slate-900">取消交易</h2>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-5">
          <p className="text-sm text-slate-600">
            确定取消与「{counterparty || '未填写交易对象'}」的这笔交易吗？取消后占用的在途数量会立即释放。
          </p>
          <button
            onClick={onCancelOnly}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-rose-300 hover:bg-rose-50/50 disabled:opacity-50"
          >
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">直接取消</span>
              <span className="block text-xs text-slate-500">原订单标记为已取消，不再新建。</span>
            </span>
          </button>
          <button
            onClick={onCancelAndCopy}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50/50 disabled:opacity-50"
          >
            <Copy className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">取消并复制新建</span>
              <span className="block text-xs text-slate-500">原订单作废并释放在途，随后打开新建表单，预填原来的物品和数量，方便你修改后重新保存。</span>
            </span>
          </button>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} disabled={busy} className={secondaryButtonClass}>
            返回
          </button>
          {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-slate-500" />}
        </div>
      </div>
    </div>
  );
}
