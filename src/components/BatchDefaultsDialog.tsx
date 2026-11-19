import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Tag } from '@/lib/cards';
import { DEFAULT_FIELD_VALUES, parseFieldValues, type CardFieldValues } from '@/lib/cardFields';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import TagPicker from '@/components/TagPicker';

export type BatchFieldValues = Pick<
  CardFieldValues,
  'name' | 'quantity' | 'target_quantity' | 'price' | 'is_defective' | 'is_special'
>;

export interface BatchDefaults {
  values: BatchFieldValues;
  tagIds: string[];
}

interface BatchDefaultsDialogProps {
  allTags: Tag[];
  onClose: () => void;
  onApply: (defaults: BatchDefaults) => void;
}

const INITIAL_VALUES: BatchFieldValues = {
  name: '',
  quantity: DEFAULT_FIELD_VALUES.quantity,
  target_quantity: DEFAULT_FIELD_VALUES.target_quantity,
  price: DEFAULT_FIELD_VALUES.price,
  is_defective: DEFAULT_FIELD_VALUES.is_defective,
  is_special: DEFAULT_FIELD_VALUES.is_special,
};

export default function BatchDefaultsDialog({ allTags, onClose, onApply }: BatchDefaultsDialogProps) {
  const [values, setValues] = useState<BatchFieldValues>(INITIAL_VALUES);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const patch = (changes: Partial<BatchFieldValues>) => {
    setError(null);
    setValues((prev) => ({ ...prev, ...changes }));
  };

  const handleApply = () => {
    // 如果填写了 name，则校验 name；如果没填，用占位符绕过必填校验（应用时父组件会判断如果不填就不覆盖）
    const parsed = parseFieldValues({ ...DEFAULT_FIELD_VALUES, ...values, name: values.name.trim() || '占位' });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onApply({ values, tagIds });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-defaults-title"
        className="w-full max-w-md sm:max-w-lg max-h-[90vh] flex flex-col bg-white/95 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/40 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="batch-defaults-title" className="text-lg font-semibold text-slate-900">批量设置默认值</h2>
            <p className="mt-1 text-xs text-slate-500">
              应用后会覆盖所有待保存物品的下列字段。
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          
          {/* 新增：批量默认名称 */}
          <div className="sm:col-span-2">
            <label htmlFor="batch-name" className={labelClass}>默认名称</label>
            <input
              id="batch-name"
              type="text"
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              className={inputClass}
              placeholder="例如：出道专"
            />
          </div>

          <div>
            <label htmlFor="batch-quantity" className={labelClass}>默认数量</label>
            <input
              id="batch-quantity"
              type="number"
              min={0}
              step={1}
              value={values.quantity}
              onChange={(e) => patch({ quantity: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="batch-target-quantity" className={labelClass}>默认目标数量</label>
            <input
              id="batch-target-quantity"
              type="number"
              min={0}
              step={1}
              value={values.target_quantity}
              onChange={(e) => patch({ target_quantity: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="batch-price" className={labelClass}>默认价格（元）</label>
            <input
              id="batch-price"
              type="number"
              min={0}
              step="0.01"
              value={values.price}
              onChange={(e) => patch({ price: e.target.value })}
              className={inputClass}
            />
          </div>
          
          {/* 优化：瑕卡和特典并排在同一行 */}
          <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:gap-4">
            <div className="flex items-end">
              <label
                htmlFor="batch-defective"
                className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 transition hover:border-rose-300 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50"
              >
                <input
                  id="batch-defective"
                  type="checkbox"
                  checked={values.is_defective}
                  onChange={(e) => patch({ is_defective: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                瑕卡
              </label>
            </div>
            <div className="flex items-end">
              <label
                htmlFor="batch-special"
                className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 transition hover:border-emerald-300 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50"
              >
                <input
                  id="batch-special"
                  type="checkbox"
                  checked={values.is_special}
                  onChange={(e) => patch({ is_special: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                特典卡
              </label>
            </div>
          </div>

          <div className="sm:col-span-2 mt-2">
            <span className={labelClass}>默认主题（会替换现有主题）</span>
            <TagPicker
              allTags={allTags}
              selectedIds={tagIds}
              onChange={(ids) => {
                setError(null);
                setTagIds(ids);
              }}
            />
          </div>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:col-span-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className={secondaryButtonClass}>关闭</button>
          <button onClick={handleApply} className={primaryButtonClass}>应用到所有物品</button>
        </div>
      </div>
    </div>
  );
}