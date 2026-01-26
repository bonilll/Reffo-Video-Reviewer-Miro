"use client";

import { memo, useRef, useState, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReviewAnnotation, ReviewCanvasState, ReviewComment } from "@/types/canvas";
import { CommentBubble } from "./CommentBubble";
import { CreateCommentInput } from "./CreateCommentInput";

interface ReviewAnnotationLayerProps {
  annotations: ReviewAnnotation[];
  comments?: ReviewComment[];
  tempBubble?: {
    id: string;
    position: { x: number; y: number };
    showInput: boolean;
    showDropdown: boolean;
  } | null;
  canvasState: ReviewCanvasState;
  currentPath?: string;
  currentShape?: any;
  onCommentClick?: (comment: ReviewComment, position: { x: number; y: number }) => void;
  onTempBubbleUpdate?: (bubble: any) => void;
  sessionId?: string;
  displayFrame?: number;
  fps?: number;
  selectedCommentIds?: string[];
  theme?: 'dark' | 'light';
  openDropdownCommentId?: string; // ID del commento con dropdown aperto
  // New props for anchored popup
  openPopupCommentId?: string;
  onPopupClose?: () => void;
  onCommentUpdate?: () => void;
  assetId?: string;
  // New: save new comments with normalized coordinates [0,1]
  normalizePositions?: boolean;
  // Control whether to apply canvasState transform (used in image canvas). For video overlays set to false
  applyTransform?: boolean;
  // Optional: native canvas pixel size to map to container CSS size
  canvasSize?: { width: number; height: number };
  // Optimistic state for real-time updates
  optimisticPositions?: Map<string, { x: number; y: number }>;
  optimisticBounds?: Map<string, { x: number; y: number; width: number; height: number }>;
}

export const ReviewAnnotationLayer = memo(function ReviewAnnotationLayer({
  annotations,
  comments = [],
  tempBubble,
  canvasState,
  currentPath,
  currentShape,
  onCommentClick,
  onTempBubbleUpdate,
  sessionId,
  displayFrame,
  fps,
  selectedCommentIds = [],
  theme = 'light',
  openDropdownCommentId,
  openPopupCommentId,
  onPopupClose,
  onCommentUpdate,
  assetId,
  normalizePositions = false,
  applyTransform = true,
  canvasSize,
  optimisticPositions = new Map(),
  optimisticBounds = new Map()
}: ReviewAnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Group comments by threadId for reply counting
  const commentThreads = comments.reduce((threads, comment) => {
    // Find the main comment (earliest in the thread)
    const threadComments = comments.filter(c => c.threadId === comment.threadId);
    const mainComment = threadComments.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0];
    
    // Only process if this is the main comment
    if (comment._id === mainComment._id) {
      threads[comment.threadId] = {
        main: comment,
        replies: threadComments.filter(c => 
          c._id !== comment._id && 
          c.createdAt > comment.createdAt
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      };
    }
    return threads;
  }, {} as Record<string, { main: ReviewComment; replies: ReviewComment[] }>);
  
  // Helper function to convert stored coordinates (native px or normalized [0,1]) to CSS coordinates
  const convertToCSS = (storedX: number, storedY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: storedX, y: storedY };
    const isNormalized = storedX >= 0 && storedX <= 1 && storedY >= 0 && storedY <= 1;
    if (isNormalized) {
      return { x: storedX * rect.width, y: storedY * rect.height };
    }
    // Map native canvas px to CSS using canvasSize if provided
    const sx = canvasSize?.width ? rect.width / canvasSize.width : 1;
    const sy = canvasSize?.height ? rect.height / canvasSize.height : 1;
    return { x: storedX * sx, y: storedY * sy };
  };
  
  // Force re-render when container dimensions change
  const [, setForceRender] = useState(0);
  
  useEffect(() => {
    const handleResize = () => {
      // console.log('🔄 ReviewAnnotationLayer: Container resized, forcing re-render');
      setForceRender(prev => prev + 1);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);
  
  // Determine scale relative to native canvas size (if provided) to keep annotations anchored on resize
  const rect = containerRef.current?.getBoundingClientRect();
  const scaleX = rect && canvasSize?.width ? rect.width / canvasSize.width : 1;
  const scaleY = rect && canvasSize?.height ? rect.height / canvasSize.height : 1;

  // Draggable comment state (temporary offsets per commentId)
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [isDragging, setIsDragging] = useState<Record<string, boolean>>({});
  const draggingRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    hasMoved: boolean;
  } | null>(null);
  const updateCommentPosition = useMutation(api.review.updateCommentPosition);

  // Helper function to get annotation bounds with optimistic state applied
  const getAnnotationDisplayBounds = useCallback((annotation: ReviewAnnotation) => {
    // Check if we have optimistic bounds for this annotation (from resize)
    const optimisticBound = optimisticBounds.get(annotation._id);
    if (optimisticBound && rect) {
      // Convert from CSS coordinates to normalized coordinates
      return {
        x: optimisticBound.x / rect.width,
        y: optimisticBound.y / rect.height,
        width: optimisticBound.width / rect.width,
        height: optimisticBound.height / rect.height
      };
    }

    // Check if we have optimistic position for this annotation (from drag)
    const optimisticPos = optimisticPositions.get(annotation._id);
    if (optimisticPos && annotation.drawingData.bounds) {
      return {
        x: optimisticPos.x,
        y: optimisticPos.y,
        width: annotation.drawingData.bounds.width,
        height: annotation.drawingData.bounds.height
      };
    }

    // Use original bounds
    if (annotation.drawingData.bounds) {
      return annotation.drawingData.bounds;
    }

    // Fallback for position-only annotations
    const size = 50 / (rect?.width || 1);
    return {
      x: annotation.position.x - size / 2,
      y: annotation.position.y - size / 2,
      width: size,
      height: size
    };
  }, [optimisticBounds, optimisticPositions, rect]);

  // Helper function to get annotation path with optimistic state applied
  const getAnnotationDisplayPath = useCallback((annotation: ReviewAnnotation) => {
    if (annotation.type !== "freehand" || !annotation.drawingData.path) {
      return annotation.drawingData.path;
    }

    // For freehand annotations, check if we have optimistic position
    const optimisticPos = optimisticPositions.get(annotation._id);
    if (optimisticPos && annotation.position && rect) {
      // Calculate the offset in CSS pixels
      const originalPos = {
        x: annotation.position.x * rect.width,
        y: annotation.position.y * rect.height
      };
      const newPos = {
        x: optimisticPos.x * rect.width,
        y: optimisticPos.y * rect.height
      };
      const offsetX = newPos.x - originalPos.x;
      const offsetY = newPos.y - originalPos.y;

      // Parse and transform the path
      if (offsetX !== 0 || offsetY !== 0) {
        return annotation.drawingData.path.replace(/([ML])\s*([0-9.-]+)\s*([0-9.-]+)/g, (match, command, x, y) => {
          const newX = parseFloat(x) + offsetX;
          const newY = parseFloat(y) + offsetY;
          return `${command} ${newX} ${newY}`;
        });
      }
    }

    return annotation.drawingData.path;
  }, [optimisticPositions, rect]);

  const onPointerDownMarker = useCallback((e: React.PointerEvent, id: string, baseXpx: number, baseYpx: number) => {
    if (e.button !== 0) return; // left click only
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { id, startX: e.clientX, startY: e.clientY, baseX: baseXpx, baseY: baseYpx, hasMoved: false };
    // Reset dragging state
    setIsDragging(prev => ({ ...prev, [id]: false }));
  }, []);

  const onPointerMoveMarker = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current; if (!d || !rect) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    
    // Check if movement exceeds threshold (5px to distinguish from click)
    const DRAG_THRESHOLD = 5;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > DRAG_THRESHOLD && !d.hasMoved) {
      d.hasMoved = true;
      setIsDragging(prev => ({ ...prev, [d.id]: true }));
    }
    
    setDragOffsets(prev => ({ ...prev, [d.id]: { dx, dy } }));
  }, [rect]);

  const onPointerUpMarker = useCallback(async (e: React.PointerEvent) => {
    const d = draggingRef.current; draggingRef.current = null;
    if (!d || !rect) return;
    
    // Only update position if there was actual movement
    if (d.hasMoved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const centerX = d.baseX + dx + 15; // foreignObject x is top-left; +15 to get center
      const centerY = d.baseY + dy + 15;
      const nx = Math.max(0, Math.min(1, centerX / rect.width));
      const ny = Math.max(0, Math.min(1, centerY / rect.height));
      
      try {
        await updateCommentPosition({ commentId: d.id as any, position: { x: nx, y: ny } });
      } catch (error) {
        console.error('Failed to update comment position:', error);
      }
    }
    
    // Clean up drag states
    setDragOffsets(prev => {
      const { [d.id]: _, ...rest } = prev; 
      return rest;
    });
    
    // Reset dragging state - immediate if no movement, delayed if there was movement
    if (!d.hasMoved) {
      // No movement, allow immediate click
      setIsDragging(prev => ({ ...prev, [d.id]: false }));
    } else {
      // There was movement, small delay to prevent accidental click
      setTimeout(() => {
        setIsDragging(prev => ({ ...prev, [d.id]: false }));
      }, 50);
    }
  }, [rect, updateCommentPosition]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0"
      style={{
        transform: applyTransform ? `scale(${canvasState.zoom}) translate(${canvasState.pan.x}px, ${canvasState.pan.y}px)` : undefined,
        pointerEvents: 'none' // Let underlying canvas receive events; bubbles re-enable locally
      }}
    >
      <svg className="w-full h-full" style={{ pointerEvents: 'none' }}>
        {/* Existing Annotations */}
        <g style={{ pointerEvents: 'none' }}>
        {annotations.map((annotation) => {
          if (!annotation.isVisible) return null;

          // Get display bounds with optimistic state applied
          const bounds = getAnnotationDisplayBounds(annotation);

          return (
            <g key={annotation._id} data-annotation-id={annotation._id}>
              {annotation.type === "freehand" && (
                <path
                  d={getAnnotationDisplayPath(annotation)}
                  stroke={annotation.drawingData.style.color}
                  strokeWidth={annotation.drawingData.style.strokeWidth}
                  fill="none"
                  opacity={annotation.drawingData.style.opacity || 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              
              {annotation.type === "rectangle" && bounds && (
                <rect
                  x={bounds.x * (rect?.width || 1)}
                  y={bounds.y * (rect?.height || 1)}
                  width={bounds.width * (rect?.width || 1)}
                  height={bounds.height * (rect?.height || 1)}
                  stroke={annotation.drawingData.style.color}
                  strokeWidth={annotation.drawingData.style.strokeWidth}
                  fill={annotation.drawingData.style.fillColor || "none"}
                  opacity={annotation.drawingData.style.opacity || 1}
                />
              )}
              
              {annotation.type === "circle" && bounds && (
                <ellipse
                  cx={(bounds.x + bounds.width / 2) * (rect?.width || 1)}
                  cy={(bounds.y + bounds.height / 2) * (rect?.height || 1)}
                  rx={(bounds.width / 2) * (rect?.width || 1)}
                  ry={(bounds.height / 2) * (rect?.height || 1)}
                  stroke={annotation.drawingData.style.color}
                  strokeWidth={annotation.drawingData.style.strokeWidth}
                  fill={annotation.drawingData.style.fillColor || "none"}
                  opacity={annotation.drawingData.style.opacity || 1}
                />
              )}

              {annotation.type === "arrow" && bounds && (
                (() => {
                  const w = rect?.width || 1;
                  const h = rect?.height || 1;
                  const x1 = bounds.x * w;
                  const y1 = bounds.y * h;
                  const x2 = (bounds.x + bounds.width) * w;
                  const y2 = (bounds.y + bounds.height) * h;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.max(1, Math.hypot(dx, dy));
                  const ux = dx / len;
                  const uy = dy / len;
                  const headLength = 12 + (annotation.drawingData.style.strokeWidth || 2);
                  const baseX = x2 - ux * headLength;
                  const baseY = y2 - uy * headLength;
                  const perpX = -uy;
                  const perpY = ux;
                  const side = 6 + (annotation.drawingData.style.strokeWidth || 2) * 0.6;
                  const p1x = x2;
                  const p1y = y2;
                  const p2x = baseX + perpX * side;
                  const p2y = baseY + perpY * side;
                  const p3x = baseX - perpX * side;
                  const p3y = baseY - perpY * side;
                  return (
                    <g>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={annotation.drawingData.style.color}
                        strokeWidth={annotation.drawingData.style.strokeWidth}
                        opacity={annotation.drawingData.style.opacity || 1}
                        strokeLinecap="round"
                      />
                      <polygon
                        points={`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`}
                        fill={annotation.drawingData.style.color}
                        opacity={annotation.drawingData.style.opacity || 1}
                      />
                    </g>
                  );
                })()
              )}

            </g>
          );
        })}
        </g>
        
        {/* Comment Bubbles - Positioned absolutely over SVG with pointer events enabled */}
        {Object.values(commentThreads).map(({ main, replies }) => {
          // Convert native canvas coordinates to CSS coordinates for proper positioning
          const cssPosBase = convertToCSS(main.position.x, main.position.y);
          const drag = dragOffsets[main._id] || { dx: 0, dy: 0 };
          const cssPos = { x: cssPosBase.x + drag.dx, y: cssPosBase.y + drag.dy };
          
          return (
            <foreignObject
              key={main._id}
              x={cssPos.x - 15} // Back to original centering since CommentBubble handles expansion
              y={cssPos.y - 15}
              width={30} // Back to original size
              height={30}
              style={{ overflow: 'visible', pointerEvents: 'auto' }}
            onPointerDown={(e)=> { 
              e.preventDefault(); 
              onPointerDownMarker(e, main._id, cssPosBase.x - 15, cssPosBase.y - 15); 
            }}
            onPointerMove={onPointerMoveMarker}
            onPointerUp={onPointerUpMarker}
          >
              <div style={{ 
                pointerEvents: 'auto', 
                zIndex: openPopupCommentId === main._id ? 1 : 0, 
                cursor: draggingRef.current?.id === main._id ? 'grabbing' : 'grab',
                position: 'relative'
              }}>
                <CommentBubble
                  comment={main}
                  replies={replies}
                  onClick={(e: any) => {
                    console.log('🟡 ReviewAnnotationLayer onClick received:', main._id);
                    // Always open popup on click regardless of drag state
                    if (onCommentClick) {
                      onCommentClick(main, { x: 0, y: 0 });
                    }
                  }}
                  isSelected={selectedCommentIds.includes(main._id)}
                  theme={theme}
                  canvasState={canvasState}
                  scale={canvasState.zoom}
                  category="default"
                  isDropdownOpen={openDropdownCommentId === main._id}
                  showPopup={(() => {
                    const shouldShow = openPopupCommentId === main._id;
                    console.log('🎯 showPopup calculation:', {
                      commentId: main._id,
                      openPopupCommentId,
                      shouldShow
                    });
                    return shouldShow;
                  })()}
                  onPopupClose={onPopupClose}
                  onCommentUpdate={onCommentUpdate}
                  sessionId={sessionId}
                  assetId={assetId}
                  isDragging={isDragging[main._id] || false}
                />
              </div>
            </foreignObject>
          );
        })}

        {/* Temporary Bubble for Comment Creation */}
        {tempBubble && (
          <TempBubble
            bubble={tempBubble}
            onUpdate={onTempBubbleUpdate}
            sessionId={sessionId}
            displayFrame={displayFrame}
            fps={fps}
            theme={theme}
            canvasState={canvasState}
            convertToCSS={convertToCSS}
            normalize={normalizePositions}
            canvasSize={canvasSize}
            assetId={assetId}
          />
        )}

        {/* Current Drawing Path */}
        {currentPath && (
          <path
            d={currentPath}
            stroke={canvasState.color}
            strokeWidth={canvasState.strokeWidth}
            fill="none"
            opacity={canvasState.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current Shape Preview */}
        {currentShape && (
          <g>
            {currentShape.type === "rectangle" && (
              <rect
                x={Math.min(currentShape.start.x, currentShape.current.x)}
                y={Math.min(currentShape.start.y, currentShape.current.y)}
                width={Math.abs(currentShape.current.x - currentShape.start.x)}
                height={Math.abs(currentShape.current.y - currentShape.start.y)}
                stroke={canvasState.color}
                strokeWidth={canvasState.strokeWidth}
                fill="none"
                opacity={canvasState.opacity}
                strokeDasharray="5,5"
              />
            )}
            
            {currentShape.type === "circle" && (
              <ellipse
                cx={(currentShape.start.x + currentShape.current.x) / 2}
                cy={(currentShape.start.y + currentShape.current.y) / 2}
                rx={Math.abs(currentShape.current.x - currentShape.start.x) / 2}
                ry={Math.abs(currentShape.current.y - currentShape.start.y) / 2}
                stroke={canvasState.color}
                strokeWidth={canvasState.strokeWidth}
                fill="none"
                opacity={canvasState.opacity}
                strokeDasharray="5,5"
              />
            )}
            
            {currentShape.type === "arrow" && (
              <g>
                <line
                  x1={currentShape.start.x}
                  y1={currentShape.start.y}
                  x2={currentShape.current.x}
                  y2={currentShape.current.y}
                  stroke={canvasState.color}
                  strokeWidth={canvasState.strokeWidth}
                  opacity={canvasState.opacity}
                  strokeDasharray="5,5"
                  strokeLinecap="round"
                />
                {/* Arrow head preview */}
                <polygon
                  points={`${currentShape.current.x},${currentShape.current.y} ${currentShape.current.x - 10},${currentShape.current.y - 5} ${currentShape.current.x - 10},${currentShape.current.y + 5}`}
                  fill={canvasState.color}
                  opacity={canvasState.opacity * 0.7}
                />
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
});

// Temporary Bubble Component with anchored popups
function TempBubble({ 
  bubble, 
  onUpdate, 
  sessionId,
  displayFrame,
  fps,
  theme, 
  canvasState,
  convertToCSS,
  normalize = false
}: {
  bubble: {
    id: string;
    position: { x: number; y: number };
    showInput: boolean;
    showDropdown: boolean;
  };
  onUpdate?: (bubble: any) => void;
  sessionId?: string;
  displayFrame?: number;
  fps?: number;
  theme?: 'dark' | 'light';
  canvasState: ReviewCanvasState;
  convertToCSS: (x: number, y: number) => { x: number; y: number };
  normalize?: boolean;
}) {
  // Convert native coordinates to CSS for positioning
  const cssPos = convertToCSS(bubble.position.x, bubble.position.y);
  
  // Handle comment creation completion
  const handleCommentCreated = () => {
    // Close the temp bubble
    onUpdate?.(null);
  };

  const handleCancel = () => {
    // Close the temp bubble
    onUpdate?.(null);
  };

  return (
    <foreignObject
      x={cssPos.x - 15}
      y={cssPos.y - 15}
      width={30}
      height={30}
      style={{ overflow: 'visible', pointerEvents: 'auto' }}
    >
      <div style={{ pointerEvents: 'auto', position: 'relative' }}>
        {/* Temporary Bubble */}
        <div
          className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-orange-400/50 animate-pulse"
          style={{
            cursor: 'pointer'
          }}
        >
          ?
        </div>
        
        {/* Creation Input - Positioned relative to bubble */}
        {bubble.showInput && (
          <div style={{ 
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            zIndex: 1000
          }}>
            <CreateCommentInput
              sessionId={sessionId || ""}
              assetId={sessionId || ""}
              frameNumber={displayFrame || 0}
              frameTimestamp={(displayFrame || 0) / (fps || 30)}
              position={bubble.position}
              canvasSize={(() => {
                const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
                return canvas ? { width: canvas.width, height: canvas.height } : undefined;
              })()}
              normalize={normalize}
              onCommentCreated={handleCommentCreated}
              onCancel={handleCancel}
              theme={theme}
            />
          </div>
        )}
        
        {/* Dropdown - Positioned relative to bubble */}
        {bubble.showDropdown && (
          <div style={{ 
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            zIndex: 1000
          }}>
            {/* Dropdown component will go here */}
          </div>
        )}
      </div>
    </foreignObject>
  );
}
