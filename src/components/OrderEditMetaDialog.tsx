import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { updateOrderMeta, type Order } from '@/lib/orders';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';

interface OrderEditMetaDialogProps {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 订单基础信息编辑弹窗（仅限编辑交易对象与备注）
 * 仅在订单处于“约换中”状态时，由父组件调用此弹窗。
 */
export default function OrderEditMetaDialog({ order, onClose, onSaved }: OrderEditMetaDialogProps) {
  // 初始化时回显现有数据
  const [counterparty, setCounterparty] = useState(order.counterparty || '');
  const [note, setNote] = useState(order.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateOrderMeta(order.id, counterparty, note);
      onSaved(); // 防呆要求3：保存成功后触发父组件的刷新
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md sm:max-w-lg max-h-[90vh] flex flex-col bg-white/95 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/40 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">编辑订单信息</h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div>
            <label className={labelClass}>交易对象</label>
            <input
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="对方 ID 或名字"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>备注</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：顺丰到付、周末寄出"
              className={inputClass}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button onClick={onClose} disabled={saving} className={secondaryButtonClass}>
            取消
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}