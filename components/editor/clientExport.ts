import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Id } from '../../convex/_generated/dataModel';

type SourceInfo = {
  _id: Id<'videos'>;
  title: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  src: string;
};

type ClipDoc = {
  _id: Id<'compositionClips'>;
  sourceVideoId: Id<'videos'>;
  sourceInFrame: number;
  sourceOutFrame: number;
  timelineStartFrame: number;
  speed: number;
  zIndex: number;
  audioEnabled?: boolean;
};

type CompositionDoc = {
  _id: Id<'compositions'>;
  settings: {
    width: number;
    height: number;
    fps: number;
    durationFrames: number;
  };
};

type TrimMap = Record<string, { start: number; end: number }>;

type TransformMap = Record<string, { x: number; y: number; scale: number; rotate: number }>;

export type ClientExportParams = {
  composition: CompositionDoc;
  clips: ClipDoc[];
  trims: TrimMap;
  transforms: TransformMap;
  sources: Record<string, SourceInfo>;
  videoUrls: Record<string, string>;
  onProgress?: (value: number, label: string) => void;
  debug?: boolean;
  logger?: (msg: string, data?: any) => void;
  // Optional transcode tuning
  x264Preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
  x264Crf?: number; // 18(best)-35(worse)
  masterVolume?: number;
  retimeWebM?: boolean;
};

const waitForEvent = (target: EventTarget, event: string) =>
  new Promise<void>((resolve, reject) => {
    const onError = () => {
      cleanup();
      reject(new Error(`Failed waiting for ${event}`));
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureVideoReady = async (video: HTMLVideoElement) => {
  if (video.readyState >= 2) return;
  await waitForEvent(video, 'loadeddata');
};

const seekVideo = async (video: HTMLVideoElement, time: number) => {
  if (Number.isNaN(time)) return;
  const tolerance = 1 / 120; // tighter tolerance in seconds
  if (Math.abs(video.currentTime - time) <= tolerance && video.readyState >= 2) return;
  video.pause();
  video.currentTime = Math.max(0, time);
  await waitForEvent(video, 'seeked');
};

const waitForRVFC = (video: HTMLVideoElement, timeoutMs = 150) =>
  new Promise<void>((resolve) => {
    let settled = false;
    let timer: any = null;
    try {
      if (typeof (video as any).requestVideoFrameCallback === 'function') {
        (video as any).requestVideoFrameCallback(() => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve();
        });
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve();
        }, timeoutMs);
        return;
      }
    } catch {}
    // Fallback: tiny delay
    setTimeout(() => resolve(), 0);
  });

const seekExactAndDecode = async (video: HTMLVideoElement, time: number, log: (m: string, d?: any) => void) => {
  await seekVideo(video, time);
  await waitForRVFC(video, 180);
  if (video.readyState < 2) {
    await sleep(2);
  }
};

const createVideoElement = async (url: string) => {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  await ensureVideoReady(video);
  return video;
};

const drawClip = (
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  transform: { x: number; y: number; scale: number; rotate: number },
  compWidth: number,
  compHeight: number,
  source: SourceInfo,
) => {
  const aspect = source.width / Math.max(1, source.height);
  let drawWidth = compWidth;
  let drawHeight = drawWidth / aspect;
  if (drawHeight < compHeight) {
    drawHeight = compHeight;
    drawWidth = drawHeight * aspect;
  }
  const tx = (transform.x - 0.5) * compWidth;
  const ty = (transform.y - 0.5) * compHeight;
  ctx.save();
  ctx.translate(compWidth / 2 + tx, compHeight / 2 + ty);
  ctx.rotate(((transform.rotate ?? 0) * Math.PI) / 180);
  ctx.scale(transform.scale ?? 1, transform.scale ?? 1);
  ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
};

export const renderCompositionClient = async ({
  composition,
  clips,
  trims,
  transforms,
  sources,
  videoUrls,
  onProgress,
  debug = false,
  logger,
  x264Preset = 'ultrafast',
  x264Crf = 28,
  masterVolume = 1,
  retimeWebM = false,
}: ClientExportParams): Promise<{ webmBlob: Blob; mp4Blob: Blob }> => {
  const log = (msg: string, data?: any) => {
    if (debug) {
    }
  };
  log('Start render', { fps: composition.settings.fps, frames: composition.settings.durationFrames });
  if (typeof document === 'undefined') {
    throw new Error('Client rendering is only available in the browser.');
  }
  const fps = Math.max(1, composition.settings.fps);
  const totalFrames = Math.max(1, composition.settings.durationFrames);
  const canvas = document.createElement('canvas');
  canvas.width = composition.settings.width;
  canvas.height = composition.settings.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D context');

  const stream = canvas.captureStream(fps);
  // Audio chain: single active audio element following the top visible clip
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioDest = audioCtx.createMediaStreamDestination();
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1, (typeof masterVolume === 'number' ? masterVolume : 1)));
  masterGain.connect(audioDest);
  const audioEl = document.createElement('audio');
  audioEl.crossOrigin = 'anonymous';
  audioEl.preload = 'auto';
  audioEl.muted = true; // prevent speakers; WebAudio path still active
  const audioSrcNode = audioCtx.createMediaElementSource(audioEl);
  audioSrcNode.connect(masterGain);
  let currentAudioClipId: string | null = null;
  const pickAudioForFrame = (frame: number) => {
    // Highest zIndex visible with audioEnabled
    let best: { clip: ClipDoc; src: SourceInfo; seconds: number } | null = null;
    for (const clip of clips.slice().sort((a, b) => a.zIndex - b.zIndex)) {
      const trim = trims[clip._id as string] ?? { start: 0, end: 0 };
      const src = sources[clip.sourceVideoId as string];
      if (!src) continue;
      if (clip.audioEnabled === false) continue;
      const speed = Math.max(0.001, clip.speed);
      const slotLen = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / speed));
      const trimStart = Math.max(0, trim.start);
      const trimEnd = Math.max(0, trim.end);
      const visibleStart = clip.timelineStartFrame + trimStart;
      const visibleEnd = clip.timelineStartFrame + Math.max(1, slotLen - trimEnd);
      if (frame < visibleStart || frame >= visibleEnd) continue;
      const offset = frame - visibleStart;
      const sourceFrame = clip.sourceInFrame + trimStart * speed + offset * speed;
      const seconds = sourceFrame / Math.max(1, src.fps);
      best = { clip, src, seconds }; // overwrite → top most due to sort by zIndex ascending then overwritten: final is highest z
    }
    return best;
  };

  // Combined stream (video + audio)
  const combined = new MediaStream([
    ...stream.getVideoTracks(),
    ...(audioDest.stream.getAudioTracks()[0] ? [audioDest.stream.getAudioTracks()[0]] : []),
  ]);
  const pickMimeType = (): string => {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const t of candidates) {
      try { if ((window as any).MediaRecorder?.isTypeSupported?.(t)) return t; } catch {}
    }
    return 'video/webm;codecs=vp9';
  };
  const chosenMime = pickMimeType();
  log('MediaRecorder mime', { chosenMime });
  const recorder = new MediaRecorder(combined, { mimeType: chosenMime });
  const webmChunks: BlobPart[] = [];
  recorder.onstart = () => log('MediaRecorder started');
  recorder.ondataavailable = (evt) => {
    if (evt.data && evt.data.size > 0) {
      webmChunks.push(evt.data);
      log('MediaRecorder chunk', { size: evt.data.size });
    }
  };
  recorder.onstop = () => log('MediaRecorder stopped', { chunks: webmChunks.length });

  const clipVideos = new Map<string, HTMLVideoElement>();
  for (const clip of clips) {
    const srcId = clip.sourceVideoId as unknown as string;
    const url = videoUrls[srcId];
    if (!url) {
      throw new Error(`Missing source URL for clip ${clip._id}`);
    }
    log('Loading source', { clipId: clip._id, url });
    const video = await createVideoElement(url);
    log('Source ready', { clipId: clip._id, duration: video.duration });
    clipVideos.set(clip._id as string, video);
  }

  const sortedClips = clips.slice().sort((a, b) => a.zIndex - b.zIndex);
  recorder.start();
  log('Recorder started, entering frame loop');

  let lastPct = -1;
  for (let frame = 0; frame < totalFrames; frame++) {
    // Switch/adjust audio track if needed
    const audioSel = pickAudioForFrame(frame);
    if (!audioSel) {
      if (!audioEl.paused) { try { audioEl.pause(); } catch {} }
      currentAudioClipId = null;
    } else {
      const desiredSrc = audioSel.src ? (videoUrls[audioSel.clip.sourceVideoId as unknown as string] || audioSel.src.src) : undefined;
      if (desiredSrc && currentAudioClipId !== (audioSel.clip._id as string)) {
        try {
          audioEl.pause();
          audioEl.src = desiredSrc;
          await waitForEvent(audioEl, 'canplay');
          audioEl.currentTime = Math.max(0, audioSel.seconds);
          await audioEl.play().catch(() => undefined);
          currentAudioClipId = audioSel.clip._id as string;
        } catch {}
      } else if (desiredSrc) {
        const drift = Math.abs(audioEl.currentTime - audioSel.seconds);
        if (drift > 0.1) {
          try { audioEl.currentTime = audioSel.seconds; } catch {}
        }
        if (audioEl.paused) {
          try { await audioEl.play(); } catch {}
        }
      }
    }
    // Determine which clips are visible in this frame and pre-seek them all before drawing
    const visible: Array<{ clip: ClipDoc; video: HTMLVideoElement; seconds: number; src: SourceInfo }>
      = [];
    for (const clip of sortedClips) {
      const trim = trims[clip._id as string] ?? { start: 0, end: 0 };
      const video = clipVideos.get(clip._id as string)!;
      const source = sources[clip.sourceVideoId as string];
      if (!source) continue;
      const speed = Math.max(0.001, clip.speed);
      const slotLen = Math.max(1, Math.round((clip.sourceOutFrame - clip.sourceInFrame) / speed));
      const trimStart = Math.max(0, trim.start);
      const trimEnd = Math.max(0, trim.end);
      const visibleStart = clip.timelineStartFrame + trimStart;
      const visibleEnd = clip.timelineStartFrame + Math.max(1, slotLen - trimEnd);
      if (frame < visibleStart || frame >= visibleEnd) continue;
      const offset = frame - visibleStart;
      const sourceFrame = clip.sourceInFrame + trimStart * speed + offset * speed;
      const seconds = sourceFrame / Math.max(1, source.fps);
      visible.push({ clip, video, seconds, src: source });
    }
    // Pre-seek all visible videos, then draw bottom->top
    await Promise.all(visible.map(({ video, seconds }) => seekExactAndDecode(video, seconds, log)));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    for (const { clip, video, src } of visible) {
      drawClip(
        ctx,
        video,
        transforms[clip._id as string] ?? { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
        canvas.width,
        canvas.height,
        src,
      );
    }
    const track = stream.getVideoTracks()[0] as any;
    if (typeof track?.requestFrame === 'function') {
      track.requestFrame();
    }
    const pct = frame / totalFrames;
    if (debug) {
      const pct10 = Math.floor(pct * 10);
      if (pct10 !== lastPct) { lastPct = pct10; log(`Render progress ${(pct * 100).toFixed(1)}%`); }
    }
    onProgress?.(pct, 'Rendering');
    await sleep(1000 / fps);
  }

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    recorder.onstop = done;
    recorder.stop();
  });

  const webmBlob = new Blob(webmChunks, { type: chosenMime.includes('mp4') ? 'video/mp4' : 'video/webm' });
  log('WebM built', { size: webmBlob.size });
  // If we recorded directly to MP4, retime to exact fps/length (rebuild PTS)
  if (chosenMime.includes('mp4')) {
    onProgress?.(0.95, 'Finalizing (MP4 retime)…');
    log('FFmpeg load start (retime MP4)');
    const ffmpeg = new FFmpeg();
    const VERSION = '0.12.10';
    const bases = [
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/esm`,
      `https://unpkg.com/@ffmpeg/core@${VERSION}/dist/esm`,
    ];
    let lastErr: any = null;
    for (const base of bases) {
      try {
        log('FFmpeg core fetch try', { base });
        const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
        await ffmpeg.load({ coreURL, wasmURL });
        log('FFmpeg loaded from', base);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        log('FFmpeg load failed at base', { base, error: (e as any)?.message || String(e) });
      }
    }
    if (lastErr) throw lastErr;
    const inputData = await fetchFile(webmBlob);
    await ffmpeg.writeFile('input.mp4', inputData);
    log('FFmpeg write input (mp4)');
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-an',
      '-c:v', 'libx264',
      '-preset', x264Preset,
      '-tune', 'zerolatency',
      '-crf', String(Math.max(18, Math.min(35, x264Crf))),
      '-pix_fmt', 'yuv420p',
      '-vf', `setpts=N/(${fps}*TB),fps=${fps}`,
      '-movflags', '+faststart',
      'output.mp4',
    ]);
    const data = await ffmpeg.readFile('output.mp4');
    const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
    onProgress?.(1, 'Completed');
    log('Return retimed mp4', { mp4: mp4Blob.size });
    return { webmBlob, mp4Blob };
  }

  // If we recorded WebM and want a fast-publish WebM with exact duration, retime to WebM too
  let retimedWebM: Blob | null = null;
  if (retimeWebM) {
    onProgress?.(0.92, 'Finalizing (WebM retime)…');
    const ffmpegW = new FFmpeg();
    const VERSION = '0.12.10';
    const bases = [
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/esm`,
      `https://unpkg.com/@ffmpeg/core@${VERSION}/dist/esm`,
    ];
    let lastErrW: any = null;
    for (const base of bases) {
      try {
        log('FFmpeg core fetch try (webm)', { base });
        const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
        await ffmpegW.load({ coreURL, wasmURL });
        lastErrW = null;
        break;
      } catch (e) {
        lastErrW = e;
        log('FFmpeg load failed at base (webm)', { base, error: (e as any)?.message || String(e) });
      }
    }
    if (lastErrW) throw lastErrW;
    const inData = await fetchFile(webmBlob);
    await ffmpegW.writeFile('in.webm', inData);
    // Quick VP9 encode tuned for speed
    await ffmpegW.exec([
      '-i', 'in.webm',
      '-an',
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', '33',
      '-deadline', 'realtime',
      '-speed', '8',
      '-vf', `setpts=N/(${fps}*TB),fps=${fps}`,
      'out.webm',
    ]);
    const outData = await ffmpegW.readFile('out.webm');
    retimedWebM = new Blob([outData.buffer], { type: 'video/webm' });
    log('Return retimed webm', { size: retimedWebM.size });
  }

  onProgress?.(0.95, 'Converting to MP4');
  log('FFmpeg load start');
  const ffmpeg = new FFmpeg();
  const VERSION = '0.12.10';
  const bases = [
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/esm`,
    `https://unpkg.com/@ffmpeg/core@${VERSION}/dist/esm`,
  ];
  let lastErr: any = null;
  for (const base of bases) {
    try {
      log('FFmpeg core fetch try', { base });
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
      await ffmpeg.load({ coreURL, wasmURL });
      log('FFmpeg loaded from', base);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      log('FFmpeg load failed at base', { base, error: (e as any)?.message || String(e) });
    }
  }
  if (lastErr) throw lastErr;
  log('FFmpeg loaded');
  const inputData = await fetchFile(webmBlob);
  await ffmpeg.writeFile('input.webm', inputData);
  log('FFmpeg write input', { bytes: (inputData as any)?.byteLength || (inputData as any)?.size });
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-an',
    '-c:v', 'libx264',
    '-preset', x264Preset,
    '-tune', 'zerolatency',
    '-crf', String(Math.max(18, Math.min(35, x264Crf))),
    '-pix_fmt', 'yuv420p',
    '-vf', `setpts=N/(${fps}*TB),fps=${fps}`,
    '-movflags', '+faststart',
    'output.mp4',
  ]);
  log('FFmpeg exec done');
  const data = await ffmpeg.readFile('output.mp4');
  log('FFmpeg read output', { bytes: (data as any)?.byteLength });
  const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
  onProgress?.(1, 'Completed');
  log('Return blobs', { webm: webmBlob.size, mp4: mp4Blob.size });
  return { webmBlob, mp4Blob };
};
