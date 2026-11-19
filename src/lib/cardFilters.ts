import { getDisplayName, type Card, type Tag } from '@/lib/cards';
import { getCompletionStatus, type CompletionStatus } from '@/lib/cardStatus';
import { isTagUnder } from '@/lib/tags';
import type { CardStock } from '@/lib/useInventory';

export type CollectionKey = 'missing' | 'complete' | 'surplus';
export type AttributeKey = 'special' | 'defective' | 'normal';

export const ALL_COLLECTION_KEYS: CollectionKey[] = ['missing', 'complete', 'surplus'];
export const ALL_ATTRIBUTE_KEYS: AttributeKey[] = ['special', 'defective', 'normal'];

export interface CardFilters {
  collections: ReadonlySet<CollectionKey>;
  attributes: ReadonlySet<AttributeKey>;
  searchName: string;
  noTag: boolean;
  tagIds: string[];
}

export const DEFAULT_FILTERS: CardFilters = {
  collections: new Set(ALL_COLLECTION_KEYS),
  attributes: new Set(ALL_ATTRIBUTE_KEYS),
  searchName: '',
  noTag: false,
  tagIds: [],
};

export function hasActiveFilters(filters: CardFilters): boolean {
  return (
    filters.collections.size !== ALL_COLLECTION_KEYS.length ||
    filters.attributes.size !== ALL_ATTRIBUTE_KEYS.length ||
    filters.searchName.trim() !== '' ||
    filters.noTag ||
    filters.tagIds.length > 0
  );
}

function collectionOf(status: CompletionStatus): CollectionKey {
  if (status === 'complete') return 'complete';
  if (status === 'surplus') return 'surplus';
  return 'missing';
}

function matchesCollection(card: Card, stock: CardStock, filters: CardFilters): boolean {
  const status = getCompletionStatus({
    target_quantity: card.target_quantity,
    available: stock.available,
    pendingIn: stock.pendingIn,
  });
  return filters.collections.has(collectionOf(status));
}

function matchesAttribute(card: Card, filters: CardFilters): boolean {
  if (card.is_special && filters.attributes.has('special')) return true;
  if (card.is_defective && filters.attributes.has('defective')) return true;
  return !card.is_special && !card.is_defective && filters.attributes.has('normal');
}

function matchesSearchName(card: Card, filters: CardFilters): boolean {
  return matchesSearchQuery(
    getDisplayName(card),
    card.tags.map((t) => t.name),
    filters.searchName,
  );
}

function matchesTag(card: Card, filters: CardFilters, tags: Tag[]): boolean {
  if (filters.noTag) return card.tags.length === 0;
  if (filters.tagIds.length === 0) return true;
  
  const selectedTagNames = filters.tagIds
    .map(id => tags.find(t => t.id === id)?.name)
    .filter(Boolean) as string[];

  return card.tags.some(tag => selectedTagNames.some(name => isTagUnder(tag.name, name)));
}

export function applyFilters(
  cards: Card[],
  filters: CardFilters,
  tags: Tag[],
  stockOf: (cardId: string) => CardStock,
): Card[] {
  return cards.filter(
    (card) =>
      matchesCollection(card, stockOf(card.id), filters) &&
      matchesAttribute(card, filters) &&
      matchesSearchName(card, filters) &&
      matchesTag(card, filters, tags),
  );
}

/**
 * 快捷搜索框通用匹配规则：支持空格分隔多个条件，带 `#` 匹配标签，不带 `#` 匹配名称
 */
export function matchesSearchQuery(name: string, tagNames: string[], query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const lowerName = name.toLowerCase();
  const lowerTags = tagNames.map((t) => t.toLowerCase());

  return terms.every((term) =>
    term.startsWith('#')
      ? lowerTags.some((tag) => tag.includes(term.slice(1)))
      : lowerName.includes(term),
  );
}
