"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ReviewVideoState, ReviewCanvasState, ReviewComment, VideoComparisonState, VideoComparisonMode, ComparisonAsset } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { ReviewAnnotationLayer } from "./ReviewAnnotationLayer";
import { ComparisonSettingsOverlay, CompareButton } from "./ComparisonSettingsOverlay";
import { VideoSelectionModal } from "./VideoSelectionModal";
import { OverlayVideoRenderer } from "./OverlayVideoRenderer";
import { SplitScreenContainer } from "./SplitScreenContainer";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getSvgPathFromStroke } from "@/lib/utils";
import getStroke from "perfect-freehand";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Download,
  AlertCircle,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Hash,
  StepBack,
  StepForward
} from "lucide-react";

interface ReviewVideoPlayerProps {
  assetUrl: string;
  videoState: ReviewVideoState;
  onVideoStateChange: (state: ReviewVideoState) => void;
  sessionId: string;
  theme?: 'dark' | 'light';
  annotatedFrames?: number[];
  // Canvas state per drawing integrato
  canvasState?: ReviewCanvasState;
  onCanvasStateChange?: (state: ReviewCanvasState) => void;
  onAnnotationCreated?: (annotationId: string) => void;
  // Nuove props per annotazioni esistenti
  showAnnotations?: boolean;
  showComments?: boolean;
  onCommentClick?: (comment: ReviewComment, position: { x: number; y: number }) => void;
  maxHeight?: number;
  openDropdownCommentId?: string;
  // New props for anchored popup
  openPopupCommentId?: string;
  onPopupClose?: () => void;
  onCommentUpdate?: () => void;
  assetId?: string;
  // Frame jump prop for external navigation
  frameJumpTarget?: number | null;
  // Compare button for toolbar
  compareButton?: React.ReactNode;
  // Comparison modal control from parent
  comparisonModalOpen?: boolean;
  onComparisonModalChange?: (open: boolean) => void;
}



interface VideoCacheState {
  isLoading: boolean;
  isLoaded: boolean;
  progress: number;
  error: string | null;
  blobUrl: string | null;
  dismissed: boolean;
}

export function ReviewVideoPlayer({
  assetUrl,
  videoState,
  onVideoStateChange,
  sessionId,
  theme = 'light',
  annotatedFrames = [],
  canvasState,
  onCanvasStateChange,
  onAnnotationCreated,
  showAnnotations = true,
  showComments = true,
  onCommentClick,
  maxHeight,
  openDropdownCommentId,
  openPopupCommentId,
  onPopupClose,
  onCommentUpdate,
  assetId,
  frameJumpTarget,
  compareButton,
  comparisonModalOpen: externalComparisonModalOpen,
  onComparisonModalChange
}: ReviewVideoPlayerProps) {
  // Router for navigation
  const router = useRouter();
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  
  // States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [fps, setFps] = useState(30); // Default FPS, will be calculated from video
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  
  // Video comparison states
  const [comparisonMode, setComparisonMode] = useState<VideoComparisonMode>('normal');
  const [comparisonAssetId, setComparisonAssetId] = useState<string | undefined>();
  const [comparisonVideoUrl, setComparisonVideoUrl] = useState<string | undefined>();
  const [overlayOpacity, setOverlayOpacity] = useState(50); // 0-100
  const [isSynced, setIsSynced] = useState(true);
  const [syncMaster, setSyncMaster] = useState<'primary' | 'comparison'>('primary');
  const [splitRatio, setSplitRatio] = useState(0.5); // 50/50 split
  const [showVideoSelection, setShowVideoSelection] = useState(false);
  const [internalComparisonModalOpen, setInternalComparisonModalOpen] = useState(false);
  
  // Use external state if provided, otherwise use internal state
  const comparisonModalOpen = externalComparisonModalOpen !== undefined ? externalComparisonModalOpen : internalComparisonModalOpen;
  const setComparisonModalOpen = onComparisonModalChange || setInternalComparisonModalOpen;
  
  // Comparison video refs and states
  const comparisonVideoRef = useRef<HTMLVideoElement>(null);
  const [comparisonVideoReady, setComparisonVideoReady] = useState(false);
  const [comparisonIsPlaying, setComparisonIsPlaying] = useState(false);
  
  // Scrubbing states
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);

  // Drawing states - Board-style system
  const [isDrawing, setIsDrawing] = useState(false);
  const [pencilDraft, setPencilDraft] = useState<[number, number, number][] | null>(null); // [x, y, pressure]
  const [startPoint, setStartPoint] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [currentPoint, setCurrentPoint] = useState<{x: number, y: number}>({x: 0, y: 0});
  
  // State for keeping annotations visible until database reload
  const [pendingAnnotations, setPendingAnnotations] = useState<any[]>([]);
  
  // Comment creation state - new anchored approach
  const [showCreateComment, setShowCreateComment] = useState(false);
  const [createCommentPosition, setCreateCommentPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [createCommentCanvasPosition, setCreateCommentCanvasPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Temporary bubble for anchoring
  const [tempBubble, setTempBubble] = useState<{
    id: string;
    position: { x: number; y: number };
    showInput: boolean;
    showDropdown: boolean;
  } | null>(null);
  
  // Controls state
  const [controlsMinimized, setControlsMinimized] = useState(false);



  // Video cache states - inizializzato come disabled
  const [videoCache, setVideoCache] = useState<VideoCacheState>({
    isLoading: false,
    isLoaded: false,
    progress: 0,
    error: null,
    blobUrl: null,
    dismissed: true  // Inizialmente dismissed per non mostrare notifiche
  });

  // Fetch existing annotations and comments
  const annotations = useQuery(api.review.getAnnotations, {
    sessionId: sessionId as Id<"reviewSessions">
  });

  const comments = useQuery(api.review.getComments, {
    sessionId: sessionId as Id<"reviewSessions">
  });

  // Convex mutations
  const createComment = useMutation(api.review.createComment);
  const createAnnotation = useMutation(api.review.createAnnotation);

  // Theme classes
  const themeClasses = {
    container: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700 text-white' 
      : 'bg-white border-gray-200 text-gray-900',
    button: theme === 'dark' 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    timeline: theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200',
    progress: theme === 'dark' ? 'bg-blue-500' : 'bg-blue-600',
    text: theme === 'dark' ? 'text-white' : 'text-gray-900'
  };

  // Display frame: scrubbing frame or current frame
  const displayFrame = scrubFrame !== null ? scrubFrame : currentFrame;
  const progress = totalFrames > 0 ? (displayFrame / totalFrames) * 100 : 0;

  // SAFE number formatting - prevent NaN
  const safeDisplayFrame = isNaN(displayFrame) ? 0 : displayFrame;
  const safeTotalFrames = isNaN(totalFrames) ? 0 : totalFrames;
  const safeDuration = isNaN(duration) ? 0 : duration;
  const safeProgress = isNaN(progress) ? 0 : progress;

  // Get annotations for current frame (including pending ones)
  const databaseAnnotations = annotations?.filter(annotation => 
    annotation.frameNumber === displayFrame && annotation.isVisible && !annotation.isDeleted
  ) || [];
  
  const framePendingAnnotations = pendingAnnotations.filter(pending => 
    pending.frameNumber === displayFrame
  );
  
  const currentFrameAnnotations = [...databaseAnnotations, ...framePendingAnnotations.map(pending => ({
    _id: pending.id,
    frameNumber: pending.frameNumber,
    type: pending.type,
    position: pending.position,
    drawingData: pending.drawingData,
    isVisible: true,
    isDeleted: false
  }))];

  // Get comments for current frame  
  const currentFrameComments = comments?.filter(comment =>
    comment.frameNumber === displayFrame
  ) || [];

  // VIDEO CACHING SYSTEM - Ora opzionale
  const downloadAndCacheVideo = useCallback(async () => {
    if (videoCache.isLoaded || videoCache.isLoading) return;

    setVideoCache(prev => ({ ...prev, isLoading: true, error: null, dismissed: false }));

    try {
      // Try fetching with different CORS modes
      let response: Response | null = null;
      const fetchOptions = [
        { mode: 'cors' as RequestMode, credentials: 'include' as RequestCredentials },
        { mode: 'cors' as RequestMode, credentials: 'same-origin' as RequestCredentials },
        { mode: 'cors' as RequestMode },
        { mode: 'no-cors' as RequestMode }
      ];

      for (const options of fetchOptions) {
        try {
          response = await fetch(assetUrl, options);
          if (response.ok || response.type === 'opaque') {
            break;
          }
        } catch (fetchError) {
          continue;
        }
      }

      if (!response) {
        throw new Error('All fetch attempts failed - likely CORS policy restriction');
      }

      // Handle opaque response (no-cors)
      if (response.type === 'opaque') {
        throw new Error('CORS policy prevents video caching. Using streaming fallback.');
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength) : 0;
      let downloadedBytes = 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        downloadedBytes += value.length;
        
        // Update progress (with fallback for unknown size)
        const progressPercent = totalBytes > 0 
          ? (downloadedBytes / totalBytes) * 100 
          : Math.min((downloadedBytes / (10 * 1024 * 1024)) * 100, 95); // Assume max 10MB for progress
        
        setVideoCache(prev => ({ ...prev, progress: progressPercent }));
      }

      // Detect video type from URL or use mp4 as fallback
      const videoType = assetUrl.toLowerCase().includes('.webm') ? 'video/webm' :
                       assetUrl.toLowerCase().includes('.mov') ? 'video/quicktime' :
                       assetUrl.toLowerCase().includes('.avi') ? 'video/avi' :
                       'video/mp4';

      // Combine chunks into single blob
      const videoBlob = new Blob(chunks, { type: videoType });
      const blobUrl = URL.createObjectURL(videoBlob);

      setVideoCache({
        isLoading: false,
        isLoaded: true,
        progress: 100,
        error: null,
        blobUrl,
        dismissed: false
      });

    } catch (error) {
      console.error('Error caching video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setVideoCache(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        dismissed: false
      }));
    }
  }, [assetUrl, videoCache.isLoaded, videoCache.isLoading]);

  // Dismiss cache status
  const dismissCacheStatus = useCallback(() => {
    setVideoCache(prev => ({ ...prev, dismissed: true }));
  }, []);

  // Clear cache and use streaming
  const useStreamingOnly = useCallback(() => {
    if (videoCache.blobUrl) {
      URL.revokeObjectURL(videoCache.blobUrl);
    }
    setVideoCache({
      isLoading: false,
      isLoaded: false,
      progress: 0,
      error: null,
      blobUrl: null,
      dismissed: true
    });
  }, [videoCache.blobUrl]);

  // CORE: Update frame-by-frame animation - Optimized version
  const updateFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Get current state directly from video element to avoid stale closures
      const currentTime = video.currentTime;
    const newFrame = Math.floor(currentTime * fps);
    const newTotalFrames = Math.floor(video.duration * fps);

    // Update React state
    setCurrentFrame(newFrame);
    setDuration(video.duration);  
    setTotalFrames(newTotalFrames);
    
    // Update parent state
      onVideoStateChange({
        currentTime,
      currentFrame: newFrame,
      totalFrames: newTotalFrames,
      duration: video.duration,
      isPlaying: !video.paused,
      volume: video.volume,
      isMuted: video.muted,
      playbackRate: video.playbackRate || 1
    });

    // Always update canvas to show current frame
    if (canvasRef.current && video) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }

    // Continue animation if still playing - check video state directly
    if (!video.paused) {
      animationFrameRef.current = requestAnimationFrame(updateFrame);
    }
  }, [fps, onVideoStateChange]); // Minimal dependencies

  // CORE: Jump to specific frame - Fixed with proper async handling
  const jumpToFrame = useCallback((frame: number) => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    const clampedFrame = Math.max(0, Math.min(frame, totalFrames - 1));
    const time = clampedFrame / fps;
    
    // Set up one-time seeked event listener for this specific seek operation
    const handleSeeked = () => {
      // Remove this specific listener
      video.removeEventListener('seeked', handleSeeked);
      
      // Update state
    setCurrentFrame(clampedFrame);
    
      // Now render canvas with the correct frame
      if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }
      
      // Update parent state with accurate frame info
      onVideoStateChange({
        currentTime: video.currentTime,
        currentFrame: clampedFrame,
        totalFrames,
        duration: video.duration,
        isPlaying: !video.paused,
        volume: video.volume,
        isMuted: video.muted,
        playbackRate: video.playbackRate || 1
      });
    };
    
    // Add the event listener before seeking
    video.addEventListener('seeked', handleSeeked, { once: true });
    
    // Start the seek operation
    video.currentTime = time;
    
    // Fallback timeout in case seeked event doesn't fire
    setTimeout(() => {
      video.removeEventListener('seeked', handleSeeked);
      // Force update if seeked didn't fire
      setCurrentFrame(clampedFrame);
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }
    }, 100); // 100ms fallback
  }, [totalFrames, fps, videoReady, onVideoStateChange]);

  // CORE: Render canvas with video + drawings
  const renderCanvas = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }, []);

  // Get canvas coordinates from screen coordinates - Convert CSS to native coordinates
  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    // Get CSS coordinates relative to canvas
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    
    // Convert to native canvas coordinates (what gets saved in database)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const nativeX = cssX * scaleX;
    const nativeY = cssY * scaleY;
    
    return {
      x: nativeX,
      y: nativeY
    };
  }, []);

  // Check if click is on a comment bubble
  const isClickOnComment = useCallback((clientX: number, clientY: number) => {
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (!elementAtPoint) return false;
    
    // Check if the clicked element or its parents contain comment-related selectors
    const commentSelectors = [
      '[data-comment-id]',
      '.comment-bubble',
      'foreignObject',
      '[class*="comment"]',
      '[class*="CommentBubble"]'
    ];
    
    return commentSelectors.some(selector => 
      elementAtPoint.closest(selector) !== null
    );
  }, []);

  // Comment creation handler - new anchored approach
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    
    if (!showComments || !canvasState) {
      return;
    }
    
    // Check if double-click is on an existing comment - if so, don't create new comment
    if (isClickOnComment(e.clientX, e.clientY)) {
      return;
    }
    
    // Allow comment creation with select tool OR comment tool
    if (canvasState.tool !== "select" && canvasState.tool !== "comment") {
      return;
    }
    
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    
    // Create temporary bubble immediately at click position
    const tempId = `temp-${Date.now()}`;
    setTempBubble({
      id: tempId,
      position: { x, y }, // Native canvas coordinates
      showInput: true,
      showDropdown: false
    });
    
    // Store canvas position for saving comment
    setCreateCommentCanvasPosition({ x, y });
  }, [showComments, canvasState, getCanvasCoordinates, isClickOnComment]);

  // DRAWING SYSTEM - Professional implementation
  const createNewAnnotation = useCallback(async (annotationData: {
    type: "circle" | "text" | "freehand" | "rectangle" | "arrow";
    position: { x: number; y: number };
    drawingData: Record<string, unknown>;
    textContent?: string;
  }) => {
    try {
      // Create a temporary ID for the pending annotation
      const tempId = `temp_${Date.now()}_${Math.random()}`;
      
      // Add to pending annotations immediately for instant visibility
      const pendingAnnotation = {
        id: tempId,
        frameNumber: displayFrame,
        type: annotationData.type,
        position: annotationData.position,
        drawingData: annotationData.drawingData,
        timestamp: Date.now()
      };
      
      setPendingAnnotations(prev => [...prev, pendingAnnotation]);
      
      const result = await createAnnotation({
        sessionId: sessionId as Id<"reviewSessions">,
        assetId: sessionId,
        frameNumber: displayFrame,
        frameTimestamp: displayFrame / fps,
        type: annotationData.type,
        position: annotationData.position,
        drawingData: annotationData.drawingData,
        textContent: annotationData.textContent
      });
      
      // Remove from pending annotations after database save (with delay to ensure database reload)
      setTimeout(() => {
        setPendingAnnotations(prev => prev.filter(p => p.id !== tempId));
      }, 1000);
      
      if (onAnnotationCreated) {
        onAnnotationCreated(result);
      }
      
      return result;
    } catch (error) {
      console.error("Error creating annotation:", error);
      throw error;
    }
  }, [sessionId, displayFrame, fps, createAnnotation, onAnnotationCreated]);

  // Drawing event handlers - Board-style system
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canvasState || !onCanvasStateChange) {
      console.warn("Missing canvasState or onCanvasStateChange:", { canvasState, onCanvasStateChange });
      return;
    }
    
    // Check if click is on a comment first - if so, don't handle it here
    if (isClickOnComment(e.clientX, e.clientY)) {
      return;
    }
    
    // Log current tool and state for debugging
    
    // Prevent drawing during scrubbing
    if (isScrubbing) {
      return;
    }
    
    // Check if tool is a drawing tool
    if (!["freehand", "rectangle", "circle", "arrow"].includes(canvasState.tool)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
    
    onCanvasStateChange({ ...canvasState, isDrawing: true });

    // For freehand, start the pencil draft with points
    if (canvasState.tool === "freehand") {
      setPencilDraft([[x, y, 0.5]]); // Start with initial point, default pressure
    }
  }, [canvasState, onCanvasStateChange, isScrubbing, getCanvasCoordinates, isClickOnComment]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasState || !isDrawing) return;
    
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    setCurrentPoint({ x, y });

    // For freehand drawing, add point to pencil draft
    if (canvasState.tool === "freehand" && pencilDraft) {
      setPencilDraft(prev => prev ? [...prev, [x, y, 0.5]] : [[x, y, 0.5]]);
    }
  }, [canvasState, isDrawing, getCanvasCoordinates, pencilDraft]);

  const handleCanvasMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (!canvasState || !onCanvasStateChange || !isDrawing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    
    setIsDrawing(false);
    onCanvasStateChange({ ...canvasState, isDrawing: false });

    // Create annotation based on tool type
    try {
      let annotationData: any = {
        type: canvasState.tool,
        position: startPoint,
        drawingData: {
          style: {
            color: canvasState.color,
            strokeWidth: canvasState.strokeWidth,
            opacity: canvasState.opacity
          }
        }
      };

      switch (canvasState.tool) {
        case "freehand":
          // Convert pencil draft points from [x, y, pressure] to {x, y} format for database
          annotationData.drawingData.points = pencilDraft?.map(([x, y]) => ({ x, y })) || [];
          break;
          
        case "rectangle":
          annotationData.drawingData.bounds = {
            x: Math.min(startPoint.x, x),
            y: Math.min(startPoint.y, y),
            width: Math.abs(x - startPoint.x),
            height: Math.abs(y - startPoint.y)
          };
          annotationData.position = { x: annotationData.drawingData.bounds.x, y: annotationData.drawingData.bounds.y };
          break;

        case "circle":
          annotationData.drawingData.bounds = {
            x: Math.min(startPoint.x, x),
            y: Math.min(startPoint.y, y),
            width: Math.abs(x - startPoint.x),
            height: Math.abs(y - startPoint.y)
          };
          annotationData.position = { x: annotationData.drawingData.bounds.x, y: annotationData.drawingData.bounds.y };
          break;
          
        case "arrow":
          annotationData.drawingData.bounds = {
            x: startPoint.x,
            y: startPoint.y,
            width: x - startPoint.x,
            height: y - startPoint.y
          };
          annotationData.position = { x: annotationData.drawingData.bounds.x, y: annotationData.drawingData.bounds.y };
          break;
          

      }

      await createNewAnnotation(annotationData);
      
      // Reset drawing state immediately after creating annotation
      setPencilDraft(null);
      setStartPoint({ x: 0, y: 0 });
      setCurrentPoint({ x: 0, y: 0 });
      
    } catch (error) {
      console.error("Error saving annotation:", error);
      // Reset drawing state even on error
      setPencilDraft(null);
      setStartPoint({ x: 0, y: 0 });
      setCurrentPoint({ x: 0, y: 0 });
    }
  }, [canvasState, onCanvasStateChange, isDrawing, getCanvasCoordinates, startPoint, pencilDraft, createNewAnnotation]);

  // VOLUME CONTROLS
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    const newMutedState = !isMuted;
    video.muted = newMutedState;
    setIsMuted(newMutedState);
  }, [isMuted, videoReady]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    setVolume(newVolume);
    video.volume = newVolume;
    
    // Automatically unmute if volume is increased
    if (newVolume > 0 && isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  }, [videoReady, isMuted]);

  // PLAYBACK CONTROLS
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) {
      return;
    }

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        // Start the animation frame loop for smooth canvas updates
        animationFrameRef.current = requestAnimationFrame(updateFrame);
      }).catch((error) => {
        console.error('Video play failed:', error);
      });
    } else {
      video.pause();
      setIsPlaying(false);
      // Stop the animation frame loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [videoReady, updateFrame]);

  // LOOP TOGGLE
  const toggleLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    const newLoopState = !isLoopEnabled;
    video.loop = newLoopState;
    setIsLoopEnabled(newLoopState);
  }, [isLoopEnabled, videoReady]);

  // VIDEO COMPARISON HANDLERS
  const handleModeChange = useCallback((mode: VideoComparisonMode) => {
    setComparisonMode(mode);
    
    // If switching to comparison mode but no video selected, open selection modal
    if (mode !== 'normal' && !comparisonVideoUrl) {
      setShowVideoSelection(true);
    }
  }, [comparisonVideoUrl]);

  const handleVideoSelection = useCallback((asset: ComparisonAsset) => {
    setComparisonAssetId(asset.id);
    setComparisonVideoUrl(asset.url);
    setShowVideoSelection(false);
  }, []);

  const handleAddVideo = useCallback(() => {
    setShowVideoSelection(true);
  }, []);

  const handleRemoveComparisonVideo = useCallback(() => {
    setComparisonAssetId(undefined);
    setComparisonVideoUrl(undefined);
    setComparisonMode('normal');
  }, []);

  // COMPARISON CONTROL HANDLERS
  const handleOpacityChange = useCallback((newOpacity: number) => {
    setOverlayOpacity(newOpacity);
  }, []);

  const handleSyncToggle = useCallback(() => {
    setIsSynced(!isSynced);
  }, [isSynced]);

  const handleSyncMasterChange = useCallback((master: 'primary' | 'comparison') => {
    setSyncMaster(master);
  }, []);

  const handleSplitRatioChange = useCallback((ratio: number) => {
    setSplitRatio(ratio);
  }, []);

  // Close handler for fullscreen comparison modes
  const handleCloseComparison = useCallback(() => {
    setComparisonMode('normal');
  }, []);

  // Split mode handler - opens dedicated comparison page
  const handleSplitModeSelect = useCallback((mode: 'split-horizontal' | 'split-vertical' | 'overlay') => {
    // Store comparison data in localStorage for the new page
    const comparisonData = {
      sessionId: sessionId, // Include sessionId for board-specific asset selection
      returnUrl: `/review/${sessionId}`, // Store return URL for navigation back
      primaryVideo: {
        id: assetId || 'current',
        name: 'Primary Video',
        url: assetUrl,
        duration: duration,
        fps: fps
      },
      comparisonVideo: comparisonVideoUrl ? {
        id: comparisonAssetId || 'comparison',
        name: `Asset ${comparisonAssetId}`,
        url: comparisonVideoUrl,
        duration: duration, // Assume same duration for now
        fps: fps
      } : null,
      mode: mode,
      settings: {
        splitRatio: splitRatio,
        overlayOpacity: overlayOpacity
      }
    };
    
    localStorage.setItem('videoComparisonData', JSON.stringify(comparisonData));
    router.push('/compare');
  }, [assetUrl, assetId, comparisonVideoUrl, comparisonAssetId, duration, fps, splitRatio, overlayOpacity, sessionId, router]);

  // VIDEO SYNCHRONIZATION LOGIC
  const syncVideos = useCallback(() => {
    if (!isSynced || !videoReady || !comparisonVideoReady) return;

    const primaryVideo = videoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryVideo || !comparisonVideo) return;

    if (syncMaster === 'primary') {
      // Sync comparison video to primary
      if (Math.abs(comparisonVideo.currentTime - primaryVideo.currentTime) > 0.1) {
        comparisonVideo.currentTime = primaryVideo.currentTime;
      }
      if (primaryVideo.paused !== comparisonVideo.paused) {
        if (primaryVideo.paused) {
          comparisonVideo.pause();
        } else {
          comparisonVideo.play().catch(console.error);
        }
      }
    } else {
      // Sync primary video to comparison
      if (Math.abs(primaryVideo.currentTime - comparisonVideo.currentTime) > 0.1) {
        primaryVideo.currentTime = comparisonVideo.currentTime;
      }
      if (comparisonVideo.paused !== primaryVideo.paused) {
        if (comparisonVideo.paused) {
          primaryVideo.pause();
        } else {
          primaryVideo.play().catch(console.error);
        }
      }
    }
  }, [isSynced, videoReady, comparisonVideoReady, syncMaster]);

  // Enhanced play/pause with sync
  const togglePlayWithSync = useCallback(() => {
    const primaryVideo = videoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryVideo || !videoReady) return;

    if (primaryVideo.paused) {
      primaryVideo.play().then(() => {
        setIsPlaying(true);
        // Start the animation frame loop for smooth canvas updates
        animationFrameRef.current = requestAnimationFrame(updateFrame);
        
        // Sync comparison video if available and synced
        if (comparisonVideo && comparisonVideoReady && isSynced) {
          comparisonVideo.currentTime = primaryVideo.currentTime;
          comparisonVideo.play().catch(console.error);
        }
      }).catch((error) => {
        console.error('Video play failed:', error);
      });
    } else {
      primaryVideo.pause();
      setIsPlaying(false);
      // Stop the animation frame loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Sync comparison video if available and synced
      if (comparisonVideo && comparisonVideoReady && isSynced) {
        comparisonVideo.pause();
      }
    }
  }, [videoReady, updateFrame, comparisonVideoReady, isSynced]);

  // Enhanced frame jumping with sync
  const jumpToFrameWithSync = useCallback((frame: number) => {
    const primaryVideo = videoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryVideo || !videoReady) return;

    const clampedFrame = Math.max(0, Math.min(frame, totalFrames - 1));
    const time = clampedFrame / fps;
    
    // Sync both videos if comparison is active and synced
    if (comparisonVideo && comparisonVideoReady && isSynced) {
      const handleBothSeeked = () => {
        let primarySeeked = false;
        let comparisonSeeked = false;
        
        const checkBothComplete = () => {
          if (primarySeeked && comparisonSeeked) {
            
            // Update state
            setCurrentFrame(clampedFrame);
            
            // Render canvas - overlay renderer will handle blending
            if (canvasRef.current && comparisonMode !== 'overlay') {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(primaryVideo, 0, 0, canvas.width, canvas.height);
              }
            }
            
            // Update parent state
            onVideoStateChange({
              currentTime: primaryVideo.currentTime,
              currentFrame: clampedFrame,
              totalFrames,
              duration: primaryVideo.duration,
              isPlaying: !primaryVideo.paused,
              volume: primaryVideo.volume,
              isMuted: primaryVideo.muted,
              playbackRate: primaryVideo.playbackRate || 1
            });
          }
        };
        
        const handlePrimarySeeked = () => {
          primaryVideo.removeEventListener('seeked', handlePrimarySeeked);
          primarySeeked = true;
          checkBothComplete();
        };
        
        const handleComparisonSeeked = () => {
          comparisonVideo.removeEventListener('seeked', handleComparisonSeeked);
          comparisonSeeked = true;
          checkBothComplete();
        };
        
        primaryVideo.addEventListener('seeked', handlePrimarySeeked, { once: true });
        comparisonVideo.addEventListener('seeked', handleComparisonSeeked, { once: true });
        
        // Start seeking both videos
        primaryVideo.currentTime = time;
        comparisonVideo.currentTime = time;
        
        // Fallback timeout
        setTimeout(() => {
          primaryVideo.removeEventListener('seeked', handlePrimarySeeked);
          comparisonVideo.removeEventListener('seeked', handleComparisonSeeked);
          if (!primarySeeked || !comparisonSeeked) {
            setCurrentFrame(clampedFrame);
            if (canvasRef.current && comparisonMode !== 'overlay') {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(primaryVideo, 0, 0, canvas.width, canvas.height);
              }
            }
          }
        }, 200);
      };
      
      handleBothSeeked();
    } else {
      // Use original jumpToFrame for single video
      jumpToFrame(frame);
    }
  }, [totalFrames, fps, videoReady, comparisonVideoReady, isSynced, jumpToFrame, onVideoStateChange, comparisonMode]);

  const previousFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    // Use sync-aware frame jumping if comparison is active
    if (comparisonVideoReady && isSynced) {
      jumpToFrameWithSync(currentFrame - 1);
    } else {
    jumpToFrame(currentFrame - 1);
    }
  }, [currentFrame, jumpToFrame, jumpToFrameWithSync, videoReady, comparisonVideoReady, isSynced]);

  const nextFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    // Use sync-aware frame jumping if comparison is active
    if (comparisonVideoReady && isSynced) {
      jumpToFrameWithSync(currentFrame + 1);
    } else {
    jumpToFrame(currentFrame + 1);
    }
  }, [currentFrame, jumpToFrame, jumpToFrameWithSync, videoReady, comparisonVideoReady, isSynced]);

  // Jump to first frame
  const jumpToFirstFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    jumpToFrame(0);
  }, [jumpToFrame, videoReady]);

  // Jump to last frame
  const jumpToLastFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    jumpToFrame(totalFrames - 1);
  }, [jumpToFrame, videoReady, totalFrames]);

  // Navigation to previous/next annotated frame
  const jumpToPreviousAnnotatedFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady || !annotatedFrames.length) return;
    
    // Find the previous annotated frame
    const sortedFrames = [...annotatedFrames].sort((a, b) => a - b);
    const currentIndex = sortedFrames.findIndex(frame => frame >= currentFrame);
    
    let targetFrame: number;
    if (currentIndex <= 0) {
      // If we're at or before the first annotated frame, go to the last one
      targetFrame = sortedFrames[sortedFrames.length - 1];
    } else {
      // Go to the previous annotated frame
      targetFrame = sortedFrames[currentIndex - 1];
    }
    
    // Pause if playing
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    jumpToFrame(targetFrame);
  }, [currentFrame, jumpToFrame, videoReady, annotatedFrames]);

  const jumpToNextAnnotatedFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoReady || !annotatedFrames.length) return;
    
    // Find the next annotated frame
    const sortedFrames = [...annotatedFrames].sort((a, b) => a - b);
    const nextFrame = sortedFrames.find(frame => frame > currentFrame);
    
    let targetFrame: number;
    if (nextFrame !== undefined) {
      targetFrame = nextFrame;
    } else {
      // If no next frame, go to the first annotated frame (loop)
      targetFrame = sortedFrames[0];
    }
    
    // Pause if playing
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    jumpToFrame(targetFrame);
  }, [currentFrame, jumpToFrame, videoReady, annotatedFrames]);

  // TIMELINE SCRUBBING - Professional implementation
  const getFrameFromMouseX = useCallback((mouseX: number): number => {
    const timeline = timelineRef.current;
    if (!timeline) return 0;

    const rect = timeline.getBoundingClientRect();
    const x = mouseX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    return Math.floor(percent * totalFrames); // Use Math.floor for precise frame calculation
  }, [totalFrames]);

  // Direct canvas update without requestAnimationFrame delays
  const updateCanvasImmediate = useCallback((video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (error) {
      // Ignore drawing errors during rapid updates
    }
  }, []);

  // Safe seek function with special handling for frame 0
  const seekToTime = useCallback((targetTime: number, video: HTMLVideoElement) => {
    try {
      if (targetTime <= 0) {
        // Special handling for frame 0 - use small epsilon to avoid buffering issues
        video.currentTime = 0.001;
        setTimeout(() => {
          video.currentTime = 0;
        }, 10);
      } else {
        video.currentTime = targetTime;
      }
    } catch (error) {
      console.error('Seek error:', error);
    }
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = clickX / rect.width;
    
    const targetTime = progress * video.duration;
    const targetFrame = Math.floor(targetTime * fps);
    
    video.currentTime = targetTime;
    setCurrentFrame(targetFrame);
    
    // Render canvas at this frame
    if (canvasRef.current && video) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }
  }, [fps, videoReady]);

  const handleScrubStart = useCallback((e: React.MouseEvent) => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    e.preventDefault();
    e.stopPropagation();

    const wasPlaying = !video.paused;
    let currentScrubFrame = getFrameFromMouseX(e.clientX);
    
    if (wasPlaying) {
      video.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    setIsScrubbing(true);
    setScrubFrame(currentScrubFrame);
    
    // Initial frame update with safe seek
    const initialTime = currentScrubFrame / fps;
    
    seekToTime(initialTime, video);
    
    // Delayed canvas update to allow seek to complete
    setTimeout(() => {
      updateCanvasImmediate(video);
    }, 50);

    // HIGH-PERFORMANCE mouse move handler
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      
      const newFrame = getFrameFromMouseX(e.clientX);
      
      // Only update if frame actually changed - prevents unnecessary updates
      if (newFrame !== currentScrubFrame) {
        currentScrubFrame = newFrame;
        setScrubFrame(newFrame);
        
        // IMMEDIATE video and canvas update - no delays for non-zero frames
        const newTime = newFrame / fps;
        
        if (newFrame === 0) {
          // Special handling for frame 0
        }
        
        seekToTime(newTime, video);
        
        // For frame 0, use longer delay; for others, immediate update
        const delay = newFrame === 0 ? 100 : 20;
        setTimeout(() => {
          updateCanvasImmediate(video);
        }, delay);
        
        // Update parent state immediately
    onVideoStateChange({
          currentTime: newTime,
          currentFrame: newFrame,
          totalFrames,
          duration,
          isPlaying: false,
          volume: video.volume,
          isMuted: video.muted,
          playbackRate: video.playbackRate || 1
        });
      }
    };

    // ROBUST mouse up handler - works everywhere on document
    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      
      // Scrub completed
      
      // Clean up event listeners immediately
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      
      // Finalize scrubbing state
      setIsScrubbing(false);
      const finalFrame = currentScrubFrame;
      const finalTime = finalFrame / fps;
      
      setScrubFrame(null);
      setCurrentFrame(finalFrame);
      
      // Ensure final video position with proper handling
      seekToTime(finalTime, video);
      
      // Wait for seek to complete before final render
      setTimeout(() => {
        updateCanvasImmediate(video);
        
        // Resume playback if it was playing before
        if (wasPlaying) {
          // Add extra delay for frame 0 to ensure video is ready
          const playDelay = finalFrame === 0 ? 200 : 50;
          setTimeout(() => {
            video.play().then(() => {
              setIsPlaying(true);
              animationFrameRef.current = requestAnimationFrame(updateFrame);
            }).catch(err => {
              console.error('Error resuming playback:', err);
              setIsPlaying(false);
            });
          }, playDelay);
        }
      }, finalFrame === 0 ? 150 : 50);
      
      // Final parent state update
      onVideoStateChange({
        currentTime: finalTime,
        currentFrame: finalFrame,
        totalFrames,
        duration,
        isPlaying: wasPlaying, // Restore original playing state
        volume: video.volume,
        isMuted: video.muted,
        playbackRate: video.playbackRate || 1
      });
    };

    // Add GLOBAL event listeners with capture=true for maximum reliability
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    // Removed mouseleave listener to allow continuous drag outside the timeline
    
    // Prevent default drag behaviors
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    // Cleanup on unmount
    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
    
    // Store cleanup function
    (handleMouseUp as any).cleanup = cleanup;

  }, [getFrameFromMouseX, fps, videoReady, totalFrames, duration, onVideoStateChange, updateFrame, updateCanvasImmediate, seekToTime]);

  // TOUCH support for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!videoReady || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const mouseEvent = {
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
      clientX: touch.clientX,
      clientY: touch.clientY
    } as React.MouseEvent;
    
    handleScrubStart(mouseEvent);
  }, [handleScrubStart, videoReady]);

  // SETUP VIDEO - Only when URL changes
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const handleLoadedMetadata = () => {
      const videoDuration = video.duration;
      
      // Try to detect actual FPS from video if possible
      // For now, we'll use 30 as default, but this could be enhanced
      const detectedFps = 30; // In a real implementation, you might get this from video metadata
      setFps(detectedFps);
      
      const videoTotalFrames = Math.floor(videoDuration * detectedFps);
      
      setDuration(videoDuration);
      setTotalFrames(videoTotalFrames);
      setVideoReady(true);
      
      canvas.width = video.videoWidth || 800;
      canvas.height = video.videoHeight || 600;
      
      // Ensure video starts paused
      video.pause();
      setIsPlaying(false);
      
      // Render first frame immediately
      setTimeout(() => {
        if (canvasRef.current && video) {
          const ctx = canvas.getContext('2d');  
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }
      }, 50); // Small delay to ensure video is ready to render
    };

    const handleCanPlay = () => {
      setVideoReady(true);
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      const target = e.target as HTMLVideoElement;
      if (target && target.error) {
        console.error('Video error details:', {
          code: target.error.code,
          message: target.error.message,
          MEDIA_ERR_ABORTED: target.error.MEDIA_ERR_ABORTED,
          MEDIA_ERR_NETWORK: target.error.MEDIA_ERR_NETWORK, 
          MEDIA_ERR_DECODE: target.error.MEDIA_ERR_DECODE,
          MEDIA_ERR_SRC_NOT_SUPPORTED: target.error.MEDIA_ERR_SRC_NOT_SUPPORTED
        });
      }
      setVideoReady(false);
    };

    const handleLoadStart = () => {
      setVideoReady(false);
    };

    const handleLoadedData = () => {
      setVideoReady(true);
    };

    const handleCanPlayThrough = () => {
      setVideoReady(true);
      
      // Only update frame if we don't have a current time set
      // This prevents forcing back to frame 0 when user is navigating
      if (!isScrubbing) {
        updateFrame();
      }
    };

    const handleTimeUpdate = () => {
      // Always update frame state when time changes (for paused video seeking)
      if (!isScrubbing) {
        updateFrame();
      }
      
      // Update canvas for paused video
      if (!isPlaying && canvasRef.current && video) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      // updateFrame will be called by the animation loop, no need to call directly here
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    // Set video source - SEMPRE l'URL originale se non c'è cache
    const videoUrl = videoCache.blobUrl || assetUrl;
    // Setting video source
    
    // Reset video state
    setVideoReady(false);
    setIsPlaying(false);
    
    // Configure video element
    video.src = videoUrl;
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = isMuted; // Set from state
    video.volume = volume; // Set from state
    video.loop = isLoopEnabled; // Set loop from state
    video.controls = false; // Hide native controls
    video.autoplay = false; // Prevent autoplay
    // NON impostare crossOrigin per evitare problemi CORS

    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [videoCache.blobUrl, assetUrl, fps]); // ONLY URL and FPS dependencies

  // Sync video with incoming videoState changes (for external frame jumps)
  // Only sync when NOT user-controlled to avoid fighting user interactions
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady || isScrubbing) return;

    // Only sync volume and mute - avoid time/playback sync that interferes with user control
    if (Math.abs(video.volume - videoState.volume) > 0.01) {
      video.volume = videoState.volume;
    }
    video.muted = videoState.isMuted;
  }, [videoState.volume, videoState.isMuted, videoReady, isScrubbing]);

  // Handle external frame jump requests
  useEffect(() => {
    if (frameJumpTarget !== null && frameJumpTarget !== undefined && videoReady) {
      jumpToFrame(frameJumpTarget);
    }
  }, [frameJumpTarget, videoReady, jumpToFrame]);
  
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoCache.blobUrl) {
        URL.revokeObjectURL(videoCache.blobUrl);
      }
    };
  }, [videoCache.blobUrl]);

  // Cleanup old pending annotations (older than 5 seconds)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setPendingAnnotations(prev => 
        prev.filter(pending => now - pending.timestamp < 5000)
      );
    }, 1000);
    
    return () => clearInterval(cleanup);
  }, []);

  // CRITICAL: Restore canvas dimensions when switching back from split modes
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Only restore dimensions when switching back to normal or overlay mode
    if (!canvas || !video || !videoReady) return;
    if (comparisonMode === 'split-horizontal' || comparisonMode === 'split-vertical') return;
    
    // Restore canvas to native video dimensions to preserve quality
    const nativeWidth = video.videoWidth || 800;
    const nativeHeight = video.videoHeight || 600;
    
    // Only update if dimensions actually changed to avoid unnecessary operations
    if (canvas.width !== nativeWidth || canvas.height !== nativeHeight) {
      
      canvas.width = nativeWidth;
      canvas.height = nativeHeight;
      
      // Re-render current frame with correct dimensions
      setTimeout(() => {
        if (canvasRef.current && video) {
          const ctx = canvas.getContext('2d');  
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }
      }, 50);
    }
  }, [comparisonMode, videoReady]); // Monitor comparison mode changes

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`${themeClasses.container} space-y-4 flex flex-col`}
         style={{ height: '90vh' }}>
      {/* Cache Status - Smart Auto-Dismiss */}
      {videoCache.isLoading && !videoCache.dismissed && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                Caching video for smoother playback...
              </span>
            </div>
            <button
              onClick={dismissCacheStatus}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              ×
            </button>
          </div>
          <div className="mt-2 w-full bg-blue-100 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${videoCache.progress}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 mt-1">
            {videoCache.progress.toFixed(1)}% completed
          </p>
        </div>
      )}

      {/* Cache Error */}
      {videoCache.error && !videoCache.dismissed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-yellow-700">
                ⚠️ Caching failed: {videoCache.error}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={useStreamingOnly}
                className="text-yellow-600 hover:text-yellow-800 text-sm underline"
              >
                Use Streaming
              </button>
              <button
                onClick={dismissCacheStatus}
                className="text-yellow-500 hover:text-yellow-700 text-sm"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cache Success */}
      {videoCache.isLoaded && !videoCache.dismissed && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-700">
              ✅ Video cached successfully! Playback should be smoother.
            </span>
            <button
              onClick={dismissCacheStatus}
              className="text-green-500 hover:text-green-700 text-sm"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Comparison Settings Modal - controlled from toolbar */}
      <ComparisonSettingsOverlay
        currentMode={comparisonMode}
        onModeChange={handleModeChange}
        hasComparisonVideo={!!comparisonVideoUrl}
        onAddVideo={handleAddVideo}
        onRemoveComparison={handleRemoveComparisonVideo}
        comparisonVideoName={comparisonAssetId ? `Asset ${comparisonAssetId}` : undefined}
        onSplitModeSelect={handleSplitModeSelect}
        opacity={overlayOpacity}
        onOpacityChange={handleOpacityChange}
        isSynced={isSynced}
        onSyncToggle={handleSyncToggle}
        syncMaster={syncMaster}
        onSyncMasterChange={handleSyncMasterChange}
        splitRatio={splitRatio}
        onSplitRatioChange={handleSplitRatioChange}
        theme={theme}
        disabled={!videoReady}
        isOpen={comparisonModalOpen}
        onOpenChange={setComparisonModalOpen}
        hideButton={true}
      />

      {/* Canvas Stack: Video + Drawing */}
      <div ref={containerRef} className="relative bg-transparent rounded-lg overflow-hidden flex-1 flex items-center justify-center">
        {/* Hidden Video Element - Source for Canvas */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted={false}
          controls={false}
          autoPlay={false}
        />

        {/* Comparison Video Element - Hidden */}
        {comparisonVideoUrl && (
          <video
            ref={comparisonVideoRef}
            className="hidden"
            playsInline
            muted={false}
            controls={false}
            autoPlay={false}
            preload="metadata"
            onLoadStart={() => {
              setComparisonVideoReady(false);
            }}
            onLoadedMetadata={() => {
              const video = comparisonVideoRef.current;
              if (video) {
                setComparisonVideoReady(true);
                video.pause(); // Start paused
              }
            }}
            onCanPlay={() => {
              setComparisonVideoReady(true);
            }}
            onPlay={() => {
              setComparisonIsPlaying(true);
            }}
            onPause={() => {
              setComparisonIsPlaying(false);
            }}
            onError={(e) => {
              console.error('🚨 Comparison video error details:', {
                error: e,
                target: e.target,
                url: comparisonVideoUrl,
                networkState: e.target ? (e.target as HTMLVideoElement).networkState : 'unknown',
                readyState: e.target ? (e.target as HTMLVideoElement).readyState : 'unknown',
                errorCode: e.target && (e.target as HTMLVideoElement).error ? (e.target as HTMLVideoElement).error?.code : 'unknown',
                errorMessage: e.target && (e.target as HTMLVideoElement).error ? (e.target as HTMLVideoElement).error?.message : 'unknown'
              });
              setComparisonVideoReady(false);
            }}
            src={comparisonVideoUrl}
          />
        )}

        {/* Loading indicator */}
        {!videoReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <div className="text-sm">Caricamento video...</div>
            </div>
          </div>
        )}

        {/* Conditional Rendering: Comparison Modes vs Normal Canvas */}
        {comparisonMode === 'overlay' && comparisonVideoUrl ? (
          <OverlayVideoRenderer
            primaryVideoUrl={assetUrl}
            comparisonVideoUrl={comparisonVideoUrl}
            opacity={overlayOpacity}
            isSynced={isSynced}
            syncMaster={syncMaster}
            currentFrame={currentFrame}
            fps={fps}
            isPlaying={isPlaying}
            className={`${
              canvasState && ["freehand", "rectangle", "circle", "arrow"].includes(canvasState.tool)
                ? "cursor-crosshair"
                : canvasState?.tool === "comment"
                  ? "cursor-help"
                  : "cursor-default"
            }`}
            onVideoReady={(dimensions) => {
            }}
            onFrameUpdate={(frame, time) => {
              // Comparison video should not update parent state - causes infinite loops
              // The main video controls the state
            }}
          />
        ) : (comparisonMode === 'split-horizontal' || comparisonMode === 'split-vertical') && comparisonVideoUrl ? (
          <SplitScreenContainer
            primaryVideoUrl={assetUrl}
            comparisonVideoUrl={comparisonVideoUrl}
            mode={comparisonMode}
            splitRatio={splitRatio}
            isSynced={isSynced}
            syncMaster={syncMaster}
            currentFrame={currentFrame}
            fps={fps}
            isPlaying={isPlaying}
            className={`${
              canvasState && ["freehand", "rectangle", "circle", "arrow"].includes(canvasState.tool)
                ? "cursor-crosshair"
                : canvasState?.tool === "comment"
                  ? "cursor-help"
                  : "cursor-default"
            }`}
            onVideoReady={(dimensions) => {
            }}
            onFrameUpdate={(frame, time) => {
              // Comparison video should not update parent state - causes infinite loops  
              // The main video controls the state
            }}
            onClose={handleCloseComparison}
          />
        ) : (
        <canvas
          ref={canvasRef}
          className={`w-full h-auto max-w-full max-h-full object-contain ${
            canvasState && ["freehand", "rectangle", "circle", "arrow"].includes(canvasState.tool)
              ? "cursor-crosshair"
              : canvasState?.tool === "comment"
                ? "cursor-help"
                : "cursor-default"
          }`}
          style={{ 
            zIndex: 1, // Reset to low z-index
            pointerEvents: 'auto',
            background: 'transparent' // Ensure it's transparent
          }}
          onDoubleClick={handleCanvasDoubleClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onTouchStart={(e) => {
            // Convert touch to mouse event
            const touch = e.touches[0];
            if (touch) {
              handleCanvasMouseDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
              } as any);
            }
          }}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (touch) {
              handleCanvasMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY
              } as any);
            }
          }}
          onTouchEnd={(e) => {
            handleCanvasMouseUp({
              preventDefault: () => e.preventDefault(),
              stopPropagation: () => e.stopPropagation()
            } as any);
          }}
          title={
            canvasState && ["freehand", "rectangle", "circle", "arrow"].includes(canvasState.tool)
              ? `${canvasState.tool} tool - Click and drag to draw`
              : canvasState?.tool === "comment"
                ? "Double-click to add a comment"
                : "Double-click to add a comment"
          }
        />
        )}
        
        {/* Annotations Overlay anchored to media rect */}
        {showAnnotations && (() => {
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (!canvas || !container) return null;

          const containerRect = container.getBoundingClientRect();
          const canvasNativeWidth = canvas.width;
          const canvasNativeHeight = canvas.height;
          const containerWidth = containerRect.width;
          const containerHeight = containerRect.height;

          const canvasAspectRatio = canvasNativeWidth / canvasNativeHeight;
          const containerAspectRatio = containerWidth / containerHeight;

          let renderedWidth, renderedHeight, offsetX, offsetY;
          if (canvasAspectRatio > containerAspectRatio) {
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / canvasAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
          } else {
            renderedWidth = containerHeight * canvasAspectRatio;
            renderedHeight = containerHeight;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
          }

          return (
            <div
              className="absolute"
              style={{
                left: offsetX,
                top: offsetY,
                width: renderedWidth,
                height: renderedHeight,
                zIndex: 3,
                // Enable pointer events when in select mode so selector can receive clicks
                pointerEvents: (canvasState && canvasState.tool === 'select') ? 'auto' : 'none'
              }}
            >
              <ReviewAnnotationLayer
                annotations={currentFrameAnnotations as any}
                canvasState={canvasState || { tool: 'select', color: '#000', strokeWidth: 2, opacity: 1, isDrawing: false, zoom: 1, pan: { x: 0, y: 0 } }}
                applyTransform={false}
                canvasSize={{ width: canvasNativeWidth, height: canvasNativeHeight }}
              />

            </div>
          );
        })()}

        {/* Drawing Preview Overlay */}
        {isDrawing && canvasState && (() => {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          
          const rect = canvas.getBoundingClientRect();
          const scaleX = rect.width / canvas.width;
          const scaleY = rect.height / canvas.height;
          
          // Convert native coordinates to CSS coordinates for preview
          const cssStartPoint = {
            x: startPoint.x * scaleX,
            y: startPoint.y * scaleY
          };
          const cssCurrentPoint = {
            x: currentPoint.x * scaleX,
            y: currentPoint.y * scaleY
          };
          
          // Convert pencil draft points to CSS coordinates for freehand preview
          const cssPoints = pencilDraft?.map(([x, y, pressure]) => [
            x * scaleX,
            y * scaleY,
            pressure
          ]) as [number, number, number][] || [];
          
          return (
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              style={{ zIndex: 3 }} // Above annotations but below UI
            >
              {canvasState.tool === "freehand" && pencilDraft && pencilDraft.length > 0 && (
                <path
                  d={getSvgPathFromStroke(
                    getStroke(cssPoints, {
                      size: canvasState.strokeWidth * scaleX,
                      thinning: 0.5,
                      smoothing: 0.5,
                      streamline: 0.5,
                    })
                  )}
                  fill={canvasState.color}
                  opacity={canvasState.opacity}
                />
              )}
              
              {canvasState.tool === "rectangle" && (
                <rect
                  x={Math.min(cssStartPoint.x, cssCurrentPoint.x)}
                  y={Math.min(cssStartPoint.y, cssCurrentPoint.y)}
                  width={Math.abs(cssCurrentPoint.x - cssStartPoint.x)}
                  height={Math.abs(cssCurrentPoint.y - cssStartPoint.y)}
                  stroke={canvasState.color}
                  strokeWidth={canvasState.strokeWidth * scaleX}
                  fill="none"
                  opacity={canvasState.opacity}
                />
              )}
              
              {canvasState.tool === "circle" && (
                <ellipse
                  cx={cssStartPoint.x + (cssCurrentPoint.x - cssStartPoint.x) / 2}
                  cy={cssStartPoint.y + (cssCurrentPoint.y - cssStartPoint.y) / 2}
                  rx={Math.abs(cssCurrentPoint.x - cssStartPoint.x) / 2}
                  ry={Math.abs(cssCurrentPoint.y - cssStartPoint.y) / 2}
                  stroke={canvasState.color}
                  strokeWidth={canvasState.strokeWidth * scaleX}
                  fill="none"
                  opacity={canvasState.opacity}
                />
              )}

              {canvasState.tool === "arrow" && (
                <g>
                  <line
                    x1={cssStartPoint.x}
                    y1={cssStartPoint.y}
                    x2={cssCurrentPoint.x}
                    y2={cssCurrentPoint.y}
                    stroke={canvasState.color}
                    strokeWidth={canvasState.strokeWidth * scaleX}
                    opacity={canvasState.opacity}
                    strokeLinecap="round"
                  />
                  <polygon
                    points={`${cssCurrentPoint.x},${cssCurrentPoint.y} ${cssCurrentPoint.x - 10 * scaleX},${cssCurrentPoint.y - 5 * scaleY} ${cssCurrentPoint.x - 10 * scaleX},${cssCurrentPoint.y + 5 * scaleY}`}
                    fill={canvasState.color}
                    opacity={canvasState.opacity}
                  />
                </g>
              )}
            </svg>
          );
        })()}

        {/* Comments Overlay - Constrained to actual video content dimensions */}
        {showComments && (() => {
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (!canvas || !container) return null;
          
          const containerRect = container.getBoundingClientRect();
          
          // Calculate the actual rendered canvas size within the container
          // The canvas is centered and maintains aspect ratio
          const canvasNativeWidth = canvas.width;
          const canvasNativeHeight = canvas.height;
          const containerWidth = containerRect.width;
          const containerHeight = containerRect.height;
          
          // Calculate aspect ratios to determine how the canvas fits in the container
          const canvasAspectRatio = canvasNativeWidth / canvasNativeHeight;
          const containerAspectRatio = containerWidth / containerHeight;
          
          let renderedWidth, renderedHeight, offsetX, offsetY;
          
          if (canvasAspectRatio > containerAspectRatio) {
            // Canvas is wider - limited by container width
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / canvasAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
          } else {
            // Canvas is taller - limited by container height  
            renderedWidth = containerHeight * canvasAspectRatio;
            renderedHeight = containerHeight;
            offsetX = (containerWidth - renderedWidth) / 2;
            offsetY = 0;
          }
          
          return (
            <div 
              className="absolute" 
              style={{ 
                left: offsetX,
                top: offsetY,
                width: renderedWidth,
                height: renderedHeight,
                zIndex: 4, 
                pointerEvents: 'none' // Let canvas receive events; children re-enable where needed
              }}
            >
              <ReviewAnnotationLayer
                annotations={[]} // Only comments for this layer
                comments={currentFrameComments}
                tempBubble={tempBubble}
                canvasState={canvasState || { tool: "select", color: "#000", strokeWidth: 2, opacity: 1, isDrawing: false, zoom: 1, pan: { x: 0, y: 0 } }}
                onCommentClick={onCommentClick}
                onTempBubbleUpdate={setTempBubble}
                sessionId={sessionId}
                displayFrame={displayFrame}
                fps={fps}
                theme={theme}
                openDropdownCommentId={openDropdownCommentId}
                openPopupCommentId={openPopupCommentId}
                onPopupClose={onPopupClose}
                onCommentUpdate={onCommentUpdate}
                assetId={assetId}
                normalizePositions={true}
                applyTransform={false} // Video doesn't need canvas pan/zoom transforms
                canvasSize={{ width: canvasNativeWidth, height: canvasNativeHeight }}
              />
            </div>
          );
        })()}


      </div>

      {/* Controls Header with Toggle */}
      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mx-auto" style={{ width: '97%' }}>
      <Button
        variant="ghost"
        size="sm"
          onClick={() => setControlsMinimized(!controlsMinimized)}
          className="text-xs gap-1 h-7 px-2"
          title={controlsMinimized ? "Expand controls" : "Minimize controls"}
        >
          {controlsMinimized ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Hide Controls</span>
            </>
        )}
      </Button>

        {/* Quick frame info when minimized - Compact */}
        {controlsMinimized && (
          <div className={`text-sm font-mono ${themeClasses.text} flex items-center gap-2`}>
            <span className="font-bold">{safeDisplayFrame}</span>
            <span className="text-gray-500">/ {safeTotalFrames}</span>
            <span className="text-xs text-gray-400">
              {formatTime(safeDisplayFrame / fps)} / {formatTime(safeDuration)}
            </span>
          </div>
        )}
        
        {/* Quick play/pause when minimized - Compact */}
        {controlsMinimized && (
        <Button
          variant="ghost"
          size="sm"
            onClick={togglePlay}
            disabled={!videoReady}
            className="h-7 w-7 p-0"
        >
            {videoState.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        )}
      </div>

      {/* Full Controls - Collapsible */}
      {!controlsMinimized && (
        <div className="space-y-2 mx-auto" style={{ width: '97%' }}>
          {/* Controls in Centered Column Layout */}
          <div className="flex flex-col items-center gap-3">
            {/* Row 1: Frame Counter and Time */}
            <div className={`text-sm font-mono ${themeClasses.text} flex items-center gap-2`}>
              <span className="font-bold text-base">{safeDisplayFrame}</span>
              <span className="text-gray-500">/ {safeTotalFrames}</span>
              <span className="text-xs text-gray-400">
                {formatTime(safeDisplayFrame / fps)} / {formatTime(safeDuration)}
              </span>
            </div>

            {/* Row 2: Navigation Controls */}
            <div className="flex items-center gap-1">
              {/* Previous Annotated Frame */}
              <Button
                variant="ghost"
                size="sm"
                onClick={jumpToPreviousAnnotatedFrame}
                disabled={!videoReady || !annotatedFrames.length}
                title={`Go to previous comment/sketch ${annotatedFrames.length > 0 ? `(${annotatedFrames.length} annotated frames)` : ''}`}
                className={`h-8 w-8 p-0 ${annotatedFrames.length > 0 ? 'text-yellow-600 hover:text-yellow-700' : ''}`}
              >
                <div className="flex items-center gap-0.5">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <Hash className="h-3 w-3" />
                </div>
              </Button>

              {/* First Frame */}
              <Button
                variant="ghost"
                size="sm"
                onClick={jumpToFirstFrame}
                disabled={!videoReady}
                title="Go to first frame"
                className="h-8 w-8 p-0"
              >
                <StepBack className="h-3.5 w-3.5" />
              </Button>
              
              {/* Previous Frame */}
          <Button
            variant="ghost"
            size="sm"
            onClick={previousFrame}
            disabled={!videoReady}
                title="Previous frame"
                className="h-8 w-8 p-0"
          >
                <SkipBack className="h-3.5 w-3.5" />
          </Button>
              
              {/* Play/Pause */}
          <Button
            variant="ghost"
            size="sm"
                onClick={comparisonVideoReady && isSynced ? togglePlayWithSync : togglePlay}
            disabled={!videoReady}
                title={videoState.isPlaying ? "Pause" : "Play"}
                className="h-8 w-8 p-0"
          >
                {videoState.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
              
              {/* Next Frame */}
        <Button
          variant="ghost"
          size="sm"
          onClick={nextFrame}
            disabled={!videoReady}
                title="Next frame"
                className="h-8 w-8 p-0"
        >
                <SkipForward className="h-3.5 w-3.5" />
        </Button>
          
              {/* Last Frame */}
        <Button
          variant="ghost"
          size="sm"
                onClick={jumpToLastFrame}
                disabled={!videoReady}
                title="Go to last frame"
                className="h-8 w-8 p-0"
              >
                <StepForward className="h-3.5 w-3.5" />
          </Button>

              {/* Next Annotated Frame */}
      <Button
        variant="ghost"
        size="sm"
            onClick={jumpToNextAnnotatedFrame}
            disabled={!videoReady || !annotatedFrames.length}
            title={`Go to next comment/sketch ${annotatedFrames.length > 0 ? `(${annotatedFrames.length} annotated frames)` : ''}`}
                className={`h-8 w-8 p-0 ${annotatedFrames.length > 0 ? 'text-yellow-600 hover:text-yellow-700' : ''}`}
          >
                <div className="flex items-center gap-0.5">
              <Hash className="h-3 w-3" />
                  <ChevronRight className="h-3.5 w-3.5" />
            </div>
      </Button>
        </div>

            {/* Row 3: Volume, FPS, and Loop Controls */}
            <div className="flex items-center gap-3">
              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={toggleMute}
                  title={isMuted ? "Unmute" : "Mute"}
                  className="h-7 w-7 p-0"
                >
                  {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </Button>
                
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  title={`Volume: ${Math.round(volume * 100)}%`}
                  style={{
                    background: `linear-gradient(to right, #374151 0%, #374151 ${volume * 100}%, #d1d5db ${volume * 100}%, #d1d5db 100%)`
                  }}
                />
                
                <span className="text-xs text-gray-500 w-8 text-center">
                  {Math.round(volume * 100)}%
                </span>
          </div>

              {/* FPS Display */}
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="font-mono">{fps} FPS</span>
        </div>

              {/* Loop Toggle */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleLoop}
                title={isLoopEnabled ? "Disable loop" : "Enable loop"}
                className={`h-7 w-14 p-0 text-xs ${isLoopEnabled ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
              >
                Loop
          </Button>
        </div>
      </div>
        </div>
      )}

      {/* Professional Timeline */}
      <div className="space-y-2">
        {/* Frame numbers every 60 frames */}
        <div className="relative h-4 mx-auto" style={{ width: '80%' }}>
          {Array.from({ length: Math.floor(safeTotalFrames / 60) + 1 }, (_, i) => {
            const frame = i * 60;
            const position = safeTotalFrames > 0 ? (frame / safeTotalFrames) * 100 : 0;
            if (frame > safeTotalFrames) return null;
            return (
              <div
                key={i}
                className="absolute text-[10px] text-gray-600 font-mono"
                style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
              >
                {frame}
              </div>
            );
          })}
        </div>

        {/* Modern Timeline Track */}
        <div className="relative mx-auto" style={{ width: '80%' }}>
          <div
            ref={timelineRef}
            className={`h-4 bg-gray-200 rounded-sm relative ${
              videoReady ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            } shadow-inner overflow-hidden`}
            onClick={handleTimelineClick}
          >
            {/* Frame lines - Smart proportional spacing */}
            {(() => {
              // Calculate smart interval based on total frames
              let interval = 1;
              if (safeTotalFrames > 2000) interval = 20;
              else if (safeTotalFrames > 1000) interval = 10;
              else if (safeTotalFrames > 800) interval = 5;
              else if (safeTotalFrames > 400) interval = 3;
              else if (safeTotalFrames > 200) interval = 2;
              
              const numberOfLines = Math.floor(safeTotalFrames / interval);
              
              return Array.from({ length: numberOfLines }, (_, i) => {
                const frame = i * interval;
                const position = safeTotalFrames > 0 ? (frame / safeTotalFrames) * 100 : 0;
                const isAnnotated = annotatedFrames.includes(frame);
                return (
                  <div
                    key={i}
                    className={`absolute top-0 w-px h-full ${
                      isAnnotated ? 'bg-yellow-600' : 'bg-gray-400'
                    } opacity-40`}
                    style={{ left: `${position}%` }}
                  />
                );
              });
            })()}

            {/* Progress Bar */}
            <div
              className="absolute h-full bg-gray-800 rounded-sm transition-none"
              style={{ width: `${safeProgress}%` }}
            />
            
            {/* Annotated frames indicator on timeline */}
            {annotatedFrames.map(frame => {
              const frameProgress = safeTotalFrames > 0 ? (frame / safeTotalFrames) * 100 : 0;
              return (
                <div
                  key={frame}
                  className="absolute top-0 w-1 h-full bg-yellow-500 opacity-80"
                  style={{ left: `${isNaN(frameProgress) ? 0 : frameProgress}%` }}
                  title={`Frame ${frame} has annotations`}
                />
              );
            })}
            
            {/* Modern Square Scrubber with Frame Number */}
            <div
              className={`absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 ${
                videoReady ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'
              } z-50 select-none`}
              style={{ left: `${safeProgress}%` }}
              onMouseDown={handleScrubStart}
              onTouchStart={handleTouchStart}
            >
              {/* Square handle with frame number */}
              <div className="w-6 h-6 bg-white border-2 border-gray-800 rounded-sm shadow-lg flex items-center justify-center">
                <span className="text-[8px] font-bold text-gray-800">
                  {safeDisplayFrame}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>

      {/* Video Selection Modal */}
      <VideoSelectionModal
        isOpen={showVideoSelection}
        onClose={() => setShowVideoSelection(false)}
        onSelectVideo={handleVideoSelection}
        currentVideoId={assetId}
        sessionId={sessionId}
        theme={theme}
      />
    </div>
  );
}
