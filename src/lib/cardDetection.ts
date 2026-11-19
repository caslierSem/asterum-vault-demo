export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ANALYSIS_MAX_SIDE = 1200;
const CELL_SIZE = 4;
const BACKGROUND_THRESHOLD = 240;
const MIN_CELL_CONTENT_RATIO = 0.02;
const MIN_CARD_WIDTH_RATIO = 0.1;
const MIN_CARD_ASPECT = 0.8;
const MAX_CARD_ASPECT = 2.2;
const MIN_CARD_FILL = 0.7;

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

function findComponents(mask: Uint8Array, cols: number, rows: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const components: Component[] = [];
  const stack: number[] = [];

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

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
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
    }

    components.push(component);
  }

  return components;
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

// Finds the card faces in a screenshot of a card table. Cards are the large, filled,
// portrait-shaped blobs of colour; captions and titles are wide and thin, and the
// table border is a hollow outline, so they are filtered out.
export function detectCardRegions(image: HTMLImageElement): Rect[] {
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法处理这张图片');
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const cols = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const contentCounts = new Uint16Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        data[i] < BACKGROUND_THRESHOLD ||
        data[i + 1] < BACKGROUND_THRESHOLD ||
        data[i + 2] < BACKGROUND_THRESHOLD
      ) {
        contentCounts[Math.floor(y / CELL_SIZE) * cols + Math.floor(x / CELL_SIZE)]++;
      }
    }
  }

  const cellArea = CELL_SIZE * CELL_SIZE;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = contentCounts[i] / cellArea >= MIN_CELL_CONTENT_RATIO ? 1 : 0;
  }

  const candidates = findComponents(mask, cols, rows)
    .map((component) => {
      const boxCols = component.maxCol - component.minCol + 1;
      const boxRows = component.maxRow - component.minRow + 1;
      return {
        x: component.minCol * CELL_SIZE,
        y: component.minRow * CELL_SIZE,
        width: boxCols * CELL_SIZE,
        height: boxRows * CELL_SIZE,
        fill: component.cells / (boxCols * boxRows),
      };
    })
    .filter(
      (box) =>
        box.width >= width * MIN_CARD_WIDTH_RATIO &&
        box.height / box.width >= MIN_CARD_ASPECT &&
        box.height / box.width <= MAX_CARD_ASPECT &&
        box.fill >= MIN_CARD_FILL,
    );

  const toOriginal = (value: number) => Math.round(value / scale);
  return sortInReadingOrder(
    candidates.map((box) => ({
      x: toOriginal(box.x),
      y: toOriginal(box.y),
      width: toOriginal(box.width),
      height: toOriginal(box.height),
    })),
  );
}

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

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法导出物品图片'))),
      'image/jpeg',
      0.92,
    );
  });
}
