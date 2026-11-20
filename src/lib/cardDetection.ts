export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ANALYSIS_MAX_SIDE = 1200;
/** 提分辨率保缝隙时的单边安全上限（放宽至 3600px 以保留超长海报的 12px 卡片间距） */
const ANALYSIS_HARD_MAX_SIDE = 3600;
/** 海报卡片间典型最小间距（gap-3 = 12px） */
const TYPICAL_POSTER_GAP_PX = 12;
/** 典型海报单张卡面尺寸（与 SwapBoardView CardBlock 一致） */
const TYPICAL_CARD_WIDTH_PX = 160;
const TYPICAL_CARD_HEIGHT_PX = 213;
const CELL_SIZE = 4;

/** 第一阶段：纯白底表格截图（如 weareplave.com），阈值保持严格 */
const BACKGROUND_THRESHOLD = 240;

/**
 * 第二阶段：把低饱和浅灰（slate-100/200 ≈ 241,245,249 / 226,232,240）
 * 当作背景，让换卡海报的分组灰底溶解，露出单张卡面。
 */
const GRAY_BG_MIN = 212;
const GRAY_BG_MAX_CHROMA = 16;

/** 第一阶段网格前景占比阈值（保留浅色卡边缘） */
const MIN_CELL_CONTENT_RATIO = 0.02;
/** 第二阶段提高阈值，忽略 gutter 里 shadow-sm 的脏像素 */
const STAGE2_MIN_CELL_CONTENT_RATIO = 0.12;

/** 第一阶段单卡相对整图最小宽度占比（weareplave 白底表保持 10%） */
const MIN_CARD_WIDTH_RATIO = 0.1;
/** 第二阶段（双列超长海报场景）放宽单卡相对整图最小宽度占比，防止双列单卡被误杀 */
const STAGE2_MIN_CARD_WIDTH_RATIO = 0.05;
/** 第二阶段单卡相对当前分组容器的最小宽度占比 */
const STAGE2_MIN_ROI_WIDTH_RATIO = 0.16;

/** 单卡相对整图最大宽度占比上限（兼容手机竖屏 1~2 列截屏，同时拦截整行/整屏巨型粘连框） */
const MAX_CARD_WIDTH_RATIO = 0.62;

const MIN_CARD_ASPECT = 0.8;
const MAX_CARD_ASPECT = 2.2;
const MIN_CARD_FILL = 0.7;

/** 宽度占画布比例超过此值的连通域，视为分组容器候选 */
const CONTAINER_WIDTH_RATIO = 0.2;
/** 连通域至少包含这么多前景网格，才值得二次拆分 */
const CONTAINER_MIN_CELLS = 40;

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

const DEDUPE_IOU = 0.45;

/**
 * 投影谷底判定：谷值 ≤ 相邻峰中较小者的该比例，才算有效 gutter。
 * 用于识别「一张卡」其实是多卡横排/田字格。
 */
const VALLEY_PEAK_RATIO = 0.35;
/** 谷底至少连续这么多网格，才动手切开 */
const VALLEY_MIN_SPAN = 1;

type Connectivity = 4 | 8;

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

interface Component {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  cells: number;
}

interface CandidateBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number;
}

type ForegroundTest = (r: number, g: number, b: number) => boolean;

/** 第一阶段前景判定：非纯白像素即视为前景 */
function isStage1Foreground(r: number, g: number, b: number): boolean {
  return r < BACKGROUND_THRESHOLD || g < BACKGROUND_THRESHOLD || b < BACKGROUND_THRESHOLD;
}

/** 第二阶段前景判定：灰底分组框内把浅灰/近白视为背景，其余视为卡面或文字前景 */
function isStage2Foreground(r: number, g: number, b: number): boolean {
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
function findComponents(
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
function detachTopTags(mask: Uint8Array, cols: number, rows: number): void {
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
function detachCaptionBands(mask: Uint8Array, cols: number, rows: number): void {
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
function clearMaskRows(mask: Uint8Array, cols: number, start: number, end: number): void {
  for (let rr = start; rr <= end; rr++) {
    const base = rr * cols;
    for (let c = 0; c < cols; c++) mask[base + c] = 0;
  }
}

/** 将指定列区间的网格清零 */
function clearMaskCols(mask: Uint8Array, cols: number, rows: number, start: number, end: number): void {
  for (let r = 0; r < rows; r++) {
    const base = r * cols;
    for (let c = start; c <= end; c++) mask[base + c] = 0;
  }
}

/**
 * 自外向内修剪包围盒：去掉前景密度过低的边缘行/列（残留灰边、软阴影），每侧最多收 2 格。
 */
function trimComponentBox(
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
function buildMask(
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
  return (
    box.width >= minWidthPx &&
    box.width <= imageWidth * MAX_CARD_WIDTH_RATIO &&
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
function hasSlatePaddingBorder(
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

function candidateToComponent(box: CandidateBox): Component {
  return {
    minCol: Math.floor(box.x / CELL_SIZE),
    maxCol: Math.max(Math.floor(box.x / CELL_SIZE), Math.ceil((box.x + box.width) / CELL_SIZE) - 1),
    minRow: Math.floor(box.y / CELL_SIZE),
    maxRow: Math.max(Math.floor(box.y / CELL_SIZE), Math.ceil((box.y + box.height) / CELL_SIZE) - 1),
    cells: CONTAINER_MIN_CELLS,
  };
}

function componentPixelBox(component: Component): CandidateBox {
  return {
    x: component.minCol * CELL_SIZE,
    y: component.minRow * CELL_SIZE,
    width: (component.maxCol - component.minCol + 1) * CELL_SIZE,
    height: (component.maxRow - component.minRow + 1) * CELL_SIZE,
    fill: 1,
  };
}

function centerInside(box: CandidateBox, region: CandidateBox): boolean {
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

function mergeAndDedupe(rects: Rect[]): Rect[] {
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

function sortInReadingOrder(rects: Rect[]): Rect[] {
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
function extractCardsFromMask(
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
function splitContainer(
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
