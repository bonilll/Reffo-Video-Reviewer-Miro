import React, { forwardRef, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Video, Annotation, Comment } from '../types';
import Timeline from './Timeline';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface VideoPlayerProps {
  video: Video;
  sourceUrl?: string;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  onTimeUpdate: (time: number, frame: number) => void;
  annotations: Annotation[];
  comments: Comment[];
  onSeek: (time: number) => void;
  currentFrame: number;
  externalControls?: boolean;
  onDuration?: (duration: number) => void;
  loopEnabled?: boolean;
  onFps?: (fps: number) => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ video, sourceUrl, isPlaying, setIsPlaying, onTimeUpdate, annotations, comments, onSeek, currentFrame, externalControls, onDuration, loopEnabled, onFps }, ref) => {
    const localRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref || localRef) as React.RefObject<HTMLVideoElement>;
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [timeDisplayMode, setTimeDisplayMode] = useState<'frame' | 'time'>('frame');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const fpsRef = useRef(Math.max(1, Math.floor(video.fps || 24)));
    const hasReportedFpsRef = useRef(false);
    const lastSampleRef = useRef<{ frames: number; mediaTime: number; wall: number } | null>(null);

    const formatTime = (timeInSeconds: number) => {
        const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
        const minutes = Math.floor((timeInSeconds / 60) % 60).toString().padStart(2, '0');
        const f = Math.max(1, fpsRef.current);
        const frame = Math.floor((timeInSeconds * f) % f).toString().padStart(2, '0');
        return `${minutes}:${seconds}:${frame}`;
    };
    
    const totalFrames = useMemo(() => Math.floor(duration * Math.max(1, fpsRef.current)), [duration]);

    const handleFrameUpdate = useCallback((now?: any, metadata?: any) => {
      if (!videoRef.current) return;
      const time = videoRef.current.currentTime;
      const canonicalFps = Math.max(1, Math.floor(video.fps || 24));
      const frameForStorage = Math.round(time * canonicalFps);
      onTimeUpdate(time, frameForStorage);
      // FPS estimation using requestVideoFrameCallback metadata when available
      try {
        const presented = metadata?.presentedFrames;
        const mediaTime = typeof metadata?.mediaTime === 'number' ? metadata.mediaTime : time;
        const wall = typeof now === 'number' ? now : performance.now();
        let framesNow: number | null = null;
        if (typeof presented === 'number') {
          framesNow = presented;
        } else if (typeof (videoRef.current as any).getVideoPlaybackQuality === 'function') {
          const q = (videoRef.current as any).getVideoPlaybackQuality();
          if (q && typeof q.totalVideoFrames === 'number') framesNow = q.totalVideoFrames as number;
        }
        if (framesNow !== null) {
          const prev = lastSampleRef.current;
          lastSampleRef.current = { frames: framesNow, mediaTime, wall };
          if (prev && framesNow > prev.frames) {
            const dF = framesNow - prev.frames;
            const dT = Math.max(0.001, mediaTime - prev.mediaTime);
            const raw = dF / dT;
            if (raw > 5 && raw < 200) {
              // Smooth update
              const next = Math.round(0.7 * fpsRef.current + 0.3 * raw);
              if (!hasReportedFpsRef.current) {
                fpsRef.current = next;
                hasReportedFpsRef.current = true;
                onFps?.(next);
              } else if (Math.abs(next - fpsRef.current) >= 1) {
                fpsRef.current = next;
                onFps?.(next);
              }
            }
          }
        }
      } catch {}
      
      if ('requestVideoFrameCallback' in videoRef.current) {
        (videoRef.current as any).requestVideoFrameCallback(handleFrameUpdate);
      }
    }, [onTimeUpdate, onFps, videoRef]);

    useEffect(() => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const handleLoadedMetadata = () => {
        setDuration(videoElement.duration);
        if (onDuration) onDuration(videoElement.duration);
        hasReportedFpsRef.current = false;
      };
      const handleCanPlay = () => setIsReady(true);
      const handleError = () => setIsReady(false);
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('error', handleError);
      
      let intervalId: number | undefined;

      if ('requestVideoFrameCallback' in videoElement) {
        (videoElement as any).requestVideoFrameCallback(handleFrameUpdate);
      } else {
        // Fallback for browsers that don't support it
        intervalId = window.setInterval(() => {
            if (!videoRef.current) return;
            const time = videoRef.current.currentTime;
            const canonicalFps = Math.max(1, Math.floor(video.fps || 24));
            onTimeUpdate(time, Math.round(time * canonicalFps));
            // Try sampling frames via playback quality
            try {
              const q = (videoRef.current as any).getVideoPlaybackQuality?.();
              if (q && typeof q.totalVideoFrames === 'number') {
                const now = performance.now();
                const prev = lastSampleRef.current;
                lastSampleRef.current = { frames: q.totalVideoFrames, mediaTime: time, wall: now };
                if (prev && q.totalVideoFrames > prev.frames) {
                  const dF = q.totalVideoFrames - prev.frames;
                  const dT = Math.max(0.001, time - prev.mediaTime);
                  const raw = dF / dT;
                  if (raw > 5 && raw < 200) {
                    const next = Math.round(0.7 * fpsRef.current + 0.3 * raw);
                    if (!hasReportedFpsRef.current) {
                      fpsRef.current = next;
                      hasReportedFpsRef.current = true;
                      onFps?.(next);
                    } else if (Math.abs(next - fpsRef.current) >= 1) {
                      fpsRef.current = next;
                      onFps?.(next);
                    }
                  }
                }
              }
            } catch {}
        }, Math.max(16, Math.round(1000 / Math.max(24, fpsRef.current))));
      }
      
      return () => {
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('error', handleError);
        if (intervalId) clearInterval(intervalId);
      };
    }, [videoRef, handleFrameUpdate, onTimeUpdate, video.fps]);

    // Reset readiness when source changes
    useEffect(() => {
      setIsReady(false);
    }, [sourceUrl, video.src]);

    // Fullscreen state sync
    useEffect(() => {
      const onFsChange = () => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      };
      document.addEventListener('fullscreenchange', onFsChange);
      return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    const toggleFullscreen = () => {
      const el = containerRef.current as any;
      if (!el) return;
      if (!document.fullscreenElement) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
        if (req) req.call(el);
      } else {
        const exit = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen || (document as any).mozCancelFullScreen;
        if (exit) exit.call(document);
      }
    };

    useEffect(() => {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.play().catch(e => console.error("Play failed:", e));
      } else {
        videoRef.current.pause();
      }
    }, [isPlaying, videoRef]);
    
    useEffect(() => {
      if (externalControls) return;
      if (videoRef.current) {
        videoRef.current.volume = isMuted ? 0 : volume;
      }
    }, [volume, isMuted, videoRef, externalControls]);

    const togglePlayPause = () => setIsPlaying(p => !p);

    const stepFrame = (delta: number) => {
        if (!videoRef.current) return;
        setIsPlaying(false);
        const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta / video.fps));
        onSeek(newTime);
    };

    const jumpFrames = useMemo(() => {
      const frames = new Set<number>();
      annotations.forEach(a => frames.add(a.frame));
      comments.forEach(c => c.frame !== undefined && frames.add(c.frame));
      return Array.from(frames).sort((a, b) => a - b);
    }, [annotations, comments]);

    const handleJump = (direction: 'prev' | 'next') => {
      let targetFrame: number | undefined;

      if (direction === 'next') {
          targetFrame = jumpFrames.find(f => f > currentFrame);
          if(targetFrame === undefined) targetFrame = jumpFrames[0]; // loop to start
      } else { // 'prev'
          const reversedFrames = [...jumpFrames].reverse();
          targetFrame = reversedFrames.find(f => f < currentFrame);
          if(targetFrame === undefined) targetFrame = jumpFrames[jumpFrames.length - 1]; // loop to end
      }

      if (targetFrame !== undefined) {
          onSeek(targetFrame / video.fps);
      }
    };
    
    return (
      <div ref={containerRef} className="w-full h-full relative">
          <video
              ref={videoRef}
              src={sourceUrl ?? video.src}
              preload="auto"
              playsInline
              loop={!!loopEnabled}
              onEnded={() => {
                // Ensure seamless loop even if browser stops at 'ended'
                if (loopEnabled && videoRef.current) {
                  videoRef.current.currentTime = 0;
                  const p = videoRef.current.play();
                  if (p && typeof p.catch === 'function') {
                    p.catch(() => undefined);
                  }
                }
              }}
              className="w-full h-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
          />

        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex items-center gap-3 text-white/70">
              <Loader2 className="animate-spin text-white" />
              <span className="text-sm uppercase">Loading</span>
            </div>
          </div>
        )}

        {!externalControls && (
        <div 
          className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-3">
            <Timeline
                currentTime={videoRef.current?.currentTime || 0}
                duration={duration}
                onSeek={onSeek}
                video={video}
                annotations={annotations}
                comments={comments}
            />
            <div className="flex items-center justify-start text-white/80 text-xs uppercase">
                <button onClick={() => setTimeDisplayMode(mode => mode === 'frame' ? 'time' : 'frame')} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70">
                    {timeDisplayMode === 'frame' ? `${currentFrame} f` : formatTime(videoRef.current?.currentTime || 0)}
                </button>
                {/* Removed resolution • fps display under timeline as requested */}
            </div>
            <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                    <button onClick={() => stepFrame(-1)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80"><Rewind size={18} /></button>
                    <button onClick={() => stepFrame(-fpsRef.current)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80"><SkipBack size={18} /></button>
                    <button onClick={togglePlayPause} className="p-3 rounded-full bg-white text-black hover:bg-white/90">
                        {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                    </button>
                    <button onClick={() => stepFrame(fpsRef.current)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80"><SkipForward size={18} /></button>
                    <button onClick={() => stepFrame(1)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80"><FastForward size={18} /></button>
                </div>
                <div className="flex items-center gap-3 text-white/70">
                    <button onClick={() => setIsMuted(m => !m)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setVolume(value);
                        setIsMuted(value === 0);
                      }}
                      className="w-24 accent-white"
                    />
                    <button onClick={() => handleJump('prev')} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70">Prev mark</button>
                    <button onClick={() => handleJump('next')} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70">Next mark</button>
                    <button onClick={toggleFullscreen} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                </div>
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }
);

export default VideoPlayer;
