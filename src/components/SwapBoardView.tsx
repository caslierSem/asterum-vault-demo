import { useState, useMemo } from 'react';
import { ArrowLeft, Eye, EyeOff, CheckSquare, Square, ChevronUp, ChevronDown, Download, Loader2 } from 'lucide-react';
import {
  type Card,
  getCardImageUrl,
  getDisplayName,
  formatPrice,
  getSurplus,
  getMissing,
} from '@/lib/cards';
import { buildTagRank, type TagRecord } from '@/lib/tags';
import { type CardStock } from '@/lib/useInventory';
import { useBoardExport } from '@/lib/useBoardExport';

interface SwapBoardViewProps {
  cards: Card[];
  stocks: Map<string, CardStock>;
  tags: TagRecord[];
  onClose: () => void;
}

interface BoardItem {
  card: Card;
  count: number;
}

interface CardBlockProps {
  item: BoardItem;
  showPrice: boolean;
  isScreenshotMode: boolean;
  isExcluded: boolean;
  onToggle: () => void;
  isExport: boolean;
}

/**
 * 获取固定北京东八区（UTC+8）的当前时间戳，精确到分钟
 */
function formatBeijingTimestamp(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (UTC+8)`;
}

/**
 * 海报中的单张物品展示卡片组件
 */
const CardBlock = ({ item, showPrice, isScreenshotMode, isExcluded, onToggle, isExport }: CardBlockProps) => (
  <div className={`w-full max-w-[160px] mx-auto group relative flex flex-col gap-1.5 transition-opacity ${isExcluded ? 'opacity-20 grayscale' : 'opacity-100'}`}>
    <div className="relative w-full h-[213px] overflow-hidden rounded-lg bg-white border border-slate-200 shadow-sm">
      {item.card.image_path ? (
        <img src={getCardImageUrl(item.card.image_path)} className="h-full w-full object-cover object-top" crossOrigin="anonymous" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-400">无图</div>
      )}

      {!isScreenshotMode && !isExport && (
        <button onClick={onToggle} className="absolute left-1 top-1 rounded bg-white/90 shadow-sm transition hover:scale-110">
          {isExcluded ? <Square className="h-5 w-5 text-slate-400" /> : <CheckSquare className="h-5 w-5 text-teal-600" />}
        </button>
      )}

      <div className="absolute right-1 top-1 flex flex-col gap-1 items-end">
        {item.card.is_special && <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-[11px] font-bold text-white shadow">特</span>}
        {item.card.is_defective && <span className="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-[11px] font-bold text-white shadow">瑕</span>}
      </div>

      <div className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2.5 py-1 text-base font-bold text-white shadow-lg backdrop-blur-sm">
        ×{item.count}
      </div>
    </div>

    <div className="flex flex-col items-center px-0.5 gap-0.5">
      <p className="truncate w-full text-center text-[13px] font-medium text-slate-900" title={getDisplayName(item.card)}>
        {getDisplayName(item.card)}
      </p>
      {showPrice && (
        <p className="text-[11px] font-semibold text-slate-600">
          {formatPrice(item.card.price)}
        </p>
      )}
    </div>
  </div>
);

export default function SwapBoardView({ cards, stocks, tags, onClose }: SwapBoardViewProps) {
  const [excludedCards, setExcludedCards] = useState<Set<string>>(new Set());
  const [isScreenshotMode, setIsScreenshotMode] = useState(false);
  const [viewMode, setViewMode] = useState<'both' | 'have' | 'want'>('both');
  const [showPrice, setShowPrice] = useState(false);

  // 复用抽离后的海报图片预加载与导出逻辑
  const { exportRef, isExporting, exportStatus, triggerExport } = useBoardExport();

  const [customHaveOrder, setCustomHaveOrder] = useState<string[]>([]);
  const [customWantOrder, setCustomWantOrder] = useState<string[]>([]);

  const toggleExclude = (id: string) => {
    setExcludedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // 复用全站统一的 Tag 权重顺序，确保海报默认排序与库存列表完全一致
  const tagRank = useMemo(() => buildTagRank(tags), [tags]);

  const { haveGroups, wantGroups } = useMemo(() => {
    const hGroups = new Map<string, { rank: number; items: BoardItem[] }>();
    const wGroups = new Map<string, { rank: number; items: BoardItem[] }>();

    cards.forEach((card) => {
      const stock = stocks.get(card.id) || { available: 0, pendingIn: 0 };
      const surplus = getSurplus(stock.available, stock.pendingIn, card.target_quantity);
      const missing = getMissing(stock.available, stock.pendingIn, card.target_quantity);

      if (surplus === 0 && missing === 0) return;

      const sortedTags = [...card.tags].sort(
        (a, b) => (tagRank.get(a.id) ?? Infinity) - (tagRank.get(b.id) ?? Infinity),
      );
      const groupName = sortedTags.length > 0
        ? sortedTags.map((t) => `# ${t.name}`).join(' · ')
        : '无主题';
      const groupRank = sortedTags.length > 0
        ? (tagRank.get(sortedTags[0].id) ?? Infinity)
        : Infinity;

      if (surplus > 0) {
        const entry = hGroups.get(groupName) ?? { rank: groupRank, items: [] };
        entry.items.push({ card, count: surplus });
        hGroups.set(groupName, entry);
      } else if (missing > 0) {
        const entry = wGroups.get(groupName) ?? { rank: groupRank, items: [] };
        entry.items.push({ card, count: missing });
        wGroups.set(groupName, entry);
      }
    });

    const sortGroups = (map: Map<string, { rank: number; items: BoardItem[] }>): [string, BoardItem[]][] =>
      Array.from(map.entries())
        .sort((a, b) => a[1].rank - b[1].rank || a[0].localeCompare(b[0], 'zh-CN'))
        .map(([name, data]) => [name, data.items]);

    return { haveGroups: sortGroups(hGroups), wantGroups: sortGroups(wGroups) };
  }, [cards, stocks, tagRank]);

  const moveGroup = (
    direction: -1 | 1,
    groupName: string,
    currentOrder: string[],
    defaultGroups: [string, BoardItem[]][],
    setOrder: (order: string[]) => void,
  ) => {
    const order = currentOrder.length > 0 ? [...currentOrder] : defaultGroups.map((g) => g[0]);
    const index = order.indexOf(groupName);
    if (index === -1 || (direction === -1 && index === 0) || (direction === 1 && index === order.length - 1)) return;

    const temp = order[index];
    order[index] = order[index + direction];
    order[index + direction] = temp;
    setOrder(order);
  };

  // 收集当前所有未被排除的展示卡片并触发导出
  const handleExport = () => {
    const visibleCards = [...haveGroups, ...wantGroups]
      .flatMap(([, items]) => items)
      .filter((item) => !excludedCards.has(item.card.id))
      .map((item) => item.card);

    void triggerExport(visibleCards);
  };
  const renderGroups = (
    groups: [string, BoardItem[]][],
    customOrder: string[],
    setOrder: (order: string[]) => void,
    isExport: boolean = false,
  ) => {
    const displayGroups = customOrder.length > 0
      ? (customOrder.map((name) => groups.find((g) => g[0] === name)).filter(Boolean) as [string, BoardItem[]][])
      : groups;

    return (
      <div className="space-y-6">
        {displayGroups.map(([groupName, items], index) => {
          const itemsToRender = items.filter((item) => {
            if ((isExport || isScreenshotMode) && excludedCards.has(item.card.id)) return false;
            return true;
          });

          if (itemsToRender.length === 0) return null;

          return (
            <div key={groupName} className="rounded-2xl bg-slate-100 p-4 border border-slate-200 relative group/section">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="inline-block rounded-md bg-white border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {groupName}
                </h3>
                {!isScreenshotMode && !isExport && (
                  <div className="flex items-center gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                    <button onClick={() => moveGroup(-1, groupName, customOrder, groups, setOrder)} disabled={index === 0} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => moveGroup(1, groupName, customOrder, groups, setOrder)} disabled={index === displayGroups.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className={`grid gap-3 ${
                isExport
                  ? (viewMode === 'both' ? 'grid-cols-4' : 'grid-cols-6')
                  : (viewMode === 'both' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8')
              }`}>
                {itemsToRender.map((item) => (
                  <CardBlock
                    key={item.card.id}
                    item={item}
                    showPrice={showPrice}
                    isScreenshotMode={isScreenshotMode}
                    isExport={isExport}
                    isExcluded={excludedCards.has(item.card.id)}
                    onToggle={() => toggleExclude(item.card.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const BoardContent = ({ isExport }: { isExport: boolean }) => (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-widest text-slate-900">PLAVE交换清单</h1>
        <p className="mt-1 text-xs text-slate-400">Have & Want List</p>
        <p className="mt-1.5 text-[11px] font-medium tabular-nums text-slate-500">
          生成时间：{formatBeijingTimestamp()}
        </p>
      </div>

      <div className={`flex ${
        isExport
          ? 'flex-row items-start gap-8'
          : `flex-col gap-12 ${viewMode === 'both' ? 'lg:flex-row lg:items-start lg:gap-8' : ''}`
      }`}>
        {viewMode !== 'want' && (
          <div className={`flex-1 w-full ${isExport ? 'w-0 overflow-hidden' : 'overflow-hidden'}`}>
            <div className="mb-6 flex items-center gap-3 border-b-2 border-emerald-500 pb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm">✓</span>
              <h2 className="text-xl font-bold text-slate-900">HAVE / 拥有</h2>
            </div>
            {haveGroups.length === 0 ? (
              <p className="text-sm text-slate-400">暂无多余卡片</p>
            ) : renderGroups(haveGroups, customHaveOrder, setCustomHaveOrder, isExport)}
          </div>
        )}

        {(isExport || viewMode === 'both') && (
          <div className={`w-px self-stretch bg-slate-200 ${isExport ? 'block' : 'hidden lg:block'}`} />
        )}

        {viewMode !== 'have' && (
          <div className={`flex-1 w-full ${isExport ? 'w-0 overflow-hidden' : 'overflow-hidden'}`}>
            <div className="mb-6 flex items-center gap-3 border-b-2 border-rose-500 pb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-sm">!</span>
              <h2 className="text-xl font-bold text-slate-900">WANT / 想要</h2>
            </div>
            {wantGroups.length === 0 ? (
              <p className="text-sm text-slate-400">暂无缺少卡片</p>
            ) : renderGroups(wantGroups, customWantOrder, setCustomWantOrder, isExport)}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white pb-20">
      {!isScreenshotMode && (
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> 返回列表
          </button>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['both', 'have', 'want'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mode === 'both' ? '双拼展示' : mode === 'have' ? '仅看多余' : '仅看缺卡'}
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              展示价格
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
              title={isExporting ? exportStatus : '下载海报'}
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setIsScreenshotMode(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              title="纯净截图"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isScreenshotMode && (
        <div className="fixed right-4 top-4 z-50">
          <button onClick={() => setIsScreenshotMode(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur transition hover:scale-105" title="退出纯净模式">
            <Eye className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={`mx-auto px-4 pt-8 sm:px-8 max-w-7xl ${isExporting ? 'hidden' : 'block'}`}>
        <BoardContent isExport={false} />
      </div>

      {isExporting && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-6 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium text-slate-800">{exportStatus}</p>
          </div>
        </div>
      )}

      <div
        id="swap-board-export"
        ref={exportRef}
        style={{ position: 'fixed', top: 0, left: 0, zIndex: 9998 }}
        className={`w-[1400px] bg-white p-8 pb-20 ${isExporting ? 'block' : 'hidden'}`}
      >
        <BoardContent isExport={true} />
      </div>
    </div>
  );
}
