import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Hash, X } from 'lucide-react';
import { searchShellClass, searchInputClass, dropdownMenuClass, dropdownItemClass } from '@/lib/formStyles';
import type { Tag } from '@/lib/cards';

interface TagFilterInputProps {
  tags: Tag[];
  selectedIds: string[];
  noTag: boolean;
  onChange: (tagIds: string[]) => void;
  onToggleNoTag: () => void;
}

export default function TagFilterInput({ tags, selectedIds, noTag, onChange, onToggleNoTag }: TagFilterInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTags = selectedIds
    .map(id => tags.find(t => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  const keyword = query.trim().toLowerCase().replace(/^#/, '');
  const filtered = keyword
    ? tags.filter((tag) => tag.name.toLowerCase().includes(keyword))
    : tags;

  const toggleTag = (id: string) => {
    if (noTag) onToggleNoTag();
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(tid => tid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const removeTag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedIds.filter(tid => tid !== id));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className={`${searchShellClass} flex min-h-[2.75rem] w-full cursor-text flex-wrap items-center gap-1.5 px-3 py-1.5`}
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        
        {noTag ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-700 py-0.5 pl-2 pr-1 text-xs font-medium text-white shadow-sm">
            无主题
            <button onClick={(e) => { e.stopPropagation(); onToggleNoTag(); }} className="rounded p-0.5 hover:bg-white/20">
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          selectedTags.map(tag => (
            <span key={tag.id} className="inline-flex items-center gap-1 rounded-md bg-teal-600 py-0.5 pl-2 pr-1 text-xs font-medium text-white shadow-sm">
              <Hash className="h-3 w-3" />
              {tag.name}
              <button onClick={(e) => removeTag(tag.id, e)} className="rounded p-0.5 hover:bg-black/20">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}

        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          placeholder={selectedTags.length === 0 && !noTag ? "全部主题，输入搜索…" : "继续添加…"}
          className={`${searchInputClass} min-w-[8rem] flex-1`}
        />

        {/* 修改点：让箭头独立响应点击事件，并加上旋转动画 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发外框的 setOpen(true)
            setOpen(!open); // 切换开关状态
          }}
          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
        >
          <ChevronDown 
            className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
          />
        </button>
      </div>

      {open && (
        <ul className={dropdownMenuClass}>
          <li>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange([]); onToggleNoTag(); setQuery(''); setOpen(false); }}
              className={`${dropdownItemClass} ${noTag ? 'bg-teal-50/80 font-medium text-teal-800' : ''}`}
            >
              无主题
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-400 text-center">没有匹配的主题</li>
          ) : (
            filtered.map((tag) => {
              const isSelected = selectedIds.includes(tag.id);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); toggleTag(tag.id); setQuery(''); }}
                    className={`${dropdownItemClass} ${isSelected ? 'bg-teal-50/80 font-medium text-teal-800' : ''}`}
                  >
                    <span>#{tag.name}</span>
                    {isSelected && <span className="text-teal-600 font-bold text-base leading-none">✓</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}