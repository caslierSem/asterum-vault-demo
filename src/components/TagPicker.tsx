import { useMemo, useState } from 'react';
import { Hash, Loader2, Plus, X } from 'lucide-react';
import type { Tag } from '@/lib/cards';
import { createTag, MAX_TAGS_PER_CARD, normalizeTagName, type TagRecord } from '@/lib/tags';

interface TagPickerProps {
  allTags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** 现场新建成功后通知父级刷新主题列表，使其他卡片下拉也能看到新主题 */
  onTagCreated?: (tag: TagRecord) => void;
}

function namesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export default function TagPicker({ allTags, selectedIds, onChange, onTagCreated }: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // 刚创建的主题可能尚未进入父级 allTags，先本地缓存以便立即显示已选标签
  const [localCreated, setLocalCreated] = useState<Tag[]>([]);

  const isFull = selectedIds.length >= MAX_TAGS_PER_CARD;
  const knownTags = useMemo(() => {
    const seen = new Set(allTags.map((tag) => tag.id));
    return [...allTags, ...localCreated.filter((tag) => !seen.has(tag.id))];
  }, [allTags, localCreated]);

  const selectedTags = selectedIds
    .map((id) => knownTags.find((tag) => tag.id === id))
    .filter((tag): tag is Tag => tag !== undefined);

  const keyword = query.trim().toLowerCase();
  const normalized = normalizeTagName(query);
  const exactMatch = normalized
    ? knownTags.find((tag) => namesMatch(tag.name, normalized) || namesMatch(normalizeTagName(tag.name), normalized))
    : undefined;
  const suggestions = knownTags.filter(
    (tag) => !selectedIds.includes(tag.id) && tag.name.toLowerCase().includes(keyword),
  );
  // 已有完全同名主题时不展示新建；创建中仍保留该项以便显示加载状态
  const wouldCreate = Boolean(normalized) && !exactMatch && !isFull;
  const canCreate = wouldCreate && !creating;

  const add = (id: string) => {
    if (isFull || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery('');
    setCreateError(null);
  };

  const remove = (id: string) => onChange(selectedIds.filter((selected) => selected !== id));

  const handleCreate = async () => {
    if (!wouldCreate || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createTag(normalized);
      setLocalCreated((prev) => (prev.some((tag) => tag.id === created.id) ? prev : [...prev, created]));
      onChange([...selectedIds, created.id]);
      setQuery('');
      onTagCreated?.(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '新建主题失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div
        className={`flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm transition focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20 ${
          isFull ? 'bg-slate-50' : ''
        }`}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-md bg-teal-700 py-0.5 pl-2 pr-1 text-xs font-medium text-white"
          >
            <Hash className="h-3 w-3" />
            {tag.name}
            <button
              type="button"
              onClick={() => remove(tag.id)}
              aria-label={`移除主题 ${tag.name}`}
              className="rounded p-0.5 transition hover:bg-teal-800"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!isFull && (
          <div className="relative min-w-[8rem] flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (exactMatch && !selectedIds.includes(exactMatch.id)) {
                  add(exactMatch.id);
                  return;
                }
                if (suggestions.length > 0) {
                  add(suggestions[0].id);
                  return;
                }
                if (canCreate) void handleCreate();
              }}
              placeholder={selectedTags.length === 0 ? '搜索或输入新主题…' : '继续添加…'}
              aria-label="搜索或新建主题"
              disabled={creating}
              className="w-full border-0 bg-transparent px-1 py-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
            />
            {open && (
              <ul className="absolute z-20 bottom-full mb-2 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {wouldCreate && (
                  <li>
                    <button
                      type="button"
                      disabled={creating}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void handleCreate();
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
                    >
                      {creating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-teal-700" />
                      )}
                      {creating ? '正在新建主题…' : `新建主题“${normalized}”`}
                    </button>
                  </li>
                )}
                {suggestions.length === 0 && !wouldCreate ? (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    {knownTags.length === 0 ? '输入名称后按回车即可创建第一个主题' : '没有可选的主题'}
                  </li>
                ) : (
                  suggestions.map((tag) => {
                    const isExact = exactMatch?.id === tag.id;
                    return (
                      <li key={tag.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            add(tag.id);
                          }}
                          className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm transition ${
                            isExact
                              ? 'bg-teal-50 font-medium text-teal-900'
                              : 'text-slate-800 hover:bg-teal-50'
                          }`}
                        >
                          <Hash className={`h-3.5 w-3.5 ${isExact ? 'text-teal-700' : 'text-slate-400'}`} />
                          {tag.name}
                          {isExact && <span className="ml-auto text-xs text-teal-700">已有主题</span>}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        已选 {selectedIds.length} / {MAX_TAGS_PER_CARD}
        {isFull && '，已达上限，移除一个后可再添加'}
      </p>
      {createError && (
        <p role="alert" className="mt-1 text-sm text-rose-700">
          {createError}
        </p>
      )}
    </div>
  );
}
