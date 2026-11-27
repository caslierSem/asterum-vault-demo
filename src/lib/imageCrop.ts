/** 裁剪区域（原图像素坐标），与 react-easy-crop 的 Area 对齐 */
export interface CropPixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法读取这张图片，请换一张试试。'));
    img.src = url;
  });
}

function toRadians(degree: number): number {
  return (degree * Math.PI) / 180;
}

/** 旋转后外接矩形尺寸，用于先画完整旋转图再按像素区域裁切 */
function rotatedBoxSize(width: number, height: number, rotation: number) {
  const rad = toRadians(rotation);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/**
 * 按裁剪框与旋转角度从原图导出 JPEG 文件（不放大 devicePixelRatio）。
 * 后续仍交给 compressCardImage 做体积压缩。
 */
export async function cropImageToFile(
  imageUrl: string,
  pixelCrop: CropPixelArea,
  rotation = 0,
  fileName = 'card.jpg',
): Promise<File> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('图片裁剪失败，请稍后重试。');

  const { width: boxWidth, height: boxHeight } = rotatedBoxSize(
    image.naturalWidth,
    image.naturalHeight,
    rotation,
  );
  canvas.width = Math.max(1, Math.round(boxWidth));
  canvas.height = Math.max(1, Math.round(boxHeight));

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(toRadians(rotation));
  ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.drawImage(image, 0, 0);

  const cropWidth = Math.max(1, Math.round(pixelCrop.width));
  const cropHeight = Math.max(1, Math.round(pixelCrop.height));
  const cropped = document.createElement('canvas');
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const croppedCtx = cropped.getContext('2d');
  if (!croppedCtx) throw new Error('图片裁剪失败，请稍后重试。');

  croppedCtx.fillStyle = '#ffffff';
  croppedCtx.fillRect(0, 0, cropWidth, cropHeight);
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    cropped.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('图片裁剪失败，请稍后重试。');
  return new File([blob], fileName, { type: 'image/jpeg' });
}
