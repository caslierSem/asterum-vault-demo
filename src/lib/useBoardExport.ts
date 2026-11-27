import { useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import { getCardImageUrl, stripCardLabelPrefixes, type Card } from '@/lib/cards';
import { embedMetadataIntoJpeg, type EmbeddedCardMeta } from '@/lib/posterMetadata';

/** 读取已经落地的像素宽度；百分比或 auto 无法在克隆里复现，直接跳过 */
function usedPx(el: HTMLElement, prop: 'width'): string | null {
  const value = getComputedStyle(el).getPropertyValue(prop).trim();
  if (!value.endsWith('px')) return null;
  const size = parseFloat(value);
  if (!Number.isFinite(size) || size <= 0) return null;
  return value;
}

/**
 * 单侧格子比 160px 卡面宽时，`mx-auto` 会把卡面居中。
 * 这段留白在网格项上 getComputedStyle 仍返回 0，foreignObject 也会丢掉。
 * 用轨道宽度和卡壳宽度把居中量写成真正的像素 margin，克隆才画在同一位置。
 */
function centeredMarginLeft(shell: HTMLElement, grid: HTMLElement, tracks: string): string {
  const sizes = (tracks.match(/[\d.]+px/g) ?? [])
    .map((part) => parseFloat(part))
    .filter((size) => Number.isFinite(size) && size > 0);
  if (sizes.length === 0) return '0px';
  const index = Math.max(0, Array.from(grid.children).indexOf(shell));
  const cell = sizes[index % sizes.length];
  const pad = Math.max(0, (cell - shell.getBoundingClientRect().width) / 2);
  return `${pad}px`;
}

/**
 * 从卡面向上找到左右分栏所在的横向 flex 行。
 * 卡壳自身是纵向 flex，分组标题也是横向 flex，但它们不是卡面的祖先，不会被命中。
 */
function findColumnRow(card: HTMLElement | null, container: HTMLElement): HTMLElement | null {
  let node = card?.parentElement ?? null;
  while (node && node !== container) {
    const style = getComputedStyle(node);
    if (style.display === 'flex' && style.flexDirection === 'row') return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 换卡海报图片预加载与高清 JPEG 导出 Hook
 * 封装了远程图片跨域预加载进度追踪、离屏宽屏容器重绘等待、以及卡片隐形元数据写入全流程
 */
export function useBoardExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const exportRef = useRef<HTMLDivElement>(null);

  /**
   * 预加载所有待导出卡片的远程图片
   * 解决 html-to-image 截图瞬间远程图片尚未解码导致的空白或破图问题
   */
  const preloadImages = async (urls: string[]) => {
    let loadedCount = 0;
    setExportStatus(`正在加载图片 0/${urls.length}…`);

    await Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            // 必须显式声明 anonymous 跨域头，防止 Canvas 导出时触发浏览器安全策略报错
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              loadedCount++;
              setExportStatus(`正在加载图片 ${loadedCount}/${urls.length}…`);
              resolve();
            };
            img.onerror = () => {
              // 单张图片加载失败不阻断整体海报导出流程
              loadedCount++;
              setExportStatus(`正在加载图片 ${loadedCount}/${urls.length}…`);
              resolve();
            };
            img.src = url;
          }),
      ),
    );
  };

  /**
   * 把当前已经排好的像素几何写成内联样式，避免 html-to-image 的 foreignObject 重算居中。
   * 单侧海报格子宽于 160px，`mx-auto` 的左右留白在克隆里会丢失，坐标却按居中结果记录。
   * 返回还原函数；调用方必须在截图结束后执行，避免污染下一次导出。
   */
  const lockMeasuredLayout = (container: HTMLElement): (() => void) => {
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-export-card-id]'));
    const pins: Array<{ el: HTMLElement; props: Record<string, string> }> = [];

    const flexRow = findColumnRow(cards[0] ?? null, container);
    if (flexRow) {
      const rowStyle = getComputedStyle(flexRow);
      pins.push({ el: flexRow, props: { 'column-gap': rowStyle.columnGap } });
      for (const child of flexRow.children) {
        if (!(child instanceof HTMLElement)) continue;
        const width = usedPx(child, 'width');
        if (!width) continue;
        // flex-1 的基准是 0%，只写 width 挡不住分栏在克隆里重新伸展
        pins.push({
          el: child,
          props: {
            width,
            'min-width': '0px',
            'flex-grow': '0',
            'flex-shrink': '0',
            'flex-basis': width,
          },
        });
      }
    }

    const seenGrids = new Set<HTMLElement>();
    for (const card of cards) {
      const shell = card.parentElement;
      if (!(shell instanceof HTMLElement)) continue;
      const shellWidth = usedPx(shell, 'width');
      const grid = shell.parentElement;
      const gridStyle = grid instanceof HTMLElement ? getComputedStyle(grid) : null;
      const tracks = gridStyle?.display === 'grid' ? gridStyle.gridTemplateColumns : '';
      if (shellWidth) {
        pins.push({
          el: shell,
          props: {
            width: shellWidth,
            'max-width': 'none',
            'margin-left':
              grid instanceof HTMLElement && tracks ? centeredMarginLeft(shell, grid, tracks) : '0px',
            'margin-right': '0px',
            'justify-self': 'start',
          },
        });
      }

      if (!(grid instanceof HTMLElement) || !gridStyle || seenGrids.has(grid)) continue;
      if (gridStyle.display !== 'grid') continue;
      seenGrids.add(grid);
      const gridWidth = usedPx(grid, 'width');
      if (!gridWidth || !tracks) continue;
      pins.push({
        el: grid,
        props: {
          width: gridWidth,
          'grid-template-columns': gridStyle.gridTemplateColumns,
          'column-gap': gridStyle.columnGap,
          'row-gap': gridStyle.rowGap,
        },
      });
    }

    const restores = pins.map(({ el, props }) => {
      const prev = el.getAttribute('style');
      for (const [name, value] of Object.entries(props)) {
        el.style.setProperty(name, value, 'important');
      }
      return () => {
        if (prev == null) el.removeAttribute('style');
        else el.setAttribute('style', prev);
      };
    });

    return () => {
      for (const restore of restores) restore();
    };
  };

  /**
   * 测量离屏导出容器内每张卡面的精确像素坐标，并与卡片名称、主题、特典/瑕卡属性绑定
   */
  const collectEmbeddedCards = (
    container: HTMLElement,
    visibleCards: Card[],
  ): EmbeddedCardMeta[] => {
    const cardMap = new Map<string, Card>();
    for (const card of visibleCards) {
      cardMap.set(card.id, card);
    }

    const rootRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll<HTMLElement>('[data-export-card-id]');
    const embedded: EmbeddedCardMeta[] = [];

    nodes.forEach((el) => {
      const cardId = el.dataset.exportCardId;
      if (!cardId) return;
      const card = cardMap.get(cardId);
      if (!card) return;

      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;

      embedded.push({
        rect: {
          x: Math.round(box.left - rootRect.left),
          y: Math.round(box.top - rootRect.top),
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
        name: stripCardLabelPrefixes(card.name),
        themes: card.tags.map((t) => t.name),
        is_special: card.is_special,
        is_defective: card.is_defective,
      });
    });

    return embedded;
  };

  /**
   * 触发海报导出流程
   * @param visibleCards 当前勾选保留、需要印在海报上的所有卡片列表
   * @param filename 导出下载的文件名（默认：PLAVE交换清单.jpg）
   */
  const triggerExport = async (visibleCards: Card[], filename = 'PLAVE交换清单.jpg') => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    setExportStatus('准备中…');

    try {
      // 提取所有带图片路径的卡片完整访问地址
      const imageUrls = visibleCards
        .filter((card) => Boolean(card.image_path))
        .map((card) => getCardImageUrl(card.image_path!));

      await preloadImages(imageUrls);

      setExportStatus('正在生成高清海报…');
      // 预留 1000ms 缓冲，确保离屏 1400px 宽屏容器中的图片与字体已完成排版重绘
      setTimeout(async () => {
        let downloadUrl: string | null = null;
        let restoreLayout = () => {};
        try {
          if (!exportRef.current) return;
          restoreLayout = lockMeasuredLayout(exportRef.current);
          const embeddedCards = collectEmbeddedCards(exportRef.current, visibleCards);

          const dataUrl = await toJpeg(exportRef.current, {
            quality: 0.85,
            pixelRatio: 1,
            backgroundColor: '#ffffff',
            cacheBust: true,
          });
          const rawBlob = await (await fetch(dataUrl)).blob();

          // 将卡片坐标与元数据隐形写入 JPEG 注释段
          const finalBlob =
            embeddedCards.length > 0
              ? await embedMetadataIntoJpeg(rawBlob, { version: 1, cards: embeddedCards })
              : rawBlob;

          if (!rawBlob) throw new Error('生成图片 Blob 失败');

          downloadUrl = URL.createObjectURL(finalBlob);
          const link = document.createElement('a');
          link.download = filename;
          link.href = downloadUrl;
          link.click();
        } catch (err) {
          console.error('海报生成失败:', err);
          alert('生成图片失败，请重试或使用纯净截图模式');
        } finally {
          restoreLayout();
          if (downloadUrl) {
            const urlToRevoke = downloadUrl;
            setTimeout(() => URL.revokeObjectURL(urlToRevoke), 5000);
          }
          setIsExporting(false);
          setExportStatus('');
        }
      }, 1000);
    } catch (error) {
      console.error('预加载流程异常:', error);
      setIsExporting(false);
      setExportStatus('');
    }
  };

  return {
    exportRef,
    isExporting,
    exportStatus,
    triggerExport,
  };
}
