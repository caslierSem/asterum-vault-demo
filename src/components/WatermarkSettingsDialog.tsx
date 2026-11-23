import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Stamp } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/formStyles';
import {
  type WatermarkAngle,
  type WatermarkConfig,
  type WatermarkDensity,
  type WatermarkMode,
  type WatermarkOpacity,
  type WatermarkFontSize,
  type WatermarkPosition,
  WATERMARK_ANGLE_OPTIONS,
  WATERMARK_COLOR_PRESETS,
  WATERMARK_DENSITY_OPTIONS,
  WATERMARK_FONT_SIZE_OPTIONS,
  WATERMARK_OPACITY_OPTIONS,
  WATERMARK_POSITION_OPTIONS,
} from '@/lib/watermark';

interface WatermarkSettingsDialogProps {
  initialConfig: WatermarkConfig;
  onSave: (config: WatermarkConfig) => void;
  onCancel: () => void;
}

const chipGroupClass = 'flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1';
const chipClass = (active: boolean) =>
  `flex-1 min-w-[4.5rem] rounded-lg px-3 py-2 text-xs font-medium transition ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
  }`;

/**
 * 换卡海报水印配置弹窗；草稿仅在点击保存后写回。
 */
export default function WatermarkSettingsDialog({
  initialConfig,
  onSave,
  onCancel,
}: WatermarkSettingsDialogProps) {
  const [draft, setDraft] = useState<WatermarkConfig>(initialConfig);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const patch = (partial: Partial<WatermarkConfig>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="watermark-settings-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/95 shadow-2xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-3 text-teal-600">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100">
              <Stamp className="h-5 w-5" />
            </div>
            <h3 id="watermark-settings-title" className="text-lg font-semibold text-slate-900">
              水印设置
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="watermark-text">
                水印文字
              </label>
              <input
                id="watermark-text"
                className={inputClass}
                value={draft.text}
                placeholder="留空则不显示水印"
                onChange={(event) => patch({ text: event.target.value })}
              />
            </div>

            <div>
              <p className={labelClass}>颜色</p>
              <div className="flex flex-wrap gap-2">
                {WATERMARK_COLOR_PRESETS.map((preset) => {
                  const selected = draft.color === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      title={preset.label}
                      aria-label={preset.label}
                      onClick={() => patch({ color: preset.hex })}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        selected ? 'ring-2 ring-teal-600 ring-offset-1' : 'hover:scale-105'
                      }`}
                    >
                      <span
                        className="h-8 w-8 rounded-full border border-slate-200 shadow-sm"
                        style={{ backgroundColor: preset.hex }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={labelClass}>字号</p>
              <div className={chipGroupClass}>
                {WATERMARK_FONT_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={chipClass(draft.fontSize === option.value)}
                    onClick={() => patch({ fontSize: option.value as WatermarkFontSize })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={labelClass}>透明度</p>
              <div className={chipGroupClass}>
                {WATERMARK_OPACITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={chipClass(draft.opacity === option.value)}
                    onClick={() => patch({ opacity: option.value as WatermarkOpacity })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={labelClass}>水印样式</p>
              <div className={chipGroupClass}>
                {([
                  { label: '单个底部', value: 'single' as WatermarkMode },
                  { label: '全图平铺', value: 'tile' as WatermarkMode },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={chipClass(draft.mode === option.value)}
                    onClick={() => patch({ mode: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {draft.mode === 'single' ? (
              <div>
                <p className={labelClass}>位置</p>
                <div className={chipGroupClass}>
                  {WATERMARK_POSITION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={chipClass(draft.position === option.value)}
                      onClick={() => patch({ position: option.value as WatermarkPosition })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <p className={labelClass}>倾斜角度</p>
                  <div className={chipGroupClass}>
                    {WATERMARK_ANGLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={chipClass(draft.angle === option.value)}
                        onClick={() => patch({ angle: option.value as WatermarkAngle })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={labelClass}>平铺密度</p>
                  <div className={chipGroupClass}>
                    {WATERMARK_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={chipClass(draft.density === option.value)}
                        onClick={() => patch({ density: option.value as WatermarkDensity })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    提示：平铺水印会叠加在卡面上；如需将海报重新导入裁切，建议使用单个底部水印或导出无水印版备份。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            取消
          </button>
          <button type="button" onClick={() => onSave(draft)} className={primaryButtonClass}>
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
