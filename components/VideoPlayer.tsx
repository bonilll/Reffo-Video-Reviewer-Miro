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
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ video, sourceUrl, isPlaying, setIsPlaying, onTimeUpdate, annotations, comments, onSeek, currentFrame }, ref) => {
    const localRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref || localRef) as React.RefObject<HTMLVideoElement>;
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [timeDisplayMode, setTimeDisplayMode] = useState<'frame' | 'time'>('frame');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const formatTime = (timeInSeconds: number) => {
        const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
        const minutes = Math.floor((timeInSeconds / 60) % 60).toString().padStart(2, '0');
        const frame = Math.floor((timeInSeconds * video.fps) % video.fps).toString().padStart(2, '0');
        return `${minutes}:${seconds}:${frame}`;
    };
    
    const totalFrames = useMemo(() => Math.floor(duration * video.fps), [duration, video.fps]);

    const handleFrameUpdate = useCallback(() => {
      if (!videoRef.current) return;
      const time = videoRef.current.currentTime;
      const frame = Math.round(time * video.fps);
      onTimeUpdate(time, frame);
      
      if ('requestVideoFrameCallback' in videoRef.current) {
        (videoRef.current as any).requestVideoFrameCallback(handleFrameUpdate);
      }
    }, [onTimeUpdate, video.fps, videoRef]);

    useEffect(() => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const handleLoadedMetadata = () => {
        setDuration(videoElement.duration);
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
            onTimeUpdate(time, Math.round(time * video.fps));
        }, 1000 / video.fps);
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
      if (videoRef.current) {
        videoRef.current.volume = isMuted ? 0 : volume;
      }
    }, [volume, isMuted, videoRef]);

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
              className="w-full h-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
          />

        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="flex items-center gap-3 text-gray-200">
              <Loader2 className="animate-spin text-cyan-500" />
              <span className="text-sm">Loading video…</span>
            </div>
          </div>
        )}

        <div 
          className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-2">
            <Timeline
                currentTime={videoRef.current?.currentTime || 0}
                duration={duration}
                onSeek={onSeek}
                video={video}
                annotations={annotations}
                comments={comments}
            />
            <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                    <button onClick={() => stepFrame(-1)} className="hover:text-cyan-400"><Rewind size={20} /></button>
                    <button onClick={togglePlayPause} className="hover:text-cyan-400">
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button onClick={() => stepFrame(1)} className="hover:text-cyan-400"><FastForward size={20} /></button>
                    <div className="group flex items-center gap-2 relative">
                      <button onClick={() => setIsMuted(m => !m)}>
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(e) => {
                          setVolume(parseFloat(e.target.value));
                          setIsMuted(parseFloat(e.target.value) === 0);
                        }}
                        className="w-20 accent-cyan-500"
                      />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                  <button onClick={() => handleJump('prev')} className="hover:text-cyan-400" title="Previous Note"><SkipBack size={20} /></button>
                  <button 
                    onClick={() => setTimeDisplayMode(m => m === 'frame' ? 'time' : 'frame')}
                    className="font-mono text-lg tabular-nums w-40 text-center"
                    title="Toggle time/frame display"
                  >
                    {timeDisplayMode === 'frame' ? `${currentFrame} / ${totalFrames}` : formatTime(videoRef.current?.currentTime || 0)}
                  </button>
                  <button onClick={() => handleJump('next')} className="hover:text-cyan-400" title="Next Note"><SkipForward size={20} /></button>
                </div>
                
                <div className="flex items-center gap-3">
                  <button onClick={toggleFullscreen} className="hover:text-cyan-400" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                  </button>
                </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default VideoPlayer;