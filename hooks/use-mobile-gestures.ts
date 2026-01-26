import { useCallback, useRef, useState } from 'react';
import type { Camera, Point } from '@/types/canvas';

interface UseMobileGesturesProps {
  camera: Camera;
  setCamera: (camera: Camera) => void;
  onTap?: (point: Point) => void;
  onLongPress?: (point: Point) => void;
  onPanStart?: (point: Point) => void;
  onPanMove?: (point: Point, delta: Point) => void;
  onPanEnd?: () => void;
  onPinchStart?: (center: Point, distance: number) => void;
  onPinchMove?: (center: Point, distance: number, scale: number) => void;
  onPinchEnd?: () => void;
}

interface TouchState {
  startTime: number;
  startPosition: Point;
  startCamera: Camera;
  lastDistance: number | null;
  lastCenter: Point | null;
  isPinching: boolean;
  isPanning: boolean;
  touchStartCount: number;
}

export const useMobileGestures = ({
  camera,
  setCamera,
  onTap,
  onLongPress,
  onPanStart,
  onPanMove,
  onPanEnd,
  onPinchStart,
  onPinchMove,
  onPinchEnd,
}: UseMobileGesturesProps) => {
  const touchState = useRef<TouchState>({
    startTime: 0,
    startPosition: { x: 0, y: 0 },
    startCamera: camera,
    lastDistance: null,
    lastCenter: null,
    isPinching: false,
    isPanning: false,
    touchStartCount: 0,
  });

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Helper functions
  const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touch1: Touch, touch2: Touch): Point => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  };

  const screenToCanvas = useCallback((point: Point): Point => {
    return {
      x: (point.x - camera.x) / camera.scale,
      y: (point.y - camera.y) / camera.scale,
    };
  }, [camera]);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = Array.from(e.touches);
    const state = touchState.current;
    
    clearLongPressTimer();
    
    if (touches.length === 1) {
      // Single touch
      const touch = touches[0];
      const point = { x: touch.clientX, y: touch.clientY };
      
      state.startTime = Date.now();
      state.startPosition = point;
      state.startCamera = camera;
      state.isPanning = false;
      state.isPinching = false;
      state.touchStartCount = 1;
      
      // Start long press timer
      longPressTimer.current = setTimeout(() => {
        if (!state.isPanning && !state.isPinching) {
          const canvasPoint = screenToCanvas(point);
          onLongPress?.(canvasPoint);
        }
      }, 500);
      
      onPanStart?.(screenToCanvas(point));
      
    } else if (touches.length === 2) {
      // Two finger touch - pinch
      e.preventDefault();
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      
      state.lastDistance = distance;
      state.lastCenter = center;
      state.startCamera = camera;
      state.isPinching = true;
      state.isPanning = false;
      state.touchStartCount = 2;
      
      clearLongPressTimer();
      onPinchStart?.(center, distance);
    }
  }, [camera, screenToCanvas, onTap, onLongPress, onPanStart, onPinchStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = Array.from(e.touches);
    const state = touchState.current;
    
    clearLongPressTimer();
    
    if (touches.length === 1 && !state.isPinching) {
      // Single touch move - pan
      const touch = touches[0];
      const point = { x: touch.clientX, y: touch.clientY };
      
      const timeDiff = Date.now() - state.startTime;
      const distance = Math.sqrt(
        Math.pow(point.x - state.startPosition.x, 2) + 
        Math.pow(point.y - state.startPosition.y, 2)
      );
      
      // Start panning if moved enough or time passed
      if (distance > 10 || timeDiff > 150) {
        if (!state.isPanning) {
          state.isPanning = true;
        }
        
        const deltaX = point.x - state.startPosition.x;
        const deltaY = point.y - state.startPosition.y;
        
        const newCamera = {
          x: state.startCamera.x + deltaX,
          y: state.startCamera.y + deltaY,
          scale: state.startCamera.scale
        };
        
        setCamera(newCamera);
        
        const delta = { x: deltaX, y: deltaY };
        onPanMove?.(screenToCanvas(point), delta);
      }
      
    } else if (touches.length === 2 && state.isPinching) {
      // Two finger move - pinch zoom
      e.preventDefault();
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      
      if (state.lastDistance && state.lastCenter) {
        // Calculate zoom factor
        const zoomFactor = distance / state.lastDistance;
        let newScale = state.startCamera.scale * zoomFactor;
        
        // Clamp zoom between 0.1x and 5x
        newScale = Math.max(0.1, Math.min(5, newScale));
        
        // Calculate new camera position to zoom toward touch center
        const zoomPoint = screenToCanvas(state.lastCenter);
        
        const newCamera = {
          x: center.x - zoomPoint.x * newScale,
          y: center.y - zoomPoint.y * newScale,
          scale: newScale
        };
        
        setCamera(newCamera);
        onPinchMove?.(center, distance, newScale);
      }
    }
  }, [screenToCanvas, setCamera, onPanMove, onPinchMove]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const remainingTouches = Array.from(e.touches);
    const state = touchState.current;
    
    clearLongPressTimer();
    
    if (remainingTouches.length === 0) {
      // All touches ended
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - state.startTime;
      
      // Check for tap gesture
      if (touchDuration < 300 && !state.isPanning && !state.isPinching) {
        const touch = e.changedTouches[0];
        const point = { x: touch.clientX, y: touch.clientY };
        const distance = Math.sqrt(
          Math.pow(point.x - state.startPosition.x, 2) + 
          Math.pow(point.y - state.startPosition.y, 2)
        );
        
        if (distance < 10) {
          // Quick tap
          const canvasPoint = screenToCanvas(point);
          onTap?.(canvasPoint);
        }
      }
      
      // Reset state
      state.isPinching = false;
      state.isPanning = false;
      state.lastDistance = null;
      state.lastCenter = null;
      state.touchStartCount = 0;
      
      onPanEnd?.();
      onPinchEnd?.();
      
    } else if (remainingTouches.length === 1 && state.isPinching) {
      // Transition from pinch to single touch
      state.isPinching = false;
      onPinchEnd?.();
      
      // Start new single touch interaction
      const touch = remainingTouches[0];
      const point = { x: touch.clientX, y: touch.clientY };
      
      state.startTime = Date.now();
      state.startPosition = point;
      state.startCamera = camera;
      state.isPanning = false;
      state.touchStartCount = 1;
    }
  }, [camera, screenToCanvas, onTap, onPanEnd, onPinchEnd]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isGesturing: touchState.current.isPanning || touchState.current.isPinching,
  };
}; 