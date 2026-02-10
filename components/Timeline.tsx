import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
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
  const [timelineWidth, setTimelineWidth] = useState(0);
  const isSeeking = useRef(false);
  const abDragging = useRef<null | 'a' | 'b'>(null);
  // While scrubbing we want the playhead to feel 1:1 with the pointer even if the
  // video decoder can't keep up. We keep a local UI time and throttle actual seeks.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const displayTime = scrubTime != null ? scrubTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const fps = useMemo(() => Math.max(1, Math.floor(video.fps || 24)), [video.fps]);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);
  const lastSeekEmitRef = useRef<number>(0);
  const SEEK_INTERVAL_MS = 50; // ~20Hz: less thrash, smoother decoder during scrubs
  const scrubTimeRef = useRef<number | null>(null);
  useEffect(() => { scrubTimeRef.current = scrubTime; }, [scrubTime]);

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
    const el = timelineRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      setTimelineWidth(Number.isFinite(w) ? Math.max(0, w) : 0);
    };
    update();
    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (abDragging.current && duration > 0 && onAbChange) {
        onAbChange(abDragging.current, getTimeFromMouseEvent(e));
        return;
      }
      if (isSeeking.current) {
        const t = getTimeFromMouseEvent(e);
        setScrubTime(t);
        pendingSeekTimeRef.current = t;
        // Throttle actual seeks to reduce decoder stalls.
        const now = performance.now();
        const elapsed = now - lastSeekEmitRef.current;
        if (elapsed >= SEEK_INTERVAL_MS) {
          lastSeekEmitRef.current = now;
          onSeek(t);
          return;
        }
        if (seekTimerRef.current == null) {
          seekTimerRef.current = window.setTimeout(() => {
            seekTimerRef.current = null;
            const target = pendingSeekTimeRef.current;
            pendingSeekTimeRef.current = null;
            if (target == null) return;
            lastSeekEmitRef.current = performance.now();
            onSeek(target);
          }, Math.max(0, SEEK_INTERVAL_MS - elapsed));
        }
      }
    };

    const handleMouseUp = () => {
      if (isSeeking.current) {
        isSeeking.current = false;
        // Flush final seek for accurate landing.
        if (seekTimerRef.current != null) {
          window.clearTimeout(seekTimerRef.current);
          seekTimerRef.current = null;
        }
        const target = pendingSeekTimeRef.current ?? scrubTimeRef.current;
        pendingSeekTimeRef.current = null;
        if (target != null) onSeek(target);
        setScrubTime(null);
      }
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
        const t = getTimeFromTouchEvent(e);
        setScrubTime(t);
        pendingSeekTimeRef.current = t;
        const now = performance.now();
        const elapsed = now - lastSeekEmitRef.current;
        if (elapsed >= SEEK_INTERVAL_MS) {
          lastSeekEmitRef.current = now;
          onSeek(t);
          return;
        }
        if (seekTimerRef.current == null) {
          seekTimerRef.current = window.setTimeout(() => {
            seekTimerRef.current = null;
            const target = pendingSeekTimeRef.current;
            pendingSeekTimeRef.current = null;
            if (target == null) return;
            lastSeekEmitRef.current = performance.now();
            onSeek(target);
          }, Math.max(0, SEEK_INTERVAL_MS - elapsed));
        }
      }
    };

    const handleTouchEnd = () => {
      if (isSeeking.current) {
        isSeeking.current = false;
        if (seekTimerRef.current != null) {
          window.clearTimeout(seekTimerRef.current);
          seekTimerRef.current = null;
        }
        const target = pendingSeekTimeRef.current ?? scrubTimeRef.current;
        pendingSeekTimeRef.current = null;
        if (target != null) onSeek(target);
        setScrubTime(null);
      }
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
      if (seekTimerRef.current != null) {
        window.clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
      pendingSeekTimeRef.current = null;
    };
  }, [getTimeFromMouseEvent, getTimeFromTouchEvent, onSeek, onAbChange, duration]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && target.dataset && target.dataset.abHandle) return; // handled by handle element
    isSeeking.current = true;
    const t = getTimeFromMouseEvent(e.nativeEvent);
    setScrubTime(t);
    pendingSeekTimeRef.current = t;
    lastSeekEmitRef.current = performance.now();
    onSeek(t);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target && (target as any).dataset && (target as any).dataset.abHandle) return;
    isSeeking.current = true;
    const t = getTimeFromPosition(e.touches[0].clientX);
    setScrubTime(t);
    pendingSeekTimeRef.current = t;
    lastSeekEmitRef.current = performance.now();
    onSeek(t);
  };

  type MarkerKind = 'comment' | 'sketch';
  const timelineMarkers = useMemo(() => {
    const commentFrames = new Set<number>();
    const sketchFrames = new Set<number>();

    for (const c of comments) {
      if (c.frame === undefined) continue;
      commentFrames.add(c.frame);
    }

    for (const a of annotations) {
      const frame = (a as any).frame;
      if (frame === undefined || !Number.isFinite(frame)) continue;
      if (
        a.type === 'freehand' ||
        a.type === 'rectangle' ||
        a.type === 'ellipse' ||
        a.type === 'arrow'
      ) {
        sketchFrames.add(frame);
      }
    }

    const allFrames = new Set<number>();
    commentFrames.forEach((f) => allFrames.add(f));
    sketchFrames.forEach((f) => allFrames.add(f));

    const totalFrames = Math.max(1, Math.floor(duration * fps));
    return Array.from(allFrames)
      .sort((a, b) => a - b)
      .map((frame) => {
        const kind: MarkerKind = commentFrames.has(frame) ? 'comment' : 'sketch';
        return {
          frame,
          kind,
          position: duration > 0 ? (frame / totalFrames) * 100 : 0,
        };
      });
  }, [annotations, comments, duration, fps]);

  const currentFrameNumber = useMemo(() => Math.max(0, Math.round(displayTime * fps)), [displayTime, fps]);
  const currentFrameLabelLeftPct = useMemo(() => {
    // Approximate the label width from the digit count to avoid DOM measuring every frame.
    const digits = String(currentFrameNumber).length;
    const approx = Math.max(32, 16 + digits * 7);
    const w = Math.max(1, timelineWidth);
    const half = Math.min(w / 2, approx / 2);
    const px = (Math.max(0, Math.min(100, progress)) / 100) * w;
    const clamped = Math.max(half, Math.min(w - half, px));
    return (clamped / w) * 100;
  }, [currentFrameNumber, progress, timelineWidth]);

  // Build adaptive tick marks so we show ~10 nicely spaced labels
  const tickConfig = useMemo(() => {
    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const target = 10; // desired number of ticks (labels will adapt below)
    const raw = Math.max(1, Math.ceil(totalFrames / target));
    const pow = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw))));
    const options = [1, 2, 5].map((m) => m * pow);
    let interval = options[0];
    for (const c of options) { if (raw <= c) { interval = c; break; } interval = c; }
    const ticks: Array<{ frame: number; position: number }> = [];
    for (let f = 0; f <= totalFrames; f += interval) {
      const position = (f / totalFrames) * 100;
      ticks.push({ frame: f, position });
    }
    return { ticks, totalFrames };
  }, [duration, fps]);

  return (
    <div className="w-full group px-2 select-none">
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
        {/* Timeline markers (comments + sketch annotations) */}
        {timelineMarkers.map(({ frame, position, kind }) => {
          const colorClass = kind === 'comment' ? 'bg-black' : 'bg-neutral-500';
          const ringClass = isDark ? 'ring-1 ring-white/50' : 'ring-1 ring-black/20';
          const label = kind === 'comment' ? 'Comment' : 'Sketch';
          return (
            <div
              key={`timeline-marker-${frame}-${kind}`}
              className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full ${colorClass} ${ringClass}`}
              style={{ left: `${position}%` }}
              title={`${label} at frame ${frame}`}
            />
          );
        })}

        {/* Playhead: only the frame label (no bar, no dot) */}
        {duration > 0 && (
          <div
            className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${currentFrameLabelLeftPct}%` }}
            aria-hidden="true"
          >
            <div
              className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-black shadow-md border border-black whitespace-nowrap"
              title={`Frame ${currentFrameNumber}`}
            >
              {currentFrameNumber}
            </div>
          </div>
        )}

        {/* Adaptive frame ticks and labels */}
        {tickConfig.ticks.map(({ frame, position }, i) => {
          const labelEvery = timelineWidth < 420 ? 4 : timelineWidth < 768 ? 3 : 2;
          const showLabel = i % labelEvery === 0;
          return (
          <React.Fragment key={`tick-${frame}-${i}`}>
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${isDark ? 'bg-white/40' : 'bg-gray-700'}`}
              style={{ left: `${position}%`, width: 1, height: 10 }}
            />
            {showLabel && (
              <div
                className={`absolute bottom-0 translate-y-[110%] -translate-x-1/2 text-[10px] ${isDark ? 'text-white/60' : 'text-gray-800'}`}
                style={{ left: `${position}%` }}
              >
                {frame}
              </div>
            )}
          </React.Fragment>
          );
        })}
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
