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
  abLoop?: { a?: number | null; b?: number | null };
  onAbChange?: (which: 'a' | 'b', time: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({ currentTime, duration, onSeek, video, annotations, comments, isDark = true, abLoop, onAbChange }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const isSeeking = useRef(false);
  const abDragging = useRef<null | 'a' | 'b'>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromPosition = useCallback((clientX: number): number => {
    const timeline = timelineRef.current;
    if (!timeline || duration <= 0) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = x / rect.width;
    return duration * percentage;
  }, [duration]);

  const getTimeFromMouseEvent = useCallback((e: MouseEvent): number => {
    return getTimeFromPosition(e.clientX);
  }, [getTimeFromPosition]);

  const getTimeFromTouchEvent = useCallback((e: TouchEvent): number => {
    if (!e.touches || e.touches.length === 0) return 0;
    const t = e.touches[0];
    return getTimeFromPosition(t.clientX);
  }, [getTimeFromPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (abDragging.current && duration > 0 && onAbChange) {
        onAbChange(abDragging.current, getTimeFromMouseEvent(e));
        return;
      }
      if (isSeeking.current) {
        onSeek(getTimeFromMouseEvent(e));
      }
    };

    const handleMouseUp = () => {
      if (isSeeking.current) isSeeking.current = false;
      if (abDragging.current) abDragging.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (abDragging.current && duration > 0 && onAbChange) {
        e.preventDefault();
        onAbChange(abDragging.current, getTimeFromTouchEvent(e));
        return;
      }
      if (isSeeking.current) {
        e.preventDefault();
        onSeek(getTimeFromTouchEvent(e));
      }
    };

    const handleTouchEnd = () => {
      if (isSeeking.current) isSeeking.current = false;
      if (abDragging.current) abDragging.current = null;
    };

    // Attach listeners to window to capture mouse events outside the timeline
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove as any);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [getTimeFromMouseEvent, getTimeFromTouchEvent, onSeek, onAbChange, duration]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && target.dataset && target.dataset.abHandle) return; // handled by handle element
    isSeeking.current = true;
    onSeek(getTimeFromMouseEvent(e.nativeEvent));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && (target as any).dataset && (target as any).dataset.abHandle) return;
    isSeeking.current = true;
    onSeek(getTimeFromPosition(e.touches[0].clientX));
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
        onTouchStart={handleTouchStart}
      >
        <div 
            className={`absolute top-0 left-0 h-full rounded-full ${isDark ? 'bg-white/30' : 'bg-gray-900/20'}`} 
            style={{ width: `${progress}%` }}
        />
        {/* Current position and inline label inside the track */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center pointer-events-none`}
          style={{ left: `${progress}%` }}
        >
          <div className={`${isDark ? 'bg-white' : 'bg-gray-900'}`} style={{ width: 1, height: 24 }} />
          <div
            className={`${isDark ? 'bg-white text-black ring-1 ring-black/10' : 'bg-gray-900 text-gray-50 ring-1 ring-white/15'} ml-1 rounded-md px-2 py-0.5 text-[10px] font-semibold shadow-md whitespace-nowrap`}
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
        {/* A/B loop markers */}
        {duration > 0 && abLoop?.a != null && abLoop.a! >= 0 && abLoop.a! <= duration && (
          <>
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-sky-400 cursor-ew-resize z-10"
              style={{ left: `${((abLoop.a as number) / duration) * 100}%` }}
              title={`A`}
              data-ab-handle="a"
              onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
              onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
            />
            <div
              className="absolute -top-4 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow cursor-ew-resize z-10"
              style={{ left: `${((abLoop.a as number) / duration) * 100}%` }}
              data-ab-handle="a"
              onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
              onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
            >
              A
            </div>
            {onAbChange && (
              <div
                data-ab-handle="a"
                onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
                onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'a'; }}
                className="absolute -top-3 h-6 w-4 -translate-x-1/2 cursor-ew-resize rounded bg-sky-400/60 hover:bg-sky-400 z-10"
                style={{ left: `${((abLoop.a as number) / duration) * 100}%` }}
                title="Drag to adjust A"
              />
            )}
          </>
        )}
        {duration > 0 && abLoop?.b != null && abLoop.b! >= 0 && abLoop.b! <= duration && (
          <>
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-amber-400 cursor-ew-resize z-10"
              style={{ left: `${((abLoop.b as number) / duration) * 100}%` }}
              title={`B`}
              data-ab-handle="b"
              onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
              onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
            />
            <div
              className="absolute -top-4 -translate-x-1/2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow cursor-ew-resize z-10"
              style={{ left: `${((abLoop.b as number) / duration) * 100}%` }}
              data-ab-handle="b"
              onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
              onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
            >
              B
            </div>
            {onAbChange && (
              <div
                data-ab-handle="b"
                onMouseDown={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
                onTouchStart={(e) => { e.stopPropagation(); abDragging.current = 'b'; }}
                className="absolute -top-3 h-6 w-4 -translate-x-1/2 cursor-ew-resize rounded bg-amber-400/60 hover:bg-amber-400 z-10"
                style={{ left: `${((abLoop.b as number) / duration) * 100}%` }}
                title="Drag to adjust B"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Timeline;
