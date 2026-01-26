"use client";

import { memo, useEffect, useState, useCallback } from "react";
import { ReviewAnnotation, ReviewComment } from "@/types/canvas";

// Copiamo i tipi dalle board
export enum Side {
  Top = 1,
  Bottom = 2,
  Left = 4,
  Right = 8,
}

export enum ReviewCanvasMode {
  None,
  Translating,
  Resizing,
  GroupResizing
}

export type XYWH = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ReviewSelectionBoxProps {
  annotations: ReviewAnnotation[];
  comments?: ReviewComment[];
  selectedAnnotationIds: string[];
  selectedCommentIds?: string[];
  onResizeHandlePointerDown: (corner: Side, initialBounds: XYWH, e: React.PointerEvent) => void;
  canvasState: ReviewCanvasMode;
  scaleX?: number;
  scaleY?: number;
  containerRect?: DOMRect;
  dragOffset?: { x: number; y: number };
  // Optimistic state for real-time updates
  optimisticPositions?: Map<string, { x: number; y: number }>;
  optimisticBounds?: Map<string, XYWH>;
}

const BASE_HANDLE_WIDTH = 8;
const MIN_HANDLE_WIDTH = 4;
const MAX_HANDLE_WIDTH = 100;

export const ReviewSelectionBox = memo(
  ({ 
    annotations, 
    comments = [], 
    selectedAnnotationIds, 
    selectedCommentIds = [], 
    onResizeHandlePointerDown, 
    canvasState, 
    scaleX = 1, 
    scaleY = 1,
    containerRect,
    dragOffset = { x: 0, y: 0 },
    optimisticPositions = new Map(),
    optimisticBounds = new Map()
  }: ReviewSelectionBoxProps) => {
    
    const [isShiftKeyPressed, setIsShiftKeyPressed] = useState(false);
    
    // Verifica se è in corso un ridimensionamento di gruppo
    const isGroupResizing = canvasState === ReviewCanvasMode.GroupResizing;
    
    // Calcola la percentuale di scala
    const scalePercentX = Math.round(scaleX * 100);
    const scalePercentY = Math.round(scaleY * 100);
    const scalePercent = isShiftKeyPressed || scalePercentX === scalePercentY 
      ? `${scalePercentX}%` 
      : `${scalePercentX}% × ${scalePercentY}%`;

    // Calcola dimensione handle (fissi per ora, ma scalabili)
    const handleSize = BASE_HANDLE_WIDTH;

    // Conversione coordinate come nelle board - memoized per performance
    const normalizedToCSS = useCallback((x: number, y: number) => {
      const rect = containerRect;
      if (!rect) return { x: 0, y: 0 };
      return {
        x: x * rect.width,
        y: y * rect.height
      };
    }, [containerRect]);

    // Log when containerRect changes for debugging (disabled to reduce console noise)
    useEffect(() => {
      // if (containerRect) {
      //   console.log('🔄 ReviewSelectionBox: Container rect updated:', {
      //     width: containerRect.width,
      //     height: containerRect.height
      //   });
      // }
    }, [containerRect]);

      // Calcola bounds per annotation with optimistic state
  const getAnnotationBounds = useCallback((annotation: ReviewAnnotation) => {
    // Use optimistic bounds if available (for resizing)
    const optimisticBound = optimisticBounds.get(annotation._id);
    if (optimisticBound) {
      return optimisticBound;
    }

    let baseX, baseY, width, height;

    if (annotation.drawingData.bounds) {
      const bounds = annotation.drawingData.bounds;
      baseX = bounds.x;
      baseY = bounds.y;
      width = bounds.width;
      height = bounds.height;
    } else {
      // Fallback per position-only annotations
      baseX = annotation.position.x;
      baseY = annotation.position.y;
      width = 50 / (containerRect?.width || 1);
      height = 50 / (containerRect?.height || 1);
      baseX -= width / 2;
      baseY -= height / 2;
    }

    // Apply optimistic positions if available (for dragging)
    const optimisticPos = optimisticPositions.get(annotation._id);
    if (optimisticPos) {
      baseX = optimisticPos.x;
      baseY = optimisticPos.y;
    }

    // Convert to CSS coordinates
    const topLeft = normalizedToCSS(baseX, baseY);
    const bottomRight = normalizedToCSS(baseX + width, baseY + height);
    
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }, [normalizedToCSS, selectedAnnotationIds, canvasState, dragOffset, containerRect, optimisticPositions, optimisticBounds]);

    // Calcola bounds per comment
    const getCommentBounds = useCallback((comment: ReviewComment) => {
      const pos = normalizedToCSS(comment.position.x, comment.position.y);
      return {
        x: pos.x - 15,
        y: pos.y - 15,
        width: 30,
        height: 30
      };
    }, [normalizedToCSS]);

    // Calcola bounds di selezione combinati
    const getSelectionBounds = useCallback((): XYWH | null => {
      const selectedAnnotations = annotations.filter(a => selectedAnnotationIds.includes(a._id));
      const selectedComments = comments.filter(c => selectedCommentIds.includes(c._id));
      
      if (selectedAnnotations.length === 0 && selectedComments.length === 0) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Process annotations
      selectedAnnotations.forEach(annotation => {
        const bounds = getAnnotationBounds(annotation);
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      });

      // Process comments
      selectedComments.forEach(comment => {
        const bounds = getCommentBounds(comment);
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      });

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
    }, [selectedAnnotationIds, selectedCommentIds, annotations, comments, getAnnotationBounds, getCommentBounds]);

  // Rotation handle and angle computation
  const rotationHandleRadius = 6;
  const rotationHandleOffset = 18; // px above the box
  const [isRotating, setIsRotating] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);

    // Gestione tasto Shift per mantenere le proporzioni
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
          setIsShiftKeyPressed(true);
        }
      };
      
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
          setIsShiftKeyPressed(false);
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, []);

    const bounds = getSelectionBounds();

    if (!bounds) {
      return null;
    }

    // Determina se mostrare gli handle - per ora sempre mostrati se c'è una selezione
    const shouldShowHandles = selectedAnnotationIds.length > 0;

    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1001 }}>
        <svg className="w-full h-full pointer-events-none">
          {/* Selection border with shadow and rounded corners */}
          <defs>
            <filter id="selectionShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#3b82f6" floodOpacity="0.4" />
            </filter>
          </defs>
          <rect
            className="fill-blue-500/5"
            x={bounds.x}
            y={bounds.y}
            width={bounds.width}
            height={bounds.height}
            rx={4}
            ry={4}
          />
          <rect
            className="fill-transparent"
            x={bounds.x}
            y={bounds.y}
            width={bounds.width}
            height={bounds.height}
            rx={4}
            ry={4}
            style={{
              stroke: '#3b82f6',
              strokeWidth: 2,
              filter: 'url(#selectionShadow)'
            }}
          />
          
          {/* Scale indicator */}
          {isGroupResizing && (
            <g>
              <rect
                x={bounds.x + bounds.width / 2 - 30}
                y={bounds.y - 30}
                width={60}
                height={20}
                className="fill-blue-500 stroke-white stroke-1"
                rx={3}
              />
              <text
                x={bounds.x + bounds.width / 2}
                y={bounds.y - 16}
                className="fill-white text-xs font-semibold"
                textAnchor="middle"
              >
                {scalePercent}
              </text>
            </g>
          )}
          
          {/* Resize handles - larger, contrast-aware */}
          {shouldShowHandles && (
            <>
              {/* Rotation handle above top-center */}
              <g className="pointer-events-auto" style={{ cursor: 'grab' }}
                 onPointerDown={(e) => {
                   e.stopPropagation();
                   setIsRotating(true);
                   (e.currentTarget as SVGGElement).setPointerCapture?.((e as any).pointerId);
                 }}
                 onPointerMove={(e) => {
                   if (!isRotating) return;
                   const rect = (e.currentTarget as SVGGElement).ownerSVGElement?.getBoundingClientRect();
                   if (!rect) return;
                   const cx = bounds.x + bounds.width / 2;
                   const cy = bounds.y + bounds.height / 2;
                   const mouseX = e.clientX - rect.left;
                   const mouseY = e.clientY - rect.top;
                   const angle = Math.atan2(mouseY - cy, mouseX - cx);
                   setRotationAngle(angle);
                 }}
                 onPointerUp={(_e) => {
                   if (!isRotating) return;
                   setIsRotating(false);
                   // TODO: integrare onAnnotationTransform se disponibile
                 }}
              >
                <line
                  x1={bounds.x + bounds.width / 2}
                  y1={bounds.y}
                  x2={bounds.x + bounds.width / 2}
                  y2={bounds.y - rotationHandleOffset}
                  className="stroke-blue-400"
                  strokeWidth={1}
                />
                <circle
                  cx={bounds.x + bounds.width / 2}
                  cy={bounds.y - rotationHandleOffset}
                  r={rotationHandleRadius}
                  className="fill-white stroke-blue-500"
                  strokeWidth={2}
                />
              </g>

              {/* Top-left handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-nwse-resize"
                x={bounds.x - handleSize / 2}
                y={bounds.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Top + Side.Left, bounds, e);
                }}
              />
              
              {/* Top-center handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-ns-resize"
                x={bounds.x + bounds.width / 2 - handleSize / 2}
                y={bounds.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Top, bounds, e);
                }}
              />
              
              {/* Top-right handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-nesw-resize"
                x={bounds.x + bounds.width - handleSize / 2}
                y={bounds.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Top + Side.Right, bounds, e);
                }}
              />
              
              {/* Middle-left handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-ew-resize"
                x={bounds.x - handleSize / 2}
                y={bounds.y + bounds.height / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Left, bounds, e);
                }}
              />
              
              {/* Middle-right handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-ew-resize"
                x={bounds.x + bounds.width - handleSize / 2}
                y={bounds.y + bounds.height / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Right, bounds, e);
                }}
              />
              
              {/* Bottom-left handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-nesw-resize"
                x={bounds.x - handleSize / 2}
                y={bounds.y + bounds.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Bottom + Side.Left, bounds, e);
                }}
              />
              
              {/* Bottom-center handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-ns-resize"
                x={bounds.x + bounds.width / 2 - handleSize / 2}
                y={bounds.y + bounds.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Bottom, bounds, e);
                }}
              />
              
              {/* Bottom-right handle */}
              <rect
                className="fill-white stroke-1 stroke-blue-500 pointer-events-auto cursor-nwse-resize"
                x={bounds.x + bounds.width - handleSize / 2}
                y={bounds.y + bounds.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onResizeHandlePointerDown(Side.Bottom + Side.Right, bounds, e);
                }}
              />
            </>
          )}
        </svg>
      </div>
    );
  }
);
