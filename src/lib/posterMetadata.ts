import type { Rect } from './cardDetection';

/** 写在 JPEG 注释段（COM Marker 0xFFFE）里的固定识别前缀 */
const META_MAGIC = 'ASTERUM_VAULT_META_V1:';

export interface EmbeddedCardMeta {
  /** 在导出的整张海报原图中的精确像素坐标 */
  rect: Rect;
  /** 纯净卡片名称 */
  name: string;
  /** 关联的主题名称列表（用于跨账号按名称自动匹配标签） */
  themes: string[];
  /** 是否特典卡 */
  is_special: boolean;
  /** 是否瑕卡 */
  is_defective: boolean;
}

export interface EmbeddedPosterPayload {
  version: 1;
  cards: EmbeddedCardMeta[];
}

/**
 * 将卡片清单 JSON 隐形写入 JPEG Blob 的 COM（0xFFFE）注释段中。
 * 肉眼与相册查看完全无感；若写入异常则安全回退返回原始 JPEG Blob。
 */
export async function embedMetadataIntoJpeg(
  jpegBlob: Blob,
  payload: EmbeddedPosterPayload,
): Promise<Blob> {
  try {
    const buffer = await jpegBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const idxZero = 0;
    const idxOne = 1;
    // 校验是否为标准 JPEG 文件头（FF D8）
    if (bytes.length < 4 || bytes[idxZero] !== 0xff || bytes[idxOne] !== 0xd8) {
      return jpegBlob;
    }

    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(META_MAGIC + JSON.stringify(payload));
    // JPEG 单个 COM 段最大长度为 65535 字节（含 2 字节长度字段）
    const segmentLength = jsonBytes.length + 2;
    if (segmentLength > 0xffff) {
      return jpegBlob;
    }

    const comSegment = new Uint8Array(2 + segmentLength);
    comSegment[idxZero] = 0xff;
    comSegment[idxOne] = 0xfe;
    const lenHighIdx = 2;
    const lenLowIdx = 3;
    comSegment[lenHighIdx] = (segmentLength >> 8) & 0xff;
    comSegment[lenLowIdx] = segmentLength & 0xff;
    comSegment.set(jsonBytes, 4);

    // 将 COM 段直接插在 SOI（FF D8）之后
    const result = new Uint8Array(bytes.length + comSegment.length);
    result.set(bytes.subarray(0, 2), 0);
    result.set(comSegment, 2);
    result.set(bytes.subarray(2), 2 + comSegment.length);

    return new Blob([result], { type: 'image/jpeg' });
  } catch {
    return jpegBlob;
  }
}

/**
 * 从用户上传的图片文件中尝试读取隐形元数据。
 * 若图片经过微信二次压缩或手机截屏导致元数据丢失，安全返回 null 降级走图像识别。
 */
export async function extractMetadataFromImageFile(
  file: File,
): Promise<EmbeddedPosterPayload | null> {
  try {
    if (!file.type.includes('jpeg') && !file.type.includes('jpg') && !file.name.match(/\.jpe?g$/i)) {
      return null;
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const idxZero = 0;
    const idxOne = 1;
    if (bytes.length < 4 || bytes[idxZero] !== 0xff || bytes[idxOne] !== 0xd8) {
      return null;
    }

    const decoder = new TextDecoder();
    let offset = 2;

    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      // 遇到图像扫描数据起点（SOS 0xDA）或文件尾（EOI 0xD9）停止扫描
      if (marker === 0xda || marker === 0xd9) break;

      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

      if (marker === 0xfe) {
        const content = decoder.decode(bytes.subarray(offset + 4, offset + 2 + segLen));
        if (content.startsWith(META_MAGIC)) {
          const parsed = JSON.parse(content.slice(META_MAGIC.length)) as EmbeddedPosterPayload;
          if (parsed && parsed.version === 1 && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            return parsed;
          }
        }
      }

      offset += 2 + segLen;
    }

    return null;
  } catch {
    return null;
  }
}
