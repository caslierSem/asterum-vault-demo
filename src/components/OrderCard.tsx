import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle, Pencil, MessageSquare } from 'lucide-react';
import { formatPrice, getCardImageUrl, getDisplayName } from '@/lib/cards';
import type { LineDirection, Order, OrderLine, OrderStatus } from '@/lib/orders';
import CardThumbnail from '@/components/CardThumbnail';
import OrderEditMetaDialog from '@/components/OrderEditMetaDialog';

const STATUS_STYLES: Record<OrderStatus, string> = {
  约换中: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  已完成: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  已取消: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function LineGroup({ title, lines, tone }: { title: LineDirection; lines: OrderLine[]; tone: string }) {
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="min-w-0 flex-1">
      {/* 去掉了灰底，改成普通文字标签 */}
      <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${tone}`}>
        <span>{title}</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
          {lines.length} 种 / {total} 件
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-400 py-1">无</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => {
            const displayName = getDisplayName({
              name: line.card_name,
              is_defective: line.card?.is_defective ?? false,
              is_special: line.card?.is_special ?? false,
            });
            return (
              <li key={line.id} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <CardThumbnail
                    imageUrl={line.card?.image_path ? getCardImageUrl(line.card.image_path) : null}
                    name={displayName}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-slate-800">{displayName}</span>
                    {line.card && (
                      <span className="text-[11px] text-slate-400">单价：{formatPrice(line.card.price)}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-slate-50 px-1.5 py-0.5 text-sm font-semibold tabular-nums text-slate-700">
                  ×{line.quantity}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  busy: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onRefresh: () => void;
}

export default function OrderCard({ order, busy, onComplete, onCancel, onRefresh }: OrderCardProps) {
  const [showEdit, setShowEdit] = useState(false);

  const outLines = order.lines.filter((line) => line.direction === '流出');
  const inLines = order.lines.filter((line) => line.direction === '流入');
  const isOpen = order.status === '约换中';

  return (
    <>
      <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
        
        {/* 头部：名字、编辑、状态 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-900">
                {order.counterparty || '未填写交易对象'}
              </h3>
              {isOpen && (
                <button
                  onClick={() => setShowEdit(true)}
                  disabled={busy}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-teal-600 disabled:opacity-50"
                  title="编辑名字或备注"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              创建于 {formatDate(order.created_at)}
              {order.completed_at && ` ｜ 完成于 ${formatDate(order.completed_at)}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[order.status]}`}>
            {order.status}
          </span>
        </div>

        {/* 备注区：弱化为普通文字+图标，去掉黄色表单感 */}
        {order.note && (
          <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 border border-slate-100">
            <MessageSquare className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
            <span className="break-all">{order.note}</span>
          </div>
        )}

        {/* 明细区：去掉灰色底块，改用极简分割线 */}
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:gap-6">
          <LineGroup title="流出" lines={outLines} tone="text-amber-700" />
          {/* PC端竖线 */}
          <div className="hidden sm:block w-px bg-slate-200 shrink-0" />
          {/* 手机端横线 */}
          <div className="sm:hidden h-px w-full bg-slate-100" />
          <LineGroup title="流入" lines={inLines} tone="text-emerald-700" />
        </div>

        {/* 操作区 */}
        {isOpen && (
          <div className="mt-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              取消交易
            </button>
            <button
              onClick={onComplete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              完成交易
            </button>
          </div>
        )}
      </li>

      {showEdit && (
        <OrderEditMetaDialog
          order={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}