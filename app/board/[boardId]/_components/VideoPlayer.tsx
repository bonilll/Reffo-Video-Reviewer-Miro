"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type VideoPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fit?: "cover" | "contain";
  preload?: "none" | "metadata" | "auto";
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function getPreviewSeekTime(duration?: number): number {
  if (!Number.isFinite(duration) || (duration ?? 0) <= 0) return 1.2;
  const safeDuration = duration as number;
  if (safeDuration <= 1) return Math.max(0.12, safeDuration * 0.45);
  if (safeDuration < 4) return Math.min(1.4, Math.max(0.4, safeDuration * 0.35));
  return Math.min(Math.max(safeDuration * 0.15, 1.2), 6);
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  className,
  autoPlay = false,
  muted = true,
  loop = false,
  fit = "cover",
  preload = "metadata",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const firstFramePinnedRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(muted);
  const [volume, setVolume] = useState<number>(0.8);
  const [playerWidth, setPlayerWidth] = useState<number>(0);
  const [hasPreviewFrame, setHasPreviewFrame] = useState<boolean>(Boolean(poster));

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  const onSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(v.currentTime);
  }, [duration]);

  const onWheelVolume = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setVolume((v) => Math.min(1, Math.max(0, v + delta)));
  }, []);

  const progressPct = useMemo(() => (duration > 0 ? (currentTime / duration) * 100 : 0), [currentTime, duration]);
  const resolvedSrc = useMemo(() => {
    if (!src) return src;
    if (src.includes("#t=")) return src;
    if (!poster && !autoPlay) return `${src}#t=${getPreviewSeekTime(undefined)}`;
    return src;
  }, [src, poster, autoPlay]);
  const isCompactPlayer = playerWidth > 0 && playerWidth < 360;

  const ensureFirstFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || poster || autoPlay || firstFramePinnedRef.current) return;
    if (v.readyState < 1) return;

    const previewOffset = getPreviewSeekTime(v.duration);
    try {
      if (v.currentTime <= 0.01) {
        v.currentTime = previewOffset;
      }
      const maybePlay = v.play();
      if (maybePlay && typeof maybePlay.then === "function") {
        maybePlay
          .then(() => {
            v.pause();
            if (v.currentTime <= 0.01) {
              v.currentTime = previewOffset;
            }
          })
          .catch(() => {
            if (v.currentTime <= 0.01) {
              v.currentTime = previewOffset;
            }
          });
      }
    } catch {
      // Ignore seek restrictions on some browsers.
    }
  }, [poster, autoPlay]);

  useEffect(() => {
    firstFramePinnedRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setHasPreviewFrame(Boolean(poster));
  }, [resolvedSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onLoadedMetadata = () => {
      setDuration(v.duration || 0);
      ensureFirstFrame();
    };
    const onLoadedData = () => {
      if (v.currentTime > 0.01 || Boolean(poster)) {
        setHasPreviewFrame(true);
      }
      ensureFirstFrame();
    };
    const onCanPlay = () => {
      ensureFirstFrame();
    };
    const onSeeked = () => {
      if (!autoPlay && !poster) {
        v.pause();
        if (v.currentTime > 0) {
          firstFramePinnedRef.current = true;
          setCurrentTime(v.currentTime);
          setHasPreviewFrame(true);
        }
      }
    };
    const onTime = () => {
      const t = v.currentTime || 0;
      setCurrentTime(t);
      if (t > 0.01) {
        setHasPreviewFrame(true);
      }
    };

    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("timeupdate", onTime);

    if (autoPlay) {
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [autoPlay, poster, ensureFirstFrame]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPlayerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const enterFullscreen = useCallback(() => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  const timeLabel = `${formatTime(currentTime)} / ${formatTime(duration)}`;

  return (
    <div 
      ref={containerRef}
      className={cn("relative w-full h-full select-none", className)}
      onPointerDown={(e) => {
        // allow drag on empty areas, but controls will stop propagation
      }}
    >
      <video
        ref={videoRef}
        src={resolvedSrc}
        poster={poster}
        className={cn("w-full h-full bg-slate-100", fit === "cover" ? "object-cover" : "object-contain")}
        playsInline
        loop={loop}
        muted={isMuted}
        preload={preload === "metadata" ? "auto" : preload}
        draggable={false}
        onClick={togglePlay}
      />

      {!hasPreviewFrame && !isPlaying && (
        <div className="absolute inset-0 pointer-events-none bg-slate-100 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-slate-900/85 grid place-items-center shadow-sm">
            <Play className="w-4 h-4 text-white" color="#ffffff" />
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div 
        className="absolute inset-x-0 bottom-0 px-3 pt-6 pb-2 opacity-100"
        style={{
          background: "linear-gradient(to top, rgba(15,23,42,0.62) 0%, rgba(15,23,42,0.28) 48%, rgba(15,23,42,0) 100%)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onWheel={onWheelVolume}
      >
        {/* Progress bar */}
        <div 
          ref={progressRef}
          className="w-full h-2 bg-white/20 rounded-full cursor-pointer mb-2"
          onMouseDown={onSeek}
        >
          <div className="h-2 bg-white rounded-full" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="flex items-center justify-between gap-2 text-white min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white"
              style={{ color: "#ffffff" }}
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-white" color="#ffffff" /> : <Play className="w-4 h-4 text-white" color="#ffffff" />}
            </button>

            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white"
              style={{ color: "#ffffff" }}
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-white" color="#ffffff" /> : <Volume2 className="w-4 h-4 text-white" color="#ffffff" />}
            </button>

            <div className="text-xs tabular-nums text-white font-medium shrink-0 min-w-[96px]" style={{ color: "#ffffff" }}>
              {timeLabel}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Volume slider */}
            {!isCompactPlayer && (
              <div 
                className="w-24 h-1.5 bg-white/20 rounded-full cursor-pointer"
                onMouseDown={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  const rect = el.getBoundingClientRect();
                  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                  setVolume(pct);
                  e.stopPropagation();
                }}
              >
                <div className="h-1.5 bg-white rounded-full" style={{ width: `${Math.round(volume * 100)}%` }} />
              </div>
            )}

            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white"
              style={{ color: "#ffffff" }}
              onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4 text-white" color="#ffffff" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
