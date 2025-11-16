import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Annotation, Point, Video, AnnotationTool, RectangleAnnotation, EllipseAnnotation, PointerPosition, Comment, TextAnnotation, ImageAnnotation, VideoAnnotation, MentionOption, FreehandAnnotation, ArrowAnnotation } from '../types';
import * as geo from '../utils/geometry';
import CommentPopover from './CommentPopover';
import NewCommentPopover from './NewCommentPopover';
import { CheckCircle2, UploadCloud, Play, Pause, Volume2, VolumeX, Repeat } from 'lucide-react';

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
  shapeFillEnabled: boolean;
  shapeFillOpacity: number;
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
  onToggleCommentResolved: (commentId: string) => void;
  onEditComment: (commentId: string, text: string) => void;
  onJumpToFrame: (frame: number) => void;
  pendingComment: { position: Point } | null;
  setPendingComment: (p: { position: Point } | null) => void;
  isDark?: boolean;
  onUploadAsset: (
    file: File,
    kind: 'image' | 'video',
    onProgress: (progressPercent: number) => void
  ) => Promise<{
    src: string;
    storageKey: string;
    byteSize: number;
    mimeType: string;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    duration?: number;
  }>;
  threadMeta?: Record<string, { count: number; unread: boolean; mentionAlert: { unread: boolean; notificationIds: string[] } | null }>;
  mentionOptions?: MentionOption[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgba = (hex: string, alpha: number) => {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized.split('').map((char) => char + char).join('');
  }
  const bigint = parseInt(normalized, 16);
  if (Number.isNaN(bigint)) {
    return `rgba(255, 255, 255, ${clamp(alpha, 0, 1)})`;
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

const resolveFillStyle = (color: string | undefined, opacity?: number) => {
  if (!color || opacity == null || opacity <= 0) return null;
  if (color === 'transparent') return null;
  if (color.startsWith('#')) {
    return hexToRgba(color, opacity);
  }
  if (color.startsWith('rgba')) {
    const alpha = clamp(opacity, 0, 1);
    return color.replace(/rgba\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map((part) => part.trim());
      if (parts.length < 3) return color;
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (color.startsWith('rgb')) {
    const inner = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')'));
    return `rgba(${inner}, ${clamp(opacity, 0, 1)})`;
  }
  return color;
};

interface MovingCommentState {
  comment: Comment;
  startPoint: Point; // Normalized coordinates
}

interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
  spacing?: {
    axis: 'horizontal' | 'vertical';
    from: Point;
    to: Point;
    label: string;
  };
}

const SNAP_THRESHOLD = 6;

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  video, videoElement, currentFrame, annotations, onAddAnnotation, onUpdateAnnotations, onDeleteAnnotations,
  activeTool, brushColor, brushSize, fontSize, selectedAnnotationIds, setSelectedAnnotationIds,
  comments, activeCommentId, onCommentPlacement, activeCommentPopoverId, setActiveCommentPopoverId,
  onUpdateCommentPosition, onAddComment, onToggleCommentResolved, onEditComment, onJumpToFrame, pendingComment, setPendingComment, isDark = true, onUploadAsset,
  threadMeta = {}, mentionOptions = [],
  shapeFillEnabled,
  shapeFillOpacity,
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
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  const [editingText, setEditingText] = useState<{ position: Point, text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [assetUploadProgress, setAssetUploadProgress] = useState<number | null>(null);
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const [assetUploadLabel, setAssetUploadLabel] = useState<string | null>(null);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  const [redrawTick, setRedrawTick] = useState(0);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  
  type VideoControlState = {
    isPlaying: boolean;
    isMuted: boolean;
    loop: boolean;
    progress: number;
    duration: number;
  };
  
  const defaultVideoControlState: VideoControlState = {
    isPlaying: false,
    isMuted: false,
    loop: false,
    progress: 0,
    duration: 0,
  };
  
  const [videoControls, setVideoControls] = useState<Record<string, VideoControlState>>({});
  const videoControlsRef = useRef<Record<string, VideoControlState>>({});
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  
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

  const effectiveAnnotations = useMemo(() => {
    if (!transformedAnnotations) return annotationsForFrame;
    const byId = new Map<string, Annotation>();
    annotationsForFrame.forEach((anno) => {
      byId.set(anno.id, anno);
    });
    transformedAnnotations.forEach((anno) => {
      byId.set(anno.id, anno as Annotation);
    });
    return Array.from(byId.values());
  }, [annotationsForFrame, transformedAnnotations]);

  const videoAnnotationsToRender = useMemo(() => {
    return effectiveAnnotations.filter((a): a is VideoAnnotation => a.type === AnnotationTool.VIDEO);
  }, [effectiveAnnotations]);

  const annotationsToDraw = useMemo(() => {
    return effectiveAnnotations
      .filter((a) => a.id !== (editingText as any)?.id);
  }, [effectiveAnnotations, editingText]);

  const commentsOnFrame = useMemo(() => {
    return comments
      .filter(c => c.frame === currentFrame && c.position)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [comments, currentFrame]);
  
  useEffect(() => {
    videoControlsRef.current = videoControls;
  }, [videoControls]);
  
  const setVideoControlState = useCallback((id: string, patch: Partial<VideoControlState>) => {
    setVideoControls((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? defaultVideoControlState), ...patch },
    }));
  }, []);

  const toggleVideoPlay = useCallback(
    (id: string) => {
      const node = videoRefs.current[id];
      if (!node) return;
      if (node.paused) {
        const playPromise = node.play();
        playPromise
          ?.then(() => {
            setVideoControlState(id, { isPlaying: true });
          })
          .catch(() => {
            setVideoControlState(id, { isPlaying: false });
          });
      } else {
        node.pause();
        setVideoControlState(id, { isPlaying: false });
      }
    },
    [setVideoControlState],
  );

  const toggleVideoMute = useCallback(
    (id: string) => {
      const node = videoRefs.current[id];
      if (!node) return;
      const nextMuted = !node.muted;
      node.muted = nextMuted;
      setVideoControlState(id, { isMuted: nextMuted });
    },
    [setVideoControlState],
  );

  const toggleVideoLoop = useCallback(
    (id: string) => {
      const node = videoRefs.current[id];
      if (!node) return;
      const nextLoop = !node.loop;
      node.loop = nextLoop;
      setVideoControlState(id, { loop: nextLoop });
    },
    [setVideoControlState],
  );

  const handleVideoTimeUpdate = useCallback(
    (id: string, target: HTMLVideoElement) => {
      const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : (videoControlsRef.current[id]?.duration ?? 0);
      setVideoControlState(id, {
        progress: target.currentTime,
        duration,
        isPlaying: !target.paused,
      });
    },
    [setVideoControlState],
  );

  const handleVideoLoadedMetadata = useCallback(
    (id: string, target: HTMLVideoElement) => {
      const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : 0;
      setVideoControlState(id, { duration });
    },
    [setVideoControlState],
  );

  const handleVideoScrub = useCallback(
    (id: string, percent: number) => {
      const node = videoRefs.current[id];
      if (!node || !Number.isFinite(node.duration) || node.duration <= 0) return;
      const newTime = Math.max(0, Math.min(node.duration, (percent / 100) * node.duration));
      node.currentTime = newTime;
      setVideoControlState(id, { progress: newTime, duration: node.duration });
    },
    [setVideoControlState],
  );

  const setVideoRef = useCallback(
    (id: string, node: HTMLVideoElement | null) => {
      if (!node) {
        delete videoRefs.current[id];
        return;
      }
      videoRefs.current[id] = node;
      node.controls = false;
      node.playsInline = true;
      node.preload = 'metadata';
      const state = videoControlsRef.current[id] ?? defaultVideoControlState;
      node.loop = state.loop;
      node.muted = state.isMuted;
    },
    [],
  );

  const removeVideoAttachment = useCallback((id: string) => {
    const node = videoRefs.current[id];
    if (node) {
      try { node.pause?.(); } catch {}
      delete videoRefs.current[id];
    }
    setVideoControls((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(videoRefs.current).forEach((node) => {
        try { node?.pause?.(); } catch {}
      });
      videoRefs.current = {};
    };
  }, []);

  const formatTime = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const handleRemoveVideoAnnotation = useCallback(
    (id: string) => {
      removeVideoAttachment(id);
      setSelectedAnnotationIds((prev) => prev.filter((selected) => selected !== id));
      onDeleteAnnotations([id]);
    },
    [removeVideoAttachment, onDeleteAnnotations, setSelectedAnnotationIds],
  );

  // Handle keyboard events for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLTextAreaElement) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationIds.length > 0) {
            e.preventDefault();
            selectedAnnotationIds.forEach(removeVideoAttachment);
            onDeleteAnnotations(selectedAnnotationIds);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationIds, onDeleteAnnotations, removeVideoAttachment]);
  
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
              setRedrawTick((tick) => tick + 1); // Force a re-render once the image is ready
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
            const fillStyle = resolveFillStyle(rectAnno.color, rectAnno.fillOpacity);
            if (rectAnno.center && rectAnno.width != null && rectAnno.height != null) {
                const center = geo.normalizedToCanvas(rectAnno.center, renderedRect);
                const width = rectAnno.width * renderedRect.width;
                const height = rectAnno.height * renderedRect.height;
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(rectAnno.rotation || 0);
                ctx.beginPath();
                ctx.rect(-width / 2, -height / 2, width, height);
                if (fillStyle) {
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                }
                ctx.stroke();
                ctx.restore();
            } else if (rectAnno.start && rectAnno.end) {
                const start = geo.normalizedToCanvas(rectAnno.start, renderedRect);
                const end = geo.normalizedToCanvas(rectAnno.end, renderedRect);
                ctx.beginPath();
                ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
                if (fillStyle) {
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                }
                ctx.stroke();
            }
            break;
        }
        case AnnotationTool.ELLIPSE: {
            const ellipseAnno = anno as EllipseAnnotation & { start?: Point, end?: Point };
            const fillStyle = resolveFillStyle(ellipseAnno.color, ellipseAnno.fillOpacity);
            if (ellipseAnno.center && ellipseAnno.width != null && ellipseAnno.height != null) {
                const center = geo.normalizedToCanvas(ellipseAnno.center, renderedRect);
                const radiusX = (ellipseAnno.width * renderedRect.width) / 2;
                const radiusY = (ellipseAnno.height * renderedRect.height) / 2;
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(ellipseAnno.rotation || 0);
                ctx.beginPath();
                ctx.ellipse(0, 0, Math.abs(radiusX), Math.abs(radiusY), 0, 0, 2 * Math.PI);
                if (fillStyle) {
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                }
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
                if (fillStyle) {
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                }
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
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.setLineDash([]);
    }

  }, [annotationsToDraw, drawingShape, containerRect, renderedRect, activeTool, marquee, selectedAnnotations, transformedAnnotations, redrawTick]);
  
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
    e.preventDefault();

    // Always treat as dragging after threshold; compute canvas deltas
    const startCanvas = geo.normalizedToCanvas(movingCommentState.startPoint, renderedRect);
    const baseC = geo.normalizedToCanvas(movingCommentState.comment.position, renderedRect);
    const deltaC = { x: pos.canvas.x - startCanvas.x, y: pos.canvas.y - startCanvas.y };
    let nextCenterC = { x: baseC.x + deltaC.x, y: baseC.y + deltaC.y };

    // Build alignment targets
    const verticalTargets: Array<{ position: number; start: number; end: number }> = [];
    const horizontalTargets: Array<{ position: number; start: number; end: number }> = [];

    // Other comments (centers)
    commentsOnFrame
      .filter((c) => c.id !== movingCommentState.comment.id)
      .forEach((c) => {
        if (!c.position) return;
        const pc = geo.normalizedToCanvas(c.position, renderedRect);
        verticalTargets.push({ position: pc.x, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
        horizontalTargets.push({ position: pc.y, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
      });

    // Annotation edges/centers
    const scaleY = renderedRect.height > 0 ? renderedRect.height / renderedRect.height : 1;
    annotationsForFrame.forEach((annotation) => {
      const box = geo.getAnnotationBoundingBox(annotation, renderedRect, scaleY);
      if (!box) return;
      const metrics = {
        left: box.start.x,
        right: box.end.x,
        centerX: (box.start.x + box.end.x) / 2,
        top: box.start.y,
        bottom: box.end.y,
        centerY: (box.start.y + box.end.y) / 2,
      };
      verticalTargets.push({ position: metrics.left, start: box.start.y, end: box.end.y });
      verticalTargets.push({ position: metrics.centerX, start: box.start.y, end: box.end.y });
      verticalTargets.push({ position: metrics.right, start: box.start.y, end: box.end.y });
      horizontalTargets.push({ position: metrics.top, start: box.start.x, end: box.end.x });
      horizontalTargets.push({ position: metrics.centerY, start: box.start.x, end: box.end.x });
      horizontalTargets.push({ position: metrics.bottom, start: box.start.x, end: box.end.x });
    });

    // Container guides
    verticalTargets.push({ position: renderedRect.x, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
    verticalTargets.push({ position: renderedRect.x + renderedRect.width / 2, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
    verticalTargets.push({ position: renderedRect.x + renderedRect.width, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
    horizontalTargets.push({ position: renderedRect.y, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
    horizontalTargets.push({ position: renderedRect.y + renderedRect.height / 2, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
    horizontalTargets.push({ position: renderedRect.y + renderedRect.height, start: renderedRect.x, end: renderedRect.x + renderedRect.width });

    // Snap to nearest target
    let bestVX: { diff: number; guide: AlignmentGuide } | null = null;
    verticalTargets.forEach((t) => {
      const diff = t.position - nextCenterC.x;
      if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestVX || Math.abs(diff) < Math.abs(bestVX.diff))) {
        bestVX = { diff, guide: { orientation: 'vertical', position: t.position, start: t.start, end: t.end } };
      }
    });
    let bestHY: { diff: number; guide: AlignmentGuide } | null = null;
    horizontalTargets.forEach((t) => {
      const diff = t.position - nextCenterC.y;
      if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestHY || Math.abs(diff) < Math.abs(bestHY.diff))) {
        bestHY = { diff, guide: { orientation: 'horizontal', position: t.position, start: t.start, end: t.end } };
      }
    });

    let guides: AlignmentGuide[] = [];
    if (bestVX) { nextCenterC = { ...nextCenterC, x: nextCenterC.x + bestVX.diff }; guides.push(bestVX.guide); }
    if (bestHY) { nextCenterC = { ...nextCenterC, y: nextCenterC.y + bestHY.diff }; guides.push(bestHY.guide); }

    // Equal spacing: horizontal & vertical fra bubble
    const Y_TOL = 10, X_TOL = 10;
    const centers = commentsOnFrame
      .filter((c) => c.id !== movingCommentState.comment.id && c.position)
      .map((c) => geo.normalizedToCanvas(c.position!, renderedRect));

    // Horizontal
    const sortedX = centers.slice().sort((a, b) => a.x - b.x);
    if (sortedX.length >= 2) {
      const left = [...sortedX].filter((c) => c.x <= nextCenterC.x && Math.abs(c.y - nextCenterC.y) <= Y_TOL).pop();
      const right = sortedX.find((c) => c.x >= nextCenterC.x && Math.abs(c.y - nextCenterC.y) <= Y_TOL);
      if (left && right) {
        const desiredX = (left.x + right.x) / 2;
        const diff = desiredX - nextCenterC.x;
        if (Math.abs(diff) <= SNAP_THRESHOLD) {
          nextCenterC = { ...nextCenterC, x: desiredX };
          const measureY = clamp(Math.min(left.y, nextCenterC.y) - 24, renderedRect.y + 6, renderedRect.y + renderedRect.height - 6);
          guides.push({
            orientation: 'vertical', position: desiredX, start: renderedRect.y, end: renderedRect.y + renderedRect.height,
            spacing: { axis: 'horizontal', from: { x: left.x, y: measureY }, to: { x: nextCenterC.x, y: measureY }, label: `${Math.abs(Math.round(nextCenterC.x - left.x))} px` }
          });
        }
      }
    }
    // Vertical
    const sortedY = centers.slice().sort((a, b) => a.y - b.y);
    if (sortedY.length >= 2) {
      const top = [...sortedY].filter((c) => c.y <= nextCenterC.y && Math.abs(c.x - nextCenterC.x) <= X_TOL).pop();
      const bottom = sortedY.find((c) => c.y >= nextCenterC.y && Math.abs(c.x - nextCenterC.x) <= X_TOL);
      if (top && bottom) {
        const desiredY = (top.y + bottom.y) / 2;
        const diff = desiredY - nextCenterC.y;
        if (Math.abs(diff) <= SNAP_THRESHOLD) {
          nextCenterC = { ...nextCenterC, y: desiredY };
          const measureX = clamp(nextCenterC.x + 24, renderedRect.x + 6, renderedRect.x + renderedRect.width - 6);
          guides.push({
            orientation: 'horizontal', position: desiredY, start: renderedRect.x, end: renderedRect.x + renderedRect.width,
            spacing: { axis: 'vertical', from: { x: measureX, y: top.y }, to: { x: measureX, y: nextCenterC.y }, label: `${Math.abs(Math.round(nextCenterC.y - top.y))} px` }
          });
        }
      }
    }

    setAlignmentGuides(guides);
    const nextNorm = geo.canvasToNormalized(nextCenterC, renderedRect);
    setTransformedComment({ ...(transformedComment ?? movingCommentState.comment), position: nextNorm });
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
            setTransform(geo.startTransform(handle, pos.canvas, selectedAnnotations, renderedRect, { preserveAspectRatio: e.shiftKey }));
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
        const fillOpacity = shapeFillEnabled ? clamp(shapeFillOpacity, 0, 1) : 0;
        switch (activeTool) {
            case AnnotationTool.FREEHAND:
                setDrawingShape({ ...baseAnno, type: AnnotationTool.FREEHAND, points: [pos.normalized] });
                break;
            case AnnotationTool.RECTANGLE:
            case AnnotationTool.ELLIPSE:
                setDrawingShape({ ...baseAnno, type: activeTool, start: pos.normalized, end: pos.normalized, rotation: 0, fillOpacity });
                break;
            case AnnotationTool.ARROW:
                setDrawingShape({ ...baseAnno, type: activeTool, start: pos.normalized, end: pos.normalized });
                break;
        }
    }
  };
  
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingText || pendingComment) {
      if (hoveredVideoId !== null) setHoveredVideoId(null);
      return;
    }
    if (!e.buttons) {
      if (isDrawing || marquee || transform || movingCommentState) {
        handlePointerUp();
        if (hoveredVideoId !== null) setHoveredVideoId(null);
      } else {
        const idlePos = getPointerPosition(e);
        if (!idlePos || !renderedRect) {
          if (hoveredVideoId !== null) setHoveredVideoId(null);
        } else {
          const hit = [...videoAnnotationsToRender].reverse().find(
            (anno) => geo.isPointInAnnotation(idlePos.normalized, anno, renderedRect, video.height / renderedRect.height)
          );
          const nextId = hit?.id ?? null;
          if (nextId !== hoveredVideoId) setHoveredVideoId(nextId);
        }
      }
      return;
    }

    const pos = getPointerPosition(e);
    if (!pos || !renderedRect) {
      if (hoveredVideoId !== null) setHoveredVideoId(null);
      return;
    }

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
      // Compute proposed center in canvas space
      const base = movingCommentState.comment.position;
      const baseC = geo.normalizedToCanvas(base, renderedRect);
      const deltaC = {
        x: (pos.canvas.x - geo.normalizedToCanvas(movingCommentState.startPoint, renderedRect).x),
        y: (pos.canvas.y - geo.normalizedToCanvas(movingCommentState.startPoint, renderedRect).y),
      };
      let nextCenterC = { x: baseC.x + deltaC.x, y: baseC.y + deltaC.y };

      // Build alignment targets from other comments and annotation boxes
      const verticalTargets: Array<{ position: number; start: number; end: number }> = [];
      const horizontalTargets: Array<{ position: number; start: number; end: number }> = [];

      // Other comments (centers)
      commentsOnFrame
        .filter((c) => c.id !== movingCommentState.comment.id)
        .forEach((c) => {
          const pc = geo.normalizedToCanvas(c.position!, renderedRect);
          verticalTargets.push({ position: pc.x, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
          horizontalTargets.push({ position: pc.y, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
        });

      // Annotation edges/centers
      const scaleY = renderedRect.height > 0 ? renderedRect.height / renderedRect.height : 1;
      annotationsForFrame.forEach((annotation) => {
        const box = geo.getAnnotationBoundingBox(annotation, renderedRect, scaleY);
        if (!box) return;
        const metrics = {
          left: box.start.x,
          right: box.end.x,
          centerX: (box.start.x + box.end.x) / 2,
          top: box.start.y,
          bottom: box.end.y,
          centerY: (box.start.y + box.end.y) / 2,
        };
        verticalTargets.push({ position: metrics.left, start: box.start.y, end: box.end.y });
        verticalTargets.push({ position: metrics.centerX, start: box.start.y, end: box.end.y });
        verticalTargets.push({ position: metrics.right, start: box.start.y, end: box.end.y });
        horizontalTargets.push({ position: metrics.top, start: box.start.x, end: box.end.x });
        horizontalTargets.push({ position: metrics.centerY, start: box.start.x, end: box.end.x });
        horizontalTargets.push({ position: metrics.bottom, start: box.start.x, end: box.end.x });
      });

      // Container guides
      verticalTargets.push({ position: renderedRect.x, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
      verticalTargets.push({ position: renderedRect.x + renderedRect.width / 2, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
      verticalTargets.push({ position: renderedRect.x + renderedRect.width, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
      horizontalTargets.push({ position: renderedRect.y, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
      horizontalTargets.push({ position: renderedRect.y + renderedRect.height / 2, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
      horizontalTargets.push({ position: renderedRect.y + renderedRect.height, start: renderedRect.x, end: renderedRect.x + renderedRect.width });

      // Snap to nearest target within threshold
      let bestVX: { diff: number; guide: AlignmentGuide } | null = null;
      verticalTargets.forEach((t) => {
        const diff = t.position - nextCenterC.x;
        if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestVX || Math.abs(diff) < Math.abs(bestVX.diff))) {
          bestVX = { diff, guide: { orientation: 'vertical', position: t.position, start: t.start, end: t.end } };
        }
      });
      let bestHY: { diff: number; guide: AlignmentGuide } | null = null;
      horizontalTargets.forEach((t) => {
        const diff = t.position - nextCenterC.y;
        if (Math.abs(diff) <= SNAP_THRESHOLD && (!bestHY || Math.abs(diff) < Math.abs(bestHY.diff))) {
          bestHY = { diff, guide: { orientation: 'horizontal', position: t.position, start: t.start, end: t.end } };
        }
      });

      let guides: AlignmentGuide[] = [];
      if (bestVX) { nextCenterC = { ...nextCenterC, x: nextCenterC.x + bestVX.diff }; guides.push(bestVX.guide); }
      if (bestHY) { nextCenterC = { ...nextCenterC, y: nextCenterC.y + bestHY.diff }; guides.push(bestHY.guide); }

      // Equal spacing for comments (horizontal)
      const Y_TOL = 10; // px tolerance to consider same row
      const centers = commentsOnFrame
        .filter((c) => c.id !== movingCommentState.comment.id)
        .map((c) => geo.normalizedToCanvas(c.position!, renderedRect))
        .sort((a, b) => a.x - b.x);
      if (centers.length >= 2) {
        // Find immediate left & right neighbors by x
        const left = [...centers].filter((c) => c.x <= nextCenterC.x && Math.abs(c.y - nextCenterC.y) <= Y_TOL).pop();
        const right = centers.find((c) => c.x >= nextCenterC.x && Math.abs(c.y - nextCenterC.y) <= Y_TOL);
        if (left && right) {
          const desiredX = (left.x + right.x) / 2;
          const diff = desiredX - nextCenterC.x;
          if (Math.abs(diff) <= SNAP_THRESHOLD) {
            nextCenterC = { ...nextCenterC, x: desiredX };
            const measureY = clamp(Math.min(left.y, nextCenterC.y) - 24, renderedRect.y + 6, renderedRect.y + renderedRect.height - 6);
            guides.push({
              orientation: 'vertical',
              position: desiredX,
              start: renderedRect.y,
              end: renderedRect.y + renderedRect.height,
              spacing: {
                axis: 'horizontal',
                from: { x: left.x, y: measureY },
                to: { x: nextCenterC.x, y: measureY },
                label: `${Math.abs(Math.round(nextCenterC.x - left.x))} px`,
              },
            });
          }
        }
      }
      // Equal spacing for comments (vertical)
      const X_TOL = 10;
      const centersY = commentsOnFrame
        .filter((c) => c.id !== movingCommentState.comment.id)
        .map((c) => geo.normalizedToCanvas(c.position!, renderedRect))
        .sort((a, b) => a.y - b.y);
      if (centersY.length >= 2) {
        const top = [...centersY].filter((c) => c.y <= nextCenterC.y && Math.abs(c.x - nextCenterC.x) <= X_TOL).pop();
        const bottom = centersY.find((c) => c.y >= nextCenterC.y && Math.abs(c.x - nextCenterC.x) <= X_TOL);
        if (top && bottom) {
          const desiredY = (top.y + bottom.y) / 2;
          const diff = desiredY - nextCenterC.y;
          if (Math.abs(diff) <= SNAP_THRESHOLD) {
            nextCenterC = { ...nextCenterC, y: desiredY };
            const measureX = clamp(nextCenterC.x + 24, renderedRect.x + 6, renderedRect.x + renderedRect.width - 6);
            guides.push({
              orientation: 'horizontal',
              position: desiredY,
              start: renderedRect.x,
              end: renderedRect.x + renderedRect.width,
              spacing: {
                axis: 'vertical',
                from: { x: measureX, y: top.y },
                to: { x: measureX, y: nextCenterC.y },
                label: `${Math.abs(Math.round(nextCenterC.y - top.y))} px`,
              },
            });
          }
        }
      }
      setAlignmentGuides(guides);

      const nextNorm = geo.canvasToNormalized(nextCenterC, renderedRect);
      setTransformedComment({
        ...transformedComment,
        position: nextNorm,
      });
      return;
    }

    if (transform) {
        let workingTransform = transform;
        const isScaleHandle = transform.action.startsWith('scale');
        if (isScaleHandle && transform.preserveAspectRatio !== e.shiftKey) {
            workingTransform = { ...transform, preserveAspectRatio: e.shiftKey };
            setTransform(workingTransform);
        }
        const updatedAnnotations = geo.applyTransform(pos.canvas, workingTransform, renderedRect);
        if (workingTransform.action === 'move') {
            const { dx, dy, guides } = computeAlignmentSnap(updatedAnnotations);
            if (dx !== 0 || dy !== 0) {
                const adjusted = updatedAnnotations.map((annotation) => translateAnnotation(annotation, dx, dy));
                setTransformedAnnotations(adjusted);
            } else {
                setTransformedAnnotations(updatedAnnotations);
            }
            setAlignmentGuides(guides);
        } else {
            setAlignmentGuides([]);
            setTransformedAnnotations(updatedAnnotations);
        }
        return;
    }

    if (marquee) {
        setMarquee({ ...marquee, end: pos.normalized });
        return;
    }

    if (!isDrawing || !drawingShape) {
      const hit = [...videoAnnotationsToRender].reverse().find(
        (anno) => geo.isPointInAnnotation(pos.normalized, anno, renderedRect, video.height / renderedRect.height)
      );
      const nextId = hit?.id ?? null;
      if (nextId !== hoveredVideoId) setHoveredVideoId(nextId);
      return;
    }

    setDrawingShape(prev => {
      if (!prev) return null;
      switch(prev.type) {
        case AnnotationTool.FREEHAND: {
          const last = (prev.points || [pos.normalized])[ (prev.points?.length || 1) - 1 ];
          let next = pos.normalized;
          if (e.shiftKey && last) {
            const dx = pos.normalized.x - last.x;
            const dy = pos.normalized.y - last.y;
            if (Math.abs(dx) >= Math.abs(dy)) {
              next = { x: pos.normalized.x, y: last.y };
            } else {
              next = { x: last.x, y: pos.normalized.y };
            }
          }
          return { ...prev, points: [...(prev.points || []), next] };
        }
        case AnnotationTool.RECTANGLE:
        case AnnotationTool.ELLIPSE: {
          if ((prev as any).start && e.shiftKey && renderedRect) {
            // Enforce perfect square/circle in canvas pixel space
            const startN = (prev as any).start as Point;
            const startC = geo.normalizedToCanvas(startN, renderedRect);
            const dxC = pos.canvas.x - startC.x;
            const dyC = pos.canvas.y - startC.y;
            const sizeC = Math.max(Math.abs(dxC), Math.abs(dyC));
            const endC = {
              x: startC.x + (dxC === 0 ? sizeC : Math.sign(dxC) * sizeC),
              y: startC.y + (dyC === 0 ? sizeC : Math.sign(dyC) * sizeC),
            };
            const end = geo.canvasToNormalized(endC, renderedRect);
            return { ...prev, end };
          }
          return { ...prev, end: pos.normalized };
        }
        case AnnotationTool.ARROW: {
          if ((prev as any).start && e.shiftKey && renderedRect) {
            const startN = (prev as any).start as Point;
            const startC = geo.normalizedToCanvas(startN, renderedRect);
            const endC = pos.canvas;
            const vx = endC.x - startC.x;
            const vy = endC.y - startC.y;
            const len = Math.max(1, Math.hypot(vx, vy));
            const angle = Math.atan2(vy, vx);
            const snap = Math.PI / 4; // 45 degrees
            const snapped = Math.round(angle / snap) * snap;
            const snappedEndC = { x: startC.x + len * Math.cos(snapped), y: startC.y + len * Math.sin(snapped) };
            const end = geo.canvasToNormalized(snappedEndC, renderedRect);
            return { ...prev, end };
          }
          return { ...prev, end: pos.normalized };
        }
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
    setHoveredVideoId(null);
    setAlignmentGuides([]);
  };

  const handleControlsPointerEnter = useCallback((id: string) => {
    setHoveredVideoId(id);
  }, []);

  const handleControlsPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, id: string) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }
      if (hoveredVideoId === id) {
        setHoveredVideoId(null);
      }
    },
    [hoveredVideoId],
  );
  
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

  const translateAnnotation = useCallback((annotation: Annotation, dx: number, dy: number): Annotation => {
    switch (annotation.type) {
      case AnnotationTool.RECTANGLE:
      case AnnotationTool.ELLIPSE:
      case AnnotationTool.IMAGE:
      case AnnotationTool.VIDEO: {
        const typed = annotation as RectangleAnnotation | EllipseAnnotation | ImageAnnotation | VideoAnnotation;
        if (!typed.center) return annotation;
        return {
          ...typed,
          center: {
            x: typed.center.x + dx,
            y: typed.center.y + dy,
          },
        };
      }
      case AnnotationTool.ARROW: {
        const typed = annotation as ArrowAnnotation;
        return {
          ...typed,
          start: { x: typed.start.x + dx, y: typed.start.y + dy },
          end: { x: typed.end.x + dx, y: typed.end.y + dy },
        };
      }
      case AnnotationTool.FREEHAND: {
        const typed = annotation as FreehandAnnotation;
        return {
          ...typed,
          points: typed.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        };
      }
      case AnnotationTool.TEXT: {
        const typed = annotation as TextAnnotation;
        if (!typed.position) return annotation;
        return {
          ...typed,
          position: { x: typed.position.x + dx, y: typed.position.y + dy },
        };
      }
      default:
        return annotation;
    }
  }, []);

  const computeAlignmentSnap = useCallback(
    (movedAnnotations: Annotation[]): { dx: number; dy: number; guides: AlignmentGuide[] } => {
      if (!renderedRect) return { dx: 0, dy: 0, guides: [] };
      const scaleY = video.height > 0 && renderedRect.height > 0 ? video.height / renderedRect.height : 1;
      const movingBox = geo.getAnnotationsBoundingBox(movedAnnotations, renderedRect, scaleY);
      if (!movingBox) return { dx: 0, dy: 0, guides: [] };

      const movingMetrics = {
        left: movingBox.start.x,
        right: movingBox.end.x,
        centerX: (movingBox.start.x + movingBox.end.x) / 2,
        top: movingBox.start.y,
        bottom: movingBox.end.y,
        centerY: (movingBox.start.y + movingBox.end.y) / 2,
      };

      const verticalTargets: Array<{ position: number; start: number; end: number }> = [];
      const horizontalTargets: Array<{ position: number; start: number; end: number }> = [];

      const others = annotationsForFrame.filter((annotation) => !selectedAnnotationIds.includes(annotation.id));
      others.forEach((annotation) => {
        const box = geo.getAnnotationBoundingBox(annotation, renderedRect, scaleY);
        if (!box) return;
        const metrics = {
          left: box.start.x,
          right: box.end.x,
          centerX: (box.start.x + box.end.x) / 2,
          top: box.start.y,
          bottom: box.end.y,
          centerY: (box.start.y + box.end.y) / 2,
        };
        verticalTargets.push({ position: metrics.left, start: box.start.y, end: box.end.y });
        verticalTargets.push({ position: metrics.centerX, start: box.start.y, end: box.end.y });
        verticalTargets.push({ position: metrics.right, start: box.start.y, end: box.end.y });
        horizontalTargets.push({ position: metrics.top, start: box.start.x, end: box.end.x });
        horizontalTargets.push({ position: metrics.centerY, start: box.start.x, end: box.end.x });
        horizontalTargets.push({ position: metrics.bottom, start: box.start.x, end: box.end.x });
      });

      // Container guides
      verticalTargets.push({ position: renderedRect.x, start: renderedRect.y, end: renderedRect.y + renderedRect.height });
      verticalTargets.push({
        position: renderedRect.x + renderedRect.width / 2,
        start: renderedRect.y,
        end: renderedRect.y + renderedRect.height,
      });
      verticalTargets.push({
        position: renderedRect.x + renderedRect.width,
        start: renderedRect.y,
        end: renderedRect.y + renderedRect.height,
      });

      horizontalTargets.push({ position: renderedRect.y, start: renderedRect.x, end: renderedRect.x + renderedRect.width });
      horizontalTargets.push({
        position: renderedRect.y + renderedRect.height / 2,
        start: renderedRect.x,
        end: renderedRect.x + renderedRect.width,
      });
      horizontalTargets.push({
        position: renderedRect.y + renderedRect.height,
        start: renderedRect.x,
        end: renderedRect.x + renderedRect.width,
      });

      const movingVerticalLines = [
        { position: movingMetrics.left, start: movingBox.start.y, end: movingBox.end.y },
        { position: movingMetrics.centerX, start: movingBox.start.y, end: movingBox.end.y },
        { position: movingMetrics.right, start: movingBox.start.y, end: movingBox.end.y },
      ];

      const movingHorizontalLines = [
        { position: movingMetrics.top, start: movingBox.start.x, end: movingBox.end.x },
        { position: movingMetrics.centerY, start: movingBox.start.x, end: movingBox.end.x },
        { position: movingMetrics.bottom, start: movingBox.start.x, end: movingBox.end.x },
      ];

      let bestVerticalShift: number | null = null;
      let bestVerticalGuide: AlignmentGuide | null = null;
      verticalTargets.forEach((target) => {
        movingVerticalLines.forEach((line) => {
          const diff = target.position - line.position;
          if (Math.abs(diff) <= SNAP_THRESHOLD && (bestVerticalShift === null || Math.abs(diff) < Math.abs(bestVerticalShift))) {
            bestVerticalShift = diff;
            const start = Math.min(line.start, target.start);
            const end = Math.max(line.end, target.end);
            bestVerticalGuide = { orientation: 'vertical', position: target.position, start, end };
          }
        });
      });

      let bestHorizontalShift: number | null = null;
      let bestHorizontalGuide: AlignmentGuide | null = null;
      horizontalTargets.forEach((target) => {
        movingHorizontalLines.forEach((line) => {
          const diff = target.position - line.position;
          if (Math.abs(diff) <= SNAP_THRESHOLD && (bestHorizontalShift === null || Math.abs(diff) < Math.abs(bestHorizontalShift))) {
            bestHorizontalShift = diff;
            const start = Math.min(line.start, target.start);
            const end = Math.max(line.end, target.end);
            bestHorizontalGuide = { orientation: 'horizontal', position: target.position, start, end };
          }
        });
      });

      let guides: AlignmentGuide[] = [];
      let dx = 0;
      let dy = 0;

      if (bestVerticalShift !== null && renderedRect.width > 0) {
        dx = bestVerticalShift / renderedRect.width;
        if (bestVerticalGuide) guides.push(bestVerticalGuide);
      }

      if (bestHorizontalShift !== null && renderedRect.height > 0) {
        dy = bestHorizontalShift / renderedRect.height;
        if (bestHorizontalGuide) guides.push(bestHorizontalGuide);
      }

      // Equal spacing for annotations (horizontal)
      if (movingBox) {
        const othersBoxes = annotationsForFrame
          .filter((a) => !selectedAnnotationIds.includes(a.id))
          .map((a) => geo.getAnnotationBoundingBox(a, renderedRect, scaleY))
          .filter((b): b is geo.BoundingBox => Boolean(b));

        const overlapY = (b: geo.BoundingBox) => Math.min(movingBox.end.y, b.end.y) - Math.max(movingBox.start.y, b.start.y);
        const minOverlapY = Math.max(0, (movingBox.end.y - movingBox.start.y) * 0.3);
        const leftNeighbor = othersBoxes
          .filter(b => b.end.x <= movingBox.start.x && overlapY(b) >= minOverlapY)
          .sort((a, b) => b.end.x - a.end.x)[0];
        const rightNeighbor = othersBoxes
          .filter(b => b.start.x >= movingBox.end.x && overlapY(b) >= minOverlapY)
          .sort((a, b) => a.start.x - b.start.x)[0];
        if (leftNeighbor && rightNeighbor) {
          const leftEdge = leftNeighbor.end.x;
          const rightEdge = rightNeighbor.start.x;
          const width = movingBox.end.x - movingBox.start.x;
          const desiredLeft = leftEdge + (rightEdge - leftEdge - width) / 2;
          const desiredCenterX = desiredLeft + width / 2;
          const diffCanvasX = desiredCenterX - movingMetrics.centerX;
          if (Math.abs(diffCanvasX) <= SNAP_THRESHOLD && renderedRect.width > 0) {
            dx = diffCanvasX / renderedRect.width;
            const measureY = clamp(movingBox.start.y - 20, renderedRect.y + 6, renderedRect.y + renderedRect.height - 6);
            guides.push({
              orientation: 'vertical',
              position: desiredCenterX,
              start: renderedRect.y,
              end: renderedRect.y + renderedRect.height,
              spacing: {
                axis: 'horizontal',
                from: { x: leftEdge, y: measureY },
                to: { x: desiredLeft, y: measureY },
                label: `${Math.abs(Math.round(desiredLeft - leftEdge))} px`,
              },
            });
          }
        }

        // Equal spacing for annotations (vertical)
        const overlapX = (b: geo.BoundingBox) => Math.min(movingBox.end.x, b.end.x) - Math.max(movingBox.start.x, b.start.x);
        const minOverlapX = Math.max(0, (movingBox.end.x - movingBox.start.x) * 0.3);
        const topNeighbor = othersBoxes
          .filter(b => b.end.y <= movingBox.start.y && overlapX(b) >= minOverlapX)
          .sort((a, b) => b.end.y - a.end.y)[0];
        const bottomNeighbor = othersBoxes
          .filter(b => b.start.y >= movingBox.end.y && overlapX(b) >= minOverlapX)
          .sort((a, b) => a.start.y - b.start.y)[0];
        if (topNeighbor && bottomNeighbor) {
          const topEdge = topNeighbor.end.y;
          const bottomEdge = bottomNeighbor.start.y;
          const height = movingBox.end.y - movingBox.start.y;
          const desiredTop = topEdge + (bottomEdge - topEdge - height) / 2;
          const desiredCenterY = desiredTop + height / 2;
          const diffCanvasY = desiredCenterY - movingMetrics.centerY;
          if (Math.abs(diffCanvasY) <= SNAP_THRESHOLD && renderedRect.height > 0) {
            dy = diffCanvasY / renderedRect.height;
            const measureX = clamp(movingBox.start.x - 24, renderedRect.x + 6, renderedRect.x + renderedRect.width - 6);
            guides.push({
              orientation: 'horizontal',
              position: desiredCenterY,
              start: renderedRect.x,
              end: renderedRect.x + renderedRect.width,
              spacing: {
                axis: 'vertical',
                from: { x: measureX, y: topEdge },
                to: { x: measureX, y: desiredTop },
                label: `${Math.abs(Math.round(desiredTop - topEdge))} px`,
              },
            });
          }
        }
      }

      return { dx, dy, guides };
    },
    [annotationsForFrame, selectedAnnotationIds, renderedRect, video.height],
  );

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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    if (assetUploadProgress !== null) {
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) return;

    const pos = getPointerPosition(e);
    if (!pos) return;

    const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';

    setAssetUploadError(null);
    setAssetUploadLabel(kind === 'image' ? 'Uploading image…' : 'Uploading video…');
    setAssetUploadProgress(0);

    try {
      const asset = await onUploadAsset(file, kind, (progress) => {
        setAssetUploadProgress(Math.max(0, Math.min(100, Math.round(progress))));
      });

      const aspectRatio = asset.width && asset.height ? asset.width / asset.height : 1;
      const baseWidth = kind === 'image' ? 0.2 : 0.25;
      const widthNormalized = Math.min(Math.max(baseWidth, 0.05), 0.9);
      const computedHeight = (widthNormalized / Math.max(aspectRatio, 0.01)) * (video.width / Math.max(video.height, 1));
      const heightNormalized = Math.min(Math.max(computedHeight, 0.05), 0.9);

      if (kind === 'image') {
        const newAnnotation: Omit<ImageAnnotation, 'id' | 'videoId' | 'authorId' | 'createdAt'> = {
          type: AnnotationTool.IMAGE,
          frame: currentFrame,
          src: asset.src,
          storageKey: asset.storageKey,
          byteSize: asset.byteSize,
          mimeType: asset.mimeType,
          originalWidth: asset.originalWidth,
          originalHeight: asset.originalHeight,
          center: pos.normalized,
          width: widthNormalized,
          height: heightNormalized,
          rotation: 0,
          color: 'transparent',
          lineWidth: 0,
        };
        onAddAnnotation(newAnnotation);
      } else {
        const newAnnotation: Omit<VideoAnnotation, 'id' | 'videoId' | 'authorId' | 'createdAt'> = {
          type: AnnotationTool.VIDEO,
          frame: currentFrame,
          src: asset.src,
          storageKey: asset.storageKey,
          byteSize: asset.byteSize,
          mimeType: asset.mimeType,
          originalWidth: asset.originalWidth,
          originalHeight: asset.originalHeight,
          duration: asset.duration,
          center: pos.normalized,
          width: widthNormalized,
          height: heightNormalized,
          rotation: 0,
          color: 'transparent',
          lineWidth: 0,
        };
        onAddAnnotation(newAnnotation);
      }
    } catch (error) {
      console.error('Failed to upload annotation asset', error);
      const message = error instanceof Error ? error.message : 'Unable to upload media';
      setAssetUploadError(message);
      setTimeout(() => setAssetUploadError(null), 5000);
    } finally {
      setAssetUploadProgress(null);
      setAssetUploadLabel(null);
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

      {renderedRect && videoAnnotationsToRender.length > 0 && (
        <>
          <div className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
            {videoAnnotationsToRender.map((videoAnno) => {
              if (!videoAnno.center || videoAnno.width == null || videoAnno.height == null) return null;
              const center = geo.normalizedToCanvas(videoAnno.center, renderedRect);
              const widthPx = videoAnno.width * renderedRect.width;
              const heightPx = videoAnno.height * renderedRect.height;
              const cssTransform = `translate(-50%, -50%) rotate(${videoAnno.rotation || 0}rad)`;
              const resolvedSrc = videoAnno.src;
              const isSelected = selectedAnnotationIds.includes(videoAnno.id);
              const videoState = videoControls[videoAnno.id] ?? defaultVideoControlState;
              const progressPercent = videoState.duration > 0
                ? Math.min(100, Math.max(0, (videoState.progress / videoState.duration) * 100))
                : 0;
              const currentTimeLabel = formatTime(videoState.progress);
              const durationLabel = formatTime(videoState.duration || 0);
              const removeClass = isDark
                ? 'rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-black/80'
                : 'rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-800 shadow hover:bg-white';
              const durationClass = isDark
                ? 'rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow'
                : 'rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-800 shadow';
              // Use transform state (annotation transform), not CSS transform string
              const interactionsActive = Boolean(transform || isDrawing || marquee || movingCommentState);
              const showControls = hoveredVideoId === videoAnno.id && !interactionsActive;
              const controlsCompact = widthPx < 260;
              const controlGap = controlsCompact ? 'gap-2' : 'gap-3';
              const controlPx = controlsCompact ? 'px-2.5' : 'px-3';
              const controlPy = controlsCompact ? 'py-1.5' : 'py-2';
              const controlIcon = controlsCompact ? 12 : 14;
              const timeLabelClass = controlsCompact ? 'text-[9px]' : 'text-[10px]';

              return (
                <React.Fragment key={videoAnno.id}>
                  <div
                    className="absolute"
                    style={{
                      left: `${center.x}px`,
                      top: `${center.y}px`,
                      width: `${widthPx}px`,
                      height: `${heightPx}px`,
                      transform: cssTransform,
                      transformOrigin: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <div className="relative h-full w-full pointer-events-none">
                      <video
                        ref={(node) => setVideoRef(videoAnno.id, node)}
                        src={resolvedSrc}
                        muted={videoState.isMuted}
                        playsInline
                        loop={videoState.loop}
                        className={isDark
                          ? 'h-full w-full rounded-xl object-cover shadow-2xl outline outline-2 outline-white/15'
                          : 'h-full w-full rounded-xl object-cover shadow-xl outline outline-2 outline-gray-200 bg-white'}
                        style={{ pointerEvents: 'none' }}
                        onTimeUpdate={(event) => handleVideoTimeUpdate(videoAnno.id, event.currentTarget)}
                        onLoadedMetadata={(event) => handleVideoLoadedMetadata(videoAnno.id, event.currentTarget)}
                        onPlay={() => setVideoControlState(videoAnno.id, { isPlaying: true })}
                        onPause={() => setVideoControlState(videoAnno.id, { isPlaying: false })}
                        onEnded={() => setVideoControlState(videoAnno.id, { isPlaying: false })}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 pointer-events-none">
                          <div className={`absolute inset-0 rounded-xl ${isDark ? 'border border-white/60' : 'border border-gray-700/80'}`} />
                        </div>
                      )}
                      {showControls && (
                        <div className="absolute inset-0 pointer-events-none z-40">
                          <div
                            className="absolute top-2 right-2 flex items-center gap-2 pointer-events-auto"
                            onPointerDown={(evt) => evt.stopPropagation()}
                            onPointerEnter={() => handleControlsPointerEnter(videoAnno.id)}
                            onPointerLeave={(evt) => handleControlsPointerLeave(evt, videoAnno.id)}
                          >
                            <button
                              type="button"
                              onClick={(evt) => {
                                evt.preventDefault();
                                evt.stopPropagation();
                                handleRemoveVideoAnnotation(videoAnno.id);
                              }}
                              className={removeClass}
                            >
                              Remove
                            </button>
                            {Number.isFinite(videoState.duration) && videoState.duration > 0 && (
                              <span className={durationClass}>
                                {durationLabel}
                              </span>
                            )}
                          </div>
                          <div
                            className="absolute bottom-2 left-1/2 w-[min(420px,90%)] -translate-x-1/2 pointer-events-auto"
                            onPointerDown={(evt) => evt.stopPropagation()}
                            onPointerEnter={() => handleControlsPointerEnter(videoAnno.id)}
                            onPointerLeave={(evt) => handleControlsPointerLeave(evt, videoAnno.id)}
                          >
                            <div
                              className={`flex items-center ${controlGap} rounded-full ${controlPx} ${controlPy} shadow-lg ${
                                isDark ? 'bg-black/70 text-white' : 'bg-white/90 text-gray-900 border border-gray-200'
                              } ${controlsCompact ? 'justify-center' : ''}`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleVideoPlay(videoAnno.id)}
                                className={`${
                                  isDark
                                    ? 'rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20'
                                    : 'rounded-full bg-gray-100 p-1.5 text-gray-800 hover:bg-gray-200'
                                } ${controlsCompact ? 'p-1' : ''}`}
                                aria-label={videoState.isPlaying ? 'Pause clip' : 'Play clip'}
                              >
                                {videoState.isPlaying ? <Pause size={controlIcon} /> : <Play size={controlIcon} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleVideoMute(videoAnno.id)}
                                className={`${
                                  isDark
                                    ? 'rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20'
                                    : 'rounded-full bg-gray-100 p-1.5 text-gray-800 hover:bg-gray-200'
                                } ${controlsCompact ? 'p-1' : ''}`}
                                aria-label={videoState.isMuted ? 'Unmute clip' : 'Mute clip'}
                              >
                                {videoState.isMuted ? <VolumeX size={controlIcon} /> : <Volume2 size={controlIcon} />}
                              </button>
                              <button
                                type="button"
                                onPointerDown={(evt) => evt.stopPropagation()}
                                onClick={() => toggleVideoLoop(videoAnno.id)}
                                className={`${
                                  isDark
                                    ? 'rounded-full bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20'
                                    : 'rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-800 hover:bg-gray-200'
                                } ${controlsCompact ? 'text-[10px] px-1.5 py-0.5' : ''}`}
                                aria-label="Toggle loop"
                              >
                                {controlsCompact ? (
                                  <Repeat size={controlIcon} />
                                ) : (
                                  videoState.loop ? 'Loop' : 'No Loop'
                                )}
                              </button>
                              {!controlsCompact && (
                                <>
                                  <div className="flex-1 flex items-center gap-2">
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={progressPercent}
                                      onChange={(evt) => handleVideoScrub(videoAnno.id, Number(evt.target.value))}
                                      onPointerDown={(evt) => evt.stopPropagation()}
                                      className={`w-full ${isDark ? 'accent-white/80' : 'accent-gray-800'}`}
                                    />
                                  </div>
                                  <span className={`${timeLabelClass} font-semibold tabular-nums ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                                    {currentTimeLabel} / {durationLabel}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}

      {isDraggingOver && (
        <div className="absolute inset-0 bg-black/50 border-4 border-dashed border-white rounded-lg flex items-center justify-center pointer-events-none z-50">
          <div className="text-center text-white">
            <UploadCloud size={64} className="mx-auto" />
            <p className="mt-4 text-xl font-semibold">Drop media to upload</p>
          </div>
        </div>
      )}

      {assetUploadProgress !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none z-50">
          <div className="text-center text-white space-y-3">
            <UploadCloud size={48} className="mx-auto" />
            <p className="text-lg font-semibold">{assetUploadLabel ?? 'Uploading asset…'} {assetUploadProgress}%</p>
          </div>
        </div>
      )}

      {assetUploadError && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm shadow-lg z-50 ${isDark ? 'bg-black/80 text-white' : 'bg-white text-gray-900 border border-gray-200'}`}>
          {assetUploadError}
        </div>
      )}

      {renderedRect && alignmentGuides.length > 0 && (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
          {alignmentGuides.map((guide, index) => {
            const key = `guide-${guide.orientation}-${index}`;
            const line = guide.orientation === 'vertical'
              ? (
                <div
                  key={key}
                  className="absolute bg-amber-400/80"
                  style={{
                    left: `${guide.position}px`,
                    top: `${guide.start}px`,
                    width: '1px',
                    height: `${guide.end - guide.start}px`,
                  }}
                />
              ) : (
                <div
                  key={key}
                  className="absolute bg-amber-400/80"
                  style={{
                    top: `${guide.position}px`,
                    left: `${guide.start}px`,
                    height: '1px',
                    width: `${guide.end - guide.start}px`,
                  }}
                />
              );
            return (
              <React.Fragment key={key}>
                {line}
                {guide.spacing && (() => {
                  const spacing = guide.spacing;
                  if (spacing.axis === 'horizontal') {
                    const x = Math.min(spacing.from.x, spacing.to.x);
                    const width = Math.abs(spacing.to.x - spacing.from.x);
                    const y = spacing.from.y;
                    if (width < 2) return null;
                    const labelLeft = x + width / 2;
                    const labelTop = y - 14;
                    return (
                      <React.Fragment key={`${key}-spacing`}>
                        <div
                          className="absolute bg-amber-300"
                          style={{ left: `${x}px`, top: `${y}px`, width: `${width}px`, height: '1px' }}
                        />
                        <div
                          className="absolute h-2 w-[1px] bg-amber-300"
                          style={{ left: `${spacing.from.x}px`, top: `${y - 3}px` }}
                        />
                        <div
                          className="absolute h-2 w-[1px] bg-amber-300"
                          style={{ left: `${spacing.to.x}px`, top: `${y - 3}px` }}
                        />
                        <div
                          className="absolute text-[10px] font-semibold text-gray-900 bg-amber-100 px-1.5 py-0.5 rounded-full shadow"
                          style={{ left: `${labelLeft}px`, top: `${labelTop}px`, transform: 'translate(-50%, -50%)' }}
                        >
                          {spacing.label}
                        </div>
                      </React.Fragment>
                    );
                  } else {
                    const y = Math.min(spacing.from.y, spacing.to.y);
                    const height = Math.abs(spacing.to.y - spacing.from.y);
                    const x = spacing.from.x;
                    if (height < 2) return null;
                    const labelLeft = x + 14;
                    const labelTop = y + height / 2;
                    return (
                      <React.Fragment key={`${key}-spacing`}>
                        <div
                          className="absolute bg-amber-300"
                          style={{ left: `${x}px`, top: `${y}px`, width: '1px', height: `${height}px` }}
                        />
                        <div
                          className="absolute w-2 h-[1px] bg-amber-300"
                          style={{ left: `${x - 1}px`, top: `${spacing.from.y}px` }}
                        />
                        <div
                          className="absolute w-2 h-[1px] bg-amber-300"
                          style={{ left: `${x - 1}px`, top: `${spacing.to.y}px` }}
                        />
                        <div
                          className="absolute text-[10px] font-semibold text-gray-900 bg-amber-100 px-1.5 py-0.5 rounded-full shadow"
                          style={{ left: `${labelLeft}px`, top: `${labelTop}px`, transform: 'translate(-50%, -50%)' }}
                        >
                          {spacing.label}
                        </div>
                      </React.Fragment>
                    );
                  }
                })()}
              </React.Fragment>
            );
          })}
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
            const meta = threadMeta?.[comment.id];
            const conversationSize = meta?.count ?? 1;
            const isThreadUnread = meta?.unread ?? false;
            const mentionAlert = meta?.mentionAlert ?? null;

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
                
                {/* Mention indicator */}
                {mentionAlert && (
                  <div
                    className={`absolute -top-1 -left-1 text-[10px] font-bold min-w-[1.5rem] h-5 px-1.5 rounded-full flex items-center justify-center ring-2 ${
                      mentionAlert.unread
                        ? 'bg-red-500 text-white ring-red-400/70'
                        : isDark
                          ? 'bg-gray-900/80 text-white ring-gray-900/50'
                          : 'bg-white text-gray-900 ring-gray-300'
                    }`}
                  >
                    @
                  </div>
                )}

                {/* Conversation size badge */}
                <div
                  className={`absolute -top-1 -right-1 text-[10px] font-bold min-w-[1.5rem] h-5 px-1.5 rounded-full flex items-center justify-center ring-2 ${
                    isThreadUnread
                      ? 'bg-red-500 text-white ring-red-400/70'
                      : isDark
                        ? 'bg-gray-900/80 text-white ring-gray-900/50'
                        : 'bg-white text-gray-900 ring-gray-300'
                  }`}
                >
                  {conversationSize}
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
            mentionOptions={mentionOptions}
          onToggleResolve={onToggleCommentResolved}
          onEditComment={onEditComment}
            onJumpToFrame={onJumpToFrame}
          />
      )}
      {renderedRect && pendingComment && (
        <NewCommentPopover
          position={pendingComment.position}
          renderedRect={renderedRect}
          onSubmit={onAddComment}
          onCancel={() => setPendingComment(null)}
          isDark={isDark}
          mentionOptions={mentionOptions}
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
