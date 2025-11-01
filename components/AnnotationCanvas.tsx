import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Annotation, Point, Video, AnnotationTool, RectangleAnnotation, EllipseAnnotation, PointerPosition, Comment, TextAnnotation, ImageAnnotation } from '../types';
import * as geo from '../utils/geometry';
import CommentPopover from './CommentPopover';
import NewCommentPopover from './NewCommentPopover';
import { CheckCircle2, UploadCloud } from 'lucide-react';

interface AnnotationCanvasProps {
  video: Video;
  videoElement: HTMLVideoElement | null;
  currentFrame: number;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Omit<Annotation, 'id' | 'videoId' | 'authorId' | 'createdAt'>) => void;
  onUpdateAnnotations: (annotations: Annotation[]) => void;
  onDeleteAnnotations: (ids: string[]) => void;
  activeTool: AnnotationTool;
  brushColor: string;
  brushSize: number;
  fontSize: number;
  selectedAnnotationIds: string[];
  setSelectedAnnotationIds: (ids: string[]) => void;
  comments: Comment[];
  activeCommentId: string | null;
  onCommentPlacement: (position: Point) => void;
  activeCommentPopoverId: string | null;
  // FIX: Use React.Dispatch for useState setter prop to allow functional updates.
  setActiveCommentPopoverId: React.Dispatch<React.SetStateAction<string | null>>;
  onUpdateCommentPosition: (id: string, position: Point) => void;
  onAddComment: (text: string, parentId?: string) => void;
  pendingComment: { position: Point } | null;
  setPendingComment: (p: { position: Point } | null) => void;
  isDark?: boolean;
}

interface MovingCommentState {
  comment: Comment;
  startPoint: Point; // Normalized coordinates
}

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  video, videoElement, currentFrame, annotations, onAddAnnotation, onUpdateAnnotations, onDeleteAnnotations,
  activeTool, brushColor, brushSize, fontSize, selectedAnnotationIds, setSelectedAnnotationIds,
  comments, activeCommentId, onCommentPlacement, activeCommentPopoverId, setActiveCommentPopoverId,
  onUpdateCommentPosition, onAddComment, pendingComment, setPendingComment, isDark = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  // FIX: Add optional `start` and `end` points to the drawing shape state type to accommodate temporary drawing properties for rectangles and ellipses.
  const [drawingShape, setDrawingShape] = useState<(Partial<Annotation> & { start?: Point, end?: Point }) | null>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  
  const [marquee, setMarquee] = useState<geo.BoundingBox | null>(null);
  const [transform, setTransform] = useState<geo.TransformState | null>(null);
  const [transformedAnnotations, setTransformedAnnotations] = useState<Annotation[] | null>(null);
  
  const [movingCommentState, setMovingCommentState] = useState<MovingCommentState | null>(null);
  const [transformedComment, setTransformedComment] = useState<Comment | null>(null);

  const [editingText, setEditingText] = useState<{ position: Point, text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  const redrawRequest = useRef(0);
  
  const renderedRect = useMemo(() => {
    if (!containerRect || !video) return null;
    return geo.getRenderedRect({
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      videoWidth: video.width,
      videoHeight: video.height
    });
  }, [containerRect, video]);

  const annotationsForFrame = useMemo(() => {
    return annotations.filter(a => a.frame === currentFrame);
  }, [annotations, currentFrame]);

  const selectedAnnotations = useMemo(() => {
    return annotations.filter(a => selectedAnnotationIds.includes(a.id));
  }, [annotations, selectedAnnotationIds]);

  const annotationsToDraw = useMemo(() => {
      const baseAnnotations = annotationsForFrame.filter(a => a.id !== (editingText as any)?.id);
      if (!transformedAnnotations) return baseAnnotations;
      
      const transformedIds = new Set(transformedAnnotations.map(t => t.id));
      const nonTransformed = baseAnnotations.filter(a => !transformedIds.has(a.id));
      return [...nonTransformed, ...transformedAnnotations];
  }, [annotationsForFrame, transformedAnnotations, editingText]);

  const commentsOnFrame = useMemo(() => {
    return comments
      .filter(c => c.frame === currentFrame && c.position)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [comments, currentFrame]);

  // Handle keyboard events for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLTextAreaElement) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationIds.length > 0) {
            e.preventDefault();
            onDeleteAnnotations(selectedAnnotationIds);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationIds, onDeleteAnnotations]);
  
  // Resize observer for canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerRect(entry.contentRect);
      }
    });
    resizeObserver.observe(parent);
    setContainerRect(parent.getBoundingClientRect());

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (editingText && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [editingText]);


  // Main drawing loop for annotations (comments are now HTML)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRect || !renderedRect) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerRect.width * dpr;
    canvas.height = containerRect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const draw = (anno: Annotation | Partial<Annotation>) => {
      if (!renderedRect) return;
      ctx.strokeStyle = anno.color || '#000';
      ctx.fillStyle = anno.color || '#000';
      ctx.lineWidth = (anno.lineWidth || 1); // We don't scale line width with video size
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (anno.type) {
        case AnnotationTool.IMAGE: {
          const imgAnno = anno as ImageAnnotation;
          if (!imgAnno.src || !imgAnno.center || imgAnno.width == null || imgAnno.height == null) return;

          const img = imageCache.current[imgAnno.src];
          if (img && img.complete) {
            const center = geo.normalizedToCanvas(imgAnno.center, renderedRect);
            const width = imgAnno.width * renderedRect.width;
            const height = imgAnno.height * renderedRect.height;
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(imgAnno.rotation || 0);
            ctx.drawImage(img, -width / 2, -height / 2, width, height);
            ctx.restore();
          } else if (!img) {
            const newImg = new Image();
            newImg.src = imgAnno.src;
            newImg.onload = () => {
              imageCache.current[imgAnno.src] = newImg;
              redrawRequest.current++; // Force a re-render
            };
          }
          break;
        }
        case AnnotationTool.FREEHAND:
            if (anno.points && anno.points.length > 1) {
            ctx.beginPath();
            const startPoint = geo.normalizedToCanvas(anno.points[0], renderedRect);
            ctx.moveTo(startPoint.x, startPoint.y);
            for (const point of anno.points) {
              const p = geo.normalizedToCanvas(point, renderedRect);
              ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          }
          break;
        case AnnotationTool.RECTANGLE: {
            const rectAnno = anno as RectangleAnnotation & { start?: Point, end?: Point };
            if (rectAnno.center && rectAnno.width != null && rectAnno.height != null) {
                const center = geo.normalizedToCanvas(rectAnno.center, renderedRect);
                const width = rectAnno.width * renderedRect.width;
                const height = rectAnno.height * renderedRect.height;
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(rectAnno.rotation || 0);
                ctx.strokeRect(-width / 2, -height / 2, width, height);
                ctx.restore();
            } else if (rectAnno.start && rectAnno.end) {
                const start = geo.normalizedToCanvas(rectAnno.start, renderedRect);
                const end = geo.normalizedToCanvas(rectAnno.end, renderedRect);
                ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            }
            break;
        }
        case AnnotationTool.ELLIPSE: {
            const ellipseAnno = anno as EllipseAnnotation & { start?: Point, end?: Point };
            if (ellipseAnno.center && ellipseAnno.width != null && ellipseAnno.height != null) {
                const center = geo.normalizedToCanvas(ellipseAnno.center, renderedRect);
                const radiusX = (ellipseAnno.width * renderedRect.width) / 2;
                const radiusY = (ellipseAnno.height * renderedRect.height) / 2;
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(ellipseAnno.rotation || 0);
                ctx.beginPath();
                ctx.ellipse(0, 0, Math.abs(radiusX), Math.abs(radiusY), 0, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
            } else if (ellipseAnno.start && ellipseAnno.end) {
                const start = geo.normalizedToCanvas(ellipseAnno.start, renderedRect);
                const end = geo.normalizedToCanvas(ellipseAnno.end, renderedRect);
                const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                const radiusX = Math.abs(end.x - start.x) / 2;
                const radiusY = Math.abs(end.y - start.y) / 2;
                ctx.beginPath();
                ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
                ctx.stroke();
            }
            break;
        }
        case AnnotationTool.ARROW:
            if(anno.start && anno.end) {
                const headlen = Math.min(15, Math.max(5, (anno.lineWidth || 4) * 2.5));
                const start = geo.normalizedToCanvas(anno.start, renderedRect);
                const end = geo.normalizedToCanvas(anno.end, renderedRect);
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const angle = Math.atan2(dy, dx);
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.lineTo(end.x - headlen * Math.cos(angle - Math.PI / 6), end.y - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(end.x, end.y);
                ctx.lineTo(end.x - headlen * Math.cos(angle + Math.PI / 6), end.y - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
            break;
        case AnnotationTool.TEXT:
            const textAnno = anno as TextAnnotation;
            if (textAnno.position && textAnno.text) {
                const pos = geo.normalizedToCanvas(textAnno.position, renderedRect);
                ctx.font = `${textAnno.fontSize}px sans-serif`;
                ctx.textBaseline = 'top';
                ctx.fillText(textAnno.text, pos.x, pos.y);
            }
            break;
      }
    };
    
    annotationsToDraw.forEach(draw);
    if(drawingShape) draw(drawingShape);

    // Draw selection box and handles
    if (activeTool === AnnotationTool.SELECT && selectedAnnotations.length > 0 && renderedRect) {
        const annosForBox = transformedAnnotations || selectedAnnotations;
        geo.drawSelection(ctx, annosForBox, renderedRect);
    }

    // Draw marquee
    if (marquee && renderedRect) {
        const start = geo.normalizedToCanvas(marquee.start, renderedRect);
        const end = geo.normalizedToCanvas(marquee.end, renderedRect);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.setLineDash([]);
    }

  }, [annotationsToDraw, drawingShape, containerRect, renderedRect, activeTool, marquee, selectedAnnotations, transformedAnnotations, redrawRequest.current]);
  
  // FIX: Use a more generic type for the event object to accommodate different event sources,
  // specifying only the properties the function actually uses (`clientX`, `clientY`).
  const getPointerPosition = (e: { clientX: number; clientY: number }): PointerPosition | null => {
    const canvas = canvasRef.current;
    if (!canvas || !renderedRect) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { canvas: { x, y }, normalized: geo.canvasToNormalized({x, y}, renderedRect) };
  };
  
  const handleCommentMarkerPointerDown = (e: React.PointerEvent<HTMLDivElement>, comment: Comment) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = getPointerPosition(e);
    if (!pos) return;

    if (activeTool === AnnotationTool.SELECT) {
      // Capture pointer on the marker so we continue to receive move events while dragging
      try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
      setMovingCommentState({ comment, startPoint: pos.normalized });
      setActiveCommentPopoverId(null);
      setSelectedAnnotationIds([]);
    } else {
      setActiveCommentPopoverId((id) => (id === comment.id ? null : comment.id));
    }
  };

  const handleCommentMarkerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!movingCommentState || !renderedRect) return;
    const pos = getPointerPosition(e);
    if (!pos) return;
    if (!transformedComment) {
      const DRAG_THRESHOLD = 3; // px
      const startCanvasPos = geo.normalizedToCanvas(movingCommentState.startPoint, renderedRect);
      const distSq = Math.pow(pos.canvas.x - startCanvasPos.x, 2) + Math.pow(pos.canvas.y - startCanvasPos.y, 2);
      if (distSq > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        setTransformedComment(movingCommentState.comment);
      }
      return;
    }
    const dx = pos.normalized.x - movingCommentState.startPoint.x;
    const dy = pos.normalized.y - movingCommentState.startPoint.y;
    setTransformedComment({
      ...transformedComment,
      position: {
        x: movingCommentState.comment.position.x + dx,
        y: movingCommentState.comment.position.y + dy,
      },
    });
  };

  const handleCommentMarkerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
    handlePointerUp();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingText || pendingComment) return;
    
    // If a popover is open, a click on the canvas should close it.
    // The event target check ensures we don't close it when clicking on the marker that opened it.
    if (activeCommentPopoverId && e.target === canvasRef.current) {
        setActiveCommentPopoverId(null);
    }
    
    const pos = getPointerPosition(e);
    if (!pos || !renderedRect) return;

    if (activeTool === AnnotationTool.SELECT) {
        const handle = selectedAnnotations.length > 0 ? geo.getHandleUnderPoint(pos.canvas, selectedAnnotations, renderedRect) : null;
        if (handle) {
            setTransform(geo.startTransform(handle, pos.canvas, selectedAnnotations, renderedRect));
            return;
        }

        const annoUnderPoint = [...annotationsForFrame].reverse().find(a => geo.isPointInAnnotation(pos.normalized, a, renderedRect, video.height / renderedRect.height));
        if (annoUnderPoint) {
            const isSelected = selectedAnnotationIds.includes(annoUnderPoint.id);
            if (e.shiftKey) {
                setSelectedAnnotationIds(
                    isSelected 
                        ? selectedAnnotationIds.filter(id => id !== annoUnderPoint.id)
                        : [...selectedAnnotationIds, annoUnderPoint.id]
                );
            } else if (!isSelected) {
                setSelectedAnnotationIds([annoUnderPoint.id]);
            }
            const annosToMove = e.shiftKey && isSelected ? selectedAnnotations.filter(a => a.id !== annoUnderPoint.id) : (e.shiftKey ? [...selectedAnnotations, annoUnderPoint] : [annoUnderPoint]);
            setTransform(geo.startTransform('move', pos.canvas, annosToMove, renderedRect));
        } else {
            if (!e.shiftKey) setSelectedAnnotationIds([]);
            setMarquee({ start: pos.normalized, end: pos.normalized });
        }
    } else { // Drawing tools
        if (activeTool === AnnotationTool.COMMENT) {
            onCommentPlacement(pos.normalized);
            return;
        }
        if (activeTool === AnnotationTool.TEXT) {
            setEditingText({ position: pos.normalized, text: '' });
            return;
        }

        setIsDrawing(true);
        const baseAnno = { frame: currentFrame, color: brushColor, lineWidth: brushSize };
        switch (activeTool) {
            case AnnotationTool.FREEHAND:
                setDrawingShape({ ...baseAnno, type: AnnotationTool.FREEHAND, points: [pos.normalized] });
                break;
            case AnnotationTool.RECTANGLE:
            case AnnotationTool.ELLIPSE:
                setDrawingShape({ ...baseAnno, type: activeTool, start: pos.normalized, end: pos.normalized, rotation: 0 });
                break;
            case AnnotationTool.ARROW:
                setDrawingShape({ ...baseAnno, type: activeTool, start: pos.normalized, end: pos.normalized });
                break;
        }
    }
  };
  
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingText || pendingComment) return;
    if (!e.buttons) {
      if(isDrawing || marquee || transform || movingCommentState) handlePointerUp();
      return;
    }

    const pos = getPointerPosition(e);
    if (!pos || !renderedRect) return;

    // Check if we should START a comment move (promote a potential move to a real one)
    if (movingCommentState && !transformedComment) {
        const DRAG_THRESHOLD = 5; // in pixels
        const startCanvasPos = geo.normalizedToCanvas(movingCommentState.startPoint, renderedRect);
        const distSq = Math.pow(pos.canvas.x - startCanvasPos.x, 2) + Math.pow(pos.canvas.y - startCanvasPos.y, 2);

        if (distSq > DRAG_THRESHOLD * DRAG_THRESHOLD) {
            setTransformedComment(movingCommentState.comment); // This officially starts the drag
        }
    }

    // Handle an ACTIVE comment move
    if (movingCommentState && transformedComment) {
      const dx = pos.normalized.x - movingCommentState.startPoint.x;
      const dy = pos.normalized.y - movingCommentState.startPoint.y;
      setTransformedComment({
        ...transformedComment,
        position: {
          x: movingCommentState.comment.position.x + dx,
          y: movingCommentState.comment.position.y + dy,
        },
      });
      return;
    }

    if (transform) {
        const updatedAnnotations = geo.applyTransform(pos.canvas, transform, renderedRect);
        setTransformedAnnotations(updatedAnnotations);
        return;
    }

    if (marquee) {
        setMarquee({ ...marquee, end: pos.normalized });
        return;
    }

    if (!isDrawing || !drawingShape) return;
    
    setDrawingShape(prev => {
      if (!prev) return null;
      switch(prev.type) {
        case AnnotationTool.FREEHAND:
          return { ...prev, points: [...(prev.points || []), pos.normalized] };
        case AnnotationTool.RECTANGLE:
        case AnnotationTool.ELLIPSE:
        case AnnotationTool.ARROW:
          return { ...prev, end: pos.normalized };
        default:
          return prev;
      }
    });
  };
  
  const handlePointerUp = () => {
    // Finalize comment interaction
    if (movingCommentState) {
        // If it was a drag (transformedComment is set)
        if (transformedComment && transformedComment.position) {
            onUpdateCommentPosition(transformedComment.id, transformedComment.position);
        } 
        // If it was just a click (transformedComment was never set)
        else {
            setActiveCommentPopoverId(movingCommentState.comment.id);
        }
    }

    // Finalize annotation transform
    if (transform && transformedAnnotations) {
        onUpdateAnnotations(transformedAnnotations);
    }

    // Finalize marquee selection
    if (marquee && renderedRect) {
        const selectedIds = new Set(selectedAnnotationIds);
        annotationsForFrame.forEach(a => {
            if (geo.isAnnotationInMarquee(a, marquee, renderedRect, video.height / renderedRect.height)) {
                selectedIds.add(a.id);
            }
        });
        setSelectedAnnotationIds(Array.from(selectedIds));
    }

    // Finalize drawing a new shape
    if (isDrawing && drawingShape && drawingShape.type && renderedRect) {
      let finalShape = { ...drawingShape };
      if ((finalShape.type === AnnotationTool.RECTANGLE || finalShape.type === AnnotationTool.ELLIPSE) && finalShape.start && finalShape.end) {
        finalShape = {
            ...finalShape,
            center: {
                x: (finalShape.start.x + finalShape.end.x) / 2,
                y: (finalShape.start.y + finalShape.end.y) / 2,
            },
            width: Math.abs(finalShape.start.x - finalShape.end.x),
            height: Math.abs(finalShape.start.y - finalShape.end.y),
        }
        delete (finalShape as any).start;
        delete (finalShape as any).end;
      }
      if(!(finalShape.type === AnnotationTool.FREEHAND && finalShape.points?.length < 2)) {
          onAddAnnotation(finalShape as any);
      }
    }
    
    // Universal cleanup for all transient interaction states
    setIsDrawing(false);
    setDrawingShape(null);
    setMarquee(null);
    setTransform(null);
    setTransformedAnnotations(null);
    setMovingCommentState(null);
    setTransformedComment(null);
  };
  
  const handleTextareaBlur = () => {
    if (editingText && editingText.text.trim()) {
        // FIX: Create an explicitly typed variable to pass to `onAddAnnotation` to avoid excess property errors with discriminated unions.
        const newAnnotation: Omit<TextAnnotation, 'id' | 'videoId' | 'authorId' | 'createdAt'> = {
            type: AnnotationTool.TEXT,
            frame: currentFrame,
            color: brushColor,
            lineWidth: 0, // Not applicable
            position: editingText.position,
            text: editingText.text,
            fontSize: fontSize,
        };
        onAddAnnotation(newAnnotation);
    }
    setEditingText(null);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleTextareaBlur();
      }
      if (e.key === 'Escape') {
          e.preventDefault();
          setEditingText(null);
      }
  };


  const getCursor = () => {
    const canvas = canvasRef.current;
    if (!canvas || !renderedRect) return 'default';

    // Keep cursor normal, only show grabbing while dragging
    if (movingCommentState && transformedComment) return 'grabbing';
    if (transform?.action === 'move') return 'grabbing';
    return 'default';
  };

  const activePopoverComment = useMemo(() => {
    return comments.find(c => c.id === activeCommentPopoverId);
  }, [comments, activeCommentPopoverId]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const src = loadEvent.target?.result as string;
        if (!src) return;

        const pos = getPointerPosition(e);
        if (!pos) return;

        const img = new Image();
        img.src = src;
        img.onload = () => {
            const aspectRatio = img.width / img.height;
            const defaultWidth = 0.2; // 20% of video width
            const defaultHeight = (defaultWidth / aspectRatio) * (video.width / video.height);

            // FIX: Create an explicitly typed variable to pass to `onAddAnnotation` to avoid excess property errors with discriminated unions.
            const newAnnotation: Omit<ImageAnnotation, 'id' | 'videoId' | 'authorId' | 'createdAt'> = {
              type: AnnotationTool.IMAGE,
              frame: currentFrame,
              src,
              center: pos.normalized,
              width: defaultWidth,
              height: defaultHeight,
              rotation: 0,
              color: 'transparent', // Not used but required
              lineWidth: 0, // Not used but required
            };
            onAddAnnotation(newAnnotation);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className="absolute top-0 left-0 w-full h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-auto z-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: getCursor() }}
      />

      {isDraggingOver && (
        <div className="absolute inset-0 bg-black/50 border-4 border-dashed border-white rounded-lg flex items-center justify-center pointer-events-none z-50">
          <div className="text-center text-white">
            <UploadCloud size={64} className="mx-auto" />
            <p className="mt-4 text-xl font-semibold">Drop image to upload</p>
          </div>
        </div>
      )}
      
      {/* HTML rendered Comment Markers */}
      {renderedRect && (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          {commentsOnFrame.map((comment, index) => {
            if (!comment.position) return null;

            const commentToShow = transformedComment?.id === comment.id ? transformedComment : comment;
            const pos = geo.normalizedToCanvas(commentToShow.position, renderedRect);
            const isActive = comment.id === activeCommentPopoverId;
            const isDraggingThis = Boolean(transformedComment && transformedComment.id === comment.id);

            return (
              <div
                key={comment.id}
                className={`absolute flex items-center justify-center w-8 h-8 rounded-full cursor-pointer ${isDraggingThis ? 'transition-none' : 'transition-all duration-150'} pointer-events-auto select-none transform -translate-x-1/2 -translate-y-1/2
                  ${isActive ? (isDark ? 'ring-2 ring-white ring-offset-2 ring-offset-black/50' : 'ring-2 ring-black ring-offset-2 ring-offset-white/70') + ' shadow-lg scale-110' : 'hover:scale-110 hover:shadow-lg'}
                  ${comment.resolved ? 'grayscale' : ''}
                `}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  zIndex: isActive ? 25 : 20,
                }}
                onPointerDown={(e) => handleCommentMarkerPointerDown(e, comment)}
                onPointerMove={handleCommentMarkerPointerMove}
                onPointerUp={handleCommentMarkerPointerUp}
              >
                <img
                  src={comment.authorAvatar}
                  alt={comment.authorName}
                  className={`w-full h-full rounded-full object-cover border-2 ${isDark ? 'border-gray-900/50' : 'border-gray-300'} pointer-events-none select-none`}
                  draggable="false"
                />
                
                {/* Number Badge */}
                <div className={`absolute -top-1 -right-1 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ${isDark ? 'bg-gray-900/80 text-white ring-gray-900/50' : 'bg-white text-gray-900 ring-gray-300'}`}>
                  {index + 1}
                </div>

                {/* Resolved Checkmark */}
                {comment.resolved && (
                  <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={18} className="text-green-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {renderedRect && activePopoverComment?.position && (
          <CommentPopover
            comment={activePopoverComment}
            comments={comments}
            onAddComment={onAddComment}
            onClose={() => setActiveCommentPopoverId(null)}
            renderedRect={renderedRect}
            isDark={isDark}
          />
      )}
      {renderedRect && pendingComment && (
        <NewCommentPopover
          position={pendingComment.position}
          renderedRect={renderedRect}
          onSubmit={onAddComment}
          onCancel={() => setPendingComment(null)}
          isDark={isDark}
        />
      )}
      {editingText && renderedRect && (
          <textarea
              ref={textareaRef}
              value={editingText.text}
              onChange={(e) => setEditingText(prev => prev ? { ...prev, text: e.target.value } : null)}
              onBlur={handleTextareaBlur}
              onKeyDown={handleTextareaKeyDown}
              style={{
                  position: 'absolute',
                  ...geo.getTextAreaStyles(editingText.position, fontSize, renderedRect, brushColor),
                  pointerEvents: 'auto',
              }}
              className="bg-transparent focus:outline-none p-0 border-0 resize-none overflow-hidden"
          />
      )}
    </div>
  );
};

export default AnnotationCanvas;
