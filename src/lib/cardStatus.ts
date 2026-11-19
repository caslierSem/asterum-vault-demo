import { getMissing, getSurplus } from '@/lib/cards';
import type { CardStock } from '@/lib/useInventory';
export type CompletionStatus = 'short' | 'complete' | 'surplus';

export const COMPLETION_LABELS: Record<CompletionStatus, string> = {
  short: '未齐',
  complete: '已凑齐',
  surplus: '富余',
};

interface CompletionInput {
  target_quantity: number;
  available: number;
  pendingIn: number;
}

export function getCompletionStatus({
  target_quantity,
  available,
  pendingIn,
}: CompletionInput): CompletionStatus {
  // 总资产 = 可用实卡（已扣除在途） + 待入库
  const totalAsset = available + pendingIn;
  
  if (totalAsset > target_quantity) return 'surplus';
  if (totalAsset === target_quantity) return 'complete';
  return 'short';
}

/**
 * 物品完备度状态对应的全局胶囊徽标样式（红色缺货、绿色凑齐、蓝色富余）
 */
export const COMPLETION_STYLES: Record<CompletionStatus, string> = {
  short: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  complete: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  surplus: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

/**
 * 统一生成物品状态徽标的显示文案与样式（供库存列表、订单明细等全站组件复用）
 * @param targetQuantity 物品的目标持有数量
 * @param stock 物品当前的实时库存统计（可用、待入库、在途占用）
 */
export function getCardStatusBadge(
  targetQuantity: number,
  stock: Pick<CardStock, 'available' | 'pendingIn' | 'reserved'>,
): { label: string; colorClass: string } {
  // 计算基础完备度状态：缺货(short) / 已凑齐(complete) / 富余(surplus)
  const completion = getCompletionStatus({
    target_quantity: targetQuantity,
    available: stock.available,
    pendingIn: stock.pendingIn,
  });

  // 状态一：总资产低于目标数量，展示具体缺少件数
  if (completion === 'short') {
    const missing = getMissing(stock.available, stock.pendingIn, targetQuantity);
    return {
      label: missing > 0 ? `缺 ${missing}` : COMPLETION_LABELS[completion],
      colorClass: COMPLETION_STYLES.short,
    };
  }

  // 状态二：总资产高于目标数量，展示具体富余件数
  if (completion === 'surplus') {
    const surplus = getSurplus(stock.available, stock.pendingIn, targetQuantity);
    return {
      label: surplus > 0 ? `多 ${surplus}` : COMPLETION_LABELS[completion],
      colorClass: COMPLETION_STYLES.surplus,
    };
  }

  // 状态三：总资产刚好等于目标数量（已凑齐）
  // 若存在待入库(pendingIn)或流出在途(reserved)，说明交易尚未最终落地，加 '*' 号提示存在变动
  const hasUncertainty = stock.pendingIn > 0 || stock.reserved > 0;
  return {
    label: `${COMPLETION_LABELS.complete}${hasUncertainty ? '*' : ''}`,
    colorClass: COMPLETION_STYLES.complete,
  };
}