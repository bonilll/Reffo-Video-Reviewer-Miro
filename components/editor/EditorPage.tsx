import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { EditorTimeline } from './EditorTimeline';
import { Loader2, Pause, Play, RefreshCw, ChevronLeft, Info, Settings } from 'lucide-react';

const formatSeconds = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  const frames = Math.floor((seconds % 1) * 25)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}:${frames}`;
};

type SourceInfo = {
  _id: Id<'videos'>;
  title: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  durationFrames: number;
  storageKey: string;
  src: string;
};

type ClipDoc = {
  _id: Id<'compositionClips'>;
  compositionId: Id<'compositions'>;
  sourceVideoId: Id<'videos'>;
  sourceInFrame: number;
  sourceOutFrame: number;
  timelineStartFrame: number;
  speed: number;
  opacity?: number;
  transformTrackId?: Id<'keyframeTracks'>;
  zIndex: number;
  label?: string;
};

type CompositionDoc = {
  _id: Id<'compositions'>;
  title: string;
  description?: string;
  settings: {
    width: number;
    height: number;
    fps: number;
    durationFrames: number;
    backgroundColor?: string;
  };
};

type ExportDoc = {
  _id: Id<'compositionExports'>;
  status: string;
  format: string;
  progress: number;
  outputPublicUrl?: string;
  error?: string;
};

type CompositionResponse = {
  composition: CompositionDoc;
  clips: ClipDoc[];
  tracks: any[];
  exports: ExportDoc[];
  sources: Record<string, SourceInfo>;
};

type EditorPageProps = {
  compositionId: Id<'compositions'>;
  onExit: () => void;
};

const PreviewSurface: React.FC<{
  composition: CompositionDoc;
  clip: ClipDoc | null;
  source: SourceInfo | undefined;
  src: string | undefined;
  playhead: number;
  playing: boolean;
  transform?: { x: number; y: number; scale: number; rotate: number };
}> = ({ composition, clip, source, src, playhead, playing, transform }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (src && videoRef.current.src !== src) {
      videoRef.current.src = src;
      videoRef.current.load();
    }
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || !source || !src) return;
    const clipTimelineLength = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / Math.max(0.001, clip.speed)));
    if (playhead < clip.timelineStartFrame || playhead > clip.timelineStartFrame + clipTimelineLength) {
      video.pause();
      return;
    }
    const offset = playhead - clip.timelineStartFrame;
    const sourceFrame = clip.sourceInFrame + offset * clip.speed;
    const seconds = sourceFrame / Math.max(1, source.fps);
    const frameSec = 1 / Math.max(1, source.fps);
    if (!Number.isNaN(seconds) && Math.abs(video.currentTime - seconds) > frameSec * 0.75) {
      try {
        if (typeof (video as any).fastSeek === 'function') {
          (video as any).fastSeek(seconds);
        } else {
          video.currentTime = seconds;
        }
      } catch (err) {
        console.warn('Failed to seek preview', err);
      }
    }
    if (playing) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }, [clip, source, src, playhead, playing]);

  const style: React.CSSProperties = {};
  if (transform) {
    const tx = ((transform.x ?? 0.5) - 0.5) * 100;
    const ty = ((transform.y ?? 0.5) - 0.5) * 100;
    const sc = transform.scale ?? 1;
    const rot = transform.rotate ?? 0;
    style.transform = `translate(${tx}%, ${ty}%) scale(${sc}) rotate(${rot}deg)`;
    style.transformOrigin = '50% 50%';
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-3xl border border-white/10 bg-black/80 shadow-2xl overflow-hidden">
      {!clip || !source || !src ? (
        <div className="text-sm text-white/60">Select a clip or add footage to preview.</div>
      ) : (
        <video
          ref={videoRef}
          className="h-full max-h-full w-auto max-w-full object-contain"
          style={style}
          muted
          playsInline
          preload="auto"
        />
      )}
    </div>
  );
};

// Multi-clip composited preview (layers stacked by zIndex)
const MultiPreviewSurface: React.FC<{
  composition: CompositionDoc;
  items: Array<{ clip: ClipDoc; source: SourceInfo; src: string; transform?: { x: number; y: number; scale: number; rotate: number }; trim?: { start: number; end: number } }>;
  playhead: number;
  playing: boolean;
  primaryClipId?: string | null;
  onPrimaryTime?: (timeSec: number) => void;
}> = ({ composition, items, playhead, playing, primaryClipId, onPrimaryTime }) => {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    const map: Record<string, HTMLVideoElement | null> = { ...videoRefs.current };
    items.forEach((it) => {
      if (!map[it.clip._id as string]) map[it.clip._id as string] = null;
    });
    videoRefs.current = map;
  }, [items]);

  useEffect(() => {
    items.forEach((it) => {
      const video = videoRefs.current[it.clip._id as string];
      if (!video) return;
      if (it.src && video.src !== it.src) {
        try {
          video.src = it.src;
          video.load();
        } catch {}
      }
      const slotLen = Math.max(1, Math.round((it.clip.sourceOutFrame - it.clip.sourceInFrame) / Math.max(0.001, it.clip.speed)));
      const trimStart = Math.max(0, (it.trim?.start ?? 0));
      const trimEnd = Math.max(0, (it.trim?.end ?? 0));
      const visibleStart = it.clip.timelineStartFrame + trimStart;
      const visibleEnd = it.clip.timelineStartFrame + Math.max(1, slotLen - trimEnd);
      if (playhead < visibleStart || playhead >= visibleEnd) {
        video.pause();
        return;
      }
      const offset = playhead - visibleStart;
      const sourceFrame = it.clip.sourceInFrame + offset * it.clip.speed;
      const seconds = sourceFrame / Math.max(1, it.source.fps);
      const frameSec = 1 / Math.max(1, it.source.fps);
      if (!Number.isNaN(seconds) && Math.abs(video.currentTime - seconds) > frameSec * 0.75) {
        try {
          if (typeof (video as any).fastSeek === 'function') {
            (video as any).fastSeek(seconds);
          } else {
            video.currentTime = seconds;
          }
        } catch {}
      }
      if (playing) {
        if (video.paused) void video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.pause();
      }
    });
  }, [items, playhead, playing]);

  // Drive playhead from the primary video's clock if requested
  useEffect(() => {
    if (!playing || !primaryClipId || !onPrimaryTime) return;
    const el = videoRefs.current[primaryClipId as string];
    if (!el) return;
    let rafId: number | null = null;
    let stopped = false;
    const tick = (now?: any, metadata?: any) => {
      if (stopped) return;
      try { onPrimaryTime(el.currentTime || 0); } catch {}
      if ('requestVideoFrameCallback' in el) {
        (el as any).requestVideoFrameCallback(tick);
      } else {
        rafId = requestAnimationFrame(() => tick());
      }
    };
    if ('requestVideoFrameCallback' in el) {
      (el as any).requestVideoFrameCallback(tick);
    } else {
      rafId = requestAnimationFrame(() => tick());
    }
    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [primaryClipId, onPrimaryTime, playing]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {items
        .slice()
        .sort((a, b) => {
          const za = (a as any).renderZ ?? (a.clip.zIndex ?? 0);
          const zb = (b as any).renderZ ?? (b.clip.zIndex ?? 0);
          return za - zb;
        })
        .map((it) => {
          const t = it.transform ?? { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
          const tx = ((t.x ?? 0.5) - 0.5) * 100;
          const ty = ((t.y ?? 0.5) - 0.5) * 100;
          const sc = t.scale ?? 1;
          const rot = t.rotate ?? 0;
          const z = (it as any).renderZ ?? (it.clip.zIndex as unknown as number) ?? 0;
          const style: React.CSSProperties = {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translate(${tx}%, ${ty}%) scale(${sc}) rotate(${rot}deg)`,
            transformOrigin: '50% 50%',
            zIndex: z,
            opacity: typeof it.clip.opacity === 'number' ? Math.max(0, Math.min(1, it.clip.opacity!)) : 1,
          };
          return (
            <video
              key={it.clip._id as string}
              ref={(el) => { videoRefs.current[it.clip._id as string] = el; }}
              className="pointer-events-none h-full max-h-full w-auto max-w-full object-contain"
              style={style}
              muted
              playsInline
              preload="auto"
            />
          );
        })}
    </div>
  );
};

export const EditorPage: React.FC<EditorPageProps> = ({ compositionId, onExit }) => {
  const data = useQuery(api.edits.getComposition, { compositionId }) as CompositionResponse | undefined;
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const getDownloadUrl = useAction(api.storage.getDownloadUrl);
  const queueExport = useMutation(api.edits.queueExport);
  const [exporting, setExporting] = useState(false);
  const updateClip = useMutation(api.edits.updateClip);
  const addClip = useMutation(api.edits.addClip);
  const removeClip = useMutation(api.edits.removeClip);
  const upsertTrack = useMutation(api.edits.upsertKeyframeTrack);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  // Panels
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);

  // Local transform overrides for smooth, immediate UI feedback
  const [localTransformOverrides, setLocalTransformOverrides] = useState<Map<string, { x?: number; y?: number; scale?: number; rotate?: number }>>(new Map());
  const transformCommitTimers = useRef<Map<string, number>>(new Map());
  const transformClearTimers = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    return () => {
      transformCommitTimers.current.forEach((t) => window.clearTimeout(t));
      transformClearTimers.current.forEach((t) => window.clearTimeout(t));
      transformCommitTimers.current.clear();
      transformClearTimers.current.clear();
    };
  }, []);

  const scheduleTransformUpdate = React.useCallback((clipId: Id<'compositionClips'>, patch: { x?: number; y?: number; scale?: number; rotate?: number }) => {
    const id = clipId as unknown as string;
    // Merge into local overrides for instant visual response
    setLocalTransformOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? {};
      next.set(id, { ...cur, ...patch });
      return next;
    });

    // Debounce commit to server to avoid spamming mutations
    const prevTimer = transformCommitTimers.current.get(id);
    if (prevTimer) window.clearTimeout(prevTimer);
    const commitTimer = window.setTimeout(async () => {
      // Read the latest transform from server state to keep trackId
      const t = (data?.tracks as any[])?.find?.((tr) => tr.clipId === clipId && tr.channel === 'transform');
      const baseVal = t?.keyframes?.[0]?.value ?? { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
      const nextVal = { ...baseVal, ...(localTransformOverrides.get(id) ?? {}), ...patch } as any;
      try {
        await upsertTrack({
          compositionId: (data?.composition?._id ?? compositionId) as Id<'compositions'>,
          trackId: t?._id,
          clipId: clipId as any,
          channel: 'transform',
          keyframes: [{ frame: 0, value: nextVal, interpolation: 'hold' }],
        });
      } catch (err) {
        console.warn('Failed to commit transform', err);
      }
    }, 120);
    transformCommitTimers.current.set(id, commitTimer as unknown as number);

    // Clear local override slightly after commit to allow server state to reconcile
    const prevClear = transformClearTimers.current.get(id);
    if (prevClear) window.clearTimeout(prevClear);
    const clearTimer = window.setTimeout(() => {
      setLocalTransformOverrides((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      transformClearTimers.current.delete(id);
    }, 600);
    transformClearTimers.current.set(id, clearTimer as unknown as number);
  }, [data, compositionId, upsertTrack, localTransformOverrides]);

  useEffect(() => {
    setPlayhead(0);
    setPlaying(false);
  }, [compositionId]);

  useEffect(() => {
    if (!data?.sources) return;
    let cancelled = false;
    (async () => {
      for (const [videoId, source] of Object.entries(data.sources)) {
        if (videoUrls[videoId]) continue;
        try {
          const url = await getDownloadUrl({ storageKey: source.storageKey });
          if (!cancelled) {
            setVideoUrls((prev) => ({ ...prev, [videoId]: url }));
          }
        } catch (err) {
          console.error('Failed to load source', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.sources, getDownloadUrl, videoUrls]);

  useEffect(() => {
    if (!playing || !data) return;
    let frame: number;
    let last = performance.now();
    const run = (now: number) => {
      const delta = now - last;
      last = now;
      setPlayhead((prev) => {
        const increment = (delta / 1000) * data.composition.settings.fps;
        const next = prev + increment;
        if (next >= data.composition.settings.durationFrames) {
          return 0;
        }
        return next;
      });
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [playing, data]);

  const activeClips = useMemo(() => {
    if (!data) return [] as ClipDoc[];
    const getSlot = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));
    // trims are computed below; temporarily use empty map here and recompute after hook order
    return data.clips.filter(() => true);
  }, [data]);

  // Compute lane-based render Z for preview (unconditional hook; tolerates missing data)
  const renderZByClipId = useMemo(() => {
    if (!data) return new Map<string, number>();
    type S = { id: string; start: number; end: number };
    const getDur = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));
    const all: S[] = data.clips.map((c) => ({ id: c._id as string, start: c.timelineStartFrame, end: c.timelineStartFrame + getDur(c) }));
    const lanes: Array<S[]> = [];
    const byId = new Map<string, number>();
    const canPlace = (lane: S[] | undefined, clip: S) => !lane || lane.every((x) => x.end <= clip.start || x.start >= clip.end);
    const sorted = all.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    for (const c of sorted) {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (canPlace(lanes[i], c)) {
          lanes[i].push(c);
          byId.set(c.id, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([c]);
        byId.set(c.id, lanes.length - 1);
      }
    }
    const out = new Map<string, number>();
    for (const [id, lane] of byId.entries()) out.set(id, 1000 - lane);
    return out;
  }, [data]);

  // Determine the primary clip under the playhead (unconditional hook)
  const activePrimaryClip = useMemo(() => {
    if (!data) return null as ClipDoc | null;
    const selected = selectedClipId ? data.clips.find((c) => (c._id as string) === selectedClipId) ?? null : null;
    const contains = (clip: ClipDoc) => {
      const clipDuration = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / Math.max(0.001, clip.speed)));
      return playhead >= clip.timelineStartFrame && playhead < clip.timelineStartFrame + clipDuration;
    };
    if (selected && contains(selected)) return selected;
    const candidates = data.clips.filter(contains);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
  }, [data, selectedClipId, playhead]);

  // Trims per clip via keyframe track 'trim' (value: { start, end })
  const trimByClipId = useMemo(() => {
    const map = new Map<string, { start: number; end: number }>();
    if (data?.tracks) {
      (data.tracks as any[]).forEach((tr) => {
        if (tr.channel === 'trim' && tr.clipId && Array.isArray(tr.keyframes) && tr.keyframes.length > 0) {
          const v = (tr.keyframes[0] as any)?.value ?? {};
          const s = Math.max(0, Math.round(v.start ?? 0));
          const e = Math.max(0, Math.round(v.end ?? 0));
          map.set(tr.clipId as string, { start: s, end: e });
        }
      });
    }
    return map;
  }, [data?.tracks]);

  // Recompute active clips considering trims
  const activeClipsWithTrim = useMemo(() => {
    if (!data) return [] as ClipDoc[];
    const getSlot = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));
    return data.clips.filter((clip) => {
      const slot = getSlot(clip);
      const t = trimByClipId.get(clip._id as string) ?? { start: 0, end: 0 };
      const startF = clip.timelineStartFrame + Math.max(0, t.start);
      const endF = clip.timelineStartFrame + Math.max(1, slot - Math.max(0, t.end));
      return playhead >= startF && playhead < endF;
    });
  }, [data, trimByClipId, playhead]);

  // Selected clip object (unconditional hook)
  const selectedClipObj = useMemo(() => {
    if (!data) return null as ClipDoc | null;
    return data.clips.find((c) => (c._id as string) === selectedClipId) ?? null;
  }, [data, selectedClipId]);

  // Editing actions: split (cut), duplicate, delete — define before guard to keep hook order stable
  const handleSplitAtPlayhead = React.useCallback(async () => {
    if (!data || !activePrimaryClip) return;
    const offset = Math.round(playhead - activePrimaryClip.timelineStartFrame);
    if (offset <= 0) return;
    const cutSourceFrame = activePrimaryClip.sourceInFrame + Math.round(offset * Math.max(0.001, activePrimaryClip.speed));
    if (cutSourceFrame <= activePrimaryClip.sourceInFrame || cutSourceFrame >= activePrimaryClip.sourceOutFrame) return;
    await updateClip({ clipId: activePrimaryClip._id as any, patch: { sourceOutFrame: cutSourceFrame } });
    await addClip({
      compositionId: (data?.composition?._id ?? compositionId) as Id<'compositions'>,
      sourceVideoId: activePrimaryClip.sourceVideoId,
      sourceInFrame: cutSourceFrame,
      sourceOutFrame: activePrimaryClip.sourceOutFrame,
      timelineStartFrame: Math.round(playhead),
      speed: activePrimaryClip.speed,
      opacity: 1,
      label: activePrimaryClip.label ?? 'Clip',
      zIndex: (activePrimaryClip as any).zIndex ?? 0,
    });
  }, [data, activePrimaryClip, playhead, updateClip, addClip, compositionId]);

  const handleDuplicateAtPlayhead = React.useCallback(async () => {
    const base = selectedClipObj ?? activePrimaryClip;
    if (!base) return;
    await addClip({
      compositionId: (data?.composition?._id ?? compositionId) as Id<'compositions'>,
      sourceVideoId: base.sourceVideoId,
      sourceInFrame: base.sourceInFrame,
      sourceOutFrame: base.sourceOutFrame,
      timelineStartFrame: Math.round(playhead),
      speed: base.speed,
      opacity: 1,
      label: (base.label ?? 'Clip') + ' copy',
      zIndex: (base as any).zIndex ?? 0,
    });
  }, [selectedClipObj, activePrimaryClip, addClip, compositionId, playhead, data]);

  const handleDeleteSelected = React.useCallback(async () => {
    const target = selectedClipObj ?? activePrimaryClip;
    if (!target) return;
    await removeClip({ clipId: target._id as any });
    if (selectedClipId && (selectedClipId as string) === (target._id as string)) {
      setSelectedClipId(null);
    }
  }, [selectedClipObj, activePrimaryClip, removeClip, selectedClipId]);

  // Keyboard shortcuts for transport + edit (unconditional hook)
  useEffect(() => {
    const maxFrames = data?.composition?.settings?.durationFrames ?? 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleSeek(0);
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        const base = selectedClipObj ?? activePrimaryClip;
        if (!base) return;
        const dur = Math.max(1, Math.round((base.sourceOutFrame - base.sourceInFrame) / Math.max(0.001, base.speed)));
        const t = trimByClipId.get(base._id as string) ?? { start: 0, end: 0 };
        const start = base.timelineStartFrame + Math.max(0, t.start);
        handleSeek(Math.max(0, Math.min(maxFrames - 1, start)));
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        const base = selectedClipObj ?? activePrimaryClip;
        if (!base) return;
        const dur = Math.max(1, Math.round((base.sourceOutFrame - base.sourceInFrame) / Math.max(0.001, base.speed)));
        const t = trimByClipId.get(base._id as string) ?? { start: 0, end: 0 };
        const end = base.timelineStartFrame + Math.max(1, dur - Math.max(0, t.end));
        handleSeek(Math.max(0, Math.min(maxFrames - 1, end - 1)));
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void handleSplitAtPlayhead();
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void handleDuplicateAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void handleDeleteSelected();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        handleSeek(Math.max(0, Math.floor(playhead - step)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        handleSeek(Math.min(maxFrames - 1, Math.ceil(playhead + step)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playhead, data?.composition?.settings?.durationFrames, handleSplitAtPlayhead, handleDuplicateAtPlayhead, handleDeleteSelected, selectedClipObj, activePrimaryClip, trimByClipId]);

  

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  const { composition } = data;
  const durationSeconds = composition.settings.durationFrames / composition.settings.fps;
  const selectedClip = selectedClipObj;
  const clipContainsPlayhead = (clip: ClipDoc) => {
    const clipDuration = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / Math.max(0.001, clip.speed)));
    return playhead >= clip.timelineStartFrame && playhead < clip.timelineStartFrame + clipDuration;
  };
  const getTransformForClip = (clipId: Id<'compositionClips'>) => {
    const t = (data.tracks as any[]).find((tr) => tr.clipId === clipId && tr.channel === 'transform');
    const base = (() => {
      if (!t || !Array.isArray(t.keyframes) || t.keyframes.length === 0) {
        return { x: 0.5, y: 0.5, scale: 1, rotate: 0 } as any;
      }
      const k = (t.keyframes[0] as any)?.value ?? {};
      return { x: k.x ?? 0.5, y: k.y ?? 0.5, scale: k.scale ?? 1, rotate: k.rotate ?? 0 } as any;
    })();
    const local = localTransformOverrides.get(clipId as unknown as string) ?? {};
    return { ...base, ...local, trackId: t?._id } as any;
  };

  const handleSeek = (frame: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(frame, composition.settings.durationFrames - 1)));
  };

  const handleExport = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      await queueExport({ compositionId: composition._id });
    } catch (err) {
      console.error('Failed to queue export', err);
    } finally {
      setExporting(false);
    }
  };

  // Editing actions: split (cut), duplicate, delete

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-950 via-black to-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
            title="Back"
            onClick={onExit}
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="truncate text-lg font-semibold">{composition.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
            title="Project info"
            onClick={() => setInfoModalOpen(true)}
          >
            <Info size={16} />
          </button>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
            title={propertiesOpen ? 'Hide properties' : 'Show properties'}
            onClick={() => setPropertiesOpen((v) => !v)}
          >
            <Settings size={16} />
          </button>
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden bg-gradient-to-b from-slate-950/60 via-black/20 to-slate-950/60 px-10 py-6">
        <div className="flex flex-1 min-h-0 gap-6">
          <section className={`flex min-h-0 flex-1 flex-col gap-4 ${propertiesOpen ? 'pr-2' : ''}`}>
            <div className="flex-1 min-h-0 rounded-3xl border border-white/10 bg-black/80 shadow-2xl overflow-hidden">
              <MultiPreviewSurface
                composition={composition}
                items={activeClipsWithTrim
                  .map((clip) => {
                    const source = data.sources[clip.sourceVideoId];
                    const src = videoUrls[clip.sourceVideoId];
                    if (!source || !src) return null;
                    const renderZ = renderZByClipId.get(clip._id as string) ?? (clip.zIndex as unknown as number) ?? 0;
                    const trim = trimByClipId.get(clip._id as string) ?? { start: 0, end: 0 };
                    return { clip, source, src, transform: getTransformForClip(clip._id), renderZ, trim } as any;
                  })
                  .filter(Boolean) as any}
                playhead={playhead}
                playing={playing}
                primaryClipId={(activePrimaryClip?._id as string) ?? null}
                onPrimaryTime={(sec) => {
                  if (!data || !activePrimaryClip) return;
                  const srcInfo = data.sources[activePrimaryClip.sourceVideoId];
                  if (!srcInfo) return;
                  const sFps = Math.max(1, srcInfo.fps);
                  const sourceFrame = sec * sFps;
                  const compFrame = activePrimaryClip.timelineStartFrame + (sourceFrame - activePrimaryClip.sourceInFrame) / Math.max(0.001, activePrimaryClip.speed);
                  const clamped = Math.max(0, Math.min((data.composition.settings.durationFrames - 1), compFrame));
                  setPlayhead(clamped);
                }}
              />
            </div>
            {/* Transport panel removed; controls moved to timeline with keyboard shortcuts */}
            {/* Clip Properties Sidebar */}
          </section>
          {/* Clip Properties Sidebar */}
          {propertiesOpen && (
            <aside className="w-[360px] shrink-0 border-l border-white/10 backdrop-blur pl-4 pr-3 py-3 overflow-y-auto">
              <div className="text-white">
                {!selectedClip ? (
                  <div className="text-xs text-white/60">Select a clip to edit its properties.</div>
                ) : (
                  <div className="space-y-4 text-sm">
                    {/* Position (px) */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-white/80">Position</div>
                        <div className="flex items-center gap-1">
                          <button
                            className="inline-flex h-6 px-2 items-center justify-center rounded-md border border-white/20 text-[11px] text-white/80 hover:bg-white/10"
                            onClick={() => {
                              scheduleTransformUpdate(selectedClip._id, { x: 0.5, y: 0.5 });
                            }}
                            title="Center"
                          >Center</button>
                        </div>
                      </div>
                      {(() => {
                        const t = getTransformForClip(selectedClip._id);
                        const pxX = Math.round((t.x - 0.5) * composition.settings.width);
                        const pxY = Math.round((t.y - 0.5) * composition.settings.height);
                        const step = 10;
                        return (
                          <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-4 text-white/60">X</span>
                              <div className="flex items-center gap-1">
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                                  onClick={async () => {
                                    const nx = pxX - step;
                                    scheduleTransformUpdate(selectedClip._id, { x: 0.5 + nx / Math.max(1, composition.settings.width) });
                                  }}
                                  title="-10px"
                                >−</button>
                                <input
                                  type="number"
                                  className="w-20 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-white"
                                  value={pxX}
                                  onChange={async (e) => {
                                    const nx = Number(e.target.value) || 0;
                                    scheduleTransformUpdate(selectedClip._id, { x: 0.5 + nx / Math.max(1, composition.settings.width) });
                                  }}
                                />
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                                  onClick={async () => {
                                    const nx = pxX + step;
                                    scheduleTransformUpdate(selectedClip._id, { x: 0.5 + nx / Math.max(1, composition.settings.width) });
                                  }}
                                  title="+10px"
                                >+</button>
                                <span className="text-[11px] text-white/50">px</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-4 text-white/60">Y</span>
                              <div className="flex items-center gap-1">
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                                  onClick={async () => {
                                    const ny = pxY - step;
                                    scheduleTransformUpdate(selectedClip._id, { y: 0.5 + ny / Math.max(1, composition.settings.height) });
                                  }}
                                  title="-10px"
                                >−</button>
                                <input
                                  type="number"
                                  className="w-20 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-white"
                                  value={pxY}
                                  onChange={async (e) => {
                                    const ny = Number(e.target.value) || 0;
                                    scheduleTransformUpdate(selectedClip._id, { y: 0.5 + ny / Math.max(1, composition.settings.height) });
                                  }}
                                />
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                                  onClick={async () => {
                                    const ny = pxY + step;
                                    scheduleTransformUpdate(selectedClip._id, { y: 0.5 + ny / Math.max(1, composition.settings.height) });
                                  }}
                                  title="+10px"
                                >+</button>
                                <span className="text-[11px] text-white/50">px</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Scale (%) */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-white/80">Scale</div>
                        {(() => {
                          const t = getTransformForClip(selectedClip._id);
                          const pct = Math.round((t.scale ?? 1) * 100);
                          return <span className="text-xs text-white/60">{pct}%</span>;
                        })()}
                      </div>
                      {(() => {
                        const t = getTransformForClip(selectedClip._id);
                        const pct = Math.round((t.scale ?? 1) * 100);
                        const step = 5;
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                              onClick={async () => {
                                const next = Math.max(10, pct - step);
                                scheduleTransformUpdate(selectedClip._id, { scale: next / 100 });
                              }}
                              title="-5%"
                            >−</button>
                            <input
                              type="range"
                              min={10}
                              max={500}
                              value={pct}
                              onChange={async (e) => {
                                const val = Math.max(10, Math.min(500, Number(e.target.value) || 100));
                                scheduleTransformUpdate(selectedClip._id, { scale: val / 100 });
                              }}
                              className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
                            />
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                              onClick={async () => {
                                const next = Math.min(500, pct + step);
                                scheduleTransformUpdate(selectedClip._id, { scale: next / 100 });
                              }}
                              title="+5%"
                            >+</button>
                            <button
                              className="ml-1 inline-flex h-7 items-center justify-center rounded-md border border-white/10 px-2 text-[11px] text-white/80 hover:bg-white/10"
                              onClick={async () => {
                                scheduleTransformUpdate(selectedClip._id, { scale: 1 });
                              }}
                              title="Reset to 100%"
                            >100%</button>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Rotation (deg) */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-white/80">Rotation</div>
                        {(() => {
                          const t = getTransformForClip(selectedClip._id);
                          const deg = Math.round(t.rotate ?? 0);
                          return <span className="text-xs text-white/60">{deg}°</span>;
                        })()}
                      </div>
                      {(() => {
                        const t = getTransformForClip(selectedClip._id);
                        const deg = Math.round(t.rotate ?? 0);
                        const step = 5;
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                              onClick={async () => {
                                const next = Math.max(-180, deg - step);
                                scheduleTransformUpdate(selectedClip._id, { rotate: next });
                              }}
                              title="-5°"
                            >−</button>
                            <input
                              type="range"
                              min={-180}
                              max={180}
                              value={deg}
                              onChange={async (e) => {
                                const val = Math.max(-180, Math.min(180, Number(e.target.value) || 0));
                                scheduleTransformUpdate(selectedClip._id, { rotate: val });
                              }}
                              className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
                            />
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                              onClick={async () => {
                                const next = Math.min(180, deg + step);
                                scheduleTransformUpdate(selectedClip._id, { rotate: next });
                              }}
                              title="+5°"
                            >+</button>
                            <button
                              className="ml-1 inline-flex h-7 items-center justify-center rounded-md border border-white/10 px-2 text-[11px] text-white/80 hover:bg-white/10"
                              onClick={async () => {
                                scheduleTransformUpdate(selectedClip._id, { rotate: 0 });
                              }}
                              title="Reset to 0°"
                            >0°</button>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Opacity (%) */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-white/80">Opacity</div>
                        <span className="text-xs text-white/60">{Math.round(((selectedClip.opacity ?? 1) * 100))}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((selectedClip.opacity ?? 1) * 100)}
                        onChange={async (e) => {
                          const pct = Math.max(0, Math.min(100, Number(e.target.value) || 100));
                          await updateClip({ clipId: selectedClip._id as any, patch: { opacity: pct / 100 } });
                        }}
                        className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
                      />
                    </div>
                    {/* Speed (%) */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-white/80">Speed</div>
                        <span className="text-xs text-white/60">{Math.round((selectedClip.speed ?? 1) * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                          onClick={async () => {
                            const cur = Math.round((selectedClip.speed ?? 1) * 100);
                            const next = Math.max(10, cur - 10);
                            await updateClip({ clipId: selectedClip._id as any, patch: { speed: next / 100 } });
                          }}
                          title="-10%"
                        >−</button>
                        <input
                          type="range"
                          min={10}
                          max={300}
                          value={Math.round((selectedClip.speed ?? 1) * 100)}
                          onChange={async (e) => {
                            const pct = Math.max(10, Math.min(300, Number(e.target.value) || 100));
                            await updateClip({ clipId: selectedClip._id as any, patch: { speed: pct / 100 } });
                          }}
                          className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-white range-thumb-white"
                        />
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 hover:bg-white/10"
                          onClick={async () => {
                            const cur = Math.round((selectedClip.speed ?? 1) * 100);
                            const next = Math.min(300, cur + 10);
                            await updateClip({ clipId: selectedClip._id as any, patch: { speed: next / 100 } });
                          }}
                          title="+10%"
                        >+</button>
                        <button
                          className="ml-1 inline-flex h-7 items-center justify-center rounded-md border border-white/10 px-2 text-[11px] text-white/80 hover:bg-white/10"
                          onClick={async () => {
                            await updateClip({ clipId: selectedClip._id as any, patch: { speed: 1 } });
                          }}
                          title="Reset to 100%"
                        >100%</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/70 px-6 py-4 shadow-inner">
          <EditorTimeline
            clips={data.clips}
            durationFrames={composition.settings.durationFrames}
            fps={composition.settings.fps}
            playhead={playhead}
            zoom={zoom}
            onZoomChange={setZoom}
            onSeek={handleSeek}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onMoveClip={(clipId, patch) => {
              void updateClip({ clipId: clipId as any, patch: patch as any });
            }}
            trims={Object.fromEntries(trimByClipId)}
            onTrimClip={(clipId, trim) => {
              const base = trimByClipId.get(clipId) ?? { start: 0, end: 0 };
              void upsertTrack({
                compositionId: composition._id,
                clipId: clipId as any,
                channel: 'trim',
                keyframes: [{ frame: 0, value: { start: Math.max(0, Math.round(trim.start)), end: Math.max(0, Math.round(trim.end)) }, interpolation: 'hold' }],
              });
            }}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onReset={() => handleSeek(0)}
            onRenameClip={(clipId, title) => {
              void updateClip({ clipId: clipId as any, patch: { label: title } as any });
            }}
          />
        </div>
      </main>

      {/* Project Info Modal */}
      {infoModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-black/80 p-6 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white/90">Project Info</h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
                onClick={() => setInfoModalOpen(false)}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Composition</div>
                <dl className="mt-3 space-y-2 text-sm text-white/80">
                  <div className="flex justify-between"><dt>Resolution</dt><dd>{composition.settings.width}×{composition.settings.height}</dd></div>
                  <div className="flex justify-between"><dt>Frame rate</dt><dd>{composition.settings.fps} fps</dd></div>
                  <div className="flex justify-between"><dt>Duration</dt><dd>{composition.settings.durationFrames} frames</dd></div>
                </dl>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Sources</div>
                <div className="mt-3 space-y-2 text-sm text-white/80 max-h-60 overflow-y-auto pr-2">
                  {Object.values(data.sources).map((source) => (
                    <div key={source._id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <div className="font-semibold text-white">{source.title}</div>
                      <div className="text-[12px] text-white/60">
                        {source.width}×{source.height} · {source.fps} fps · {Math.round(source.durationSeconds)}s
                      </div>
                    </div>
                  ))}
                  {!Object.keys(data.sources).length && <div className="text-xs text-white/60">No footage added yet.</div>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
                  <span>Exports</span>
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                  >
                    {exporting ? 'Rendering…' : 'Render MP4'}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/80 md:grid-cols-2">
                  {data.exports.length === 0 && <p className="text-xs text-white/60">No exports yet.</p>}
                  {data.exports.map((exp) => (
                    <div key={exp._id as string} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{exp.format}</span>
                        <span className="uppercase tracking-wide">
                          {exp.status}
                          {exp.status === 'running' && <span className="ml-2 text-white/60">{Math.round(exp.progress)}%</span>}
                        </span>
                      </div>
                      {exp.error && <div className="mt-1 text-[11px] text-red-400">{exp.error}</div>}
                      {exp.outputPublicUrl && exp.status === 'completed' && (
                        <a href={exp.outputPublicUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-[11px] text-sky-300 hover:text-sky-100">Download result ↗</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
