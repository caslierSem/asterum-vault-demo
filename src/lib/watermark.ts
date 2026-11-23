/** 海报主标题 localStorage 键 */
export const BOARD_TITLE_STORAGE_KEY = 'asterum_board_title';

/** 水印完整配置 localStorage 键 */
export const WATERMARK_CONFIG_STORAGE_KEY = 'asterum_board_watermark_config';

/** 标题清空后自动回落的默认文案 */
export const DEFAULT_BOARD_TITLE = 'PLAVE交换清单';

/** 水印布局：单条底部文字，或全图平铺 */
export type WatermarkMode = 'single' | 'tile';

/** 单条水印在底部的水平位置 */
export type WatermarkPosition = 'bottom-center' | 'bottom-left' | 'bottom-right';

/** 水印透明度档位 */
export type WatermarkOpacity = 0.15 | 0.3 | 0.5 | 0.8;

/** 平铺水印倾斜角度（度） */
export type WatermarkAngle = -30 | 0 | 30;

/** 平铺密度：稀疏 / 适中 / 密集 */
export type WatermarkDensity = 'sparse' | 'medium' | 'dense';

/** 水印常规字号档位 */
export type WatermarkFontSize = 'tiny' | 'small' | 'medium' | 'large';

/** 看板水印完整配置（整份 JSON 写入 localStorage） */
export interface WatermarkConfig {
  /** 水印文字；trim 后为空则三端均不渲染 */
  text: string;
  /** 预设色块对应的 hex */
  color: string;
  /** 透明度档位 */
  opacity: WatermarkOpacity;
  /** 单个底部 / 全图平铺 */
  mode: WatermarkMode;
  /** 仅 single 生效 */
  position: WatermarkPosition;
  /** 仅 tile 生效 */
  angle: WatermarkAngle;
  /** 仅 tile 生效 */
  density: WatermarkDensity;
  /** 常规字号：极小 / 小 / 中 / 大 */
  fontSize: WatermarkFontSize;
}

export interface WatermarkColorPreset {
  /** 色块展示名 */
  label: string;
  hex: string;
}

export const WATERMARK_COLOR_PRESETS: WatermarkColorPreset[] = [
  { label: '深灰', hex: '#334155' },
  { label: '浅灰', hex: '#94a3b8' },
  { label: '纯白', hex: '#ffffff' },
  { label: '海洋蓝', hex: '#0ea5e9' },
  { label: '星辰紫', hex: '#7c3aed' },
  { label: '樱花粉', hex: '#fb7185' },
  { label: '火焰红', hex: '#ef4444' },
  { label: '祖母绿', hex: '#059669' },
];

export const WATERMARK_OPACITY_OPTIONS: { label: string; value: WatermarkOpacity }[] = [
  { label: '15%', value: 0.15 },
  { label: '30%', value: 0.3 },
  { label: '50%', value: 0.5 },
  { label: '80%', value: 0.8 },
];

export const WATERMARK_ANGLE_OPTIONS: { label: string; value: WatermarkAngle }[] = [
  { label: '-30°', value: -30 },
  { label: '0°', value: 0 },
  { label: '30°', value: 30 },
];

export const WATERMARK_DENSITY_OPTIONS: { label: string; value: WatermarkDensity }[] = [
  { label: '稀疏', value: 'sparse' },
  { label: '适中', value: 'medium' },
  { label: '密集', value: 'dense' },
];

export const WATERMARK_POSITION_OPTIONS: { label: string; value: WatermarkPosition }[] = [
  { label: '底部居中', value: 'bottom-center' },
  { label: '底部居左', value: 'bottom-left' },
  { label: '底部居右', value: 'bottom-right' },
];

export const WATERMARK_FONT_SIZE_OPTIONS: { label: string; value: WatermarkFontSize }[] = [
  { label: '极小', value: 'tiny' },
  { label: '小', value: 'small' },
  { label: '中', value: 'medium' },
  { label: '大', value: 'large' },
];

/** 相对「小」档基准的倍率；基准已比初版整体小一档 */
export const WATERMARK_FONT_SIZE_SCALE: Record<WatermarkFontSize, number> = {
  tiny: 0.72,
  small: 1,
  medium: 1.28,
  large: 1.58,
};

/** 首次进入默认关闭水印（文字为空） */
export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  text: '',
  color: '#334155',
  opacity: 0.3,
  mode: 'single',
  position: 'bottom-center',
  angle: -30,
  density: 'medium',
  fontSize: 'small',
};

const OPACITY_SET = new Set<number>(WATERMARK_OPACITY_OPTIONS.map((item) => item.value));
const ANGLE_SET = new Set<number>(WATERMARK_ANGLE_OPTIONS.map((item) => item.value));
const COLOR_SET = new Set(WATERMARK_COLOR_PRESETS.map((item) => item.hex));

function isWatermarkMode(value: unknown): value is WatermarkMode {
  return value === 'single' || value === 'tile';
}

function isWatermarkPosition(value: unknown): value is WatermarkPosition {
  return value === 'bottom-center' || value === 'bottom-left' || value === 'bottom-right';
}

function isWatermarkDensity(value: unknown): value is WatermarkDensity {
  return value === 'sparse' || value === 'medium' || value === 'dense';
}

function isWatermarkFontSize(value: unknown): value is WatermarkFontSize {
  return value === 'tiny' || value === 'small' || value === 'medium' || value === 'large';
}

/** 单个底部水印字号（随容器宽度等比，预览与 1400px 导出占比接近） */
export function resolveSingleWatermarkFontPx(containerWidth: number, fontSize: WatermarkFontSize): number {
  const base = Math.min(Math.max(containerWidth, 1) * 0.012, 14);
  return Math.max(9, Math.round(base * WATERMARK_FONT_SIZE_SCALE[fontSize]));
}

/** 全图平铺水印字号：仅按容器总宽度与档位计算，与平铺密度无关 */
export function resolveTileWatermarkFontPx(containerWidth: number, fontSize: WatermarkFontSize): number {
  const base = Math.min(Math.max(containerWidth, 1) * 0.012, 14);
  return Math.max(9, Math.round(base * WATERMARK_FONT_SIZE_SCALE[fontSize]));
}

/**
 * 将未知对象规范化为完整配置，缺失或非法字段回落到默认值
 */
export function normalizeWatermarkConfig(raw: unknown): WatermarkConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WATERMARK_CONFIG };
  const source = raw as Partial<WatermarkConfig>;
  const opacity = typeof source.opacity === 'number' && OPACITY_SET.has(source.opacity)
    ? (source.opacity as WatermarkOpacity)
    : DEFAULT_WATERMARK_CONFIG.opacity;
  const angle = typeof source.angle === 'number' && ANGLE_SET.has(source.angle)
    ? (source.angle as WatermarkAngle)
    : DEFAULT_WATERMARK_CONFIG.angle;
  const color = typeof source.color === 'string' && COLOR_SET.has(source.color)
    ? source.color
    : DEFAULT_WATERMARK_CONFIG.color;

  return {
    text: typeof source.text === 'string' ? source.text : DEFAULT_WATERMARK_CONFIG.text,
    color,
    opacity,
    mode: isWatermarkMode(source.mode) ? source.mode : DEFAULT_WATERMARK_CONFIG.mode,
    position: isWatermarkPosition(source.position) ? source.position : DEFAULT_WATERMARK_CONFIG.position,
    angle,
    density: isWatermarkDensity(source.density) ? source.density : DEFAULT_WATERMARK_CONFIG.density,
    fontSize: isWatermarkFontSize(source.fontSize) ? source.fontSize : DEFAULT_WATERMARK_CONFIG.fontSize,
  };
}

export function loadBoardTitle(): string {
  try {
    const saved = localStorage.getItem(BOARD_TITLE_STORAGE_KEY)?.trim();
    return saved || DEFAULT_BOARD_TITLE;
  } catch {
    return DEFAULT_BOARD_TITLE;
  }
}

export function saveBoardTitle(raw: string): string {
  const trimmed = raw.trim();
  try {
    if (!trimmed) {
      localStorage.removeItem(BOARD_TITLE_STORAGE_KEY);
      return DEFAULT_BOARD_TITLE;
    }
    localStorage.setItem(BOARD_TITLE_STORAGE_KEY, trimmed);
    return trimmed;
  } catch {
    return trimmed || DEFAULT_BOARD_TITLE;
  }
}

export function loadWatermarkConfig(): WatermarkConfig {
  try {
    const saved = localStorage.getItem(WATERMARK_CONFIG_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_WATERMARK_CONFIG };
    return normalizeWatermarkConfig(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_WATERMARK_CONFIG };
  }
}

export function saveWatermarkConfig(config: WatermarkConfig): void {
  try {
    localStorage.setItem(WATERMARK_CONFIG_STORAGE_KEY, JSON.stringify(normalizeWatermarkConfig(config)));
  } catch {
    // 隐私模式等写入失败时静默忽略，界面仍使用内存中的配置
  }
}

/** 是否已配置有效水印文字（用于按钮高亮圆点） */
export function hasWatermarkText(config: WatermarkConfig): boolean {
  return config.text.trim().length > 0;
}
