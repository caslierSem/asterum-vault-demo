import type { Tag } from '@/lib/cards';
import { inputClass, labelClass } from '@/lib/formStyles';
import type { CardFieldValues } from '@/lib/cardFields';
import TagPicker from '@/components/TagPicker';

interface CardDetailFieldsProps {
  idPrefix: string;
  values: CardFieldValues;
  onChange: (patch: Partial<CardFieldValues>) => void;
  allTags: Tag[];
  tagIds: string[];
  onTagsChange: (ids: string[]) => void;
}

// 增加了 whitespace-nowrap 防止极端情况下换行
const FLAG_LABEL_CLASS =
  'flex h-10 w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-400';

export default function CardDetailFields({
  idPrefix,
  values,
  onChange,
  allTags,
  tagIds,
  onTagsChange,
}: CardDetailFieldsProps) {
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={id('name')} className={labelClass}>
          名称 <span className="text-rose-600">*</span>
        </label>
        <input
          id={id('name')}
          type="text"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="例如：物品的完整名称"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={id('quantity')} className={labelClass}>数量</label>
        <input
          id={id('quantity')}
          type="number"
          min={0}
          step={1}
          value={values.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={id('target-quantity')} className={labelClass}>目标数量</label>
        <input
          id={id('target-quantity')}
          type="number"
          min={0}
          step={1}
          value={values.target_quantity}
          onChange={(e) => onChange({ target_quantity: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={id('price')} className={labelClass}>价格（元）</label>
        <input
          id={id('price')}
          type="number"
          min={0}
          step="0.01"
          value={values.price}
          onChange={(e) => onChange({ price: e.target.value })}
          className={inputClass}
        />
      </div>
      
      <div className="grid grid-cols-2 items-end gap-3">
        <label
          htmlFor={id('special')}
          className={`${FLAG_LABEL_CLASS} has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50`}
        >
          <input
            id={id('special')}
            type="checkbox"
            checked={values.is_special}
            onChange={(e) => onChange({ is_special: e.target.checked })}
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          特典卡
        </label>
        <label
          htmlFor={id('defective')}
          className={`${FLAG_LABEL_CLASS} has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50 hover:border-rose-300`}
        >
          <input
            id={id('defective')}
            type="checkbox"
            checked={values.is_defective}
            onChange={(e) => onChange({ is_defective: e.target.checked })}
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          瑕卡
        </label>
      </div>
      
      <div className="sm:col-span-2">
        <span className={labelClass}>主题（最多 3 个）</span>
        <TagPicker allTags={allTags} selectedIds={tagIds} onChange={onTagsChange} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={id('notes')} className={labelClass}>备注</label>
        <textarea
          id={id('notes')}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={2}
          placeholder="例如：封面有折痕、可与某某交换"
          className={`${inputClass} resize-y`}
        />
      </div>
    </div>
  );
}