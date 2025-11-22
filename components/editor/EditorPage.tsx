import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { EditorTimeline } from './EditorTimeline';
import { Loader2, Pause, Play, RefreshCw, ChevronLeft, Info, Settings, Save, FolderOpen, Trash2, Edit3, Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';

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
  onOpenComposition?: (id: Id<'compositions'>) => void;
  onExitToReview?: (videoId: Id<'videos'>) => void;
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
  audioPrimaryClipId?: string | null;
  masterVolume?: number;
}> = ({ composition, items, playhead, playing, primaryClipId, onPrimaryTime, audioPrimaryClipId = null, masterVolume = 1 }) => {
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
      const compStart = 0;
      const compEnd = composition.settings.durationFrames;
      const gateStart = Math.max(compStart, visibleStart);
      const gateEnd = Math.min(compEnd, visibleEnd);
      // Only render/seek when the item is actually visible at the playhead and inside composition window
      if (playhead < gateStart || playhead >= gateEnd) {
        video.pause();
        return;
      }
      const offset = playhead - visibleStart;
      const sourceFrame = it.clip.sourceInFrame + trimStart * it.clip.speed + offset * it.clip.speed;
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
      // Audio routing: only the audioPrimary (if enabled) outputs audio
      const isAudioPrimary = audioPrimaryClipId && (it.clip._id as string) === audioPrimaryClipId;
      const wantsAudio = isAudioPrimary && ((it.clip as any).audioEnabled ?? true) && masterVolume > 0 && playing;
      try {
        video.muted = !wantsAudio;
        video.volume = Math.max(0, Math.min(1, masterVolume));
      } catch {}
      if (playing) {
        if (video.paused) void video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.pause();
      }
    });
  }, [items, playhead, playing, audioPrimaryClipId, masterVolume]);

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
          if ((it.clip as any).hidden) return null;
          const speed = Math.max(0.001, it.clip.speed);
          const slotLen = Math.max(1, Math.round((it.clip.sourceOutFrame - it.clip.sourceInFrame) / speed));
          const trimStart = Math.max(0, (it as any).trim?.start ?? 0);
          const trimEnd = Math.max(0, (it as any).trim?.end ?? 0);
          const visibleStart = it.clip.timelineStartFrame + trimStart;
          const visibleEnd = it.clip.timelineStartFrame + Math.max(1, slotLen - trimEnd);
          const compStart = 0;
          const compEnd = composition.settings.durationFrames;
          const gateStart = Math.max(compStart, visibleStart);
          const gateEnd = Math.min(compEnd, visibleEnd);
          const isVisibleNow = playhead >= gateStart && playhead < gateEnd;
          const style: React.CSSProperties = {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translate(${tx}%, ${ty}%) scale(${sc}) rotate(${rot}deg)`,
            transformOrigin: '50% 50%',
            zIndex: z,
            opacity: typeof it.clip.opacity === 'number' ? Math.max(0, Math.min(1, it.clip.opacity!)) : 1,
            display: isVisibleNow ? 'block' : 'none',
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

export const EditorPage: React.FC<EditorPageProps> = ({ compositionId, onExit, onOpenComposition, onExitToReview }) => {
  const data = useQuery(api.edits.getComposition, { compositionId }) as CompositionResponse | undefined;
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const getDownloadUrl = useAction(api.storage.getDownloadUrl);
  // Upload actions
  const generateVideoUploadUrl = useAction(api.storage.generateVideoUploadUrl);
  const createMultipart = useAction((api as any).storage.createMultipartUpload);
  const getMultipartUrls = useAction((api as any).storage.getMultipartUploadUrls);
  const completeMultipart = useAction((api as any).storage.completeMultipartUpload);
  const abortMultipart = useAction((api as any).storage.abortMultipartUpload);
  const queueExport = useMutation(api.edits.queueExport);
  const [exporting, setExporting] = useState(false);
  const updateClip = useMutation(api.edits.updateClip);
  const addClip = useMutation(api.edits.addClip);
  const removeClip = useMutation(api.edits.removeClip);
  const upsertTrack = useMutation(api.edits.upsertKeyframeTrack);
  // Save/load API
  const saveSnapshotMut = useMutation((api as any).edits.saveSnapshot);
  const loadSnapshotMut = useMutation((api as any).edits.loadSnapshot);
  const renameSaveMut = useMutation((api as any).edits.renameSave);
  const deleteSaveMut = useMutation((api as any).edits.deleteSave);
  const upsertAutosaveMut = useMutation((api as any).edits.upsertAutosave);
  const completeVideoUpload = useMutation((api as any).videos.completeUpload);
  const getSaveState = useQuery((api as any).edits.getSaveState, { compositionId } as any) as { currentSaveId: string | null; autosaveEnabled: boolean; autosaveIntervalMs: number; persisted?: boolean } | undefined;
  const setCurrentSaveMut = useMutation((api as any).edits.setCurrentSave);
  const setAutosaveMut = useMutation((api as any).edits.setAutosave);
  const saveIntoCurrentMut = useMutation((api as any).edits.saveIntoCurrent);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const saves = useQuery((api as any).edits.listSavesByVideo, (data as any)?.composition?.sourceVideoId ? { videoId: (data as any).composition.sourceVideoId } : undefined) as Array<any> | undefined;
  // Panels
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [savesOpen, setSavesOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name?: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [addClipOpen, setAddClipOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Ensure there is an active save to target
  const [ensureSaveOpen, setEnsureSaveOpen] = useState(false);
  const [ensureSaveName, setEnsureSaveName] = useState('');
  const ensureSaveShown = useRef(false);

  const resolveContentType = (file: File): string => {
    const t = (file.type || '').toLowerCase();
    if (t && t !== 'application/octet-stream') return t;
    const name = file.name.toLowerCase();
    if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
    if (name.endsWith('.webm')) return 'video/webm';
    if (name.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
  };

  const loadVideoMetadata = (file: File) => new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    const videoEl = document.createElement('video');
    const revoke = () => { if (videoEl.src.startsWith('blob:')) URL.revokeObjectURL(videoEl.src); };
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => { resolve({ width: videoEl.videoWidth || 1920, height: videoEl.videoHeight || 1080, duration: Number.isFinite(videoEl.duration) ? videoEl.duration : 0 }); revoke(); };
    videoEl.onerror = () => { revoke(); reject(new Error('Unable to read video metadata.')); };
    videoEl.src = URL.createObjectURL(file);
  });

  const uploadMultipart = async (file: File, contentType: string, onProgress: (p: number) => void) => {
    const partSize = 16 * 1024 * 1024; // 16MB
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));
    const { storageKey, uploadId, publicUrl } = await createMultipart({ contentType, fileName: file.name });
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const { urls } = await getMultipartUrls({ storageKey, uploadId, partNumbers, contentType });
    let uploadedBytes = 0;
    const completed: Array<{ ETag: string; PartNumber: number }> = [];
    for (let idx = 0; idx < totalParts; idx++) {
      const partNumber = partNumbers[idx];
      const start = idx * partSize;
      const end = Math.min(file.size, start + partSize);
      const blob = file.slice(start, end);
      const url = urls.find((u: any) => u.partNumber === partNumber)?.url;
      if (!url) throw new Error('Missing presigned URL for part ' + partNumber);
      const etag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { uploadedBytes += (e.loaded - (uploadedBytes % partSize)); const percent = (Math.min(end, uploadedBytes) / file.size) * 100; onProgress(Math.max(0, Math.min(100, percent))); } };
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader('ETag') || 'etag'); else reject(new Error('Part upload failed')); };
        xhr.onerror = () => reject(new Error('Part upload failed'));
        xhr.send(blob);
      });
      completed.push({ ETag: etag, PartNumber: partNumber });
    }
    await completeMultipart({ storageKey, uploadId, completed });
    onProgress(100);
    return { storageKey, publicUrl };
  };
  const autosaveTimer = useRef<number | null>(null);
  const autosaveInterval = useRef<number | null>(null);

  // Preview stage sizing: keep a hard crop matching composition aspect
  const previewOuterRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = previewOuterRef.current;
    if (!el) return;
    const ratio = Math.max(0.0001, (data?.composition.settings.width ?? 1920) / Math.max(1, (data?.composition.settings.height ?? 1080)));
    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) { setStageSize({ w: 0, h: 0 }); return; }
      // Fit by width first; if too tall, fit by height
      let w = Math.min(cw, ch * ratio);
      let h = w / ratio;
      if (h > ch) {
        h = ch;
        w = h * ratio;
      }
      setStageSize({ w, h });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, [data?.composition.settings.width, data?.composition.settings.height]);

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

  // Debounced autosave scheduler
  const queueAutosave = useRef<() => void>(() => {});
  queueAutosave.current = () => {
    if (!data?.composition?.sourceVideoId) return;
    if (!getSaveState?.autosaveEnabled) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      try {
        await saveIntoCurrentMut({ compositionId: data.composition._id as any });
        setDirty(false);
      } catch (e) {
        console.error('Autosave failed', e);
      }
    }, 1500) as unknown as number;
  };

  // Periodic autosave guard
  useEffect(() => {
    if (autosaveInterval.current) window.clearInterval(autosaveInterval.current);
    autosaveInterval.current = window.setInterval(() => {
      if (dirty && getSaveState?.autosaveEnabled) queueAutosave.current();
    }, Math.max(5000, getSaveState?.autosaveIntervalMs ?? 300000)) as unknown as number;
    return () => {
      if (autosaveInterval.current) window.clearInterval(autosaveInterval.current);
    };
  }, [dirty, data?.composition?._id, getSaveState?.autosaveEnabled, getSaveState?.autosaveIntervalMs]);

  // Auto-load the current or latest save when entering Edit Mode
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (autoLoadedRef.current) return;
    const vid = (data as any)?.composition?.sourceVideoId as string | undefined;
    if (!vid) return;
    // Only auto-load if there is any save available
    if ((saves?.length ?? 0) === 0) return;
    const targetSaveId = (getSaveState?.currentSaveId ?? saves?.[0]?.id) as string | undefined;
    if (!targetSaveId) return;
    autoLoadedRef.current = true;
    // Load snapshot into a new composition and navigate
    void (async () => {
      try {
        const res = await loadSnapshotMut({ saveId: targetSaveId });
        const id = (res as any)?.compositionId as string | undefined;
        if (id) {
          if (onOpenComposition) onOpenComposition(id as any);
          else window.location.assign(`/edit/${id}`);
        }
      } catch (e) {
        console.error('Auto-load save failed', e);
      }
    })();
  }, [data?.composition?._id, getSaveState?.currentSaveId, saves?.length]);

  // If save state was inherited (persisted === false), persist it for this composition once
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (!data || !getSaveState) return;
    if (adoptedRef.current) return;
    if (getSaveState.persisted === false) {
      adoptedRef.current = true;
      void (async () => {
        try {
          await setAutosaveMut({ compositionId: data.composition._id as any, enabled: !!getSaveState.autosaveEnabled, intervalMs: getSaveState.autosaveIntervalMs });
          if (getSaveState.currentSaveId) {
            await setCurrentSaveMut({ compositionId: data.composition._id as any, saveId: getSaveState.currentSaveId as any });
          }
        } catch (e) {
          console.error('Persisting inherited save state failed', e);
        }
      })();
    }
  }, [data?.composition?._id, getSaveState?.persisted]);

  const currentSaveName = useMemo(() => {
    if (!saves || !getSaveState?.currentSaveId) return null;
    const found = saves.find((s) => s.id === getSaveState.currentSaveId);
    return found?.name ?? null;
  }, [saves, getSaveState?.currentSaveId]);

  const scheduleTransformUpdate = React.useCallback((clipId: Id<'compositionClips'>, patch: { x?: number; y?: number; scale?: number; rotate?: number }) => {
    setDirty(true);
    queueAutosave.current();
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
          if (source.storageKey) {
            const url = await getDownloadUrl({ storageKey: source.storageKey });
            if (!cancelled && url) {
              setVideoUrls((prev) => ({ ...prev, [videoId]: url }));
              continue;
            }
          }
          // Fallback to public src if no storageKey or action fails
          if (!cancelled && source.src) {
            setVideoUrls((prev) => ({ ...prev, [videoId]: source.src }));
          }
        } catch (err) {
          console.warn('Get download URL failed, falling back to public src', err);
          if (!cancelled && source.src) {
            setVideoUrls((prev) => ({ ...prev, [videoId]: source.src }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.sources, getDownloadUrl, videoUrls]);

  // moved below, after activePrimaryClip is defined

  const activeClips = useMemo(() => {
    if (!data) return [] as ClipDoc[];
    const getSlot = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));
    // trims are computed below; temporarily use empty map here and recompute after hook order
    return data.clips.filter(() => true);
  }, [data]);

  // Use clip.zIndex directly for preview stacking: higher lane (higher zIndex) renders above
  const renderZByClipId = useMemo(() => {
    const out = new Map<string, number>();
    if (!data) return out;
    data.clips.forEach((c) => {
      out.set(c._id as string, (c.zIndex as unknown as number) ?? 0);
    });
    return out;
  }, [data]);

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

  // Determine the primary clip under the playhead (considering trims)
  const activePrimaryClip = useMemo(() => {
    if (!data) return null as ClipDoc | null;
    const containsVisible = (clip: ClipDoc) => {
      if ((clip as any).hidden) return false;
      const speed = Math.max(0.001, clip.speed);
      const slot = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / speed));
      const t = trimByClipId.get(clip._id as string) ?? { start: 0, end: 0 };
      const start = clip.timelineStartFrame + Math.max(0, t.start);
      const end = clip.timelineStartFrame + Math.max(1, slot - Math.max(0, t.end));
      return playhead >= start && playhead < end;
    };
    const selected = selectedClipId ? data.clips.find((c) => (c._id as string) === selectedClipId) ?? null : null;
    if (selected && containsVisible(selected)) return selected;
    const candidates = data.clips.filter(containsVisible);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
  }, [data, selectedClipId, playhead, trimByClipId]);

  // Recompute active clips considering trims
  const activeClipsWithTrim = useMemo(() => {
    if (!data) return [] as ClipDoc[];
    const getSlot = (c: ClipDoc) => Math.max(1, Math.round((c.sourceOutFrame - c.sourceInFrame) / Math.max(0.001, c.speed)));
    return data.clips.filter((clip) => {
      if ((clip as any).hidden) return false;
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

  // Composition clock when no primary clip is under the playhead
  useEffect(() => {
    if (!playing || !data) return;
    if (activePrimaryClip) return; // primary video drives the playhead
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
  }, [playing, data, activePrimaryClip]);

  // On enter: ensure there is a current save to target. If missing, prompt to create one.
  useEffect(() => {
    if (!data || !getSaveState) return;
    if (ensureSaveShown.current) return;
    if (!getSaveState.currentSaveId) {
      const baseName = (data.composition?.title ? `${data.composition.title} — Save` : 'New Save');
      setEnsureSaveName(baseName);
      setEnsureSaveOpen(true);
      ensureSaveShown.current = true;
    }
  }, [data?.composition?._id, getSaveState?.currentSaveId]);

  // Editing actions: split (cut), duplicate, delete — define before guard to keep hook order stable
  const handleSplitAtPlayhead = React.useCallback(async () => {
    setDirty(true);
    queueAutosave.current();
    if (!data || !activePrimaryClip) return;
    const speed = Math.max(0.001, activePrimaryClip.speed);
    const L = Math.max(1, Math.round((activePrimaryClip.sourceOutFrame - activePrimaryClip.sourceInFrame) / speed));
    const rel = Math.round(playhead - activePrimaryClip.timelineStartFrame);
    if (rel <= 0 || rel >= L) return;
    const t = trimByClipId.get(activePrimaryClip._id as string) ?? { start: 0, end: 0 };
    const visibleStart = Math.max(0, t.start);
    const visibleEnd = Math.max(1, L - Math.max(0, t.end));
    if (rel <= visibleStart || rel >= visibleEnd) return;

    // New trims per part (keep slot length constant; only change visibility)
    const trimA = { start: t.start, end: Math.max(t.end, L - rel) };
    const trimB = { start: Math.max(0, t.start + rel), end: t.end };

    // Create the new clip on a new top lane, keeping the same slot start
    const currentMaxZ = data.clips.reduce((acc, c) => Math.max(acc, (c.zIndex as unknown as number) ?? 0), (activePrimaryClip.zIndex as unknown as number) ?? 0);
    const newClipId = await addClip({
      compositionId: (data?.composition?._id ?? compositionId) as Id<'compositions'>,
      sourceVideoId: activePrimaryClip.sourceVideoId,
      sourceInFrame: activePrimaryClip.sourceInFrame,
      sourceOutFrame: activePrimaryClip.sourceOutFrame,
      timelineStartFrame: activePrimaryClip.timelineStartFrame,
      speed: activePrimaryClip.speed,
      opacity: activePrimaryClip.opacity ?? 1,
      label: (activePrimaryClip.label ?? 'Clip') + ' (part)',
      zIndex: (currentMaxZ as number) + 1,
    }) as unknown as Id<'compositionClips'>;

    // Apply trims via keyframe tracks (non-destructive)
    await upsertTrack({
      compositionId: data.composition._id,
      clipId: activePrimaryClip._id as any,
      channel: 'trim',
      keyframes: [{ frame: 0, value: { start: Math.max(0, Math.round(trimA.start)), end: Math.max(0, Math.round(trimA.end)) }, interpolation: 'hold' }],
    });
    await upsertTrack({
      compositionId: data.composition._id,
      clipId: newClipId as any,
      channel: 'trim',
      keyframes: [{ frame: 0, value: { start: Math.max(0, Math.round(trimB.start)), end: Math.max(0, Math.round(trimB.end)) }, interpolation: 'hold' }],
    });
    setSelectedClipId(newClipId as unknown as string);
  }, [data, activePrimaryClip, playhead, compositionId, addClip, upsertTrack, trimByClipId]);

  const handleDuplicateAtPlayhead = React.useCallback(async () => {
    setDirty(true);
    queueAutosave.current();
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
    setDirty(true);
    queueAutosave.current();
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
      // Block global shortcuts while modals are open
      if (savesOpen || infoModalOpen || ensureSaveOpen) return;
      // Quick save: Cmd/Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!getSaveState?.currentSaveId) {
          const baseName = (data as any)?.composition?.title ? `${(data as any).composition.title} — Save` : 'New Save';
          setEnsureSaveName(baseName);
          setEnsureSaveOpen(true);
          return;
        }
        void saveIntoCurrentMut({ compositionId: (data as any).composition._id as any })
          .then(() => { setDirty(false); })
          .catch((err: any) => { console.error('Save failed', err); });
        return;
      }
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
  }, [playhead, data?.composition?.settings?.durationFrames, handleSplitAtPlayhead, handleDuplicateAtPlayhead, handleDeleteSelected, selectedClipObj, activePrimaryClip, trimByClipId, savesOpen, infoModalOpen, ensureSaveOpen, getSaveState?.currentSaveId]);

  

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
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
            title="Back"
            onClick={() => {
              const vid = (data as any)?.composition?.sourceVideoId as Id<'videos'> | undefined;
              if (vid && onExitToReview) onExitToReview(vid);
              else onExit();
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="truncate text-lg font-semibold">{composition.title}</h1>
          <button
            className="ml-2 inline-flex h-8 items-center gap-1 rounded-full border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10"
            title="Saved edits"
            onClick={() => setSavesOpen(true)}
          >
            <FolderOpen size={14} />
            Saves
          </button>
          <button
            className="ml-2 inline-flex h-8 items-center gap-1 rounded-full border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10"
            title="Save (Cmd/Ctrl+S)"
            onClick={() => {
              if (!getSaveState?.currentSaveId) {
                const baseName = composition?.title ? `${composition.title} — Save` : 'New Save';
                setEnsureSaveName(baseName);
                setEnsureSaveOpen(true);
                return;
              }
              void saveIntoCurrentMut({ compositionId: composition._id as any });
              setDirty(false);
            }}
          >
            <Save size={14} />
            Save
          </button>
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
      <main className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden px-10 py-6">
        <div className="flex flex-1 min-h-0 gap-6">
          <section className={`flex min-h-0 flex-1 flex-col gap-4 ${propertiesOpen ? 'pr-2' : ''}`}>
            <div ref={previewOuterRef} className="flex-1 min-h-[260px] border border-white/10 bg-black overflow-hidden">
              <div className="flex h-full w-full items-center justify-center">
                <div className="relative overflow-hidden bg-black" style={{ width: stageSize.w || undefined, height: stageSize.h || undefined }}>
                  <MultiPreviewSurface
                    composition={composition}
                    items={(() => {
                      const base = activeClipsWithTrim
                        .map((clip) => {
                          const source = data.sources[clip.sourceVideoId];
                      const src = videoUrls[clip.sourceVideoId];
                      if (!source || !src) return null;
                      const renderZ = renderZByClipId.get(clip._id as string) ?? (clip.zIndex as unknown as number) ?? 0;
                      const trim = trimByClipId.get(clip._id as string) ?? { start: 0, end: 0 };
                      return { clip, source, src, transform: getTransformForClip(clip._id), renderZ, trim } as any;
                    })
                    .filter(Boolean) as any[];
                  // If nothing is under the playhead, show the selected clip as a fallback
                  if (base.length === 0 && selectedClip && !(selectedClip as any).hidden) {
                    const source = data.sources[selectedClip.sourceVideoId];
                    const src = videoUrls[selectedClip.sourceVideoId];
                    if (source && src) {
                      const renderZ = renderZByClipId.get(selectedClip._id as string) ?? (selectedClip.zIndex as unknown as number) ?? 0;
                      const trim = trimByClipId.get(selectedClip._id as string) ?? { start: 0, end: 0 };
                      base.push({ clip: selectedClip, source, src, transform: getTransformForClip(selectedClip._id), renderZ, trim } as any);
                    }
                  }
                  return base;
                })()}
                playhead={playhead}
                playing={playing}
                primaryClipId={(activePrimaryClip?._id as string) ?? null}
                audioPrimaryClipId={(activePrimaryClip?._id as string) ?? null}
                masterVolume={masterVolume}
                onPrimaryTime={(sec) => {
                  if (!data || !activePrimaryClip) return;
                  const srcInfo = data.sources[activePrimaryClip.sourceVideoId];
                  if (!srcInfo) return;
                  const sFps = Math.max(1, srcInfo.fps);
                  const sourceFrame = sec * sFps;
                  const speed = Math.max(0.001, activePrimaryClip.speed);
                  const t = trimByClipId.get(activePrimaryClip._id as string) ?? { start: 0, end: 0 };
                  const slotLen = Math.max(1, Math.round((activePrimaryClip.sourceOutFrame - activePrimaryClip.sourceInFrame) / speed));
                  const visibleStart = activePrimaryClip.timelineStartFrame + Math.max(0, t.start);
                  const visibleEnd = activePrimaryClip.timelineStartFrame + Math.max(1, slotLen - Math.max(0, t.end));
                  const sourceStart = activePrimaryClip.sourceInFrame + Math.max(0, t.start) * speed;
                  const compFrame = visibleStart + (sourceFrame - sourceStart) / speed;
                  const compFps = Math.max(1, data.composition.settings.fps);
                  const endThreshold = visibleEnd - (1 / compFps) * 0.5; // half-frame tolerance
                  if (compFrame >= endThreshold) {
                    // Nudge just beyond this clip's end so we immediately hand off
                    // to the composition clock or the next clip (no freeze at boundary).
                    const epsilon = 0.001;
                    const to = Math.min(
                      data.composition.settings.durationFrames - 1,
                      visibleEnd + epsilon,
                    );
                    setPlayhead(to);
                    return;
                  }
                  if (compFrame < visibleStart) {
                    setPlayhead(Math.max(0, Math.floor(visibleStart)));
                    return;
                  }
                  setPlayhead(Math.max(0, Math.min(data.composition.settings.durationFrames - 1, compFrame)));
                }}
                  />
                </div>
              </div>
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
                    {/* Quick toggles: visibility & audio */}
                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/80 hover:bg-white/10"
                        title={(selectedClip as any).hidden ? 'Show layer' : 'Hide layer'}
                        onClick={async () => {
                          setDirty(true); queueAutosave.current();
                          await updateClip({ clipId: selectedClip._id as any, patch: { hidden: !(selectedClip as any).hidden } as any });
                        }}
                      >
                        {(selectedClip as any).hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/80 hover:bg-white/10"
                        title={(selectedClip as any).audioEnabled ? 'Mute audio' : 'Unmute audio'}
                        onClick={async () => {
                          setDirty(true); queueAutosave.current();
                          await updateClip({ clipId: selectedClip._id as any, patch: { audioEnabled: !((selectedClip as any).audioEnabled ?? true) } as any });
                        }}
                      >
                        {((selectedClip as any).audioEnabled ?? true) ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      </button>
                    </div>
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
              setDirty(true);
              queueAutosave.current();
              void updateClip({ clipId: clipId as any, patch: patch as any });
            }}
            trims={Object.fromEntries(trimByClipId)}
            onTrimClip={(clipId, trim) => {
              setDirty(true);
              queueAutosave.current();
              const base = trimByClipId.get(clipId) ?? { start: 0, end: 0 };
              void upsertTrack({
                compositionId: composition._id,
                clipId: clipId as any,
                channel: 'trim',
                keyframes: [{ frame: 0, value: { start: Math.max(0, Math.round(trim.start)), end: Math.max(0, Math.round(trim.end)) }, interpolation: 'hold' }],
              });
            }}
            onAddClip={() => setAddClipOpen(true)}
            masterVolume={masterVolume}
            onChangeVolume={setMasterVolume}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onReset={() => handleSeek(0)}
            onRenameClip={(clipId, title) => {
              setDirty(true);
              queueAutosave.current();
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

      {/* Add Clip Modal */}
      {addClipOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/85 p-5 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Add clip</h2>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10" onClick={() => setAddClipOpen(false)} title="Close">×</button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto pr-2">
              {Object.values(data.sources).map((source) => (
                <button key={source._id as string} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10" onClick={async () => {
                  try {
                    const fps = Math.max(1, source.fps);
                    const durationFrames = Math.max(1, Math.round(source.durationSeconds * fps));
                    // Top z
                    const highestZ = data.clips.length ? Math.max(...data.clips.map((c) => c.zIndex ?? 0)) : 0;
                    await addClip({
                      compositionId: data.composition._id as any,
                      sourceVideoId: source._id as any,
                      sourceInFrame: 0,
                      sourceOutFrame: durationFrames,
                      timelineStartFrame: Math.round(playhead),
                      speed: 1,
                      opacity: 1,
                      label: source.title,
                      zIndex: highestZ + 1,
                    });
                    setAddClipOpen(false);
                  } catch (e) { console.error(e); }
                }}>
                  <div className="font-semibold">{source.title}</div>
                  <div className="text-[12px] text-white/60">{source.width}×{source.height} · {source.fps} fps · {Math.round(source.durationSeconds)}s</div>
                </button>
              ))}
              {Object.keys(data.sources).length === 0 && (
                <div className="text-sm text-white/60">No sources available for this composition.</div>
              )}
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-sm text-white/80">Upload new source</div>
                <input type="file" accept="video/*" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadError(null);
                  setUploading(true);
                  setUploadProgress(0);
                  try {
                    const contentType = resolveContentType(file);
                    const meta = await loadVideoMetadata(file);
                    let storageKey: string, publicUrl: string;
                    if (file.size >= 100 * 1024 * 1024) {
                      const res = await uploadMultipart(file, contentType, (p) => setUploadProgress(p));
                      storageKey = res.storageKey; publicUrl = res.publicUrl as any;
                    } else {
                      const creds = await generateVideoUploadUrl({ contentType, fileName: file.name });
                      await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('PUT', creds.uploadUrl, true);
                        xhr.setRequestHeader('Content-Type', contentType);
                        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadProgress((ev.loaded / ev.total) * 100); };
                        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('Upload failed')); };
                        xhr.onerror = () => reject(new Error('Upload failed'));
                        xhr.send(file);
                      });
                      storageKey = creds.storageKey; publicUrl = creds.publicUrl;
                      setUploadProgress(100);
                    }
                    // Create video record
                    const fps = Math.max(1, composition.settings.fps || 30);
                    const created = await completeVideoUpload({
                      storageKey,
                      publicUrl,
                      title: file.name,
                      width: meta.width,
                      height: meta.height,
                      fps,
                      duration: meta.duration,
                      projectId: (data.composition as any).projectId ?? undefined,
                      thumbnailUrl: undefined,
                    });
                    // Add as clip at playhead
                    const highestZ = data.clips.length ? Math.max(...data.clips.map((c) => c.zIndex ?? 0)) : 0;
                    await addClip({
                      compositionId: data.composition._id as any,
                      sourceVideoId: (created as any).id as any,
                      sourceInFrame: 0,
                      sourceOutFrame: Math.max(1, Math.round(meta.duration * fps)),
                      timelineStartFrame: Math.round(playhead),
                      speed: 1,
                      opacity: 1,
                      label: file.name,
                      zIndex: highestZ + 1,
                    });
                    setAddClipOpen(false);
                  } catch (err:any) {
                    setUploadError(err?.message || 'Upload failed');
                  } finally {
                    setUploading(false);
                  }
                }} />
                {uploading && (
                  <div className="mt-2 text-[12px] text-white/70">Uploading… {Math.round(uploadProgress)}%</div>
                )}
                {uploadError && (
                  <div className="mt-2 text-[12px] text-red-400">{uploadError}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saves Modal */}
      {savesOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onKeyDown={(e) => { e.stopPropagation(); }}>
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-black/85 p-5 text-white shadow-2xl" onKeyDown={(e) => { e.stopPropagation(); }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Saved edits</h2>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10" onClick={() => setSavesOpen(false)} title="Close">×</button>
            </div>
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-sm text-white/80">Save current edit</div>
              <div className="flex items-center gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name this save…"
                  className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 outline-none"
                />
                <button
                  className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                  onClick={async () => {
                    try {
                      const videoId = (data as any).composition?.sourceVideoId as Id<'videos'> | undefined;
                      if (!videoId) throw new Error('Missing source video');
                      const res = await saveSnapshotMut({ compositionId: composition._id as any, videoId: videoId as any, name: saveName || undefined });
                      // Set this new save as current
                      const newId = (res as any)?.id;
                      if (newId) await setCurrentSaveMut({ compositionId: composition._id as any, saveId: newId });
                      setSaveName('');
                    } catch (e) { console.error(e); }
                  }}
                >
                  <Save size={14} />
                  Save
                </button>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm text-white/80">Autosave</div>
                <div className="text-[12px] text-white/60">
                  Saving to: {currentSaveName ? <span className="font-semibold text-white/80">{currentSaveName}</span> : <span className="italic">Not set</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {/* Fancy toggle */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await setAutosaveMut({ compositionId: composition._id as any, enabled: !getSaveState?.autosaveEnabled, intervalMs: getSaveState?.autosaveIntervalMs ?? 30000 });
                    } catch (err) { console.error(err); }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${getSaveState?.autosaveEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                  title={getSaveState?.autosaveEnabled ? 'Autosave: On' : 'Autosave: Off'}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${getSaveState?.autosaveEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
                <div className={`flex items-center gap-2 ${getSaveState?.autosaveEnabled ? '' : 'opacity-50'}`}>
                  <span className="text-white/60 text-sm">Every</span>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    disabled={!getSaveState?.autosaveEnabled}
                    value={Math.round(((getSaveState?.autosaveIntervalMs ?? 300000) / 1000))}
                    onChange={async (e) => {
                      const sec = Math.max(5, Number(e.target.value) || 30);
                      try { await setAutosaveMut({ compositionId: composition._id as any, enabled: !!getSaveState?.autosaveEnabled, intervalMs: sec * 1000 }); } catch (err) { console.error(err); }
                    }}
                    className="w-20 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm disabled:cursor-not-allowed"
                  />
                  <span className="text-white/60 text-sm">seconds</span>
                </div>
                {!currentSaveName && (
                  <span className="text-[12px] text-amber-300">Tip: select a save with “Use” to enable autosave target.</span>
      )}

      {/* Ensure Active Save Modal */}
      {ensureSaveOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setEnsureSaveOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/85 p-5 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Create a save</h2>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10" onClick={() => setEnsureSaveOpen(false)} title="Close">×</button>
            </div>
            <p className="mb-3 text-sm text-white/70">You need an active save to store your edits. Create one now and we’ll enable autosave.</p>
            <div className="mb-4 flex items-center gap-2">
              <input
                value={ensureSaveName}
                onChange={(e) => setEnsureSaveName(e.target.value)}
                placeholder="Name this save…"
                className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 outline-none"
              />
              <button
                className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                onClick={async () => {
                  try {
                    const videoId = (data as any)?.composition?.sourceVideoId as Id<'videos'> | undefined;
                    if (!videoId) throw new Error('Missing source video');
                    const res = await saveSnapshotMut({ compositionId: (data as any).composition._id as any, videoId: videoId as any, name: ensureSaveName || undefined });
                    const newId = (res as any)?.id || (res as any)?.saveId;
                    if (newId) {
                      await setCurrentSaveMut({ compositionId: (data as any).composition._id as any, saveId: newId });
                      await setAutosaveMut({ compositionId: (data as any).composition._id as any, enabled: true, intervalMs: getSaveState?.autosaveIntervalMs ?? 300000 });
                    }
                    setEnsureSaveOpen(false);
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                <Save size={14} />
                Create
              </button>
            </div>
          </div>
        </div>
      )}
              </div>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/60">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(saves ?? []).map((s) => (
                    <tr key={s.id} className={`border-t border-white/10 ${getSaveState?.currentSaveId === s.id ? 'bg-white/10' : ''}`}>
                      <td className="px-3 py-2">{s.name} {getSaveState?.currentSaveId === s.id && <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase">In use</span>}</td>
                      <td className="px-3 py-2 text-white/60">{new Date(s.updatedAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="mr-2 inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          onClick={async () => {
                            try {
                              const res = await loadSnapshotMut({ saveId: s.id });
                              const id = (res as any).compositionId as string;
                              if (onOpenComposition) onOpenComposition(id as any);
                              else window.location.assign(`/edit/${id}`);
                            } catch (e) { console.error(e); }
                          }}
                        >
                          Open
                        </button>
                        <button
                          className="mr-2 inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          onClick={async () => {
                            try { await setCurrentSaveMut({ compositionId: composition._id as any, saveId: s.id }); } catch (e) { console.error(e); }
                          }}
                        >
                          Use
                        </button>
                        <button
                          className="mr-2 inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          onClick={async () => {
                            const next = window.prompt('Rename save', s.name);
                            if (!next) return;
                            try { await renameSaveMut({ saveId: s.id, name: next }); } catch (e) { console.error(e); }
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          onClick={() => {
                            setConfirmDelete({ id: s.id as string, name: s.name as string });
                          }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </td>
                    </tr>
                  )) || (
                    <tr><td className="px-3 py-6 text-white/60" colSpan={3}>No saves yet.</td></tr>
                  )}
                </tbody>
              </table>
          </div>
        </div>
        {/* Delete Save Confirmation */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[10050] flex items-center justify-center" onClick={() => setConfirmDelete(null)}>
            <div className="absolute inset-0 bg-black/70" />
            <div
              className="relative w-[min(92vw,420px)] rounded-2xl border border-white/10 bg-black/90 p-5 text-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 text-lg font-semibold">Delete save?</div>
              <div className="mb-4 text-sm text-white/70">
                You are about to delete
                {confirmDelete.name ? (
                  <> "<span className="text-white/90 font-medium">{confirmDelete.name}</span>"</>
                ) : null}
                . This action cannot be undone.
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                  onClick={async () => {
                    try { await deleteSaveMut({ saveId: confirmDelete.id as any }); } catch (e) { console.error(e); }
                    setConfirmDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
};

export default EditorPage;
