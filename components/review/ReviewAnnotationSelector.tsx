"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { ReviewAnnotation, ReviewComment, Side, Point, XYWH } from "@/types/canvas";
import { resizeBounds } from "@/lib/utils";
import { CommentBubble } from "./CommentBubble";

interface ReviewAnnotationSelectorProps {
  annotations: ReviewAnnotation[];
  comments?: ReviewComment[];
  selectedAnnotationIds: string[];
  selectedCommentIds?: string[];
  onAnnotationSelect: (annotationIds: string[]) => void;
  onCommentSelect?: (commentIds: string[]) => void;
  onAnnotationMove: (annotationIds: string[], deltaX: number, deltaY: number) => void;
  onCommentMove?: (commentIds: string[], deltaX: number, deltaY: number) => void;
  onAnnotationResize?: (annotationId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationRotate?: (annotationId: string, rotation: number) => void;
  onAnnotationTransform?: (annotationId: string, transform: { x: number; y: number; width: number; height: number; rotation?: number }) => void;
  onCommentClick?: (comment: ReviewComment, position: { x: number; y: number }) => void;
  theme?: 'dark' | 'light';
  canvasRect?: DOMRect;
  canvasNativeWidth?: number;
  canvasNativeHeight?: number;
  scale?: number;
  pan?: { x: number; y: number };
}

enum ResizeHandle {
  TopLeft = "nw-resize",
  Top = "n-resize", 
  TopRight = "ne-resize",
  Right = "e-resize",
  BottomRight = "se-resize",
  Bottom = "s-resize",
  BottomLeft = "sw-resize",
  Left = "w-resize"
}

// 🎯 BOARD COMPATIBILITY: Converte ResizeHandle → Side enum
const resizeHandleToSide = (handle: ResizeHandle): Side => {
  switch (handle) {
    case ResizeHandle.TopLeft: return Side.Top | Side.Left;
    case ResizeHandle.Top: return Side.Top;
    case ResizeHandle.TopRight: return Side.Top | Side.Right;
    case ResizeHandle.Right: return Side.Right;
    case ResizeHandle.BottomRight: return Side.Bottom | Side.Right;
    case ResizeHandle.Bottom: return Side.Bottom;
    case ResizeHandle.BottomLeft: return Side.Bottom | Side.Left;
    case ResizeHandle.Left: return Side.Left;
    default: return Side.Top | Side.Left;
  }
};

interface DragState {
  isDragging: boolean;
  mode: 'move' | 'resize' | 'none';
  startX: number;
  startY: number;
  initialBounds: { x: number; y: number; width: number; height: number };
  resizeHandle?: ResizeHandle;
}

interface AreaSelectionState {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// Optimistic state for smooth visual updates
interface OptimisticUpdate {
  annotationId: string;
  type: 'move' | 'resize';
  deltaX?: number;
  deltaY?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

export function ReviewAnnotationSelector({
  annotations,
  comments = [],
  selectedAnnotationIds,
  selectedCommentIds = [],
  onAnnotationSelect,
  onCommentSelect,
  onAnnotationMove,
  onCommentMove,
  onAnnotationResize,
  onAnnotationRotate,
  onAnnotationTransform,
  onCommentClick,
  theme = 'light',
  canvasRect,
  canvasNativeWidth = 800,
  canvasNativeHeight = 600,
  scale = 1,
  pan = { x: 0, y: 0 }
}: ReviewAnnotationSelectorProps) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    mode: 'none',
    startX: 0,
    startY: 0,
    initialBounds: { x: 0, y: 0, width: 0, height: 0 }
  });
  
  // Use ref to store drag state for event handlers to avoid recreating listeners
  const dragStateRef = useRef(dragState);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const [areaSelection, setAreaSelection] = useState<AreaSelectionState>({
    isSelecting: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  });

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  
  // Optimistic state management
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, OptimisticUpdate>>(new Map());
  const pendingUpdates = useRef<Set<string>>(new Set());
  
  const selectorRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);

  // Handle size calculation based on scale
  const getHandleSize = useCallback(() => {
    const BASE_SIZE = 8;
    const MIN_SIZE = 6;
    const MAX_SIZE = 12;
    
    let size = BASE_SIZE;
    if (scale >= 1) {
      size = BASE_SIZE * Math.pow(1/scale, 0.6);
    } else if (scale >= 0.1) {
      size = BASE_SIZE * Math.pow(1/scale, 1.1);
    } else {
      size = BASE_SIZE * Math.pow(1/scale, 0.8) * 2;
    }
    
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
  }, [scale]);

  // Convert native coordinates (based on media's intrinsic pixel size) to CSS coordinates
  // aligned with the rendered media rectangle (canvasRect) without external offsets.
  const convertNativeToCSS = useCallback((nativeX: number, nativeY: number) => {
    if (!canvasRect) {
      return { x: nativeX, y: nativeY };
    }
    // Use provided canvasNativeWidth/Height to compute precise scaling
    const width = canvasRect.width || 1;
    const height = canvasRect.height || 1;
    const scaleX = width / (canvasNativeWidth || width);
    const scaleY = height / (canvasNativeHeight || height);
    return {
      x: nativeX * scaleX,
      y: nativeY * scaleY
    };
  }, [canvasRect, canvasNativeWidth, canvasNativeHeight]);

  // Convert CSS coordinates back to native coordinates (inverse of above)
  const convertCSSToNative = useCallback((cssX: number, cssY: number) => {
    if (!canvasRect) {
      return { x: cssX, y: cssY };
    }
    const width = canvasRect.width || 1;
    const height = canvasRect.height || 1;
    const scaleX = width / (canvasNativeWidth || width);
    const scaleY = height / (canvasNativeHeight || height);
    return {
      x: cssX / (scaleX || 1),
      y: cssY / (scaleY || 1)
    };
  }, [canvasRect, canvasNativeWidth, canvasNativeHeight]);

  // Get comment bounds (comments are always 30x30 circles)
  const getCommentBounds = useCallback((comment: ReviewComment) => {
    const cssPos = convertNativeToCSS(comment.position.x, comment.position.y);
    
    // Apply optimistic updates
    const optimisticUpdate = optimisticUpdates.get(comment._id);
    let bounds = {
      x: cssPos.x - 15,
      y: cssPos.y - 15,
      width: 30,
      height: 30
    };
    
    if (optimisticUpdate && optimisticUpdate.type === 'move' && optimisticUpdate.deltaX !== undefined && optimisticUpdate.deltaY !== undefined) {
      bounds.x += optimisticUpdate.deltaX;
      bounds.y += optimisticUpdate.deltaY;
    }
    
    return bounds;
  }, [convertNativeToCSS, optimisticUpdates]);

  // Get annotation bounds with optimistic updates applied
  const getAnnotationBounds = useCallback((annotation: ReviewAnnotation) => {
    let baseBounds: { x: number; y: number; width: number; height: number };
    
    console.log(`📏 GetAnnotationBounds for ${annotation._id}:`, {
      type: annotation.type,
      hasPoints: annotation.type === "freehand" && !!annotation.drawingData.points,
      hasBounds: !!annotation.drawingData.bounds,
      nativeBounds: annotation.drawingData.bounds,
      position: annotation.position
    });
    
    if (annotation.type === "freehand") {
      // Freehand può avere points array o path string
      if (annotation.drawingData.points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        annotation.drawingData.points.forEach(point => {
          const cssPoint = convertNativeToCSS(point.x, point.y);
          minX = Math.min(minX, cssPoint.x);
          minY = Math.min(minY, cssPoint.y);
          maxX = Math.max(maxX, cssPoint.x);
          maxY = Math.max(maxY, cssPoint.y);
        });
        baseBounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
        console.log(`  📏 Freehand bounds calculated from ${annotation.drawingData.points.length} points:`, baseBounds);
      } else if (annotation.drawingData.path) {
        // Parse SVG path per estrarre bounds (supporta M, L, Q commands)
        const pathString = annotation.drawingData.path;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // Match M/L commands (x y)
        const mlRegex = /([ML])\s*([0-9.-]+)\s*([0-9.-]+)/g;
        let match;
        while ((match = mlRegex.exec(pathString)) !== null) {
          const x = parseFloat(match[2]);
          const y = parseFloat(match[3]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        
        // Match Q commands (control point + end point)
        const qRegex = /Q\s*([0-9.-]+)\s*([0-9.-]+)\s*([0-9.-]+)\s*([0-9.-]+)/g;
        while ((match = qRegex.exec(pathString)) !== null) {
          const cx = parseFloat(match[1]);
          const cy = parseFloat(match[2]);
          const x = parseFloat(match[3]);
          const y = parseFloat(match[4]);
          minX = Math.min(minX, cx, x);
          minY = Math.min(minY, cy, y);
          maxX = Math.max(maxX, cx, x);
          maxY = Math.max(maxY, cy, y);
        }
        
        // Path è già in coordinate CSS del canvas
        baseBounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
        console.log(`  📏 Freehand bounds calculated from path:`, baseBounds);
      } else {
        // Fallback: usa position
        const cssPos = convertNativeToCSS(annotation.position.x, annotation.position.y);
        baseBounds = {
          x: cssPos.x - 25,
          y: cssPos.y - 25,
          width: 50,
          height: 50
        };
        console.log(`  📏 Freehand fallback bounds from position:`, baseBounds);
      }
    } else if (annotation.drawingData.bounds) {
      const normalizedBounds = annotation.drawingData.bounds;
      // Convert normalized (0..1) to CSS pixels using provided canvasRect size
      const containerWidth = canvasRect?.width || 1;
      const containerHeight = canvasRect?.height || 1;

      baseBounds = {
        x: normalizedBounds.x * containerWidth,
        y: normalizedBounds.y * containerHeight,
        width: normalizedBounds.width * containerWidth,
        height: normalizedBounds.height * containerHeight
      };
      console.log(`  📏 Bounds converted from normalized to CSS:`, {
        normalized: normalizedBounds,
        css: baseBounds,
        containerSize: { width: containerWidth, height: containerHeight }
      });
    } else {
      const cssPos = convertNativeToCSS(annotation.position.x, annotation.position.y);
      baseBounds = {
        x: cssPos.x - 25,
        y: cssPos.y - 25,
        width: 50,
        height: 50
      };
      console.log(`  📏 Default bounds from position:`, { position: annotation.position, cssPos, baseBounds });
    }

    // Apply optimistic updates
    const optimisticUpdate = optimisticUpdates.get(annotation._id);
    if (optimisticUpdate) {
      console.log(`  📏 Applying optimistic update:`, optimisticUpdate);
      if (optimisticUpdate.type === 'move' && optimisticUpdate.deltaX !== undefined && optimisticUpdate.deltaY !== undefined) {
        const beforeMove = { ...baseBounds };
        baseBounds.x += optimisticUpdate.deltaX;
        baseBounds.y += optimisticUpdate.deltaY;
        console.log(`    📏 Move applied:`, { before: beforeMove, after: baseBounds, delta: { x: optimisticUpdate.deltaX, y: optimisticUpdate.deltaY } });
      } else if (optimisticUpdate.type === 'resize' && optimisticUpdate.bounds) {
        const beforeResize = { ...baseBounds };
        baseBounds = optimisticUpdate.bounds;
        console.log(`    📏 Resize applied:`, { before: beforeResize, after: baseBounds });
      }
    }

    // No complex local offsets - use direct position updates like board

    console.log(`  📏 Final bounds for ${annotation._id}:`, baseBounds);
    return baseBounds;
  }, [convertNativeToCSS, optimisticUpdates]);

  // Calculate bounding box for selected annotations and comments
  const getSelectionBounds = useCallback(() => {
    const selectedAnnotations = annotations.filter(a => selectedAnnotationIds.includes(a._id));
    const selectedComments = comments.filter(c => selectedCommentIds.includes(c._id));
    
    if (selectedAnnotations.length === 0 && selectedComments.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedAnnotations.forEach(annotation => {
      const bounds = getAnnotationBounds(annotation);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });

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
  }, [annotations, comments, selectedAnnotationIds, selectedCommentIds, getAnnotationBounds, getCommentBounds]);

  // Convert ResizeHandle to Side enum for board compatibility (using external function)
  const convertResizeHandleToSide = resizeHandleToSide;

  // Use board's resizeBounds function with absolute coordinates
  const calculateResizeBounds = useCallback((initialBounds: XYWH, handle: ResizeHandle, currentPoint: Point) => {
    console.log("📐 CalculateResizeBounds INPUT:", {
      initialBounds,
      handle,
      currentPoint,
      handleDescription: `${handle} (${convertResizeHandleToSide(handle)})`
    });

    const side = convertResizeHandleToSide(handle);
    const newBounds = resizeBounds(initialBounds, side, currentPoint);
    
    // Ensure minimum size
    newBounds.width = Math.max(10, newBounds.width);
    newBounds.height = Math.max(10, newBounds.height);

    console.log("📐 CalculateResizeBounds OUTPUT:", {
      side,
      newBounds,
      deltaFromOriginal: {
        x: newBounds.x - initialBounds.x,
        y: newBounds.y - initialBounds.y,
        width: newBounds.width - initialBounds.width,
        height: newBounds.height - initialBounds.height
      },
      scaleFactors: {
        x: newBounds.width / initialBounds.width,
        y: newBounds.height / initialBounds.height
      }
    });

    return newBounds;
  }, [convertResizeHandleToSide]);

  // Funzione per pulire le trasformazioni CSS
  const clearVisualTransforms = useCallback(() => {
    console.log('🧹 Clearing visual transforms...');
    
    // Rimuovi trasformazioni CSS SOLO dagli elementi selezionati
    selectedAnnotationIds.forEach(annotationId => {
      const specificSelectors = [
        // SVG nel video player overlay
        `svg g[data-annotation-id="${annotationId}"]`,
        `svg[style*="z-index: 5"] g[data-annotation-id="${annotationId}"]`,
        // Layer tradizionali
        `g[data-annotation-id="${annotationId}"]`,
        `[data-annotation-id="${annotationId}"]`,
        `g[id="${annotationId}"]`,
        `[id="${annotationId}"]`
      ];
      
      for (const selector of specificSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const isSVGElement = element.tagName === 'g' || element.tagName === 'svg';
          
          if (isSVGElement) {
            // Pulisci SVG transform
            const svgElement = element as SVGElement;
            if (svgElement.dataset.originalSvgTransform) {
              svgElement.setAttribute('transform', svgElement.dataset.originalSvgTransform);
              delete svgElement.dataset.originalSvgTransform;
            } else {
              svgElement.removeAttribute('transform');
            }
            console.log(`✅ Cleared SVG transform from ${annotationId}`);
          } else {
            // Ripristina le proprietà CSS originali
            const htmlElement = element as HTMLElement;
            if (htmlElement.dataset.originalStyle) {
              const originalStyle = JSON.parse(htmlElement.dataset.originalStyle);
              htmlElement.style.left = originalStyle.left || '';
              htmlElement.style.top = originalStyle.top || '';
              htmlElement.style.width = originalStyle.width || '';
              htmlElement.style.height = originalStyle.height || '';
              htmlElement.style.transform = originalStyle.transform || '';
              delete htmlElement.dataset.originalStyle;
            } else {
              // Fallback: pulisci solo le trasformazioni
              htmlElement.style.transform = '';
            }
            
            console.log(`✅ Cleared CSS properties from ${annotationId}`);
          }
        }
      }
    });
    
    // Comment bubbles now use optimistic bounds automatically, no CSS transforms to clear
    console.log(`✅ Comments position cleared via optimistic bounds automatically`);
    
    // Rimuovi trasformazioni CSS dal layer se applicato
    const annotationLayer = document.querySelector('.absolute.inset-0.pointer-events-none');
    if (annotationLayer) {
      const htmlLayer = annotationLayer as HTMLElement;
      // Ripristina la trasformazione originale se salvata
      if (htmlLayer.dataset.originalTransform) {
        htmlLayer.style.transform = htmlLayer.dataset.originalTransform;
        delete htmlLayer.dataset.originalTransform;
      }
      console.log(`✅ Cleared CSS transform from annotation layer`);
    }
    
    console.log('✅ Visual transforms cleared');
  }, [selectedAnnotationIds, selectedCommentIds]);

  // Debounced save function - saves position after 10ms of inactivity
  const debouncedSave = useCallback(async (finalDelta: { x: number; y: number }) => {
    console.log("💾 Debounced save triggered:", finalDelta);
    
    // Convert CSS delta to normalized delta
    const containerRect = selectorRef.current?.getBoundingClientRect();
    const containerWidth = containerRect?.width || canvasRect?.width || 800;
    const containerHeight = containerRect?.height || canvasRect?.height || 600;
    
    const normalizedDeltaX = finalDelta.x / containerWidth;
    const normalizedDeltaY = finalDelta.y / containerHeight;
    
    try {
      // Call APIs to save final position
      if (selectedAnnotationIds.length > 0) {
        await onAnnotationMove(selectedAnnotationIds, normalizedDeltaX, normalizedDeltaY);
      }
      if (selectedCommentIds.length > 0 && onCommentMove) {
        await onCommentMove(selectedCommentIds, normalizedDeltaX, normalizedDeltaY);
      }
      
      console.log("✅ Position saved successfully");
      
      // Clear local offsets after successful save
      setLocalOffsets(prev => {
        const newOffsets = { ...prev };
        selectedAnnotationIds.forEach(id => delete newOffsets[id]);
        selectedCommentIds.forEach(id => delete newOffsets[id]);
        return newOffsets;
      });
      
    } catch (error) {
      console.error("❌ Failed to save position:", error);
    }
  }, [selectedAnnotationIds, selectedCommentIds, onAnnotationMove, onCommentMove, canvasRect]);

  // Optimized visual update function using optimistic state
  const updateVisualPreview = useCallback(() => {
    console.log("🎯 ========== UpdateVisualPreview START ==========");
    console.log("🎯 UpdateVisualPreview called:", { 
      mode: dragState.mode, 
      selectedIds: selectedAnnotationIds,
      dragState: {
        isDragging: dragState.isDragging,
        resizeHandle: dragState.resizeHandle,
        initialBounds: dragState.initialBounds
      },
      delta: currentDelta.current,
      previewBounds: currentPreviewBounds.current
    });

    if (dragState.mode === 'move') {
      // Update optimistic state for all selected annotations AND comments
      const newOptimisticUpdates = new Map(optimisticUpdates);
      
      selectedAnnotationIds.forEach(annotationId => {
        newOptimisticUpdates.set(annotationId, {
          annotationId,
          type: 'move',
          deltaX: currentDelta.current.x,
          deltaY: currentDelta.current.y,
          timestamp: Date.now()
        });
      });
      
      // Also update optimistic state for comments
      selectedCommentIds.forEach(commentId => {
        newOptimisticUpdates.set(commentId, {
          annotationId: commentId,
          type: 'move',
          deltaX: currentDelta.current.x,
          deltaY: currentDelta.current.y,
          timestamp: Date.now()
        });
      });
      
      setOptimisticUpdates(newOptimisticUpdates);

          // NUOVO APPROCCIO: Applica trasformazione CSS al container invece che SVG transform
    selectedAnnotationIds.forEach(annotationId => {
      // Cerca l'elemento SVG specifico per questa annotazione
      const specificSelectors = [
        // SVG nel video player overlay
        `svg g[data-annotation-id="${annotationId}"]`,
        `svg[style*="z-index: 5"] g[data-annotation-id="${annotationId}"]`,
        // Layer tradizionali
        `g[data-annotation-id="${annotationId}"]`,
        `[data-annotation-id="${annotationId}"]`,
        `g[id="${annotationId}"]`,
        `[id="${annotationId}"]`
      ];
      
      let targetElement = null;
      for (const selector of specificSelectors) {
        targetElement = document.querySelector(selector);
        if (targetElement) {
          console.log(`🎯 Found target element for ${annotationId} with selector: ${selector}`, targetElement);
          break;
        }
      }
      
      if (targetElement) {
        // Verifica se è un elemento SVG
        const isSVGElement = targetElement.tagName === 'g' || targetElement.tagName === 'svg';
        
        if (isSVGElement) {
          // Per elementi SVG, usa SVG transform
          const svgTransform = `translate(${currentDelta.current.x}, ${currentDelta.current.y})`;
          const svgElement = targetElement as SVGElement;
          
          // Salva il transform originale SVG
          if (!svgElement.dataset.originalSvgTransform) {
            svgElement.dataset.originalSvgTransform = svgElement.getAttribute('transform') || '';
          }
          
          svgElement.setAttribute('transform', svgTransform);
          console.log(`✅ Applied SVG transform to ${annotationId}:`, svgTransform);
        } else {
          // Per elementi HTML, usa CSS transform
          const deltaTransform = `translate(${currentDelta.current.x}px, ${currentDelta.current.y}px)`;
          const htmlElement = targetElement as HTMLElement;
          
          // Salva la trasformazione originale se esiste
          if (!htmlElement.dataset.originalTransform) {
            htmlElement.dataset.originalTransform = htmlElement.style.transform || '';
          }
          
          // Applica la nuova trasformazione CSS
          htmlElement.style.transform = deltaTransform;
          console.log(`✅ Applied CSS transform to ${annotationId}:`, deltaTransform);
        }
      } else {
        console.log(`❌ Could not find specific element for annotation ${annotationId}`);
        
        // Fallback: Applica trasformazione CSS al container SVG layer
        const annotationLayer = document.querySelector('.absolute.inset-0.pointer-events-none');
        if (annotationLayer) {
          const deltaTransform = `translate(${currentDelta.current.x}px, ${currentDelta.current.y}px)`;
          const htmlLayer = annotationLayer as HTMLElement;
          
          // Salva la trasformazione originale se esiste
          if (!htmlLayer.dataset.originalTransform) {
            htmlLayer.dataset.originalTransform = htmlLayer.style.transform || '';
          }
          
          // Combina con la trasformazione esistente (zoom/pan)
          const currentStyle = htmlLayer.style.transform || '';
          const newTransform = `${deltaTransform} ${currentStyle}`;
          
          htmlLayer.style.transform = newTransform;
          console.log(`✅ Applied CSS transform to annotation layer:`, newTransform);
        }
      }
    });

    // Comment bubbles now use optimistic bounds automatically via getCommentBounds
    console.log(`✅ Comments will update position via optimistic bounds automatically`);


    } else if (dragState.mode === 'resize' && currentPreviewBounds.current && selectedAnnotationIds.length === 1) {
      // Update optimistic state for resize
      const newOptimisticUpdates = new Map(optimisticUpdates);
      
      newOptimisticUpdates.set(selectedAnnotationIds[0], {
        annotationId: selectedAnnotationIds[0],
        type: 'resize',
        bounds: currentPreviewBounds.current,
        timestamp: Date.now()
      });
      
      setOptimisticUpdates(newOptimisticUpdates);

      // 🎯 SOLUZIONE BOARD-STYLE: Non manipolare SVG durante il drag
      // PROBLEMA: Stavo manipolando gli attributi SVG invece di aggiornare annotation.drawingData.bounds
      // SOLUZIONE: Come le board - solo preview durante drag, poi API update al mouse up
      
      console.log(`🎯 BOARD STYLE RESIZE (NO SVG MANIPULATION):
        Original Bounds: x=${dragState.initialBounds.x.toFixed(1)}, y=${dragState.initialBounds.y.toFixed(1)}, w=${dragState.initialBounds.width.toFixed(1)}, h=${dragState.initialBounds.height.toFixed(1)}
        Preview Bounds: x=${currentPreviewBounds.current.x.toFixed(1)}, y=${currentPreviewBounds.current.y.toFixed(1)}, w=${currentPreviewBounds.current.width.toFixed(1)}, h=${currentPreviewBounds.current.height.toFixed(1)}
        Handle: ${dragState.resizeHandle}
        Strategy: Update data at mouse up, let React re-render (like boards)`);
      
      // 🎯 NESSUNA MANIPOLAZIONE SVG DURANTE IL DRAG
      // - Preview bounds mostrati dal riquadro di selezione 
      // - SVG elements rimangono inalterati durante il drag
      // - API call al mouse up aggiorna annotation.drawingData.bounds
      // - ReviewAnnotationLayer si ri-renderizza automaticamente


    }
    
    console.log("🎯 ========== UpdateVisualPreview END ==========");
  }, [dragState.mode, dragState.initialBounds, selectedAnnotationIds, optimisticUpdates]);

  // Clean up old optimistic updates
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const newOptimisticUpdates = new Map(optimisticUpdates);
      let hasChanges = false;
      
      for (const [id, update] of newOptimisticUpdates) {
        // Remove updates older than 5 seconds
        if (now - update.timestamp > 5000) {
          newOptimisticUpdates.delete(id);
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        setOptimisticUpdates(newOptimisticUpdates);
      }
    };
    
    const interval = setInterval(cleanup, 1000);
    return () => clearInterval(interval);
  }, [optimisticUpdates]);

  // Handle keyboard events
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

  // Handle click on annotation to select it
  const handleAnnotationClick = useCallback((e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation();
    
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      // Multi-selection mode
      if (selectedAnnotationIds.includes(annotationId)) {
        onAnnotationSelect(selectedAnnotationIds.filter(id => id !== annotationId));
      } else {
        onAnnotationSelect([...selectedAnnotationIds, annotationId]);
      }
    } else {
      // Single selection - clear comments too
      onAnnotationSelect([annotationId]);
      onCommentSelect?.([]);
    }
  }, [selectedAnnotationIds, onAnnotationSelect, onCommentSelect]);

  const handleCommentClick = useCallback((e: React.MouseEvent, commentId: string) => {
    e.stopPropagation();
    
    // Find the comment object
    const comment = comments.find(c => c._id === commentId);
    if (!comment) return;
    
    // LOGICA SEMPLICE: I commenti aprono SEMPRE il popup quando cliccati
    // La selezione avviene solo tramite area selection
    if (onCommentClick) {
      onCommentClick(comment, { x: e.clientX, y: e.clientY });
      return;
    }
    
    // Fallback - if no onCommentClick handler, don't select comments on direct click
    console.log('No onCommentClick handler - ignoring direct click on comment');
  }, [comments, onCommentClick]);

  // Handle area selection start
  const handleAreaSelectionStart = useCallback((e: React.MouseEvent) => {
    // Controlla se il click è su un comment bubble
    const clickedElement = e.target as HTMLElement;
    const isCommentBubble = clickedElement?.closest('.comment-bubble') || 
                           clickedElement?.closest('[class*="comment-bubble"]') ||
                           clickedElement?.closest('[data-comment-id]');
    
    // Se è un comment bubble, non iniziare l'area selection
    if (isCommentBubble) {
      console.log('🚫 Area selection blocked: click on comment bubble');
      return;
    }

    // Controlla se il click è su un elemento interattivo
    const interactiveSelectors = [
      'button',               // Tutti i bottoni
      'input',                // Input fields
      'select',               // Dropdown
      'textarea',             // Text areas
      'a',                    // Links
      '[role="button"]',      // Elementi con role button
      '[tabindex]',           // Elementi focusabili
      '.cursor-pointer',      // Elementi con cursor pointer
      '.cursor-grab',         // Elementi grab
      '.cursor-grabbing',     // Elementi grabbing
      'video',                // Video player
      'audio',                // Audio player
      'canvas',               // Canvas element
      'svg',                  // Icone nei bottoni (Play, Pause, etc.)
      '.lucide',             // Icone Lucide React
      '.w-4.h-4',           // Icone di dimensione standard
      '.font-mono',         // Contatore frame
      '.text-lg',           // Testo grande (contatore)
      '.flex.items-center', // Container dei controlli
    ];
    
    // Controlla se il click è su un elemento interattivo
    const isOnInteractiveElement = interactiveSelectors.some(selector => {
      return clickedElement?.closest(selector) !== null;
    });
    
    
    // Controlla se il click è nella zona dei controlli video (bottom area)
    const rect = selectorRef.current?.getBoundingClientRect();
    if (rect) {
      const clickY = e.clientY;
      const containerBottom = rect.bottom;
      const controlsHeight = 160; // Altezza approssimativa dei controlli video (aumentata)
      
      const isInControlsArea = clickY > (containerBottom - controlsHeight);
      
      // Detection aggiuntiva: controlla se il click è su un bottone o elemento interattivo
      const nearestButton = clickedElement?.closest('button');
      const nearestTimeline = clickedElement?.closest('.h-6.rounded-full');
      const nearestScrubber = clickedElement?.closest('.cursor-grab, .cursor-grabbing');
      const nearestIcon = clickedElement?.closest('svg, .lucide');
      
      if (isOnInteractiveElement || isInControlsArea || nearestButton || nearestTimeline || nearestScrubber || nearestIcon) {
        console.log('🚫 Area selection blocked: click on video controls');
        return; // Non iniziare l'area selection
      }
    }

    if (!rect) return;

    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setAreaSelection({
      isSelecting: true,
      startX,
      startY,
      currentX: startX,
      currentY: startY
    });

    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle area selection move
  const handleAreaSelectionMove = useCallback((e: MouseEvent) => {
    if (!areaSelection.isSelecting) return;

    const rect = selectorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setAreaSelection(prev => ({
      ...prev,
      currentX,
      currentY
    }));
  }, [areaSelection.isSelecting]);

  // Handle area selection end
  const handleAreaSelectionEnd = useCallback((e: MouseEvent) => {
    if (!areaSelection.isSelecting) return;

    const selectionRect = {
      x: Math.min(areaSelection.startX, areaSelection.currentX),
      y: Math.min(areaSelection.startY, areaSelection.currentY),
      width: Math.abs(areaSelection.currentX - areaSelection.startX),
      height: Math.abs(areaSelection.currentY - areaSelection.startY)
    };

    const newSelectedAnnotationIds: string[] = [];
    const newSelectedCommentIds: string[] = [];
    
    // Check annotations
    annotations.forEach(annotation => {
      const bounds = getAnnotationBounds(annotation);
      
      const annotationRect = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };

      // Check intersection
      const intersects = !(
        annotationRect.x > selectionRect.x + selectionRect.width ||
        annotationRect.x + annotationRect.width < selectionRect.x ||
        annotationRect.y > selectionRect.y + selectionRect.height ||
        annotationRect.y + annotationRect.height < selectionRect.y
      );

      if (intersects) {
        newSelectedAnnotationIds.push(annotation._id);
      }
    });

    // Check comments
    comments.forEach(comment => {
      const bounds = getCommentBounds(comment);
      
      const commentRect = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };

      // Check intersection
      const intersects = !(
        commentRect.x > selectionRect.x + selectionRect.width ||
        commentRect.x + commentRect.width < selectionRect.x ||
        commentRect.y > selectionRect.y + selectionRect.height ||
        commentRect.y + commentRect.height < selectionRect.y
      );

      if (intersects) {
        newSelectedCommentIds.push(comment._id);
      }
    });

    // Update selection
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (ctrlOrCmd || shift) {
      const annotationSelection = [...new Set([...selectedAnnotationIds, ...newSelectedAnnotationIds])];
      const commentSelection = [...new Set([...selectedCommentIds, ...newSelectedCommentIds])];
      onAnnotationSelect(annotationSelection);
      onCommentSelect?.(commentSelection);
    } else {
      onAnnotationSelect(newSelectedAnnotationIds);
      onCommentSelect?.(newSelectedCommentIds);
    }

    setAreaSelection({
      isSelecting: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0
    });
  }, [areaSelection, annotations, comments, selectedAnnotationIds, selectedCommentIds, onAnnotationSelect, onCommentSelect, getAnnotationBounds, getCommentBounds]);

  // Handle move drag start
  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    const bounds = getSelectionBounds();
    if (!bounds) return;

    setDragState({
      isDragging: true,
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      initialBounds: bounds
    });

    currentDelta.current = { x: 0, y: 0 };
    e.preventDefault();
    e.stopPropagation();
  }, [getSelectionBounds]);

  // Handle resize drag start
  const handleResizeStart = useCallback((e: React.PointerEvent, handle: ResizeHandle) => {
    const bounds = getSelectionBounds();
    if (!bounds || selectedAnnotationIds.length !== 1) return;

    e.preventDefault();
    e.stopPropagation();
    
    // CRITICAL: Capture pointer to continue tracking even when mouse leaves element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const containerRect = selectorRef.current?.getBoundingClientRect();
    const startPoint = containerRect ? {
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top
    } : { x: e.clientX, y: e.clientY };

    console.log("🎯 RESIZE START:", {
      handle,
      handleDescription: `${handle}`,
      selectedAnnotation: selectedAnnotationIds[0],
      selectionBounds: bounds,
      mouseStart: {
        clientX: e.clientX,
        clientY: e.clientY,
        containerRelative: startPoint
      },
      containerRect: containerRect ? {
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height
      } : null,
      pointerCaptured: true
    });

    setDragState({
      isDragging: true,
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      initialBounds: bounds,
      resizeHandle: handle
    });

    currentPreviewBounds.current = bounds;
  }, [getSelectionBounds, selectedAnnotationIds]);

  // Optimized drag move with RAF and immediate visual feedback
  const handleDragMove = useCallback((e: MouseEvent) => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState.isDragging || updateInProgress.current) return;

    const deltaX = e.clientX - currentDragState.startX;
    const deltaY = e.clientY - currentDragState.startY;

    console.log("🖱️ HandleDragMove:", { deltaX, deltaY, mode: currentDragState.mode });

    if (currentDragState.mode === 'move') {
      currentDelta.current = { x: deltaX, y: deltaY };
    } else if (currentDragState.mode === 'resize' && currentDragState.resizeHandle) {
      // Convert mouse coordinates to container coordinates
      const containerRect = selectorRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      
      const currentPoint: Point = { 
        x: e.clientX - containerRect.left, 
        y: e.clientY - containerRect.top 
      };
      
      console.log("🖱️ Mouse coordinates:", {
        clientX: e.clientX,
        clientY: e.clientY,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
        currentPoint,
        initialBounds: currentDragState.initialBounds
      });
      
      currentPreviewBounds.current = calculateResizeBounds(currentDragState.initialBounds, currentDragState.resizeHandle, currentPoint);
    }

    // Local movement for immediate visual feedback (no API calls during drag)
    if (currentDragState.mode === 'move') {
      // Update local offsets for immediate visual feedback
      const newOffsets: Record<string, { x: number; y: number }> = {};
      selectedAnnotationIds.forEach(id => {
        newOffsets[id] = { x: deltaX, y: deltaY };
      });
      selectedCommentIds.forEach(id => {
        newOffsets[id] = { x: deltaX, y: deltaY };
      });
      
      setLocalOffsets(newOffsets);
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Set new timeout to save after 10ms of inactivity
      saveTimeoutRef.current = setTimeout(() => {
        debouncedSave({ x: deltaX, y: deltaY });
      }, 10);
      
      console.log("🏃‍♂️ Local movement applied:", { deltaX, deltaY, selectedIds: selectedAnnotationIds });
    }
  }, [calculateResizeBounds, selectedAnnotationIds, selectedCommentIds, debouncedSave]);

  // Handle drag end with optimistic state persistence
  const handleDragEnd = useCallback(async (e: MouseEvent | PointerEvent) => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState.isDragging) return;

    console.log("🏁 HandleDragEnd called");
    
    // Release pointer capture if this is a PointerEvent
    if ('pointerId' in e && e.target instanceof HTMLElement) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore if already released
      }
    }

    // Cancel any pending RAF
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    updateInProgress.current = true;

    const deltaX = e.clientX - currentDragState.startX;
    const deltaY = e.clientY - currentDragState.startY;

    try {
      // For move operations, ensure final save happens and clear timeout
      if (currentDragState.mode === 'move') {
        // Clear any pending timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        
        // Trigger immediate final save if there's movement
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          await debouncedSave({ x: deltaX, y: deltaY });
        }
      }
      
      // Handle resize operations
      if (currentDragState.mode === 'resize' && onAnnotationResize && selectedAnnotationIds.length === 1 && currentPreviewBounds.current) {
        const newBounds = currentPreviewBounds.current;
        const annotationId = selectedAnnotationIds[0];

        // Convert CSS bounds to normalized bounds (0-1)
        const containerRect = selectorRef.current?.getBoundingClientRect();
        const containerWidth = containerRect?.width || canvasRect?.width || 800;
        const containerHeight = containerRect?.height || canvasRect?.height || 600;
        
        const normalizedBounds = {
          x: newBounds.x / containerWidth,
          y: newBounds.y / containerHeight,
          width: newBounds.width / containerWidth,
          height: newBounds.height / containerHeight
        };
        
        console.log("📡 Calling API for resize:", normalizedBounds);
        
        // Mark annotation as pending update
        pendingUpdates.current.add(annotationId);
        
        // Call the API but keep optimistic state
        await onAnnotationResize(annotationId, normalizedBounds);
        
        // Clear pending updates after successful API call
        pendingUpdates.current.delete(annotationId);
        
        // Clear optimistic updates for this annotation
        const newOptimisticUpdates = new Map(optimisticUpdates);
        newOptimisticUpdates.delete(annotationId);
        setOptimisticUpdates(newOptimisticUpdates);
      }
    } catch (error) {
      console.error('Error updating annotation or comment:', error);
      // In case of error, clear optimistic updates to show original state
      const newOptimisticUpdates = new Map(optimisticUpdates);
      selectedAnnotationIds.forEach(id => {
        newOptimisticUpdates.delete(id);
        pendingUpdates.current.delete(id);
      });
      selectedCommentIds.forEach(id => {
        newOptimisticUpdates.delete(id);
        pendingUpdates.current.delete(id);
      });
      setOptimisticUpdates(newOptimisticUpdates);
    } finally {
      updateInProgress.current = false;
    }

    // No need to clear visual transforms since we use direct API calls



    // Reset drag state
    currentDelta.current = { x: 0, y: 0 };
    currentPreviewBounds.current = null;

    setDragState({
      isDragging: false,
      mode: 'none',
      startX: 0,
      startY: 0,
      initialBounds: { x: 0, y: 0, width: 0, height: 0 }
    });

    console.log("✅ Drag end completed");
  }, [selectedAnnotationIds, selectedCommentIds, onAnnotationResize, optimisticUpdates, debouncedSave]);

  // Set up global pointer/mouse/touch events so drag/resize continues outside bounds
  useEffect(() => {
    if (!dragState.isDragging) return;
    
    const onMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (e instanceof TouchEvent) {
        const t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        handleDragMove(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }) as any);
      } else {
        handleDragMove(e as MouseEvent);
      }
    };
    
    const onUp = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (e instanceof TouchEvent) {
        const t = e.changedTouches[0] || e.touches[0];
        if (!t) return;
        handleDragEnd(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY }) as any);
      } else {
        handleDragEnd(e as MouseEvent | PointerEvent);
      }
    };

    // Use pointer events as primary (better for touch/pen/mouse)
    document.addEventListener('pointermove', onMove as any, { passive: false });
    document.addEventListener('pointerup', onUp as any, { passive: true });
    document.addEventListener('pointercancel', onUp as any, { passive: true });
    
    // Fallback to mouse events for older browsers
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp, { passive: true });
    
    return () => {
      document.removeEventListener('pointermove', onMove as any);
      document.removeEventListener('pointerup', onUp as any);
      document.removeEventListener('pointercancel', onUp as any);
      document.removeEventListener('mousemove', onMove as any);
      document.removeEventListener('mouseup', onUp as any);
      document.removeEventListener('touchmove', onMove as any);
      document.removeEventListener('touchend', onUp as any);
    };
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (areaSelection.isSelecting) {
      document.addEventListener('mousemove', handleAreaSelectionMove);
      document.addEventListener('mouseup', handleAreaSelectionEnd);
      return () => {
        document.removeEventListener('mousemove', handleAreaSelectionMove);
        document.removeEventListener('mouseup', handleAreaSelectionEnd);
      };
    }
  }, [areaSelection.isSelecting, handleAreaSelectionMove, handleAreaSelectionEnd]);

  // Cleanup RAF and timeout on unmount
  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const selectionBounds = getSelectionBounds();
  const handleSize = getHandleSize();

  return (
    <div 
      ref={selectorRef}
      className="absolute"
      style={{ 
        zIndex: 15,
        // Anchor to the actual rendered canvas rect relative to parent
        top: (() => { const p = selectorRef.current?.parentElement?.getBoundingClientRect(); return canvasRect && p ? canvasRect.top - p.top : 0; })(),
        left: (() => { const p = selectorRef.current?.parentElement?.getBoundingClientRect(); return canvasRect && p ? canvasRect.left - p.left : 0; })(),
        width: canvasRect?.width || '100%',
        height: canvasRect?.height || '100%'
      }}
      onMouseDown={(e) => {
        // Check if the target is the selector itself (for area selection)
        if (e.target === selectorRef.current) {
          handleAreaSelectionStart(e);
        }
        // If not, let the event bubble normally to annotation overlays
      }}
    >
      {/* Invisible clickable overlays for each annotation - NO VISIBLE BORDER */}
      {annotations.map((annotation) => {
        const bounds = getAnnotationBounds(annotation);
        const isSelected = selectedAnnotationIds.includes(annotation._id);
        const isPending = pendingUpdates.current.has(annotation._id);

        return (
          <div
            key={annotation._id}
            data-annotation-id={annotation._id}
            className={`absolute pointer-events-auto cursor-pointer ${
              isSelected 
                ? 'bg-blue-500/5' // Molto sottile per oggetti selezionati
                : 'hover:bg-blue-300/5' // Sottilissimo hover
            } ${isPending ? 'opacity-80' : ''}`}
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }}
            onClick={(e) => handleAnnotationClick(e, annotation._id)}
            title={`${annotation.type} annotation - Click to select`}
          />
        );
      })}

      {/* Comment selection overlays - solo per mostrare la selezione ad area */}
      {comments.map((comment) => {
        const bounds = getCommentBounds(comment);
        const isSelected = selectedCommentIds.includes(comment._id);
        
        // Solo mostra overlay se il commento è selezionato (via area selection)
        if (!isSelected) return null;
        
        return (
          <div
            key={comment._id}
            data-comment-id={comment._id}
            className="absolute pointer-events-none bg-blue-500/10 border-2 border-blue-500 rounded-full"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }}
            title={`Selected comment by ${comment.createdByName}`}
          />
        );
      })}

      {/* Selection bounding box with transformation handles - ONLY WHEN SELECTED */}
      {selectionBounds && (selectedAnnotationIds.length > 0 || selectedCommentIds.length > 0) && (
        <div
          ref={selectionBoxRef}
          className={`absolute border-2 border-blue-500 pointer-events-none ${
            dragState.isDragging ? 'bg-blue-500/15' : 'bg-blue-500/5'
          }`}
          style={{
            left: selectionBounds.x,
            top: selectionBounds.y,
            width: selectionBounds.width,
            height: selectionBounds.height,
          }}
        >
          {/* Move handle - center area */}
          <div
            className="absolute inset-2 cursor-move pointer-events-auto"
            onMouseDown={handleMoveStart}
            title="Drag to move"
          />



          {/* Resize handles - Only show for single selection */}
          {selectedAnnotationIds.length === 1 && (
            <>
              {/* Corner handles */}
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  left: -handleSize/2,
                  top: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  cursor: ResizeHandle.TopLeft
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.TopLeft)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  right: -handleSize/2,
                  top: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  cursor: ResizeHandle.TopRight
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.TopRight)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  right: -handleSize/2,
                  bottom: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  cursor: ResizeHandle.BottomRight
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.BottomRight)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  left: -handleSize/2,
                  bottom: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  cursor: ResizeHandle.BottomLeft
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.BottomLeft)}
                title="Resize"
              />

              {/* Side handles */}
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  left: '50%',
                  top: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  transform: 'translateX(-50%)',
                  cursor: ResizeHandle.Top
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.Top)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  right: -handleSize/2,
                  top: '50%',
                  width: handleSize,
                  height: handleSize,
                  transform: 'translateY(-50%)',
                  cursor: ResizeHandle.Right
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.Right)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  left: '50%',
                  bottom: -handleSize/2,
                  width: handleSize,
                  height: handleSize,
                  transform: 'translateX(-50%)',
                  cursor: ResizeHandle.Bottom
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.Bottom)}
                title="Resize"
              />
              <div 
                className="absolute bg-white border-2 border-blue-500 rounded-sm pointer-events-auto hover:bg-blue-50"
                style={{
                  left: -handleSize/2,
                  top: '50%',
                  width: handleSize,
                  height: handleSize,
                  transform: 'translateY(-50%)',
                  cursor: ResizeHandle.Left
                }}
                onPointerDown={(e) => handleResizeStart(e, ResizeHandle.Left)}
                title="Resize"
              />
            </>
          )}


        </div>
      )}

      {/* Area Selection Box */}
      {areaSelection.isSelecting && (
        <div
          className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
          style={{
            left: Math.min(areaSelection.startX, areaSelection.currentX),
            top: Math.min(areaSelection.startY, areaSelection.currentY),
            width: Math.abs(areaSelection.currentX - areaSelection.startX),
            height: Math.abs(areaSelection.currentY - areaSelection.startY),
          }}
        />
      )}

    </div>
  );
} 