type CompressionOptions = {
  maxDimension?: number;
  quality?: number;
};

export type CompressedImageResult = {
  file: File;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  outputType: string;
};

export type ImagePreviewResult = {
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  outputType: string;
};

const DEFAULT_MAX_DIMENSION = 3072;
const DEFAULT_QUALITY = 0.5;
const OUTPUT_TYPE = "image/webp";

const getExtension = (name: string) => {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
};

export const isCompressibleImage = (file: File) => {
  const type = file.type?.toLowerCase() ?? "";
  if (type === "image/svg+xml" || type === "image/gif") return false;
  if (type.startsWith("image/")) return true;
  const ext = getExtension(file.name);
  return [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "avif",
    "bmp",
    "tif",
    "tiff",
    "heic",
    "heif",
  ].includes(ext);
};

const getTargetSize = (width: number, height: number, maxDimension: number) => {
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return { width, height, scale: 1 };
  }
  const scale = maxDimension / maxSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
};

const getCanvasContext = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Unable to get 2D context for compression");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
};

const loadImageBitmap = async (file: File): Promise<ImageBitmap | null> => {
  if (typeof createImageBitmap === "undefined") return null;
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    return null;
  }
};

const loadHtmlImage = async (file: File): Promise<HTMLImageElement> => {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event);
    };
    img.src = url;
  });
};

const canvasToBlob = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number
): Promise<Blob> => {
  if ("convertToBlob" in canvas) {
    return await canvas.convertToBlob({ type: OUTPUT_TYPE, quality });
  }
  return await new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      OUTPUT_TYPE,
      quality
    );
  });
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read preview data"));
    reader.readAsDataURL(blob);
  });
};

export const compressImageFile = async (
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> => {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const originalSize = file.size;

  const bitmap = await loadImageBitmap(file);
  if (bitmap) {
    const target = getTargetSize(bitmap.width, bitmap.height, maxDimension);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(target.width, target.height)
        : Object.assign(document.createElement("canvas"), {
            width: target.width,
            height: target.height,
          });
    if (!("width" in canvas)) {
      (canvas as HTMLCanvasElement).width = target.width;
      (canvas as HTMLCanvasElement).height = target.height;
    }

    const ctx = getCanvasContext(canvas);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, quality);
    const compressedSize = blob.size;
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const compressedFile = new File([blob], `${baseName}.webp`, {
      type: OUTPUT_TYPE,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      width: target.width,
      height: target.height,
      originalSize,
      compressedSize,
      outputType: OUTPUT_TYPE,
    };
  }

  const img = await loadHtmlImage(file);
  const target = getTargetSize(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(img, 0, 0, target.width, target.height);

  const blob = await canvasToBlob(canvas, quality);
  const compressedSize = blob.size;
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const compressedFile = new File([blob], `${baseName}.webp`, {
    type: OUTPUT_TYPE,
    lastModified: Date.now(),
  });

  return {
    file: compressedFile,
    width: target.width,
    height: target.height,
    originalSize,
    compressedSize,
    outputType: OUTPUT_TYPE,
  };
};

export const createImagePreviewDataUrl = async (
  file: File,
  options: CompressionOptions = {}
): Promise<ImagePreviewResult> => {
  const result = await compressImageFile(file, options);
  const dataUrl = await blobToDataUrl(result.file);
  return {
    dataUrl,
    width: result.width,
    height: result.height,
    size: result.compressedSize,
    outputType: result.outputType,
  };
};
