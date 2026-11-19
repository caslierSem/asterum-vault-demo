import { supabase } from '@/lib/supabase';
import { toUserError } from '@/lib/dbError';
import type { Tag } from '@/lib/cards';

export const MAX_TAGS_PER_CARD = 3;

const DUPLICATE_KEY_CODE = '23505';

export interface TagRecord extends Tag {
  sort_order: number;
  created_at: string;
}

export function normalizeTagName(input: string): string {
  return input
    .trim()
    .replace(/^#+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('/');
}

export function isTagUnder(tagName: string, parentName: string): boolean {
  return tagName === parentName || tagName.startsWith(`${parentName}/`);
}

function parentPathOf(tagName: string): string {
  return tagName.split('/').slice(0, -1).join('/');
}

function compareSiblings(a: TagRecord, b: TagRecord): number {
  return (
    a.sort_order - b.sort_order ||
    a.created_at.localeCompare(b.created_at) ||
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  );
}

export function sortTagsForTree(tags: TagRecord[]): TagRecord[] {
  const byName = new Map(tags.map((tag) => [tag.name, tag]));
  const compare = (a: TagRecord, b: TagRecord): number => {
    const segmentsA = a.name.split('/');
    const segmentsB = b.name.split('/');
    const shared = Math.min(segmentsA.length, segmentsB.length);
    for (let depth = 0; depth < shared; depth++) {
      const pathA = segmentsA.slice(0, depth + 1).join('/');
      const pathB = segmentsB.slice(0, depth + 1).join('/');
      if (pathA === pathB) continue;
      const siblingA = byName.get(pathA);
      const siblingB = byName.get(pathB);
      if (siblingA && siblingB) return compareSiblings(siblingA, siblingB);
      return segmentsA[depth].localeCompare(segmentsB[depth], 'zh-CN', { numeric: true });
    }
    return segmentsA.length - segmentsB.length;
  };
  return [...tags].sort(compare);
}

export function buildTagRank(tags: TagRecord[]): Map<string, number> {
  return new Map(sortTagsForTree(tags).map((tag, index) => [tag.id, index]));
}

export function getSiblingTags(tag: TagRecord, tags: TagRecord[]): TagRecord[] {
  const parent = parentPathOf(tag.name);
  return tags
    .filter((other) => parentPathOf(other.name) === parent)
    .sort(compareSiblings);
}

function toTagError(error: { code?: string; message: string }): Error {
  if (error.code === DUPLICATE_KEY_CODE) return new Error('已存在同名主题');
  return toUserError(error);
}

export async function listTags(): Promise<TagRecord[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, sort_order, created_at')
    .order('created_at');
  if (error) throw toUserError(error);
  return (data ?? []) as TagRecord[];
}

export async function createTag(name: string): Promise<void> {
  const { data: last, error: lastError } = await supabase
    .from('tags')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  if (lastError) throw toUserError(lastError);

  const { error } = await supabase
    .from('tags')
    .insert({ name: normalizeTagName(name), sort_order: last ? last.sort_order + 1 : 0 });
  if (error) throw toTagError(error);
}

export async function moveTag(tag: TagRecord, direction: -1 | 1, tags: TagRecord[]): Promise<void> {
  const siblings = getSiblingTags(tag, tags);
  const index = siblings.findIndex((sibling) => sibling.id === tag.id);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= siblings.length) return;

  const reordered = [...siblings];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

  const changes = reordered
    .map((sibling, position) => ({ id: sibling.id, sort_order: position, previous: sibling.sort_order }))
    .filter((change) => change.sort_order !== change.previous);

  const results = await Promise.all(
    changes.map((change) =>
      supabase.from('tags').update({ sort_order: change.sort_order }).eq('id', change.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw toUserError(failed.error);
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) throw toUserError(error);
}
