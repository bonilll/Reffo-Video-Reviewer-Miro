"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  ReviewSession, 
  ReviewCanvasState, 
  ReviewVideoState, 
  ReviewAnnotation, 
  ReviewComment 
} from "@/types/canvas";
import { ReviewAnnotationLayer } from "./ReviewAnnotationLayer";
import { ReviewAnnotationSelector } from "./ReviewAnnotationSelector";
import { ReviewCommentMarkers } from "./ReviewCommentMarkers";
import { CreateCommentModal } from "./CreateCommentModal";

interface ReviewCanvasProps {
  session: ReviewSession;
  canvasState: ReviewCanvasState;
  onCanvasStateChange: (state: ReviewCanvasState) => void;
  videoState: ReviewVideoState;
  annotations: ReviewAnnotation[];
  comments: ReviewComment[];
  showAnnotations: boolean;
  showComments: boolean;
  onAnnotationCreated?: (annotationId: string) => void;
  theme?: 'dark' | 'light';
  // Selection props (passed from parent) so selector can render inside media rect
  selectedAnnotationIds?: string[];
  selectedCommentIds?: string[];
  onAnnotationSelect?: (annotationIds: string[]) => void;
  onCommentSelect?: (commentIds: string[]) => void;
  onAnnotationMove?: (annotationIds: string[], dx: number, dy: number) => void;
  onCommentMove?: (commentIds: string[], dx: number, dy: number) => void;
  onAnnotationResize?: (annotationId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationRotate?: (annotationId: string, rotation: number) => void;
  onAnnotationTransform?: (annotationId: string, transform: { x: number; y: number; width: number; height: number; rotation?: number }) => void;
  onCommentClick?: (comment: ReviewComment, position: { x: number; y: number }) => void;
}

export function ReviewCanvas({
  session,
  canvasState,
  onCanvasStateChange,
  videoState,
  annotations,
  comments,
  showAnnotations,
  showComments,
  onAnnotationCreated,
  theme = 'light',
  selectedAnnotationIds = [],
  selectedCommentIds = [],
  onAnnotationSelect,
  onCommentSelect,
  onAnnotationMove,
  onCommentMove,
  onAnnotationResize,
  onAnnotationRotate,
  onAnnotationTransform,
  onCommentClick,
}: ReviewCanvasProps) {
  
  // Force re-render of annotations when window resizes to ensure proper scaling
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    
    // Set initial size
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentPosition, setCommentPosition] = useState<{ x: number; y: number } | null>(null);

  const createAnnotation = useMutation(api.review.createAnnotation);
  const createComment = useMutation(api.review.createComment);


  // Sync video with videoState
  useEffect(() => {
    const video = videoRef.current;
    if (!video || session.primaryAssetType !== "video") return;

    // Sync current time
    if (Math.abs(video.currentTime - videoState.currentTime) > 0.1) {
      video.currentTime = videoState.currentTime;
    }

    // Sync play/pause state
    if (videoState.isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!videoState.isPlaying && !video.paused) {
      video.pause();
    }

    // Sync volume
    video.volume = videoState.volume;
    video.muted = videoState.isMuted;
  }, [videoState, session.primaryAssetType]);

  // Update canvas size based on container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      
      setCanvasSize({
        width: Math.max(rect.width, 800),
        height: Math.max(rect.height, 600)
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Get position relative to container
    const relativeX = clientX - containerRect.left;
    const relativeY = clientY - containerRect.top;
    
    // Account for zoom and pan transformations
    // Since annotations use the same transform, we need consistent coordinates
    const actualX = (relativeX - canvasState.pan.x) / canvasState.zoom;
    const actualY = (relativeY - canvasState.pan.y) / canvasState.zoom;
    
    return {
      x: actualX,
      y: actualY
    };
  }, [canvasState.zoom, canvasState.pan]);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!session.settings.allowDrawing || canvasState.tool === "eraser") return;
    
    e.preventDefault(); // Prevent scrolling on touch
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const coords = getCanvasCoordinates(clientX, clientY);
    setIsDrawing(true);
    setDrawingStart(coords);
    setLastPoint(coords);
    
    if (canvasState.tool === "freehand") {
      setCurrentPath(`M ${coords.x} ${coords.y}`);
    } else if (["rectangle", "circle", "arrow"].includes(canvasState.tool)) {
      setCurrentShape({
        type: canvasState.tool,
        start: coords,
        current: coords
      });
    }
    
    onCanvasStateChange({
      ...canvasState,
      isDrawing: true
    });
  }, [canvasState, onCanvasStateChange, getCanvasCoordinates, session.settings.allowDrawing]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    e.preventDefault(); // Prevent scrolling on touch
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const coords = getCanvasCoordinates(clientX, clientY);
    
    if (canvasState.tool === "freehand") {
      if (lastPoint) {
        const dx = coords.x - lastPoint.x;
        const dy = coords.y - lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Smoothing migliorato: passo minimo più piccolo per maggiore fluidità
        if (distance < 0.5) return;
        
        // Usa quadratic curve per linee più morbide
        const midX = (coords.x + lastPoint.x) / 2;
        const midY = (coords.y + lastPoint.y) / 2;
        setCurrentPath(prev => `${prev} Q ${lastPoint.x} ${lastPoint.y} ${midX} ${midY}`);
        setLastPoint({ x: midX, y: midY });
      } else {
        // Primo punto
        setCurrentPath(`M ${coords.x} ${coords.y}`);
        setLastPoint(coords);
      }
    } else if (["rectangle", "circle", "arrow"].includes(canvasState.tool) && drawingStart) {
      setCurrentShape({
        type: canvasState.tool,
        start: drawingStart,
        current: coords
      });
    }
  }, [isDrawing, canvasState.tool, getCanvasCoordinates, drawingStart, lastPoint]);

  const stopDrawing = useCallback(async () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setLastPoint(null);
    
    onCanvasStateChange({
      ...canvasState,
      isDrawing: false
    });

    // Save annotation based on tool type
    try {
      let annotationId: string | undefined;
      
      if (canvasState.tool === "freehand" && currentPath) {
        const result = await createAnnotation({
          sessionId: session._id,
          assetId: session.primaryAssetId,
          frameNumber: session.primaryAssetType === "video" ? videoState.currentFrame : undefined,
          frameTimestamp: session.primaryAssetType === "video" ? videoState.currentTime : undefined,
          type: "freehand",
          drawingData: {
            path: currentPath,
            style: {
              color: canvasState.color,
              strokeWidth: canvasState.strokeWidth,
              opacity: canvasState.opacity
            }
          },
          position: { x: 0, y: 0 }
        });
        annotationId = result;
      } else if (["rectangle", "circle", "arrow"].includes(canvasState.tool) && currentShape && drawingStart) {
        const bounds = {
          x: Math.min(drawingStart.x, currentShape.current.x),
          y: Math.min(drawingStart.y, currentShape.current.y),
          width: Math.abs(currentShape.current.x - drawingStart.x),
          height: Math.abs(currentShape.current.y - drawingStart.y)
        };

        const result = await createAnnotation({
          sessionId: session._id,
          assetId: session.primaryAssetId,
          frameNumber: session.primaryAssetType === "video" ? videoState.currentFrame : undefined,
          frameTimestamp: session.primaryAssetType === "video" ? videoState.currentTime : undefined,
          type: canvasState.tool as any,
          drawingData: {
            bounds,
            style: {
              color: canvasState.color,
              strokeWidth: canvasState.strokeWidth,
              opacity: canvasState.opacity
            }
          },
          position: { x: bounds.x, y: bounds.y }
        });
        annotationId = result;
      }

      // Notify parent component of new annotation for undo stack
      if (annotationId && onAnnotationCreated) {
        onAnnotationCreated(annotationId);
      }
    } catch (error) {
      console.error("Error saving annotation:", error);
    }
    
    // Reset drawing state
    setCurrentPath("");
    setCurrentShape(null);
    setDrawingStart(null);
  }, [
    isDrawing, 
    currentPath, 
    currentShape,
    drawingStart,
    canvasState, 
    onCanvasStateChange, 
    createAnnotation, 
    session, 
    videoState,
    onAnnotationCreated
  ]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // If we're in comment mode, show comment modal
    if (session.settings.allowComments && e.detail === 2) { // Double click
      const coords = getCanvasCoordinates(e.clientX, e.clientY);
      setCommentPosition(coords);
      setShowCommentModal(true);
    }
  }, [session.settings.allowComments, getCanvasCoordinates]);

  const handleCreateComment = async (content: string) => {
    if (!commentPosition) return;
    
    try {
      const el = canvasRef.current;
      const size = el ? { width: el.width, height: el.height } : undefined;
      const posToSave = size
        ? { x: commentPosition.x / Math.max(size.width, 1), y: commentPosition.y / Math.max(size.height, 1) }
        : commentPosition;
      await createComment({
        sessionId: session._id,
        assetId: session.primaryAssetId,
        frameNumber: session.primaryAssetType === "video" ? videoState.currentFrame : undefined,
        frameTimestamp: session.primaryAssetType === "video" ? videoState.currentTime : undefined,
        content,
        position: posToSave
      });
      
      setShowCommentModal(false);
      setCommentPosition(null);
    } catch (error) {
      console.error("Error creating comment:", error);
    }
  };

  // Handle zoom and pan
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, canvasState.zoom * zoomFactor));
      
      onCanvasStateChange({
        ...canvasState,
        zoom: newZoom
      });
    } else {
      // Pan
      onCanvasStateChange({
        ...canvasState,
        pan: {
          x: canvasState.pan.x - e.deltaX,
          y: canvasState.pan.y - e.deltaY
        }
      });
    }
  }, [canvasState, onCanvasStateChange]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 overflow-hidden"
      onWheel={handleWheel}
    >
      {/* Main Asset (Image or Video) */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `scale(${canvasState.zoom}) translate(${canvasState.pan.x}px, ${canvasState.pan.y}px)`
        }}
      >
        {session.primaryAssetType === "image" ? (
          <img
            ref={imageRef}
            src={session.primaryAssetUrl}
            alt="Review Asset"
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <video
            ref={videoRef}
            src={session.primaryAssetUrl}
            className="max-w-full max-h-full object-contain"
            controls={false}
            muted={videoState.isMuted}
            draggable={false}
            preload="metadata"
            playsInline
          />
        )}
      </div>

      {/* Drawing Canvas anchored to the same media transform */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        onClick={handleCanvasClick}
        style={{
          transform: `scale(${canvasState.zoom}) translate(${canvasState.pan.x}px, ${canvasState.pan.y}px)`,
          zIndex: 1,
          cursor: canvasState.tool === 'freehand' ? 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><path fill=\'%23000\' d=\'M3 21v-3l12-12l3 3L6 21H3zm3.5-1H8l9.5-9.5l-1.5-1.5L6.5 19z\'/></svg>") 0 24, crosshair' : 'crosshair'
        }}
      />

      {/* Annotation Layer - constrained to actual content dimensions of media */}
      {showAnnotations && (() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        const image = imageRef.current;
        const video = videoRef.current;
        
        if (!canvas || !container) return null;
        
        const containerRect = container.getBoundingClientRect();
        
        let renderedWidth, renderedHeight, offsetX, offsetY;
        
        if (session.primaryAssetType === "image" && image && image.naturalWidth > 0) {
          // Calculate rendered image dimensions with object-contain behavior
          const imageNativeWidth = image.naturalWidth;
          const imageNativeHeight = image.naturalHeight;
          const containerWidth = containerRect.width;
          const containerHeight = containerRect.height;
          
          const imageAspectRatio = imageNativeWidth / imageNativeHeight;
          const containerAspectRatio = containerWidth / containerHeight;
          
          if (imageAspectRatio > containerAspectRatio) {
            // Image is wider - limited by container width
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / imageAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
          } else {
            // Image is taller - limited by container height
            renderedWidth = containerHeight * imageAspectRatio;
            renderedHeight = containerHeight;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
          }
        } else if (session.primaryAssetType === "video" && video && video.videoWidth > 0) {
          // Calculate rendered video dimensions
          const videoNativeWidth = video.videoWidth;
          const videoNativeHeight = video.videoHeight;
          const containerWidth = containerRect.width;
          const containerHeight = containerRect.height;
          
          const videoAspectRatio = videoNativeWidth / videoNativeHeight;
          const containerAspectRatio = containerWidth / containerHeight;
          
          if (videoAspectRatio > containerAspectRatio) {
            // Video is wider - limited by container width
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / videoAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
          } else {
            // Video is taller - limited by container height
            renderedWidth = containerHeight * videoAspectRatio;
            renderedHeight = containerHeight;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
          }
        } else {
          // Fallback to canvas dimensions if media not loaded
          const canvasRect = canvas.getBoundingClientRect();
          offsetX = canvasRect.left - containerRect.left;
          offsetY = canvasRect.top - containerRect.top;
          renderedWidth = canvasRect.width;
          renderedHeight = canvasRect.height;
        }
        
        return (
          <div
            className="absolute"
            style={{
              left: offsetX,
              top: offsetY,
              width: renderedWidth,
              height: renderedHeight,
              zIndex: 2,
              // Enable pointer events when in select mode so selector can receive clicks
              pointerEvents: canvasState.tool === 'select' ? 'auto' : 'none'
            }}
          >
            <ReviewAnnotationLayer
              annotations={annotations}
              canvasState={canvasState}
              currentPath={currentPath}
              currentShape={currentShape}
              applyTransform={false} // Don't apply pan/zoom - handled by parent transform
              canvasSize={{ 
                width: session.primaryAssetType === "image" && image ? image.naturalWidth || canvasSize.width : canvasSize.width, 
                height: session.primaryAssetType === "image" && image ? image.naturalHeight || canvasSize.height : canvasSize.height 
              }}
            />
            {/* Selection overlay mounted inside same media rect */}
            {canvasState.tool === 'select' && (
              <div className="absolute inset-0" style={{ zIndex: 6, pointerEvents: 'auto' }}>
                <ReviewAnnotationSelector
                  annotations={annotations}
                  comments={comments}
                  selectedAnnotationIds={selectedAnnotationIds}
                  selectedCommentIds={selectedCommentIds}
                  onAnnotationSelect={onAnnotationSelect || (() => {})}
                  onCommentSelect={onCommentSelect || (() => {})}
                  onAnnotationMove={onAnnotationMove || (() => {})}
                  onCommentMove={onCommentMove || (() => {})}
                  onAnnotationResize={onAnnotationResize}
                  onAnnotationRotate={onAnnotationRotate}
                  onAnnotationTransform={onAnnotationTransform}
                  onCommentClick={onCommentClick}
                  theme={theme}
                  canvasRect={new DOMRect(0,0, renderedWidth, renderedHeight) as any}
                  canvasNativeWidth={session.primaryAssetType === "image" && image ? image.naturalWidth || canvasSize.width : canvasSize.width}
                  canvasNativeHeight={session.primaryAssetType === "image" && image ? image.naturalHeight || canvasSize.height : canvasSize.height}
                  scale={1}
                  pan={{ x: 0, y: 0 }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Comment Markers */}
      {showComments && (
        <ReviewCommentMarkers
          comments={comments}
          canvasState={canvasState}
          onCommentClick={(comment) => {
            // Handle comment click - could show modal or highlight
            console.log('Comment clicked:', comment);
          }}
          theme={theme}
        />
      )}

      {/* Create Comment Modal */}
      <CreateCommentModal
        isOpen={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setCommentPosition(null);
        }}
        onSubmit={handleCreateComment}
        position={commentPosition}
      />

    </div>
  );
}
