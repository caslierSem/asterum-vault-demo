import { useMemo, useRef, useState, useEffect } from 'react';
import { AlertCircle, Loader2, Package, RotateCcw, Search, Edit3, Share2 } from 'lucide-react';
import { compareCardsForList, updateCard, getDisplayName, getMissing, type Card } from '@/lib/cards';
import { applyFilters, DEFAULT_FILTERS, hasActiveFilters, type CardFilters } from '@/lib/cardFilters';
import type { CardPrefill } from '@/lib/cardFields';
import { buildTagRank } from '@/lib/tags';
import { useInventory, type CardStock } from '@/lib/useInventory';
import { useTags } from '@/lib/useTags';
import type { OrderDraftRequest } from '@/lib/orders';
import CardFilterBar from '@/components/CardFilterBar';
import CardListItem from '@/components/CardListItem';
import CardEditDialog from '@/components/CardEditDialog';
import TagFilterInput from '@/components/TagFilterInput';
import { searchShellClass, searchInputClass } from '@/lib/formStyles';
import BatchEditWizard from '@/components/BatchEditWizard';
import SwapBoardView from '@/components/SwapBoardView'; // 引入新组件

interface CardListProps {
  onStartOrder: (request: OrderDraftRequest) => void;
  onDuplicate: (prefill: CardPrefill) => void;
  readOnly: boolean;
}

const EMPTY_STOCK: CardStock = { quantity: 0, reserved: 0, pendingIn: 0, available: 0, openOrders: 0 };
const PAGE_SIZE = 48; 

function toggleInSet<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export default function CardList({ onStartOrder, onDuplicate, readOnly }: CardListProps) {
  const { cards, stocks, loading, error, reload } = useInventory();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [filters, setFilters] = useState<CardFilters>(DEFAULT_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { tags, error: tagsError, reload: reloadTags } = useTags();
  
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [showSwapBoard, setShowSwapBoard] = useState(false); // 新增：控制海报页
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  useEffect(() => {
    const handleSlashKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', handleSlashKey);
    return () => window.removeEventListener('keydown', handleSlashKey);
  }, []);

  const stockOf = (cardId: string) => stocks.get(cardId) ?? EMPTY_STOCK;

  const runCardUpdate = async (card: Card, changes: Pick<Card, 'quantity'>) => {
    setBusyId(card.id);
    setActionError(null);
    try {
      await updateCard(card.id, changes);
      await reload();
    } catch (err) {
      setActionError(`更新失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdjustQuantity = (card: Card, delta: 1 | -1) => {
    const next = card.quantity + delta;
    const reserved = stockOf(card.id).reserved;
    if (next < reserved) {
      setActionError(`「${getDisplayName(card)}」有 ${reserved} 张在约换中的订单占用，库存不能低于 ${reserved}。`);
      return;
    }
    void runCardUpdate(card, { quantity: next });
  };

   const startOrderFromCard = (card: Card) => {
    const stock = stockOf(card.id);
    const missing = getMissing(stock.available, stock.pendingIn, card.target_quantity);
    // 缺卡，或者手头可用现货为 0（比如 1 张库存全在流出在途）时，默认放入“流入”
    const direction = missing > 0 || stock.available <= 0 ? '流入' : '流出';

    onStartOrder({
      draft: {
        counterparty: '',
        note: '',
        lines: [{ cardId: card.id, direction, quantity: 1 }],
      },
      notice: null,
    });
  };

  const tagRank = useMemo(() => buildTagRank(tags), [tags]);
  const visibleCards = useMemo(
    () =>
      applyFilters(cards, filters, tags, (cardId) => stocks.get(cardId) ?? EMPTY_STOCK).sort((a, b) =>
        compareCardsForList(a, b, tagRank),
      ),
    [cards, filters, tags, tagRank, stocks],
  );
  
  const displayedCards = visibleCards.slice(0, visibleCount);
  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);

  const editingReserved = editingCard ? stockOf(editingCard.id).reserved : 0;
  const editingOpenOrders = editingCard ? stockOf(editingCard.id).openOrders : 0;

  if (showBatchEdit) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <BatchEditWizard
          cards={cards}
          tags={tags}
          onClose={() => setShowBatchEdit(false)}
          onSuccess={() => {
            setShowBatchEdit(false);
            void reload();
          }}
          onTagCreated={() => void reloadTags()}
        />
      </section>
    );
  }

  // === 核心拦截：渲染海报页面 ===
  if (showSwapBoard) {
    return (
      <SwapBoardView 
        cards={visibleCards} // 只传当前筛选出来的卡片
        stocks={stocks} 
        tags={tags}
        onClose={() => setShowSwapBoard(false)} 
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">物品列表</h1>
          <p className="mt-1 text-sm text-slate-500">
            共 {cards.length} 种，合计 {totalQuantity} 件
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 换卡海报：所有人可见 */}
          <button 
            onClick={() => setShowSwapBoard(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
            title="生成换卡海报"
          >
            <Share2 className="h-4 w-4" />
          </button>

          {/* 批量管理：仅管理员可见 */}
          {!readOnly && (
            <button 
              onClick={() => setShowBatchEdit(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 active:scale-95"
            >
              <Edit3 className="h-4 w-4" />
              批量管理
            </button>
          )}
        </div>
      </div>
    

      <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <CardFilterBar
          filters={filters}
          onToggleCollection={(key) =>
            setFilters((prev) => ({ ...prev, collections: toggleInSet(prev.collections, key) }))
          }
          onToggleAttribute={(key) =>
            setFilters((prev) => ({ ...prev, attributes: toggleInSet(prev.attributes, key) }))
          }
        />
        
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={`${searchShellClass} flex h-[2.75rem] items-center px-3`}>
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索物品或 #主题…"
              value={filters.searchName}
              onChange={(e) => setFilters(prev => ({ ...prev, searchName: e.target.value }))}
              className={`${searchInputClass} ml-2`}
            />
          </div>
          <TagFilterInput
            tags={tags}
            selectedIds={filters.tagIds}
            noTag={filters.noTag}
            onChange={(tagIds) => setFilters((prev) => ({ ...prev, tagIds, noTag: false }))}
            onToggleNoTag={() => setFilters((prev) => ({ ...prev, noTag: !prev.noTag, tagIds: [] }))}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            显示 {visibleCards.length} / {cards.length} 种
          </span>
          {hasActiveFilters(filters) && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 transition hover:text-teal-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清除筛选
            </button>
          )}
        </div>
      </div>

      {(error || actionError || tagsError) && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError ?? error ?? `主题加载失败：${tagsError}`}</span>
          {error && (
            <button onClick={() => void reload()} className="font-medium underline underline-offset-2">
              重试
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">正在加载…</span>
        </div>
      ) : cards.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-slate-500">
          <Package className="h-10 w-10 text-slate-300" />
          <p className="text-sm">还没有物品，去「录入」页面添加第一件吧。</p>
        </div>
      ) : visibleCards.length === 0 ? (
        <p className="py-20 text-center text-sm text-slate-500">没有符合筛选条件的物品。</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 items-start">
            {displayedCards.map((card) => (
              <CardListItem
                key={card.id}
                card={card}
                stock={stockOf(card.id)}
                busy={busyId === card.id}
                onAdjustQuantity={(delta) => handleAdjustQuantity(card, delta)}
                onEdit={() => setEditingCard(card)}
                onStartOrder={() => startOrderFromCard(card)}
                readOnly={readOnly}
              />
            ))}
          </ul>

          {visibleCount < visibleCards.length && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="rounded-full bg-white border border-slate-200 px-8 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 active:scale-95"
              >
                加载更多 (还有 {visibleCards.length - visibleCount} 件)
              </button>
            </div>
          )}
        </>
      )}

      {editingCard && (
        <CardEditDialog
          card={editingCard}
          reserved={editingReserved}
          openOrders={editingOpenOrders}
          allTags={tags}
          onTagCreated={() => void reloadTags()}
          onClose={() => setEditingCard(null)}
          onChanged={() => {
            setEditingCard(null);
            void reload();
          }}
          onDuplicate={(prefill) => {
            setEditingCard(null);
            onDuplicate(prefill);
          }}
        />
      )}
    </section>
  );
}