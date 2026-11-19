import { Plus, Trash2 } from 'lucide-react';
import { formatPrice, type Card } from '@/lib/cards';
import { getCardStatusBadge } from '@/lib/cardStatus';
import type { CardStock } from '@/lib/useInventory';
import CardPicker, { type PickerOption } from '@/components/CardPicker';

/**
 * 订单表单中单行物品的草稿状态
 */
export interface DraftLineState {
  key: string;
  cardId: string | null;
  quantity: string;
}

interface OrderLineSectionProps {
  title: string;
  hint: string;
  emptyText: string;
  accentClass: string;
  lines: DraftLineState[];
  cards: Card[];
  stocks: Map<string, CardStock>;
  getOptions: (lineKey: string) => PickerOption[];
  onAdd: () => void;
  onChange: (key: string, patch: Partial<Omit<DraftLineState, 'key'>>) => void;
  onRemove: (key: string) => void;
}

/**
 * 订单“流出”或“流入”明细分组区块组件
 * 负责展示当前分组的物品种数/总件数统计，以及单行物品的选择、数量编辑与删除
 */
export default function OrderLineSection({
  title,
  hint,
  emptyText,
  accentClass,
  lines,
  cards,
  stocks,
  getOptions,
  onAdd,
  onChange,
  onRemove,
}: OrderLineSectionProps) {
  // 仅统计已选定具体物品（cardId 非空）的有效行，避免点击“添加一行”出现空白搜索框时提前计入总数
  const validLines = lines.filter((line) => Boolean(line.cardId));

  // 累加所有有效行的数量，过滤非法输入或负数，防止出现 NaN 或负件数
  const totalQuantity = validLines.reduce((sum, line) => {
    const qty = Number(line.quantity);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* 头部标题栏：左侧展示流向标题与有效统计，右侧提供添加空行按钮 */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className={`h-2.5 w-2.5 rounded-full ${accentClass}`} />
            {title}
            <span className="text-sm font-normal text-slate-500">
              {validLines.length} 种 / {totalQuantity} 件
            </span>
          </h3>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          添加一行
        </button>
      </div>

      {/* 明细列表区：无行时展示虚线空状态提示，有行时逐行渲染物品选择器 */}
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => {
            const options = getOptions(line.key);
            const selected = options.find((option) => option.id === line.cardId) ?? null;

            // 复用全局状态徽标函数，确保文案（如“已凑齐*”）与库存列表页完全一致
            let statusBadge = null;
            const card = cards.find((c) => c.id === line.cardId);
            const stock = line.cardId ? stocks.get(line.cardId) : undefined;

            if (card && stock) {
              const { label, colorClass } = getCardStatusBadge(card.target_quantity, stock);
              statusBadge = (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${colorClass}`}>
                  {label}
                </span>
              );
            }

            return (
              <li
                key={line.key}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 md:flex-row md:items-center"
              >
                {/* 左侧：物品搜索下拉选择器 + 删除当前行按钮 */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CardPicker
                    label={`${title}物品`}
                    options={options}
                    value={line.cardId}
                    onChange={(cardId) => onChange(line.key, { cardId })}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label="删除这一行"
                    className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* 右侧（仅选中物品后显示）：库存概况、单价、完备度徽标与数量输入框 */}
                {selected && (
                  <div className="flex items-center justify-between gap-3 md:shrink-0 md:justify-end">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{selected.meta}</span>
                      <span>单价：{formatPrice(selected.price)}</span>
                      {statusBadge}
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => onChange(line.key, { quantity: e.target.value })}
                      aria-label="数量"
                      className="w-24 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-center text-base tabular-nums text-slate-900 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
