import { supabase } from '@/lib/supabase';
import { toUserError } from '@/lib/dbError';

export const ORDER_STATUSES = ['约换中', '已完成', '已取消'] as const;
export const LINE_DIRECTIONS = ['流出', '流入'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type LineDirection = (typeof LINE_DIRECTIONS)[number];

export interface CardSnapshot {
  image_path: string | null;
  price: number;
  is_defective: boolean;
  is_special: boolean;
}

export interface OrderLine {
  id: string;
  card_id: string | null;
  card_name: string;
  direction: LineDirection;
  quantity: number;
  card: CardSnapshot | null;
}

export interface Order {
  id: string;
  counterparty: string;
  note: string;
  status: OrderStatus;
  created_at: string;
  completed_at: string | null;
  lines: OrderLine[];
}

export interface OrderDraftLine {
  cardId: string;
  direction: LineDirection;
  quantity: number;
}

export interface OrderDraft {
  counterparty: string;
  note: string;
  lines: OrderDraftLine[];
}

export interface OrderDraftRequest {
  draft: OrderDraft;
  notice: string | null;
}

interface OrderLineRow extends Omit<OrderLine, 'card'> {
  cards: CardSnapshot | null;
}

interface OrderRow extends Omit<Order, 'lines' | 'counterparty' | 'note'> {
  counterparty?: string;
  note?: string;
  order_lines: OrderLineRow[];
}

const ORDER_LINE_SELECT =
  'order_lines(id, card_id, card_name, direction, quantity, cards(image_path, price, is_defective, is_special))';

// 未登入的访客只能读取库存计算所需的字段，交易对象与备注不会下发。
const ORDER_SELECT_OWNER = `*, ${ORDER_LINE_SELECT}`;
const ORDER_SELECT_PUBLIC = `id, status, created_at, completed_at, ${ORDER_LINE_SELECT}`;

export async function listOrders(): Promise<Order[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const select = sessionData.session ? ORDER_SELECT_OWNER : ORDER_SELECT_PUBLIC;
  const { data, error } = await supabase
    .from('orders')
    .select(select)
    .order('created_at', { ascending: false });
  if (error) throw toUserError(error);
  return ((data ?? []) as unknown as OrderRow[]).map(({ order_lines, ...order }) => ({
    ...order,
    counterparty: order.counterparty ?? '',
    note: order.note ?? '',
    lines: order_lines.map(({ cards, ...line }) => ({ ...line, card: cards })),
  }));
}

/**
 * 仅查询“约换中”的活跃订单（供库存计算使用，避免拉取海量历史订单）
 */
export async function listActiveOrders(): Promise<Order[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const select = sessionData.session ? ORDER_SELECT_OWNER : ORDER_SELECT_PUBLIC;
  const { data, error } = await supabase
    .from('orders')
    .select(select)
    .eq('status', '约换中')
    .order('created_at', { ascending: false });
  if (error) throw toUserError(error);
  return ((data ?? []) as unknown as OrderRow[]).map(({ order_lines, ...order }) => ({
    ...order,
    counterparty: order.counterparty ?? '',
    note: order.note ?? '',
    lines: order_lines.map(({ cards, ...line }) => ({ ...line, card: cards })),
  }));
}

export async function createOrder(draft: OrderDraft): Promise<void> {
  const { error } = await supabase.rpc('create_order', {
    p_counterparty: draft.counterparty,
    p_note: draft.note,
    p_lines: draft.lines.map((line) => ({
      card_id: line.cardId,
      direction: line.direction,
      quantity: line.quantity,
    })),
  });
  if (error) throw toUserError(error);
}

export async function completeOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_order', { p_order_id: orderId });
  if (error) throw toUserError(error);
}

export async function cancelOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
  if (error) throw toUserError(error);
}

/**
 * 仅更新订单的“交易对象”和“备注”两个基础信息字段。
 * ⚠️ 防呆限制：不包含任何订单明细、库存数量或状态修改的逻辑。
 */
export async function updateOrderMeta(orderId: string, counterparty: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ 
      // 防呆处理：强制转为空字符串，防止存入 null 导致前端渲染异常
      counterparty: counterparty.trim(), 
      note: note.trim() 
    })
    .eq('id', orderId);
  
  if (error) throw toUserError(error);
}