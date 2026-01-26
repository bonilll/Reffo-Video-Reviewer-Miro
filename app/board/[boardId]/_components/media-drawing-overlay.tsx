"use client";

import { useCallback, useState, useRef } from "react";
import { CanvasMode, CanvasState, Point } from "@/types/canvas";
import { pointerEventToCanvasPoint } from "@/lib/utils";

interface MediaDrawingOverlayProps {
  canvasState: CanvasState;
  layerId: string;
  onPointerDown?: (e: React.PointerEvent, layerId: string) => void;
  onDrawingStart?: (point: Point, pressure: number) => void;
  onDrawingContinue?: (point: Point, e: React.PointerEvent) => void;
  onDrawingEnd?: () => void;
  // For handling drawing mode (shapes)
  onDrawingModeStart?: (point: Point) => void;
  onDrawingModeMove?: (point: Point) => void;
  onDrawingModeEnd?: (point: Point) => void;
  onCommentClick?: (point: Point) => void;
  camera?: { x: number; y: number; scale: number };
}

export function MediaDrawingOverlay({
  canvasState,
  layerId,
  onPointerDown,
  onDrawingStart,
  onDrawingContinue,
  onDrawingEnd,
  onDrawingModeStart,
  onDrawingModeMove,
  onDrawingModeEnd,
  onCommentClick,
  camera = { x: 0, y: 0, scale: 1 }
}: MediaDrawingOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Use the same coordinate conversion as the main canvas
  const getCanvasPoint = useCallback((e: React.PointerEvent): Point => {
    return pointerEventToCanvasPoint(e, camera);
  }, [camera]);

  // Determine if we should handle drawing events
  const shouldHandleDrawing = useCallback(() => {
    return canvasState.mode === CanvasMode.Pencil || 
           canvasState.mode === CanvasMode.Drawing ||
           canvasState.mode === CanvasMode.Inserting;
  }, [canvasState.mode]);

  // Determine if we should handle comment events
  const shouldHandleComments = useCallback(() => {
    // Add comment mode detection here when available
    return false; // TODO: Implement comment mode detection
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Special handling for video controls - don't intercept clicks on video control area
    const target = e.target as HTMLElement;
    if (target.tagName === 'VIDEO') {
      const rect = target.getBoundingClientRect();
      const controlsHeight = 40;
      const clickY = e.clientY;
      
      // If clicking in the controls area, don't handle drawing
      if (clickY > rect.bottom - controlsHeight) {
        onPointerDown?.(e, layerId);
        return;
      }
    }
    
    const point = getCanvasPoint(e);
    
    if (shouldHandleDrawing()) {
      // Handle drawing events
      e.stopPropagation();
      
      if (canvasState.mode === CanvasMode.Pencil) {
        setIsDrawing(true);
        onDrawingStart?.(point, e.pressure);
      } else if (canvasState.mode === CanvasMode.Drawing) {
        setIsDrawing(true);
        onDrawingModeStart?.(point);
      } else if (canvasState.mode === CanvasMode.Inserting) {
        // Handle inserting mode - this transitions to Drawing
        onDrawingModeStart?.(point);
      }
    } else if (shouldHandleComments()) {
      // Handle comment placement
      e.stopPropagation();
      onCommentClick?.(point);
    } else {
      // Pass through to layer for normal interactions (drag, select, etc.)
      onPointerDown?.(e, layerId);
    }
  }, [
    getCanvasPoint, 
    shouldHandleDrawing, 
    shouldHandleComments, 
    canvasState.mode, 
    onDrawingStart, 
    onCommentClick, 
    onPointerDown, 
    layerId
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing || !shouldHandleDrawing()) return;
    
    const point = getCanvasPoint(e);
    
    if (canvasState.mode === CanvasMode.Pencil) {
      onDrawingContinue?.(point, e);
    } else if (canvasState.mode === CanvasMode.Drawing) {
      onDrawingModeMove?.(point);
    }
  }, [isDrawing, shouldHandleDrawing, canvasState.mode, getCanvasPoint, onDrawingContinue, onDrawingModeMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDrawing && shouldHandleDrawing()) {
      const point = getCanvasPoint(e);
      setIsDrawing(false);
      
      if (canvasState.mode === CanvasMode.Pencil) {
        onDrawingEnd?.();
      } else if (canvasState.mode === CanvasMode.Drawing) {
        onDrawingModeEnd?.(point);
      }
    }
  }, [isDrawing, shouldHandleDrawing, canvasState.mode, getCanvasPoint, onDrawingEnd, onDrawingModeEnd]);

  const handlePointerLeave = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
    }
  }, [isDrawing]);

  // Determine cursor style based on mode
  const getCursorStyle = useCallback(() => {
    if (canvasState.mode === CanvasMode.Pencil) {
      return 'crosshair';
    } else if (canvasState.mode === CanvasMode.Drawing) {
      return 'crosshair';
    } else if (canvasState.mode === CanvasMode.Inserting) {
      return 'crosshair';
    } else if (shouldHandleComments()) {
      return 'pointer';
    }
    return 'default';
  }, [canvasState.mode, shouldHandleComments]);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 w-full h-full"
      style={{
        cursor: getCursorStyle(),
        pointerEvents: shouldHandleDrawing() || shouldHandleComments() ? 'auto' : 'none',
        zIndex: 10, // Above the media content but below other UI elements
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {/* Drawing preview overlay */}
      {isDrawing && canvasState.mode === CanvasMode.Pencil && (
        <div
          className="absolute pointer-events-none"
          style={{
            background: 'transparent',
            zIndex: 5
          }}
        >
          {/* TODO: Render pencil preview here */}
        </div>
      )}
      
      {/* Shape drawing preview */}
      {canvasState.mode === CanvasMode.Drawing && canvasState.current && (
        <div
          className="absolute pointer-events-none"
          style={{
            background: 'transparent',
            zIndex: 5
          }}
        >
          {/* TODO: Render shape preview here */}
        </div>
      )}
    </div>
  );
}