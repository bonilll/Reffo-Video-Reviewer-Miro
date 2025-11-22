import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
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
  onRenameClip?: (clipId: string, title: string) => void;
};

const COLORS = ['#38bdf8', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#facc15'];
const colorForId = (id: string): string => {
  // Generate a wide range of hues to reduce collision between many clips
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const sat = 75;
  const light = 55;
  return `hsl(${hue} ${sat}% ${light}%)`;
};

const lanesFromClips = (clips: Array<{ zIndex: number }>) => {
  const zs = Array.from(new Set(clips.map((c) => c.zIndex)));
  zs.sort((a, b) => b - a); // highest z on top
  const topExtra = (zs[0] ?? 0) + 1;
  const bottomExtra = (zs[zs.length - 1] ?? 0) - 1;
  return [topExtra, ...zs, bottomExtra];
};

export const EditorTimeline: React.FC<TimelineProps> = ({ clips, durationFrames, fps, playhead, zoom, onSeek, onZoomChange, selectedClipId, onSelectClip, onMoveClip, trims, onTrimClip, playing = false, onTogglePlay, onReset, onRenameClip, onAddClip, masterVolume = 1, onChangeVolume }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const isDraggingRef = useRef(false);
  const laneHeight = 32;
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
  const [pendingTrimMap, setPendingTrimMap] = useState<Map<string, { start: number; end: number }>>(new Map());
  const [pendingMoveMap, setPendingMoveMap] = useState<Map<string, { frame: number; laneIndex: number; zIndex: number }>>(new Map());
  const [helpOpen, setHelpOpen] = useState(false);

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

  // no-op: playhead marker follows content horizontally; only vertical stickiness applied

  // Compute non-overlapping lanes from timing; top row has highest priority.
  type SimpleClip = { id: string; start: number; end: number };
  const getDurationFor = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));

  // Optimistic view: apply pending move/zIndex locally to avoid bounce until server confirms
  const effectiveClips = useMemo(() => {
    if (pendingMoveMap.size === 0 && !draggingClip) return clips;
    return clips.map((c) => {
      const id = c._id as unknown as string;
      const pend = pendingMoveMap.get(id);
      let next = c as ClipDoc;
      if (pend) {
        next = { ...next, timelineStartFrame: pend.frame, zIndex: pend.zIndex } as ClipDoc;
      }
      if (draggingClip && draggingClip.clipId === id) {
        next = { ...next, timelineStartFrame: draggingClip.previewFrame } as ClipDoc;
      }
      return next;
    });
  }, [clips, pendingMoveMap, draggingClip]);

  // Stable lane mapping strictly by zIndex (AE-like):
  // - Lane index derives from sorted unique z values (highest z at top)
  // - Other clips never auto-relane during a drag; only the dragged one changes lane by vertical movement
  const lanesForBg = lanesFromClips(effectiveClips);
  const indexForZ = useMemo(() => {
    const map = new Map<number, number>();
    lanesForBg.forEach((z, idx) => map.set(z, idx));
    return map;
  }, [lanesForBg]);
  const lanesCount = lanesForBg.length;
  const trackHeaderHeight = 24;
  const extraLanesBelow = 2;
  const tracksAreaHeight = Math.max(1, lanesCount + extraLanesBelow) * laneHeight;
  const totalHeight = trackHeaderHeight + tracksAreaHeight;

  const clipBlocks = useMemo(() => {
    const lanes = lanesFromClips(effectiveClips);
    const indexForZ = new Map<number, number>();
    lanes.forEach((z, idx) => indexForZ.set(z, idx));
    return effectiveClips.map((clip) => {
      const id = clip._id as string;
      const color = colorForId(id);
      const duration = getDurationFor(clip);
      let start = clip.timelineStartFrame;
      let end = start + duration;
      if (draggingClip && draggingClip.clipId === id) {
        start = draggingClip.previewFrame;
        end = start + duration;
      }
      const laneIndex = draggingClip && draggingClip.clipId === id
        ? draggingClip.previewLaneIndex
        : indexForZ.get(clip.zIndex) ?? 0;
      // Clip rendering to [0, durationFrames) without shifting the whole timeline.
      const hiddenBefore = Math.max(0, -start);
      const hiddenAfter = Math.max(0, end - durationFrames);
      const visStart = Math.max(0, start);
      const visEnd = Math.min(durationFrames, end);
      const visibleFrames = Math.max(0, visEnd - visStart);
      return {
        ...clip,
        left: visStart * pxPerFrame,
        width: Math.max(1, visibleFrames * pxPerFrame),
        color,
        clipDuration: Math.max(1, Math.round(end - start)),
        laneIndex,
        __hiddenBefore: hiddenBefore,
        __hiddenAfter: hiddenAfter,
      };
    });
  }, [effectiveClips, pxPerFrame, draggingClip]);

  const ticks = useMemo(() => {
    // show more frame labels: ~20 divisions
    const framesPerTick = Math.max(1, Math.floor(durationFrames / 20));
    const items: Array<{ frame: number; left: number }> = [];
    for (let frame = 0; frame <= durationFrames; frame += framesPerTick) {
      items.push({ frame, left: frame * pxPerFrame });
    }
    return items;
  }, [durationFrames, fps, pxPerFrame]);

  const handleSeek = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
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
        const previewFrame = Math.min(durationFrames - 1, draggingClip.origFrame + df);
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
        setPendingTrimMap((prev) => {
          const next = new Map(prev);
          next.set(trimming.clipId, { start: trimming.previewStart, end: trimming.previewEnd });
          return next;
        });
        setTrimming(null);
      } else if (draggingClip) {
        const lanes = lanesFromClips(clips);
        const desiredLane = Math.max(0, Math.min(lanes.length - 1, draggingClip.previewLaneIndex));
        let computedZ = lanes[desiredLane];
        // Enforce at most one clip per lane: if occupied by another clip, push to the top lane
        const occupied = clips.some((c) => (c._id as string) !== draggingClip.clipId && c.zIndex === computedZ);
        const targetLaneIndex = occupied ? 0 : desiredLane;
        if (occupied) {
          computedZ = lanes[0];
        }
        onMoveClip?.(draggingClip.clipId, {
          timelineStartFrame: draggingClip.previewFrame,
          zIndex: computedZ,
        });
        setPendingMoveMap((prev) => {
          const next = new Map(prev);
          next.set(draggingClip.clipId, { frame: draggingClip.previewFrame, laneIndex: targetLaneIndex, zIndex: computedZ });
          return next;
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
          const previewFrame = Math.min(durationFrames - 1, draggingClip.origFrame + df);
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
        setPendingTrimMap((prev) => {
          const next = new Map(prev);
          next.set(trimming.clipId, { start: trimming.previewStart, end: trimming.previewEnd });
          return next;
        });
        setTrimming(null);
      } else if (draggingClip) {
        const lanes = lanesFromClips(clips);
        const desiredLane = Math.max(0, Math.min(lanes.length - 1, draggingClip.previewLaneIndex));
        let computedZ = lanes[desiredLane];
        const occupied = clips.some((c) => (c._id as string) !== draggingClip.clipId && c.zIndex === computedZ);
        const targetLaneIndex = occupied ? 0 : desiredLane;
        if (occupied) {
          computedZ = lanes[0];
        }
        onMoveClip?.(draggingClip.clipId, {
          timelineStartFrame: draggingClip.previewFrame,
          zIndex: computedZ,
        });
        setPendingMoveMap((prev) => {
          const next = new Map(prev);
          next.set(draggingClip.clipId, { frame: draggingClip.previewFrame, laneIndex: targetLaneIndex, zIndex: computedZ });
          return next;
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
  }, [draggingClip, trimming, laneHeight, pxPerFrame, durationFrames, onMoveClip, onTrimClip, clips]);

  useEffect(() => {
    if (!trims) return;
    if (pendingTrimMap.size === 0) return;
    setPendingTrimMap((prev) => {
      const next = new Map(prev);
      for (const [id, val] of prev) {
        const server = trims[id];
        if (server && server.start === val.start && server.end === val.end) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [trims]);

  useEffect(() => {
    if (pendingMoveMap.size === 0) return;
    setPendingMoveMap((prev) => {
      const next = new Map(prev);
      for (const [id, val] of prev) {
        const server = clips.find((c) => (c._id as string) === id);
        if (server && server.timelineStartFrame === val.frame && server.zIndex === val.zIndex) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [clips]);

  const getActiveClip = () => {
    const byId = new Map<string, ClipDoc>(clips.map(c => [c._id as unknown as string, c]));
    const selected = selectedClipId ? byId.get(selectedClipId) ?? null : null;
    const contains = (clip: ClipDoc) => {
      const dur = getDurationFor(clip);
      const t = trims?.[clip._id as string] ?? { start: 0, end: 0 };
      const start = clip.timelineStartFrame + Math.max(0, t.start);
      const end = clip.timelineStartFrame + Math.max(1, dur - Math.max(0, t.end));
      return playhead >= start && playhead < end;
    };
    if (selected && contains(selected)) return selected;
    const candidates = clips.filter(contains);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
  };

  const jumpToClipStart = () => {
    const c = getActiveClip();
    if (!c) return;
    const dur = getDurationFor(c);
    const t = trims?.[c._id as string] ?? { start: 0, end: 0 };
    const start = c.timelineStartFrame + Math.max(0, t.start);
    onSeek(Math.max(0, Math.min(durationFrames - 1, start)));
  };
  const jumpToClipEnd = () => {
    const c = getActiveClip();
    if (!c) return;
    const dur = getDurationFor(c);
    const t = trims?.[c._id as string] ?? { start: 0, end: 0 };
    const end = c.timelineStartFrame + Math.max(1, dur - Math.max(0, t.end));
    onSeek(Math.max(0, Math.min(durationFrames - 1, end - 1)));
  };

  return (
    <div className="w-full select-none">
      <div className="mb-3 grid grid-cols-[48px_1fr] gap-3 text-xs text-white/60">
        <div className="flex flex-col items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-white/80 hover:bg-white/10"
            title="Add clip"
            onClick={(e) => { e.stopPropagation(); onAddClip?.(); }}
          >
            +
          </button>
          <div className="w-9">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(masterVolume * 100)}
              onChange={(e) => onChangeVolume?.(Math.max(0, Math.min(100, Number(e.target.value))) / 100)}
              className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
              title={`Volume ${Math.round(masterVolume * 100)}%`}
            />
          </div>
        </div>
        <div className="relative h-12">
        {/* Hover trigger */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 text-[11px] text-white/80"
            onMouseEnter={() => setHelpOpen(true)}
          >
            ?
          </span>
        </div>
        {helpOpen && createPortal(
          <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center"
            onMouseLeave={() => setHelpOpen(false)}
          >
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative w-[min(92vw,960px)] max-h-[85vh] overflow-auto rounded-lg border border-white/10 bg-black/95 p-6 text-white shadow-2xl">
              <div className="mb-4 text-xl font-semibold text-white">Timeline — Shortcuts & Tips</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-sm">
                <div>
                  <div className="mb-2 font-semibold text-white/80">Transport</div>
                  <ul className="space-y-1">
                    <li><span className="text-white/60">Space</span> — Play/Pause</li>
                    <li><span className="text-white/60">R</span> — Reset to start</li>
                    <li><span className="text-white/60">←/→</span> — Step 1 frame</li>
                    <li><span className="text-white/60">Shift+←/→</span> — Step 10 frames</li>
                    <li><span className="text-white/60">I</span> — Jump to clip start</li>
                    <li><span className="text-white/60">O</span> — Jump to clip end</li>
                  </ul>
                </div>
                <div>
                  <div className="mb-2 font-semibold text-white/80">Edit</div>
                  <ul className="space-y-1">
                    <li><span className="text-white/60">Cmd/Ctrl+Shift+D</span> — Split layer at playhead</li>
                    <li><span className="text-white/60">Cmd/Ctrl+D</span> — Duplicate layer</li>
                    <li><span className="text-white/60">Delete / Backspace</span> — Delete selected layer</li>
                    <li><span className="text-white/60">Drag edges</span> — Trim visible area</li>
                    <li><span className="text-white/60">Drag layer</span> — Move in time / change lane</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onSeek(Math.max(0, playhead - 1)); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80" title="Prev frame (←)"><ChevronLeft size={18} /></button>
          <button onClick={(e) => { e.stopPropagation(); jumpToClipStart(); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80" title="Clip start (I)"><SkipBack size={18} /></button>
          <button onClick={(e) => { e.stopPropagation(); onTogglePlay?.(); }} className="p-3 rounded-full bg-white text-black hover:bg-white/90" title={playing ? 'Pause (Space)' : 'Play (Space)'}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); jumpToClipEnd(); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80" title="Clip end (O)"><SkipForward size={18} /></button>
          <button onClick={(e) => { e.stopPropagation(); onSeek(Math.min(durationFrames - 1, playhead + 1)); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80" title="Next frame (→)"><ChevronRight size={18} /></button>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-white/60">Zoom</span>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 text-white/80 hover:bg-white/10"
            onClick={() => onZoomChange(Math.max(0.1, Number((zoom - 0.1).toFixed(2))))}
            title="Zoom out"
          >
            −
          </button>
          <input
            type="range"
            min={0.1}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="h-1.5 w-40 appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
          />
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 text-white/80 hover:bg-white/10"
            onClick={() => onZoomChange(Math.min(4, Number((zoom + 0.1).toFixed(2))))}
            title="Zoom in"
          >
            +
          </button>
          <span className="w-10 text-right text-xs text-white/60">{zoom.toFixed(1)}×</span>
        </div>
        </div>
      </div>
      <div
        className="overflow-x-auto overflow-y-auto max-h-64 rounded-2xl border border-white/10 bg-black/40 select-none"
        ref={containerRef}
        onScroll={() => { /* horizontal scroll moves content; marker moves with content */ }}
        onMouseDown={(e) => { isDraggingRef.current = true; handleSeek(e.clientX); }}
        onTouchStart={(e) => { if (e.touches && e.touches.length > 0) { isDraggingRef.current = true; handleSeek(e.touches[0].clientX); } }}
        onClick={() => onSelectClip?.(null)}
      >
        <div ref={trackRef} className="relative" style={{ width: totalWidth, height: totalHeight }}>
          <div className="sticky top-0 z-10 h-6 border-b border-white/10 bg-black/50 backdrop-blur">
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
                  const startFrame = Math.round((clip as any).timelineStartFrame as number);
                  setDraggingClip({
                    clipId: clip._id as string,
                    startX: e.clientX,
                    startY: e.clientY,
                    origFrame: startFrame,
                    origLaneIndex: currentLaneIdx,
                    previewFrame: startFrame,
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
                  const startFrame = Math.round((clip as any).timelineStartFrame as number);
                  setDraggingClip({
                    clipId: clip._id as string,
                    startX: t.clientX,
                    startY: t.clientY,
                    origFrame: startFrame,
                    origLaneIndex: currentLaneIdx,
                    previewFrame: startFrame,
                    previewLaneIndex: currentLaneIdx,
                  });
                }}
                className={`absolute h-8 rounded-md px-2 py-1 text-[11px] cursor-grab active:cursor-grabbing ${selectedClipId === (clip._id as string)
                  ? 'border-2 border-yellow-300 ring-2 ring-yellow-300/30'
                  : 'border border-white/20'} bg-opacity-80 text-black`}
                style={{
                  left:
                    draggingClip && draggingClip.clipId === (clip._id as string)
                      ? Math.max(0, draggingClip.previewFrame) * pxPerFrame
                      : pendingMoveMap.get(clip._id as string)
                        ? Math.max(0, pendingMoveMap.get(clip._id as string)!.frame) * pxPerFrame
                        : clip.left,
                  width: Math.max(8, clip.width),
                  backgroundColor: clip.color,
                  top:
                    (draggingClip && draggingClip.clipId === (clip._id as string)
                      ? draggingClip.previewLaneIndex
                      : pendingMoveMap.get(clip._id as string)
                        ? pendingMoveMap.get(clip._id as string)!.laneIndex
                        : clip.laneIndex) * laneHeight,
                }}
              >
                {/* Editable title */}
                <EditableTitle id={clip._id as string} title={clip.label ?? 'Clip'} onRename={onRenameClip} />
                {/* Trim overlays for non-visible parts */}
                {(() => {
                  const t = trims?.[clip._id as string] ?? { start: 0, end: 0 };
                  const pend = pendingTrimMap.get(clip._id as string);
                  const ts = trimming && trimming.clipId === (clip._id as string)
                    ? trimming.previewStart
                    : pend
                      ? pend.start
                      : Math.max(0, t.start);
                  const te = trimming && trimming.clipId === (clip._id as string)
                    ? trimming.previewEnd
                    : pend
                      ? pend.end
                      : Math.max(0, t.end);
                  const hiddenBefore = (clip as any).__hiddenBefore as number || 0;
                  const hiddenAfter = (clip as any).__hiddenAfter as number || 0;
                  const slotVisible = Math.max(0, clip.clipDuration - hiddenBefore - hiddenAfter);
                  const leftW = Math.max(0, Math.min(slotVisible, ts - hiddenBefore)) * pxPerFrame;
                  const rightW = Math.max(0, Math.min(slotVisible, te - hiddenAfter)) * pxPerFrame;
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
                {/* Legacy resize handles removed in favor of white trim handles */}
              </div>
            ))}
            {/* Playhead handle (sticky vertically, moves with horizontal scroll) */}
            <div className="sticky top-6 z-20 pointer-events-none">
              <div className="absolute" style={{ transform: `translateX(${(playhead * pxPerFrame)}px)` }}>
                <div className="absolute -top-4 -translate-x-1/2 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-black shadow" title={`Frame ${Math.round(playhead)}`}>
                  {Math.round(playhead)}
                </div>
                <div className="absolute top-1 -translate-x-1/2 h-3 w-3 rounded-full bg-white border border-white/30 shadow" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditableTitle: React.FC<{ id: string; title: string; onRename?: (id: string, title: string) => void }>
  = ({ id, title, onRename }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  React.useEffect(() => { setDraft(title); }, [title]);
  const commit = React.useCallback(() => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onRename?.(id, next);
  }, [draft, title, id, onRename]);
  if (!editing) {
    return (
      <div className="font-semibold truncate" title={title} onDoubleClick={() => setEditing(true)}>
        {title}
      </div>
    );
  }
  return (
    <input
      autoFocus
      className="w-full rounded bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-black outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
    />
  );
};
