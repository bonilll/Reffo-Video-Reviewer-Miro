"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ReviewAnnotation, ReviewComment } from "@/types/canvas";
import { ReviewSelectionBox, Side, ReviewCanvasMode, XYWH } from "./ReviewSelectionBox";

interface Point {
  x: number;
  y: number;
}

interface ReviewCanvasSystemOptimizedProps {
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
  // Callback to expose optimistic state to parent
  onOptimisticStateChange?: (positions: Map<string, { x: number; y: number }>, bounds: Map<string, XYWH>) => void;
}

type CanvasState = 
  | { mode: ReviewCanvasMode.None }
  | { mode: ReviewCanvasMode.Translating; current: Point }
  | { mode: ReviewCanvasMode.Resizing; initialBounds: XYWH; corner: Side };

// Cache for optimized coordinate conversions
interface CoordinateCache {
  containerRect: DOMRect;
  normalizedToCSS: (x: number, y: number) => Point;
  cssToNormalized: (x: number, y: number) => Point;
}

export function ReviewCanvasSystemOptimized({
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
  containerRect,
  onOptimisticStateChange
}: ReviewCanvasSystemOptimizedProps) {
  
  const [canvasState, setCanvasState] = useState<CanvasState>({ mode: ReviewCanvasMode.None });
  const [resizeInitialMousePos, setResizeInitialMousePos] = useState<Point | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Optimistic state for real-time visual updates
  const [optimisticPositions, setOptimisticPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [optimisticBounds, setOptimisticBounds] = useState<Map<string, XYWH>>(new Map());
  
  // Debounced API calls
  const apiCallTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingMoves = useRef<Map<string, { deltaX: number; deltaY: number }>>(new Map());
  
  // Coordinate conversion cache for performance - updates when container changes
  const coordinateCache = useMemo<CoordinateCache | null>(() => {
    if (!containerRect) return null;
    
    return {
      containerRect,
      normalizedToCSS: (x: number, y: number) => ({
        x: x * containerRect.width,
        y: y * containerRect.height
      }),
      cssToNormalized: (x: number, y: number) => ({
        x: x / containerRect.width,
        y: y / containerRect.height
      })
    };
  }, [containerRect]);

  // Clear optimistic state when container rect changes to force recalculation
  // BUT ONLY if we're not currently in an active operation
  // Use refs to prevent infinite loops by not depending on state variables
  const prevContainerRectRef = useRef<DOMRect | null>(null);
  const optimisticPositionsRef = useRef(optimisticPositions);
  const optimisticBoundsRef = useRef(optimisticBounds);
  
  // Keep refs updated
  optimisticPositionsRef.current = optimisticPositions;
  optimisticBoundsRef.current = optimisticBounds;
  
  useEffect(() => {
    if (containerRect && prevContainerRectRef.current) {
      const prevRect = prevContainerRectRef.current;
      // Only clear if container dimensions actually changed
      if (containerRect.width !== prevRect.width || containerRect.height !== prevRect.height) {
        const hasActiveOperations = canvasState.mode !== ReviewCanvasMode.None;
        
        if (!hasActiveOperations) {
          // Only clear if we actually have optimistic state to clear
          const currentPositions = optimisticPositionsRef.current;
          const currentBounds = optimisticBoundsRef.current;
          
          if (currentPositions.size > 0 || currentBounds.size > 0) {
            setOptimisticPositions(new Map());
            setOptimisticBounds(new Map());
          }
        }
      }
    }
    prevContainerRectRef.current = containerRect;
  }, [containerRect, canvasState.mode]); // Remove width/height dependencies

  // Convert mouse event to canvas point
  const pointerEventToCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Get annotation bounds with optimistic updates applied
  const getAnnotationBounds = useCallback((annotation: ReviewAnnotation): XYWH => {
    let baseX, baseY, width, height;

    // Use optimistic bounds if available
    const optimisticBound = optimisticBounds.get(annotation._id);
    if (optimisticBound) {
      return optimisticBound;
    }

    if (annotation.drawingData.bounds) {
      const bounds = annotation.drawingData.bounds;
      baseX = bounds.x;
      baseY = bounds.y;
      width = bounds.width;
      height = bounds.height;
    } else {
      baseX = annotation.position.x;
      baseY = annotation.position.y;
      width = 50 / (containerRect?.width || 1);
      height = 50 / (containerRect?.height || 1);
      baseX -= width / 2;
      baseY -= height / 2;
    }

    // Apply optimistic position updates
    const optimisticPos = optimisticPositions.get(annotation._id);
    if (optimisticPos) {
      baseX = optimisticPos.x;
      baseY = optimisticPos.y;
    }

    // Convert to CSS coordinates
    if (!coordinateCache) return { x: 0, y: 0, width: 0, height: 0 };
    
    const topLeft = coordinateCache.normalizedToCSS(baseX, baseY);
    const bottomRight = coordinateCache.normalizedToCSS(baseX + width, baseY + height);
    
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }, [optimisticBounds, optimisticPositions, coordinateCache, containerRect]);

  // Optimistic translate with immediate visual feedback (like board canvas)
  const translateSelectedAnnotations = useCallback((point: Point) => {
    if (canvasState.mode !== ReviewCanvasMode.Translating) return;
    if (!coordinateCache) return;

    const totalOffset = {
      x: point.x - canvasState.current.x,
      y: point.y - canvasState.current.y,
    };

    const normalizedDelta = coordinateCache.cssToNormalized(totalOffset.x, totalOffset.y);
    
    // Update optimistic positions immediately for visual feedback
    const newOptimisticPositions = new Map(optimisticPositions);
    
    selectedAnnotationIds.forEach(id => {
      const annotation = annotations.find(a => a._id === id);
      if (annotation) {
        const currentPos = newOptimisticPositions.get(id) || annotation.position;
        newOptimisticPositions.set(id, {
          x: currentPos.x + normalizedDelta.x,
          y: currentPos.y + normalizedDelta.y
        });
      }
    });
    
    setOptimisticPositions(newOptimisticPositions);
    
    // Accumulate pending moves for debounced API call
    selectedAnnotationIds.forEach(id => {
      const current = pendingMoves.current.get(id) || { deltaX: 0, deltaY: 0 };
      pendingMoves.current.set(id, {
        deltaX: current.deltaX + normalizedDelta.x,
        deltaY: current.deltaY + normalizedDelta.y
      });
    });
    
    // Update canvasState current for next iteration
    setCanvasState({ ...canvasState, current: point });
  }, [canvasState, coordinateCache, optimisticPositions, selectedAnnotationIds, annotations]);

  // Optimistic resize with immediate visual feedback
  const resizeSelectedAnnotation = useCallback((point: Point) => {
    if (canvasState.mode !== ReviewCanvasMode.Resizing || !resizeInitialMousePos || selectedAnnotationIds.length !== 1) {
      return;
    }
    if (!coordinateCache) return;

    const deltaX = point.x - resizeInitialMousePos.x;
    const deltaY = point.y - resizeInitialMousePos.y;
    
    const initialBounds = canvasState.initialBounds;
    let targetHandleX = initialBounds.x;
    let targetHandleY = initialBounds.y;
    
    // Calculate target handle position (same logic as board)
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

    // Calculate new bounds
    const bounds = resizeBounds(canvasState.corner, initialBounds, targetPoint, isShiftPressed);

    if (bounds) {
      // Update optimistic bounds immediately
      const newOptimisticBounds = new Map(optimisticBounds);
      newOptimisticBounds.set(selectedAnnotationIds[0], bounds);
      setOptimisticBounds(newOptimisticBounds);
      
      // Debounced API call for resize
      const id = selectedAnnotationIds[0];
      if (apiCallTimeouts.current.has(id)) {
        clearTimeout(apiCallTimeouts.current.get(id));
      }
      
      const timeout = setTimeout(() => {
        if (onAnnotationResize) {
          const normalizedBounds = {
            x: bounds.x / (containerRect?.width || 1),
            y: bounds.y / (containerRect?.height || 1),
            width: bounds.width / (containerRect?.width || 1),
            height: bounds.height / (containerRect?.height || 1)
          };
          onAnnotationResize(id, normalizedBounds);
        }
        apiCallTimeouts.current.delete(id);
      }, 16); // 60fps debouncing
      
      apiCallTimeouts.current.set(id, timeout);
    }
  }, [canvasState, resizeInitialMousePos, selectedAnnotationIds, optimisticBounds, onAnnotationResize, containerRect, isShiftPressed, coordinateCache]);

  // Resize bounds calculation (copied from board logic)
  const resizeBounds = useCallback((corner: Side, initialBounds: XYWH, point: Point, maintainAspectRatio: boolean): XYWH | null => {
    let newX = initialBounds.x;
    let newY = initialBounds.y;
    let newWidth = initialBounds.width;
    let newHeight = initialBounds.height;

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

    if (maintainAspectRatio && initialBounds.width > 0 && initialBounds.height > 0) {
      const aspectRatio = initialBounds.width / initialBounds.height;
      
      if (Math.abs(newWidth) / aspectRatio > Math.abs(newHeight)) {
        newHeight = newWidth / aspectRatio;
      } else {
        newWidth = newHeight * aspectRatio;
      }

      if ((corner & Side.Left) === Side.Left && newWidth < 0) {
        newX = initialBounds.x + initialBounds.width;
        newWidth = Math.abs(newWidth);
      }
      if ((corner & Side.Top) === Side.Top && newHeight < 0) {
        newY = initialBounds.y + initialBounds.height;
        newHeight = Math.abs(newHeight);
      }
    }

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

  // Event handlers with optimized performance
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    
    const current = pointerEventToCanvasPoint(e);
    
    if (canvasState.mode === ReviewCanvasMode.Translating) {
      translateSelectedAnnotations(current);
    } else if (canvasState.mode === ReviewCanvasMode.Resizing) {
      resizeSelectedAnnotation(current);
    }
  }, [canvasState.mode, translateSelectedAnnotations, resizeSelectedAnnotation, pointerEventToCanvasPoint]);

  const onPointerUp = useCallback(async () => {
    let hasChanges = false;
    const apiPromises: Promise<void>[] = [];

    // Handle translations
    if (canvasState.mode === ReviewCanvasMode.Translating) {
      pendingMoves.current.forEach((move, annotationId) => {
        if (Math.abs(move.deltaX) > 0.001 || Math.abs(move.deltaY) > 0.001) {
          hasChanges = true;
          // Clear existing timeout for this annotation
          if (apiCallTimeouts.current.has(annotationId)) {
            clearTimeout(apiCallTimeouts.current.get(annotationId));
            apiCallTimeouts.current.delete(annotationId);
          }
          
          // Create promise for API call
          const movePromise = new Promise<void>((resolve) => {
            try {
              onAnnotationMove([annotationId], move.deltaX, move.deltaY);
              setTimeout(resolve, 100);
            } catch (error) {
              console.error("Error in onAnnotationMove:", error);
              resolve();
            }
          });
          
          apiPromises.push(movePromise);
        }
      });
      
      pendingMoves.current.clear();
    }

    // Handle resize - let any pending resize timeout complete
    if (canvasState.mode === ReviewCanvasMode.Resizing) {
      // Check if there are pending resize operations
      if (apiCallTimeouts.current.size > 0) {
        hasChanges = true;
        // Create promises for any pending resize timeouts
        const resizePromises = Array.from(apiCallTimeouts.current.entries()).map(([id, timeout]) => {
          return new Promise<void>((resolve) => {
            // Let the existing timeout complete, then wait a bit more
            setTimeout(() => {
              resolve();
            }, 150); // Give time for resize API call to complete
          });
        });
        apiPromises.push(...resizePromises);
      }
    }

    // Reset canvas mode immediately for user feedback
    setCanvasState({ mode: ReviewCanvasMode.None });
    setResizeInitialMousePos(null);
    
    // If there were changes, wait for API calls to complete
    if (hasChanges && apiPromises.length > 0) {
      await Promise.all(apiPromises);
      
      // Delay clearing optimistic state to allow database updates to propagate
      setTimeout(() => {
        setOptimisticPositions(new Map());
        setOptimisticBounds(new Map());
      }, 200);
    } else {
      // No changes, can clear immediately
      setOptimisticPositions(new Map());
      setOptimisticBounds(new Map());
    }
  }, [canvasState.mode, onAnnotationMove]);

  // Handle resize handle pointer down
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
    
    if (!selectedAnnotationIds.includes(annotationId)) {
      onAnnotationSelect([annotationId]);
    }
    
    const current = pointerEventToCanvasPoint(e);
    setCanvasState({ mode: ReviewCanvasMode.Translating, current });
  }, [selectedAnnotationIds, onAnnotationSelect, pointerEventToCanvasPoint]);


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

  // Notify parent when optimistic state changes
  useEffect(() => {
    if (onOptimisticStateChange) {
      onOptimisticStateChange(optimisticPositions, optimisticBounds);
    }
  }, [optimisticPositions, optimisticBounds, onOptimisticStateChange]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      apiCallTimeouts.current.forEach(timeout => clearTimeout(timeout));
      apiCallTimeouts.current.clear();
    };
  }, []);

  return (
    <div 
      ref={canvasRef}
      className="absolute inset-0"
      style={{ zIndex: 10, pointerEvents: 'none' }} // Lower z-index than comment bubbles (20)
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Selectable areas for annotations with optimistic positions */}
      {annotations.map((annotation) => {
        const bounds = getAnnotationBounds(annotation);
        const isSelected = selectedAnnotationIds.includes(annotation._id);
        
        return (
          <div
            key={annotation._id}
            className={`absolute cursor-move transition-none ${
              isSelected ? 'bg-blue-500/10' : 'hover:bg-blue-300/5'
            }`}
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
              pointerEvents: 'auto',
              zIndex: 11 // Higher than container but lower than comment bubbles
            }}
            onPointerDown={(e) => handleAnnotationPointerDown(e, annotation._id)}
          />
        );
      })}

      {/* Selection box with resize handles */}
      <div style={{ pointerEvents: 'auto', zIndex: 12 }}>
        <ReviewSelectionBox
          annotations={annotations}
          comments={comments}
          selectedAnnotationIds={selectedAnnotationIds}
          selectedCommentIds={selectedCommentIds}
          onResizeHandlePointerDown={onResizeHandlePointerDown}
          canvasState={canvasState.mode}
          containerRect={containerRect}
          dragOffset={{ x: 0, y: 0 }}
          // Pass optimistic state for real-time bounds calculation
          optimisticPositions={optimisticPositions}
          optimisticBounds={optimisticBounds}
        />
      </div>
    </div>
  );
}