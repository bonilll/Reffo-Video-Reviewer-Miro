"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { ReviewAnnotation, ReviewComment } from "@/types/canvas";

interface SimpleAnnotationSelectorProps {
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
  canvasRect?: DOMRect;
}

type DragMode = 'none' | 'move' | 'resize';

interface DragState {
  mode: DragMode;
  startPoint: { x: number; y: number } | null;
  isDragging: boolean;
}

export function SimpleAnnotationSelector({
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
  canvasRect
}: SimpleAnnotationSelectorProps) {
  
  const [dragState, setDragState] = useState<DragState>({
    mode: 'none',
    startPoint: null,
    isDragging: false
  });
  
  const selectorRef = useRef<HTMLDivElement>(null);

  // Simple coordinate conversion - normalized to CSS pixels
  const normalizedToCSS = useCallback((x: number, y: number) => {
    const rect = selectorRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: x * rect.width,
      y: y * rect.height
    };
  }, []);

  const cssToNormalized = useCallback((x: number, y: number) => {
    const rect = selectorRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: x / rect.width,
      y: y / rect.height
    };
  }, []);

  // Get bounds for an annotation
  const getAnnotationBounds = useCallback((annotation: ReviewAnnotation) => {
    if (annotation.drawingData.bounds) {
      const bounds = annotation.drawingData.bounds;
      const topLeft = normalizedToCSS(bounds.x, bounds.y);
      const bottomRight = normalizedToCSS(bounds.x + bounds.width, bounds.y + bounds.height);
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
      };
    }
    // Fallback for position-only annotations
    const pos = normalizedToCSS(annotation.position.x, annotation.position.y);
    return {
      x: pos.x - 25,
      y: pos.y - 25,
      width: 50,
      height: 50
    };
  }, [normalizedToCSS]);

  // Handle mouse down - start drag
  const handleMouseDown = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Select the annotation if not already selected
    if (!selectedAnnotationIds.includes(annotationId)) {
      onAnnotationSelect([annotationId]);
    }
    
    setDragState({
      mode: 'move',
      startPoint: { x: e.clientX, y: e.clientY },
      isDragging: true
    });
  }, [selectedAnnotationIds, onAnnotationSelect]);

  // Handle mouse move - translate like board canvas
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.startPoint || dragState.mode !== 'move') return;
    
    const currentPoint = { x: e.clientX, y: e.clientY };
    
    // Calculate delta in CSS pixels
    const deltaX = currentPoint.x - dragState.startPoint.x;
    const deltaY = currentPoint.y - dragState.startPoint.y;
    
    // Convert to normalized coordinates for API
    const normalizedDelta = cssToNormalized(deltaX, deltaY);
    
    // Call the move API immediately like board canvas does
    if (selectedAnnotationIds.length > 0) {
      onAnnotationMove(selectedAnnotationIds, normalizedDelta.x, normalizedDelta.y);
    }
    if (selectedCommentIds.length > 0 && onCommentMove) {
      onCommentMove(selectedCommentIds, normalizedDelta.x, normalizedDelta.y);
    }
    
    // Update start point for next delta calculation
    setDragState(prev => ({
      ...prev,
      startPoint: currentPoint
    }));
  }, [dragState, selectedAnnotationIds, selectedCommentIds, onAnnotationMove, onCommentMove, cssToNormalized]);

  // Handle mouse up - end drag
  const handleMouseUp = useCallback(() => {
    setDragState({
      mode: 'none',
      startPoint: null,
      isDragging: false
    });
  }, []);

  // Set up global mouse events when dragging
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={selectorRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1000 }}
    >
      {/* Render selectable areas for annotations */}
      {annotations.map((annotation) => {
        const bounds = getAnnotationBounds(annotation);
        const isSelected = selectedAnnotationIds.includes(annotation._id);
        
        return (
          <div
            key={annotation._id}
            className={`absolute pointer-events-auto cursor-move ${
              isSelected ? 'bg-blue-500/10 border-2 border-blue-500' : 'hover:bg-blue-300/5'
            }`}
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }}
            onMouseDown={(e) => handleMouseDown(e, annotation._id)}
          />
        );
      })}
      
      {/* Simple selection box for selected items */}
      {selectedAnnotationIds.length > 0 && (
        <div className="absolute border-2 border-blue-500 bg-blue-500/5 pointer-events-none">
          {/* Selection box would be calculated here if needed */}
        </div>
      )}
    </div>
  );
}
