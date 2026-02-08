"use client";

import { ReviewAnnotation } from "@/types/canvas";
import { LayerType } from "@/types/canvas";
import { nanoid } from "nanoid";

// Adapter per convertire ReviewAnnotation in Layer format compatibile con le board
export interface ReviewBoardLayer {
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { r: number; g: number; b: number };
  // Proprietà specifiche per i diversi tipi
  value?: string; // Per testo
  startX?: number; // Per arrow/line  
  startY?: number;
  endX?: number;
  endY?: number;
  path?: string; // Per path/freehand
  strokeWidth?: number;
  strokeColor?: { r: number; g: number; b: number };
  // Metadati review
  reviewAnnotationId?: string;
  isReviewAnnotation?: boolean;
}

// Converte ReviewAnnotation in formato Layer per board compatibility
export function convertAnnotationToLayer(annotation: ReviewAnnotation): ReviewBoardLayer {
  const baseLayer = {
    reviewAnnotationId: annotation._id,
    isReviewAnnotation: true,
    strokeWidth: annotation.drawingData.style.strokeWidth || 2,
    strokeColor: parseColor(annotation.drawingData.style.color),
  };

  switch (annotation.type) {
    case "rectangle":
      return {
        ...baseLayer,
        type: LayerType.Rectangle,
        x: annotation.drawingData.bounds?.x || annotation.position.x,
        y: annotation.drawingData.bounds?.y || annotation.position.y,
        width: annotation.drawingData.bounds?.width || 100,
        height: annotation.drawingData.bounds?.height || 100,
        fill: parseColor(annotation.drawingData.style.fillColor || annotation.drawingData.style.color),
      };

    case "circle":
      return {
        ...baseLayer,
        type: LayerType.Ellipse,
        x: annotation.drawingData.bounds?.x || annotation.position.x,
        y: annotation.drawingData.bounds?.y || annotation.position.y,
        width: annotation.drawingData.bounds?.width || 100,
        height: annotation.drawingData.bounds?.height || 100,
        fill: parseColor(annotation.drawingData.style.fillColor || annotation.drawingData.style.color),
      };

    case "arrow":
      const arrowBounds = annotation.drawingData.bounds;
      return {
        ...baseLayer,
        type: LayerType.Arrow,
        x: arrowBounds?.x || annotation.position.x,
        y: arrowBounds?.y || annotation.position.y,
        width: arrowBounds?.width || 100,
        height: arrowBounds?.height || 50,
        startX: arrowBounds?.x || annotation.position.x,
        startY: arrowBounds?.y || annotation.position.y,
        endX: (arrowBounds?.x || annotation.position.x) + (arrowBounds?.width || 100),
        endY: (arrowBounds?.y || annotation.position.y) + (arrowBounds?.height || 50),
      };

    case "freehand":
      const freehandBounds = calculatePathBounds(annotation.drawingData.path || "");
      return {
        ...baseLayer,
        type: LayerType.Path,
        x: freehandBounds.x,
        y: freehandBounds.y,
        width: freehandBounds.width,
        height: freehandBounds.height,
        path: annotation.drawingData.path || "",
      };



    default:
      // Fallback to rectangle
      return {
        ...baseLayer,
        type: LayerType.Rectangle,
        x: annotation.position.x,
        y: annotation.position.y,
        width: 100,
        height: 100,
        fill: parseColor(annotation.drawingData.style.color),
      };
  }
}

// Converte Layer modificato di nuovo in ReviewAnnotation
export function convertLayerToAnnotation(layer: ReviewBoardLayer, originalAnnotation: ReviewAnnotation): ReviewAnnotation {
  const updatedAnnotation: ReviewAnnotation = {
    ...originalAnnotation,
    position: { x: layer.x, y: layer.y },
  };

  // Aggiorna i dati specifici del tipo
  switch (layer.type) {
    case LayerType.Rectangle:
    case LayerType.Ellipse:
      updatedAnnotation.drawingData = {
        ...updatedAnnotation.drawingData,
        bounds: {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
        },
      };
      break;

    case LayerType.Arrow:
      if (layer.startX !== undefined && layer.startY !== undefined && layer.endX !== undefined && layer.endY !== undefined) {
        updatedAnnotation.drawingData = {
          ...updatedAnnotation.drawingData,
          bounds: {
            x: Math.min(layer.startX, layer.endX),
            y: Math.min(layer.startY, layer.endY),
            width: Math.abs(layer.endX - layer.startX),
            height: Math.abs(layer.endY - layer.startY),
          },
        };
      }
      break;

    case LayerType.Path:
      if (layer.path) {
        updatedAnnotation.drawingData = {
          ...updatedAnnotation.drawingData,
          path: layer.path,
          bounds: {
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
          },
        };
      }
      break;

    case LayerType.Note:
      if (layer.value !== undefined) {
        updatedAnnotation.textContent = layer.value;
      }
      break;
  }

  return updatedAnnotation;
}

// Simula un storage mock per il sistema delle board
export class ReviewBoardStorage {
  private layers = new Map<string, ReviewBoardLayer>();
  private layerIds: string[] = [];
  private changeListeners: Set<() => void> = new Set();

  constructor(annotations: ReviewAnnotation[]) {
    // Converte le annotations in layers
    annotations.forEach(annotation => {
      const layerId = `layer_${annotation._id}`;
      const layer = convertAnnotationToLayer(annotation);
      this.layers.set(layerId, layer);
      this.layerIds.push(layerId);
    });
  }

  // API compatibility con il sistema board
  get(key: string) {
    if (key === "layers") {
      return {
        get: (id: string) => this.getLayer(id),
        set: (id: string, layer: ReviewBoardLayer) => this.setLayer(id, layer),
        forEach: (callback: (layer: any, id: string) => void) => {
          this.layers.forEach((layer, id) => callback(this.createLayerProxy(layer, id), id));
        },
        size: this.layers.size,
      };
    }
    if (key === "layerIds") {
      return this.layerIds;
    }
    return null;
  }

  private getLayer(id: string) {
    const layer = this.layers.get(id);
    return layer ? this.createLayerProxy(layer, id) : null;
  }

  private setLayer(id: string, layer: ReviewBoardLayer) {
    this.layers.set(id, layer);
    if (!this.layerIds.includes(id)) {
      this.layerIds.push(id);
    }
    this.notifyChange();
  }

  private createLayerProxy(layer: ReviewBoardLayer, id: string) {
    return {
      get: (key: string) => (layer as any)[key],
      update: (updates: Partial<ReviewBoardLayer>) => {
        const updated = { ...layer, ...updates };
        this.layers.set(id, updated);
        this.notifyChange();
      },
      toObject: () => layer,
    };
  }

  // Gestione listener per re-render
  onChange(callback: () => void) {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  private notifyChange() {
    this.changeListeners.forEach(callback => callback());
  }

  // Metodi per ottenere i dati aggiornati
  getUpdatedAnnotations(originalAnnotations: ReviewAnnotation[]): ReviewAnnotation[] {
    return originalAnnotations.map(annotation => {
      const layerId = `layer_${annotation._id}`;
      const layer = this.layers.get(layerId);
      if (layer) {
        return convertLayerToAnnotation(layer, annotation);
      }
      return annotation;
    });
  }

  // Utility per debugging
  debug() {
  }
}

// Utility functions
function parseColor(colorString?: string): { r: number; g: number; b: number } {
  if (!colorString) return { r: 59, g: 130, b: 246 }; // Default blue
  
  // Handle hex colors
  if (colorString.startsWith('#')) {
    const hex = colorString.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  
  // Handle rgb/rgba colors
  const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
    };
  }
  
  // Default fallback
  return { r: 59, g: 130, b: 246 };
}

function calculatePathBounds(path: string): { x: number; y: number; width: number; height: number } {
  if (!path) return { x: 0, y: 0, width: 100, height: 100 };
  
  // Simple SVG path bounds calculation
  const coords = path.match(/[\d.-]+/g);
  if (!coords || coords.length < 4) return { x: 0, y: 0, width: 100, height: 100 };
  
  const numbers = coords.map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
} 