"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface OverlayVideoRendererProps {
  primaryVideoUrl: string;
  comparisonVideoUrl: string;
  opacity: number; // 0-100
  isSynced: boolean;
  syncMaster: 'primary' | 'comparison';
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  onVideoReady?: (videoDimensions: { width: number; height: number }) => void;
  onFrameUpdate?: (frame: number, time: number) => void;
  className?: string;
  width?: number;
  height?: number;
}

export function OverlayVideoRenderer({
  primaryVideoUrl,
  comparisonVideoUrl,
  opacity,
  isSynced,
  syncMaster,
  currentFrame,
  fps,
  isPlaying,
  onVideoReady,
  onFrameUpdate,
  className = "",
  width,
  height
}: OverlayVideoRendererProps) {
  
  // Refs for video elements and canvas
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const comparisonVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  
  // Refs for retry logic to avoid stale closures
  const primaryRetryRef = useRef<number>(0);
  const comparisonRetryRef = useRef<number>(0);
  
  // Refs for debouncing error handlers
  const primaryErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const comparisonErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for video readiness
  const [primaryReady, setPrimaryReady] = useState(false);
  const [comparisonReady, setComparisonReady] = useState(false);
  const [canvasInitialized, setCanvasInitialized] = useState(false);
  
  // State for retry logic
  const [primaryRetryCount, setPrimaryRetryCount] = useState(0);
  const [comparisonRetryCount, setComparisonRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  
  // State for error tracking
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // Calculate opacity values (0-1 range)
  const primaryOpacity = 1.0;
  const comparisonOpacity = opacity / 100;

  // Check if both videos are ready
  const bothVideosReady = primaryReady && comparisonReady && canvasInitialized;

  // CORE: Render blended frame on canvas - SAFE rendering without flashing
  const renderBlendedFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const primaryVideo = primaryVideoRef.current;
    const comparisonVideo = comparisonVideoRef.current;
    
    if (!canvas || !primaryVideo || !comparisonVideo || !bothVideosReady) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // CRITICAL: For paused videos, be more lenient with readyState
      // Only require readyState >= 1 (HAVE_METADATA) when paused, >= 2 when playing
      const minReadyState = (primaryVideo.paused && comparisonVideo.paused) ? 1 : 2;
      
      if (primaryVideo.readyState < minReadyState || comparisonVideo.readyState < minReadyState) {
        return;
      }
      
      if (primaryVideo.videoWidth === 0 || comparisonVideo.videoWidth === 0) {
        return;
      }

      // Clear and render in one atomic operation
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw primary video (always at full opacity)
      ctx.globalAlpha = primaryOpacity;
      ctx.drawImage(primaryVideo, 0, 0, canvas.width, canvas.height);
      
      // Draw comparison video with opacity
      ctx.globalAlpha = comparisonOpacity;
      ctx.drawImage(comparisonVideo, 0, 0, canvas.width, canvas.height);
      
      // Reset global alpha
      ctx.globalAlpha = 1.0;
      
    } catch (error) {
      console.warn('Canvas rendering error:', error);
    }
  }, [bothVideosReady, primaryOpacity, comparisonOpacity]);

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
      renderBlendedFrame();
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
      renderBlendedFrame();
      onFrameUpdate?.(frame, targetTime);
    }, renderDelay);
    
  }, [fps, bothVideosReady, renderBlendedFrame, onFrameUpdate]);

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

    // Render current frame
    renderBlendedFrame();
    
    // Update frame info
    const currentTime = masterVideo.currentTime;
    const frame = Math.floor(currentTime * fps);
    onFrameUpdate?.(frame, currentTime);

    // Continue animation loop
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    }
  }, [isPlaying, bothVideosReady, isSynced, syncMaster, fps, renderBlendedFrame, onFrameUpdate]);

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
      console.warn('⚠️ Missing video URLs:', { primaryVideoUrl, comparisonVideoUrl });
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
      console.warn('💡 Images are not yet supported in overlay mode. Please select a video for comparison.');
      return;
    }

    // Reset states
    setPrimaryReady(false);
    setComparisonReady(false);
    setCanvasInitialized(false);
    
    // Reset retry counters and errors
    primaryRetryRef.current = 0;
    comparisonRetryRef.current = 0;
    setPrimaryRetryCount(0);
    setComparisonRetryCount(0);
    setPrimaryError(null);
    setComparisonError(null);

    // Primary video handlers
    const handlePrimaryReady = () => {
      setPrimaryReady(true);
    };

    const handlePrimaryError = (e: Event) => {
      // Debounce error handling to prevent spam
      if (primaryErrorTimeoutRef.current) {
        clearTimeout(primaryErrorTimeoutRef.current);
      }
      
      primaryErrorTimeoutRef.current = setTimeout(() => {
        const video = e.target as HTMLVideoElement;
        const currentRetryCount = primaryRetryRef.current;
        
        console.error('❌ Primary video error:', {
          event: e,
          url: primaryVideoUrl,
          readyState: video?.readyState,
          networkState: video?.networkState,
          error: video?.error,
          errorCode: video?.error?.code,
          errorMessage: video?.error?.message,
          retryCount: currentRetryCount
        });

        // Prevent multiple simultaneous retries
        if (currentRetryCount >= maxRetries) {
          console.error('💀 Primary video failed after all retries.');
          setPrimaryError('Video loading failed. Please try selecting a different video.');
          return;
        }

        // Increment retry count
        primaryRetryRef.current += 1;
        const newRetryCount = primaryRetryRef.current;
        setPrimaryRetryCount(newRetryCount);
        
        
        setTimeout(() => {
          if (newRetryCount === 1) {
            video.preload = 'auto';
            video.load();
          } else if (newRetryCount === 2) {
            video.removeAttribute('src');
            video.load();
            setTimeout(() => {
              video.src = primaryVideoUrl;
              video.preload = 'metadata';
              video.load();
            }, 200);
          } else {
            video.load();
          }
        }, 500 * newRetryCount); // Reduced timeout
      }, 100); // 100ms debounce
    };

    const handleComparisonReady = () => {
      setComparisonReady(true);
    };

    const handleComparisonError = (e: Event) => {
      // Debounce error handling to prevent spam
      if (comparisonErrorTimeoutRef.current) {
        clearTimeout(comparisonErrorTimeoutRef.current);
      }
      
      comparisonErrorTimeoutRef.current = setTimeout(() => {
        const video = e.target as HTMLVideoElement;
        const currentRetryCount = comparisonRetryRef.current;
        
        console.error('❌ Comparison video error:', {
          event: e,
          url: comparisonVideoUrl,
          readyState: video?.readyState,
          networkState: video?.networkState,
          error: video?.error,
          errorCode: video?.error?.code,
          errorMessage: video?.error?.message,
          retryCount: currentRetryCount
        });

        // Prevent multiple simultaneous retries
        if (currentRetryCount >= maxRetries) {
          console.error('💀 Comparison video failed after all retries.');
          setComparisonError('Comparison video loading failed. The video may have access restrictions or be corrupted.');
          return;
        }

        // Increment retry count
        comparisonRetryRef.current += 1;
        const newRetryCount = comparisonRetryRef.current;
        setComparisonRetryCount(newRetryCount);
        
        
        setTimeout(() => {
          if (newRetryCount === 1) {
            // First retry: try with different preload setting
            video.preload = 'auto';
            video.load();
          } else if (newRetryCount === 2) {
            // Second retry: try alternative URL (remove /user_ if present)
            const alternativeUrls = generateAlternativeUrls(comparisonVideoUrl);
            if (alternativeUrls.length > 1) {
              video.removeAttribute('src');
              video.load();
              setTimeout(() => {
                video.src = alternativeUrls[1];
                video.preload = 'metadata';
                video.load();
              }, 200);
            } else {
              // No alternative URL, just reset
              video.removeAttribute('src');
              video.load();
              setTimeout(() => {
                video.src = comparisonVideoUrl;
                video.preload = 'metadata';
                video.load();
              }, 200);
            }
          } else {
            // Final retry: try normalized path if available
            const alternativeUrls = generateAlternativeUrls(comparisonVideoUrl);
            const normalizedUrl = alternativeUrls.find(url => url.includes('/uploads/') && !url.includes('/user_')) || comparisonVideoUrl;
            video.removeAttribute('src');
            video.load();
            setTimeout(() => {
              video.src = normalizedUrl;
              video.preload = 'auto';
              video.load();
            }, 200);
          }
        }, 500 * newRetryCount); // Reduced timeout
      }, 100); // 100ms debounce
    };

    // Function to generate alternative URLs for problematic paths
    const generateAlternativeUrls = (originalUrl: string): string[] => {
      const alternatives = [originalUrl];
      
      // If URL contains /user_, try removing it
      if (originalUrl.includes('/user_')) {
        const withoutUser = originalUrl.replace('/user_', '/');
        alternatives.push(withoutUser);
      }
      
      // Try different path structures if needed
      if (originalUrl.includes('/uploads/user_')) {
        const normalizedPath = originalUrl.replace('/uploads/user_', '/uploads/');
        alternatives.push(normalizedPath);
      }
      
      return alternatives;
    };

    // Function to analyze URL issues
    const analyzeUrl = (url: string, name: string) => {

      // Check for common URL issues that might cause network problems
      const potentialIssues = [];
      if (url.includes('/user_')) {
        potentialIssues.push('Contains /user_ prefix which might have different access rules');
      }
      if (url.includes(' ')) {
        potentialIssues.push('URL contains spaces');
      }
      if (!url.startsWith('https://')) {
        potentialIssues.push('Not using HTTPS');
      }

      if (potentialIssues.length > 0) {
        console.warn(`⚠️ ${name} potential URL issues:`, potentialIssues);
      }

      return url;
    };

    // Setup video sources and properties

    // Analyze URLs for potential issues
    const analyzedPrimaryUrl = analyzeUrl(primaryVideoUrl, 'Primary');
    const analyzedComparisonUrl = analyzeUrl(comparisonVideoUrl, 'Comparison');
    
    primaryVideo.src = analyzedPrimaryUrl;
    comparisonVideo.src = analyzedComparisonUrl;
    
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
      console.warn('⏰ Video loading timeout (30s):', {
        primary: { ready: primaryReady, readyState: primaryVideo.readyState },
        comparison: { ready: comparisonReady, readyState: comparisonVideo.readyState }
      });
    }, 30000);

    // Force load
    primaryVideo.load();
    comparisonVideo.load();

    return () => {
      clearTimeout(timeoutId);
      
      // Clear debounce timeouts
      if (primaryErrorTimeoutRef.current) {
        clearTimeout(primaryErrorTimeoutRef.current);
        primaryErrorTimeoutRef.current = null;
      }
      if (comparisonErrorTimeoutRef.current) {
        clearTimeout(comparisonErrorTimeoutRef.current);
        comparisonErrorTimeoutRef.current = null;
      }
      
      primaryVideo.removeEventListener('loadedmetadata', handlePrimaryReady);
      primaryVideo.removeEventListener('canplay', handlePrimaryReady);
      primaryVideo.removeEventListener('error', handlePrimaryError);
      comparisonVideo.removeEventListener('loadedmetadata', handleComparisonReady);
      comparisonVideo.removeEventListener('canplay', handleComparisonReady);
      comparisonVideo.removeEventListener('error', handleComparisonError);
    };
  }, [primaryVideoUrl, comparisonVideoUrl]);

  // SETUP: Initialize canvas when both videos are ready
  useEffect(() => {
    if (!primaryReady || !comparisonReady) return;

    const canvas = canvasRef.current;
    const primaryVideo = primaryVideoRef.current;
    
    if (!canvas || !primaryVideo) return;

    // Set canvas dimensions based on primary video
    const videoWidth = width || primaryVideo.videoWidth || 800;
    const videoHeight = height || primaryVideo.videoHeight || 600;
    
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    
    setCanvasInitialized(true);
    
    // Notify parent about video dimensions
    onVideoReady?.({ width: videoWidth, height: videoHeight });
    
    // Render initial frame
    setTimeout(() => {
      renderBlendedFrame();
    }, 100);
    
  }, [primaryReady, comparisonReady, width, height, onVideoReady, renderBlendedFrame]);

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

  // EFFECT: Re-render when opacity changes - IMMEDIATE for paused videos
  useEffect(() => {
    if (!bothVideosReady || isPlaying) return;
    
    // NO debouncing for opacity changes on paused videos - render immediately
    renderBlendedFrame();
  }, [opacity, bothVideosReady, isPlaying, renderBlendedFrame]);

  return (
    <div className={`relative ${className}`}>
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

      {/* Blended canvas output - maintain original video dimensions */}
      <canvas
        ref={canvasRef}
        className="block mx-auto"
        style={{
          background: 'black',
          borderRadius: '8px',
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto'
        }}
      />

      {/* Loading/Error indicator */}
      {!bothVideosReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
          <div className="text-center max-w-md">
            {!primaryError && !comparisonError ? (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-2"></div>
                <div className="text-sm">
                  Loading comparison videos...
                  <br />
                  <span className="text-xs">
                    Primary: {primaryReady ? '✅' : primaryRetryCount > 0 ? `🔄 (retry ${primaryRetryCount})` : '⏳'} | 
                    Comparison: {comparisonReady ? '✅' : comparisonRetryCount > 0 ? `🔄 (retry ${comparisonRetryCount})` : '⏳'}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="text-red-500 text-2xl mb-4">⚠️</div>
                <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                  Video Loading Error
                </div>
                {primaryError && (
                  <div className="text-xs text-red-500 mb-2">
                    Primary: {primaryError}
                  </div>
                )}
                {comparisonError && (
                  <div className="text-xs text-red-500 mb-2">
                    Comparison: {comparisonError}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-3">
                  Try selecting different videos or check your internet connection.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && bothVideosReady && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs p-2 rounded">
          Opacity: {opacity}% | Sync: {isSynced ? '🔗' : '⛓️‍💥'} | Master: {syncMaster}
        </div>
      )}
    </div>
  );
}