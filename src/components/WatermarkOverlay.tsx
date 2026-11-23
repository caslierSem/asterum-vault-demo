import { useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSingleWatermarkFontPx,
  resolveTileWatermarkFontPx,
  type WatermarkConfig,
  type WatermarkDensity,
} from '@/lib/watermark';

interface WatermarkOverlayProps {
  config: WatermarkConfig;
}

interface TileLayout {
  fontSize: number;
  gapX: number;
  gapY: number;
  coverSize: number;
  rows: string[][];
}

/** 密度只改变间距比例，不参与字号计算 */
const DENSITY_GAP_RATIO: Record<WatermarkDensity, { x: number; y: number }> = {
  sparse: { x: 0.12, y: 0.1 },
  medium: { x: 0.07, y: 0.058 },
  dense: { x: 0.04, y: 0.034 },
};

const POSITION_JUSTIFY: Record<WatermarkConfig['position'], string> = {
  'bottom-center': 'center',
  'bottom-left': 'flex-start',
  'bottom-right': 'flex-end',
};

/**
 * 估算带 tracking-widest 的单行水印宽度，用于计算互不重叠的重复间隔
 */
function measureWatermarkTextWidth(text: string, fontPx: number): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return Math.max(text.length, 1) * fontPx;
    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    const letterSpacing = fontPx * 0.1;
    return ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  } catch {
    return Math.max(text.length, 1) * fontPx;
  }
}

/**
 * 看板水印：平铺模式覆盖海报容器；单个模式走文档流页脚，不遮挡卡片。
 * 平铺字号仅由容器宽度与档位决定；密度只改变重复间距。
 */
export default function WatermarkOverlay({ config }: WatermarkOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const text = config.text.trim();

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const applySize = (width: number, height: number) => {
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const border = entry.borderBoxSize?.[0];
      const width = Math.round(border?.inlineSize ?? entry.contentRect.width);
      const height = Math.round(border?.blockSize ?? entry.contentRect.height);
      applySize(width, height);
    });
    observer.observe(el);
    applySize(Math.round(el.clientWidth), Math.round(el.clientHeight));
    return () => observer.disconnect();
  }, [text, config.mode]);

  const tiles = useMemo<TileLayout | null>(() => {
    if (!text || config.mode !== 'tile' || size.width <= 0 || size.height <= 0) return null;

    const fontSize = resolveTileWatermarkFontPx(size.width, config.fontSize);
    const ratio = DENSITY_GAP_RATIO[config.density];
    const gapX = Math.max(fontSize * 1.6, size.width * ratio.x);
    const gapY = Math.max(fontSize * 1.4, size.width * ratio.y);
    const textWidth = measureWatermarkTextWidth(text, fontSize);
    const strideX = textWidth + gapX;
    const strideY = fontSize * 1.4 + gapY;
    // 对角线正方形：任意旋转角都能盖住细长竖屏长图的顶底两端
    const coverSize = Math.ceil(Math.hypot(size.width, size.height)) + 64;
    const colCount = Math.max(2, Math.ceil(coverSize / strideX) + 2);
    const rowCount = Math.max(2, Math.ceil(coverSize / strideY) + 2);
    const rows: string[][] = [];

    for (let row = 0; row < rowCount; row += 1) {
      const cells: string[] = [];
      for (let col = 0; col < colCount; col += 1) {
        cells.push(`${row}-${col}`);
      }
      rows.push(cells);
    }

    return { fontSize, gapX, gapY, coverSize, rows };
  }, [text, config.mode, config.density, config.fontSize, size.width, size.height]);

  if (!text) return null;

  const colorStyle = { color: config.color, opacity: config.opacity };

  if (config.mode === 'single') {
    return (
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="mt-10 flex w-full items-center px-1 pt-2"
        style={{ justifyContent: POSITION_JUSTIFY[config.position] }}
      >
        <span
          className="max-w-[92%] truncate font-semibold tracking-widest"
          style={{
            ...colorStyle,
            fontSize: size.width > 0 ? resolveSingleWatermarkFontPx(size.width, config.fontSize) : 12,
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div
        className="absolute flex flex-col"
        style={{
          left: '50%',
          top: '50%',
          width: tiles ? `${tiles.coverSize}px` : undefined,
          height: tiles ? `${tiles.coverSize}px` : undefined,
          gap: tiles ? `${tiles.gapY}px` : undefined,
          transform: `translate(-50%, -50%) rotate(${config.angle}deg)`,
        }}
      >
        {tiles?.rows.map((row, rowIndex) => (
          <div
            key={row[0]}
            className="flex shrink-0 items-center"
            style={{
              gap: `${tiles.gapX}px`,
              marginLeft: rowIndex % 2 === 1 ? tiles.gapX + tiles.fontSize : 0,
            }}
          >
            {row.map((key) => (
              <span
                key={key}
                className="shrink-0 whitespace-nowrap font-semibold tracking-widest"
                style={{ ...colorStyle, fontSize: tiles.fontSize }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
