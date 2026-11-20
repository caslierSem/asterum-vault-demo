import { useState } from 'react';
import { AlertCircle, Loader2, Save, Settings2, Trash2 } from 'lucide-react';
import { saveCard } from '@/lib/cards';
import { parseFieldValues, type CardFieldValues } from '@/lib/cardFields';
import { primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import { useTags } from '@/lib/useTags';
import CardDetailFields from '@/components/CardDetailFields';
import BatchDefaultsDialog, { type BatchDefaults } from '@/components/BatchDefaultsDialog';

export interface ImportDraft {
  id: string;
  image: Blob;
  previewUrl: string;
  values: CardFieldValues;
  tagIds: string[];
}

interface ImportReviewProps {
  initialDrafts: ImportDraft[];
  autoOpenBatchDefaults?: boolean;
  onComplete: (savedCount: number) => void;
}

export default function ImportReview({
  initialDrafts,
  autoOpenBatchDefaults = true,
  onComplete,
}: ImportReviewProps) {
  const [drafts, setDrafts] = useState<ImportDraft[]>(initialDrafts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(autoOpenBatchDefaults);
  const { tags, error: tagsError } = useTags();

  const updateDraft = (id: string, changes: Partial<Omit<ImportDraft, 'id' | 'image' | 'previewUrl'>>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  };

  const updateValues = (id: string, patch: Partial<CardFieldValues>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, values: { ...d.values, ...patch } } : d)),
    );
  };

  const applyBatchDefaults = ({ values, tagIds }: BatchDefaults) => {
    setDrafts((prev) =>
      prev.map((d) => ({ ...d, values: { ...d.values, ...values }, tagIds: [...tagIds] })),
    );
    setBatchOpen(false);
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  };

  const handleSaveAll = async () => {
    const parsedAll = drafts.map((draft) => parseFieldValues(draft.values));
    const firstInvalid = parsedAll.findIndex((parsed) => !parsed.ok);
    if (firstInvalid !== -1) {
      const parsed = parsedAll[firstInvalid];
      setError(`第 ${firstInvalid + 1} 件物品：${!parsed.ok ? parsed.error : ''}。`);
      return;
    }

    setSaving(true);
    setError(null);
    let savedCount = 0;
    const remaining = [...drafts];
    try {
      while (remaining.length > 0) {
        const draft = remaining[0];
        const parsed = parseFieldValues(draft.values);
        if (!parsed.ok) throw new Error(parsed.error);
        await saveCard(
          parsed.fields,
          draft.tagIds,
          new File([draft.image], 'card.jpg', { type: 'image/jpeg' }),
        );
        URL.revokeObjectURL(draft.previewUrl);
        remaining.shift();
        savedCount++;
        setDrafts([...remaining]);
      }
      onComplete(savedCount);
    } catch (err) {
      const reason = err instanceof Error ? err.message : '未知错误';
      setError(`保存失败（已保存 ${savedCount} 张）：${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const saveAllButton = (
    <button
      onClick={() => void handleSaveAll()}
      disabled={saving || drafts.length === 0}
      className={primaryButtonClass}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? '保存中…' : `保存全部（${drafts.length} 张）`}
    </button>
  );

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">确认识别结果</h1>
          <p className="mt-1 text-sm text-slate-500">
            共识别到 {drafts.length} 件物品，请补充信息后一次性保存。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setBatchOpen(true)}
            disabled={saving || drafts.length === 0}
            className={secondaryButtonClass}
          >
            <Settings2 className="h-4 w-4" />
            批量设置默认值
          </button>
          {saveAllButton}
        </div>
      </div>

      {(error || tagsError) && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? `主题加载失败：${tagsError}`}</span>
        </div>
      )}

      <ul className="space-y-4">
        {drafts.map((draft, index) => (
          <li key={draft.id} className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <img
                src={draft.previewUrl}
                alt={`第 ${index + 1} 件物品`}
                className="h-44 w-32 rounded-lg border border-slate-200 bg-slate-100 object-cover"
              />
              <span className="text-xs text-slate-400">第 {index + 1} 张</span>
            </div>

            <div className="flex-1">
              <CardDetailFields
                idPrefix={`draft-${draft.id}`}
                values={draft.values}
                onChange={(patch) => updateValues(draft.id, patch)}
                allTags={tags}
                tagIds={draft.tagIds}
                onTagsChange={(ids) => updateDraft(draft.id, { tagIds: ids })}
              />
            </div>

            <button
              onClick={() => removeDraft(draft.id)}
              disabled={saving}
              aria-label={`移除第 ${index + 1} 张`}
              className="self-start rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {drafts.length > 0 && <div className="mt-6 flex justify-end">{saveAllButton}</div>}

      {drafts.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-500">所有物品都已处理。</p>
      )}

      {batchOpen && (
        <BatchDefaultsDialog
          allTags={tags}
          onClose={() => setBatchOpen(false)}
          onApply={applyBatchDefaults}
        />
      )}
    </section>
  );
}
