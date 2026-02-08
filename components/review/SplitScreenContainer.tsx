"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { VideoComparisonMode } from "@/types/canvas";
import { X } from "lucide-react";

interface SplitScreenContainerProps {
  primaryVideoUrl: string;
  comparisonVideoUrl: string;
  mode: 'split-horizontal' | 'split-vertical';
  splitRatio: number; // 0-1 where 0.5 = 50/50 split
  isSynced: boolean;
  syncMaster: 'primary' | 'comparison';
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  onVideoReady?: (videoDimensions: { width: number; height: number }) => void;
  onFrameUpdate?: (frame: number, time: number) => void;
  onClose?: () => void; // Function to close fullscreen mode
  className?: string;
  width?: number;
  height?: number;
}

export function SplitScreenContainer({
  primaryVideoUrl,
  comparisonVideoUrl,
  mode,
  splitRatio,
  isSynced,
  syncMaster,
  currentFrame,
  fps,
  isPlaying,
  onVideoReady,
  onFrameUpdate,
  onClose,
  className = "",
  width,
  height
}: SplitScreenContainerProps) {
  
  // Refs for video elements and canvases
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const comparisonVideoRef = useRef<HTMLVideoElement>(null);
  const primaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const comparisonCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  
  // State for video readiness
  const [primaryReady, setPrimaryReady] = useState(false);
  const [comparisonReady, setComparisonReady] = useState(false);
  const [canvasInitialized, setCanvasInitialized] = useState(false);
  
  // State for calculated dimensions
  const [calculatedDimensions, setCalculatedDimensions] = useState({
    primaryWidth: 400,
    primaryHeight: 300,
    comparisonWidth: 400,
    comparisonHeight: 300
  });

  // Check if both videos are ready
  const bothVideosReady = primaryReady && comparisonReady && canvasInitialized;

  // Calculate split dimensions
  const isHorizontal = mode === 'split-horizontal';
  
  // CORE: Render frames on both canvases
  const renderFrames = useCallback(() => {
    const primaryCanvas = primaryCanvasRef.current;
    const comparisonCanvas = comparisonCanvasRef.current;
    const primaryVideo = primaryVideoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryCanvas || !comparisonCanvas || !primaryVideo || !comparisonVideo || !bothVideosReady) return;

    const primaryCtx = primaryCanvas.getContext('2d');
    const comparisonCtx = comparisonCanvas.getContext('2d');
    
    if (!primaryCtx || !comparisonCtx) return;

    try {
      // CRITICAL: For paused videos, be more lenient with readyState
      const minReadyState = (primaryVideo.paused && comparisonVideo.paused) ? 1 : 2;
      
      if (primaryVideo.readyState < minReadyState || comparisonVideo.readyState < minReadyState) {
        return;
      }
      
      if (primaryVideo.videoWidth === 0 || comparisonVideo.videoWidth === 0) {
        return;
      }

      // Clear and render in atomic operations
      primaryCtx.clearRect(0, 0, primaryCanvas.width, primaryCanvas.height);
      comparisonCtx.clearRect(0, 0, comparisonCanvas.width, comparisonCanvas.height);
      
      // Draw primary video on its canvas
      primaryCtx.drawImage(primaryVideo, 0, 0, primaryCanvas.width, primaryCanvas.height);
      
      // Draw comparison video on its canvas
      comparisonCtx.drawImage(comparisonVideo, 0, 0, comparisonCanvas.width, comparisonCanvas.height);
      
    } catch (error) {
      console.warn('Split screen rendering error:', error);
    }
  }, [bothVideosReady]);

  // CORE: Synchronize videos to specific frame - with smart seeking
  const syncToFrame = useCallback((frame: number) => {
    const primaryVideo = primaryVideoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryVideo || !comparisonVideo || !bothVideosReady) return;

    const targetTime = frame / fps;
    const tolerance = 1 / fps; // One frame tolerance
    
    // Only seek if the videos are not already at the target time (within tolerance)
    const primaryNeedsSeek = Math.abs(primaryVideo.currentTime - targetTime) > tolerance;
    const comparisonNeedsSeek = Math.abs(comparisonVideo.currentTime - targetTime) > tolerance;
    
    if (!primaryNeedsSeek && !comparisonNeedsSeek) {
      // Already at correct frame, just re-render
      renderFrames();
      onFrameUpdate?.(frame, targetTime);
      return;
    }
    
    // Set videos to target time only if needed
    if (primaryNeedsSeek) {
      primaryVideo.currentTime = targetTime;
    }
    if (comparisonNeedsSeek) {
      comparisonVideo.currentTime = targetTime;
    }
    
    // For paused videos, render immediately after seek
    // For playing videos, use small delay
    const renderDelay = (primaryVideo.paused && comparisonVideo.paused) ? 10 : 50;
    setTimeout(() => {
      renderFrames();
      onFrameUpdate?.(frame, targetTime);
    }, renderDelay);
    
  }, [fps, bothVideosReady, renderFrames, onFrameUpdate]);

  // CORE: Animation loop for playing videos
  const updateLoop = useCallback(() => {
    if (!isPlaying || !bothVideosReady) return;

    const masterVideo = syncMaster === 'primary' 
      ? primaryVideoRef.current 
      : comparisonVideoRef.current;
    
    const slaveVideo = syncMaster === 'primary' 
      ? comparisonVideoRef.current 
      : primaryVideoRef.current;

    if (!masterVideo || !slaveVideo) return;

    // Sync slave to master if needed
    if (isSynced && Math.abs(slaveVideo.currentTime - masterVideo.currentTime) > 0.1) {
      slaveVideo.currentTime = masterVideo.currentTime;
    }

    // Render current frames
    renderFrames();
    
    // Update frame info
    const currentTime = masterVideo.currentTime;
    const frame = Math.floor(currentTime * fps);
    onFrameUpdate?.(frame, currentTime);

    // Continue animation loop
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    }
  }, [isPlaying, bothVideosReady, isSynced, syncMaster, fps, renderFrames, onFrameUpdate]);

  // Utility function to detect if URL is a video or image
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const urlLower = url.toLowerCase();
    return videoExtensions.some(ext => urlLower.includes(ext)) || 
           url.includes('video') || 
           (!url.includes('image') && !urlLower.includes('.jpg') && !urlLower.includes('.jpeg') && !urlLower.includes('.png') && !urlLower.includes('.gif'));
  };

  // SETUP: Initialize videos when URLs change
  useEffect(() => {
    const primaryVideo = primaryVideoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!primaryVideo || !comparisonVideo) return;

    // Validate URLs
    if (!primaryVideoUrl || !comparisonVideoUrl) {
      console.warn('⚠️ Missing split video URLs:', { primaryVideoUrl, comparisonVideoUrl });
      return;
    }

    // Check if URLs are actually videos
    const primaryIsVideo = isVideoUrl(primaryVideoUrl);
    const comparisonIsVideo = isVideoUrl(comparisonVideoUrl);
    

    if (!primaryIsVideo) {
      console.error('❌ Primary asset is not a video:', primaryVideoUrl);
      return;
    }

    if (!comparisonIsVideo) {
      console.error('❌ Comparison asset is not a video:', comparisonVideoUrl);
      console.warn('💡 Images are not yet supported in split screen mode. Please select a video for comparison.');
      return;
    }

    // Reset states
    setPrimaryReady(false);
    setComparisonReady(false);
    setCanvasInitialized(false);

    // Primary video handlers
    const handlePrimaryReady = () => {
      setPrimaryReady(true);
    };

    const handlePrimaryError = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      console.error('❌ Split primary video error:', {
        event: e,
        url: primaryVideoUrl,
        readyState: video?.readyState,
        networkState: video?.networkState,
        error: video?.error,
        errorCode: video?.error?.code,
        errorMessage: video?.error?.message
      });
    };

    const handleComparisonReady = () => {
      setComparisonReady(true);
    };

    const handleComparisonError = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      console.error('❌ Split comparison video error:', {
        event: e,
        url: comparisonVideoUrl,
        readyState: video?.readyState,
        networkState: video?.networkState,
        error: video?.error,
        errorCode: video?.error?.code,
        errorMessage: video?.error?.message
      });
    };

    // Validate URLs
    if (!primaryVideoUrl || !comparisonVideoUrl) {
      console.warn('⚠️ Missing split video URLs:', { primaryVideoUrl, comparisonVideoUrl });
      return;
    }

    // Setup video sources and properties
    
    primaryVideo.src = primaryVideoUrl;
    comparisonVideo.src = comparisonVideoUrl;
    
    [primaryVideo, comparisonVideo].forEach(video => {
      video.preload = 'metadata';
      video.playsInline = true;
      video.muted = true; // Always muted for comparison videos
      video.controls = false;
      video.autoplay = false;
      // Removed crossOrigin to avoid CORS issues with S3
    });

    // Add event listeners
    primaryVideo.addEventListener('loadedmetadata', handlePrimaryReady);
    primaryVideo.addEventListener('canplay', handlePrimaryReady);
    primaryVideo.addEventListener('error', handlePrimaryError);
    comparisonVideo.addEventListener('loadedmetadata', handleComparisonReady);
    comparisonVideo.addEventListener('canplay', handleComparisonReady);
    comparisonVideo.addEventListener('error', handleComparisonError);

    // Add timeout detection for video loading
    const timeoutId = setTimeout(() => {
      console.warn('⏰ Split video loading timeout (30s):', {
        primary: { ready: primaryReady, readyState: primaryVideo.readyState },
        comparison: { ready: comparisonReady, readyState: comparisonVideo.readyState }
      });
    }, 30000);

    // Force load
    primaryVideo.load();
    comparisonVideo.load();

    return () => {
      clearTimeout(timeoutId);
      primaryVideo.removeEventListener('loadedmetadata', handlePrimaryReady);
      primaryVideo.removeEventListener('canplay', handlePrimaryReady);
      primaryVideo.removeEventListener('error', handlePrimaryError);
      comparisonVideo.removeEventListener('loadedmetadata', handleComparisonReady);
      comparisonVideo.removeEventListener('canplay', handleComparisonReady);
      comparisonVideo.removeEventListener('error', handleComparisonError);
    };
  }, [primaryVideoUrl, comparisonVideoUrl]);

  // SETUP: Initialize canvases when both videos are ready
  useEffect(() => {
    if (!primaryReady || !comparisonReady) return;

    const primaryCanvas = primaryCanvasRef.current;
    const comparisonCanvas = comparisonCanvasRef.current;
    const primaryVideo = primaryVideoRef.current;
    const container = containerRef.current;
    
    if (!primaryCanvas || !comparisonCanvas || !primaryVideo || !container) return;

    // RESPONSIVE SIZING: Use real-time viewport dimensions for fullscreen experience
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Full viewport sizing with small margins
    const containerWidth = viewportWidth * 0.98; // 98% of viewport width
    const containerHeight = viewportHeight * 0.95; // 95% of viewport height
    
    
    // Get video aspect ratio for proper scaling
    const videoAspectRatio = primaryVideo.videoWidth / primaryVideo.videoHeight;
    
    // Calculate dimensions for split layout - MAXIMIZE SIZE while maintaining aspect ratio
    let primaryWidth: number, primaryHeight: number, comparisonWidth: number, comparisonHeight: number;
    
    if (isHorizontal) {
      // Horizontal split: side by side
      // Calculate available space for each video
      const availablePrimaryWidth = containerWidth * splitRatio;
      const availableComparisonWidth = containerWidth * (1 - splitRatio);
      const availableHeight = containerHeight;
      
      // SCALE TO FIT algorithm for primary video
      // Try scaling by width first
      const primaryWidthScaled = availablePrimaryWidth;
      const primaryHeightByWidth = primaryWidthScaled / videoAspectRatio;
      
      // Try scaling by height first  
      const primaryHeightScaled = availableHeight;
      const primaryWidthByHeight = primaryHeightScaled * videoAspectRatio;
      
      // Choose the scaling that gives us the largest video that fits
      if (primaryHeightByWidth <= availableHeight && primaryWidthByHeight <= availablePrimaryWidth) {
        // Both scalings fit, choose the one that gives larger area
        if (primaryWidthScaled * primaryHeightByWidth >= primaryWidthByHeight * primaryHeightScaled) {
          primaryWidth = primaryWidthScaled;
          primaryHeight = primaryHeightByWidth;
        } else {
          primaryWidth = primaryWidthByHeight;
          primaryHeight = primaryHeightScaled;
        }
      } else if (primaryHeightByWidth <= availableHeight) {
        // Width-based scaling fits
        primaryWidth = primaryWidthScaled;
        primaryHeight = primaryHeightByWidth;
      } else {
        // Height-based scaling fits
        primaryWidth = primaryWidthByHeight;
        primaryHeight = primaryHeightScaled;
      }
      
      // Same algorithm for comparison video
      const comparisonWidthScaled = availableComparisonWidth;
      const comparisonHeightByWidth = comparisonWidthScaled / videoAspectRatio;
      
      const comparisonHeightScaled = availableHeight;
      const comparisonWidthByHeight = comparisonHeightScaled * videoAspectRatio;
      
      if (comparisonHeightByWidth <= availableHeight && comparisonWidthByHeight <= availableComparisonWidth) {
        if (comparisonWidthScaled * comparisonHeightByWidth >= comparisonWidthByHeight * comparisonHeightScaled) {
          comparisonWidth = comparisonWidthScaled;
          comparisonHeight = comparisonHeightByWidth;
        } else {
          comparisonWidth = comparisonWidthByHeight;
          comparisonHeight = comparisonHeightScaled;
        }
      } else if (comparisonHeightByWidth <= availableHeight) {
        comparisonWidth = comparisonWidthScaled;
        comparisonHeight = comparisonHeightByWidth;
      } else {
        comparisonWidth = comparisonWidthByHeight;
        comparisonHeight = comparisonHeightScaled;
      }
      
    } else {
      // Vertical split: top and bottom
      // Calculate available space for each video
      const availableWidth = containerWidth;
      const availablePrimaryHeight = containerHeight * splitRatio;
      const availableComparisonHeight = containerHeight * (1 - splitRatio);
      
      // SCALE TO FIT algorithm for primary video
      const primaryWidthScaled = availableWidth;
      const primaryHeightByWidth = primaryWidthScaled / videoAspectRatio;
      
      const primaryHeightScaled = availablePrimaryHeight;
      const primaryWidthByHeight = primaryHeightScaled * videoAspectRatio;
      
      if (primaryHeightByWidth <= availablePrimaryHeight && primaryWidthByHeight <= availableWidth) {
        if (primaryWidthScaled * primaryHeightByWidth >= primaryWidthByHeight * primaryHeightScaled) {
          primaryWidth = primaryWidthScaled;
          primaryHeight = primaryHeightByWidth;
        } else {
          primaryWidth = primaryWidthByHeight;
          primaryHeight = primaryHeightScaled;
        }
      } else if (primaryHeightByWidth <= availablePrimaryHeight) {
        primaryWidth = primaryWidthScaled;
        primaryHeight = primaryHeightByWidth;
      } else {
        primaryWidth = primaryWidthByHeight;
        primaryHeight = primaryHeightScaled;
      }
      
      // Same for comparison video
      const comparisonWidthScaled = availableWidth;
      const comparisonHeightByWidth = comparisonWidthScaled / videoAspectRatio;
      
      const comparisonHeightScaled = availableComparisonHeight;
      const comparisonWidthByHeight = comparisonHeightScaled * videoAspectRatio;
      
      if (comparisonHeightByWidth <= availableComparisonHeight && comparisonWidthByHeight <= availableWidth) {
        if (comparisonWidthScaled * comparisonHeightByWidth >= comparisonWidthByHeight * comparisonHeightScaled) {
          comparisonWidth = comparisonWidthScaled;
          comparisonHeight = comparisonHeightByWidth;
        } else {
          comparisonWidth = comparisonWidthByHeight;
          comparisonHeight = comparisonHeightScaled;
        }
      } else if (comparisonHeightByWidth <= availableComparisonHeight) {
        comparisonWidth = comparisonWidthScaled;
        comparisonHeight = comparisonHeightByWidth;
      } else {
        comparisonWidth = comparisonWidthByHeight;
        comparisonHeight = comparisonHeightScaled;
      }
    }
    
    // Set canvas dimensions
    primaryCanvas.width = Math.floor(primaryWidth);
    primaryCanvas.height = Math.floor(primaryHeight);
    comparisonCanvas.width = Math.floor(comparisonWidth);
    comparisonCanvas.height = Math.floor(comparisonHeight);
    
    // Update state with calculated dimensions for CSS
    setCalculatedDimensions({
      primaryWidth: Math.floor(primaryWidth),
      primaryHeight: Math.floor(primaryHeight),
      comparisonWidth: Math.floor(comparisonWidth),
      comparisonHeight: Math.floor(comparisonHeight)
    });
    
    
    setCanvasInitialized(true);
    
    // Notify parent about video dimensions
    onVideoReady?.({ width: containerWidth, height: containerHeight });
    
    // Render initial frames
    setTimeout(() => {
      renderFrames();
    }, 100);
    
  }, [primaryReady, comparisonReady, mode, splitRatio, width, height, isHorizontal, onVideoReady, renderFrames]);

  // EFFECT: Handle frame changes - IMMEDIATE for paused videos
  useEffect(() => {
    if (!bothVideosReady || isPlaying) return;
    
    // NO debouncing for paused videos - render immediately
    syncToFrame(currentFrame);
  }, [currentFrame, bothVideosReady, isPlaying, syncToFrame]);

  // EFFECT: Handle play/pause changes
  useEffect(() => {
    const primaryVideo = primaryVideoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!bothVideosReady) return;

    if (isPlaying) {
      // Start playback
      primaryVideo?.play().catch(console.warn);
      comparisonVideo?.play().catch(console.warn);
      
      // Start animation loop
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    } else {
      // Pause playback
      primaryVideo?.pause();
      comparisonVideo?.pause();
      
      // Stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, bothVideosReady, updateLoop]);

  // EFFECT: Re-render when split ratio changes - IMMEDIATE for paused videos
  useEffect(() => {
    if (!bothVideosReady || isPlaying) return;
    
    // NO debouncing for split ratio changes on paused videos
    // Force re-initialization of canvas dimensions
    setCanvasInitialized(false);
    setTimeout(() => setCanvasInitialized(true), 50);
  }, [splitRatio, bothVideosReady, isPlaying]);

  // RESPONSIVE: Listen for window resize to adapt video dimensions in real-time
  useEffect(() => {
    const handleResize = () => {
      if (!bothVideosReady) return;
      
      // Trigger canvas re-initialization with new viewport dimensions
      setCanvasInitialized(false);
      setTimeout(() => setCanvasInitialized(true), 100);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bothVideosReady]);

  return (
    <div 
      ref={containerRef} 
      className={`relative ${className} split-screen-container`}
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 10,
        overflow: 'hidden',
        // Hide scrollbars completely
        scrollbarWidth: 'none', // Firefox
        msOverflowStyle: 'none', // IE/Edge
      }}
    >
      {/* CSS to hide WebKit scrollbars */}
      <style jsx>{`
        .split-screen-container::-webkit-scrollbar {
          display: none;
        }
        .split-screen-container {
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
      {/* Hidden video elements */}
      <video
        ref={primaryVideoRef}
        className="hidden"
        playsInline
        muted
        controls={false}
      />
      
      <video
        ref={comparisonVideoRef}
        className="hidden"
        playsInline
        muted
        controls={false}
      />

      {/* Close Button - Fixed Position */}
      {onClose && (
        <button
          onClick={onClose}
          className="fixed top-4 right-4 z-50 bg-black/70 hover:bg-black/90 text-white rounded-full p-2 transition-colors duration-200"
          title="Exit comparison mode"
        >
          <X className="h-6 w-6" />
        </button>
      )}

      {/* Split Screen Layout - Responsive Fullscreen */}
      <div 
        className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full items-center justify-center`}
        style={{ 
          height: '100vh', 
          width: '100vw',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Primary Video Canvas */}
        <div 
          className="relative bg-black flex items-center justify-center"
          style={{
            width: `${calculatedDimensions.primaryWidth}px`,
            height: `${calculatedDimensions.primaryHeight}px`,
            minWidth: `${calculatedDimensions.primaryWidth}px`,
            minHeight: `${calculatedDimensions.primaryHeight}px`,
            flexShrink: 0,
            overflow: 'hidden'
          }}
        >
          <canvas
            ref={primaryCanvasRef}
            style={{
              background: 'black',
              borderRadius: isHorizontal ? '8px 0 0 8px' : '8px 8px 0 0',
              width: `${calculatedDimensions.primaryWidth}px`,
              height: `${calculatedDimensions.primaryHeight}px`,
              display: 'block'
            }}
          />
          
          {/* Primary Video Label */}
          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            Primary
          </div>
        </div>

        {/* Divider */}
        <div 
          className={`bg-gray-300 dark:bg-gray-600 ${
            isHorizontal ? 'w-px min-w-px' : 'h-px min-h-px'
          }`}
        />

        {/* Comparison Video Canvas */}
        <div 
          className="relative bg-black flex items-center justify-center"
          style={{
            width: `${calculatedDimensions.comparisonWidth}px`,
            height: `${calculatedDimensions.comparisonHeight}px`,
            minWidth: `${calculatedDimensions.comparisonWidth}px`,
            minHeight: `${calculatedDimensions.comparisonHeight}px`,
            flexShrink: 0,
            overflow: 'hidden'
          }}
        >
          <canvas
            ref={comparisonCanvasRef}
            style={{
              background: 'black',
              borderRadius: isHorizontal ? '0 8px 8px 0' : '0 0 8px 8px',
              width: `${calculatedDimensions.comparisonWidth}px`,
              height: `${calculatedDimensions.comparisonHeight}px`,
              display: 'block'
            }}
          />
          
          {/* Comparison Video Label */}
          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            Comparison
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {!bothVideosReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-2"></div>
            <div className="text-sm">
              Loading split screen videos...
              <br />
              <span className="text-xs">
                Primary: {primaryReady ? '✅' : '⏳'} | 
                Comparison: {comparisonReady ? '✅' : '⏳'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && bothVideosReady && (
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs p-2 rounded">
          Split: {Math.round(splitRatio * 100)}% / {Math.round((1 - splitRatio) * 100)}% | 
          Sync: {isSynced ? '🔗' : '⛓️‍💥'} | Master: {syncMaster}
        </div>
      )}
    </div>
  );
}