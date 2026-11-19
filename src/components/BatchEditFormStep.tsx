import { inputClass } from '@/lib/formStyles';
import type { Tag } from '@/lib/cards';
import TagPicker from '@/components/TagPicker';

export interface BatchEditFormState {
  updatePrice: boolean;
  price: string;
  updateTarget: boolean;
  targetQuantity: string;
  updateSpecial: boolean;
  specialValue: boolean;
  updateDefective: boolean;
  defectiveValue: boolean;
  updateTags: boolean;
  newTagIds: string[];
}

interface BatchEditFormStepProps {
  selectedCount: number;
  allTags: Tag[];
  form: BatchEditFormState;
  onChange: (patch: Partial<BatchEditFormState>) => void;
}

/**
 * 批量管理向导的第二步：统一配置需要批量覆盖的物品属性表单
 */
export default function BatchEditFormStep({
  selectedCount,
  allTags,
  form,
  onChange,
}: BatchEditFormStepProps) {
  return (
    <div className="space-y-6 max-w-xl mx-auto w-full pb-40">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
        ⚠️ 注意：这里设置的值，将会覆盖所有已选的 <strong>{selectedCount}</strong> 件物品的对应字段。未勾选的字段保持原样。
      </div>

      <div className="space-y-5">
        {/* 价格 */}
        <div className={`transition-opacity ${form.updatePrice ? 'opacity-100' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updatePrice}
              onChange={(e) => onChange({ updatePrice: e.target.checked })}
              className="h-4 w-4 rounded text-teal-600"
            />
            <span className="text-sm font-medium text-slate-800">修改价格（元）</span>
          </label>
          <input
            type="number"
            disabled={!form.updatePrice}
            value={form.price}
            onChange={(e) => onChange({ price: e.target.value })}
            className={inputClass}
            placeholder="例如：15.00"
          />
        </div>

        {/* 目标数量 */}
        <div className={`transition-opacity ${form.updateTarget ? 'opacity-100' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updateTarget}
              onChange={(e) => onChange({ updateTarget: e.target.checked })}
              className="h-4 w-4 rounded text-teal-600"
            />
            <span className="text-sm font-medium text-slate-800">修改目标数量</span>
          </label>
          <input
            type="number"
            disabled={!form.updateTarget}
            value={form.targetQuantity}
            onChange={(e) => onChange({ targetQuantity: e.target.value })}
            className={inputClass}
            placeholder="例如：1"
          />
        </div>

        {/* 特典状态 */}
        <div className={`transition-opacity ${form.updateSpecial ? 'opacity-100' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updateSpecial}
              onChange={(e) => onChange({ updateSpecial: e.target.checked })}
              className="h-4 w-4 rounded text-teal-600"
            />
            <span className="text-sm font-medium text-slate-800">修改特典状态</span>
          </label>
          <div className="flex gap-4 pl-6">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                disabled={!form.updateSpecial}
                checked={form.specialValue === true}
                onChange={() => onChange({ specialValue: true })}
              />
              设为特典
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                disabled={!form.updateSpecial}
                checked={form.specialValue === false}
                onChange={() => onChange({ specialValue: false })}
              />
              取消特典
            </label>
          </div>
        </div>

        {/* 瑕疵状态 */}
        <div className={`transition-opacity ${form.updateDefective ? 'opacity-100' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updateDefective}
              onChange={(e) => onChange({ updateDefective: e.target.checked })}
              className="h-4 w-4 rounded text-teal-600"
            />
            <span className="text-sm font-medium text-slate-800">修改瑕疵状态</span>
          </label>
          <div className="flex gap-4 pl-6">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                disabled={!form.updateDefective}
                checked={form.defectiveValue === true}
                onChange={() => onChange({ defectiveValue: true })}
              />
              设为瑕疵
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                disabled={!form.updateDefective}
                checked={form.defectiveValue === false}
                onChange={() => onChange({ defectiveValue: false })}
              />
              取消瑕疵
            </label>
          </div>
        </div>

        {/* 主题覆盖 */}
        <div className={`transition-opacity ${form.updateTags ? 'opacity-100' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.updateTags}
              onChange={(e) => onChange({ updateTags: e.target.checked })}
              className="h-4 w-4 rounded text-teal-600"
            />
            <span className="text-sm font-medium text-slate-800">覆盖主题 (Tag)</span>
          </label>
          {form.updateTags && (
            <TagPicker
              allTags={allTags}
              selectedIds={form.newTagIds}
              onChange={(newTagIds) => onChange({ newTagIds })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
