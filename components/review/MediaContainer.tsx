// @ts-nocheck
"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ReviewAnnotation, ReviewComment, ReviewCanvasState, ReviewVideoState, VideoComparisonMode } from "@/types/canvas";
import { ReviewCanvasSystemOptimized } from "./ReviewCanvasSystemOptimized";
import { ReviewAnnotationLayer } from "./ReviewAnnotationLayer";
import { ComparisonSettingsOverlay } from "./ComparisonSettingsOverlay";
import { useRouter } from "next/navigation";
// Import type as any to avoid deep instantiation in some environments
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { 
  Play, Pause, SkipBack, SkipForward, StepBack, StepForward, 
  Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, 
  Hash 
} from "lucide-react";

// Helper functions for video controls
const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export interface VideoControlsProps {
  videoState: ReviewVideoState;
  onVideoStateChange: (state: ReviewVideoState) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoReady: boolean;
  setVideoReady: (ready: boolean) => void;
  controlsMinimized: boolean;
  setControlsMinimized: (minimized: boolean) => void;
  isLoopEnabled: boolean;
  setIsLoopEnabled: (enabled: boolean) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
  timelineRef: React.RefObject<HTMLDivElement>;
  annotatedFrames: number[];
  theme?: 'light' | 'dark';
}

export function VideoControls({
  videoState,
  onVideoStateChange,
  videoRef,
  videoReady,
  setVideoReady,
  controlsMinimized,
  setControlsMinimized,
  isLoopEnabled,
  setIsLoopEnabled,
  isMuted,
  setIsMuted,
  volume,
  setVolume,
  timelineRef,
  annotatedFrames,
  theme = 'light'
}: VideoControlsProps) {
  const fps = videoState.totalFrames > 0 && videoState.duration > 0 
    ? videoState.totalFrames / videoState.duration 
    : 30;

  const safeDisplayFrame = Math.max(0, Math.min(videoState.currentFrame, videoState.totalFrames || 0));
  const safeTotalFrames = Math.max(1, videoState.totalFrames || 1);
  const safeDuration = Math.max(0.1, videoState.duration || 0.1);
  const safeProgress = safeTotalFrames > 0 ? (safeDisplayFrame / safeTotalFrames) * 100 : 0;

  const themeClasses = {
    text: theme === 'dark' ? 'text-white' : 'text-gray-900',
    bg: theme === 'dark' ? 'bg-gray-900' : 'bg-white',
    border: theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
  };

  // Video control functions
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    
    if (videoState.isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    
    onVideoStateChange({
      ...videoState,
      isPlaying: !videoState.isPlaying
    });
  }, [videoState, onVideoStateChange, videoRef]);

  const previousFrame = useCallback(() => {
    if (!videoRef.current) return;
    const newFrame = Math.max(0, videoState.currentFrame - 1);
    const newTime = newFrame / fps;
    videoRef.current.currentTime = newTime;
    onVideoStateChange({
      ...videoState,
      currentFrame: newFrame,
      currentTime: newTime
    });
  }, [videoState, onVideoStateChange, videoRef, fps]);

  const nextFrame = useCallback(() => {
    if (!videoRef.current) return;
    const newFrame = Math.min(videoState.totalFrames - 1, videoState.currentFrame + 1);
    const newTime = newFrame / fps;
    videoRef.current.currentTime = newTime;
    onVideoStateChange({
      ...videoState,
      currentFrame: newFrame,
      currentTime: newTime
    });
  }, [videoState, onVideoStateChange, videoRef, fps]);

  const jumpToFirstFrame = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    onVideoStateChange({
      ...videoState,
      currentFrame: 0,
      currentTime: 0
    });
  }, [videoState, onVideoStateChange, videoRef]);

  const jumpToLastFrame = useCallback(() => {
    if (!videoRef.current) return;
    const lastFrame = videoState.totalFrames - 1;
    const lastTime = lastFrame / fps;
    videoRef.current.currentTime = lastTime;
    onVideoStateChange({
      ...videoState,
      currentFrame: lastFrame,
      currentTime: lastTime
    });
  }, [videoState, onVideoStateChange, videoRef, fps]);

  const jumpToPreviousAnnotatedFrame = useCallback(() => {
    const currentFrame = videoState.currentFrame;
    const previousFrames = annotatedFrames.filter(frame => frame < currentFrame).sort((a, b) => b - a);
    if (previousFrames.length > 0) {
      const targetFrame = previousFrames[0];
      const targetTime = targetFrame / fps;
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
      onVideoStateChange({
        ...videoState,
        currentFrame: targetFrame,
        currentTime: targetTime
      });
    }
  }, [videoState, onVideoStateChange, videoRef, fps, annotatedFrames]);

  const jumpToNextAnnotatedFrame = useCallback(() => {
    const currentFrame = videoState.currentFrame;
    const nextFrames = annotatedFrames.filter(frame => frame > currentFrame).sort((a, b) => a - b);
    if (nextFrames.length > 0) {
      const targetFrame = nextFrames[0];
      const targetTime = targetFrame / fps;
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
      onVideoStateChange({
        ...videoState,
        currentFrame: targetFrame,
        currentTime: targetTime
      });
    }
  }, [videoState, onVideoStateChange, videoRef, fps, annotatedFrames]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    onVideoStateChange({
      ...videoState,
      isMuted: newMuted
    });
  }, [isMuted, setIsMuted, videoState, onVideoStateChange, videoRef]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    onVideoStateChange({
      ...videoState,
      volume: newVolume
    });
  }, [setVolume, videoState, onVideoStateChange, videoRef]);

  const toggleLoop = useCallback(() => {
    if (!videoRef.current) return;
    const newLoop = !isLoopEnabled;
    videoRef.current.loop = newLoop;
    setIsLoopEnabled(newLoop);
  }, [isLoopEnabled, setIsLoopEnabled, videoRef]);

  // Scrubbing state for real-time drag on timeline
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null); // 0..100
  const wasPlayingRef = useRef(false);

  // Progress to display (scrub overrides live progress)
  const displayProgress = isScrubbing && scrubProgress !== null ? scrubProgress : safeProgress;

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!videoRef.current || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newFrame = Math.round(percentage * safeTotalFrames);
    const newTime = newFrame / fps;
    
    videoRef.current.currentTime = newTime;
    onVideoStateChange({
      ...videoState,
      currentFrame: newFrame,
      currentTime: newTime
    });
  }, [videoRef, timelineRef, safeTotalFrames, fps, videoState, onVideoStateChange]);

  // Start scrubbing on mousedown/touchstart
  const handleScrubStart = useCallback((clientX: number) => {
    if (!videoRef.current || !timelineRef.current || !videoReady) return;

    const video = videoRef.current;
    const rect = timelineRef.current.getBoundingClientRect();
    const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

    // Pause video during scrub, remember previous state
    wasPlayingRef.current = !video.paused;
    if (wasPlayingRef.current) {
      video.pause();
    }

    setIsScrubbing(true);

    // Compute initial
    const pct = clamp((clientX - rect.left) / rect.width);
    const frame = Math.round(pct * safeTotalFrames);
    const time = frame / fps;
    setScrubProgress(pct * 100);
    video.currentTime = time;
    onVideoStateChange({ ...videoState, currentFrame: frame, currentTime: time, isPlaying: false });

    // Handlers on document for smooth dragging
    const onMove = (ev: MouseEvent | TouchEvent) => {
      let x = clientX;
      if (ev instanceof TouchEvent) {
        if (ev.touches.length > 0) x = ev.touches[0].clientX;
      } else {
        x = (ev as MouseEvent).clientX;
      }
      const newPct = clamp((x - rect.left) / rect.width);
      const newFrame = Math.round(newPct * safeTotalFrames);
      const newTime = newFrame / fps;
      setScrubProgress(newPct * 100);
      if (!Number.isNaN(newTime)) {
        video.currentTime = newTime;
        onVideoStateChange({ ...videoState, currentFrame: newFrame, currentTime: newTime, isPlaying: false });
      }
    };

    const onUp = () => {
      setIsScrubbing(false);
      setScrubProgress(null);
      document.removeEventListener('mousemove', onMove as any);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove as any);
      document.removeEventListener('touchend', onUp);
      // Resume playback if it was playing
      if (wasPlayingRef.current) {
        video.play().catch(() => {});
        onVideoStateChange({ ...videoState, isPlaying: true });
      }
    };

    document.addEventListener('mousemove', onMove as any);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove as any, { passive: false });
    document.addEventListener('touchend', onUp, { passive: true });
  }, [videoRef, timelineRef, videoReady, fps, safeTotalFrames, onVideoStateChange, videoState]);

  return (
    <div className={`w-full ${theme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'} backdrop-blur-sm border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} ${controlsMinimized ? 'py-1 px-4' : 'p-4'} transition-all duration-300 shadow-lg`}>
      {/* Controls Header with Toggle */}
      <div className={`flex items-center justify-between ${controlsMinimized ? '' : `border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} pt-2`} mx-auto`} style={{ width: '97%' }}>
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

        {/* Quick frame info when minimized */}
        {controlsMinimized && (
          <div className={`text-sm font-mono ${themeClasses.text} flex items-center gap-2`}>
            <span className="font-bold">{safeDisplayFrame}</span>
            <span className="text-gray-500">/ {safeTotalFrames}</span>
            <span className="text-xs text-gray-400">
              {formatTime(safeDisplayFrame / fps)} / {formatTime(safeDuration)}
            </span>
          </div>
        )}
        
        {/* Quick play/pause when minimized */}
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

      {/* Full Controls */}
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
                onClick={togglePlay}
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
                <span className="font-mono">{fps.toFixed(1)} FPS</span>
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
            onMouseDown={(e) => {
              e.preventDefault();
              handleScrubStart(e.clientX);
            }}
            onTouchStart={(e) => {
              if (e.touches.length > 0) {
                e.preventDefault();
                handleScrubStart(e.touches[0].clientX);
              }
            }}
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
              style={{ width: `${displayProgress}%` }}
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
              style={{ left: `${displayProgress}%` }}
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
    </div>
  );
}

interface MediaContainerProps {
  // Media props
  mediaUrl: string;
  mediaType: "image" | "video";
  mediaWidth: number;
  mediaHeight: number;
  
  // Canvas props
  canvasState: ReviewCanvasState;
  onCanvasStateChange: (state: ReviewCanvasState) => void;
  
  // Video props (optional)
  videoState?: ReviewVideoState;
  onVideoStateChange?: (state: ReviewVideoState) => void;
  
  // Annotations and comments
  annotations: ReviewAnnotation[];
  comments: ReviewComment[];
  
  // Selection
  selectedAnnotationIds: string[];
  selectedCommentIds: string[];
  onAnnotationSelect: (ids: string[]) => void;
  onCommentSelect: (ids: string[]) => void;
  
  // Event handlers
  onAnnotationMove: (ids: string[], deltaX: number, deltaY: number) => void;
  onCommentMove?: (ids: string[], deltaX: number, deltaY: number) => void;
  onAnnotationResize?: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationCreated?: () => void;
  onCommentClick?: (comment: ReviewComment, position: { x: number; y: number }) => void;
  
  // Display options
  showAnnotations: boolean;
  showComments: boolean;
  theme?: 'light' | 'dark';
  
  // Session props
  sessionId: string;
  assetId?: string;
  
  // Video-specific props for controls
  annotatedFrames?: number[];
  maxHeight?: number;
  openDropdownCommentId?: string;
  openPopupCommentId?: string;
  onPopupClose?: () => void;
  onCommentUpdate?: () => void;
  frameJumpTarget?: number | null;
  comparisonModalOpen?: boolean;
  onComparisonModalChange?: (open: boolean) => void;
  
  // Video control state callbacks
  onVideoControlsStateChange?: (state: {
    videoReady: boolean;
    controlsMinimized: boolean;
    isLoopEnabled: boolean;
    isMuted: boolean;
    volume: number;
    timelineRef: React.RefObject<HTMLDivElement>;
    videoRef: React.RefObject<HTMLVideoElement>;
  }) => void;
}

export function MediaContainer({
  mediaUrl,
  mediaType,
  mediaWidth,
  mediaHeight,
  canvasState,
  onCanvasStateChange,
  videoState,
  onVideoStateChange,
  annotations,
  comments,
  selectedAnnotationIds,
  selectedCommentIds,
  onAnnotationSelect,
  onCommentSelect,
  onAnnotationMove,
  onCommentMove,
  onAnnotationResize,
  onAnnotationCreated,
  onCommentClick,
  showAnnotations,
  showComments,
  theme = 'light',
  sessionId,
  assetId,
  annotatedFrames = [],
  maxHeight,
  openDropdownCommentId,
  openPopupCommentId,
  onPopupClose,
  onCommentUpdate,
  frameJumpTarget,
  comparisonModalOpen,
  onComparisonModalChange,
  onVideoControlsStateChange
}: MediaContainerProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLElement>(null);
  const [mediaAspectRatio] = useState(mediaWidth / mediaHeight);
  
  // Container dimensions and positioning
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [mediaRect, setMediaRect] = useState<DOMRect | null>(null);
  
  // Drawing state
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  
  // State for comment creation
  const [tempBubble, setTempBubble] = useState<{
    id: string;
    position: { x: number; y: number };
    showInput: boolean;
    showDropdown: boolean;
  } | null>(null);
  
  // Optimistic state from canvas system
  const [optimisticPositions, setOptimisticPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [optimisticBounds, setOptimisticBounds] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  
  // Video comparison states
  const [comparisonMode, setComparisonMode] = useState<VideoComparisonMode>('normal');
  const [comparisonVideoUrl, setComparisonVideoUrl] = useState<string | undefined>();
  
  // Comparison handlers
  const handleModeChange = useCallback((mode: VideoComparisonMode) => {
    console.log('🔄 Changing comparison mode to:', mode);
    setComparisonMode(mode);
  }, []);
  
  const handleAddVideo = useCallback(() => {
    console.log('📹 Add video for comparison');
    // TODO: Implement video selection modal
  }, []);
  
  // Split mode handler - navigates to dedicated comparison page
  const handleSplitModeSelect = useCallback((mode: 'split-horizontal' | 'split-vertical' | 'overlay') => {
    console.log('🔀 Opening comparison page with mode:', mode);
    
    // Store comparison data in localStorage for the new page
    const comparisonData = {
      sessionId: sessionId,
      returnUrl: `/review/${sessionId}`,
      primaryVideo: {
        id: assetId || 'current',
        name: 'Primary Video',
        url: mediaUrl,
        // TODO: Get actual video duration and fps from video element
        duration: videoState?.duration || 0,
        fps: videoState?.fps || 30
      },
      selectedMode: mode,
      timestamp: Date.now()
    };
    
    localStorage.setItem('videoComparisonData', JSON.stringify(comparisonData));
    
    // Navigate to comparison page
    router.push(`/compare?session=${sessionId}&mode=${mode}`);
  }, [sessionId, assetId, mediaUrl, videoState, router]);
  
  // Convex mutations
  // Avoid deep generic instantiation by bypassing the generic path
  const createAnnotation = (useMutation as any)(api.review.createAnnotation) as any;
  
  // Video control state
  const [videoReady, setVideoReady] = useState(false);
  const [controlsMinimized, setControlsMinimized] = useState(false);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Notify parent of video control state changes
  useEffect(() => {
    if (onVideoControlsStateChange) {
      onVideoControlsStateChange({
        videoReady,
        controlsMinimized,
        isLoopEnabled,
        isMuted,
        volume,
        timelineRef,
        videoRef: mediaRef as React.RefObject<HTMLVideoElement>
      });
    }
  }, [videoReady, controlsMinimized, isLoopEnabled, isMuted, volume, onVideoControlsStateChange]);
  
  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Continuous frame polling during video playback for smooth frame-by-frame updates
  const pollVideoFrame = useCallback(() => {
    if (!videoState || !onVideoStateChange || !mediaRef.current) return;
    
    const video = mediaRef.current as HTMLVideoElement;
    const fps = videoState.fps || 30;
    const preciseFrame = video.currentTime * fps;
    const roundedFrame = Math.round(preciseFrame);
    const clampedFrame = Math.max(0, Math.min(roundedFrame, videoState.totalFrames - 1));
    
    // Always update if frame changed - this ensures we show every frame: 1,2,3,4,5,6...
    // Also update if time changed significantly for smooth timeline movement
    const frameChanged = clampedFrame !== videoState.currentFrame;
    const timeChanged = Math.abs(video.currentTime - videoState.currentTime) > 0.001;
    
    if (frameChanged || timeChanged) {
      onVideoStateChange({
        ...videoState,
        currentTime: video.currentTime,
        currentFrame: clampedFrame
      });
    }
    
    // Continue polling if video is still playing
    if (videoState.isPlaying && video && !video.paused && !video.ended) {
      animationFrameRef.current = requestAnimationFrame(pollVideoFrame);
    }
  }, [videoState, onVideoStateChange]);

  // Start/stop frame polling based on play state
  useEffect(() => {
    if (videoState?.isPlaying && mediaRef.current) {
      // Start polling when video plays
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(pollVideoFrame);
    } else {
      // Stop polling when video stops
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [videoState?.isPlaying, pollVideoFrame]);
  
  // Use refs to avoid circular dependencies in updateRects
  const containerRectRef = useRef<DOMRect | null>(containerRect);
  const optimisticPositionsRef = useRef(optimisticPositions);
  const optimisticBoundsRef = useRef(optimisticBounds);
  
  // Keep refs updated
  containerRectRef.current = containerRect;
  optimisticPositionsRef.current = optimisticPositions;
  optimisticBoundsRef.current = optimisticBounds;

  // Update container and media rects when container resizes
  const updateRects = useCallback(() => {
    if (containerRef.current && mediaRef.current) {
      const newContainerRect = containerRef.current.getBoundingClientRect();
      const newMediaRect = mediaRef.current.getBoundingClientRect();
      
      // Clear optimistic state when dimensions change to force re-render
      // BUT ONLY if we're not currently dragging/resizing
      const currentContainerRect = containerRectRef.current;
      if (currentContainerRect && (
        Math.abs(newContainerRect.width - currentContainerRect.width) > 1 ||
        Math.abs(newContainerRect.height - currentContainerRect.height) > 1
      )) {
        // Check if we have active optimistic state (indicating active drag/resize)
        const currentPositions = optimisticPositionsRef.current;
        const currentBounds = optimisticBoundsRef.current;
        const hasActiveOperations = currentPositions.size > 0 || currentBounds.size > 0;
        if (!hasActiveOperations) {
          setOptimisticPositions(new Map());
          setOptimisticBounds(new Map());
        }
      }
      
      setContainerRect(newContainerRect);
      setMediaRect(newMediaRect);
    }
  }, []); // No dependencies to avoid circular updates
  
  useEffect(() => {
    // Initial rect calculation
    updateRects();
    
    // Watch for container size changes with debouncing
    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize updates to avoid excessive recalculations
      requestAnimationFrame(() => {
        updateRects();
      });
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Also watch for media element changes
    if (mediaRef.current) {
      resizeObserver.observe(mediaRef.current as Element);
    }
    
    return () => resizeObserver.disconnect();
  }, [updateRects]);

  // Additional effect to handle window resize and sidebar toggles
  useEffect(() => {
    const handleWindowResize = () => {
      // Delay to ensure layout has updated
      setTimeout(() => {
        updateRects();
      }, 100);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [updateRects]);
  
  // Calculate optimal media dimensions within container
  const mediaStyle = useMemo(() => {
    if (!containerRect) return {};
    
    const containerAspectRatio = containerRect.width / containerRect.height;
    const availableWidth = containerRect.width - 80; // 40px margin on each side
    const availableHeight = containerRect.height - 80; // 40px margin on each side
    const availableAspectRatio = availableWidth / availableHeight;
    
    let width: number, height: number, left: number, top: number;
    
    if (mediaAspectRatio > availableAspectRatio) {
      // Media is wider than available space - fit to width
      width = availableWidth;
      height = availableWidth / mediaAspectRatio;
      left = 40; // Left margin
      top = (containerRect.height - height) / 2; // Center vertically
    } else {
      // Media is taller than available space - fit to height
      height = availableHeight;
      width = availableHeight * mediaAspectRatio;
      left = (containerRect.width - width) / 2; // Center horizontally  
      top = 40; // Top margin
    }
    
    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  }, [containerRect, mediaAspectRatio]);
  
  // Convert client coordinates to normalized media coordinates [0,1]
  const clientToNormalized = useCallback((clientX: number, clientY: number) => {
    if (!containerRect || !mediaRect) return { x: 0, y: 0 };
    
    const mediaLeft = parseFloat(mediaStyle.left?.toString().replace('px', '') || '0');
    const mediaTop = parseFloat(mediaStyle.top?.toString().replace('px', '') || '0');
    const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
    const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
    
    const relativeX = clientX - containerRect.left - mediaLeft;
    const relativeY = clientY - containerRect.top - mediaTop;
    
    return {
      x: Math.max(0, Math.min(1, relativeX / mediaWidth)),
      y: Math.max(0, Math.min(1, relativeY / mediaHeight))
    };
  }, [containerRect, mediaRect, mediaStyle]);
  
  // Convert normalized coordinates [0,1] to CSS coordinates within container
  const normalizedToCSS = useCallback((normalizedX: number, normalizedY: number) => {
    const mediaLeft = parseFloat(mediaStyle.left?.toString().replace('px', '') || '0');
    const mediaTop = parseFloat(mediaStyle.top?.toString().replace('px', '') || '0');
    const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
    const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
    
    return {
      x: mediaLeft + normalizedX * mediaWidth,
      y: mediaTop + normalizedY * mediaHeight
    };
  }, [mediaStyle]);
  
  // Drawing event handlers
  const startDrawing = useCallback((e: React.PointerEvent) => {
    console.log('startDrawing called', { 
      tool: canvasState.tool, 
      allowedTools: ["freehand", "rectangle", "circle", "arrow"] 
    });
    
    if (canvasState.tool === "select" || !canvasState || canvasState.tool === "eraser") {
      console.log('startDrawing early exit', { tool: canvasState.tool });
      return;
    }
    
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Convert to media-relative coordinates
    const mediaLeft = parseFloat(mediaStyle.left?.toString().replace('px', '') || '0');
    const mediaTop = parseFloat(mediaStyle.top?.toString().replace('px', '') || '0');
    const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
    const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
    
    if (clientX < mediaLeft || clientX > mediaLeft + mediaWidth || 
        clientY < mediaTop || clientY > mediaTop + mediaHeight) {
      return; // Outside media area
    }
    
    const coords = {
      x: clientX - mediaLeft,
      y: clientY - mediaTop
    };
    
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
  }, [canvasState, onCanvasStateChange, mediaStyle]);
  
  const draw = useCallback((e: React.PointerEvent) => {
    if (!canvasState.isDrawing || !drawingStart) return;
    
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const mediaLeft = parseFloat(mediaStyle.left?.toString().replace('px', '') || '0');
    const mediaTop = parseFloat(mediaStyle.top?.toString().replace('px', '') || '0');
    
    const coords = {
      x: clientX - mediaLeft,
      y: clientY - mediaTop
    };
    
    if (canvasState.tool === "freehand") {
      if (lastPoint) {
        const distance = Math.sqrt(
          Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
        );
        
        if (distance > 2) {
          const newPath = currentPath + ` L ${coords.x} ${coords.y}`;
          setCurrentPath(newPath);
          setLastPoint(coords);
        }
      }
    } else if (currentShape) {
      setCurrentShape({
        ...currentShape,
        current: coords
      });
    }
  }, [canvasState.isDrawing, canvasState.tool, drawingStart, lastPoint, currentPath, currentShape, mediaStyle]);
  
  const stopDrawing = useCallback(async () => {
    if (!canvasState.isDrawing || !drawingStart) {
      console.log('stopDrawing early exit', { 
        isDrawing: canvasState.isDrawing, 
        drawingStart, 
        tool: canvasState.tool 
      });
      return;
    }
    
    console.log('stopDrawing called', { 
      tool: canvasState.tool, 
      currentPath, 
      currentShape, 
      drawingStart,
      sessionId,
      assetId,
      sessionIdType: typeof sessionId,
      assetIdType: typeof assetId 
    });
    
    onCanvasStateChange({
      ...canvasState,
      isDrawing: false
    });
    
    try {
      if (canvasState.tool === "freehand" && currentPath) {
        // Convert coordinates to normalized [0,1] range
        const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
        const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
        
        const normalizedPosition = {
          x: drawingStart.x / mediaWidth,
          y: drawingStart.y / mediaHeight
        };
        
        console.log('Creating freehand annotation with:', {
          sessionId,
          assetId,
          position: normalizedPosition,
          frameNumber: videoState?.currentFrame || 0,
          frameTimestamp: videoState?.currentTime,
          path: currentPath
        });
        
        const result = await createAnnotation({
          sessionId: sessionId as any,
          assetId: assetId as any,
          position: normalizedPosition,
          frameNumber: videoState?.currentFrame || 0,
          frameTimestamp: videoState?.currentTime,
          type: "freehand",
          drawingData: {
            path: currentPath,
            style: {
              color: canvasState.color,
              strokeWidth: canvasState.strokeWidth,
              opacity: canvasState.opacity
            }
          }
        });
        
        console.log('Freehand annotation creation result:', result);
        
        console.log('Freehand annotation created successfully');
      } else if (currentShape && drawingStart) {
        const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
        const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
        
        const bounds = {
          x: Math.min(drawingStart.x, currentShape.current.x) / mediaWidth,
          y: Math.min(drawingStart.y, currentShape.current.y) / mediaHeight,
          width: Math.abs(currentShape.current.x - drawingStart.x) / mediaWidth,
          height: Math.abs(currentShape.current.y - drawingStart.y) / mediaHeight
        };
        
        const normalizedPosition = {
          x: bounds.x,
          y: bounds.y
        };
        
        console.log('Creating shape annotation with:', {
          sessionId,
          assetId,
          position: normalizedPosition,
          frameNumber: videoState?.currentFrame || 0,
          frameTimestamp: videoState?.currentTime,
          type: currentShape.type,
          bounds
        });
        
        const result = await createAnnotation({
          sessionId: sessionId as any,
          assetId: assetId as any,
          position: normalizedPosition,
          frameNumber: videoState?.currentFrame || 0,
          frameTimestamp: videoState?.currentTime,
          type: currentShape.type,
          drawingData: {
            bounds,
            style: {
              color: canvasState.color,
              strokeWidth: canvasState.strokeWidth,
              opacity: canvasState.opacity,
              fillColor: canvasState.tool === "rectangle" || canvasState.tool === "circle" ? "transparent" : undefined
            }
          }
        });
        
        console.log('Shape annotation creation result:', result);
        
        console.log('Shape annotation created successfully');
      }
      
      onAnnotationCreated?.();
    } catch (error) {
      console.error("Error creating annotation:", error);
    }
    
    // Reset drawing state
    setCurrentPath('');
    setCurrentShape(null);
    setDrawingStart(null);
    setLastPoint(null);
  }, [canvasState, drawingStart, currentPath, currentShape, mediaStyle, createAnnotation, sessionId, assetId, videoState, onAnnotationCreated, onCanvasStateChange]);
  
  // Handle annotation moves - coordinates are already normalized from ReviewAnnotationSelector
  const handleAnnotationMove = useCallback((ids: string[], normalizedDeltaX: number, normalizedDeltaY: number) => {
    console.log("🔧 MediaContainer.handleAnnotationMove called with normalized coords:", { normalizedDeltaX, normalizedDeltaY });
    onAnnotationMove(ids, normalizedDeltaX, normalizedDeltaY);
  }, [onAnnotationMove]);
  
  // Handle comment moves - coordinates are already normalized from ReviewAnnotationSelector
  const handleCommentMove = useCallback((ids: string[], normalizedDeltaX: number, normalizedDeltaY: number) => {
    if (!onCommentMove) return;
    console.log("🔧 MediaContainer.handleCommentMove called with normalized coords:", { normalizedDeltaX, normalizedDeltaY });
    onCommentMove(ids, normalizedDeltaX, normalizedDeltaY);
  }, [onCommentMove]);
  
  // Handle optimistic state changes from canvas system
  const handleOptimisticStateChange = useCallback((
    positions: Map<string, { x: number; y: number }>, 
    bounds: Map<string, { x: number; y: number; width: number; height: number }>
  ) => {
    setOptimisticPositions(positions);
    setOptimisticBounds(bounds);
  }, []);

  // Handle double-click for comment creation
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!showComments) return;
    
    console.log('Double-click on MediaContainer for comment creation');
    
    // Get coordinates within the media
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Check if click is within media bounds
    const mediaLeft = parseFloat(mediaStyle.left?.toString().replace('px', '') || '0');
    const mediaTop = parseFloat(mediaStyle.top?.toString().replace('px', '') || '0');
    const mediaWidth = parseFloat(mediaStyle.width?.toString().replace('px', '') || '0');
    const mediaHeight = parseFloat(mediaStyle.height?.toString().replace('px', '') || '0');
    
    if (clientX < mediaLeft || clientX > mediaLeft + mediaWidth || 
        clientY < mediaTop || clientY > mediaTop + mediaHeight) {
      return; // Outside media area
    }
    
    // Convert to normalized coordinates for comment position
    const normalizedPos = clientToNormalized(e.clientX, e.clientY);
    
    console.log('Creating comment at normalized position:', normalizedPos);
    
    // Create temporary bubble for comment input
    const tempId = `temp-${Date.now()}`;
    setTempBubble({
      id: tempId,
      position: { x: clientX - mediaLeft, y: clientY - mediaTop }, // Position relative to media
      showInput: true,
      showDropdown: false
    });
  }, [showComments, mediaStyle, clientToNormalized, mediaType, videoState]);
  
  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`}
      style={{
        height: maxHeight ? `${maxHeight}px` : '100%',
        maxHeight: maxHeight ? `${maxHeight}px` : 'none',
        minHeight: '400px'
      }}
    >
      {/* Background Media (Video or Image) */}
      {mediaType === 'video' ? (
        <video
          ref={mediaRef as any}
          src={mediaUrl}
          style={mediaStyle}
          className="z-0"
          controls={false}
          onLoadedMetadata={(e) => {
            const video = e.target as HTMLVideoElement;
            setVideoReady(true);
            if (videoState && onVideoStateChange) {
              // Calculate precise FPS based on actual video metadata
              const videoFPS = 30; // Default, could be extracted from video metadata if available
              onVideoStateChange({
                ...videoState,
                duration: video.duration,
                totalFrames: Math.round(video.duration * videoFPS),
                fps: videoFPS,
                isLoaded: true
              });
            }
          }}
          onTimeUpdate={(e) => {
            // Only handle timeUpdate when video is paused (for seek operations)
            // During playback, frame polling with requestAnimationFrame handles updates
            if (videoState && onVideoStateChange && !videoState.isPlaying) {
              const video = e.target as HTMLVideoElement;
              const fps = videoState.fps || 30;
              const preciseFrame = video.currentTime * fps;
              const roundedFrame = Math.round(preciseFrame);
              const clampedFrame = Math.max(0, Math.min(roundedFrame, videoState.totalFrames - 1));
              
              // Update immediately when paused/seeking
              if (clampedFrame !== videoState.currentFrame || Math.abs(video.currentTime - videoState.currentTime) > 0.001) {
                onVideoStateChange({
                  ...videoState,
                  currentTime: video.currentTime,
                  currentFrame: clampedFrame
                });
              }
            }
          }}
          onPlay={() => {
            if (videoState && onVideoStateChange) {
              onVideoStateChange({ ...videoState, isPlaying: true });
            }
          }}
          onPause={() => {
            if (videoState && onVideoStateChange) {
              onVideoStateChange({ ...videoState, isPlaying: false });
            }
          }}
          onVolumeChange={(e) => {
            const video = e.target as HTMLVideoElement;
            setVolume(video.volume);
            setIsMuted(video.muted);
          }}
        />
      ) : (
        <img
          ref={mediaRef as any}
          src={mediaUrl}
          style={mediaStyle}
          className="z-0 object-contain"
          alt="Review asset"
        />
      )}
      
      {/* Unified Overlay Container - exactly same size and position as media */}
      <div
        className="absolute"
        style={{
          ...mediaStyle,
          zIndex: 10,
          pointerEvents: canvasState.tool === 'select' ? 'auto' : 'auto', // Allow both selection and drawing
          cursor: canvasState.tool === 'select' ? 'default' : 
                 canvasState.tool === 'freehand' ? 'crosshair' :
                 ['rectangle', 'circle', 'arrow'].includes(canvasState.tool) ? 'crosshair' : 'default'
        }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        onDoubleClick={handleDoubleClick}
      >
        {/* Drawing Preview Layer */}
        {canvasState.isDrawing && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
            {canvasState.tool === "freehand" && currentPath && (
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
            
            {currentShape && (
              <>
                {currentShape.type === "rectangle" && (
                  <rect
                    x={Math.min(currentShape.start.x, currentShape.current.x)}
                    y={Math.min(currentShape.start.y, currentShape.current.y)}
                    width={Math.abs(currentShape.current.x - currentShape.start.x)}
                    height={Math.abs(currentShape.current.y - currentShape.start.y)}
                    stroke={canvasState.color}
                    strokeWidth={canvasState.strokeWidth}
                    fill="transparent"
                    opacity={canvasState.opacity}
                  />
                )}
                
                {currentShape.type === "circle" && (
                  <ellipse
                    cx={currentShape.start.x + (currentShape.current.x - currentShape.start.x) / 2}
                    cy={currentShape.start.y + (currentShape.current.y - currentShape.start.y) / 2}
                    rx={Math.abs(currentShape.current.x - currentShape.start.x) / 2}
                    ry={Math.abs(currentShape.current.y - currentShape.start.y) / 2}
                    stroke={canvasState.color}
                    strokeWidth={canvasState.strokeWidth}
                    fill="transparent"
                    opacity={canvasState.opacity}
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
                      strokeLinecap="round"
                    />
                    <polygon
                      points={`${currentShape.current.x},${currentShape.current.y} ${currentShape.current.x - 10},${currentShape.current.y - 5} ${currentShape.current.x - 10},${currentShape.current.y + 5}`}
                      fill={canvasState.color}
                      opacity={canvasState.opacity}
                    />
                  </g>
                )}
              </>
            )}
          </svg>
        )}
        
        {/* Annotation Layer - renders existing annotations and comments */}
        {(showAnnotations || showComments) && (
          <div style={{ pointerEvents: 'auto', zIndex: 20 }} className="absolute inset-0">
            <ReviewAnnotationLayer
              annotations={showAnnotations ? annotations : []}
              comments={showComments ? comments : []}
              tempBubble={tempBubble}
              canvasState={canvasState}
              currentPath={currentPath}
              currentShape={currentShape}
              onCommentClick={onCommentClick}
              onTempBubbleUpdate={setTempBubble}
              sessionId={sessionId}
              theme={theme}
              openPopupCommentId={openPopupCommentId}
              onPopupClose={onPopupClose}
              onCommentUpdate={onCommentUpdate}
              normalizePositions={true}
              applyTransform={false}
              canvasSize={undefined} // Use normalized coordinates instead
              assetId={assetId}
              displayFrame={mediaType === 'video' ? videoState?.currentFrame : undefined}
              fps={mediaType === 'video' ? (videoState?.fps || 30) : undefined}
              optimisticPositions={optimisticPositions}
              optimisticBounds={optimisticBounds}
            />
            
            {/* Optimized board-like canvas system with real-time updates */}
            {canvasState.tool === 'select' && (
              <ReviewCanvasSystemOptimized
                annotations={annotations}
                comments={comments}
                selectedAnnotationIds={selectedAnnotationIds}
                selectedCommentIds={selectedCommentIds}
                onAnnotationSelect={onAnnotationSelect}
                onCommentSelect={onCommentSelect}
                onAnnotationMove={handleAnnotationMove}
                onCommentMove={handleCommentMove}
                onAnnotationResize={onAnnotationResize}
                theme={theme}
                containerRect={mediaRect}
                onOptimisticStateChange={handleOptimisticStateChange}
              />
            )}
          </div>
        )}
      </div>
      
      {/* Comparison Settings Modal - Only for videos */}
      {mediaType === 'video' && comparisonModalOpen !== undefined && onComparisonModalChange && (
        <ComparisonSettingsOverlay
          currentMode={comparisonMode}
          onModeChange={handleModeChange}
          hasComparisonVideo={!!comparisonVideoUrl}
          onAddVideo={handleAddVideo}
          onSplitModeSelect={handleSplitModeSelect}
          isOpen={comparisonModalOpen}
          onOpenChange={onComparisonModalChange}
          hideButton={true}
          theme={theme || 'light'}
        />
      )}
      
    </div>
  );
}