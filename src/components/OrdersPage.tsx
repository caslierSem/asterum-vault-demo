import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Loader2, PlusCircle, ReceiptText, Search } from 'lucide-react';
import { primaryButtonClass, searchShellClass, searchInputClass } from '@/lib/formStyles';
import {
  cancelOrder,
  completeOrder,
  listOrders,
  ORDER_STATUSES,
  type Order,
  type OrderDraft,
  type OrderDraftRequest,
  type OrderStatus,
} from '@/lib/orders';
import { useInventory } from '@/lib/useInventory';
import CancelOrderDialog from '@/components/CancelOrderDialog';
import OrderCard from '@/components/OrderCard';
import OrderForm from '@/components/OrderForm';
import ConfirmDialog from '@/components/ConfirmDialog';

interface OrdersPageProps {
  initialRequest: OrderDraftRequest | null;
}

const EMPTY_TEXT: Record<OrderStatus, string> = {
  约换中: '目前没有约换中的订单。',
  已完成: '还没有已完成的订单。',
  已取消: '还没有已取消的订单。',
};

function draftFromOrder(order: Order): { draft: OrderDraft; skipped: number } {
  const restorable = order.lines.filter((line) => line.card_id !== null);
  return {
    draft: {
      counterparty: order.counterparty,
      note: order.note,
      lines: restorable.map((line) => ({
        cardId: line.card_id as string,
        direction: line.direction,
        quantity: line.quantity,
      })),
    },
    skipped: order.lines.length - restorable.length,
  };
}

export default function OrdersPage({ initialRequest }: OrdersPageProps) {
  const { cards, stocks, loading: invLoading, error: invError, reload: reloadInventory } = useInventory();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<OrderStatus>('约换中');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftRequest, setDraftRequest] = useState<OrderDraftRequest | null>(initialRequest);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null);

  const reloadOrders = useCallback(async () => {
    try {
      const nextOrders = await listOrders();
      setOrders(nextOrders);
      setOrdersError(null);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  const reload = useCallback(async () => {
    await Promise.all([reloadInventory(), reloadOrders()]);
  }, [reloadInventory, reloadOrders]);

  const loading = invLoading || ordersLoading;
  const error = invError ?? ordersError;

  const runOrderAction = async (orderId: string, action: () => Promise<void>) => {
    setBusyId(orderId);
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setBusyId(null);
    }
  };

  const handleCompleteClick = (order: Order) => {
    setCompleteTarget(order);
  };

  const confirmComplete = () => {
    if (!completeTarget) return;
    setCompleteTarget(null);
    void runOrderAction(completeTarget.id, () => completeOrder(completeTarget.id));
  };

  const handleCancelOnly = (order: Order) => {
    setCancelTarget(null);
    void runOrderAction(order.id, () => cancelOrder(order.id));
  };

  const handleCancelAndCopy = async (order: Order) => {
    setBusyId(order.id);
    setActionError(null);
    try {
      await cancelOrder(order.id);
      setCancelTarget(null);
      await reload();
      const { draft, skipped } = draftFromOrder(order);
      const skippedNote =
        skipped > 0 ? `其中 ${skipped} 行物品已从库存中删除，未能带入。` : '';
      setDraftRequest({
        draft,
        notice: `原订单已取消，在途已释放。新单已预填原内容，请确认后保存。${skippedNote}如果保存失败，原订单仍保持取消状态。`,
      });
    } catch (err) {
      setCancelTarget(null);
      setActionError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setBusyId(null);
    }
  };


  if (draftRequest) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">新建订单</h1>
          <p className="mt-1 text-sm text-slate-500">
            把物品加入流出或流入清单，一个包裹可以包含多件物品。
          </p>
        </div>
        <OrderForm
          initialDraft={draftRequest.draft}
          notice={draftRequest.notice}
          cards={cards}
          stocks={stocks}
          onCancel={() => setDraftRequest(null)}
          onCreated={() => {
            setDraftRequest(null);
            void reload();
          }}
        />
      </section>
    );
  }

  const grouped = ORDER_STATUSES.map((status) => ({
    status,
    items: orders.filter((order) => order.status === status),
  }));

  const keyword = searchQuery.trim().toLowerCase();
  const currentItems = grouped.find((group) => group.status === statusFilter)?.items ?? [];
  
  const visible = currentItems.filter((order) => {
    if (!keyword) return true;
    if (order.counterparty?.toLowerCase().includes(keyword)) return true;
    if (order.note?.toLowerCase().includes(keyword)) return true;
    return order.lines.some((line) => {
      const cardName = line.card_name || '';
      return cardName.toLowerCase().includes(keyword);
    });
  });

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">订单</h1>
          <p className="mt-1 text-sm text-slate-500">
            每个包裹就是一笔订单，完成后库存自动更新。
          </p>
        </div>
        <button onClick={() => setDraftRequest({ draft: { counterparty: '', note: '', lines: [] }, notice: null })} className={primaryButtonClass}>
          <PlusCircle className="h-4 w-4" />
          新建订单
        </button>
      </div>

      <div role="tablist" aria-label="订单状态" className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
        {grouped.map(({ status, items }) => {
          const active = status === statusFilter;
          return (
            <button
              key={status}
              role="tab"
              aria-selected={active}
              onClick={() => setStatusFilter(status)}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {status}
              <span className={`rounded-full px-2 text-xs tabular-nums ${active ? 'bg-teal-50 text-teal-700' : 'bg-slate-200/70 text-slate-500'}`}>
                {items.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`${searchShellClass} mb-6 flex h-[2.75rem] w-full items-center px-3`}>
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索交易对象、备注或卡名…"
          className={`${searchInputClass} ml-2`}
        />
      </div>

      {(error || actionError) && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError ? `操作失败：${actionError}` : `加载失败：${error}`}</span>
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
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-slate-500">
          <ReceiptText className="h-10 w-10 text-slate-300" />
          <p className="text-sm">
            {keyword ? '没有找到匹配该关键词的订单。' : EMPTY_TEXT[statusFilter]}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              onComplete={() => handleCompleteClick(order)}
              onCancel={() => setCancelTarget(order)}
              onRefresh={() => void reload()}
            />
          ))}
        </ul>
      )}

      {cancelTarget && (
        <CancelOrderDialog
          counterparty={cancelTarget.counterparty}
          busy={busyId === cancelTarget.id}
          onClose={() => setCancelTarget(null)}
          onCancelOnly={() => handleCancelOnly(cancelTarget)}
          onCancelAndCopy={() => void handleCancelAndCopy(cancelTarget)}
        />
      )}

      {/* 替换原生 window.confirm */}
      {completeTarget && (
        <ConfirmDialog
          title="完成交易"
          confirmText="确认完成"
          busy={busyId === completeTarget.id}
          message={
            <span className="block">
              确认完成这笔交易吗？流出物品会从库存扣除，流入物品会加入库存。此操作会直接更新你的真实库存数据。
            </span>
          }
          onConfirm={confirmComplete}
          onCancel={() => setCompleteTarget(null)}
        />
      )}
    </section>
  );
}