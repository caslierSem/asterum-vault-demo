import { ArrowLeft, ImagePlus, LayoutGrid, type LucideIcon } from 'lucide-react';

interface EntryModeSelectorProps {
  /** 进入单张精细录入 / 批量多图导入 */
  onSelectSingle: () => void;
  /** 进入长截图或换卡海报识别 */
  onSelectCollage: () => void;
}

interface ModeCard {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/** 录入子页顶部：回到方式选择页，不改表单或识别流程 */
export function SwitchEntryModeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" />
      切换录入方式
    </button>
  );
}

/** 录入方式选择：单/多图与拼图两张大卡片 */
export default function EntryModeSelector({ onSelectSingle, onSelectCollage }: EntryModeSelectorProps) {
  const cards: ModeCard[] = [
    {
      title: '单/多图',
      subtitle: '单张精细录入、拍照裁剪，\n或批量多图导入',
      icon: ImagePlus,
      onSelect: onSelectSingle,
    },
    {
      title: '拼图',
      subtitle: '长截图或换卡海报智能识别裁切导入',
      icon: LayoutGrid,
      onSelect: onSelectCollage,
    },
  ];

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">选择录入方式</h1>
        <p className="mt-1 text-sm text-slate-500">按图片来源选择对应入口，之后仍可随时切换。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map(({ title, subtitle, icon: Icon, onSelect }) => (
          <button
            key={title}
            type="button"
            onClick={onSelect}
            className="flex min-h-11 flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-teal-600 hover:bg-teal-50/40 active:scale-[0.99] sm:min-h-44 sm:p-8"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-slate-900">{title}</span>
              <span className="mt-1 block whitespace-pre-line text-sm leading-relaxed text-slate-500">{subtitle}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
