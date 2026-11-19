import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCards, type Card } from '@/lib/cards';
import { listActiveOrders, type Order } from '@/lib/orders';

export interface CardStock {
  quantity: number;
  reserved: number;
  pendingIn: number;
  available: number;
  openOrders: number;
}

export function computeCardStocks(cards: Card[], orders: Order[]): Map<string, CardStock> {
  const reserved = new Map<string, number>();
  const pendingIn = new Map<string, number>();
  const openOrders = new Map<string, number>();

  for (const order of orders) {
    if (order.status !== '约换中') continue;
    for (const line of order.lines) {
      if (!line.card_id) continue;
      const bucket = line.direction === '流出' ? reserved : pendingIn;
      bucket.set(line.card_id, (bucket.get(line.card_id) ?? 0) + line.quantity);
      openOrders.set(line.card_id, (openOrders.get(line.card_id) ?? 0) + 1);
    }
  }

  const stocks = new Map<string, CardStock>();
  for (const card of cards) {
    const locked = reserved.get(card.id) ?? 0;
    stocks.set(card.id, {
      quantity: card.quantity,
      reserved: locked,
      pendingIn: pendingIn.get(card.id) ?? 0,
      available: card.quantity - locked,
      openOrders: openOrders.get(card.id) ?? 0,
    });
  }
  return stocks;
}

export function useInventory() {
  const [cards, setCards] = useState<Card[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextCards, nextActiveOrders] = await Promise.all([listCards(), listActiveOrders()]);
      setCards(nextCards);
      setActiveOrders(nextActiveOrders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stocks = useMemo(() => computeCardStocks(cards, activeOrders), [cards, activeOrders]);

  return { cards, stocks, loading, error, reload };
}
