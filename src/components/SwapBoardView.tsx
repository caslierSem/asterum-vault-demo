import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, ChevronUp, ChevronDown, Download, Loader2, Pencil, Stamp, Check } from 'lucide-react';
import { type Card } from '@/lib/cards';
import { buildTagRank, type TagRecord } from '@/lib/tags';
import { type CardStock } from '@/lib/useInventory';
import { useBoardExport } from '@/lib/useBoardExport';
import {
  applyGroupOrder,
  buildHaveWantGroups,
  formatBeijingTimestamp,
  moveGroupInOrder,
  type BoardGroup,
} from '@/lib/swapBoard';
import {
  hasWatermarkText,
  loadBoardTitle,
  loadWatermarkConfig,
  saveBoardTitle,
  saveWatermarkConfig,
  type WatermarkConfig,
} from '@/lib/watermark';
import SwapBoardCard from '@/components/SwapBoardCard';
import WatermarkOverlay from '@/components/WatermarkOverlay';
import WatermarkSettingsDialog from '@/components/WatermarkSettingsDialog';
import { inputClass } from '@/lib/formStyles';

interface SwapBoardViewProps {
  cards: Card[];
  stocks: Map<string, CardStock>;
  tags: TagRecord[];
  onClose: () => void;
}

export default function SwapBoardView({ cards, stocks, tags, onClose }: SwapBoardViewProps) {
  const [excludedCards, setExcludedCards] = useState<Set<string>>(new Set());
  const [isScreenshotMode, setIsScreenshotMode] = useState(false);
  const [viewMode, setViewMode] = useState<'both' | 'have' | 'want'>('both');
  const [showPrice, setShowPrice] = useState(false);

  // 复用抽离后的海报图片预加载与导出逻辑
  const { exportRef, isExporting, exportStatus, triggerExport } = useBoardExport();

  const [customHaveOrder, setCustomHaveOrder] = useState<string[]>([]);
  const [customWantOrder, setCustomWantOrder] = useState<string[]>([]);
  const [boardTitle, setBoardTitle] = useState(loadBoardTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [watermark, setWatermark] = useState<WatermarkConfig>(loadWatermarkConfig);
  const [isWatermarkDialogOpen, setIsWatermarkDialogOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleBlurRef = useRef(false);

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

  const { haveGroups, wantGroups } = useMemo(
    () => buildHaveWantGroups(cards, stocks, tagRank),
    [cards, stocks, tagRank],
  );

  const moveGroup = (
    direction: -1 | 1,
    groupName: string,
    currentOrder: string[],
    defaultGroups: BoardGroup[],
    setOrder: (order: string[]) => void,
  ) => {
    const next = moveGroupInOrder(direction, groupName, currentOrder, defaultGroups);
    if (next) setOrder(next);
  };

  // 收集当前所有未被排除的展示卡片并触发导出
  const handleExport = () => {
    const visibleCards = [...haveGroups, ...wantGroups]
      .flatMap(([, items]) => items)
      .filter((item) => !excludedCards.has(item.card.id))
      .map((item) => item.card);

    const safeName = boardTitle.replace(/[\\/:*?"<>|]/g, '_');
    void triggerExport(visibleCards, `${safeName}.jpg`);
  };

  useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  const commitTitle = (raw: string) => {
    const next = saveBoardTitle(raw);
    setBoardTitle(next);
    setTitleDraft(next);
    setIsEditingTitle(false);
  };

  const beginEditTitle = () => {
    setTitleDraft(boardTitle);
    setIsEditingTitle(true);
  };

  const handleSaveWatermark = (config: WatermarkConfig) => {
    saveWatermarkConfig(config);
    setWatermark(config);
    setIsWatermarkDialogOpen(false);
  };
  const renderGroups = (
    groups: BoardGroup[],
    customOrder: string[],
    setOrder: (order: string[]) => void,
    isExport: boolean = false,
  ) => {
    const displayGroups = applyGroupOrder(groups, customOrder);

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
                  <SwapBoardCard
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

  // 以渲染函数而非内部组件输出海报内容，避免父级草稿 state 更新时整树卸载导致输入框失焦
  const renderBoardContent = (isExport: boolean) => (
    <>
      <div className="mb-8 text-center">
        {isEditingTitle && !isExport && !isScreenshotMode ? (
          <div className="mx-auto flex max-w-md items-center gap-2">
            <input
              ref={titleInputRef}
              value={titleDraft}
              maxLength={40}
              aria-label="海报主标题"
              className={`${inputClass} text-center text-2xl font-bold tracking-widest`}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (skipTitleBlurRef.current) {
                  skipTitleBlurRef.current = false;
                  return;
                }
                commitTitle(titleDraft);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  skipTitleBlurRef.current = true;
                  setTitleDraft(boardTitle);
                  setIsEditingTitle(false);
                }
              }}
            />
            <button
              type="button"
              title="确认标题"
              aria-label="确认标题"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm hover:bg-teal-800"
              onMouseDown={(event) => {
                event.preventDefault();
                skipTitleBlurRef.current = true;
                commitTitle(titleDraft);
              }}
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-2xl font-bold tracking-widest text-slate-900">{boardTitle}</h1>
            {!isScreenshotMode && !isExport && (
              <button
                type="button"
                onClick={beginEditTitle}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="编辑标题"
                aria-label="编辑海报主标题"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
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
        <div className="sticky top-0 z-50 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-8">
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
              type="button"
              onClick={() => setIsWatermarkDialogOpen(true)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              title="水印"
              aria-label="水印设置"
            >
              <Stamp className="h-4 w-4" />
              {hasWatermarkText(watermark) && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal-600" />
              )}
            </button>
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

      <div className={`relative mx-auto px-4 pt-8 sm:px-8 max-w-7xl ${isExporting ? 'hidden' : 'block'}`}>
        {renderBoardContent(false)}
        <WatermarkOverlay config={watermark} />
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
        className={`relative w-[1400px] bg-white p-8 pb-20 ${isExporting ? 'block' : 'hidden'}`}
      >
        {renderBoardContent(true)}
        <WatermarkOverlay config={watermark} />
      </div>

      {isWatermarkDialogOpen && (
        <WatermarkSettingsDialog
          initialConfig={watermark}
          onSave={handleSaveWatermark}
          onCancel={() => setIsWatermarkDialogOpen(false)}
        />
      )}
    </div>
  );
}
