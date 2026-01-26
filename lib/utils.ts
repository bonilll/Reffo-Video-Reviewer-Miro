import { type ClassValue, clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

import {
  type Color,
  type Camera,
  type XYWH,
  Side,
  type Point,
  type Layer,
  type PathLayer,
  LayerType,
} from "@/types/canvas";

const COLORS = ["#DC2626", "#D97706", "#059669", "#7C3AED", "#DB2777"];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function connectionIdToColor(connectionId: number): string {
  // Per le selezioni, usiamo sempre il blu indipendentemente dall'id di connessione
  if (connectionId === -1) {
    return "#3B82F6"; // Blu più luminoso, consistente con il design dell'app
  }
  
  // Per i cursori degli altri utenti, continuiamo a usare colori diversi
  return COLORS[connectionId % COLORS.length];
}

export function pointerEventToCanvasPoint(
  e: React.PointerEvent,
  camera: Camera,
) {
  const scale = camera.scale || 1;
  
  // Verifica che i valori della camera siano validi
  if (isNaN(camera.x) || isNaN(camera.y) || isNaN(scale)) {
    console.error("❌ pointerEventToCanvasPoint - Invalid camera values:", camera);
    return { x: 0, y: 0 }; // Fallback sicuro
  }
  
  // Verifica che i valori dell'evento siano validi
  if (isNaN(e.clientX) || isNaN(e.clientY)) {
    console.error("❌ pointerEventToCanvasPoint - Invalid pointer event values:", e.clientX, e.clientY);
    return { x: 0, y: 0 }; // Fallback sicuro
  }
  
  const x = (Math.round(e.clientX) - camera.x) / scale;
  const y = (Math.round(e.clientY) - camera.y) / scale;
  
  // Verifica che i risultati siano validi
  if (isNaN(x) || isNaN(y)) {
    console.error("❌ pointerEventToCanvasPoint - Calculated NaN values:", { x, y, clientX: e.clientX, clientY: e.clientY, camera });
    return { x: 0, y: 0 }; // Fallback sicuro
  }
  
  return { x, y };
}

export function colorToCSS(color: Color) {
  return `#${color.r.toString(16).padStart(2, "0")}${color.g
    .toString(16)
    .padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
}

export function resizeBounds(bounds: XYWH, corner: Side, point: Point): XYWH {
  const result = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  if ((corner & Side.Left) === Side.Left) {
    result.x = Math.min(point.x, bounds.x + bounds.width);
    result.width = Math.abs(bounds.x + bounds.width - point.x);
  }

  if ((corner & Side.Right) === Side.Right) {
    result.x = Math.min(point.x, bounds.x);
    result.width = Math.abs(point.x - bounds.x);
  }

  if ((corner & Side.Top) === Side.Top) {
    result.y = Math.min(point.y, bounds.y + bounds.height);
    result.height = Math.abs(bounds.y + bounds.height - point.y);
  }

  if ((corner & Side.Bottom) === Side.Bottom) {
    result.y = Math.min(point.y, bounds.y);
    result.height = Math.abs(point.y - bounds.y);
  }

  return result;
}

export function findIntersectingLayersWithRectangle(
  layerIds: readonly string[],
  layers: ReadonlyMap<string, Layer>,
  a: Point,
  b: Point,
) {
  const rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };

  const ids = [];

  for (const layerId of layerIds) {
    const layer = layers.get(layerId);

    if (layer == null) continue;

    const { x, y, height, width } = layer;

    // Special handling for frames: only select if completely contained
    if (layer.type === LayerType.Frame) {
      // Frame must be completely inside selection rectangle
      if (
        rect.x <= x &&
        rect.y <= y &&
        rect.x + rect.width >= x + width &&
        rect.y + rect.height >= y + height
      ) {
        ids.push(layerId);
      }
    } else {
      // Normal intersection logic for other layers
    if (
      rect.x + rect.width > x &&
      rect.x < x + width &&
      rect.y + rect.height > y &&
      rect.y < y + height
      ) {
      ids.push(layerId);
      }
    }
  }

  return ids;
}

export function getContrastingTextColor(color: Color) {
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;

  return luminance > 182 ? "black" : "white";
}

export function penPointsToPathLayer(
  points: number[][],
  color: Color,
  strokeWidth: number = 16,
): PathLayer {
  if (points.length < 2)
    throw new Error("Cannot transform points with less than 2 points.");

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const [x, y] = point;

    if (left > x) left = x;
    if (top > y) top = y;
    if (right < x) right = x;
    if (bottom < y) bottom = y;
  }

  return {
    type: LayerType.Path,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    fill: color,
    points: points.map(([x, y, pressure]) => [x - left, y - top, pressure]),
    strokeWidth,
  };
}

export function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"],
  );

  d.push("Z");
  return d.join(" ");
}

export type MasonrySettings = {
  columns: number;
  gapX: number;
  gapY: number;
  normalizeWidth: boolean;
};

export const applyMasonryLayout = (
  layers: { id: string; width: number; height: number; x: number; y: number }[],
  settings: MasonrySettings
): { id: string; x: number; y: number }[] => {
  const { columns, gapX, gapY, normalizeWidth } = settings;
  
  // Calcola il bounding box totale
  const boundingBox = layers.reduce((acc, layer) => ({
    minX: Math.min(acc.minX, layer.x),
    minY: Math.min(acc.minY, layer.y),
    maxX: Math.max(acc.maxX, layer.x + layer.width),
    maxY: Math.max(acc.maxY, layer.y + layer.height)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const totalWidth = boundingBox.maxX - boundingBox.minX;
  
  // Calcola la larghezza della colonna
  const columnWidth = normalizeWidth 
    ? (totalWidth - ((columns - 1) * gapX)) / columns
    : totalWidth / columns;

  // Inizializza le altezze delle colonne
  const columnHeights = new Array(columns).fill(0);
  const columnPositions = new Array(columns).fill(boundingBox.minX).map((x, i) => x + (i * (columnWidth + gapX)));

  // Ordina i layer per altezza (dal più alto al più basso)
  const sortedLayers = [...layers].sort((a, b) => b.height - a.height);

  // Assegna ogni layer alla colonna con altezza minore
  const newPositions = sortedLayers.map(layer => {
    // Trova la colonna con altezza minore
    const minHeightIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    // Calcola la nuova altezza mantenendo l'aspect ratio
    const newHeight = normalizeWidth 
      ? layer.height * (columnWidth / layer.width)
      : layer.height;

    // Aggiorna l'altezza della colonna
    columnHeights[minHeightIndex] += newHeight + gapY;

    return {
      id: layer.id,
      x: columnPositions[minHeightIndex],
      y: boundingBox.minY + columnHeights[minHeightIndex] - newHeight - gapY
    };
  });

  return newPositions;
};

export function resizeGroupBounds(
  initialBounds: XYWH,
  layers: { id: string; x: number; y: number; width: number; height: number }[],
  corner: Side,
  point: Point,
  maintainAspectRatio: boolean = false
): { id: string; x: number; y: number; width: number; height: number }[] {
  // Calcola il nuovo bounding box utilizzando la stessa funzione del singolo elemento
  const newBounds = resizeBounds(initialBounds, corner, point);
  
  // Se è richiesto mantenere le proporzioni, aggiustiamo il nuovo bounding box
  if (maintainAspectRatio) {
    const aspectRatio = initialBounds.width / initialBounds.height;
    
    if (newBounds.width / newBounds.height > aspectRatio) {
      // Aggiustiamo l'altezza per mantenere la proporzione
      const targetHeight = newBounds.width / aspectRatio;
      
      if ((corner & Side.Top) === Side.Top) {
        newBounds.y = initialBounds.y + initialBounds.height - targetHeight;
      }
      
      newBounds.height = targetHeight;
    } else {
      // Aggiustiamo la larghezza per mantenere la proporzione
      const targetWidth = newBounds.height * aspectRatio;
      
      if ((corner & Side.Left) === Side.Left) {
        newBounds.x = initialBounds.x + initialBounds.width - targetWidth;
      }
      
      newBounds.width = targetWidth;
    }
  }
  
  // Calcola i fattori di scala
  const scaleX = newBounds.width / initialBounds.width;
  const scaleY = newBounds.height / initialBounds.height;
  
  // Limita le dimensioni minime
  const MIN_SIZE = 5;
  if (newBounds.width < MIN_SIZE || newBounds.height < MIN_SIZE) {
    return layers;
  }
  
  // Applica la trasformazione a ogni elemento nel gruppo
  return layers.map(layer => {
    // Calcola la posizione relativa nel bounding box originale (0-1)
    const relX = (layer.x - initialBounds.x) / initialBounds.width;
    const relY = (layer.y - initialBounds.y) / initialBounds.height;
    const relRight = (layer.x + layer.width - initialBounds.x) / initialBounds.width;
    const relBottom = (layer.y + layer.height - initialBounds.y) / initialBounds.height;
    
    // Applica queste proporzioni al nuovo bounding box
    const newX = newBounds.x + relX * newBounds.width;
    const newY = newBounds.y + relY * newBounds.height;
    const newRight = newBounds.x + relRight * newBounds.width;
    const newBottom = newBounds.y + relBottom * newBounds.height;
    
    return {
      id: layer.id,
      x: newX,
      y: newY,
      width: newRight - newX,
      height: newBottom - newY
    };
  });
}

/**
 * Formatta il nome dell'autore con la prima lettera di ogni parola maiuscola
 */
export function formatAuthorName(author: string): string {
  if (!author || author.trim() === '') return 'Anonimo';
  
  const cleanAuthor = author.trim();
  return cleanAuthor.charAt(0).toUpperCase() + cleanAuthor.slice(1);
}

// === FRAME CONTAINMENT UTILITIES ===

/**
 * Checks if a layer is completely contained within a frame
 */
export function isLayerContainedInFrame(
  layer: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    layer.x >= frame.x &&
    layer.y >= frame.y &&
    layer.x + layer.width <= frame.x + frame.width &&
    layer.y + layer.height <= frame.y + frame.height
  );
}

/**
 * Checks if a layer overlaps with a frame (partial containment)
 */
export function isLayerOverlappingFrame(
  layer: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    layer.x < frame.x + frame.width &&
    layer.x + layer.width > frame.x &&
    layer.y < frame.y + frame.height &&
    layer.y + layer.height > frame.y
  );
}

/**
 * Finds all layers that are contained within or overlapping a frame
 */
export function findLayersInFrame(
  frameId: string,
  layers: ReadonlyMap<string, Layer>,
  layerIds: readonly string[]
): string[] {
  const frame = layers.get(frameId);
  if (!frame || frame.type !== LayerType.Frame) return [];

  const containedLayers: string[] = [];

  for (const layerId of layerIds) {
    if (layerId === frameId) continue; // Skip the frame itself
    
    const layer = layers.get(layerId);
    if (!layer) continue;

    // Allow frame nesting - frames can contain other frames
    // Use overlap detection instead of complete containment
    // This includes both fully contained and partially overlapping objects
    if (isLayerOverlappingFrame(layer, frame)) {
      containedLayers.push(layerId);
    }
  }

  return containedLayers;
}

/**
 * Calculates the bounding box that would contain all given layers with padding
 */
export function calculateFrameBoundsForLayers(
  layers: { x: number; y: number; width: number; height: number }[],
  padding: number = 20
): { x: number; y: number; width: number; height: number } {
  if (layers.length === 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const bounds = layers.reduce((acc, layer) => ({
    minX: Math.min(acc.minX, layer.x),
    minY: Math.min(acc.minY, layer.y),
    maxX: Math.max(acc.maxX, layer.x + layer.width),
    maxY: Math.max(acc.maxY, layer.y + layer.height)
  }), { 
    minX: Infinity, 
    minY: Infinity, 
    maxX: -Infinity, 
    maxY: -Infinity 
  });

  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width: (bounds.maxX - bounds.minX) + (padding * 2),
    height: (bounds.maxY - bounds.minY) + (padding * 2)
  };
}

/**
 * Checks if a frame should auto-resize based on its children
 */
export function shouldFrameAutoResize(
  frame: { x: number; y: number; width: number; height: number; autoResize: boolean },
  childrenBounds: { x: number; y: number; width: number; height: number }
): boolean {
  if (!frame.autoResize) return false;

  // Check if children extend beyond frame bounds
  return (
    childrenBounds.x < frame.x ||
    childrenBounds.y < frame.y ||
    childrenBounds.x + childrenBounds.width > frame.x + frame.width ||
    childrenBounds.y + childrenBounds.height > frame.y + frame.height
  );
}

// === ADVANCED FRAME AUTO-RESIZE SYSTEM ===

/**
 * Calculates optimal frame bounds with smart padding based on content type and density
 */
export function calculateOptimalFrameBounds(
  layers: { x: number; y: number; width: number; height: number; type?: LayerType }[],
  options: {
    minPadding?: number;
    maxPadding?: number;
    smartPadding?: boolean;
    preserveAspectRatio?: boolean;
    minFrameSize?: { width: number; height: number };
    frameRef?: { x: number; y: number; width: number; height: number }; // Reference frame for overlap calculation
  } = {}
): { x: number; y: number; width: number; height: number } {
  const {
    minPadding = 20,
    maxPadding = 50,
    smartPadding = true,
    preserveAspectRatio = false,
    minFrameSize = { width: 100, height: 80 },
    frameRef
  } = options;

  if (layers.length === 0) {
    return { x: 0, y: 0, width: minFrameSize.width, height: minFrameSize.height };
  }

  // If we have a reference frame, calculate intersection bounds for partially overlapping objects
  let effectiveLayers = layers;
  if (frameRef) {
    effectiveLayers = layers.map(layer => {
      // Calculate intersection between layer and frame
      const intersectionX = Math.max(layer.x, frameRef.x);
      const intersectionY = Math.max(layer.y, frameRef.y);
      const intersectionRight = Math.min(layer.x + layer.width, frameRef.x + frameRef.width);
      const intersectionBottom = Math.min(layer.y + layer.height, frameRef.y + frameRef.height);
      
      // If there's a valid intersection, use it, otherwise use the original layer
      if (intersectionRight > intersectionX && intersectionBottom > intersectionY) {
        return {
          ...layer,
          x: intersectionX,
          y: intersectionY,
          width: intersectionRight - intersectionX,
          height: intersectionBottom - intersectionY
        };
      }
      
      return layer;
    });
  }

  // Calculate basic bounds from effective layers
  const bounds = effectiveLayers.reduce((acc, layer) => ({
    minX: Math.min(acc.minX, layer.x),
    minY: Math.min(acc.minY, layer.y),
    maxX: Math.max(acc.maxX, layer.x + layer.width),
    maxY: Math.max(acc.maxY, layer.y + layer.height)
  }), { 
    minX: Infinity, 
    minY: Infinity, 
    maxX: -Infinity, 
    maxY: -Infinity 
  });

  let padding = minPadding;

  if (smartPadding) {
    // Adaptive padding based on content density and types
    const contentArea = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    const layerCount = effectiveLayers.length;
    const density = layerCount / Math.max(contentArea / 10000, 1); // Normalize density

    // Increase padding for dense content, decrease for sparse content
    const densityFactor = Math.min(Math.max(density, 0.5), 2);
    padding = Math.round(minPadding + (maxPadding - minPadding) * (densityFactor - 0.5));

    // Adjust padding based on layer types
    const hasTextLayers = layers.some(l => l.type === LayerType.Text || l.type === LayerType.Note);
    const hasShapes = layers.some(l => l.type === LayerType.Rectangle || l.type === LayerType.Ellipse);
    
    if (hasTextLayers && !hasShapes) {
      padding = Math.round(padding * 0.8); // Less padding for text-only content
    } else if (hasShapes && !hasTextLayers) {
      padding = Math.round(padding * 1.2); // More padding for shape-heavy content
    }
  }

  let frameWidth = (bounds.maxX - bounds.minX) + (padding * 2);
  let frameHeight = (bounds.maxY - bounds.minY) + (padding * 2);

  // Ensure minimum frame size
  frameWidth = Math.max(frameWidth, minFrameSize.width);
  frameHeight = Math.max(frameHeight, minFrameSize.height);

  if (preserveAspectRatio) {
    const currentRatio = frameWidth / frameHeight;
    const targetRatio = 16 / 10; // Golden ratio-ish

    if (currentRatio > targetRatio) {
      frameHeight = frameWidth / targetRatio;
    } else {
      frameWidth = frameHeight * targetRatio;
    }
  }

  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width: frameWidth,
    height: frameHeight
  };
}

/**
 * Determines if auto-resize should be triggered with hysteresis to prevent flickering
 */
export function shouldTriggerAutoResize(
  frame: { x: number; y: number; width: number; height: number; autoResize: boolean },
  optimalBounds: { x: number; y: number; width: number; height: number },
  threshold: number = 10
): boolean {
  if (!frame.autoResize) return false;

  // Calculate the difference between current and optimal bounds
  const positionDiff = Math.abs(frame.x - optimalBounds.x) + Math.abs(frame.y - optimalBounds.y);
  const sizeDiff = Math.abs(frame.width - optimalBounds.width) + Math.abs(frame.height - optimalBounds.height);

  // Trigger resize if changes are significant enough
  return positionDiff > threshold || sizeDiff > threshold;
}

/**
 * Smoothly interpolates between current and target frame bounds for animated resizing
 */
export function interpolateFrameBounds(
  currentBounds: { x: number; y: number; width: number; height: number },
  targetBounds: { x: number; y: number; width: number; height: number },
  factor: number = 0.3
): { x: number; y: number; width: number; height: number } {
  return {
    x: currentBounds.x + (targetBounds.x - currentBounds.x) * factor,
    y: currentBounds.y + (targetBounds.y - currentBounds.y) * factor,
    width: currentBounds.width + (targetBounds.width - currentBounds.width) * factor,
    height: currentBounds.height + (targetBounds.height - currentBounds.height) * factor
  };
}

// === FRAME HIERARCHY AND RELATIVE POSITIONING ===

/**
 * Intelligently sorts layer IDs for rendering to ensure proper Z-order:
 * 1. Frames are always behind other elements
 * 2. When a frame is inside another frame, it appears above the parent frame but still behind non-frame elements
 * 3. Maintains existing order for same-type elements
 */
export function sortLayersForRendering(
  layerIds: readonly string[],
  layers: ReadonlyMap<string, Layer>
): string[] {
  const frames: string[] = [];
  const nonFrames: string[] = [];
  
  // Separate frames from non-frames
  for (const layerId of layerIds) {
    const layer = layers.get(layerId);
    if (!layer) continue;
    
    if (layer.type === LayerType.Frame) {
      frames.push(layerId);
    } else {
      nonFrames.push(layerId);
    }
  }
  
  // Sort frames by hierarchy depth (parent frames first, child frames later)
  const sortedFrames = frames.sort((a, b) => {
    const frameA = layers.get(a);
    const frameB = layers.get(b);
    if (!frameA || !frameB) return 0;
    
    // Check if one frame contains the other
    const aContainsB = isLayerOverlappingFrame(frameB, frameA);
    const bContainsA = isLayerOverlappingFrame(frameA, frameB);
    
    if (aContainsB && !bContainsA) {
      // A contains B, so A should be rendered first (behind B)
      return -1;
    } else if (bContainsA && !aContainsB) {
      // B contains A, so B should be rendered first (behind A)
      return 1;
    } else {
      // No containment relationship, maintain original order
      const indexA = layerIds.indexOf(a);
      const indexB = layerIds.indexOf(b);
      return indexA - indexB;
    }
  });
  
  // Return frames first (rendered behind), then non-frames (rendered on top)
  return [...sortedFrames, ...nonFrames];
}

/**
 * Finds the parent frame of a given layer
 */
export function findParentFrame(
  layerId: string,
  layers: ReadonlyMap<string, Layer>,
  layerIds: readonly string[]
): string | null {
  for (const frameId of layerIds) {
    const frame = layers.get(frameId);
    if (frame && frame.type === LayerType.Frame) {
      const frameData = frame as any;
      if (frameData.children && frameData.children.includes(layerId)) {
        return frameId;
      }
    }
  }
  return null;
}

/**
 * Gets all parent frames in hierarchy (from immediate parent to root)
 */
export function getFrameHierarchy(
  layerId: string,
  layers: ReadonlyMap<string, Layer>,
  layerIds: readonly string[]
): string[] {
  const parents: string[] = [];
  let currentParent = findParentFrame(layerId, layers, layerIds);
  
  while (currentParent) {
    parents.push(currentParent);
    currentParent = findParentFrame(currentParent, layers, layerIds);
  }
  
  return parents;
}

/**
 * Converts relative coordinates to absolute coordinates
 */
export function relativeToAbsolute(
  relativeCoords: { x: number; y: number },
  parentFrame: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: parentFrame.x + relativeCoords.x,
    y: parentFrame.y + relativeCoords.y
  };
}

/**
 * Converts absolute coordinates to relative coordinates
 */
export function absoluteToRelative(
  absoluteCoords: { x: number; y: number },
  parentFrame: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: absoluteCoords.x - parentFrame.x,
    y: absoluteCoords.y - parentFrame.y
  };
}

/**
 * Gets the effective (absolute) position of a layer considering frame hierarchy
 */
export function getEffectivePosition(
  layerId: string,
  layers: ReadonlyMap<string, Layer>,
  layerIds: readonly string[]
): { x: number; y: number } {
  const layer = layers.get(layerId);
  if (!layer) return { x: 0, y: 0 };

  const parents = getFrameHierarchy(layerId, layers, layerIds);
  
  // If no parents, use absolute coordinates
  if (parents.length === 0) {
    return { x: layer.x, y: layer.y };
  }

  // Calculate cumulative offset from all parent frames
  let effectiveX = layer.x;
  let effectiveY = layer.y;

  for (const parentId of parents.reverse()) { // Start from root parent
    const parent = layers.get(parentId);
    if (parent) {
      effectiveX += parent.x;
      effectiveY += parent.y;
    }
  }

  return { x: effectiveX, y: effectiveY };
}

/**
 * Checks if a layer should be moved independently (not by its parent)
 */
export function shouldLayerMoveIndependently(
  layerId: string,
  selectedIds: string[],
  layers: ReadonlyMap<string, Layer>,
  layerIds: readonly string[]
): boolean {
  // If the layer is explicitly selected, it should move independently
  if (selectedIds.includes(layerId)) return true;

  // If any parent is selected, this layer should not move independently
  const parents = getFrameHierarchy(layerId, layers, layerIds);
  return !parents.some(parentId => selectedIds.includes(parentId));
}

/**
 * Gets the immediate children of a frame (not nested children)
 */
export function getImmediateChildren(
  frameId: string,
  layers: ReadonlyMap<string, Layer>
): string[] {
  const frame = layers.get(frameId);
  if (!frame || frame.type !== LayerType.Frame) {
    return [];
  }
  
  return (frame as any).children || [];
}

// === CONSTRAINT FUNCTIONS FOR LINES/ARROWS ===

/**
 * Constrains a point to 45-degree angle increments relative to an origin point.
 * Used when Shift is pressed during line/arrow creation or resizing.
 */
export function constrainToAngle(origin: Point, current: Point): Point {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  
  // Calculate the angle in degrees
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;
  
  // Snap to nearest 45-degree increment
  const snapAngleDeg = Math.round(angleDeg / 45) * 45;
  const snapAngleRad = (snapAngleDeg * Math.PI) / 180;
  
  // Calculate the distance from origin to current point
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Return the constrained point
  return {
    x: origin.x + Math.cos(snapAngleRad) * distance,
    y: origin.y + Math.sin(snapAngleRad) * distance
  };
}

/**
 * Constrains rectangle/ellipse creation to maintain square/circle aspect ratio
 * when Shift is pressed during creation.
 */
export function constrainToSquare(origin: Point, current: Point): Point {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  
  // Use the smaller absolute distance to create a perfect square
  const size = Math.min(Math.abs(dx), Math.abs(dy));
  
  return {
    x: origin.x + (dx >= 0 ? size : -size),
    y: origin.y + (dy >= 0 ? size : -size)
  };
}

/**
 * Gets the original aspect ratio of a layer (for images/videos with metadata)
 */
export function getLayerAspectRatio(layer: any): number | null {
  // For images and videos, try to get original aspect ratio from metadata
  if (layer.type === LayerType.Rectangle || layer.type === LayerType.Ellipse) {
    // Check if this layer has aspect ratio metadata (would be added by upload system)
    if (layer.originalAspectRatio && typeof layer.originalAspectRatio === 'number') {
      return layer.originalAspectRatio;
    }
  }
  
  // Default to current dimensions
  if (layer.width && layer.height && layer.width > 0 && layer.height > 0) {
    return layer.width / layer.height;
  }
  
  return null;
}

/**
 * Constrains resize bounds to maintain aspect ratio when Shift is pressed
 */
export function constrainResizeToAspectRatio(
  bounds: XYWH, 
  corner: Side, 
  point: Point, 
  aspectRatio: number
): XYWH {
  const result = resizeBounds(bounds, corner, point);
  
  // Calculate the constrained dimensions
  let { width, height } = result;
  
  // Maintain aspect ratio by adjusting based on which dimension changed more
  const widthChange = Math.abs(width - bounds.width);
  const heightChange = Math.abs(height - bounds.height);
  
  if (widthChange > heightChange) {
    // Width changed more, adjust height to match aspect ratio
    height = width / aspectRatio;
  } else {
    // Height changed more, adjust width to match aspect ratio
    width = height * aspectRatio;
  }
  
  // Adjust position based on corner being dragged
  let { x, y } = result;
  
  if ((corner & Side.Left) === Side.Left) {
    x = bounds.x + bounds.width - width;
  }
  
  if ((corner & Side.Top) === Side.Top) {
    y = bounds.y + bounds.height - height;
  }
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(width, 5)), // Minimum size
    height: Math.round(Math.max(height, 5)) // Minimum size
  };
}

/**
 * Formats bytes to human readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
