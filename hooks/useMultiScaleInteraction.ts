import { useCallback } from "react";
import { useMutation } from "@/liveblocks.config";
import { Side, type XYWH, type Point } from "@/types/canvas";

// Tipo per rappresentare un elemento con dimensioni e posizione
export type ScalableElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Calcola il bounding box di un gruppo di elementi
export function getBoundingBoxOfElements(elements: ScalableElement[]): XYWH & { centerX: number; centerY: number } {
  if (!elements.length) {
    return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Trova i limiti estremi di tutti gli elementi
  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + element.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    x: minX,
    y: minY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2
  };
}

export function useMultiScaleInteraction() {
  // Funzione principale per scalare un gruppo di elementi
  const scaleElements = useMutation(
    (
      { storage },
      {
        initialElements,
        initialBoundingBox,
        initialPoint,
        currentPoint,
        corner,
        maintainAspectRatio = false
      }: {
        initialElements: ScalableElement[];
        initialBoundingBox: XYWH & { centerX: number; centerY: number };
        initialPoint: Point;
        currentPoint: Point;
        corner: Side;
        maintainAspectRatio?: boolean;
      }
    ) => {
      if (!initialElements.length) return;

      // Limiti di scala
      const MIN_SCALE = 0.01;
      const MAX_SCALE = 3;

      // Calcola delta del mouse rispetto al punto iniziale
      const dx = currentPoint.x - initialPoint.x;
      const dy = currentPoint.y - initialPoint.y;

      // Calcola i fattori di scala in base all'angolo di trascinamento
      let scaleX = 1;
      let scaleY = 1;

      if ((corner & (Side.Left | Side.Right)) !== 0) {
        // Se stiamo trascinando a sinistra, inverte il delta
        const adjustedDx = corner & Side.Left ? -dx : dx;
        scaleX = (initialBoundingBox.width + adjustedDx) / initialBoundingBox.width;
      }

      if ((corner & (Side.Top | Side.Bottom)) !== 0) {
        // Se stiamo trascinando in alto, inverte il delta
        const adjustedDy = corner & Side.Top ? -dy : dy;
        scaleY = (initialBoundingBox.height + adjustedDy) / initialBoundingBox.height;
      }

      // Se shift è premuto, mantieni l'aspect ratio
      if (maintainAspectRatio) {
        // Usa il fattore più piccolo per mantenere le proporzioni
        // Questo garantisce che l'intero contenuto rimanga visibile
        const uniformScale = Math.min(Math.abs(scaleX), Math.abs(scaleY)) * Math.sign(scaleX * scaleY);
        scaleX = uniformScale;
        scaleY = uniformScale;
      }

      // Applica i limiti di scala
      scaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX));
      scaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleY));

      // Ottieni i layers dallo storage
      const liveLayers = storage.get("layers");

      // Aggiorna ogni elemento
      for (const initialElement of initialElements) {
        const layer = liveLayers.get(initialElement.id);
        if (!layer) continue;

        // Calcola la posizione originale relativa al centro del bounding box
        const relX = initialElement.x - initialBoundingBox.centerX;
        const relY = initialElement.y - initialBoundingBox.centerY;

        // Applica la scala mantenendo la posizione relativa al centro
        const newX = initialBoundingBox.centerX + relX * scaleX;
        const newY = initialBoundingBox.centerY + relY * scaleY;
        const newWidth = initialElement.width * scaleX;
        const newHeight = initialElement.height * scaleY;

        // Aggiorna il layer
        layer.update({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        });
      }

      // Ritorna i fattori di scala per riferimento
      return { scaleX, scaleY };
    },
    []
  );

  return {
    getBoundingBoxOfElements,
    scaleElements
  };
} 