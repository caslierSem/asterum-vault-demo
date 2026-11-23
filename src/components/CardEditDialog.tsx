import { useEffect, useState } from 'react';
import { AlertCircle, Copy, Loader2, Trash2, X } from 'lucide-react';
import {
  deleteCard,
  getCardImageUrl,
  getDisplayName,
  setCardTags,
  updateCard,
  type Card,
  type Tag,
} from '@/lib/cards';
import { fieldValuesFromCard, parseFieldValues, type CardFieldValues, type CardPrefill } from '@/lib/cardFields';
import type { TagRecord } from '@/lib/tags';
import { primaryButtonClass } from '@/lib/formStyles';
import CardDetailFields from '@/components/CardDetailFields';
import ConfirmDialog from '@/components/ConfirmDialog'; // 引入弹窗

interface CardEditDialogProps {
  card: Card;
  reserved: number;
  openOrders: number;
  allTags: Tag[];
  onClose: () => void;
  onChanged: () => void;
  onDuplicate: (prefill: CardPrefill) => void;
  onTagCreated?: (tag: TagRecord) => void;
}

export default function CardEditDialog({
  card,
  reserved,
  openOrders,
  allTags,
  onClose,
  onChanged,
  onDuplicate,
  onTagCreated,
}: CardEditDialogProps) {
  const [values, setValues] = useState<CardFieldValues>(() => fieldValuesFromCard(card));
  const [tagIds, setTagIds] = useState<string[]>(() => card.tags.map((tag) => tag.id));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false); // 删除确认弹窗状态
  
  const busy = saving || deleting;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !showConfirmDelete) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, busy, showConfirmDelete]);

  const handleSave = async () => {
    const parsed = parseFieldValues(values);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.fields.quantity < reserved) {
      setError(`有 ${reserved} 张在约换中的订单占用，库存数量不能少于 ${reserved}。`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateCard(card.id, parsed.fields);
      await setCardTags(card.id, tagIds);
      onChanged();
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteCard(card);
      onChanged();
    } catch (err) {
      setError(`删除失败：${err instanceof Error ? err.message : '未知错误'}`);
      setShowConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = () => {
    onDuplicate({
      values,
      tagIds,
      imageUrl: card.image_path ? getCardImageUrl(card.image_path) : null,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-card-title"
          className="w-full max-w-md sm:max-w-lg max-h-[90vh] flex flex-col bg-white/95 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/40 overflow-hidden animate-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 id="edit-card-title" className="text-lg font-semibold text-slate-900">编辑物品</h2>
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="关闭"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-5">
            <CardDetailFields
              idPrefix={`edit-${card.id}`}
              values={values}
              onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
              allTags={allTags}
              tagIds={tagIds}
              onTagsChange={setTagIds}
              onTagCreated={onTagCreated}
            />
            {error && (
              <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteClick}
                disabled={busy}
                title="删除此物"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              </button>
              <button
                onClick={handleDuplicate}
                disabled={busy}
                title="复制并新建"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={onClose} 
                disabled={busy} 
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                取消
              </button>
              <button 
                onClick={() => void handleSave()} 
                disabled={busy} 
                className={primaryButtonClass}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 替换原生弹窗 */}
      {showConfirmDelete && (
        <ConfirmDialog
          title="确认删除"
          isDanger
          busy={deleting}
          message={
            <>
              确定删除「<span className="font-semibold text-slate-900">{getDisplayName(card)}</span>」吗？
              {openOrders > 0 && (
                <span className="block mt-2 text-rose-600 font-medium">
                  警告：该物品还有 {openOrders} 笔约换中的订单。删除后订单仍会保留物品名，但无法再扣减或增加这件物品的库存。
                </span>
              )}
              <span className="block mt-1">此操作无法撤销。</span>
            </>
          }
          onConfirm={() => void confirmDelete()}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </>
  );
}