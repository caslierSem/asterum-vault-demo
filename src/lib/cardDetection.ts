import { CELL_SIZE, buildMask, isStage1Foreground, type CandidateBox } from './cardMask';
import {
  MIN_CARD_WIDTH_RATIO,
  TYPICAL_POSTER_GAP_PX,
  candidateToComponent,
  centerInside,
  componentPixelBox,
  extractCardsFromMask,
  hasSlatePaddingBorder,
  mergeAndDedupe,
  sortInReadingOrder,
  splitContainer,
  type Rect,
} from './cardRegionSplit';

export type { Rect };

const ANALYSIS_MAX_SIDE = 1200;
/** 提分辨率保缝隙时的单边安全上限（放宽至 3600px 以保留超长海报的 12px 卡片间距） */
const ANALYSIS_HARD_MAX_SIDE = 3600;

/** 从本地文件读取图片并解码为 HTMLImageElement */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片，请换一个文件试试'));
    };
    image.src = url;
  });
}

/**
 * 两阶段自适应检测：
 * 1）严格白底第一阶段（兼容 weareplave 表格、保护浅色卡边缘）；
 * 2）动态提高超长海报分析分辨率以保住 12px 卡片间距，对灰底分组容器做第二阶段拆分；
 *    多卡粘连的第一阶段框在拆分失败时直接丢弃（宁缺毋滥），绝不原样输出整组大图。
 */
export function detectCardRegions(image: HTMLImageElement): Rect[] {
  const maxSide = Math.max(image.naturalWidth, image.naturalHeight);
  const baseScale = Math.min(1, ANALYSIS_MAX_SIDE / maxSide);
  // 保证 12px 卡片间距在缩放后至少占 2 个采样网格（8px），同时受单边 3600px 安全上限约束
  const gapFloorScale = (2 * CELL_SIZE) / TYPICAL_POSTER_GAP_PX;
  const hardCapScale = Math.min(1, ANALYSIS_HARD_MAX_SIDE / maxSide);
  const scale = Math.min(hardCapScale, Math.max(baseScale, gapFloorScale));

  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法处理这张图片');
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  // --- 第一阶段：严格白底阈值（weareplave 等白底图直接走此路径） ---
  const stage1 = buildMask(data, width, height, isStage1Foreground);
  const stage1MinCardWidth = width * MIN_CARD_WIDTH_RATIO;
  const { cards: stage1Cards, containers } = extractCardsFromMask(
    stage1.mask,
    stage1.cols,
    stage1.rows,
    width,
    stage1MinCardWidth,
  );

  const stage2Cards: CandidateBox[] = [];
  const replacedStage1 = new Set<CandidateBox>();
  const discardedStage1 = new Set<CandidateBox>();

  const markStage1Inside = (region: CandidateBox, discardIfNoSplit: boolean, gotSplits: boolean) => {
    for (const card of stage1Cards) {
      if (!centerInside(card, region)) continue;
      if (gotSplits) {
        replacedStage1.add(card);
      } else if (discardIfNoSplit) {
        discardedStage1.add(card);
      }
    }
  };

  // 偏宽/怪比例容器 → 第二阶段
  for (const container of containers) {
    const region = componentPixelBox(container);
    const { cards: splits, isMultiCard } = splitContainer(data, width, height, container, scale);
    if (splits.length > 0) {
      stage2Cards.push(...splits);
      markStage1Inside(region, false, true);
    } else if (isMultiCard) {
      // 判定为多卡容器却拆不出卡：丢掉第一阶段可能残留的粘连框
      markStage1Inside(region, true, false);
    }
  }

  // 比例已像单卡、但仍带 slate 边的分组（含 2 横排 / 2×2 / 双列多卡网格）
  for (const card of stage1Cards) {
    if (replacedStage1.has(card) || discardedStage1.has(card)) continue;
    if (!hasSlatePaddingBorder(data, width, height, card)) continue;

    const { cards: splits, isMultiCard } = splitContainer(
      data,
      width,
      height,
      candidateToComponent(card),
      scale,
    );

    if (isMultiCard) {
      // 多卡组：绝不保留第一阶段整组框（宁缺毋滥）
      discardedStage1.add(card);
      if (splits.length >= 1) {
        replacedStage1.add(card);
        stage2Cards.push(...splits);
      }
      continue;
    }

    // 单卡灰底组：用第二阶段收紧裁边
    if (splits.length >= 1) {
      replacedStage1.add(card);
      stage2Cards.push(...splits);
    }
  }

  const toOriginal = (value: number) => Math.round(value / scale);
  const toRect = (box: CandidateBox): Rect => ({
    x: toOriginal(box.x),
    y: toOriginal(box.y),
    width: toOriginal(box.width),
    height: toOriginal(box.height),
  });

  const filteredStage1 = stage1Cards.filter(
    (card) => !replacedStage1.has(card) && !discardedStage1.has(card),
  );

  const merged = mergeAndDedupe([
    ...filteredStage1.map(toRect),
    ...stage2Cards.map(toRect),
  ]);

  return sortInReadingOrder(merged);
}

/** 按识别出的矩形区域裁切原图到独立 Canvas */
export function cropToCanvas(image: HTMLImageElement, rect: Rect, zoom = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * zoom);
  canvas.height = Math.round(rect.height * zoom);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理这张图片');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** 将裁切后的 Canvas 导出为高质量 JPEG Blob */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法导出物品图片'))),
      'image/jpeg',
      0.92,
    );
  });
}
