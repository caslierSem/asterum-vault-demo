import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { AlertCircle, ArrowLeft, Info, Loader2, Plus } from 'lucide-react';
import { compareCardsForList, getCardImageUrl, getDisplayName, type Card } from '@/lib/cards';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import { createOrder, type LineDirection, type OrderDraft, type OrderDraftLine } from '@/lib/orders';
import { buildTagRank } from '@/lib/tags';
import type { CardStock } from '@/lib/useInventory';
import { useTags } from '@/lib/useTags';
import { useOrderDraft, newLineKey } from '@/lib/useOrderDraft';
import type { PickerOption } from '@/components/CardPicker';
import OrderLineSection, { type DraftLineState } from '@/components/OrderLineSection';
import ConfirmDialog from '@/components/ConfirmDialog';

interface OrderFormProps {
  initialDraft: OrderDraft;
  notice: string | null;
  cards: Card[];
  stocks: Map<string, CardStock>;
  onCancel: () => void;
  onCreated: () => void;
}

const QUICK_TAGS = ['#闲鱼', '#微信', '#微博', '#小红书', '#QQ'];

const toPickerOption = (card: Card, meta: string, disabled: boolean): PickerOption => ({
  id: card.id,
  name: getDisplayName(card),
  meta,
  disabled,
  imageUrl: card.image_path ? getCardImageUrl(card.image_path) : null,
  tags: card.tags.map((tag) => tag.name),
  price: card.price,
});

function validateAndBuildPayload(
  outLines: DraftLineState[],
  inLines: DraftLineState[],
  cardsById: Map<string, Card>,
  stocks: Map<string, CardStock>,
): { lines?: OrderDraftLine[]; error?: string } {
  const payloadLines: OrderDraftLine[] = [];
  const sections: [LineDirection, DraftLineState[]][] = [
    ['流出', outLines],
    ['流入', inLines],
  ];

  for (const [direction, lines] of sections) {
    for (const line of lines) {
      if (!line.cardId) return { error: '请为每一行选择一件物品，或删除空行。' };
      const card = cardsById.get(line.cardId);
      if (!card) return { error: '有物品已不存在，请重新选择。' };

      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return { error: `「${getDisplayName(card)}」的数量需为大于 0 的整数。` };
      }
      if (direction === '流出') {
        const available = stocks.get(card.id)?.available ?? 0;
        if (quantity > available) {
          return { error: `「${getDisplayName(card)}」可用数量只有 ${available} 张，无法流出 ${quantity} 张。` };
        }
      }
      payloadLines.push({ cardId: card.id, direction, quantity });
    }
  }

  if (payloadLines.length === 0) return { error: '请至少添加一件物品。' };
  return { lines: payloadLines };
}

export default function OrderForm({ initialDraft, notice, cards, stocks, onCancel, onCreated }: OrderFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const {
    counterparty, setCounterparty,
    note, setNote,
    outLines, setOutLines,
    inLines, setInLines,
    warningMessages, dismissWarning,
    clearDraft, isDirty,
  } = useOrderDraft(initialDraft, cards, stocks, saving);

  const { tags } = useTags();
  const tagRank = useMemo(() => buildTagRank(tags), [tags]);
  const sortedCards = useMemo(() => [...cards].sort((a, b) => compareCardsForList(a, b, tagRank)), [cards, tagRank]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const allLines = [...outLines, ...inLines];

  const appendTag = (current: string, tag: string, setter: (val: string) => void) => {
    const trimmed = current.trim();
    if (!trimmed.includes(tag)) setter(trimmed ? `${trimmed} ${tag} ` : `${tag} `);
  };

  const buildOptions = (lineKey: string, direction: LineDirection): PickerOption[] => {
    const taken = new Set(allLines.flatMap((l) => (l.key !== lineKey && l.cardId ? [l.cardId] : [])));
    return sortedCards
      .filter((card) => !taken.has(card.id))
      .map((card) =>
        direction === '流出'
          ? toPickerOption(card, `可用 ${stocks.get(card.id)?.available ?? 0}`, (stocks.get(card.id)?.available ?? 0) <= 0)
          : toPickerOption(card, `库存 ${card.quantity}`, false),
      );
  };

  const createLineHandlers = (setLines: Dispatch<SetStateAction<DraftLineState[]>>) => ({
    onAdd: () => setLines((prev) => [...prev, { key: newLineKey(), cardId: null, quantity: '1' }]),
    onChange: (key: string, patch: Partial<Omit<DraftLineState, 'key'>>) =>
      setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line))),
    onRemove: (key: string) => setLines((prev) => prev.filter((line) => line.key !== key)),
  });

  const handleCancelClick = () => {
    if (!isDirty) {
      clearDraft();
      onCancel();
      return;
    }
    setShowAbandonConfirm(true);
  };

  const handleSubmit = async () => {
    const { lines, error: validationError } = validateAndBuildPayload(outLines, inLines, cardsById, stocks);
    if (validationError || !lines) {
      setError(validationError ?? '表单校验失败');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createOrder({ counterparty: counterparty.trim(), note: note.trim(), lines });
      clearDraft();
      onCreated();
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回订单列表
          </button>
        </div>

        {notice && (
          <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <section className="grid grid-cols-1 gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5">
          <div>
            <label htmlFor="order-counterparty" className={labelClass}>交易对象</label>
            <input
              id="order-counterparty"
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="对方 ID 或名字"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="order-note" className={labelClass}>备注</label>
            <input
              id="order-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：顺丰到付、周末寄出"
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => appendTag(note, tag, setNote)}
                  className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 active:scale-95"
                >
                  <Plus className="h-3 w-3" />{tag.replace('#', '')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <OrderLineSection
          title="流出"
          hint="寄出或卖出的物品。保存后会占用对应数量的可用库存（在途）。"
          emptyText="未添加。纯买入的订单可以留空这里。"
          accentClass="bg-amber-500"
          lines={outLines}
          cards={cards}
          stocks={stocks}
          getOptions={(key) => buildOptions(key, '流出')}
          {...createLineHandlers(setOutLines)}
        />

        <OrderLineSection
          title="流入"
          hint="换入或买入的物品。订单完成后才会加入库存（待入库）。"
          emptyText="未添加。纯卖出的订单可以留空这里。"
          accentClass="bg-emerald-500"
          lines={inLines}
          cards={cards}
          stocks={stocks}
          getOptions={(key) => buildOptions(key, '流入')}
          {...createLineHandlers(setInLines)}
        />

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleCancelClick} disabled={saving} className={secondaryButtonClass}>
            放弃
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? '保存中…' : '保存订单'}
          </button>
        </div>
      </div>

      {warningMessages.length > 0 && (
        <ConfirmDialog
          title="草稿部分失效"
          confirmText="我知道了"
          cancelText=""
          message={
            <div className="space-y-2">
              <p>检测到草稿中的部分物品已失效，已为您自动从表单中移除：</p>
              {warningMessages.map((m, i) => (
                <p key={i} className="font-medium text-rose-600">{m}</p>
              ))}
            </div>
          }
          onConfirm={dismissWarning}
          onCancel={dismissWarning}
        />
      )}

      {showAbandonConfirm && (
        <ConfirmDialog
          title="放弃编辑"
          isDanger
          confirmText="确认放弃"
          message="确定要放弃当前正在编辑的订单吗？所有已填写的内容将被清空。"
          onConfirm={() => {
            setShowAbandonConfirm(false);
            clearDraft();
            onCancel();
          }}
          onCancel={() => setShowAbandonConfirm(false)}
        />
      )}
    </>
  );
}