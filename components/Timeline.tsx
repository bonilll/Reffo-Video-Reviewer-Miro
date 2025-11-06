import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { Video, Annotation, Comment } from '../types';

interface TimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  video: Video;
  annotations: Annotation[];
  comments: Comment[];
  isDark?: boolean;
}

const Timeline: React.FC<TimelineProps> = ({ currentTime, duration, onSeek, video, annotations, comments, isDark = true }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const isSeeking = useRef(false);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromMouseEvent = useCallback((e: MouseEvent): number => {
    const timeline = timelineRef.current;
    if (!timeline || duration <= 0) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = x / rect.width;
    return duration * percentage;
  }, [duration]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isSeeking.current) {
        onSeek(getTimeFromMouseEvent(e));
      }
    };

    const handleMouseUp = () => {
      if (isSeeking.current) {
        isSeeking.current = false;
      }
    };

    // Attach listeners to window to capture mouse events outside the timeline
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getTimeFromMouseEvent, onSeek]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isSeeking.current = true;
    onSeek(getTimeFromMouseEvent(e.nativeEvent));
  };

  const markers = useMemo(() => {
    const markerFrames = new Set<number>();
    annotations.forEach(a => markerFrames.add(a.frame));
    comments.forEach(c => c.frame !== undefined && markerFrames.add(c.frame));
    
    return Array.from(markerFrames).map(frame => ({
      frame,
      // Guard against division by zero if duration is not loaded yet
      position: duration > 0 && video.fps > 0 ? (frame / (duration * video.fps)) * 100 : 0,
    }));
  }, [annotations, comments, duration, video.fps]);

  const currentFrameNumber = useMemo(() => Math.max(0, Math.round(currentTime * (video.fps || 0))), [currentTime, video.fps]);

  // Build adaptive tick marks so we show ~10 nicely spaced labels
  const tickConfig = useMemo(() => {
    const fps = Math.max(1, Math.floor(video.fps || 0));
    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const target = 10; // desired number of labeled ticks
    const raw = Math.max(1, Math.ceil(totalFrames / target));
    const pow = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw))));
    const options = [1, 2, 5].map((m) => m * pow);
    let interval = options[0];
    for (const c of options) { if (raw <= c) { interval = c; break; } interval = c; }
    const ticks: Array<{ frame: number; position: number; label: boolean }> = [];
    for (let f = 0; f <= totalFrames; f += interval) {
      const position = (f / totalFrames) * 100;
      const label = ticks.length % 2 === 0; // label every other tick to avoid clutter
      ticks.push({ frame: f, position, label });
    }
    return { ticks, totalFrames };
  }, [duration, video.fps]);

  return (
    <div className="w-full group px-2">
      <div 
        ref={timelineRef}
        className={`relative h-6 rounded-full cursor-pointer ${isDark ? 'bg-black/50' : 'bg-gray-200'}`} 
        onMouseDown={handleMouseDown}
      >
        <div 
            className={`absolute top-0 left-0 h-full rounded-full ${isDark ? 'bg-white/30' : 'bg-gray-900/20'}`} 
            style={{ width: `${progress}%` }}
        />
        {/* Current position and inline label inside the track */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center`}
          style={{ left: `${progress}%` }}
        >
          <div className={`${isDark ? 'bg-white' : 'bg-gray-900'}`} style={{ width: 1, height: 24 }} />
          <div
            className={`${isDark ? 'bg-white text-black ring-1 ring-black/10' : 'bg-gray-900 text-white ring-1 ring-white/15'} ml-1 rounded-md px-2 py-0.5 text-[10px] font-semibold shadow-md whitespace-nowrap`}
            title={`Frame ${currentFrameNumber}`}
          >
            {currentFrameNumber}
          </div>
        </div>
        {/* Adaptive frame ticks and labels */}
        {tickConfig.ticks.map(({ frame, position, label }, i) => (
          <React.Fragment key={`tick-${frame}-${i}`}>
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${isDark ? 'bg-white/40' : 'bg-gray-700'}`}
              style={{ left: `${position}%`, width: 1, height: 10 }}
            />
            {label && (
              <div
                className={`absolute bottom-0 translate-y-[110%] -translate-x-1/2 text-[10px] ${isDark ? 'text-white/60' : 'text-gray-800'}`}
                style={{ left: `${position}%` }}
              >
                {frame}
              </div>
            )}
          </React.Fragment>
        ))}
        {markers.map(({ frame, position }) => (
            <div 
                key={`note-marker-${frame}`}
                className={`absolute top-1/2 -translate-y-1/2 h-3 w-0.5 ${isDark ? 'bg-yellow-300/80' : 'bg-yellow-600/80'}`}
                style={{ left: `${position}%` }}
                title={`Note at frame ${frame}`}
            />
        ))}
      </div>
    </div>
  );
};

export default Timeline;
