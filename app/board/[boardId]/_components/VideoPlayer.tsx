"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type VideoPlayerProps = {
  src: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fit?: "cover" | "contain";
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  className,
  autoPlay = false,
  muted = true,
  loop = false,
  fit = "cover",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isHover, setIsHover] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(muted);
  const [volume, setVolume] = useState<number>(0.8);

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

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setDuration(v.duration || 0);
    const onTime = () => setCurrentTime(v.currentTime || 0);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    if (autoPlay) {
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [autoPlay]);

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

  const enterFullscreen = useCallback(() => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  return (
    <div 
      className={cn("relative w-full h-full bg-black select-none", className)}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onPointerDown={(e) => {
        // allow drag on empty areas, but controls will stop propagation
      }}
    >
      <video
        ref={videoRef}
        src={src}
        className={cn("w-full h-full", fit === "cover" ? "object-cover" : "object-contain")}
        playsInline
        loop={loop}
        muted={isMuted}
        preload="metadata"
        draggable={false}
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      <div 
        className={cn(
          "absolute inset-x-0 bottom-0 px-3 pt-6 pb-2",
          "transition-opacity duration-200",
          isHover || !isPlaying ? "opacity-100" : "opacity-0"
        )}
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

        <div className="flex items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <div className="text-xs tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Volume slider */}
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

            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
              onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


