import {
  CELL_SIZE,
  GRAY_BG_MAX_CHROMA,
  GRAY_BG_MIN,
  STAGE2_MIN_CELL_CONTENT_RATIO,
  buildMask,
  clearMaskCols,
  clearMaskRows,
  detachCaptionBands,
  detachTopTags,
  findComponents,
  isStage2Foreground,
  trimComponentBox,
  type CandidateBox,
  type Component,
  type Connectivity,
} from './cardMask';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 海报卡片间典型最小间距（gap-3 = 12px） */
export const TYPICAL_POSTER_GAP_PX = 12;
/** 典型海报单张卡面尺寸（与 SwapBoardCard 一致） */
const TYPICAL_CARD_WIDTH_PX = 160;
const TYPICAL_CARD_HEIGHT_PX = 213;

/** 第一阶段单卡相对整图最小宽度占比（weareplave 白底表保持 10%） */
export const MIN_CARD_WIDTH_RATIO = 0.1;
/** 第二阶段（双列超长海报场景）放宽单卡相对整图最小宽度占比，防止双列单卡被误杀 */
const STAGE2_MIN_CARD_WIDTH_RATIO = 0.05;
/** 第二阶段单卡相对当前分组容器的最小宽度占比 */
const STAGE2_MIN_ROI_WIDTH_RATIO = 0.16;

/** 常规电脑/全图海报的单卡最大宽度占比上限（拦截双列海报里的 2×3 粘连大框） */
const MAX_CARD_WIDTH_RATIO_WIDE = 0.32;
/** 窄幅手机竖屏截屏的单卡最大宽度占比上限（允许一排 1~2 张卡） */
const MAX_CARD_WIDTH_RATIO_NARROW = 0.62;

const MIN_CARD_ASPECT = 0.8;
const MAX_CARD_ASPECT = 2.2;
const MIN_CARD_FILL = 0.7;

/** 宽度占画布比例超过此值的连通域，视为分组容器候选 */
const CONTAINER_WIDTH_RATIO = 0.2;
/** 连通域至少包含这么多前景网格，才值得二次拆分 */
const CONTAINER_MIN_CELLS = 40;

const DEDUPE_IOU = 0.45;

/**
 * 投影谷底判定：谷值 ≤ 相邻峰中较小者的该比例，才算有效 gutter。
 * 用于识别「一张卡」其实是多卡横排/田字格。
 */
const VALLEY_PEAK_RATIO = 0.35;
/** 谷底至少连续这么多网格，才动手切开 */
const VALLEY_MIN_SPAN = 1;

// --- 投影谷底：识别并切开多卡 gutter ---

/** 按列或按行累加前景网格数，得到一维投影曲线 */
function projectAxis(mask: Uint8Array, cols: number, rows: number, axis: 'col' | 'row'): Float32Array {
  if (axis === 'col') {
    const projection = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let r = 0; r < rows; r++) {
        if (mask[r * cols + c]) n++;
      }
      projection[c] = n;
    }
    return projection;
  }

  const projection = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0; c < cols; c++) {
      if (mask[r * cols + c]) n++;
    }
    projection[r] = n;
  }
  return projection;
}

interface ValleySpan {
  start: number;
  end: number;
}

/**
 * 在投影曲线上找「峰-谷-峰」结构中的谷底区间。
 * 谷值需 ≤ 两侧峰较小者 × VALLEY_PEAK_RATIO，且跨度 ≥ VALLEY_MIN_SPAN。
 */
function findValleys(projection: Float32Array): ValleySpan[] {
  const n = projection.length;
  if (n < 5) return [];

  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (projection[i] >= projection[i - 1] && projection[i] >= projection[i + 1] && projection[i] > 0) {
      if (peaks.length > 0 && i - peaks[peaks.length - 1] <= 2) {
        if (projection[i] > projection[peaks[peaks.length - 1]]) {
          peaks[peaks.length - 1] = i;
        }
      } else {
        peaks.push(i);
      }
    }
  }

  // 端点若明显高于内侧，也当作峰，避免漏掉靠边的卡
  if (projection[0] > 0 && (peaks.length === 0 || peaks[0] > 2)) {
    let edge = 0;
    while (edge < n - 1 && projection[edge + 1] >= projection[edge]) edge++;
    if (projection[edge] > 0) peaks.unshift(edge);
  }
  if (projection[n - 1] > 0 && (peaks.length === 0 || peaks[peaks.length - 1] < n - 3)) {
    let edge = n - 1;
    while (edge > 0 && projection[edge - 1] >= projection[edge]) edge--;
    if (projection[edge] > 0) peaks.push(edge);
  }

  const uniquePeaks = [...new Set(peaks)].sort((a, b) => a - b);
  const valleys: ValleySpan[] = [];

  for (let p = 0; p < uniquePeaks.length - 1; p++) {
    const left = uniquePeaks[p];
    const right = uniquePeaks[p + 1];
    if (right - left < 2) continue;

    let minVal = Infinity;
    let minAt = left + 1;
    for (let i = left + 1; i < right; i++) {
      if (projection[i] < minVal) {
        minVal = projection[i];
        minAt = i;
      }
    }

    const peakFloor = Math.min(projection[left], projection[right]);
    if (peakFloor <= 0) continue;
    if (minVal > peakFloor * VALLEY_PEAK_RATIO) continue;

    let start = minAt;
    let end = minAt;
    const threshold = Math.max(minVal + 1e-6, peakFloor * VALLEY_PEAK_RATIO);
    while (start > left + 1 && projection[start - 1] <= threshold) start--;
    while (end < right - 1 && projection[end + 1] <= threshold) end++;

    if (end - start + 1 < VALLEY_MIN_SPAN) continue;
    valleys.push({ start, end });
  }

  return valleys;
}

/** 把投影谷底对应的行/列在 mask 上硬清零，切断 gutter 粘连 */
function clearValleys(
  mask: Uint8Array,
  cols: number,
  rows: number,
  colValleys: ValleySpan[],
  rowValleys: ValleySpan[],
): void {
  for (const v of colValleys) {
    clearMaskCols(mask, cols, rows, v.start, v.end);
  }
  for (const v of rowValleys) {
    clearMaskRows(mask, cols, v.start, v.end);
  }
}

/** 判断 mask 内部是否存在明显的横向或纵向 gutter（多卡信号） */
function hasInternalGutters(mask: Uint8Array, cols: number, rows: number): boolean {
  const colValleys = findValleys(projectAxis(mask, cols, rows, 'col'));
  const rowValleys = findValleys(projectAxis(mask, cols, rows, 'row'));
  return colValleys.length > 0 || rowValleys.length > 0;
}

/**
 * 按谷底切线把 ROI 划成网格子矩形。
 * 谷区间本身丢弃；返回谷两侧（及两端）的局部网格坐标子区域。
 */
function partitionByValleys(
  cols: number,
  rows: number,
  colValleys: ValleySpan[],
  rowValleys: ValleySpan[],
): Array<{ minCol: number; maxCol: number; minRow: number; maxRow: number }> {
  const colRanges: Array<{ min: number; max: number }> = [];
  let prev = 0;
  for (const v of colValleys) {
    if (v.start - 1 >= prev) colRanges.push({ min: prev, max: v.start - 1 });
    prev = v.end + 1;
  }
  if (prev <= cols - 1) colRanges.push({ min: prev, max: cols - 1 });

  const rowRanges: Array<{ min: number; max: number }> = [];
  prev = 0;
  for (const v of rowValleys) {
    if (v.start - 1 >= prev) rowRanges.push({ min: prev, max: v.start - 1 });
    prev = v.end + 1;
  }
  if (prev <= rows - 1) rowRanges.push({ min: prev, max: rows - 1 });

  if (colRanges.length === 0) colRanges.push({ min: 0, max: cols - 1 });
  if (rowRanges.length === 0) rowRanges.push({ min: 0, max: rows - 1 });

  const cells: Array<{ minCol: number; maxCol: number; minRow: number; maxRow: number }> = [];
  for (const rr of rowRanges) {
    for (const cr of colRanges) {
      if (cr.max < cr.min || rr.max < rr.min) continue;
      cells.push({ minCol: cr.min, maxCol: cr.max, minRow: rr.min, maxRow: rr.max });
    }
  }
  return cells;
}

function componentToCandidate(
  mask: Uint8Array,
  cols: number,
  component: Component,
): CandidateBox {
  const trimmed = trimComponentBox(mask, cols, component);
  const boxCols = trimmed.maxCol - trimmed.minCol + 1;
  const boxRows = trimmed.maxRow - trimmed.minRow + 1;
  const cellsInTrimmed = countCellsInBox(mask, cols, trimmed);
  return {
    x: trimmed.minCol * CELL_SIZE,
    y: trimmed.minRow * CELL_SIZE,
    width: boxCols * CELL_SIZE,
    height: boxRows * CELL_SIZE,
    fill: cellsInTrimmed / Math.max(1, boxCols * boxRows),
  };
}

function countCellsInBox(
  mask: Uint8Array,
  cols: number,
  box: { minCol: number; maxCol: number; minRow: number; maxRow: number },
): number {
  let n = 0;
  for (let r = box.minRow; r <= box.maxRow; r++) {
    for (let c = box.minCol; c <= box.maxCol; c++) {
      if (mask[r * cols + c]) n++;
    }
  }
  return n;
}

/**
 * 校验候选框是否符合单卡几何特征（同时限制最小与最大宽度，杜绝巨无霸多卡框漏出）。
 * @param minWidthPx 允许的最小像素宽度（Stage 1 保持整图 10%，Stage 2 适配双列超长海报放宽门槛）
 * @param imageWidth 当前分析画布的总宽度（用于计算单卡最大宽度上限）
 */
function isCardCandidate(box: CandidateBox, minWidthPx: number, imageWidth: number): boolean {
  // 手机竖屏局部截屏缩放后宽度通常 ≤ 900px，放宽上限至 62%；电脑/双列超长海报（宽 > 900px）严格限制在 32% 以内，杜绝 2×3 粘连大框
  const maxRatio = imageWidth <= 900 ? MAX_CARD_WIDTH_RATIO_NARROW : MAX_CARD_WIDTH_RATIO_WIDE;
  return (
    box.width >= minWidthPx &&
    box.width <= imageWidth * maxRatio &&
    box.height / box.width >= MIN_CARD_ASPECT &&
    box.height / box.width <= MAX_CARD_ASPECT &&
    box.fill >= MIN_CARD_FILL
  );
}

/** 偏宽或比例不像单卡、且内容足够多的连通域 → 灰底分组容器 */
function isContainerCandidate(component: Component, imageWidth: number): boolean {
  const boxW = (component.maxCol - component.minCol + 1) * CELL_SIZE;
  const boxH = (component.maxRow - component.minRow + 1) * CELL_SIZE;
  const aspect = boxH / boxW;
  const wide = boxW >= imageWidth * CONTAINER_WIDTH_RATIO;
  const oddAspect = aspect < MIN_CARD_ASPECT || aspect > MAX_CARD_ASPECT;
  return component.cells >= CONTAINER_MIN_CELLS && (wide || oddAspect);
}

/** 根据缩放比例估算灰底容器内的典型卡面行列数（用于多卡判定与无缝时的最后栅格兜底） */
function estimateGridCount(
  roiWidth: number,
  roiHeight: number,
  scale: number,
): { nCols: number; nRows: number } {
  const cardW = TYPICAL_CARD_WIDTH_PX * scale;
  const cardH = TYPICAL_CARD_HEIGHT_PX * scale;
  const gap = TYPICAL_POSTER_GAP_PX * scale;
  const nCols = Math.max(1, Math.min(8, Math.round((roiWidth + gap) / Math.max(8, cardW + gap))));
  const nRows = Math.max(1, Math.min(12, Math.round((roiHeight + gap) / Math.max(8, cardH + gap))));
  return { nCols, nRows };
}

/**
 * 判断灰底容器是否明显包含多张卡（横宽多卡、明显宽于单卡、或几何估算 ≥ 2 格）。
 * 满足任一条件时，Stage 1 整组框绝不原样保留（宁缺毋滥）。
 */
function isOversizedMultiCardGroup(
  box: { width: number; height: number },
  imageWidth: number,
  scale: number,
): boolean {
  if (box.width > 1.55 * box.height) return true;
  if (box.width > imageWidth * 0.22) return true;
  const { nCols, nRows } = estimateGridCount(box.width, box.height, scale);
  return nCols * nRows >= 2;
}
/** slate-100/200 垫色；近纯白页面底不算（避免误伤白底表） */
function isSlatePadding(r: number, g: number, b: number): boolean {
  if (r >= 250 && g >= 250 && b >= 250) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > GRAY_BG_MIN && g > GRAY_BG_MIN && b > GRAY_BG_MIN && max - min < GRAY_BG_MAX_CHROMA;
}

/**
 * 采样包围盒四边：若大量像素是 slate 垫色，说明这是换卡海报灰底组
 *（即便比例已像单卡，内部仍可能含灰边/标题/多卡）。
 */
export function hasSlatePaddingBorder(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  box: CandidateBox,
): boolean {
  let slate = 0;
  let total = 0;
  const sample = (x: number, y: number) => {
    const px = Math.max(0, Math.min(imageWidth - 1, Math.round(x)));
    const py = Math.max(0, Math.min(imageHeight - 1, Math.round(y)));
    const i = (py * imageWidth + px) * 4;
    total++;
    if (isSlatePadding(data[i], data[i + 1], data[i + 2])) slate++;
  };

  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sample(box.x + t * box.width, box.y + 1);
    sample(box.x + t * box.width, box.y + box.height - 2);
    sample(box.x + 1, box.y + t * box.height);
    sample(box.x + box.width - 2, box.y + t * box.height);
  }

  return total > 0 && slate / total >= 0.45;
}

export function candidateToComponent(box: CandidateBox): Component {
  return {
    minCol: Math.floor(box.x / CELL_SIZE),
    maxCol: Math.max(Math.floor(box.x / CELL_SIZE), Math.ceil((box.x + box.width) / CELL_SIZE) - 1),
    minRow: Math.floor(box.y / CELL_SIZE),
    maxRow: Math.max(Math.floor(box.y / CELL_SIZE), Math.ceil((box.y + box.height) / CELL_SIZE) - 1),
    cells: CONTAINER_MIN_CELLS,
  };
}

export function componentPixelBox(component: Component): CandidateBox {
  return {
    x: component.minCol * CELL_SIZE,
    y: component.minRow * CELL_SIZE,
    width: (component.maxCol - component.minCol + 1) * CELL_SIZE,
    height: (component.maxRow - component.minRow + 1) * CELL_SIZE,
    fill: 1,
  };
}

export function centerInside(box: CandidateBox, region: CandidateBox): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    cx >= region.x &&
    cx <= region.x + region.width &&
    cy >= region.y &&
    cy <= region.y + region.height
  );
}

function rectIou(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function mergeAndDedupe(rects: Rect[]): Rect[] {
  const kept: Rect[] = [];
  for (const rect of rects) {
    const overlapIndex = kept.findIndex((other) => rectIou(rect, other) >= DEDUPE_IOU);
    if (overlapIndex < 0) {
      kept.push(rect);
      continue;
    }
    // 重叠时保留更紧的裁切框
    const existing = kept[overlapIndex];
    if (rect.width * rect.height < existing.width * existing.height) {
      kept[overlapIndex] = rect;
    }
  }
  return kept;
}

export function sortInReadingOrder(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const rows: Rect[][] = [];
  for (const rect of sorted) {
    const currentRow = rows[rows.length - 1];
    const rowTop = currentRow ? Math.min(...currentRow.map((r) => r.y)) : 0;
    const rowHeight = currentRow ? Math.max(...currentRow.map((r) => r.height)) : 0;
    if (currentRow && rect.y < rowTop + rowHeight / 2) {
      currentRow.push(rect);
    } else {
      rows.push([rect]);
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * 从 mask 提取单卡候选与容器候选。
 * @param minCardWidthPx 单卡最小像素宽度门槛
 * @param connectivity 连通性；第二阶段传 4
 * @param cutGutters 是否先按投影谷底切开 gutter
 */
export function extractCardsFromMask(
  mask: Uint8Array,
  cols: number,
  rows: number,
  imageWidth: number,
  minCardWidthPx: number,
  originX = 0,
  originY = 0,
  connectivity: Connectivity = 8,
  cutGutters = false,
): { cards: CandidateBox[]; containers: Component[]; hadGutters: boolean } {
  const colValleys = findValleys(projectAxis(mask, cols, rows, 'col'));
  const rowValleys = findValleys(projectAxis(mask, cols, rows, 'row'));
  const hadGutters = colValleys.length > 0 || rowValleys.length > 0;

  if (cutGutters && hadGutters) {
    clearValleys(mask, cols, rows, colValleys, rowValleys);
  }

  detachCaptionBands(mask, cols, rows);

  const cards: CandidateBox[] = [];
  const containers: Component[] = [];

  for (const component of findComponents(mask, cols, rows, connectivity)) {
    const candidate = componentToCandidate(mask, cols, component);
    const absolute: CandidateBox = {
      ...candidate,
      x: candidate.x + originX,
      y: candidate.y + originY,
    };
    if (isCardCandidate(absolute, minCardWidthPx, imageWidth)) {
      cards.push(absolute);
    } else if (isContainerCandidate(component, imageWidth)) {
      containers.push({
        ...component,
        minCol: component.minCol + Math.floor(originX / CELL_SIZE),
        maxCol: component.maxCol + Math.floor(originX / CELL_SIZE),
        minRow: component.minRow + Math.floor(originY / CELL_SIZE),
        maxRow: component.maxRow + Math.floor(originY / CELL_SIZE),
      });
    }
  }

  return { cards, containers, hadGutters };
}

/**
 * 在局部网格子块内运行单卡提取（包含断底部标题 + 四连通 + 边缘精修）
 */
function extractBestCardInSubGrid(
  sourceMask: Uint8Array,
  sourceCols: number,
  range: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  imageWidth: number,
  minCardWidthPx: number,
  originX: number,
  originY: number,
): CandidateBox[] {
  const partCols = range.maxCol - range.minCol + 1;
  const partRows = range.maxRow - range.minRow + 1;
  if (partCols < 2 || partRows < 2) return [];

  const local = new Uint8Array(partCols * partRows);
  for (let r = range.minRow; r <= range.maxRow; r++) {
    for (let c = range.minCol; c <= range.maxCol; c++) {
      local[(r - range.minRow) * partCols + (c - range.minCol)] = sourceMask[r * sourceCols + c];
    }
  }

  detachCaptionBands(local, partCols, partRows);

  const cards: CandidateBox[] = [];
  for (const component of findComponents(local, partCols, partRows, 4)) {
    const candidate = componentToCandidate(local, partCols, component);
    const absolute: CandidateBox = {
      ...candidate,
      x: candidate.x + originX + range.minCol * CELL_SIZE,
      y: candidate.y + originY + range.minRow * CELL_SIZE,
    };
    if (isCardCandidate(absolute, minCardWidthPx, imageWidth)) {
      cards.push(absolute);
    }
  }
  return cards;
}

/**
 * 谷底切开后仍粘连时的兜底：按真实投影谷底划分子 ROI，在每个格子里再提一次连通域。
 */
function splitByValleyPartitions(
  mask: Uint8Array,
  cols: number,
  rows: number,
  imageWidth: number,
  minCardWidthPx: number,
  originX: number,
  originY: number,
): CandidateBox[] {
  const colValleys = findValleys(projectAxis(mask, cols, rows, 'col'));
  const rowValleys = findValleys(projectAxis(mask, cols, rows, 'row'));
  if (colValleys.length === 0 && rowValleys.length === 0) return [];

  const partitions = partitionByValleys(cols, rows, colValleys, rowValleys);
  const cards: CandidateBox[] = [];

  for (const part of partitions) {
    cards.push(
      ...extractBestCardInSubGrid(mask, cols, part, imageWidth, minCardWidthPx, originX, originY),
    );
  }

  return cards;
}

/**
 * 第二阶段：在灰底分组框 ROI 内用收紧的背景规则 + 剥离顶部 tag + 谷底切割 + 四连通，拆出单卡。
 * 完全依赖真实投影谷底切分，拆不出时宁缺毋滥，绝不盲猜均匀栅格导致切出巨无霸整列图。
 */
export function splitContainer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  container: Component,
  scale: number,
): { cards: CandidateBox[]; hadGutters: boolean; isMultiCard: boolean } {
  const pad = CELL_SIZE;
  const roi = {
    x0: Math.max(0, container.minCol * CELL_SIZE - pad),
    y0: Math.max(0, container.minRow * CELL_SIZE - pad),
    x1: Math.min(width, (container.maxCol + 1) * CELL_SIZE + pad),
    y1: Math.min(height, (container.maxRow + 1) * CELL_SIZE + pad),
  };

  const roiWidth = roi.x1 - roi.x0;
  const roiHeight = roi.y1 - roi.y0;
  const stage2MinCardWidth = Math.min(
    width * MIN_CARD_WIDTH_RATIO,
    Math.max(width * STAGE2_MIN_CARD_WIDTH_RATIO, roiWidth * STAGE2_MIN_ROI_WIDTH_RATIO),
  );

  const built = buildMask(
    data,
    width,
    height,
    isStage2Foreground,
    roi,
    STAGE2_MIN_CELL_CONTENT_RATIO,
  );

  // 先剥离容器左上角 #主题 标签文字带，避免污染首卡与顶部投影
  detachTopTags(built.mask, built.cols, built.rows);

  // 保留一份未切割的干净 mask，供 gutter 检测与分区兜底
  const maskForGutters = new Uint8Array(built.mask);
  const guttersPresent = hasInternalGutters(maskForGutters, built.cols, built.rows);
  const multiCard =
    guttersPresent || isOversizedMultiCardGroup({ width: roiWidth, height: roiHeight }, width, scale);

  const working = new Uint8Array(built.mask);
  const { cards: primary } = extractCardsFromMask(
    working,
    built.cols,
    built.rows,
    width,
    stage2MinCardWidth,
    built.originX,
    built.originY,
    4,
    true,
  );

  if (primary.length >= 2) {
    return { cards: primary, hadGutters: guttersPresent, isMultiCard: multiCard };
  }

  if (guttersPresent) {
    const partitioned = splitByValleyPartitions(
      maskForGutters,
      built.cols,
      built.rows,
      width,
      stage2MinCardWidth,
      built.originX,
      built.originY,
    );
    if (partitioned.length > 0) {
      return { cards: partitioned, hadGutters: true, isMultiCard: true };
    }
    return { cards: primary, hadGutters: true, isMultiCard: true };
  }

  // 无内部 gutter 的单卡灰底组：允许收紧后返回 0～1 张
  return { cards: primary, hadGutters: false, isMultiCard: multiCard };
}
