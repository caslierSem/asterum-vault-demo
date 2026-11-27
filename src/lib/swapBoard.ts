import { getMissing, getSurplus, type Card } from '@/lib/cards';
import type { CardStock } from '@/lib/useInventory';

/** 海报上一张卡的展示数量（富余或缺少） */
export interface BoardItem {
  card: Card;
  count: number;
}

export type BoardGroup = [string, BoardItem[]];

/**
 * 获取固定北京东八区（UTC+8）的当前时间戳，精确到分钟
 */
export function formatBeijingTimestamp(date: Date = new Date()): string {
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
 * 按主题权重把库存分成 HAVE（富余）与 WANT（缺少）。
 * 已凑齐的卡片不进入任一栏。
 */
export function buildHaveWantGroups(
  cards: Card[],
  stocks: Map<string, CardStock>,
  tagRank: Map<string, number>,
): { haveGroups: BoardGroup[]; wantGroups: BoardGroup[] } {
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

  const sortGroups = (map: Map<string, { rank: number; items: BoardItem[] }>): BoardGroup[] =>
    Array.from(map.entries())
      .sort((a, b) => a[1].rank - b[1].rank || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([name, data]) => [name, data.items]);

  return { haveGroups: sortGroups(hGroups), wantGroups: sortGroups(wGroups) };
}

/** 有自定义顺序时按该顺序取分组，否则保持默认排序 */
export function applyGroupOrder(groups: BoardGroup[], customOrder: string[]): BoardGroup[] {
  if (customOrder.length === 0) return groups;
  return customOrder
    .map((name) => groups.find((g) => g[0] === name))
    .filter(Boolean) as BoardGroup[];
}

/**
 * 将分组与相邻项交换。到边界或找不到分组时返回 null，调用方不写入状态。
 */
export function moveGroupInOrder(
  direction: -1 | 1,
  groupName: string,
  currentOrder: string[],
  defaultGroups: BoardGroup[],
): string[] | null {
  const order = currentOrder.length > 0 ? [...currentOrder] : defaultGroups.map((g) => g[0]);
  const index = order.indexOf(groupName);
  if (index === -1 || (direction === -1 && index === 0) || (direction === 1 && index === order.length - 1)) {
    return null;
  }

  const temp = order[index];
  order[index] = order[index + direction];
  order[index + direction] = temp;
  return order;
}
