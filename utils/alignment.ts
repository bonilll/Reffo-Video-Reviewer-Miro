import { Layer, LayerType } from "@/types/canvas";

// Tipo per le informazioni box di un layer
export interface LayerInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: LayerType;
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PositionUpdate {
  id: string;
  x: number;
  y: number;
}

/**
 * Calcola il bounding box di un gruppo di livelli
 */
export const calculateBoundingBox = (layers: LayerInfo[]): BoundingBox => {
  if (layers.length === 0) {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0
    };
  }
  
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  
  for (const layer of layers) {
    left = Math.min(left, layer.x);
    top = Math.min(top, layer.y);
    right = Math.max(right, layer.x + layer.width);
    bottom = Math.max(bottom, layer.y + layer.height);
  }
  
  const width = right - left;
  const height = bottom - top;
  
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
};

/**
 * Allinea i livelli a sinistra
 */
export const alignLeft = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: bbox.left,
    y: layer.y
  }));
};

/**
 * Allinea i livelli al centro
 */
export const alignCenter = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: bbox.centerX - layer.width / 2,
    y: layer.y
  }));
};

/**
 * Allinea i livelli a destra
 */
export const alignRight = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: bbox.right - layer.width,
    y: layer.y
  }));
};

/**
 * Allinea i livelli in alto
 */
export const alignTop = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: layer.x,
    y: bbox.top
  }));
};

/**
 * Allinea i livelli al centro verticale
 */
export const alignMiddle = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: layer.x,
    y: bbox.centerY - layer.height / 2
  }));
};

/**
 * Allinea i livelli in basso
 */
export const alignBottom = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const bbox = calculateBoundingBox(layers);
  return layers.map(layer => ({
    id: layer.id,
    x: layer.x,
    y: bbox.bottom - layer.height
  }));
};

/**
 * Distribuisci i livelli orizzontalmente in modo uniforme
 */
export const distributeHorizontally = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 3) return [];
  
  // Ordina i layer per posizione x
  const sortedLayers = [...layers].sort((a, b) => a.x - b.x);
  const bbox = calculateBoundingBox(layers);
  
  // Calcola lo spazio disponibile
  const totalWidth = bbox.width - sortedLayers[0].width - sortedLayers[sortedLayers.length - 1].width;
  const gap = totalWidth / (sortedLayers.length - 1);
  
  const updates: PositionUpdate[] = [];
  
  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    
    if (i === 0 || i === sortedLayers.length - 1) {
      // Il primo e l'ultimo layer mantengono la loro posizione
      updates.push({
        id: layer.id,
        x: layer.x,
        y: layer.y
      });
    } else {
      // Gli altri layer vengono distribuiti uniformemente
      updates.push({
        id: layer.id,
        x: sortedLayers[0].x + sortedLayers[0].width + gap * i - layer.width / 2,
        y: layer.y
      });
    }
  }
  
  return updates;
};

/**
 * Distribuisci i livelli verticalmente in modo uniforme
 */
export const distributeVertically = (layers: LayerInfo[]): PositionUpdate[] => {
  if (layers.length < 3) return [];
  
  // Ordina i layer per posizione y
  const sortedLayers = [...layers].sort((a, b) => a.y - b.y);
  const bbox = calculateBoundingBox(layers);
  
  // Calcola lo spazio disponibile
  const totalHeight = bbox.height - sortedLayers[0].height - sortedLayers[sortedLayers.length - 1].height;
  const gap = totalHeight / (sortedLayers.length - 1);
  
  const updates: PositionUpdate[] = [];
  
  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    
    if (i === 0 || i === sortedLayers.length - 1) {
      // Il primo e l'ultimo layer mantengono la loro posizione
      updates.push({
        id: layer.id,
        x: layer.x,
        y: layer.y
      });
    } else {
      // Gli altri layer vengono distribuiti uniformemente
      updates.push({
        id: layer.id,
        x: layer.x,
        y: sortedLayers[0].y + sortedLayers[0].height + gap * i - layer.height / 2
      });
    }
  }
  
  return updates;
};

interface MasonryOptions {
  columns: number;
  gapSize?: number;
}

/**
 * Crea una disposizione a griglia Masonry dei livelli selezionati
 */
export const createMasonryGrid = (layers: LayerInfo[], options: MasonryOptions): PositionUpdate[] => {
  if (layers.length < 2) return [];
  
  const { columns, gapSize = 10 } = options;
  const bbox = calculateBoundingBox(layers);
  
  // Ordina i layer per dimensione (dal più grande al più piccolo)
  const sortedLayers = [...layers].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  
  // Calcola la larghezza uniforme per ogni colonna
  const totalWidth = bbox.width;
  const columnWidth = (totalWidth - (gapSize * (columns - 1))) / columns;
  
  // Inizializza le altezze delle colonne
  const columnHeights = Array(columns).fill(bbox.top);
  const columnXPositions = Array(columns).fill(0).map((_, i) => bbox.left + i * (columnWidth + gapSize));
  
  const updates: PositionUpdate[] = [];
  
  // Adatta ogni layer in base alla larghezza della colonna
  for (const layer of sortedLayers) {
    // Trova la colonna con l'altezza minore
    const minHeightIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    // Calcola la scala per adattare il layer alla larghezza della colonna
    const scale = columnWidth / layer.width;
    const scaledHeight = layer.height * scale;
    const uniformLayerWidth = columnWidth;
    
    // Posiziona il layer
    updates.push({
      id: layer.id,
      x: columnXPositions[minHeightIndex],
      y: columnHeights[minHeightIndex]
    });
    
    // Aggiorna l'altezza della colonna
    columnHeights[minHeightIndex] += scaledHeight + gapSize;
  }
  
  return updates;
}; 