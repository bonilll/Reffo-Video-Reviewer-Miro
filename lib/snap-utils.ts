/**
 * Utility functions for layer snapping system
 * Provides smart alignment guidelines when moving layers
 */

import { LayerType } from "@/types/canvas";

export interface SnapLine {
  value: number;     // coordinata della linea (x per verticali, y per orizzontali)
  type: 'vertical' | 'horizontal';
  source: string;    // ID del layer che genera questa linea
  edge: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';
}

export interface SnapResult {
  x: number;
  y: number;
  activeSnapLines: SnapLine[];
}

export interface LayerBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Configurazione del sistema di snap
export const SNAP_CONFIG = {
  threshold: 5,         // distanza in pixel per attivare lo snap (molto ridotta per massima fluidità)
  searchRadius: 250,    // raggio di ricerca per layer vicini (px) - ridotto per performance
  showGuidelines: true, // mostra le linee guida visive
  maxSnapLines: 20,     // numero massimo di snap lines da processare
  fadeDistance: 40,     // distanza oltre la quale le guide iniziano a dissolvere
} as const;

/**
 * Calcola l'opacità di una guida in base alla distanza dal layer
 */
export function calculateGuidelineOpacity(
  snapLine: SnapLine,
  layerX: number,
  layerY: number,
  layerWidth: number,
  layerHeight: number
): number {
  const layerCenterX = layerX + layerWidth / 2;
  const layerCenterY = layerY + layerHeight / 2;
  
  let distance: number;
  
  if (snapLine.type === 'vertical') {
    // Distanza dalla linea verticale
    distance = Math.abs(snapLine.value - layerCenterX);
  } else {
    // Distanza dalla linea orizzontale
    distance = Math.abs(snapLine.value - layerCenterY);
  }
  
  // Opacità piena entro la soglia, poi dissolvenza progressiva
  if (distance <= SNAP_CONFIG.threshold) {
    return 0.8; // Opacità massima quando è vicino allo snap
  } else if (distance <= SNAP_CONFIG.fadeDistance) {
    // Dissolvenza lineare da 0.8 a 0.2
    const ratio = (distance - SNAP_CONFIG.threshold) / (SNAP_CONFIG.fadeDistance - SNAP_CONFIG.threshold);
    return 0.8 - (0.6 * ratio); // Da 0.8 a 0.2
  } else {
    return 0.2; // Opacità minima per guide lontane
  }
}

/**
 * Filtra i layer per vicinanza in base al raggio di ricerca
 */
export function filterNearbyLayers(
  layers: LayerBounds[],
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
  searchRadius: number = SNAP_CONFIG.searchRadius,
  excludeLayerId?: string
): LayerBounds[] {
  const targetCenterX = targetX + targetWidth / 2;
  const targetCenterY = targetY + targetHeight / 2;

  return layers.filter(layer => {
    // Escludi il layer che si sta muovendo
    if (layer.id === excludeLayerId) return false;

    const layerCenterX = layer.x + layer.width / 2;
    const layerCenterY = layer.y + layer.height / 2;

    // Calcola la distanza tra i centri dei layer
    const distance = Math.sqrt(
      Math.pow(targetCenterX - layerCenterX, 2) + 
      Math.pow(targetCenterY - layerCenterY, 2)
    );

    // Includi solo layer entro il raggio di ricerca
    return distance <= searchRadius;
  });
}

/**
 * Calcola tutte le linee guida (snap lines) dai layer visibili nelle vicinanze
 * Include supporto speciale per frame e i loro contenuti
 */
export function calculateSnapLines(
  layers: LayerBounds[], 
  excludeLayerId?: string,
  targetX?: number,
  targetY?: number,
  targetWidth?: number,
  targetHeight?: number,
  parentFrameBounds?: LayerBounds
): SnapLine[] {
  const snapLines: SnapLine[] = [];
  
  // Se abbiamo le informazioni del target, filtra solo layer vicini
  let layersToProcess = layers;
  if (targetX !== undefined && targetY !== undefined && 
      targetWidth !== undefined && targetHeight !== undefined) {
    layersToProcess = filterNearbyLayers(
      layers, targetX, targetY, targetWidth, targetHeight, 
      SNAP_CONFIG.searchRadius, excludeLayerId
    );
    
    // Limita ulteriormente per performance - ordina per distanza e prendi i più vicini
    if (layersToProcess.length > SNAP_CONFIG.maxSnapLines / 6) {
      const targetCenterX = targetX + targetWidth / 2;
      const targetCenterY = targetY + targetHeight / 2;
      
      layersToProcess = layersToProcess
        .map(layer => ({
          layer,
          distance: Math.sqrt(
            Math.pow(targetCenterX - (layer.x + layer.width / 2), 2) + 
            Math.pow(targetCenterY - (layer.y + layer.height / 2), 2)
          )
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Math.floor(SNAP_CONFIG.maxSnapLines / 6))
        .map(item => item.layer);
    }
  } else {
    // Fallback: escludi solo il layer in movimento
    layersToProcess = layers.filter(layer => layer.id !== excludeLayerId);
  }

  for (const layer of layersToProcess) {
    const { id, x, y, width, height } = layer;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Linee verticali (per allineamento orizzontale)
    snapLines.push(
      { value: x, type: 'vertical', source: id, edge: 'left' },
      { value: x + width, type: 'vertical', source: id, edge: 'right' },
      { value: centerX, type: 'vertical', source: id, edge: 'centerX' }
    );

    // Linee orizzontali (per allineamento verticale)
    snapLines.push(
      { value: y, type: 'horizontal', source: id, edge: 'top' },
      { value: y + height, type: 'horizontal', source: id, edge: 'bottom' },
      { value: centerY, type: 'horizontal', source: id, edge: 'centerY' }
    );
  }
  
  // Se l'oggetto è all'interno di un frame, aggiungi le snap lines del frame genitore
  if (parentFrameBounds) {
    const { id, x, y, width, height } = parentFrameBounds;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Aggiungi i bordi interni del frame come possibili snap lines
    snapLines.push(
      // Bordi interni (con padding di 8px)
      { value: x + 8, type: 'vertical', source: `${id}-inner`, edge: 'left' },
      { value: x + width - 8, type: 'vertical', source: `${id}-inner`, edge: 'right' },
      { value: y + 8, type: 'horizontal', source: `${id}-inner`, edge: 'top' },
      { value: y + height - 8, type: 'horizontal', source: `${id}-inner`, edge: 'bottom' },
      
      // Centro del frame
      { value: centerX, type: 'vertical', source: `${id}-center`, edge: 'centerX' },
      { value: centerY, type: 'horizontal', source: `${id}-center`, edge: 'centerY' }
    );
  }

  return snapLines;
}

/**
 * Trova le linee di snap più vicine per un layer in movimento
 * Con soglia ridotta per movimento più fluido
 */
export function findNearestSnapLines(
  newX: number,
  newY: number,
  layerWidth: number,
  layerHeight: number,
  snapLines: SnapLine[],
  threshold: number = SNAP_CONFIG.threshold
): { vertical?: SnapLine; horizontal?: SnapLine } {
  
  const layerCenterX = newX + layerWidth / 2;
  const layerCenterY = newY + layerHeight / 2;
  const layerRight = newX + layerWidth;
  const layerBottom = newY + layerHeight;

  let nearestVertical: SnapLine | undefined;
  let nearestHorizontal: SnapLine | undefined;
  let minVerticalDistance = threshold;
  let minHorizontalDistance = threshold;

  for (const snapLine of snapLines) {
    if (snapLine.type === 'vertical') {
      // Controlla allineamento con i bordi e centro del layer in movimento
      const distances = [
        Math.abs(snapLine.value - newX),           // left edge
        Math.abs(snapLine.value - layerRight),     // right edge
        Math.abs(snapLine.value - layerCenterX),   // center
      ];

      const minDistance = Math.min(...distances);
      // Usa una soglia più progressiva: più vicino = più facile lo snap
      if (minDistance <= minVerticalDistance) {
        minVerticalDistance = minDistance;
        nearestVertical = snapLine;
      }
    } else {
      // Controlla allineamento con i bordi e centro del layer in movimento
      const distances = [
        Math.abs(snapLine.value - newY),           // top edge
        Math.abs(snapLine.value - layerBottom),    // bottom edge
        Math.abs(snapLine.value - layerCenterY),   // center
      ];

      const minDistance = Math.min(...distances);
      // Usa una soglia più progressiva: più vicino = più facile lo snap
      if (minDistance <= minHorizontalDistance) {
        minHorizontalDistance = minDistance;
        nearestHorizontal = snapLine;
      }
    }
  }

  return { vertical: nearestVertical, horizontal: nearestHorizontal };
}

/**
 * Calcola la posizione snappata e le linee guida attive
 */
export function calculateSnapPosition(
  originalX: number,
  originalY: number,
  layerWidth: number,
  layerHeight: number,
  snapLines: SnapLine[],
  threshold: number = SNAP_CONFIG.threshold
): SnapResult {
  
  const nearestLines = findNearestSnapLines(
    originalX, 
    originalY, 
    layerWidth, 
    layerHeight, 
    snapLines, 
    threshold
  );

  let snappedX = originalX;
  let snappedY = originalY;
  const activeSnapLines: SnapLine[] = [];

  // Applica snap verticale (per coordinata X)
  if (nearestLines.vertical) {
    const snapLine = nearestLines.vertical;
    const layerCenterX = originalX + layerWidth / 2;
    const layerRight = originalX + layerWidth;

    // Determina quale bordo del layer è più vicino alla snap line
    const leftDist = Math.abs(snapLine.value - originalX);
    const rightDist = Math.abs(snapLine.value - layerRight);
    const centerDist = Math.abs(snapLine.value - layerCenterX);

    if (leftDist <= rightDist && leftDist <= centerDist) {
      // Snap al bordo sinistro
      snappedX = snapLine.value;
    } else if (rightDist <= centerDist) {
      // Snap al bordo destro
      snappedX = snapLine.value - layerWidth;
    } else {
      // Snap al centro
      snappedX = snapLine.value - layerWidth / 2;
    }

    activeSnapLines.push(snapLine);
  }

  // Applica snap orizzontale (per coordinata Y)
  if (nearestLines.horizontal) {
    const snapLine = nearestLines.horizontal;
    const layerCenterY = originalY + layerHeight / 2;
    const layerBottom = originalY + layerHeight;

    // Determina quale bordo del layer è più vicino alla snap line
    const topDist = Math.abs(snapLine.value - originalY);
    const bottomDist = Math.abs(snapLine.value - layerBottom);
    const centerDist = Math.abs(snapLine.value - layerCenterY);

    if (topDist <= bottomDist && topDist <= centerDist) {
      // Snap al bordo superiore
      snappedY = snapLine.value;
    } else if (bottomDist <= centerDist) {
      // Snap al bordo inferiore
      snappedY = snapLine.value - layerHeight;
    } else {
      // Snap al centro
      snappedY = snapLine.value - layerHeight / 2;
    }

    activeSnapLines.push(snapLine);
  }

  return {
    x: snappedX,
    y: snappedY,
    activeSnapLines
  };
}

/**
 * Snappa un arrow ai punti di connessione degli altri layer
 */
export function snapArrowToConnectionPoints(
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  layers: any[]
): { startPoint: { x: number; y: number }; endPoint: { x: number; y: number } } {
  const SNAP_THRESHOLD = 20; // Soglia di snap per i punti di connessione
  
  let snappedStart = { ...startPoint };
  let snappedEnd = { ...endPoint };
  
  // Calcola i bounds di tutti i layer per trovare i punti di connessione
  const layerBounds: LayerBounds[] = [];
  
  for (const [layerId, layer] of layers) {
    const bounds = layerToLayerBounds(layer, layerId);
    if (bounds) {
      layerBounds.push(bounds);
    }
  }
  
  // Funzione per ottenere i punti di connessione di un layer
  const getConnectionPoints = (bounds: LayerBounds) => {
    const { x, y, width, height } = bounds;
    return [
      { x: x, y: y + height / 2 }, // Left center
      { x: x + width, y: y + height / 2 }, // Right center
      { x: x + width / 2, y: y }, // Top center
      { x: x + width / 2, y: y + height }, // Bottom center
      { x: x, y: y }, // Top left
      { x: x + width, y: y }, // Top right
      { x: x, y: y + height }, // Bottom left
      { x: x + width, y: y + height }, // Bottom right
    ];
  };
  
  // Snap del punto di inizio
  let minStartDistance = SNAP_THRESHOLD;
  for (const bounds of layerBounds) {
    const connectionPoints = getConnectionPoints(bounds);
    for (const point of connectionPoints) {
      const distance = Math.sqrt(
        Math.pow(startPoint.x - point.x, 2) + Math.pow(startPoint.y - point.y, 2)
      );
      if (distance < minStartDistance) {
        minStartDistance = distance;
        snappedStart = point;
      }
    }
  }
  
  // Snap del punto finale
  let minEndDistance = SNAP_THRESHOLD;
  for (const bounds of layerBounds) {
    const connectionPoints = getConnectionPoints(bounds);
    for (const point of connectionPoints) {
      const distance = Math.sqrt(
        Math.pow(endPoint.x - point.x, 2) + Math.pow(endPoint.y - point.y, 2)
      );
      if (distance < minEndDistance) {
        minEndDistance = distance;
        snappedEnd = point;
      }
    }
  }
  
  return { startPoint: snappedStart, endPoint: snappedEnd };
}

/**
 * Converte un layer Liveblocks in LayerBounds per il sistema di snap
 */
export function layerToLayerBounds(layer: any, id: string): LayerBounds | null {
  if (!layer) return null;

  const type = layer.get?.('type') || layer.type;
  
  // Strategia più robusta per ottenere le proprietà
  // Prova prima con .get() (Liveblocks), poi con accesso diretto
  let x = layer.get?.('x');
  let y = layer.get?.('y'); 
  let width = layer.get?.('width');
  let height = layer.get?.('height');
  
  // Fallback per accesso diretto alle proprietà
  if (x === undefined) x = layer.x;
  if (y === undefined) y = layer.y;
  if (width === undefined) width = layer.width;
  if (height === undefined) height = layer.height;
  
  // Verifica speciale per layer object-based (come layer preview)
  if (typeof layer.toObject === 'function') {
    const layerObj = layer.toObject();
    if (x === undefined) x = layerObj.x;
    if (y === undefined) y = layerObj.y;
    if (width === undefined) width = layerObj.width;
    if (height === undefined) height = layerObj.height;
  }

  // Verifica che abbia tutte le proprietà necessarie
  if (typeof x !== 'number' || typeof y !== 'number' || 
      typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }

  return { id, x, y, width, height };
}