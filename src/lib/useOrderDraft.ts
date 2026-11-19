import { useState, useEffect } from 'react';
import { getDisplayName, type Card } from '@/lib/cards';
import type { LineDirection, OrderDraft, OrderDraftLine } from '@/lib/orders';
import type { CardStock } from '@/lib/useInventory';
import type { DraftLineState } from '@/components/OrderLineSection';

const DRAFT_STORAGE_KEY = 'plave_order_draft';

export const newLineKey = () => Math.random().toString(36).slice(2, 10);

function toLineStates(lines: OrderDraftLine[], direction: LineDirection): DraftLineState[] {
  return lines
    .filter((line) => line.direction === direction)
    .map((line) => ({ key: newLineKey(), cardId: line.cardId, quantity: String(line.quantity) }));
}

function readDraftField<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed[key] !== undefined ? parsed[key] : fallback;
    }
  } catch { /* 忽略解析错误 */ }
  return fallback;
}

export function useOrderDraft(
  initialDraft: OrderDraft,
  cards: Card[],
  stocks: Map<string, CardStock>,
  saving: boolean,
) {
  // 只要带有预填物品（快速交易 / 取消重开），就以传入数据为准，直接忽略旧草稿
  const hasExplicitPrefill = initialDraft.lines.length > 0;

  const [counterparty, setCounterparty] = useState(() =>
    hasExplicitPrefill ? initialDraft.counterparty : readDraftField('counterparty', initialDraft.counterparty),
  );
  const [note, setNote] = useState(() =>
    hasExplicitPrefill ? initialDraft.note : readDraftField('note', initialDraft.note),
  );
  const [outLines, setOutLines] = useState<DraftLineState[]>(() =>
    hasExplicitPrefill
      ? toLineStates(initialDraft.lines, '流出')
      : readDraftField('outLines', toLineStates(initialDraft.lines, '流出')),
  );
  const [inLines, setInLines] = useState<DraftLineState[]>(() =>
    hasExplicitPrefill
      ? toLineStates(initialDraft.lines, '流入')
      : readDraftField('inLines', toLineStates(initialDraft.lines, '流入')),
  );
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  // 1. 首次挂载时检查草稿有效性
  useEffect(() => {
    if (hasExplicitPrefill) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    // 防止卡片数据尚未加载完成时，误判所有草稿物品为“已删除”
    if (cards.length === 0) return;

    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const invalidOut: string[] = [];
      const validOut: DraftLineState[] = [];
      const invalidIn: string[] = [];
      const validIn: DraftLineState[] = [];

      // 检查流出（跳过未选物品的空行）
      (parsed.outLines || []).forEach((line: DraftLineState) => {
        if (!line.cardId) {
          validOut.push(line);
          return;
        }
        const card = cards.find((c) => c.id === line.cardId);
        if (!card) {
          invalidOut.push('已删除的物品');
        } else if ((stocks.get(line.cardId)?.available ?? 0) <= 0) {
          invalidOut.push(`「${getDisplayName(card)}」`);
        } else {
          validOut.push(line);
        }
      });

      // 检查流入
      (parsed.inLines || []).forEach((line: DraftLineState) => {
        if (!line.cardId) {
          validIn.push(line);
          return;
        }
        const card = cards.find((c) => c.id === line.cardId);
        if (!card) {
          invalidIn.push('已删除的物品');
        } else {
          validIn.push(line);
        }
      });

      if (invalidOut.length > 0 || invalidIn.length > 0) {
        setOutLines(validOut);
        setInLines(validIn);
        const messages: string[] = [];
        if (invalidOut.length > 0) messages.push(`【流出】部分物品库存不足或已删除：${invalidOut.join('、')}`);
        if (invalidIn.length > 0) messages.push(`【流入】部分物品已被删除：${invalidIn.join('、')}`);
        setWarningMessages(messages);
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. 自动保存草稿（仅在有实质内容时保存，纯空表单自动清理缓存）
  useEffect(() => {
    if (saving) return;
    const hasValidOut = outLines.some((l) => Boolean(l.cardId));
    const hasValidIn = inLines.some((l) => Boolean(l.cardId));
    const hasContent = Boolean(counterparty.trim() || note.trim() || hasValidOut || hasValidIn);

    if (!hasContent) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        counterparty,
        note,
        outLines: outLines.filter((l) => Boolean(l.cardId)),
        inLines: inLines.filter((l) => Boolean(l.cardId)),
      }),
    );
  }, [counterparty, note, outLines, inLines, saving]);

  const clearDraft = () => localStorage.removeItem(DRAFT_STORAGE_KEY);
  const isDirty = Boolean(counterparty || note || outLines.length > 0 || inLines.length > 0);

  return {
    counterparty,
    setCounterparty,
    note,
    setNote,
    outLines,
    setOutLines,
    inLines,
    setInLines,
    warningMessages,
    dismissWarning: () => setWarningMessages([]),
    clearDraft,
    isDirty,
  };
}
