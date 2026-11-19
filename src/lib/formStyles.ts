export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2.5 text-base text-slate-900 shadow-sm backdrop-blur-sm transition placeholder:text-slate-400 focus:border-teal-500/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10';

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-teal-700/20 transition-all hover:bg-teal-800 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-teal-600/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100';

// 搜索框的通用外壳样式（管边框、背景、磨砂、聚焦光晕）
export const searchShellClass =
  'rounded-xl border border-slate-200 bg-white/60 shadow-sm backdrop-blur-sm transition focus-within:border-teal-500/50 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-500/10';

// 搜索框内部 input 的通用样式（管文字、字号、去除原生边框）
export const searchInputClass =
  'w-full border-0 bg-transparent p-0 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0';

// 下拉菜单的通用容器样式（管毛玻璃、阴影、隐藏滚动条）
export const dropdownMenuClass =
  'absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 py-2 animate-in fade-in zoom-in-95 duration-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]';

// 下拉菜单里每一项的通用样式（管高度、悬停、文字截断限制）
export const dropdownItemClass =
  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors duration-150 hover:bg-teal-50/60';