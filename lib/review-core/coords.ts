export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TransformParams {
  offsetX: number;
  offsetY: number;
  scale: number;
  zoom: number;
  panX: number;
  panY: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export function resolveMediaRect(container: Size, intrinsic: Size) {
  const scale = Math.min(
    container.width / Math.max(intrinsic.width, 1),
    container.height / Math.max(intrinsic.height, 1)
  );
  const drawWidth = intrinsic.width * scale;
  const drawHeight = intrinsic.height * scale;
  const offsetX = (container.width - drawWidth) / 2;
  const offsetY = (container.height - drawHeight) / 2;
  return { offsetX, offsetY, scale, drawWidth, drawHeight };
}

export function buildTransformParams(container: Size, intrinsic: Size, zoom: number, pan: { x: number; y: number }): TransformParams {
  const { offsetX, offsetY, scale } = resolveMediaRect(container, intrinsic);
  return {
    offsetX,
    offsetY,
    scale,
    zoom,
    panX: pan.x,
    panY: pan.y,
    intrinsicWidth: intrinsic.width,
    intrinsicHeight: intrinsic.height,
  };
}

export function toScreen(pointN: { x: number; y: number }, t: TransformParams) {
  const x = t.offsetX + (pointN.x * t.intrinsicWidth * t.scale * t.zoom) + t.panX;
  const y = t.offsetY + (pointN.y * t.intrinsicHeight * t.scale * t.zoom) + t.panY;
  return { x, y };
}

export function toScreenRect(rectN: { x: number; y: number; width: number; height: number }, t: TransformParams) {
  const { x, y } = toScreen({ x: rectN.x, y: rectN.y }, t);
  const width = rectN.width * t.intrinsicWidth * t.scale * t.zoom;
  const height = rectN.height * t.intrinsicHeight * t.scale * t.zoom;
  return { x, y, width, height };
}

export function toNormalized(pointPx: { x: number; y: number }, t: TransformParams) {
  const x = (pointPx.x - t.offsetX - t.panX) / (Math.max(t.intrinsicWidth, 1) * t.scale * t.zoom);
  const y = (pointPx.y - t.offsetY - t.panY) / (Math.max(t.intrinsicHeight, 1) * t.scale * t.zoom);
  return { x, y };
}

export function toNormalizedRect(rectPx: { x: number; y: number; width: number; height: number }, t: TransformParams) {
  const { x, y } = toNormalized({ x: rectPx.x, y: rectPx.y }, t);
  const width = rectPx.width / (Math.max(t.intrinsicWidth, 1) * t.scale * t.zoom);
  const height = rectPx.height / (Math.max(t.intrinsicHeight, 1) * t.scale * t.zoom);
  return { x, y, width, height };
}


