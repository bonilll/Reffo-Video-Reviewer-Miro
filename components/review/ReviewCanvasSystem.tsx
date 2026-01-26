"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ReviewAnnotation, ReviewComment } from "@/types/canvas";
import { ReviewSelectionBox, Side, ReviewCanvasMode, XYWH } from "./ReviewSelectionBox";

interface Point {
  x: number;
  y: number;
}

interface ReviewCanvasSystemProps {
  annotations: ReviewAnnotation[];
  comments?: ReviewComment[];
  selectedAnnotationIds: string[];
  selectedCommentIds?: string[];
  onAnnotationSelect: (annotationIds: string[]) => void;
  onCommentSelect?: (commentIds: string[]) => void;
  onAnnotationMove: (annotationIds: string[], deltaX: number, deltaY: number) => void;
  onCommentMove?: (commentIds: string[], deltaX: number, deltaY: number) => void;
  onAnnotationResize?: (annotationId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  theme?: 'light' | 'dark';
  containerRect?: DOMRect;
}

type CanvasState = 
  | { mode: ReviewCanvasMode.None }
  | { mode: ReviewCanvasMode.Translating; current: Point }
  | { mode: ReviewCanvasMode.Resizing; initialBounds: XYWH; corner: Side }
  | { mode: ReviewCanvasMode.GroupResizing; initialBounds: XYWH; corner: Side };

export function ReviewCanvasSystem({
  annotations,
  comments = [],
  selectedAnnotationIds,
  selectedCommentIds = [],
  onAnnotationSelect,
  onCommentSelect,
  onAnnotationMove,
  onCommentMove,
  onAnnotationResize,
  theme = 'light',
  containerRect
}: ReviewCanvasSystemProps) {
  
  const [canvasState, setCanvasState] = useState<CanvasState>({ mode: ReviewCanvasMode.None });
  const [resizeInitialMousePos, setResizeInitialMousePos] = useState<Point | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Drag state - must be declared before use in getAnnotationBounds
  const [dragStartPositions, setDragStartPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [currentDragOffset, setCurrentDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Conversione coordinate
  const normalizedToCSS = useCallback((x: number, y: number) => {
    const rect = containerRect;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: x * rect.width,
      y: y * rect.height
    };
  }, [containerRect]);

  const cssToNormalized = useCallback((x: number, y: number) => {
    const rect = containerRect;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: x / rect.width,
      y: y / rect.height
    };
  }, [containerRect]);

  // Converti mouse event a point relativo al container
  const pointerEventToCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Calcola bounds per annotation with drag offset applied
  const getAnnotationBounds = useCallback((annotation: ReviewAnnotation): XYWH => {
    let baseX, baseY;
    let width, height;

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
      width = 50 / (containerRect?.width || 1); // Normalized size
      height = 50 / (containerRect?.height || 1);
      baseX -= width / 2;
      baseY -= height / 2;
    }

    // Apply drag offset if annotation is selected and being dragged
    const isSelected = selectedAnnotationIds.includes(annotation._id);
    if (isSelected && canvasState.mode === ReviewCanvasMode.Translating) {
      baseX += currentDragOffset.x;
      baseY += currentDragOffset.y;
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
  }, [normalizedToCSS, selectedAnnotationIds, canvasState.mode, currentDragOffset, containerRect]);

  // ============== TRANSLATE FUNCTIONS (copied from board) ==============

  const translateSelectedAnnotations = useCallback((point: Point) => {
    if (canvasState.mode !== ReviewCanvasMode.Translating) {
      return;
    }

    // Calculate total offset from drag start (like board canvas)
    const totalOffset = {
      x: point.x - canvasState.current.x,
      y: point.y - canvasState.current.y,
    };

    // Convert to normalized coordinates for visual update
    const normalizedDelta = cssToNormalized(totalOffset.x, totalOffset.y);
    
    // Update visual drag offset for immediate feedback
    setCurrentDragOffset(normalizedDelta);

    // We'll do the API call only on drag end
  }, [canvasState, cssToNormalized]);

  // ============== RESIZE FUNCTIONS (copied from board) ==============

  const resizeSelectedAnnotation = useCallback((point: Point) => {
    if (canvasState.mode !== ReviewCanvasMode.Resizing || !resizeInitialMousePos || selectedAnnotationIds.length !== 1) {
      return;
    }

    const deltaX = point.x - resizeInitialMousePos.x;
    const deltaY = point.y - resizeInitialMousePos.y;
    
    const initialBounds = canvasState.initialBounds;
    let targetHandleX = initialBounds.x;
    let targetHandleY = initialBounds.y;
    
    // Calculate target handle position based on corner (same logic as board)
    if ((canvasState.corner & Side.Right) === Side.Right) {
      targetHandleX = initialBounds.x + initialBounds.width + deltaX;
    } else if ((canvasState.corner & Side.Left) === Side.Left) {
      targetHandleX = initialBounds.x + deltaX;
    } else {
      targetHandleX = initialBounds.x + initialBounds.width / 2 + deltaX;
    }
    
    if ((canvasState.corner & Side.Bottom) === Side.Bottom) {
      targetHandleY = initialBounds.y + initialBounds.height + deltaY;
    } else if ((canvasState.corner & Side.Top) === Side.Top) {
      targetHandleY = initialBounds.y + deltaY;
    } else {
      targetHandleY = initialBounds.y + initialBounds.height / 2 + deltaY;
    }
    
    const targetPoint = { x: targetHandleX, y: targetHandleY };

    // Find annotation to resize
    const annotation = annotations.find(a => a._id === selectedAnnotationIds[0]);
    if (!annotation) return;

    // Calculate new bounds (same logic as board)
    const bounds = resizeBounds(
      canvasState.corner,
      initialBounds,
      targetPoint,
      isShiftPressed
    );

    if (bounds && onAnnotationResize) {
      // Convert to normalized coordinates
      const normalizedBounds = {
        x: bounds.x / (containerRect?.width || 1),
        y: bounds.y / (containerRect?.height || 1),
        width: bounds.width / (containerRect?.width || 1),
        height: bounds.height / (containerRect?.height || 1)
      };
      
      onAnnotationResize(selectedAnnotationIds[0], normalizedBounds);
    }
  }, [canvasState, resizeInitialMousePos, selectedAnnotationIds, annotations, onAnnotationResize, containerRect, isShiftPressed]);

  // Resize bounds calculation (copied from board logic)
  const resizeBounds = useCallback((corner: Side, initialBounds: XYWH, point: Point, maintainAspectRatio: boolean): XYWH | null => {
    let newX = initialBounds.x;
    let newY = initialBounds.y;
    let newWidth = initialBounds.width;
    let newHeight = initialBounds.height;

    // Calculate new dimensions based on corner
    if ((corner & Side.Left) === Side.Left) {
      newWidth = initialBounds.x + initialBounds.width - point.x;
      newX = point.x;
    } else if ((corner & Side.Right) === Side.Right) {
      newWidth = point.x - initialBounds.x;
    }

    if ((corner & Side.Top) === Side.Top) {
      newHeight = initialBounds.y + initialBounds.height - point.y;
      newY = point.y;
    } else if ((corner & Side.Bottom) === Side.Bottom) {
      newHeight = point.y - initialBounds.y;
    }

    // Maintain aspect ratio if shift is pressed
    if (maintainAspectRatio && initialBounds.width > 0 && initialBounds.height > 0) {
      const aspectRatio = initialBounds.width / initialBounds.height;
      
      if (Math.abs(newWidth) / aspectRatio > Math.abs(newHeight)) {
        newHeight = newWidth / aspectRatio;
      } else {
        newWidth = newHeight * aspectRatio;
      }

      // Adjust position for negative dimensions
      if ((corner & Side.Left) === Side.Left && newWidth < 0) {
        newX = initialBounds.x + initialBounds.width;
        newWidth = Math.abs(newWidth);
      }
      if ((corner & Side.Top) === Side.Top && newHeight < 0) {
        newY = initialBounds.y + initialBounds.height;
        newHeight = Math.abs(newHeight);
      }
    }

    // Minimum size constraints
    const minSize = 10;
    if (Math.abs(newWidth) < minSize || Math.abs(newHeight) < minSize) {
      return null;
    }

    return {
      x: newX,
      y: newY,
      width: Math.abs(newWidth),
      height: Math.abs(newHeight)
    };
  }, []);

  // ============== EVENT HANDLERS ==============

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    
    const current = pointerEventToCanvasPoint(e);
    
    if (canvasState.mode === ReviewCanvasMode.Translating) {
      translateSelectedAnnotations(current);
    } else if (canvasState.mode === ReviewCanvasMode.Resizing) {
      resizeSelectedAnnotation(current);
    }
  }, [canvasState.mode, translateSelectedAnnotations, resizeSelectedAnnotation, pointerEventToCanvasPoint]);

  const onPointerUp = useCallback(() => {
    // If we were translating, apply the final movement
    if (canvasState.mode === ReviewCanvasMode.Translating && (Math.abs(currentDragOffset.x) > 0.001 || Math.abs(currentDragOffset.y) > 0.001)) {
      // Apply final movement to all selected annotations
      if (selectedAnnotationIds.length > 0) {
        onAnnotationMove(selectedAnnotationIds, currentDragOffset.x, currentDragOffset.y);
      }
      if (selectedCommentIds.length > 0 && onCommentMove) {
        onCommentMove(selectedCommentIds, currentDragOffset.x, currentDragOffset.y);
      }
    }

    // Reset states
    setCanvasState({ mode: ReviewCanvasMode.None });
    setResizeInitialMousePos(null);
    setCurrentDragOffset({ x: 0, y: 0 });
    setDragStartPositions(new Map());
  }, [canvasState.mode, currentDragOffset, selectedAnnotationIds, selectedCommentIds, onAnnotationMove, onCommentMove]);

  // Handle resize handle pointer down (copied from board)
  const onResizeHandlePointerDown = useCallback((corner: Side, initialBounds: XYWH, e: React.PointerEvent) => {
    e.stopPropagation();
    
    const mousePoint = pointerEventToCanvasPoint(e);
    setResizeInitialMousePos(mousePoint);
    
    if (selectedAnnotationIds.length === 1) {
      setCanvasState({
        mode: ReviewCanvasMode.Resizing,
        initialBounds,
        corner,
      });
    }
  }, [selectedAnnotationIds, pointerEventToCanvasPoint]);

  // Handle annotation click for selection and drag start
  const handleAnnotationPointerDown = useCallback((e: React.PointerEvent, annotationId: string) => {
    e.stopPropagation();
    
    // Select annotation if not already selected
    if (!selectedAnnotationIds.includes(annotationId)) {
      onAnnotationSelect([annotationId]);
    }
    
    // Save starting positions of all selected annotations
    const startPositions = new Map<string, { x: number; y: number }>();
    const selectedIds = selectedAnnotationIds.includes(annotationId) ? selectedAnnotationIds : [annotationId];
    
    selectedIds.forEach(id => {
      const annotation = annotations.find(a => a._id === id);
      if (annotation) {
        if (annotation.drawingData.bounds) {
          startPositions.set(id, {
            x: annotation.drawingData.bounds.x,
            y: annotation.drawingData.bounds.y
          });
        } else {
          startPositions.set(id, {
            x: annotation.position.x,
            y: annotation.position.y
          });
        }
      }
    });
    
    setDragStartPositions(startPositions);
    
    // Start drag
    const current = pointerEventToCanvasPoint(e);
    setCanvasState({ mode: ReviewCanvasMode.Translating, current });
  }, [selectedAnnotationIds, onAnnotationSelect, pointerEventToCanvasPoint, annotations]);

  // Shift key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div 
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 1000 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Selectable areas for annotations */}
      {annotations.map((annotation) => {
        const bounds = getAnnotationBounds(annotation);
        const isSelected = selectedAnnotationIds.includes(annotation._id);
        
        return (
          <div
            key={annotation._id}
            className={`absolute pointer-events-auto cursor-move ${
              isSelected ? 'bg-blue-500/10' : 'hover:bg-blue-300/5'
            }`}
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }}
            onPointerDown={(e) => handleAnnotationPointerDown(e, annotation._id)}
          />
        );
      })}

      {/* Selection box with resize handles */}
      <ReviewSelectionBox
        annotations={annotations}
        comments={comments}
        selectedAnnotationIds={selectedAnnotationIds}
        selectedCommentIds={selectedCommentIds}
        onResizeHandlePointerDown={onResizeHandlePointerDown}
        canvasState={canvasState.mode}
        containerRect={containerRect}
        dragOffset={currentDragOffset}
      />
    </div>
  );
}
