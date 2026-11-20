import { useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2 } from 'lucide-react';
import ImportReview, { type ImportDraft } from '@/components/ImportReview';
import { cropToCanvas, canvasToBlob, detectCardRegions, loadImageFromFile } from '@/lib/cardDetection';
import { DEFAULT_FIELD_VALUES } from '@/lib/cardFields';
import { extractMetadataFromImageFile } from '@/lib/posterMetadata';
import { useTags } from '@/lib/useTags';

type Stage = 'idle' | 'processing' | 'review';

export default function ScreenshotImport() {
  const [stage, setStage] = useState<Stage>('idle');
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [isMetadataRestored, setIsMetadataRestored] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { tags } = useTags();

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: '请选择图片文件。' });
      return;
    }

    setStage('processing');
    setMessage(null);
    try {
      const image = await loadImageFromFile(file);
      const embedded = await extractMetadataFromImageFile(file);

      const newDrafts: ImportDraft[] = [];

      if (embedded && embedded.cards.length > 0) {
        // 优先走本应用导出海报原图的无损元数据还原通道
        const tagByName = new Map(tags.map((t) => [t.name.trim(), t.id]));

        for (const item of embedded.cards) {
          const safeRect = {
            x: Math.max(0, Math.min(image.naturalWidth - 1, item.rect.x)),
            y: Math.max(0, Math.min(image.naturalHeight - 1, item.rect.y)),
            width: Math.max(1, Math.min(image.naturalWidth - item.rect.x, item.rect.width)),
            height: Math.max(1, Math.min(image.naturalHeight - item.rect.y, item.rect.height)),
          };
          const blob = await canvasToBlob(cropToCanvas(image, safeRect));
          const matchedTagIds = item.themes
            .map((name) => tagByName.get(name.trim()))
            .filter((id): id is string => Boolean(id));

          newDrafts.push({
            id: crypto.randomUUID(),
            image: blob,
            previewUrl: URL.createObjectURL(blob),
            values: {
              ...DEFAULT_FIELD_VALUES,
              name: item.name || '',
              is_special: Boolean(item.is_special),
              is_defective: Boolean(item.is_defective),
            },
            tagIds: matchedTagIds,
          });
        }
        setIsMetadataRestored(true);
      } else {
        // 常规截图/微信压缩图/weareplave 表格，无缝降级走图像识别算法
        const regions = detectCardRegions(image);
        if (regions.length === 0) {
          throw new Error('没有识别到物品，请换一张更清晰、排列整齐的图片。');
        }

        for (let i = 0; i < regions.length; i++) {
          const blob = await canvasToBlob(cropToCanvas(image, regions[i]));
          newDrafts.push({
            id: crypto.randomUUID(),
            image: blob,
            previewUrl: URL.createObjectURL(blob),
            values: { ...DEFAULT_FIELD_VALUES },
            tagIds: [],
          });
        }
        setIsMetadataRestored(false);
      }

      setDrafts(newDrafts);
      setStage('review');
    } catch (err) {
      setStage('idle');
      const reason = err instanceof Error ? err.message : '未知错误';
      setMessage({ type: 'error', text: `识别失败：${reason}` });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void processFile(file);
  };

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
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleComplete = (savedCount: number) => {
    setDrafts([]);
    setIsMetadataRestored(false);
    setStage('idle');
    setMessage({ type: 'success', text: `已保存 ${savedCount} 件物品到库存。` });
  };

  if (stage === 'review') {
    return (
      <ImportReview
        initialDrafts={drafts}
        autoOpenBatchDefaults={!isMetadataRestored}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">截图自动录入</h1>
        <p className="mt-1 text-sm text-slate-500">
          上传物品表格截图或本助手导出的换卡海报，系统会自动切出每件物品并尽量还原信息。
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {stage === 'processing' ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
            <p className="text-sm">正在解析并切分卡面…</p>
          </div>
        ) : (
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-14 text-slate-500 transition ${
              isDragging
                ? 'border-teal-600 bg-teal-50/80 scale-[0.99]'
                : 'border-slate-300 bg-slate-50 hover:border-teal-600 hover:bg-teal-50/40'
            }`}
          >
            <ImagePlus className={`h-8 w-8 ${isDragging ? 'text-teal-600' : 'text-slate-400'}`} />
            <span className="text-sm">
              {isDragging ? '松开鼠标，即可上传截图' : '点击选择，或将图片拖拽到此处'}
            </span>
            <span className="text-xs text-slate-400">支持 JPG / PNG / WEBP</span>
            <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
          </label>
        )}
      </div>

      {message && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
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
    </section>
  );
}
