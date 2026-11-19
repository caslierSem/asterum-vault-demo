import { useMemo, useState, useEffect, useRef, type FormEvent } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Hash, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  createTag,
  deleteTag,
  getSiblingTags,
  isTagUnder,
  moveTag,
  normalizeTagName,
  sortTagsForTree,
  type TagRecord,
} from '@/lib/tags';
import { inputClass, labelClass, primaryButtonClass } from '@/lib/formStyles';
import { useInventory } from '@/lib/useInventory';
import { useTags } from '@/lib/useTags';

export default function TagManager() {
  const { tags, loading, error: tagsError, reload: reloadTags } = useTags();
  const { cards, reload: reloadCards } = useInventory();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // === 新增：删除弹窗的控制状态 ===
  const [tagToDelete, setTagToDelete] = useState<TagRecord | null>(null);

  const reloadAll = () => Promise.all([reloadTags(), reloadCards()]);
  const displayTags = useMemo(() => sortTagsForTree(tags), [tags]);

  // === 折叠控制 ===
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const initialized = useRef(false);

  // 初始化：默认把所有的【二级标签】折叠起来（即箭头是 > ），这样它们下面的三级标签就不显示
  useEffect(() => {
    if (!initialized.current && tags.length > 0) {
      const initialCollapsed = new Set<string>();
      tags.forEach((tag) => {
        const parts = tag.name.split('/');
        // 如果是二级标签 (例如 小卡/HyperDrive)，则将其折叠
        if (parts.length === 2) {
          initialCollapsed.add(tag.id);
        }
      });
      setCollapsedIds(initialCollapsed);
      initialized.current = true;
    }
  }, [tags]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 过滤出当前需要显示的 Tag（排除被父级折叠掩盖的 Tag）
  const visibleTags = useMemo(() => {
    return displayTags.filter((tag) => {
      const parts = tag.name.split('/');
      // 检查它所有的父级，只要有一个父级在 collapsedIds 中，它就不显示
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join('/');
        const parentTag = tags.find((t) => t.name === parentPath);
        if (parentTag && collapsedIds.has(parentTag.id)) {
          return false;
        }
      }
      return true;
    });
  }, [displayTags, collapsedIds, tags]);
  // ====================

  const cardCountOf = (tag: TagRecord) =>
    cards.filter((card) => card.tags.some((cardTag) => cardTag.id === tag.id)).length;

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = normalizeTagName(newName);
    if (!name) {
      setActionError('请输入主题名称。');
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      await createTag(name);
      setNewName('');
      
      // 添加后自动展开父级（如果你刚加了一个三级，会自动把二级的 > 变成 v，让你看到三级）
      const parts = name.split('/');
      const newCollapsed = new Set(collapsedIds);
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join('/');
        const parentTag = tags.find((t) => t.name === parentPath);
        if (parentTag) newCollapsed.delete(parentTag.id);
      }
      setCollapsedIds(newCollapsed);

      await reloadTags();
    } catch (err) {
      setActionError(`添加失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAdding(false);
    }
  };

  const handleMove = async (tag: TagRecord, direction: -1 | 1) => {
    setBusyId(tag.id);
    setActionError(null);
    try {
      await moveTag(tag, direction, tags);
      await reloadTags();
    } catch (err) {
      setActionError(`调整顺序失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBusyId(null);
    }
  };

  // === 替换为触发弹窗 ===
  const handleDeleteClick = (tag: TagRecord) => {
    setTagToDelete(tag);
  };

  // === 真正执行删除 ===
  const confirmDelete = async () => {
    if (!tagToDelete) return;
    setBusyId(tagToDelete.id);
    setActionError(null);
    try {
      await deleteTag(tagToDelete.id);
      setTagToDelete(null); // 删除成功后关闭弹窗
      await reloadAll();
    } catch (err) {
      setActionError(`删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBusyId(null);
    }
  };

  const error = actionError ?? tagsError;

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">主题管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          共 {tags.length} 个主题。用 / 分隔层级，例如 周边/巡演周边/手幅。
        </p>
      </div>

      <form
        onSubmit={(event) => void handleAdd(event)}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <label htmlFor="new-tag-name" className={labelClass}>新增主题</label>
        <div className="flex gap-2">
          <input
            id="new-tag-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：周边/巡演周边/手幅"
            className={inputClass}
          />
          <button type="submit" disabled={adding} className={`${primaryButtonClass} shrink-0`}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            添加
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">正在加载…</span>
        </div>
      ) : tags.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <Hash className="h-10 w-10 text-slate-300" />
          <p className="text-sm">还没有主题，在上面添加第一个吧。</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visibleTags.map((tag) => {
            const depth = tag.name.split('/').length - 1;
            const count = cardCountOf(tag);
            const children = tags.filter((other) => other.id !== tag.id && isTagUnder(other.name, tag.name)).length;
            const siblings = getSiblingTags(tag, tags);
            const position = siblings.findIndex((sibling) => sibling.id === tag.id);
            const isBusy = busyId === tag.id;
            const isCollapsed = collapsedIds.has(tag.id);
            
            const shortName = tag.name.split('/').pop() || tag.name;

            return (
              <li
                key={tag.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 transition hover:bg-slate-50 sm:gap-3 sm:px-4 sm:py-3"
                style={{ paddingLeft: `${10 + depth * 12}px` }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                  {/* 折叠按钮 */}
                  {children > 0 ? (
                    <button
                      onClick={() => toggleCollapse(tag.id)}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  ) : (
                    <div className="w-5 shrink-0" />
                  )}

                  <Hash className="h-3.5 w-3.5 shrink-0 text-emerald-600 sm:h-4 sm:w-4" />
                  
                  <span 
                    className="truncate text-sm font-medium text-slate-900" 
                    title={tag.name}
                  >
                    {shortName}
                  </span>

                  {children > 0 && (
                    <span className="shrink-0 text-[11px] text-slate-400 sm:text-xs">
                      含 {children} 个子主题
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                  <span className="text-[11px] tabular-nums text-slate-500 sm:text-xs">
                    {count} 件
                  </span>
                  <div className="flex items-center">
                    <button
                      onClick={() => void handleMove(tag, -1)}
                      disabled={isBusy || position <= 0}
                      aria-label={`上移主题 ${tag.name}`}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent sm:p-1.5"
                    >
                      <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                    <button
                      onClick={() => void handleMove(tag, 1)}
                      disabled={isBusy || position >= siblings.length - 1}
                      aria-label={`下移主题 ${tag.name}`}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent sm:p-1.5"
                    >
                      <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteClick(tag)} // 这里改成了调用弹窗
                    disabled={isBusy}
                    aria-label={`删除主题 ${tag.name}`}
                    className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 sm:p-1.5"
                  >
                    {busyId === tag.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* === 美化版删除确认弹窗 === */}
      {tagToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white/95 border border-white/40 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5">
              <div className="mb-3 flex items-center gap-3 text-rose-600">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">确认删除</h3>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                确定删除主题「<span className="font-semibold text-slate-900">{tagToDelete.name}</span>」吗？
                {cardCountOf(tagToDelete) > 0 ? (
                  <span className="block mt-2 text-rose-600 font-medium">
                    警告：有 {cardCountOf(tagToDelete)} 件物品正在使用该主题，删除后它们将失去这个标签（物品本身保留）。
                  </span>
                ) : (
                  <span className="block mt-1">此操作无法撤销。</span>
                )}
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                onClick={() => setTagToDelete(null)}
                disabled={busyId === tagToDelete.id}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={busyId === tagToDelete.id}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {busyId === tagToDelete.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {busyId === tagToDelete.id ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}