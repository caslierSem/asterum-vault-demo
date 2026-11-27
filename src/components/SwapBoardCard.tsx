import { CheckSquare, Square } from 'lucide-react';
import { formatPrice, getCardImageUrl, getDisplayName } from '@/lib/cards';
import type { BoardItem } from '@/lib/swapBoard';

interface SwapBoardCardProps {
  item: BoardItem;
  showPrice: boolean;
  isScreenshotMode: boolean;
  isExcluded: boolean;
  onToggle: () => void;
  isExport: boolean;
}

/**
 * 海报中的单张物品展示卡片组件
 * data-export-card-id={isExport ? item.card.id : undefined}，方便导出瞬间精准测量每张卡在画布上的位置
 */
export default function SwapBoardCard({ item, showPrice, isScreenshotMode, isExcluded, onToggle, isExport }: SwapBoardCardProps) {
  return (
    <div className={`w-full max-w-[160px] mx-auto group relative flex flex-col gap-1.5 transition-opacity ${isExcluded ? 'opacity-20 grayscale' : 'opacity-100'}`}>
      <div
        data-export-card-id={isExport ? item.card.id : undefined}
        className="relative w-full h-[213px] overflow-hidden rounded-lg bg-white border border-slate-200 shadow-sm"
      >
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
}
