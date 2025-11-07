export interface CompressImageOptions {
  maxBytes?: number;
  maxDimension?: number;
  minDimension?: number;
  qualityStart?: number;
  qualityFloor?: number;
}

export interface CompressedImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  mimeType: string;
}

type DrawableSource = ImageBitmap | HTMLImageElement;

const loadImageSource = async (file: File): Promise<{ source: DrawableSource; cleanup: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, cleanup: () => (bitmap as any).close?.() };
    } catch (err) {
      // Fallback to Image element
      console.warn('createImageBitmap failed, falling back to Image()', err);
    }
  }

  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ source: img, cleanup: () => URL.revokeObjectURL(img.src) });
    img.onerror = () => reject(new Error('Unable to load image'));
    img.src = URL.createObjectURL(file);
  });
};

const drawToCanvas = (canvas: HTMLCanvasElement, source: DrawableSource, width: number, height: number) => {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to get 2D context');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source as any, 0, 0, width, height);
};

export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {},
): Promise<CompressedImageResult> {
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  const maxDimension = options.maxDimension ?? 2560;
  const minDimension = options.minDimension ?? 512;
  const qualityStart = options.qualityStart ?? 0.9;
  const qualityFloor = options.qualityFloor ?? 0.55;

  const { source, cleanup } = await loadImageSource(file);
  const originalWidth = (source as any).width ?? 0;
  const originalHeight = (source as any).height ?? 0;
  if (!originalWidth || !originalHeight) {
    cleanup();
    throw new Error('Image has invalid dimensions');
  }

  // If the original file already satisfies constraints, keep it as-is.
  if (file.size <= maxBytes && Math.max(originalWidth, originalHeight) <= maxDimension) {
    cleanup();
    return {
      blob: file,
      width: originalWidth,
      height: originalHeight,
      originalWidth,
      originalHeight,
      mimeType: file.type || 'image/png',
    };
  }

  const canvas = document.createElement('canvas');

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  const maxOriginalDimension = Math.max(originalWidth, originalHeight);
  if (maxOriginalDimension > maxDimension) {
    const scale = maxDimension / maxOriginalDimension;
    targetWidth = Math.max(1, Math.round(originalWidth * scale));
    targetHeight = Math.max(1, Math.round(originalHeight * scale));
  }

  drawToCanvas(canvas, source, targetWidth, targetHeight);

  const hasTransparency = /png|webp|gif|svg/i.test(file.type);
  let mimeType = hasTransparency ? 'image/png' : 'image/jpeg';
  if (file.type && /^image\//.test(file.type) && !/heic|heif/i.test(file.type)) {
    if (hasTransparency) {
      mimeType = 'image/png';
    } else if (/image\/jpe?g|webp/.test(file.type)) {
      mimeType = file.type;
    }
  }

  const toBlob = (quality?: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode image'));
            return;
          }
          resolve(blob);
        },
        mimeType,
        quality,
      );
    });

  let quality = hasTransparency ? undefined : qualityStart;
  let blob = await toBlob(quality);

  // Iteratively reduce quality and/or dimensions until the size fits
  while (blob.size > maxBytes) {
    if (!hasTransparency && quality && quality > qualityFloor) {
      quality = Math.max(qualityFloor, quality - 0.1);
      blob = await toBlob(quality);
      continue;
    }

    const nextWidth = Math.max(minDimension, Math.round(targetWidth * 0.85));
    const nextHeight = Math.max(minDimension, Math.round(targetHeight * 0.85));
    if (nextWidth === targetWidth && nextHeight === targetHeight) {
      break;
    }
    targetWidth = nextWidth;
    targetHeight = nextHeight;
    drawToCanvas(canvas, source, targetWidth, targetHeight);
    blob = await toBlob(quality);
  }

  cleanup();

  if (blob.size > maxBytes) {
    throw new Error('Unable to compress image below the size limit');
  }

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    originalWidth,
    originalHeight,
    mimeType,
  };
}

