import { useEffect, useState, type ChangeEvent, type FormEvent, type DragEvent } from 'react';
import { ImagePlus, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { saveCard } from '@/lib/cards';
import {
  DEFAULT_FIELD_VALUES,
  parseFieldValues,
  type CardFieldValues,
  type CardPrefill,
} from '@/lib/cardFields';
import { labelClass, primaryButtonClass } from '@/lib/formStyles';
import { compressCardImage } from '@/lib/imageCompression';
import { useTags } from '@/lib/useTags';
import CardDetailFields from '@/components/CardDetailFields';
import ImportReview, { type ImportDraft } from '@/components/ImportReview';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_SIZE = 6;

interface CardFormProps {
  prefill: CardPrefill | null;
}

export default function CardForm({ prefill }: CardFormProps) {
  const [values, setValues] = useState<CardFieldValues>(prefill?.values ?? DEFAULT_FIELD_VALUES);
  const [tagIds, setTagIds] = useState<string[]>(prefill?.tagIds ?? []);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(prefill?.imageUrl != null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    prefill ? { type: 'success', text: '已复制原物品信息，请确认名称后保存。' } : null,
  );
  const { tags, error: tagsError } = useTags();

  const [batchDrafts, setBatchDrafts] = useState<ImportDraft[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false); // 新增：拖拽高亮状态

  useEffect(() => {
    const imageUrl = prefill?.imageUrl;
    if (!imageUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        const extension = blob.type.split('/')[1] || 'jpg';
        const file = new File([blob], `card.${extension}`, { type: blob.type });
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      } catch {
        if (!cancelled) {
          setMessage({ type: 'error', text: '原物品图片读取失败，请手动选择图片。' });
        }
      } finally {
        if (!cancelled) setImageBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefill]);

    /**
   * 内存回收保护：当 batchDrafts 切换批次或组件卸载时，自动销毁不再使用的本地预览 URL
   * 防止手机端连续批量录入多张图片时因 Blob 内存累积引发浏览器卡顿或闪退
   */
  useEffect(() => {
    return () => {
      batchDrafts.forEach((draft) => {
        URL.revokeObjectURL(draft.previewUrl);
      });
    };
  }, [batchDrafts]);

  /**
   * 内存回收保护：组件卸载时同步释放单图本地预览链接
   */
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);


  const updateValues = (patch: Partial<CardFieldValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  // === 核心逻辑提取：无论是 Input 还是 Drop，最后都走这里 ===
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    if (files.length > MAX_BATCH_SIZE) {
      setMessage({ type: 'error', text: `为保证稳定，每次最多只允许选择 ${MAX_BATCH_SIZE} 张图片。` });
      return;
    }

    // 单图逻辑
    if (files.length === 1) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: '请选择图片文件。' });
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setMessage({ type: 'error', text: '图片太大，请选择 20MB 以内的图片。' });
        return;
      }
      
      setImageBusy(true);
      setMessage(null);
      try {
        const compressed = await compressCardImage(file);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : '图片处理失败。' });
      } finally {
        setImageBusy(false);
      }
      return;
    }

    // === 多图逻辑 ===
    setIsBatchProcessing(true);
    setProgress({ current: 0, total: files.length });
    setMessage(null);

    const drafts: ImportDraft[] = [];
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ current: i + 1, total: files.length });

      if (!file.type.startsWith('image/')) {
        failedCount++;
        continue;
      }

      try {
        const compressed = await compressCardImage(file);
        drafts.push({
          id: crypto.randomUUID(),
          image: compressed,
          previewUrl: URL.createObjectURL(compressed),
          values: { ...DEFAULT_FIELD_VALUES },
          tagIds: [],
        });
      } catch {
        failedCount++;
      }
    }

    setIsBatchProcessing(false);

    if (failedCount > 0) {
      setMessage({ 
        type: 'error', 
        text: `有 ${failedCount} 张图片处理失败已被跳过，正在进入其余图片的确认页面。` 
      });
    }

    if (drafts.length > 0) {
      setBatchDrafts(drafts);
    }
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // 关键修复：必须先拷贝成真实数组，再清空 input，否则 files 会被清空！
    const fileArray = Array.from(files);
    event.target.value = '';
    void processFiles(fileArray);
  };
  
  // === 新增：拖拽处理逻辑 ===
  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) void processFiles(files);
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const resetForm = () => {
    setValues(DEFAULT_FIELD_VALUES);
    setTagIds([]);
    clearImage();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseFieldValues(values);
    if (!parsed.ok) {
      setMessage({ type: 'error', text: parsed.error });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await saveCard(parsed.fields, tagIds, imageFile);
      resetForm();
      setMessage({ type: 'success', text: '已保存到库存。' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : '未知错误';
      setMessage({ type: 'error', text: `保存失败：${reason}` });
    } finally {
      setSubmitting(false);
    }
  };

  if (batchDrafts.length > 0) {
    return (
      <ImportReview 
        initialDrafts={batchDrafts} 
        onComplete={(savedCount) => {
          // 批量录入结束（保存成功或取消返回）时，立即释放本批次所有压缩图的本地预览内存
          batchDrafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
          setBatchDrafts([]); 
          if (savedCount > 0) {
            setMessage({ type: 'success', text: `已成功批量保存 ${savedCount} 件物品到库存。` });
          }
        }} 
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl relative">
      {isBatchProcessing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-6 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium text-slate-800">
              正在处理图片 ({progress.current} / {progress.total})…
            </p>
            <p className="text-xs text-slate-500">请勿关闭页面</p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">录入新物品</h1>
        <p className="mt-1 text-sm text-slate-500">填写信息后保存，物品会出现在列表中。</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div>
          <span className={labelClass}>物品图片</span>
          {imagePreview ? (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="图片预览"
                className="h-48 w-auto rounded-lg border border-slate-200 object-contain"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="移除图片"
                className="absolute -right-2 -top-2 rounded-full bg-slate-900 p-1 text-white shadow transition hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label 
              // === 新增：拖拽事件绑定 & 样式联动 ===
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-slate-500 transition ${
                isDragging 
                  ? 'border-teal-600 bg-teal-50/80 scale-[0.99]' 
                  : 'border-slate-300 bg-slate-50 hover:border-teal-600 hover:bg-teal-50/40'
              }`}
            >
              <ImagePlus className={`h-8 w-8 ${isDragging ? 'text-teal-600' : 'text-slate-400'}`} />
              <span className="text-sm">
                {isDragging ? '松开鼠标，即可上传图片' : '点击选择，或将图片拖拽到此处'}
              </span>
              <span className="text-xs text-slate-400">最多选 6 张，上传前自动压缩</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} />
            </label>
          )}
        </div>

        <CardDetailFields
          idPrefix="card"
          values={values}
          onChange={updateValues}
          allTags={tags}
          tagIds={tagIds}
          onTagsChange={setTagIds}
        />

        {tagsError && <p className="text-sm text-rose-700">主题加载失败：{tagsError}</p>}

        {message && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={submitting || imageBusy} className={primaryButtonClass}>
            {(submitting || imageBusy) && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? '保存中…' : imageBusy ? '处理图片中…' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}