import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { Crop, Loader2, RotateCw } from 'lucide-react';
import { cropImageToFile } from '@/lib/imageCrop';
import { primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';

type AspectPreset = 'card' | 'square' | 'free';

const ASPECT_OPTIONS: { id: AspectPreset; label: string; value: number }[] = [
  { id: 'card', label: '小卡 (2:3)', value: 2 / 3 },
  { id: 'square', label: '正方形 (1:1)', value: 1 },
];

interface ImageCropDialogProps {
  imageUrl: string;
  fileName?: string;
  onConfirm: (file: File) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const chipGroupClass = 'flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1';
const chipClass = (active: boolean) =>
  `min-h-11 min-w-[4.5rem] flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
  }`;

function clampCropSize(
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
) {
  const maxW = Math.max(48, containerWidth - 16);
  const maxH = Math.max(48, containerHeight - 16);
  return {
    width: Math.min(maxW, Math.max(48, width)),
    height: Math.min(maxH, Math.max(48, height)),
  };
}

/**
 * 单卡录入用图片裁剪/旋转弹窗；挂到 document.body，避免被父级 overflow 挡住。
 */
export default function ImageCropDialog({
  imageUrl,
  fileName = 'card.jpg',
  onConfirm,
  onSkip,
  onCancel,
}: ImageCropDialogProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('card');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [freeCropSize, setFreeCropSize] = useState<{ width: number; height: number } | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspectValue = ASPECT_OPTIONS.find((item) => item.id === aspectPreset)?.value ?? 2 / 3;
  const isFree = aspectPreset === 'free';

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, busy]);

  const initFreeCropSize = useCallback(() => {
    const box = stageRef.current;
    if (!box) return;
    const next = clampCropSize(box.clientWidth * 0.46, box.clientHeight * 0.7, box.clientWidth, box.clientHeight);
    setFreeCropSize(next);
  }, []);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleAspectChange = (preset: AspectPreset) => {
    setAspectPreset(preset);
    setCrop({ x: 0, y: 0 });
    if (preset === 'free') {
      initFreeCropSize();
    } else {
      setFreeCropSize(null);
    }
  };

  const handleResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (busy || !freeCropSize) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = freeCropSize;
    const box = stageRef.current;

    const onMove = (moveEvent: PointerEvent) => {
      if (!box) return;
      const next = clampCropSize(
        startSize.width + (moveEvent.clientX - startX),
        startSize.height + (moveEvent.clientY - startY),
        box.clientWidth,
        box.clientHeight,
      );
      setFreeCropSize(next);
    };

    const onUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await cropImageToFile(imageUrl, croppedAreaPixels, rotation, fileName);
      onConfirm(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片裁剪失败，请稍后重试。');
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/95 shadow-2xl"
      >
        <div className="flex items-center gap-3 px-5 pt-5 text-teal-600">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100">
            <Crop className="h-5 w-5" />
          </div>
          <h3 id="image-crop-title" className="text-lg font-semibold text-slate-900">
            裁剪图片
          </h3>
        </div>

        <div
          ref={stageRef}
          className="relative mx-5 mt-4 h-[min(50vh,22rem)] overflow-hidden rounded-xl bg-slate-900"
        >
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={isFree && freeCropSize ? freeCropSize.width / freeCropSize.height : aspectValue}
            cropSize={isFree && freeCropSize ? freeCropSize : undefined}
            minZoom={1}
            maxZoom={3}
            zoomSpeed={0.4}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
          {isFree && freeCropSize && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: freeCropSize.width,
                height: freeCropSize.height,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <button
                type="button"
                aria-label="拖动调整裁剪框大小"
                disabled={busy}
                onPointerDown={handleResizePointerDown}
                className="pointer-events-auto absolute -bottom-2 -right-2 h-11 w-11 touch-none rounded-full border-2 border-white bg-teal-700 shadow-md"
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">预设比例</p>
            <div className={chipGroupClass}>
              {ASPECT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleAspectChange(option.id)}
                  className={chipClass(aspectPreset === option.id)}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => handleAspectChange('free')}
                className={chipClass(aspectPreset === 'free')}
              >
                自由比例
              </button>
            </div>
            {isFree && (
              <p className="mt-2 text-xs text-slate-500">拖动裁剪框右下角圆点，可自由调整大小和宽高比。</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className={`${secondaryButtonClass} min-h-11 px-4`}
            >
              <RotateCw className="h-4 w-4" />
              顺时针旋转 90°
            </button>
            <label className="flex min-w-[12rem] flex-1 items-center gap-3 text-sm text-slate-600">
              <span className="shrink-0">缩放</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                disabled={busy}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="h-11 w-full accent-teal-700 text-base"
                aria-label="缩放"
              />
              <span className="w-8 shrink-0 text-right tabular-nums">{zoom.toFixed(1)}x</span>
            </label>
          </div>

          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>

        <div
          className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/50 disabled:opacity-50"
          >
            取消
          </button>
          <button type="button" disabled={busy} onClick={onSkip} className={`${secondaryButtonClass} min-h-11`}>
            使用原图
          </button>
          <button
            type="button"
            disabled={busy || !croppedAreaPixels}
            onClick={() => void handleConfirm()}
            className={`${primaryButtonClass} min-h-11`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            确认裁剪
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
