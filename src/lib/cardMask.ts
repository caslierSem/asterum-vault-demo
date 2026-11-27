/** 采样网格边长（像素）。切分与两阶段编排按同一尺度换算包围盒。 */
export const CELL_SIZE = 4;

/** 第一阶段：纯白底表格截图（如 weareplave.com），阈值保持严格 */
const BACKGROUND_THRESHOLD = 240;

/**
 * 第二阶段：把低饱和浅灰（slate-100/200 ≈ 241,245,249 / 226,232,240）
 * 当作背景，让换卡海报的分组灰底溶解，露出单张卡面。
 */
export const GRAY_BG_MIN = 212;
export const GRAY_BG_MAX_CHROMA = 16;

/** 第一阶段网格前景占比阈值（保留浅色卡边缘） */
const MIN_CELL_CONTENT_RATIO = 0.02;
/** 第二阶段提高阈值，忽略 gutter 里 shadow-sm 的脏像素 */
export const STAGE2_MIN_CELL_CONTENT_RATIO = 0.12;

/** 标题/价格带：高度 ≤ 此网格数，且与上方主体有低密度断层时断开 */
const CAPTION_MAX_GRID_HEIGHT = 3;
const CAPTION_MIN_BODY_HEIGHT = 5;
const CAPTION_GAP_DENSITY = 0.03;

/** 顶部分组标签（如 # 小卡/...）：扫描顶部区域最大比例与最大网格高度 */
const TOP_TAG_SCAN_RATIO = 0.22;
const TOP_TAG_MAX_GRID_HEIGHT = 6;
const TOP_TAG_GAP_DENSITY = 0.04;

/** 包围盒精修：前景密度低于此值的边缘行/列向内收（最多 TRIM_MAX_INSET 格） */
const TRIM_DENSITY = 0.35;
const TRIM_MAX_INSET = 2;

export type Connectivity = 4 | 8;

export interface Component {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  cells: number;
}

export interface CandidateBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number;
}

type ForegroundTest = (r: number, g: number, b: number) => boolean;

/** 第一阶段前景判定：非纯白像素即视为前景 */
export function isStage1Foreground(r: number, g: number, b: number): boolean {
  return r < BACKGROUND_THRESHOLD || g < BACKGROUND_THRESHOLD || b < BACKGROUND_THRESHOLD;
}

/** 第二阶段前景判定：灰底分组框内把浅灰/近白视为背景，其余视为卡面或文字前景 */
export function isStage2Foreground(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (r > GRAY_BG_MIN && g > GRAY_BG_MIN && b > GRAY_BG_MIN && max - min < GRAY_BG_MAX_CHROMA) {
    return false;
  }
  return true;
}

/**
 * 在二值 mask 上提取连通域。
 * @param connectivity 8=含对角（第一阶段）；4=仅上下左右（第二阶段，减少对角阴影粘连）
 */
export function findComponents(
  mask: Uint8Array,
  cols: number,
  rows: number,
  connectivity: Connectivity = 8,
): Component[] {
  const visited = new Uint8Array(mask.length);
  const components: Component[] = [];
  const stack: number[] = [];
  const step = 1;
  const neighbors: Array<[number, number]> =
    connectivity === 4
      ? [
          [-step, 0],
          [step, 0],
          [0, -step],
          [0, step],
        ]
      : [
          [-step, -step],
          [-step, 0],
          [-step, step],
          [0, -step],
          [0, step],
          [step, -step],
          [step, 0],
          [step, step],
        ];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    const component: Component = {
      minCol: cols,
      maxCol: 0,
      minRow: rows,
      maxRow: 0,
      cells: 0,
    };
    visited[start] = 1;
    stack.push(start);

    while (stack.length > 0) {
      const index = stack.pop()!;
      const row = Math.floor(index / cols);
      const col = index % cols;
      component.cells++;
      component.minCol = Math.min(component.minCol, col);
      component.maxCol = Math.max(component.maxCol, col);
      component.minRow = Math.min(component.minRow, row);
      component.maxRow = Math.max(component.maxRow, row);

      for (const [dr, dc] of neighbors) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const next = nr * cols + nc;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    components.push(component);
  }

  return components;
}
/**
 * 剥离灰底分组容器顶部的 #主题 标签行（仅第二阶段调用，在投影谷底切割之前执行）：
 * 扫描顶部约 22% 高度内、高度 ≤ 6 格的短前景带；若其下方存在明显空隙并紧接更高的卡面主体，
 * 则清掉该标签文字带，防止其粘连首张卡片或抬高顶部投影。
 */
export function detachTopTags(mask: Uint8Array, cols: number, rows: number): void {
  const scanLimit = Math.min(rows, Math.max(4, Math.ceil(rows * TOP_TAG_SCAN_RATIO)));
  const density = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0; c < cols; c++) {
      if (mask[r * cols + c]) n++;
    }
    density[r] = n / cols;
  }

  const isGap = (r: number) => density[r] < TOP_TAG_GAP_DENSITY;
  let r = 0;

  while (r < scanLimit) {
    while (r < scanLimit && isGap(r)) r++;
    if (r >= scanLimit) break;

    const start = r;
    while (r < rows && !isGap(r)) r++;
    const end = r - 1;
    const bandHeight = end - start + 1;

    // 已经遇到厚实的卡面主体（高度超过标签阈值），停止向下扫描
    if (bandHeight > TOP_TAG_MAX_GRID_HEIGHT) break;

    // 统计标签带下方的空白间隙高度
    let nextBodyStart = end + 1;
    while (nextBodyStart < rows && isGap(nextBodyStart)) nextBodyStart++;
    const gapSize = nextBodyStart - end - 1;

    if (nextBodyStart >= rows) {
      clearMaskRows(mask, cols, start, end);
      continue;
    }

    // 计算下方紧接主体的连续高度
    let nextBodyEnd = nextBodyStart;
    while (nextBodyEnd + 1 < rows && !isGap(nextBodyEnd + 1)) nextBodyEnd++;
    const nextBodyHeight = nextBodyEnd - nextBodyStart + 1;

    if (gapSize >= 1 && nextBodyHeight >= CAPTION_MIN_BODY_HEIGHT) {
      clearMaskRows(mask, cols, start, end);
      r = nextBodyStart;
    } else {
      break;
    }
  }
}

/**
 * 断开卡面下方的标题/价格细带：高度 ≤ 3 格，且与上方主体之间有明显低密度断层。
 * 同时清掉上方没有主体的孤立细线噪点。
 */
export function detachCaptionBands(mask: Uint8Array, cols: number, rows: number): void {
  const density = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0; c < cols; c++) {
      if (mask[r * cols + c]) n++;
    }
    density[r] = n / cols;
  }

  const isGap = (r: number) => density[r] < CAPTION_GAP_DENSITY;

  let r = 0;
  while (r < rows) {
    while (r < rows && isGap(r)) r++;
    if (r >= rows) break;

    const start = r;
    while (r < rows && !isGap(r)) r++;
    const end = r - 1;
    const bandHeight = end - start + 1;

    if (bandHeight > CAPTION_MAX_GRID_HEIGHT) continue;

    let prevEnd = start - 1;
    while (prevEnd >= 0 && isGap(prevEnd)) prevEnd--;

    if (prevEnd < 0) {
      clearMaskRows(mask, cols, start, end);
      continue;
    }

    let prevStart = prevEnd;
    while (prevStart > 0 && !isGap(prevStart - 1)) prevStart--;
    const prevHeight = prevEnd - prevStart + 1;
    const gapSize = start - prevEnd - 1;

    if (prevHeight >= CAPTION_MIN_BODY_HEIGHT && gapSize >= 1) {
      clearMaskRows(mask, cols, start, end);
    }
  }
}

/** 将指定行区间的网格清零 */
export function clearMaskRows(mask: Uint8Array, cols: number, start: number, end: number): void {
  for (let rr = start; rr <= end; rr++) {
    const base = rr * cols;
    for (let c = 0; c < cols; c++) mask[base + c] = 0;
  }
}

/** 将指定列区间的网格清零 */
export function clearMaskCols(mask: Uint8Array, cols: number, rows: number, start: number, end: number): void {
  for (let r = 0; r < rows; r++) {
    const base = r * cols;
    for (let c = start; c <= end; c++) mask[base + c] = 0;
  }
}

/**
 * 自外向内修剪包围盒：去掉前景密度过低的边缘行/列（残留灰边、软阴影），每侧最多收 2 格。
 */
export function trimComponentBox(
  mask: Uint8Array,
  cols: number,
  component: Component,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  let { minCol, maxCol, minRow, maxRow } = component;

  const rowDensity = (row: number) => {
    const width = maxCol - minCol + 1;
    if (width <= 0) return 0;
    let n = 0;
    for (let c = minCol; c <= maxCol; c++) {
      if (mask[row * cols + c]) n++;
    }
    return n / width;
  };

  const colDensity = (col: number) => {
    const height = maxRow - minRow + 1;
    if (height <= 0) return 0;
    let n = 0;
    for (let r = minRow; r <= maxRow; r++) {
      if (mask[r * cols + col]) n++;
    }
    return n / height;
  };

  for (let i = 0; i < TRIM_MAX_INSET && maxRow - minRow > 2; i++) {
    if (rowDensity(minRow) < TRIM_DENSITY) minRow++;
    else break;
  }
  for (let i = 0; i < TRIM_MAX_INSET && maxRow - minRow > 2; i++) {
    if (rowDensity(maxRow) < TRIM_DENSITY) maxRow--;
    else break;
  }
  for (let i = 0; i < TRIM_MAX_INSET && maxCol - minCol > 2; i++) {
    if (colDensity(minCol) < TRIM_DENSITY) minCol++;
    else break;
  }
  for (let i = 0; i < TRIM_MAX_INSET && maxCol - minCol > 2; i++) {
    if (colDensity(maxCol) < TRIM_DENSITY) maxCol--;
    else break;
  }

  return { minCol, maxCol, minRow, maxRow };
}

/**
 * 构建内容二值 mask。传入 roi 时只分析该矩形，保证行密度启发式（断标题/剥标签）在局部仍有意义。
 * @param minContentRatio 网格内前景像素占比阈值；第二阶段应高于第一阶段。
 */
export function buildMask(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  isForeground: ForegroundTest,
  roi?: { x0: number; y0: number; x1: number; y1: number },
  minContentRatio = MIN_CELL_CONTENT_RATIO,
): { mask: Uint8Array; cols: number; rows: number; originX: number; originY: number } {
  const x0 = roi ? Math.max(0, Math.floor(roi.x0)) : 0;
  const y0 = roi ? Math.max(0, Math.floor(roi.y0)) : 0;
  const x1 = roi ? Math.min(imageWidth, Math.ceil(roi.x1)) : imageWidth;
  const y1 = roi ? Math.min(imageHeight, Math.ceil(roi.y1)) : imageHeight;

  const regionW = Math.max(0, x1 - x0);
  const regionH = Math.max(0, y1 - y0);
  const cols = Math.ceil(regionW / CELL_SIZE) || 1;
  const rows = Math.ceil(regionH / CELL_SIZE) || 1;
  const contentCounts = new Uint16Array(cols * rows);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imageWidth + x) * 4;
      if (isForeground(data[i], data[i + 1], data[i + 2])) {
        const localX = x - x0;
        const localY = y - y0;
        contentCounts[Math.floor(localY / CELL_SIZE) * cols + Math.floor(localX / CELL_SIZE)]++;
      }
    }
  }

  const cellArea = CELL_SIZE * CELL_SIZE;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = contentCounts[i] / cellArea >= minContentRatio ? 1 : 0;
  }

  return { mask, cols, rows, originX: x0, originY: y0 };
}
