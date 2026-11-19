import { supabase } from '@/lib/supabase';
import { toUserError } from '@/lib/dbError';

export interface Tag {
  id: string;
  name: string;
}

export interface CardFields {
  name: string;
  quantity: number;
  target_quantity: number;
  location: string;
  price: number;
  is_defective: boolean;
  is_special: boolean;
  notes: string;
}

export interface Card extends CardFields {
  id: string;
  image_path: string | null;
  created_at: string;
  tags: Tag[];
}

interface CardRow extends Omit<Card, 'tags' | 'notes'> {
  notes?: string;
  card_tags: { tags: Tag | null }[];
}

const BUCKET = 'card-images';
const CARD_PUBLIC_COLUMNS =
  'id, name, image_path, quantity, location, price, created_at, target_quantity, is_defective, is_special';
const CARD_SELECT_OWNER = '*, card_tags(tags(id, name))';
const CARD_SELECT_PUBLIC = `${CARD_PUBLIC_COLUMNS}, card_tags(tags(id, name))`;

function toCard(row: CardRow): Card {
  const { card_tags, ...card } = row;
  return {
    ...card,
    notes: card.notes ?? '',
    tags: card_tags.map((link) => link.tags).filter((tag): tag is Tag => tag !== null),
  };
}

export async function listCards(): Promise<Card[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const select = sessionData.session ? CARD_SELECT_OWNER : CARD_SELECT_PUBLIC;
  const { data, error } = await supabase
    .from('cards')
    .select(select)
    .order('created_at', { ascending: false });
  if (error) throw toUserError(error);
  return ((data ?? []) as unknown as CardRow[]).map(toCard);
}

export async function saveCard(
  fields: CardFields,
  tagIds: string[],
  imageFile: File | null,
): Promise<void> {
  const imagePath = imageFile ? await uploadCardImage(imageFile) : null;
  try {
    const { data, error } = await supabase
      .from('cards')
      .insert({ ...fields, image_path: imagePath })
      .select('id')
      .single<{ id: string }>();
    if (error) throw toUserError(error);

    try {
      await setCardTags(data.id, tagIds);
    } catch (tagError) {
      await supabase.from('cards').delete().eq('id', data.id);
      throw tagError;
    }
  } catch (err) {
    if (imagePath) await removeCardImage(imagePath);
    throw err;
  }
}

const CARD_LABEL_PREFIX_PATTERN = /^(\[(特典|瑕疵)\]\s*)+/;

export function stripCardLabelPrefixes(name: string): string {
  return name.replace(CARD_LABEL_PREFIX_PATTERN, '');
}

export function getDisplayName(card: Pick<Card, 'name' | 'is_defective' | 'is_special'>): string {
  const labels = [card.is_special && '[特典]', card.is_defective && '[瑕疵]'].filter(Boolean);
  return [...labels, stripCardLabelPrefixes(card.name)].join(' ');
}

export function compareCardsForList(
  a: Card,
  b: Card,
  tagRank: ReadonlyMap<string, number>,
): number {
  const rankA = cardTagRank(a, tagRank);
  const rankB = cardTagRank(b, tagRank);
  if (rankA !== rankB) return rankA < rankB ? -1 : 1;

  const byName = stripCardLabelPrefixes(a.name).localeCompare(stripCardLabelPrefixes(b.name), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
  if (byName !== 0) return byName;
  return Number(a.is_defective) - Number(b.is_defective) || Number(a.is_special) - Number(b.is_special);
}

function cardTagRank(card: Card, tagRank: ReadonlyMap<string, number>): number {
  return Math.min(...card.tags.map((tag) => tagRank.get(tag.id) ?? Infinity));
}

export function formatPrice(price: number): string {
  return `¥${Number(price).toFixed(2)}`;
}

// 计算富余：总资产（可用+待入） - 目标
export function getSurplus(available: number, pendingIn: number, target_quantity: number): number {
  const totalAsset = available + pendingIn;
  return Math.max(totalAsset - target_quantity, 0);
}

// 计算缺少：目标 - 总资产（可用+待入）
export function getMissing(available: number, pendingIn: number, target_quantity: number): number {
  const totalAsset = available + pendingIn;
  return Math.max(target_quantity - totalAsset, 0);
}

export async function updateCard(id: string, changes: Partial<CardFields>): Promise<void> {
  const { error } = await supabase.from('cards').update(changes).eq('id', id);
  if (error) throw toUserError(error);
}

export async function setCardTags(cardId: string, tagIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_card_tags', { p_card_id: cardId, p_tag_ids: tagIds });
  if (error) throw toUserError(error);
}

export async function deleteCard(card: Card): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', card.id);
  if (error) throw toUserError(error);
  if (card.image_path) {
    await removeCardImage(card.image_path);
  }
}

async function uploadCardImage(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600' });
  if (error) throw toUserError(error);
  return path;
}

async function removeCardImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

export function getCardImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}