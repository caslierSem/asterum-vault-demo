import { useState } from 'react';
import { ArrowLeftRight, Hash, ImageOff, MapPin, Minus, Pencil, Plus, StickyNote } from 'lucide-react';
import { formatPrice, getCardImageUrl, getDisplayName, type Card } from '@/lib/cards';
import { getCardStatusBadge } from '@/lib/cardStatus';
import type { CardStock } from '@/lib/useInventory';
import CardNoteDialog from '@/components/CardNoteDialog';

const stepButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none';

const iconButtonClass =
  'rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50';

interface CardListItemProps {
  card: Card;
  stock: CardStock;
  busy: boolean;
  onAdjustQuantity: (delta: 1 | -1) => void;
  onEdit: () => void;
  onStartOrder: () => void;
  readOnly: boolean;
}

function StockFigure({ label, value, tone }: { label: string; value: number; tone: string }) {
  const isZero = value === 0;
  return (
    <div className="flex flex-1 items-baseline justify-center gap-1 border-r border-slate-200 last:border-0">
      <span className={`whitespace-nowrap text-[11px] ${isZero ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${isZero ? 'text-slate-300' : tone}`}>
        {value}
      </span>
    </div>
  );
}

export default function CardListItem({
  card,
  stock,
  busy,
  onAdjustQuantity,
  onEdit,
  onStartOrder,
  readOnly,
}: CardListItemProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const displayName = getDisplayName(card);
  const hasNotes = card.notes.trim() !== '';
  // 统一从 cardStatus.ts 计算状态徽标（文案、星号规则与全站保持一致）
  const statusBadge = getCardStatusBadge(card.target_quantity, stock);

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row">
      <div className="relative flex h-40 shrink-0 items-center justify-center bg-slate-100 sm:aspect-[2/3] sm:h-auto sm:w-32 sm:self-stretch lg:aspect-[5/8] lg:w-36">
        {card.image_path ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-slate-200 animate-pulse" />}
            <img
              src={getCardImageUrl(card.image_path)}
              alt={displayName}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={`absolute inset-0 h-full w-full object-cover object-[center_15%] transition-opacity duration-300 sm:object-contain sm:object-center ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <ImageOff className="h-6 w-6 text-slate-400" />
        )}
        {(card.is_special || card.is_defective) && (
          <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
            {card.is_special && (
              <span
                aria-label="特典卡"
                className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-[11px] font-bold leading-none text-white shadow"
              >
                特
              </span>
            )}
            {card.is_defective && (
              <span
                aria-label="瑕卡"
                className="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-[11px] font-bold leading-none text-white shadow"
              >
                瑕
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:text-base">
            {displayName}
          </h2>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadge.colorClass}`}
            >
              {statusBadge.label}
            </span>
            {!readOnly && (
              <div className="flex shrink-0 items-center">
                {hasNotes && (
                  <button
                    onClick={() => setShowNotes(true)}
                    aria-label={`查看 ${displayName} 的备注`}
                    title="查看备注"
                    className={`${iconButtonClass} hover:bg-amber-50 hover:text-amber-700`}
                  >
                    <StickyNote className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={onStartOrder}
                  disabled={busy}
                  aria-label={`为 ${displayName} 发起交易`}
                  title="发起交易"
                  className={`${iconButtonClass} hover:bg-teal-50 hover:text-teal-700`}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
                <button
                  onClick={onEdit}
                  disabled={busy}
                  aria-label={`编辑 ${displayName}`}
                  title="编辑"
                  className={iconButtonClass}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {card.tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-start gap-0.5 text-xs font-medium text-emerald-700">
                <Hash className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0">{tag.name}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-2 text-sm text-slate-600">
          {readOnly ? (
            <p className="font-semibold text-slate-900">库存 {card.quantity}</p>
          ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 whitespace-nowrap">库存</span>
            <div className="flex min-w-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5 lg:gap-0.5">
              <button
                onClick={() => onAdjustQuantity(-1)}
                disabled={busy || card.quantity <= stock.reserved}
                aria-label={`减少 ${displayName} 数量`}
                className={`${stepButtonClass} lg:h-7 lg:w-7`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[1.5rem] text-center font-semibold tabular-nums text-slate-900">
                {card.quantity}
              </span>
              <button
                onClick={() => onAdjustQuantity(1)}
                disabled={busy}
                aria-label={`增加 ${displayName} 数量`}
                className={`${stepButtonClass} lg:h-7 lg:w-7`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          )}

          <div className="flex items-center rounded-lg bg-slate-50 py-2">
            <StockFigure label="可用" value={stock.available} tone="text-emerald-700" />
            <StockFigure label="在途" value={stock.reserved} tone="text-amber-700" />
            <StockFigure label="待入库" value={stock.pendingIn} tone="text-sky-700" />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">目标 {card.target_quantity}</span>
            <span className="font-medium text-slate-900">{formatPrice(card.price)}</span>
          </div>

          {card.location && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{card.location}</span>
            </div>
          )}
        </div>
      </div>

      {showNotes && (
        <CardNoteDialog title={displayName} notes={card.notes} onClose={() => setShowNotes(false)} />
      )}
    </li>
  );
}