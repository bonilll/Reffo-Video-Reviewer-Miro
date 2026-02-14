"use client";

import { memo } from "react";
import { useStorage, useSelf } from "@/liveblocks.config";
import { LayerType, ArrowLayer, NoteLayer, CanvasMode } from "@/types/canvas";
import { useArrowSnap } from "@/hooks/use-arrow-snap";

interface SnapIndicatorsProps {
  camera: { x: number; y: number; scale: number };
  canvasState?: {
    mode: any;
    layerType?: any;
    origin?: { x: number; y: number };
    current?: { x: number; y: number };
  };
  isResizingArrowLine?: {
    layerId: string;
    isStartPoint: boolean;
  } | null;
  resizePoint?: { x: number; y: number } | null;
}

export const ArrowSnapIndicators = memo(({ camera, canvasState, isResizingArrowLine, resizePoint }: SnapIndicatorsProps) => {
  const { checkSnapPreview, SNAP_DISTANCE } = useArrowSnap();
  const selection = useSelf((me) => me.presence.selection);
  
  // Ottieni tutte le frecce selezionate + freccia in disegno
  const selectedArrows = useStorage((root) => {
    const arrows = selection
      .map(id => {
        const layer = root.layers.get(id);
        if (layer && layer.type === LayerType.Arrow) {
          return {
            id,
            startX: layer.startX,
            startY: layer.startY,
            endX: layer.endX,
            endY: layer.endY,
            isSnappedToSource: layer.isSnappedToSource,
            isSnappedToTarget: layer.isSnappedToTarget,
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{
        id: string;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        isSnappedToSource?: boolean;
        isSnappedToTarget?: boolean;
      }>;
    
    // Aggiungi la freccia che stiamo disegnando se siamo in modalità Drawing
    if (canvasState?.mode === CanvasMode.Drawing && 
        (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line) &&
        canvasState.origin && canvasState.current) {
      arrows.push({
        id: "drawing-preview",
        startX: canvasState.origin.x,
        startY: canvasState.origin.y,
        endX: canvasState.current.x,
        endY: canvasState.current.y,
        isSnappedToSource: false,
        isSnappedToTarget: false,
      });
    }
    
    // Aggiungi la freccia che stiamo ridimensionando
    if (isResizingArrowLine && resizePoint) {
      const resizingLayer = root.layers.get(isResizingArrowLine.layerId);
      if (resizingLayer && resizingLayer.type === LayerType.Arrow) {
        const currentArrow = resizingLayer as any;
        arrows.push({
          id: "resizing-preview",
          startX: isResizingArrowLine.isStartPoint ? resizePoint.x : currentArrow.startX,
          startY: isResizingArrowLine.isStartPoint ? resizePoint.y : currentArrow.startY,
          endX: isResizingArrowLine.isStartPoint ? currentArrow.endX : resizePoint.x,
          endY: isResizingArrowLine.isStartPoint ? currentArrow.endY : resizePoint.y,
          isSnappedToSource: false,
          isSnappedToTarget: false,
        });
      }
    }
    
    return arrows;
  });

  // Ottieni tutte le note per mostrare i punti di snap
  const allNotes = useStorage((root) => {
    const notes: Array<{ id: string; note: NoteLayer }> = [];
    root.layers.forEach((layer, layerId) => {
      if (layer.type === LayerType.Note) {
        notes.push({ id: layerId, note: layer as NoteLayer });
      }
    });
    return notes;
  });

  if (selectedArrows.length === 0) return null;

  // Calcola i punti di snap per le frecce selezionate
  const snapPoints: Array<{
    x: number;
    y: number;
    noteId: string;
    side: "top" | "right" | "bottom" | "left";
    isNearArrowStart: boolean;
    isNearArrowEnd: boolean;
  }> = [];

  selectedArrows.forEach(arrow => {
    allNotes.forEach(({ id: noteId, note }) => {
      const sides = [
        { side: "top" as const, x: note.x + note.width / 2, y: note.y },
        { side: "right" as const, x: note.x + note.width, y: note.y + note.height / 2 },
        { side: "bottom" as const, x: note.x + note.width / 2, y: note.y + note.height },
        { side: "left" as const, x: note.x, y: note.y + note.height / 2 },
      ];

      sides.forEach(({ side, x, y }) => {
        const distanceToStart = Math.sqrt(
          Math.pow(arrow.startX - x, 2) + Math.pow(arrow.startY - y, 2)
        );
        const distanceToEnd = Math.sqrt(
          Math.pow(arrow.endX - x, 2) + Math.pow(arrow.endY - y, 2)
        );

        const isNearStart = distanceToStart <= SNAP_DISTANCE && !arrow.isSnappedToSource;
        const isNearEnd = distanceToEnd <= SNAP_DISTANCE && !arrow.isSnappedToTarget;

        if (isNearStart || isNearEnd) {
          snapPoints.push({
            x,
            y,
            noteId,
            side,
            isNearArrowStart: isNearStart,
            isNearArrowEnd: isNearEnd,
          });
        }
      });
    });
  });

  return (
    <>
      {snapPoints.map((point, index) => (
        <g key={`${point.noteId}-${point.side}-${index}`}>
          {/* Cerchio di snap - più grande e colorato */}
          <circle
            cx={point.x}
            cy={point.y}
            r={8}
            fill={point.isNearArrowStart ? "#10b981" : "#3b82f6"} // Verde per start, blu per end
            stroke="#ffffff"
            strokeWidth={2}
            opacity={0.8}
            style={{
              filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3))",
            }}
          />
          
          {/* Indicatore direzionale */}
          <g transform={`translate(${point.x}, ${point.y})`}>
            {point.side === "top" && (
              <path
                d="M -3 -12 L 0 -16 L 3 -12 Z"
                fill={point.isNearArrowStart ? "#10b981" : "#3b82f6"}
                opacity={0.8}
              />
            )}
            {point.side === "right" && (
              <path
                d="M 12 -3 L 16 0 L 12 3 Z"
                fill={point.isNearArrowStart ? "#10b981" : "#3b82f6"}
                opacity={0.8}
              />
            )}
            {point.side === "bottom" && (
              <path
                d="M -3 12 L 0 16 L 3 12 Z"
                fill={point.isNearArrowStart ? "#10b981" : "#3b82f6"}
                opacity={0.8}
              />
            )}
            {point.side === "left" && (
              <path
                d="M -12 -3 L -16 0 L -12 3 Z"
                fill={point.isNearArrowStart ? "#10b981" : "#3b82f6"}
                opacity={0.8}
              />
            )}
          </g>
        </g>
      ))}
    </>
  );
});

ArrowSnapIndicators.displayName = "ArrowSnapIndicators"; 
