import { useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import { getCardImageUrl, type Card } from '@/lib/cards';

/**
 * 换卡海报图片预加载与高清 JPEG 导出 Hook
 * 封装了远程图片跨域预加载进度追踪、离屏宽屏容器重绘等待以及 html-to-image 生成下载全流程
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
        try {
          if (!exportRef.current) return;
          const dataUrl = await toJpeg(exportRef.current, {
            quality: 0.85,
            pixelRatio: 1,
            backgroundColor: '#ffffff',
            cacheBust: true,
          });

          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
        } catch (err) {
          console.error('海报生成失败:', err);
          alert('生成图片失败，请重试或使用纯净截图模式');
        } finally {
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
