import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchShellClass, searchInputClass, dropdownMenuClass, dropdownItemClass } from '@/lib/formStyles';
import { matchesSearchQuery } from '@/lib/cardFilters';
import CardThumbnail from '@/components/CardThumbnail';

export interface PickerOption {
  id: string;
  name: string;
  meta: string;
  disabled: boolean;
  imageUrl: string | null;
  tags: string[];
  price: number;
}

interface CardPickerProps {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (cardId: string | null) => void;
}

const MAX_VISIBLE_OPTIONS = 50;

export default function CardPicker({ label, options, value, onChange }: CardPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? null;

  // 已选中状态
  if (selected) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-teal-200/60 bg-teal-50/50 px-3 py-2 shadow-sm backdrop-blur-sm">
        <CardThumbnail imageUrl={selected.imageUrl} name={selected.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{selected.name}</p>
          <p className="truncate text-xs text-emerald-600">
            {selected.tags.map((tag) => `#${tag}`).join(' ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`更换${label}`}
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // 复用公共搜索匹配函数
  const filtered = options.filter((option) =>
    matchesSearchQuery(option.name, option.tags, query),
  );

  const visibleOptions = filtered.slice(0, MAX_VISIBLE_OPTIONS);
  const hasMore = filtered.length > MAX_VISIBLE_OPTIONS;

  return (
    <div className="relative min-w-0 flex-1">
      {/* 复用搜索外壳与输入框 */}
      <div className={`${searchShellClass} flex h-[2.75rem] w-full items-center px-3`}>
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="搜索物品或主题…"
          aria-label={label}
          className={`${searchInputClass} ml-2`}
        />
      </div>

      {open && (
        <ul className={dropdownMenuClass}>
          {visibleOptions.length === 0 ? (
            <li className="px-4 py-3 text-center text-sm text-slate-400">没有匹配的物品</li>
          ) : (
            <>
              {visibleOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={option.disabled}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (option.disabled) return;
                      onChange(option.id);
                      setQuery('');
                      setOpen(false);
                    }}
                    className={`${dropdownItemClass} flex items-center gap-3 ${
                      option.disabled ? 'opacity-50' : ''
                    }`}
                  >
                    {/* 左侧缩略图 */}
                    <CardThumbnail imageUrl={option.imageUrl} name={option.name} />

                    {/* 右侧文字信息：上下两行 */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                      {/* 第一行：卡名 + 库存 */}
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {option.name}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-500">
                          {option.meta}
                        </span>
                      </div>

                      {/* 第二行：绿色的小字 Tag */}
                      {option.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 truncate text-[11px] font-medium text-emerald-600">
                          {option.tags.map((tag) => (
                            <span key={tag} className="truncate">
                              <span className="mr-0.5 text-emerald-500/50">#</span>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}

              {hasMore && (
                <li className="border-t border-slate-100 px-4 py-2.5 text-center text-xs text-slate-400">
                  仅展示前 {MAX_VISIBLE_OPTIONS} 项（共 {filtered.length} 项），请输入关键词进一步筛选
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}