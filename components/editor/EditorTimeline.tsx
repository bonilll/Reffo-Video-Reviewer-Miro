import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Id } from '../../convex/_generated/dataModel';

type ClipDoc = {
  _id: Id<'compositionClips'>;
  compositionId: Id<'compositions'>;
  sourceVideoId: Id<'videos'>;
  sourceInFrame: number;
  sourceOutFrame: number;
  timelineStartFrame: number;
  speed: number;
  label?: string;
  zIndex: number;
};

type TimelineProps = {
  clips: ClipDoc[];
  durationFrames: number;
  fps: number;
  playhead: number;
  zoom: number;
  onSeek: (frame: number) => void;
  onZoomChange: (value: number) => void;
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string | null) => void;
  onMoveClip?: (clipId: string, patch: { timelineStartFrame?: number; zIndex?: number }) => void;
  trims?: Record<string, { start: number; end: number }>;
  onTrimClip?: (clipId: string, trim: { start: number; end: number }) => void;
  playing?: boolean;
  onTogglePlay?: () => void;
  onReset?: () => void;
};

const COLORS = ['#38bdf8', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#facc15'];

export const EditorTimeline: React.FC<TimelineProps> = ({ clips, durationFrames, fps, playhead, zoom, onSeek, onZoomChange, selectedClipId, onSelectClip, onMoveClip, trims, onTrimClip, playing = false, onTogglePlay, onReset }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const isDraggingRef = useRef(false);
  const laneHeight = 48;
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string;
    startX: number;
    startY: number;
    origFrame: number;
    origLaneIndex: number;
    previewFrame: number;
    previewLaneIndex: number;
  } | null>(null);
  const [trimming, setTrimming] = useState<{
    clipId: string;
    edge: 'start' | 'end';
    startX: number;
    slotDuration: number;
    origStart: number;
    origEnd: number;
    previewStart: number;
    previewEnd: number;
  } | null>(null);

  // Keep container width in sync to compute base scale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    setContainerWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const basePxPerFrame = useMemo(() => {
    const baseW = containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const frames = Math.max(1, durationFrames);
    return baseW / frames;
  }, [containerWidth, durationFrames]);

  // At minimal zoom, stretch to 100%. Beyond 1, scale > 100% and becomes scrollable
  const pxPerFrame = zoom <= 1 ? basePxPerFrame : basePxPerFrame * zoom;
  const totalWidth = Math.max(pxPerFrame * Math.max(1, durationFrames), containerWidth || 0);

  // Compute non-overlapping lanes from timing; top row has highest priority.
  type SimpleClip = { id: string; start: number; end: number };
  const getDurationFor = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));

  const snapshotClips: Array<SimpleClip> = useMemo(() => {
    return clips.map((c) => {
      const id = c._id as unknown as string;
      const duration = getDurationFor(c);
      let start = c.timelineStartFrame;
      let end = start + duration;
      if (draggingClip && draggingClip.clipId === id) {
        start = draggingClip.previewFrame;
        end = start + duration;
      }
      // Trimming does not change slot start/end; ignore it here
      return { id, start, end };
    });
  }, [clips, draggingClip]);

  const assignLanes = (all: Array<SimpleClip>, desired?: { id: string; laneIndex?: number }) => {
    const lanesArr: Array<Array<SimpleClip>> = [];
    const byIdLane = new Map<string, number>();
    const sorted = all.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    const canPlace = (lane: SimpleClip[] | undefined, clip: SimpleClip) => !lane || lane.every((c) => c.end <= clip.start || c.start >= clip.end);
    const place = (clip: SimpleClip, preferred?: number) => {
      if (typeof preferred === 'number' && preferred >= 0) {
        if (!lanesArr[preferred]) lanesArr[preferred] = [];
        if (canPlace(lanesArr[preferred], clip)) {
          lanesArr[preferred].push(clip);
          byIdLane.set(clip.id, preferred);
          return;
        }
      }
      for (let i = 0; i < lanesArr.length; i++) {
        if (canPlace(lanesArr[i], clip)) {
          if (!lanesArr[i]) lanesArr[i] = [];
          lanesArr[i].push(clip);
          byIdLane.set(clip.id, i);
          return;
        }
      }
      lanesArr.push([clip]);
      byIdLane.set(clip.id, lanesArr.length - 1);
    };
    for (const clip of sorted) {
      const pref = desired && desired.id === clip.id ? desired.laneIndex : undefined;
      place(clip, pref);
    }
    return { lanesArr, byIdLane } as const;
  };

  // Clamp desired lane to a sane range (avoid huge sparse arrays)
  const maxLanesHint = Math.max(1, snapshotClips.length + 5);
  const desiredLaneIndex = draggingClip
    ? Math.max(0, Math.min(maxLanesHint, draggingClip.previewLaneIndex))
    : undefined;
  const laneAssignment = useMemo(
    () => assignLanes(snapshotClips, draggingClip ? { id: draggingClip.clipId, laneIndex: desiredLaneIndex } : undefined),
    [snapshotClips, desiredLaneIndex, draggingClip]
  );
  const lanesCount = laneAssignment.lanesArr.length;
  const trackHeaderHeight = 24;
  const extraLanesBelow = 2;
  const tracksAreaHeight = Math.max(1, lanesCount + extraLanesBelow) * laneHeight;
  const totalHeight = trackHeaderHeight + tracksAreaHeight;

  const clipBlocks = useMemo(() => {
    return clips.map((clip, index) => {
      const color = COLORS[index % COLORS.length];
      const duration = getDurationFor(clip);
      const id = clip._id as string;
      let start = clip.timelineStartFrame;
      let end = start + duration;
      if (draggingClip && draggingClip.clipId === id) {
        start = draggingClip.previewFrame;
        end = start + duration;
      }
      const laneIndex = laneAssignment.byIdLane.get(clip._id as string) ?? 0;
      return {
        ...clip,
        left: start * pxPerFrame,
        width: Math.max(1, (end - start) * pxPerFrame),
        color,
        clipDuration: Math.max(1, Math.round(end - start)),
        laneIndex,
      };
    });
  }, [clips, pxPerFrame, laneAssignment, draggingClip]);

  const ticks = useMemo(() => {
    const seconds = durationFrames / Math.max(1, fps);
    const tickEvery = Math.max(1, Math.floor(seconds / 10));
    const framesPerTick = tickEvery * Math.max(1, fps);
    const items: Array<{ frame: number; left: number }> = [];
    for (let frame = 0; frame <= durationFrames; frame += framesPerTick) {
      items.push({ frame, left: frame * pxPerFrame });
    }
    return items;
  }, [durationFrames, fps, pxPerFrame]);

  const handleSeek = (clientX: number) => {
    if (!trackRef.current || !containerRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const x = clientX - rect.left + scrollLeft;
    const frame = Math.max(0, Math.round(x / pxPerFrame));
    onSeek(Math.min(frame, durationFrames - 1));
  };

  // Smooth dragging across the timeline (mouse & touch) and clip dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (trimming) {
        const dx = e.clientX - trimming.startX;
        const df = Math.round(dx / pxPerFrame);
        if (trimming.edge === 'start') {
          const maxStart = Math.max(0, trimming.slotDuration - 1 - trimming.origEnd);
          const previewStart = Math.max(0, Math.min(maxStart, trimming.origStart + df));
          setTrimming({ ...trimming, previewStart });
        } else {
          const maxEnd = Math.max(0, trimming.slotDuration - 1 - trimming.origStart);
          const previewEnd = Math.max(0, Math.min(maxEnd, trimming.origEnd - df));
          setTrimming({ ...trimming, previewEnd });
        }
        e.preventDefault();
        return;
      }
      if (draggingClip) {
        const dx = e.clientX - draggingClip.startX;
        const dy = e.clientY - draggingClip.startY;
        const df = Math.round(dx / pxPerFrame);
        const dl = Math.round(dy / laneHeight);
        const previewFrame = Math.max(0, Math.min(durationFrames - 1, draggingClip.origFrame + df));
        const previewLaneIndex = Math.max(0, draggingClip.origLaneIndex + dl);
        setDraggingClip({ ...draggingClip, previewFrame, previewLaneIndex });
        e.preventDefault();
        return;
      }
      if (isDraggingRef.current) {
        handleSeek(e.clientX);
      }
    };
    const onMouseUp = () => {
      if (trimming) {
        onTrimClip?.(trimming.clipId, { start: trimming.previewStart, end: trimming.previewEnd });
        setTrimming(null);
      } else if (draggingClip) {
        const finalLane = laneAssignment.byIdLane.get(draggingClip.clipId) ?? draggingClip.previewLaneIndex;
        const computedZ = 1000 - finalLane;
        onMoveClip?.(draggingClip.clipId, {
          timelineStartFrame: draggingClip.previewFrame,
          zIndex: computedZ,
        });
        setDraggingClip(null);
      }
      isDraggingRef.current = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (trimming) {
        if (e.touches && e.touches.length > 0) {
          const t = e.touches[0];
          const dx = t.clientX - trimming.startX;
          const df = Math.round(dx / pxPerFrame);
          if (trimming.edge === 'start') {
            const maxStart = Math.max(0, trimming.slotDuration - 1 - trimming.origEnd);
            const previewStart = Math.max(0, Math.min(maxStart, trimming.origStart + df));
            setTrimming({ ...trimming, previewStart });
          } else {
            const maxEnd = Math.max(0, trimming.slotDuration - 1 - trimming.origStart);
            const previewEnd = Math.max(0, Math.min(maxEnd, trimming.origEnd - df));
            setTrimming({ ...trimming, previewEnd });
          }
          e.preventDefault();
        }
        return;
      }
      if (draggingClip) {
        if (e.touches && e.touches.length > 0) {
          const t = e.touches[0];
          const dx = t.clientX - draggingClip.startX;
          const dy = t.clientY - draggingClip.startY;
          const df = Math.round(dx / pxPerFrame);
          const dl = Math.round(dy / laneHeight);
          const previewFrame = Math.max(0, Math.min(durationFrames - 1, draggingClip.origFrame + df));
          const previewLaneIndex = Math.max(0, draggingClip.origLaneIndex + dl);
          setDraggingClip({ ...draggingClip, previewFrame, previewLaneIndex });
          e.preventDefault();
        }
        return;
      }
      if (isDraggingRef.current) {
        if (e.touches && e.touches.length > 0) {
          e.preventDefault();
          handleSeek(e.touches[0].clientX);
        }
      }
    };
    const onTouchEnd = () => {
      if (trimming) {
        onTrimClip?.(trimming.clipId, { start: trimming.previewStart, end: trimming.previewEnd });
        setTrimming(null);
      } else if (draggingClip) {
        const finalLane = laneAssignment.byIdLane.get(draggingClip.clipId) ?? draggingClip.previewLaneIndex;
        const computedZ = 1000 - finalLane;
        onMoveClip?.(draggingClip.clipId, {
          timelineStartFrame: draggingClip.previewFrame,
          zIndex: computedZ,
        });
        setDraggingClip(null);
      }
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove as any);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [draggingClip, trimming, laneAssignment, laneHeight, pxPerFrame, durationFrames, onMoveClip, onTrimClip]);

  return (
    <div className="w-full select-none">
      <div className="mb-2 flex items-center justify-between text-xs text-white/60">
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); onTogglePlay?.(); }}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            className="rounded-full border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); onReset?.(); }}
            title="Reset (R)"
          >
            Reset
          </button>
          <div className="relative group">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/70">?</span>
            <div className="pointer-events-none absolute left-1/2 z-50 hidden w-72 -translate-x-1/2 translate-y-2 rounded-lg border border-white/10 bg-black/80 p-3 text-[11px] text-white shadow-xl group-hover:block">
              <div className="font-semibold mb-1">Shortcuts</div>
              <ul className="space-y-0.5">
                <li><span className="text-white/60">Space</span> — Play/Pause</li>
                <li><span className="text-white/60">R</span> — Reset to start</li>
                <li><span className="text-white/60">←/→</span> — Step 1 frame</li>
                <li><span className="text-white/60">Shift+←/→</span> — Step 10 frames</li>
                <li><span className="text-white/60">Cmd/Ctrl+Shift+D</span> — Split layer at playhead</li>
                <li><span className="text-white/60">Cmd/Ctrl+D</span> — Duplicate layer at playhead</li>
                <li><span className="text-white/60">Delete/Backspace</span> — Delete selected layer</li>
              </ul>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2">
          Zoom
          <input
            type="range"
            min={0}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
          />
        </label>
      </div>
      <div
        className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 select-none"
        ref={containerRef}
        onMouseDown={(e) => { isDraggingRef.current = true; handleSeek(e.clientX); }}
        onTouchStart={(e) => { if (e.touches && e.touches.length > 0) { isDraggingRef.current = true; handleSeek(e.touches[0].clientX); } }}
        onClick={() => onSelectClip?.(null)}
      >
        <div ref={trackRef} className="relative" style={{ width: totalWidth, height: totalHeight }}>
          <div className="absolute inset-x-0 top-0 h-6 border-b border-white/5">
            {ticks.map((tick) => (
              <div key={tick.frame} className="absolute text-[10px] text-white/50" style={{ left: tick.left }}>
                <div className="h-3 w-px bg-white/30" />
                {Math.round(tick.frame)}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 top-6" style={{ height: tracksAreaHeight }}>
            {Array.from({ length: Math.max(lanesCount + extraLanesBelow, 1) }).map((_, idx) => (
              <div
                key={`lane-${idx}`}
                className={"absolute inset-x-0 border-t border-white/10 " + (idx % 2 === 0 ? 'bg-white/5' : 'bg-white/10')}
                style={{ top: idx * laneHeight, height: laneHeight }}
                aria-hidden
              />
            ))}
            {clipBlocks.map((clip) => (
              <div
                key={clip._id}
                onClick={(e) => { e.stopPropagation(); onSelectClip?.(clip._id as string); }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const currentLaneIdx = draggingClip?.clipId === (clip._id as string)
                    ? draggingClip.previewLaneIndex
                    : clip.laneIndex;
                  setDraggingClip({
                    clipId: clip._id as string,
                    startX: e.clientX,
                    startY: e.clientY,
                    origFrame: Math.round(clip.left / Math.max(1, pxPerFrame)),
                    origLaneIndex: currentLaneIdx,
                    previewFrame: Math.round(clip.left / Math.max(1, pxPerFrame)),
                    previewLaneIndex: currentLaneIdx,
                  });
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  if (!e.touches || e.touches.length === 0) return;
                  const t = e.touches[0];
                  const currentLaneIdx = draggingClip?.clipId === (clip._id as string)
                    ? draggingClip.previewLaneIndex
                    : clip.laneIndex;
                  setDraggingClip({
                    clipId: clip._id as string,
                    startX: t.clientX,
                    startY: t.clientY,
                    origFrame: Math.round(clip.left / Math.max(1, pxPerFrame)),
                    origLaneIndex: currentLaneIdx,
                    previewFrame: Math.round(clip.left / Math.max(1, pxPerFrame)),
                    previewLaneIndex: currentLaneIdx,
                  });
                }}
                className={`absolute h-12 rounded-lg px-3 py-2 text-[11px] cursor-grab active:cursor-grabbing ${selectedClipId === (clip._id as string)
                  ? 'border-2 border-yellow-300 ring-2 ring-yellow-300/30'
                  : 'border border-white/20'} bg-opacity-80 text-black`}
                style={{
                  left:
                    draggingClip && draggingClip.clipId === (clip._id as string)
                      ? draggingClip.previewFrame * pxPerFrame
                      : clip.left,
                  width: Math.max(8, clip.width),
                  backgroundColor: clip.color,
                  top:
                    (draggingClip && draggingClip.clipId === (clip._id as string)
                      ? (laneAssignment.byIdLane.get(clip._id as string) ?? draggingClip.previewLaneIndex)
                      : clip.laneIndex) * laneHeight,
                }}
              >
                <div className="font-semibold truncate">{clip.label ?? 'Clip'}</div>
                <div className="text-[10px] text-black/70">
                  Frames: {clip.clipDuration} · Speed ×{clip.speed}
                </div>
                {/* Trim overlays for non-visible parts */}
                {(() => {
                  const t = trims?.[clip._id as string] ?? { start: 0, end: 0 };
                  const ts = trimming && trimming.clipId === (clip._id as string) ? trimming.previewStart : Math.max(0, t.start);
                  const te = trimming && trimming.clipId === (clip._id as string) ? trimming.previewEnd : Math.max(0, t.end);
                  const leftW = Math.max(0, Math.min(clip.clipDuration, ts)) * pxPerFrame;
                  const rightW = Math.max(0, Math.min(clip.clipDuration, te)) * pxPerFrame;
                  return (
                    <>
                      {leftW > 0 && (
                        <div className="absolute inset-y-0 left-0 bg-black/30" style={{ width: leftW }} aria-hidden />
                      )}
                      {rightW > 0 && (
                        <div className="absolute inset-y-0 right-0 bg-black/30" style={{ width: rightW }} aria-hidden />
                      )}
                      {/* Visible window border for clarity */}
                      <div
                        className="absolute inset-y-0 border-x-2 border-white/40 pointer-events-none"
                        style={{ left: leftW, right: rightW }}
                        aria-hidden
                      />
                      {/* Trim handles */}
                      <div
                        className="absolute top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize rounded bg-white/60 hover:bg-white"
                        style={{ left: leftW }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTrimming({
                            clipId: clip._id as string,
                            edge: 'start',
                            startX: e.clientX,
                            slotDuration: clip.clipDuration,
                            origStart: Math.max(0, t.start),
                            origEnd: Math.max(0, t.end),
                            previewStart: Math.max(0, t.start),
                            previewEnd: Math.max(0, t.end),
                          });
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const touch = e.touches?.[0];
                          if (!touch) return;
                          setTrimming({
                            clipId: clip._id as string,
                            edge: 'start',
                            startX: touch.clientX,
                            slotDuration: clip.clipDuration,
                            origStart: Math.max(0, t.start),
                            origEnd: Math.max(0, t.end),
                            previewStart: Math.max(0, t.start),
                            previewEnd: Math.max(0, t.end),
                          });
                        }}
                        title="Trim start"
                      />
                      <div
                        className="absolute top-0 h-full w-2 translate-x-1/2 cursor-ew-resize rounded bg-white/60 hover:bg-white"
                        style={{ right: rightW }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTrimming({
                            clipId: clip._id as string,
                            edge: 'end',
                            startX: e.clientX,
                            slotDuration: clip.clipDuration,
                            origStart: Math.max(0, t.start),
                            origEnd: Math.max(0, t.end),
                            previewStart: Math.max(0, t.start),
                            previewEnd: Math.max(0, t.end),
                          });
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const touch = e.touches?.[0];
                          if (!touch) return;
                          setTrimming({
                            clipId: clip._id as string,
                            edge: 'end',
                            startX: touch.clientX,
                            slotDuration: clip.clipDuration,
                            origStart: Math.max(0, t.start),
                            origEnd: Math.max(0, t.end),
                            previewStart: Math.max(0, t.start),
                            previewEnd: Math.max(0, t.end),
                          });
                        }}
                        title="Trim end"
                      />
                    </>
                  );
                })()}
                <div
                  className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-black/0 hover:bg-black/10"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizing({
                      clipId: clip._id as string,
                      edge: 'start',
                      startX: e.clientX,
                      origTimelineStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      origSourceIn: clip.sourceInFrame as number,
                      origSourceOut: clip.sourceOutFrame as number,
                      speed: clip.speed,
                      origDuration: clip.clipDuration,
                      previewStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      previewEnd: Math.round((clip.left + clip.width) / Math.max(1, pxPerFrame)),
                      origLaneIndex: clip.laneIndex,
                    });
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    const t = e.touches?.[0];
                    if (!t) return;
                    setResizing({
                      clipId: clip._id as string,
                      edge: 'start',
                      startX: t.clientX,
                      origTimelineStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      origSourceIn: clip.sourceInFrame as number,
                      origSourceOut: clip.sourceOutFrame as number,
                      speed: clip.speed,
                      origDuration: clip.clipDuration,
                      previewStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      previewEnd: Math.round((clip.left + clip.width) / Math.max(1, pxPerFrame)),
                      origLaneIndex: clip.laneIndex,
                    });
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-black/0 hover:bg-black/10"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizing({
                      clipId: clip._id as string,
                      edge: 'end',
                      startX: e.clientX,
                      origTimelineStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      origSourceIn: clip.sourceInFrame as number,
                      origSourceOut: clip.sourceOutFrame as number,
                      speed: clip.speed,
                      origDuration: clip.clipDuration,
                      previewStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      previewEnd: Math.round((clip.left + clip.width) / Math.max(1, pxPerFrame)),
                      origLaneIndex: clip.laneIndex,
                    });
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    const t = e.touches?.[0];
                    if (!t) return;
                    setResizing({
                      clipId: clip._id as string,
                      edge: 'end',
                      startX: t.clientX,
                      origTimelineStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      origSourceIn: clip.sourceInFrame as number,
                      origSourceOut: clip.sourceOutFrame as number,
                      speed: clip.speed,
                      origDuration: clip.clipDuration,
                      previewStart: Math.round(clip.left / Math.max(1, pxPerFrame)),
                      previewEnd: Math.round((clip.left + clip.width) / Math.max(1, pxPerFrame)),
                      origLaneIndex: clip.laneIndex,
                    });
                  }}
                />
              </div>
            ))}
            {/* Playhead handle (no vertical line) */}
            <div className="absolute" style={{ left: playhead * pxPerFrame }}>
              <div className="absolute -top-4 -translate-x-1/2 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-black shadow">
                {Math.round(playhead)}
              </div>
              <div
                className="absolute top-2 -translate-x-1/2 h-3 w-3 rounded-full bg-white border border-white/30 shadow cursor-ew-resize"
                title={`${Math.round(playhead)}`}
                onMouseDown={(e) => { e.stopPropagation(); isDraggingRef.current = true; }}
                onTouchStart={(e) => { e.stopPropagation(); isDraggingRef.current = true; }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
