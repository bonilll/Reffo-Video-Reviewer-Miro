"use client";

import { useMutation, useStorage } from "@/liveblocks.config";
import { LayerType, ArrowLayer, NoteLayer } from "@/types/canvas";

const SNAP_DISTANCE = 30; // Distanza in pixel per attivare lo snap

export const useArrowSnap = () => {
  const layers = useStorage((root) => root.layers);

  // Funzione per trovare la nota più vicina a un punto
  const findNearestNote = (x: number, y: number, excludeNoteId?: string) => {
    let nearestNote: { id: string; note: NoteLayer; distance: number; side: "top" | "right" | "bottom" | "left" } | null = null;
    let minDistance = SNAP_DISTANCE;

    if (!layers) return null;

    layers.forEach((layer, layerId) => {
      if (layer.type !== LayerType.Note || layerId === excludeNoteId) return;
      
      const note = layer as NoteLayer;
      
      // Calcola la distanza dai 4 lati della nota
      const sides = [
        { side: "top" as const, px: note.x + note.width / 2, py: note.y },
        { side: "right" as const, px: note.x + note.width, py: note.y + note.height / 2 },
        { side: "bottom" as const, px: note.x + note.width / 2, py: note.y + note.height },
        { side: "left" as const, px: note.x, py: note.y + note.height / 2 },
      ];

      sides.forEach(({ side, px, py }) => {
        const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        if (distance < minDistance) {
          minDistance = distance;
          nearestNote = { id: layerId, note, distance, side };
        }
      });
    });

    if (nearestNote) {
      console.log(`✅ Snap found: ${nearestNote.id} ${nearestNote.side} (${nearestNote.distance.toFixed(1)}px)`);
    }

    return nearestNote;
  };

  // Funzione per calcolare il punto di connessione su una nota
  const getSnapPoint = (note: NoteLayer, side: "top" | "right" | "bottom" | "left") => {
    switch (side) {
      case "top":
        return { x: note.x + note.width / 2, y: note.y };
      case "right":
        return { x: note.x + note.width, y: note.y + note.height / 2 };
      case "bottom":
        return { x: note.x + note.width / 2, y: note.y + note.height };
      case "left":
        return { x: note.x, y: note.y + note.height / 2 };
      default:
        return { x: note.x + note.width / 2, y: note.y + note.height / 2 };
    }
  };

  // Mutation per aggiornare lo snap di una freccia
  const updateArrowSnap = useMutation(
    ({ storage }, arrowId: string, startX: number, startY: number, endX: number, endY: number) => {
      const liveLayers = storage.get("layers");
      const arrowLayer = liveLayers.get(arrowId);
      
      if (!arrowLayer || arrowLayer.get("type") !== LayerType.Arrow) {
        return;
      }

      const arrowData = arrowLayer.toObject() as ArrowLayer;
      
      // Trova note vicine per punto di partenza e arrivo
      const sourceSnap = findNearestNote(startX, startY);
      const targetSnap = findNearestNote(endX, endY, sourceSnap?.id);

      let newStartX = startX;
      let newStartY = startY;
      let newEndX = endX;
      let newEndY = endY;
      let hasChanges = false;

      // Aggiorna metadati di snap
      let sourceNoteId = arrowData.sourceNoteId;
      let targetNoteId = arrowData.targetNoteId;
      let sourceSide = arrowData.sourceSide;
      let targetSide = arrowData.targetSide;
      let isSnappedToSource = false;
      let isSnappedToTarget = false;

      // Snap punto di partenza
      if (sourceSnap) {
        const snapPoint = getSnapPoint(sourceSnap.note, sourceSnap.side);
        newStartX = snapPoint.x;
        newStartY = snapPoint.y;
        sourceNoteId = sourceSnap.id;
        sourceSide = sourceSnap.side;
        isSnappedToSource = true;
        hasChanges = true;
        console.log("🎯 Snap source to note:", sourceSnap.id, "side:", sourceSnap.side);
      } else {
        // Rimuovi snap se non c'è più una nota vicina
        if (arrowData.isSnappedToSource) {
          sourceNoteId = undefined;
          sourceSide = undefined;
          isSnappedToSource = false;
          hasChanges = true;
          console.log("🔓 Unsnap source");
        }
      }

      // Snap punto di arrivo
      if (targetSnap) {
        const snapPoint = getSnapPoint(targetSnap.note, targetSnap.side);
        newEndX = snapPoint.x;
        newEndY = snapPoint.y;
        targetNoteId = targetSnap.id;
        targetSide = targetSnap.side;
        isSnappedToTarget = true;
        hasChanges = true;
        console.log("🎯 Snap target to note:", targetSnap.id, "side:", targetSnap.side);
      } else {
        // Rimuovi snap se non c'è più una nota vicina
        if (arrowData.isSnappedToTarget) {
          targetNoteId = undefined;
          targetSide = undefined;
          isSnappedToTarget = false;
          hasChanges = true;
          console.log("🔓 Unsnap target");
        }
      }

      // Aggiorna la freccia solo se ci sono cambiamenti
      if (hasChanges) {
        // Calcola nuovo bounding box
        const minX = Math.min(newStartX, newEndX) - 20;
        const maxX = Math.max(newStartX, newEndX) + 20;
        const minY = Math.min(newStartY, newEndY) - 20;
        const maxY = Math.max(newStartY, newEndY) + 20;

        // Aggiorna tutti i campi
        arrowLayer.update({
          startX: newStartX,
          startY: newStartY,
          endX: newEndX,
          endY: newEndY,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          sourceNoteId,
          targetNoteId,
          sourceSide,
          targetSide,
          isSnappedToSource,
          isSnappedToTarget,
        });

        console.log("✅ Arrow snap updated:", arrowId, {
          snappedSource: isSnappedToSource,
          snappedTarget: isSnappedToTarget,
          sourceNote: sourceNoteId,
          targetNote: targetNoteId
        });
      }

      return {
        snappedToSource: isSnappedToSource,
        snappedToTarget: isSnappedToTarget,
        sourceNote: sourceNoteId,
        targetNote: targetNoteId,
        newStartX,
        newStartY,
        newEndX,
        newEndY
      };
    },
    [layers]
  );

  // Funzione helper per verificare se un punto è vicino a una nota
  const checkSnapPreview = (x: number, y: number, excludeNoteId?: string) => {
    return findNearestNote(x, y, excludeNoteId);
  };

  return {
    updateArrowSnap,
    checkSnapPreview,
    getSnapPoint,
    SNAP_DISTANCE
  };
}; 