import { useState } from 'react';
import { Hash, X } from 'lucide-react';
import type { Tag } from '@/lib/cards';
import { MAX_TAGS_PER_CARD } from '@/lib/tags';

interface TagPickerProps {
  allTags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TagPicker({ allTags, selectedIds, onChange }: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const isFull = selectedIds.length >= MAX_TAGS_PER_CARD;

  if (allTags.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        还没有主题，可以先到「主题」页面添加。
      </p>
    );
  }

  const selectedTags = selectedIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is Tag => tag !== undefined);

  const keyword = query.trim().toLowerCase();
  const suggestions = allTags.filter(
    (tag) => !selectedIds.includes(tag.id) && tag.name.toLowerCase().includes(keyword),
  );

  const add = (id: string) => {
    if (isFull) return;
    onChange([...selectedIds, id]);
    setQuery('');
  };

  const remove = (id: string) => onChange(selectedIds.filter((selected) => selected !== id));

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
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length > 0) {
                  e.preventDefault();
                  add(suggestions[0].id);
                }
              }}
              placeholder={selectedTags.length === 0 ? '搜索或选择主题…' : '继续添加…'}
              aria-label="搜索主题"
              className="w-full border-0 bg-transparent px-1 py-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {open && (
              <ul className="absolute z-20 bottom-full mb-2 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {suggestions.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">没有可选的主题</li>
                ) : (
                  suggestions.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          add(tag.id);
                        }}
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-teal-50"
                      >
                        <Hash className="h-3.5 w-3.5 text-slate-400" />
                        {tag.name}
                      </button>
                    </li>
                  ))
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
    </div>
  );
}
