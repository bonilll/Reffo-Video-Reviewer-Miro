import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadFileMultipart } from "@/lib/upload/multipart";
import {
  compressImageFile,
  createImagePreviewDataUrl,
  isCompressibleImage,
} from "@/lib/upload/imageCompression";
import { Library } from "@/components/library/library";
import { CollectionsView } from "@/components/library/collections";
import { ReferenceDeleteConfirmation } from "@/components/library/ReferenceDeleteConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UploadCloud,
  ImageIcon,
  VideoIcon,
  FileIcon,
  X,
  Check,
  ChevronDown,
  Plus,
  Search,
  Folder,
  MousePointer2,
  Trash2,
  FolderPlus,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type UploadItem = {
  id: string;
  file: File;
  displayTitle: string;
  progress: number;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  error?: string;
};

type StagedItem = {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  tags: string[];
  description: string;
  externalLink: string;
  author: string;
  aspectRatio?: number;
};

const getAssetType = (file: File): "image" | "video" | "file" => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
};

const getObjectUrl = (file: File) => {
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
};

const dataUrlToFile = (dataUrl: string, fileName: string): File | null => {
  try {
    const [header, base64] = dataUrl.split(",");
    if (!header || !base64) return null;
    const mimeMatch = header.match(/data:([^;]+);base64/);
    const mimeType = mimeMatch?.[1] || "application/octet-stream";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mimeType, lastModified: Date.now() });
  } catch {
    return null;
  }
};

const getAssetVariantUrl = (
  asset: any,
  key: "preview" | "thumb" | "original" | "hires"
): string => {
  const variant = asset?.variants?.[key];
  if (!variant || typeof variant !== "object") return "";
  const direct = typeof variant.url === "string" ? variant.url.trim() : "";
  if (direct) return direct;
  const publicUrl = typeof variant.publicUrl === "string" ? variant.publicUrl.trim() : "";
  return publicUrl;
};

const toSafeBaseName = (raw: string) => {
  const normalized = raw
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "image";
};

const extensionFromMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("avif")) return "avif";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
};

const releaseObjectUrl = (url: string) => {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
};

const normalizeTag = (tag: string) => {
  const cleaned = tag
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const mergeTags = (existing: string[], next: string[]) => {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...existing, ...next].forEach((raw) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(tag);
  });
  return merged;
};

const normalizeCollectionTitleDisplay = (title: string) => {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const normalizeCollectionTitleKey = (title: string) =>
  title.replace(/\s+/g, " ").trim().toLowerCase();

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const extractDominantColors = (img: HTMLImageElement, maxColors = 6) => {
  const canvas = document.createElement("canvas");
  const size = 36;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [] as string[];
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 32) continue;
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;
    const key = rgbToHex(r, g, b);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([color]) => color);
};

const computeDHash = (img: HTMLImageElement) => {
  const width = 9;
  const height = 8;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    pixels.push(r * 0.299 + g * 0.587 + b * 0.114);
  }
  let hashBits = "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      hashBits += pixels[idx] > pixels[idx + 1] ? "1" : "0";
    }
  }
  let hash = "";
  for (let i = 0; i < hashBits.length; i += 4) {
    const chunk = hashBits.slice(i, i + 4);
    hash += parseInt(chunk, 2).toString(16);
  }
  return hash;
};

const extractImageMetadata = (file: File) =>
  new Promise<{
    width: number;
    height: number;
    aspectRatio: number;
    dominantColors: string[];
    phash?: string;
  }>((resolve, reject) => {
    const objectUrl = getObjectUrl(file);
    if (!objectUrl) {
      reject(new Error("Unable to load image"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const dominantColors = extractDominantColors(img);
      const phash = computeDHash(img);
      releaseObjectUrl(objectUrl);
      resolve({
        width,
        height,
        aspectRatio: width > 0 ? width / height : 1,
        dominantColors,
        phash,
      });
    };
    img.onerror = () => {
      releaseObjectUrl(objectUrl);
      reject(new Error("Unable to read image metadata"));
    };
    img.src = objectUrl;
  });

const extractVideoMetadata = (file: File) =>
  new Promise<{
    width: number;
    height: number;
    durationSeconds: number;
    aspectRatio: number;
  }>((resolve, reject) => {
    const objectUrl = getObjectUrl(file);
    if (!objectUrl) {
      reject(new Error("Unable to load video"));
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
      releaseObjectUrl(objectUrl);
      resolve({
        width,
        height,
        durationSeconds,
        aspectRatio: width > 0 ? width / height : 1,
      });
    };
    video.onerror = () => {
      releaseObjectUrl(objectUrl);
      reject(new Error("Unable to read video metadata"));
    };
    video.src = objectUrl;
  });

const buildVideoPreviewSeekCandidates = (duration?: number): number[] => {
  if (!Number.isFinite(duration) || (duration ?? 0) <= 0) {
    return [1.2, 2.4, 3.8];
  }
  const safeDuration = duration as number;
  if (safeDuration <= 1) {
    return [Math.max(0.08, safeDuration * 0.45)];
  }
  const rawCandidates = [
    Math.min(Math.max(safeDuration * 0.15, 1.0), safeDuration - 0.08),
    safeDuration * 0.28,
    safeDuration * 0.42,
    safeDuration * 0.58,
    safeDuration * 0.72,
  ];
  return Array.from(
    new Set(
      rawCandidates
        .map((t) => Math.max(0.08, Math.min(safeDuration - 0.08, t)))
        .map((t) => Math.round(t * 100) / 100)
    )
  );
};

const captureVideoPreviewFromSource = async (
  sourceUrl: string
): Promise<{ dataUrl?: string; blob?: Blob; width?: number; height?: number }> => {
  if (!sourceUrl) return {};

  return await new Promise<{ dataUrl?: string; blob?: Blob; width?: number; height?: number }>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let seekIndex = 0;
    let candidateTimes: number[] = [];
    let timeoutId: number | null = null;
    let seekScheduled = false;

    const finalize = (payload?: { dataUrl?: string; blob?: Blob; width?: number; height?: number }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload ?? {});
    };

    const cleanup = () => {
      video.pause();
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      video.removeAttribute("src");
      video.load();
    };

    const onError = () => finalize({});

    const captureFrame = async (): Promise<{
      dataUrl?: string;
      blob?: Blob;
      brightness?: number | null;
      width?: number;
      height?: number;
    }> => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (width <= 0 || height <= 0) {
        return {};
      }

      const maxDimension = 360;
      const scale = Math.min(maxDimension / width, maxDimension / height, 1);
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return {};
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      let brightness: number | null = null;
      try {
        const sampleSize = 18;
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = sampleSize;
        sampleCanvas.height = sampleSize;
        const sampleCtx = sampleCanvas.getContext("2d");
        if (sampleCtx) {
          sampleCtx.drawImage(video, 0, 0, sampleSize, sampleSize);
          const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
          let total = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
          }
          brightness = total / (sampleSize * sampleSize);
        }
      } catch {
        brightness = null;
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.74);
      const blob = await new Promise<Blob | undefined>((resolveBlob) => {
        canvas.toBlob((value) => resolveBlob(value ?? undefined), "image/jpeg", 0.74);
      });
      return { dataUrl, blob, brightness, width: targetWidth, height: targetHeight };
    };

    const seekNextCandidate = () => {
      if (settled || seekScheduled) return;
      if (candidateTimes.length === 0) {
        candidateTimes = buildVideoPreviewSeekCandidates(video.duration);
      }
      const index = Math.max(0, Math.min(seekIndex, candidateTimes.length - 1));
      const targetTime = candidateTimes[index];
      try {
        seekScheduled = true;
        video.currentTime = targetTime;
      } catch {
        finalize({});
      }
    };

    const onCaptureAttempt = async () => {
      seekScheduled = false;
      const frame = await captureFrame();
      if (!frame.dataUrl) {
        finalize({});
        return;
      }

      const looksTooDark = typeof frame.brightness === "number" ? frame.brightness < 18 : false;
      const hasMoreCandidates = seekIndex < candidateTimes.length - 1;

      if (looksTooDark && hasMoreCandidates) {
        seekIndex += 1;
        seekNextCandidate();
        return;
      }

      finalize({
        dataUrl: frame.dataUrl,
        blob: frame.blob,
        width: frame.width,
        height: frame.height,
      });
    };

    video.addEventListener("error", onError, { once: true });
    video.onloadedmetadata = () => {
      candidateTimes = buildVideoPreviewSeekCandidates(video.duration);
      seekNextCandidate();
    };
    video.onloadeddata = () => {
      if (!seekScheduled) {
        seekNextCandidate();
      }
    };
    video.onseeked = () => {
      void onCaptureAttempt();
    };

    timeoutId = window.setTimeout(() => finalize({}), 10000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = sourceUrl;
  });
};

const createVideoPreviewCapture = async (
  file: File
): Promise<{ dataUrl?: string; blob?: Blob; width?: number; height?: number }> => {
  if (!file.type.startsWith("video/")) return {};

  const objectUrl = URL.createObjectURL(file);
  try {
    return await captureVideoPreviewFromSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const getImageAspectRatio = (file: File) =>
  new Promise<number>((resolve) => {
    const objectUrl = getObjectUrl(file);
    if (!objectUrl) {
      resolve(1);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      releaseObjectUrl(objectUrl);
      resolve(width > 0 && height > 0 ? width / height : 1);
    };
    img.onerror = () => {
      releaseObjectUrl(objectUrl);
      resolve(1);
    };
    img.src = objectUrl;
  });

const getVideoAspectRatio = (file: File) =>
  new Promise<number>((resolve) => {
    const objectUrl = getObjectUrl(file);
    if (!objectUrl) {
      resolve(1);
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      releaseObjectUrl(objectUrl);
      resolve(width > 0 && height > 0 ? width / height : 1);
    };
    video.onerror = () => {
      releaseObjectUrl(objectUrl);
      resolve(1);
    };
    video.src = objectUrl;
  });

const TagInput: React.FC<{
  tags: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  syncActive?: boolean;
}> = ({
  tags,
  draft,
  onDraftChange,
  onTagsChange,
  disabled,
  placeholder,
  syncActive,
}) => {
  const commitDraft = useCallback(() => {
    const parts = draft
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = mergeTags(tags, parts);
    onTagsChange(next);
    onDraftChange("");
  }, [draft, onDraftChange, onTagsChange, tags]);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
        syncActive ? "border-gray-900/40 bg-gray-50" : "border-gray-200 bg-white"
      } ${disabled ? "opacity-60" : ""}`}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700"
              onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commitDraft();
          }
          if (event.key === "Backspace" && draft.length === 0 && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => commitDraft()}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (!text) return;
          event.preventDefault();
          const parts = text.split(",").map((tag) => tag.trim()).filter(Boolean);
          const next = mergeTags(tags, parts);
          onTagsChange(next);
        }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
        disabled={disabled}
      />
    </div>
  );
};

const LibraryPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [autoQueueAnalysis] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadCollectionPickerOpen, setUploadCollectionPickerOpen] = useState(false);
  const [uploadCollectionSearch, setUploadCollectionSearch] = useState("");
  const [uploadCollectionIds, setUploadCollectionIds] = useState<Id<"assetCollections">[]>([]);
  const [isCreatingUploadCollection, setIsCreatingUploadCollection] = useState(false);
  const [uploadCollectionTitleOverrides, setUploadCollectionTitleOverrides] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"references" | "collections">("references");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Id<"assets">[]>([]);
  const [isAddToCollectionOpen, setIsAddToCollectionOpen] = useState(false);
  const [collectionPickerQuery, setCollectionPickerQuery] = useState("");
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [pickedCollectionId, setPickedCollectionId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [masonryColumns, setMasonryColumns] = useState<number>(4);
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    return typeof window !== "undefined" ? window.innerWidth : 1280;
  });
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [syncShared, setSyncShared] = useState(true);
  const [sharedMeta, setSharedMeta] = useState({
    tags: [] as string[],
    description: "",
    externalLink: "",
    author: "",
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isBackfillingPreviews, setIsBackfillingPreviews] = useState(false);
  const stagedItemsRef = useRef<StagedItem[]>([]);
  const [sharedTagDraft, setSharedTagDraft] = useState("");
  const [itemTagDrafts, setItemTagDrafts] = useState<Record<string, string>>({});
  const [uploadBatchTotal, setUploadBatchTotal] = useState(0);
  const [hoverPreview, setHoverPreview] = useState<{
    stageId?: string;
    url: string;
    type: "image" | "video" | "file";
    title: string;
    aspectRatio: number;
  } | null>(null);
  const dragDepthRef = useRef(0);
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const hoveredStageIdRef = useRef<string | null>(null);
  const hoverPreviewElRef = useRef<HTMLDivElement | null>(null);
  const hoverClientPosRef = useRef({ x: -9999, y: -9999 });
  const isDraggingRef = useRef(false);
  const isBackfillingPreviewsRef = useRef(false);
  const attemptedPreviewBackfillIdsRef = useRef<Set<string>>(new Set());

  const createAsset = useMutation(api.assets.create);
  const patchDerived = useMutation(api.assets.patchDerived);
  const updateMetadata = useMutation(api.assets.updateMetadata);
  const enqueueJob = useMutation(api.assetJobs.enqueue);
  const deleteAsset = useMutation(api.assets.deleteAsset);
  const collections = useQuery(api.collections.list, {});
  const createCollection = useMutation(api.collections.create);
  const addAssetsToCollection = useMutation(api.collections.addAssets);

  const assets = useQuery(api.assets.getUserLibrary, {});

  const missingPreviewAssets = useMemo(() => {
    if (!assets) return [];
    return assets.filter((asset: any) => {
      if (asset.type !== "image" && asset.type !== "video") return false;
      return !getAssetVariantUrl(asset, "preview") && !getAssetVariantUrl(asset, "thumb");
    });
  }, [assets]);

  const uploadCollections = useMemo(() => {
    return (collections ?? []) as any[];
  }, [collections]);

  const filteredUploadCollections = useMemo(() => {
    const q = uploadCollectionSearch.trim().toLowerCase();
    if (!q) return uploadCollections;
    return uploadCollections.filter((c: any) => String(c?.title ?? "").toLowerCase().includes(q));
  }, [uploadCollections, uploadCollectionSearch]);

  const uploadCreateCollectionTitle = useMemo(() => {
    return normalizeCollectionTitleDisplay(uploadCollectionSearch);
  }, [uploadCollectionSearch]);

  const uploadCreateCollectionKey = useMemo(() => {
    return normalizeCollectionTitleKey(uploadCreateCollectionTitle);
  }, [uploadCreateCollectionTitle]);

  const uploadCreateCollectionExists = useMemo(() => {
    if (!uploadCreateCollectionKey) return false;
    return (uploadCollections ?? []).some(
      (c: any) => normalizeCollectionTitleKey(String(c?.title ?? "")) === uploadCreateCollectionKey,
    );
  }, [uploadCollections, uploadCreateCollectionKey]);

  const canCreateUploadCollectionFromSearch = Boolean(
    uploadCreateCollectionTitle &&
      normalizeCollectionTitleKey(uploadCreateCollectionTitle).length >= 2 &&
      !uploadCreateCollectionExists,
  );

  useEffect(() => {
    // Initialize from localStorage (if present), otherwise match current responsive defaults.
    try {
      const raw = window.localStorage.getItem("library_masonry_columns");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= 1 && n <= 8) {
        setMasonryColumns(Math.round(n));
        return;
      }
    } catch {
      // ignore
    }
    const w = typeof window !== "undefined" ? window.innerWidth : 1280;
    if (w < 640) setMasonryColumns(1);
    else if (w < 1024) setMasonryColumns(2);
    else if (w < 1280) setMasonryColumns(3);
    else setMasonryColumns(4);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("library_masonry_columns", String(masonryColumns));
    } catch {
      // ignore
    }
  }, [masonryColumns]);

  const effectiveMasonryColumns = useMemo(() => {
    if (viewportWidth < 640) return 1;
    if (viewportWidth < 1024) return 2;
    return masonryColumns;
  }, [masonryColumns, viewportWidth]);

  const isMasonryLockedToDevice = viewportWidth < 1024;

  useEffect(() => {
    if (activeTab !== "references") {
      setSelectionMode(false);
      setSelectedAssetIds([]);
      setIsAddToCollectionOpen(false);
      setIsDeleteConfirmOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!selectionMode) {
      setSelectedAssetIds([]);
      setIsAddToCollectionOpen(false);
      setIsDeleteConfirmOpen(false);
    }
  }, [selectionMode]);

  const setUploadProgress = useCallback((id: string, progress: number) => {
    setUploadItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, progress } : item
      )
    );
  }, []);

  const setUploadStatus = useCallback((id: string, status: UploadItem["status"], error?: string) => {
    setUploadItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, error } : item
      )
    );
  }, []);

  const stageFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;
      const newItems = fileArray.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: getObjectUrl(file),
        title: file.name,
        tags: syncShared ? sharedMeta.tags : [],
        description: syncShared ? sharedMeta.description : "",
        externalLink: syncShared ? sharedMeta.externalLink : "",
        author: syncShared ? sharedMeta.author : "",
      }));
      setStagedItems((prev) => [...prev, ...newItems]);
      setSelectedStageId((current) => current ?? newItems[0]?.id ?? null);
      newItems.forEach((item) => {
        const type = getAssetType(item.file);
        const resolver =
          type === "image"
            ? getImageAspectRatio
            : type === "video"
              ? getVideoAspectRatio
              : null;
        if (!resolver) return;
        resolver(item.file).then((ratio) => {
          setStagedItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id ? { ...entry, aspectRatio: ratio } : entry
            )
          );
        });
      });
    },
    [sharedMeta, syncShared]
  );

  const handleUploadAll = useCallback(async () => {
    if (stagedItems.length === 0) return;
    if (isUploading) return;
    setIsUploading(true);
    setUploadItems([]);
    setUploadBatchTotal(stagedItems.length);
    let hadErrors = false;
    const uploadedAssetIds: Id<"assets">[] = [];
    const targetCollectionIds = uploadCollectionIds.slice();
    const succeededStageIds: string[] = [];
    for (const item of stagedItems) {
      const id = crypto.randomUUID();
      setUploadItems((prev) => [
        {
          id,
          file: item.file,
          displayTitle: item.title?.trim() || item.file.name,
          progress: 0,
          status: "uploading",
        },
        ...prev,
      ]);
      try {
        const type = getAssetType(item.file);
        let uploadFile = item.file;
        let imagePreviewDataUrl: string | undefined;
        let imagePreviewUploadUrl: string | undefined;
        let imagePreviewMeta:
          | { dataUrl: string; width: number; height: number; size: number; outputType: string }
          | undefined;
        let videoPreviewDataUrl: string | undefined;
        let videoPreviewBlob: Blob | undefined;
        let videoPreviewMeta:
          | { width?: number; height?: number; size?: number; outputType?: string }
          | undefined;
        let videoPreviewUploadUrl: string | undefined;

        if (type === "image") {
          if (isCompressibleImage(item.file)) {
            try {
              const compressed = await compressImageFile(item.file, {
                maxDimension: 3072,
                quality: 0.5,
              });
              uploadFile = compressed.file;
            } catch (compressionError) {
              console.warn("Library image compression failed, using original file", compressionError);
            }
          }

          try {
            imagePreviewMeta = await createImagePreviewDataUrl(uploadFile, {
              maxDimension: 512,
              quality: 0.58,
            });
            imagePreviewDataUrl = imagePreviewMeta.dataUrl;
          } catch (previewError) {
            console.warn("Library image preview generation failed", previewError);
          }
        }

        if (type === "video") {
          try {
            const preview = await createVideoPreviewCapture(item.file);
            videoPreviewDataUrl = preview?.dataUrl;
            videoPreviewBlob = preview?.blob;
            if (preview?.blob) {
              videoPreviewMeta = {
                width: preview.width,
                height: preview.height,
                size: preview.blob.size,
                outputType: preview.blob.type || "image/jpeg",
              };
            }
          } catch (previewError) {
            console.warn("Library video preview generation failed", previewError);
          }
        }

        const result = await uploadFileMultipart(uploadFile, {
          context: "library",
          autoSaveToLibrary: true,
          onProgress: (progress) => setUploadProgress(id, progress),
        });

        setUploadStatus(id, "processing");
        if (type === "image" && imagePreviewDataUrl) {
          try {
            const baseName = item.file.name.replace(/\.[^/.]+$/, "") || "image";
            const previewFile = dataUrlToFile(imagePreviewDataUrl, `${baseName}-preview.webp`);
            if (previewFile) {
              const previewResult = await uploadFileMultipart(previewFile, {
                context: "library",
                autoSaveToLibrary: false,
                concurrency: 2,
              });
              if (previewResult.success && previewResult.url) {
                imagePreviewUploadUrl = previewResult.url;
              }
            }
          } catch (previewUploadError) {
            console.warn("Library preview upload failed; proceeding without variant", previewUploadError);
          }
        }
        if (type === "video" && videoPreviewBlob) {
          try {
            const baseName = item.file.name.replace(/\.[^/.]+$/, "") || "video";
            const previewFile = new File([videoPreviewBlob], `${baseName}-preview.jpg`, {
              type: "image/jpeg",
            });
            const previewResult = await uploadFileMultipart(previewFile, {
              context: "library",
              autoSaveToLibrary: false,
              concurrency: 2,
            });
            if (previewResult.success && previewResult.url) {
              videoPreviewUploadUrl = previewResult.url;
            }
          } catch (previewUploadError) {
            console.warn("Library video preview upload failed; proceeding without variant", previewUploadError);
          }
        }

        const assetId = (await createAsset({
          title: item.title || item.file.name,
          fileUrl: result.url,
          fileName: item.file.name,
          type,
          mimeType: uploadFile.type || item.file.type || undefined,
          fileSize: uploadFile.size || item.file.size,
          source: "upload",
        })) as Id<"assets">;

        if (type === "image") {
          try {
            const metadata = await extractImageMetadata(uploadFile);
            const variants: Record<string, any> = {
              original: {
                url: result.url,
                width: metadata.width,
                height: metadata.height,
                byteSize: uploadFile.size || item.file.size,
                mimeType: uploadFile.type || item.file.type || undefined,
              },
            };
            if (imagePreviewUploadUrl) {
              const previewVariant = {
                url: imagePreviewUploadUrl,
                width: imagePreviewMeta?.width,
                height: imagePreviewMeta?.height,
                byteSize: imagePreviewMeta?.size,
                mimeType: imagePreviewMeta?.outputType || "image/webp",
              };
              variants.preview = previewVariant;
              variants.thumb = previewVariant;
            }
            await patchDerived({
              id: assetId,
              width: metadata.width,
              height: metadata.height,
              aspectRatio: metadata.aspectRatio,
              dominantColors: metadata.dominantColors,
              phash: metadata.phash,
              blurDataUrl: imagePreviewDataUrl,
              variants,
            });
          } catch (error) {
            console.warn("Image metadata extraction failed", error);
          }
        }

        if (type === "video") {
          try {
            const metadata = await extractVideoMetadata(item.file);
            const variants: Record<string, any> = {
              original: {
                url: result.url,
                width: metadata.width,
                height: metadata.height,
                byteSize: uploadFile.size || item.file.size,
                mimeType: uploadFile.type || item.file.type || undefined,
              },
            };
            if (videoPreviewUploadUrl) {
              const previewVariant = {
                url: videoPreviewUploadUrl,
                width: videoPreviewMeta?.width,
                height: videoPreviewMeta?.height,
                byteSize: videoPreviewMeta?.size,
                mimeType: videoPreviewMeta?.outputType || "image/jpeg",
              };
              variants.preview = previewVariant;
              variants.thumb = previewVariant;
            }
            await patchDerived({
              id: assetId,
              width: metadata.width,
              height: metadata.height,
              durationSeconds: metadata.durationSeconds,
              aspectRatio: metadata.aspectRatio,
              blurDataUrl: videoPreviewDataUrl,
              variants,
            });
          } catch (error) {
            console.warn("Video metadata extraction failed", error);
          }
        }

        const tokens = item.tags;
        const description = item.description.trim();
        const externalLink = item.externalLink.trim();
        const author = item.author.trim();

        if (tokens.length > 0 || description || externalLink || author) {
          await updateMetadata({
            id: assetId,
            tokens: tokens.length > 0 ? tokens : undefined,
            description: description || undefined,
            externalLink: externalLink || undefined,
            author: author || undefined,
          });
        }

        if (autoQueueAnalysis) {
          await enqueueJob({
            assetId,
            requestedFeatures: {
              ocr: true,
              caption: true,
              tags: true,
              embedding: true,
              colors: true,
              exif: true,
            },
          });
        }

        uploadedAssetIds.push(assetId);
        succeededStageIds.push(item.id);
        setUploadStatus(id, "done");
        toast.success(`${item.file.name} uploaded`);
      } catch (error) {
        console.error(error);
        hadErrors = true;
        setUploadStatus(id, "error", (error as Error).message);
        toast.error(`Upload failed: ${item.file.name}`);
      }
    }

    if (targetCollectionIds.length > 0 && uploadedAssetIds.length > 0) {
      try {
        await Promise.all(
          targetCollectionIds.map((collectionId) =>
            addAssetsToCollection({ collectionId, assetIds: uploadedAssetIds })
          )
        );
        toast.success("Added to collections");
      } catch (error) {
        console.error("Failed to add uploaded assets to collections", error);
        hadErrors = true;
        toast.error("Failed to add references to collections");
      }
    }

    setIsUploading(false);
    if (hadErrors) {
      // Keep failed items staged so the user can retry; clean up successful previews to reduce memory usage.
      const succeededSet = new Set(succeededStageIds);
      stagedItems
        .filter((si) => succeededSet.has(si.id))
        .forEach((si) => releaseObjectUrl(si.previewUrl));
      setStagedItems((prev) => prev.filter((si) => !succeededSet.has(si.id)));
      setSelectedStageId((current) => {
        if (current && !succeededSet.has(current)) return current;
        const next = stagedItems.find((si) => !succeededSet.has(si.id));
        return next?.id ?? null;
      });
    } else {
      setStagedItems((prev) => {
        prev.forEach((item) => releaseObjectUrl(item.previewUrl));
        return [];
      });
      setSelectedStageId(null);
    }

    // Return to the library immediately on success; keep the modal open if there were errors.
    if (!hadErrors) {
      window.setTimeout(() => {
        setIsUploadModalOpen(false);
        setUploadBatchTotal(0);
        setUploadItems([]);
      }, 350);
    }
  }, [
    autoQueueAnalysis,
    createAsset,
    enqueueJob,
    isUploading,
    patchDerived,
    setUploadProgress,
    setUploadStatus,
    stagedItems,
    uploadCollectionIds,
    addAssetsToCollection,
    syncShared,
    updateMetadata,
    sharedMeta,
  ]);

  const backfillMissingPreviews = useCallback(
    async (targets: any[], opts?: { silent?: boolean }) => {
      if (isBackfillingPreviewsRef.current || targets.length === 0) return;
      isBackfillingPreviewsRef.current = true;
      setIsBackfillingPreviews(true);
      try {
        for (const asset of targets) {
          const assetId = String(asset?._id ?? "");
          if (assetId) {
            attemptedPreviewBackfillIdsRef.current.add(assetId);
          }
        }

        let successCount = 0;
        let successImageCount = 0;
        let successVideoCount = 0;
        let failedCount = 0;

        for (const asset of targets) {
          try {
            const sourceUrl = typeof asset?.fileUrl === "string" ? asset.fileUrl : "";
            if (!sourceUrl) {
              throw new Error("Missing source URL");
            }
            const assetType = String(asset?.type || "").toLowerCase();
            const existingVariants =
              asset?.variants && typeof asset.variants === "object" ? { ...asset.variants } : {};
            const originalVariant = existingVariants.original ?? {
              url: sourceUrl,
              width: asset?.width,
              height: asset?.height,
              byteSize: asset?.fileSize,
              mimeType: asset?.mimeType,
            };

            const nextVariants: Record<string, any> = {
              ...existingVariants,
              original: originalVariant,
            };

            if (assetType === "image") {
              const response = await fetch(sourceUrl, { cache: "force-cache" });
              if (!response.ok) {
                throw new Error(`Source download failed (${response.status})`);
              }
              const blob = await response.blob();
              const blobType = (blob.type || asset?.mimeType || "").toLowerCase();
              if (!blobType.startsWith("image/")) {
                throw new Error(`Unsupported mime type "${blobType || "unknown"}"`);
              }

              const baseName = toSafeBaseName(String(asset?.fileName || asset?.title || "image"));
              const sourceFile = new File([blob], `${baseName}.${extensionFromMime(blobType)}`, {
                type: blobType || "image/jpeg",
                lastModified: Date.now(),
              });

              const previewMeta = await createImagePreviewDataUrl(sourceFile, {
                maxDimension: 512,
                quality: 0.58,
              });

              const previewFile = dataUrlToFile(previewMeta.dataUrl, `${baseName}-preview.webp`);
              if (!previewFile) {
                throw new Error("Failed to encode preview file");
              }
              const uploadedPreview = await uploadFileMultipart(previewFile, {
                context: "library",
                autoSaveToLibrary: false,
                concurrency: 2,
              });
              if (!uploadedPreview.success || !uploadedPreview.url) {
                throw new Error("Preview upload failed");
              }

              const previewVariant = {
                url: uploadedPreview.url,
                width: previewMeta.width,
                height: previewMeta.height,
                byteSize: previewMeta.size,
                mimeType: previewMeta.outputType || "image/webp",
              };
              nextVariants.preview = previewVariant;
              nextVariants.thumb = previewVariant;

              await patchDerived({
                id: asset._id,
                blurDataUrl: previewMeta.dataUrl,
                variants: nextVariants,
              });

              successCount += 1;
              successImageCount += 1;
              continue;
            }

            if (assetType === "video") {
              const baseName = toSafeBaseName(String(asset?.fileName || asset?.title || "video"));
              let previewMeta = await captureVideoPreviewFromSource(sourceUrl);

              // Fallback when direct URL capture fails (e.g. restrictive CORS).
              if (!previewMeta.dataUrl || !previewMeta.blob) {
                const response = await fetch(sourceUrl, { cache: "force-cache" });
                if (!response.ok) {
                  throw new Error(`Source download failed (${response.status})`);
                }
                const blob = await response.blob();
                const blobType = (blob.type || asset?.mimeType || "").toLowerCase();
                if (!blobType.startsWith("video/")) {
                  throw new Error(`Unsupported mime type "${blobType || "unknown"}"`);
                }

                const sourceFile = new File([blob], `${baseName}.mp4`, {
                  type: blobType || "video/mp4",
                  lastModified: Date.now(),
                });
                previewMeta = await createVideoPreviewCapture(sourceFile);
              }

              if (!previewMeta.dataUrl || !previewMeta.blob) {
                throw new Error("Unable to extract video preview frame");
              }

              const previewFile = new File([previewMeta.blob], `${baseName}-preview.jpg`, {
                type: previewMeta.blob.type || "image/jpeg",
                lastModified: Date.now(),
              });
              const uploadedPreview = await uploadFileMultipart(previewFile, {
                context: "library",
                autoSaveToLibrary: false,
                concurrency: 2,
              });
              if (!uploadedPreview.success || !uploadedPreview.url) {
                throw new Error("Preview upload failed");
              }

              const previewVariant = {
                url: uploadedPreview.url,
                width: previewMeta.width,
                height: previewMeta.height,
                byteSize: previewMeta.blob.size,
                mimeType: previewMeta.blob.type || "image/jpeg",
              };
              nextVariants.preview = previewVariant;
              nextVariants.thumb = previewVariant;

              await patchDerived({
                id: asset._id,
                blurDataUrl: previewMeta.dataUrl,
                variants: nextVariants,
              });

              successCount += 1;
              successVideoCount += 1;
              continue;
            }

            throw new Error(`Unsupported asset type "${assetType || "unknown"}"`);
          } catch (error) {
            failedCount += 1;
            console.warn("Failed to backfill preview variant", asset?._id, asset?.type, error);
          }
        }

        if (!opts?.silent && successCount > 0) {
          const successSummary =
            successImageCount > 0 && successVideoCount > 0
              ? `${successCount} assets (${successImageCount} images, ${successVideoCount} videos)`
              : successImageCount > 0
                ? `${successImageCount} image${successImageCount === 1 ? "" : "s"}`
                : `${successVideoCount} video${successVideoCount === 1 ? "" : "s"}`;
          toast.success(
            `Generated preview variants for ${successSummary}.`
          );
        }
        if (!opts?.silent && failedCount > 0) {
          toast.error(
            `Failed on ${failedCount} asset${failedCount === 1 ? "" : "s"}. Check browser console for details.`
          );
        }
      } finally {
        isBackfillingPreviewsRef.current = false;
        setIsBackfillingPreviews(false);
      }
    },
    [patchDerived]
  );

  useEffect(() => {
    if (!assets || isBackfillingPreviews) return;
    const pendingTargets = (missingPreviewAssets as any[]).filter((asset) => {
      const assetId = String(asset?._id ?? "");
      if (!assetId) return false;
      return !attemptedPreviewBackfillIdsRef.current.has(assetId);
    });
    if (pendingTargets.length === 0) return;
    void backfillMissingPreviews(pendingTargets, { silent: true });
  }, [assets, backfillMissingPreviews, isBackfillingPreviews, missingPreviewAssets]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        stageFiles(event.dataTransfer.files);
      }
    },
    [stageFiles]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        stageFiles(event.target.files);
        event.target.value = "";
      }
    },
    [stageFiles]
  );

  useEffect(() => {
    if (!syncShared) return;
    setStagedItems((prev) =>
      prev.map((item) => ({
        ...item,
        tags: sharedMeta.tags,
        description: sharedMeta.description,
        externalLink: sharedMeta.externalLink,
        author: sharedMeta.author,
      }))
    );
  }, [sharedMeta, syncShared]);

  useEffect(() => {
    stagedItemsRef.current = stagedItems;
  }, [stagedItems]);

  useEffect(() => {
    return () => {
      stagedItemsRef.current.forEach((item) => releaseObjectUrl(item.previewUrl));
      if (hoverClearTimeoutRef.current) {
        window.clearTimeout(hoverClearTimeoutRef.current);
      }
      if (hoverRafRef.current) {
        cancelAnimationFrame(hoverRafRef.current);
      }
    };
  }, []);

  const selectedItem = stagedItems.find((item) => item.id === selectedStageId) ?? stagedItems[0];

  useEffect(() => {
    if (!selectedItem && stagedItems.length > 0) {
      setSelectedStageId(stagedItems[0].id);
    }
  }, [selectedItem, stagedItems]);

  const suggestedTags = useMemo(() => {
    const freq = new Map<string, { label: string; count: number }>();
    (assets ?? []).forEach((asset) => {
      asset.tokens?.forEach((token) => {
        const label = normalizeTag(token);
        if (!label) return;
        const key = label.toLowerCase();
        const entry = freq.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          freq.set(key, { label, count: 1 });
        }
      });
    });
    return Array.from(freq.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 24)
      .map((entry) => entry.label);
  }, [assets]);

  const updateStagedItem = useCallback((id: string, patch: Partial<StagedItem>) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const updateSyncField = useCallback(
    (field: "description" | "externalLink" | "author", value: string) => {
      if (syncShared) {
        setSharedMeta((prev) => ({ ...prev, [field]: value }));
        return;
      }
      if (!selectedItem) return;
      updateStagedItem(selectedItem.id, { [field]: value } as Partial<StagedItem>);
    },
    [selectedItem, syncShared, updateStagedItem]
  );

  const updateTagDraft = useCallback(
    (value: string) => {
      if (syncShared) {
        setSharedTagDraft(value);
        return;
      }
      if (!selectedItem) return;
      setItemTagDrafts((prev) => ({ ...prev, [selectedItem.id]: value }));
    },
    [selectedItem, syncShared]
  );

  const updateTags = useCallback(
    (nextTags: string[]) => {
      if (syncShared) {
        setSharedMeta((prev) => ({ ...prev, tags: nextTags }));
        return;
      }
      if (!selectedItem) return;
      updateStagedItem(selectedItem.id, { tags: nextTags });
    },
    [selectedItem, syncShared, updateStagedItem]
  );

  const removeStagedItem = useCallback((id: string) => {
    setStagedItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed) releaseObjectUrl(removed.previewUrl);
      if (selectedStageId === id) {
        setSelectedStageId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [selectedStageId]);

  const handleAddSuggestedTag = useCallback(
    (tag: string) => {
      const current = syncShared ? sharedMeta.tags : selectedItem?.tags ?? [];
      const next = mergeTags(current, [tag]);
      updateTags(next);
    },
    [selectedItem, sharedMeta.tags, syncShared, updateTags]
  );

  const currentTags = syncShared ? sharedMeta.tags : selectedItem?.tags ?? [];
  const currentDraft = syncShared
    ? sharedTagDraft
    : selectedItem
      ? itemTagDrafts[selectedItem.id] ?? ""
      : "";
  const tagQuery = currentDraft.trim().toLowerCase();
  const existingTags = new Set(currentTags.map((tag) => tag.toLowerCase()));
  const filteredSuggestions = suggestedTags
    .filter((tag) => (tagQuery ? tag.includes(tagQuery) : true))
    .filter((tag) => !existingTags.has(tag))
    .slice(0, 8);

  const activeUploadItem = useMemo(() => {
    return (
      uploadItems.find((item) => item.status === "uploading" || item.status === "processing") ??
      null
    );
  }, [uploadItems]);

  const uploadErrorItems = useMemo(() => {
    return uploadItems.filter((item) => item.status === "error");
  }, [uploadItems]);

  const uploadCompletedCount = useMemo(() => {
    return uploadItems.filter((item) => item.status === "done" || item.status === "error").length;
  }, [uploadItems]);

  const overallProgress = useMemo(() => {
    const total = uploadBatchTotal > 0 ? uploadBatchTotal : uploadItems.length;
    if (total <= 0) return 0;

    const currentFraction =
      activeUploadItem?.status === "processing"
        ? 1
        : activeUploadItem?.status === "uploading"
          ? Math.max(0, Math.min(1, activeUploadItem.progress / 100))
          : 0;

    const doneLike = Math.min(uploadCompletedCount, total);
    const progress = ((doneLike + currentFraction) / total) * 100;
    return Math.max(0, Math.min(100, progress));
  }, [activeUploadItem, uploadBatchTotal, uploadCompletedCount, uploadItems.length]);

  const uploadStatusLine = useMemo(() => {
    if (activeUploadItem) return activeUploadItem.displayTitle || activeUploadItem.file.name;
    if (isUploading) return "Preparing next upload…";
    if (uploadItems.length > 0 && uploadCompletedCount === uploadItems.length) return "Upload complete.";
    return "Ready when you are.";
  }, [activeUploadItem, isUploading, uploadCompletedCount, uploadItems.length]);

  const positionHoverPreview = useCallback((clientX: number, clientY: number) => {
    const el = hoverPreviewElRef.current;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const offset = 16;

    hoverClientPosRef.current = { x: clientX, y: clientY };

    // Best-effort clamp to viewport. If element isn't mounted yet, use a safe guess.
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 260;

    const maxX = Math.max(8, vw - w - 8);
    const maxY = Math.max(8, vh - h - 8);

    const nextX = Math.min(maxX, Math.max(8, clientX + offset));
    const nextY = Math.min(maxY, Math.max(8, clientY + offset));

    if (!el) return;
    el.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
  }, []);

  const scheduleHoverMove = useCallback(
    (clientX: number, clientY: number) => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = requestAnimationFrame(() => {
        positionHoverPreview(clientX, clientY);
      });
    },
    [positionHoverPreview]
  );
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isUploadModalOpen) return;
    // Prevent the browser from navigating to a dragged file dropped outside our drop zone.
    const prevent = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, [isUploadModalOpen]);

  useEffect(() => {
    if (!isUploadModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUploadModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isUploadModalOpen]);

  useEffect(() => {
    if (!isUploadModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isUploadModalOpen]);

  useEffect(() => {
    if (isUploadModalOpen) return;
    setHoverPreview(null);
    setIsDragging(false);
	    setUploadCollectionPickerOpen(false);
	    setUploadCollectionSearch("");
	    setUploadCollectionIds([]);
	    setIsCreatingUploadCollection(false);
	    setUploadCollectionTitleOverrides({});
	    dragDepthRef.current = 0;
	    isDraggingRef.current = false;
    hoveredStageIdRef.current = null;
    if (hoverClearTimeoutRef.current) {
      window.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    if (hoverRafRef.current) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    hoverClientPosRef.current = { x: -9999, y: -9999 };
  }, [isUploadModalOpen]);

  useEffect(() => {
    // When the preview content mounts/unmounts, immediately snap it to the last cursor pos.
    if (!isUploadModalOpen) return;
    if (!hoverPreview) return;
    positionHoverPreview(hoverClientPosRef.current.x, hoverClientPosRef.current.y);
  }, [hoverPreview, isUploadModalOpen, positionHoverPreview]);

  const overlayInitial = shouldReduceMotion ? undefined : ({ opacity: 0 } as const);
  const overlayAnimate = shouldReduceMotion ? undefined : ({ opacity: 1 } as const);
  const overlayExit = shouldReduceMotion ? undefined : ({ opacity: 0 } as const);

  const panelInitial = shouldReduceMotion
    ? undefined
    : ({ opacity: 0, y: 18, scale: 0.985 } as const);
  const panelAnimate = shouldReduceMotion
    ? undefined
    : ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring" as const, stiffness: 320, damping: 28 },
      } as const);
  const panelExit = shouldReduceMotion
    ? undefined
    : ({ opacity: 0, y: 12, scale: 0.985, transition: { duration: 0.16 } } as const);

  const contentVariants = shouldReduceMotion
    ? undefined
    : ({
        hidden: {},
        show: {
          transition: { staggerChildren: 0.04, delayChildren: 0.04 },
        },
      } as const);

  const itemVariants = shouldReduceMotion
    ? undefined
    : ({
        hidden: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
        },
      } as const);

  const animatedItemProps = shouldReduceMotion
    ? {}
    : { variants: itemVariants, initial: "hidden" as const, animate: "show" as const };
  const animatedContentProps = shouldReduceMotion
    ? {}
    : { variants: contentVariants, initial: "hidden" as const, animate: "show" as const };

  const uploadModalPortal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {isUploadModalOpen && (
              <motion.div
                className="fixed inset-0 z-[2147483646] flex items-center justify-center px-4 py-6"
                initial={overlayInitial}
                animate={overlayAnimate}
                exit={overlayExit}
                // Prevent dropping files outside the drop zone from navigating away.
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                }}
              >
                <div
                  className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                  onMouseDown={() => setIsUploadModalOpen(false)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => event.preventDefault()}
                />

                <motion.div
                  className="relative w-[min(96vw,1120px)] max-h-[90vh] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
                  initial={panelInitial}
                  animate={panelAnimate}
                  exit={panelExit}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Upload references"
                >
                  <motion.div
                    className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white/80 px-6 py-5 backdrop-blur"
                    {...animatedItemProps}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Upload references
                      </p>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Stage, tag, and confirm.
                      </h2>
                      <p className="text-sm text-gray-600">
                        Drag files in, edit metadata, then upload to your library.
                      </p>
                    </div>
                    <button
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
                      onClick={() => setIsUploadModalOpen(false)}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileInput}
                  />

                  <motion.div
                    className="relative max-h-[calc(90vh-84px)] overflow-y-auto px-6 py-6"
                    {...animatedContentProps}
                  >
                    <motion.div
                      variants={itemVariants}
                      className="grid gap-6 lg:grid-cols-[1.45fr,0.95fr]"
                    >
                      <div className="space-y-6">
                        <div
                          className={`relative rounded-3xl border border-dashed p-6 transition ${
                            isDragging
                              ? "border-gray-900 bg-gray-50"
                              : "border-gray-300 bg-white"
                          }`}
                          onDragEnter={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            dragDepthRef.current += 1;
                            if (!isDraggingRef.current) {
                              isDraggingRef.current = true;
                              setIsDragging(true);
                            }
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            // Do not set state here; dragover fires continuously and causes jank.
                          }}
                          onDragLeave={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                            if (dragDepthRef.current === 0) {
                              isDraggingRef.current = false;
                              setIsDragging(false);
                            }
                          }}
                          onDrop={(event) => {
                            handleDrop(event);
                          }}
                        >
                          <div className="flex flex-col items-start gap-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-900">
                                <UploadCloud className="h-5 w-5" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900">
                                  Stage references
                                </h3>
                                <p className="text-sm text-gray-600">
                                  Drag and drop files here. Preview everything before uploading.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                                <ImageIcon className="h-3 w-3" />
                                Images
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                                <VideoIcon className="h-3 w-3" />
                                Videos
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                                <FileIcon className="h-3 w-3" />
                                Files
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                onClick={() => fileInputRef.current?.click()}
                                className="gap-2"
                              >
                                <UploadCloud className="h-4 w-4" />
                                Choose files
                              </Button>
                              {stagedItems.length > 0 && (
                                <Button
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => {
                                    stagedItems.forEach((item) =>
                                      releaseObjectUrl(item.previewUrl)
                                    );
                                    setStagedItems([]);
                                    setSelectedStageId(null);
                                  }}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-gray-200 bg-white p-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">
                                Staged preview
                              </h3>
                              <p className="text-sm text-gray-600">
                                {stagedItems.length > 0
                                  ? `${stagedItems.length} files ready`
                                  : "Stage files to preview before upload."}
                              </p>
                            </div>
                          </div>

                          {stagedItems.length > 0 ? (
                            <div className="mt-4 flex flex-wrap gap-3">
                              {stagedItems.map((item) => {
                                const ratio =
                                  item.aspectRatio && Number.isFinite(item.aspectRatio)
                                    ? item.aspectRatio
                                    : 1;
                                const type = getAssetType(item.file);
                                return (
                                  <motion.button
                                    key={item.id}
                                    className={`group relative overflow-hidden rounded-2xl border ${
                                      item.id === selectedStageId
                                        ? "border-gray-900"
                                        : "border-gray-200"
                                    }`}
                                    style={{ width: 120, aspectRatio: `${ratio}` }}
                                    onClick={() => setSelectedStageId(item.id)}
                                    onPointerEnter={(event) => {
                                      if (hoverClearTimeoutRef.current) {
                                        window.clearTimeout(hoverClearTimeoutRef.current);
                                        hoverClearTimeoutRef.current = null;
                                      }
                                      hoveredStageIdRef.current = item.id;
                                      positionHoverPreview(event.clientX, event.clientY);
                                      setHoverPreview({
                                        stageId: item.id,
                                        url: item.previewUrl,
                                        type,
                                        title: item.title,
                                        aspectRatio: ratio,
                                      });
                                    }}
                                    onPointerMove={(event) => {
                                      if (hoveredStageIdRef.current !== item.id) return;
                                      scheduleHoverMove(event.clientX, event.clientY);
                                    }}
                                    onPointerLeave={() => {
                                      // Delay helps avoid flicker when crossing between items quickly.
                                      if (hoverClearTimeoutRef.current) {
                                        window.clearTimeout(hoverClearTimeoutRef.current);
                                      }
                                      hoverClearTimeoutRef.current = window.setTimeout(() => {
                                        if (hoveredStageIdRef.current === item.id) {
                                          hoveredStageIdRef.current = null;
                                          setHoverPreview(null);
                                        }
                                      }, 70);
                                    }}
                                    onPointerCancel={() => {
                                      hoveredStageIdRef.current = null;
                                      setHoverPreview(null);
                                    }}
                                    whileHover={
                                      shouldReduceMotion
                                        ? undefined
                                        : { scale: 1.03, transition: { duration: 0.12 } }
                                    }
                                  >
                                    {type === "image" ? (
                                      <img
                                        src={item.previewUrl}
                                        alt={item.title}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : type === "video" ? (
                                      <video
                                        className="h-full w-full object-cover"
                                        src={item.previewUrl}
                                        muted
                                        preload="metadata"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-gray-100">
                                        <FileIcon className="h-5 w-5 text-gray-400" />
                                      </div>
                                    )}
                                    <span
                                      className="absolute right-2 top-2 hidden rounded-full bg-white/90 p-1 text-gray-600 group-hover:block"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        removeStagedItem(item.id);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                              No staged files yet. Add some files to preview and edit metadata.
                            </div>
                          )}
                        </div>
                      </div>

	                      <div className="space-y-4">
	                        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
	                          <div className="flex items-start justify-between gap-3">
	                            <div>
	                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
	                                Destination
	                              </p>
	                              <h3 className="mt-1 text-base font-semibold text-gray-900">
	                                Add to collections
	                              </h3>
	                              <p className="mt-1 text-xs text-gray-600">
	                                Applies to every staged reference you upload.
	                              </p>
	                            </div>
		                          </div>

		                          <div className="mt-4 space-y-3">
		                            <div className="space-y-2">
		                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
		                                Collections
		                              </p>
		                              <Popover
		                                open={uploadCollectionPickerOpen}
		                                onOpenChange={setUploadCollectionPickerOpen}
		                              >
		                                <PopoverTrigger asChild>
		                                  <button
		                                    type="button"
		                                    className="flex h-12 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm transition hover:bg-gray-50"
		                                  >
		                                    <span className="flex min-w-0 items-center gap-2">
		                                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900">
		                                        <Folder className="h-4 w-4" />
		                                      </span>
		                                      <span className="min-w-0 truncate font-semibold">
		                                        {uploadCollectionIds.length > 0
		                                          ? `${uploadCollectionIds.length} selected`
		                                          : "Choose collections"}
		                                      </span>
		                                    </span>
		                                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
		                                  </button>
		                                </PopoverTrigger>
		                                <PopoverContent
		                                  align="start"
		                                  sideOffset={10}
		                                  className="z-[2147483647] w-[min(92vw,var(--radix-popper-anchor-width,420px))] rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl"
		                                >
		                                  <div className="border-b border-gray-200 px-4 py-3">
		                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
		                                      Collections
		                                    </p>
		                                    <div className="relative mt-2">
		                                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
		                                      <Input
		                                        value={uploadCollectionSearch}
		                                        onChange={(e) => setUploadCollectionSearch(e.target.value)}
		                                        placeholder="Search collections..."
		                                        className="h-10 pl-9"
		                                      />
		                                    </div>

		                                    {canCreateUploadCollectionFromSearch && (
		                                      <Button
		                                        type="button"
		                                        className="mt-2 w-full gap-2 bg-black text-slate-50 hover:bg-black/90"
		                                        disabled={isCreatingUploadCollection}
		                                        onClick={async () => {
		                                          const title = uploadCreateCollectionTitle;
		                                          if (!title) return;
		                                          if (isCreatingUploadCollection) return;
		                                          setIsCreatingUploadCollection(true);
		                                          try {
		                                            const existing = (uploadCollections ?? []).find(
		                                              (c: any) =>
		                                                !c?.isShared &&
		                                                normalizeCollectionTitleKey(String(c?.title ?? "")) ===
		                                                  normalizeCollectionTitleKey(title),
		                                            );
		                                            if (existing?.id) {
		                                              const existingId = existing.id as Id<"assetCollections">;
		                                              setUploadCollectionIds((prev) =>
		                                                prev.includes(existingId) ? prev : [...prev, existingId],
		                                              );
		                                              setUploadCollectionSearch("");
		                                              toast.success("Collection already exists");
		                                              return;
		                                            }
		                                            const id = (await createCollection({ title })) as Id<"assetCollections">;
		                                            setUploadCollectionTitleOverrides((prev) => ({
		                                              ...prev,
		                                              [String(id)]: title,
		                                            }));
		                                            setUploadCollectionIds((prev) =>
		                                              prev.includes(id) ? prev : [...prev, id],
		                                            );
		                                            setUploadCollectionSearch("");
		                                            toast.success("Collection created");
		                                          } catch (err) {
		                                            console.error(err);
		                                            toast.error("Failed to create collection");
		                                          } finally {
		                                            setIsCreatingUploadCollection(false);
		                                          }
		                                        }}
		                                      >
		                                        <Plus className="h-4 w-4 text-current" />
		                                        Create "{uploadCreateCollectionTitle}"
		                                      </Button>
		                                    )}
		                                  </div>
		                                  <div className="max-h-72 overflow-auto p-2">
		                                    {!collections ? (
		                                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
		                                        Loading collections…
		                                      </div>
		                                    ) : filteredUploadCollections.length === 0 ? (
		                                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
		                                        No collections found.
		                                      </div>
		                                    ) : (
		                                      <div className="space-y-1">
		                                        {filteredUploadCollections.map((col: any) => {
		                                          const id = col.id as Id<"assetCollections">;
		                                          const canWrite = !col.isShared || col.sharedRole === "editor";
		                                          const selected = uploadCollectionIds.includes(id);
		                                          return (
		                                            <button
		                                              key={String(id)}
		                                              type="button"
		                                              disabled={!canWrite}
		                                              className={[
		                                                "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
		                                                selected
		                                                  ? "border-gray-900 bg-gray-900 text-slate-50"
		                                                  : "border-transparent hover:border-gray-200 hover:bg-gray-50 text-gray-900",
		                                                !canWrite ? "opacity-50 cursor-not-allowed hover:bg-white" : "",
		                                              ].join(" ")}
		                                              onClick={() => {
		                                                if (!canWrite) return;
		                                                setUploadCollectionIds((prev) => {
		                                                  if (prev.includes(id)) return prev.filter((x) => x !== id);
		                                                  return [...prev, id];
		                                                });
		                                              }}
		                                            >
		                                              <span
		                                                className={[
		                                                  "flex h-6 w-6 items-center justify-center rounded-lg border",
		                                                  selected
		                                                    ? "border-slate-50/60 bg-slate-50/10"
		                                                    : "border-gray-300 bg-white",
		                                                ].join(" ")}
		                                              >
		                                                {selected && <Check className="h-4 w-4 text-current" />}
		                                              </span>
		                                              <span className="min-w-0 flex-1">
		                                                <span className="block truncate text-sm font-semibold">
		                                                  {col.title}
		                                                </span>
		                                                <span
		                                                  className={[
		                                                    "mt-0.5 inline-flex items-center gap-2 text-[11px]",
		                                                    selected ? "text-slate-200" : "text-gray-500",
		                                                  ].join(" ")}
		                                                >
		                                                  <span>
		                                                    {col.itemCount ?? 0} item
		                                                    {(col.itemCount ?? 0) === 1 ? "" : "s"}
		                                                  </span>
		                                                  <span>·</span>
		                                                  <span>
		                                                    {col.isShared
		                                                      ? canWrite
		                                                        ? "Shared (editor)"
		                                                        : "Shared (viewer)"
		                                                      : "Owned"}
		                                                  </span>
		                                                </span>
		                                              </span>
		                                            </button>
		                                          );
		                                        })}
		                                      </div>
		                                    )}
		                                  </div>
		                                  <div className="border-t border-gray-200 px-4 py-3 text-[11px] text-gray-500">
		                                    Tip: shared collections can be used only if you have editor access.
		                                  </div>
		                                </PopoverContent>
		                              </Popover>

		                              {uploadCollectionIds.length > 0 && (
		                                <div className="flex flex-wrap gap-2 pt-1">
		                                  {uploadCollectionIds.map((id) => {
		                                    const fromQuery = uploadCollections.find((c: any) => c.id === id);
		                                    const title =
		                                      fromQuery?.title ??
		                                      uploadCollectionTitleOverrides[String(id)] ??
		                                      "Collection";
		                                    return (
		                                      <button
		                                        key={String(id)}
		                                        type="button"
		                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300"
		                                        onClick={() =>
		                                          setUploadCollectionIds((prev) => prev.filter((x) => x !== id))
		                                        }
		                                      >
		                                        {title}
		                                        <X className="h-3 w-3 text-gray-400" />
		                                      </button>
		                                    );
		                                  })}
		                                </div>
		                              )}
		                            </div>
		                          </div>
		                        </div>

	                        <div className="rounded-3xl border border-gray-200 bg-white p-6">
	                          <div className="flex flex-wrap items-center justify-between gap-3">
	                            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
	                              Metadata
	                            </h3>
	                            <Button
	                              variant="outline"
	                              size="sm"
	                              className={syncShared ? "gap-2 border-gray-900 text-gray-900" : "gap-2"}
	                              onClick={() =>
	                                setSyncShared((value) => {
	                                  const next = !value;
	                                  if (!value && next && selectedItem) {
	                                    setSharedMeta({
	                                      tags: selectedItem.tags,
	                                      description: selectedItem.description,
	                                      externalLink: selectedItem.externalLink,
	                                      author: selectedItem.author,
	                                    });
	                                  }
	                                  return next;
	                                })
	                              }
	                            >
	                              {syncShared ? "Sync on" : "Sync off"}
	                            </Button>
	                          </div>
	                          <p className="mt-2 text-xs text-gray-500">
	                            {syncShared
	                              ? "Writing in these fields updates every staged item."
	                              : "Writing updates only the selected item."}
	                          </p>

	                          <div className="mt-4 space-y-4">
	                            <div className="space-y-2">
	                            <label className="text-xs font-semibold uppercase text-gray-500">
	                              Title
	                            </label>
	                            <Input
                              value={selectedItem?.title ?? ""}
                              onChange={(event) => {
                                if (!selectedItem) return;
                                updateStagedItem(selectedItem.id, {
                                  title: event.target.value,
                                });
                              }}
                              placeholder={selectedItem ? "" : "Select a file"}
                              disabled={!selectedItem}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-gray-500">
                              Tags
                              {syncShared && (
                                <span className="ml-2 rounded-full bg-gray-900/10 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                  Sync
                                </span>
                              )}
                            </label>
                            <TagInput
                              tags={currentTags}
                              draft={currentDraft}
                              onDraftChange={updateTagDraft}
                              onTagsChange={updateTags}
                              placeholder="campaign, editorial, mood"
                              disabled={!syncShared && !selectedItem}
                              syncActive={syncShared}
                            />
                          </div>
                          {filteredSuggestions.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase text-gray-500">
                                Recent used
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {filteredSuggestions.map((tag) => (
                                  <button
                                    key={tag}
                                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                                    onClick={() => handleAddSuggestedTag(tag)}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-gray-500">
                              Description
                              {syncShared && (
                                <span className="ml-2 rounded-full bg-gray-900/10 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                  Sync
                                </span>
                              )}
                            </label>
                            <Input
                              value={
                                syncShared
                                  ? sharedMeta.description
                                  : selectedItem?.description ?? ""
                              }
                              onChange={(event) =>
                                updateSyncField("description", event.target.value)
                              }
                              placeholder="Optional shared note"
                              className={syncShared ? "border-gray-900/40 bg-gray-50" : ""}
                              disabled={!syncShared && !selectedItem}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-gray-500">
                              External link
                              {syncShared && (
                                <span className="ml-2 rounded-full bg-gray-900/10 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                  Sync
                                </span>
                              )}
                            </label>
                            <Input
                              value={
                                syncShared
                                  ? sharedMeta.externalLink
                                  : selectedItem?.externalLink ?? ""
                              }
                              onChange={(event) =>
                                updateSyncField("externalLink", event.target.value)
                              }
                              placeholder="https://"
                              className={syncShared ? "border-gray-900/40 bg-gray-50" : ""}
                              disabled={!syncShared && !selectedItem}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-gray-500">
                              Author
                              {syncShared && (
                                <span className="ml-2 rounded-full bg-gray-900/10 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                  Sync
                                </span>
                              )}
                            </label>
                            <Input
                              value={syncShared ? sharedMeta.author : selectedItem?.author ?? ""}
                              onChange={(event) => updateSyncField("author", event.target.value)}
                              placeholder="Photographer, artist, studio"
                              className={syncShared ? "border-gray-900/40 bg-gray-50" : ""}
                              disabled={!syncShared && !selectedItem}
                            />
                          </div>
	                          {syncShared && (
	                            <p className="text-xs text-gray-500">
	                              Disable sync to add per-file metadata.
	                            </p>
	                          )}
	                        </div>
	                      </div>
	                    </div>
	                    </motion.div>

                    {hoverPreview && (
                      <div
                        ref={hoverPreviewElRef}
                        className="pointer-events-none fixed left-0 top-0 z-[2147483647] will-change-transform"
                        style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
                      >
                        <div
                          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                          style={{
                            width: 360,
                            aspectRatio: hoverPreview.aspectRatio || 1,
                            maxHeight: 340,
                          }}
                        >
                          {hoverPreview.type === "image" ? (
                            <img
                              src={hoverPreview.url}
                              alt={hoverPreview.title}
                              className="h-full w-full object-cover"
                            />
                          ) : hoverPreview.type === "video" ? (
                            <video
                              src={hoverPreview.url}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              autoPlay
                              loop
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500">
                              <FileIcon className="h-8 w-8" />
                              <span className="text-xs">{hoverPreview.title}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <motion.div variants={itemVariants} className="pt-4 pb-6">
                      <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-900 shadow-sm">
                            <UploadCloud className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {stagedItems.length > 0
                                ? `${stagedItems.length} ready to upload`
                                : "No staged files"}
                            </p>
                            <p className="text-xs text-gray-600">
                              {isUploading
                                ? "Uploading in progress. You can keep the modal open to monitor it."
                                : "Confirm to upload and queue analysis."}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            className="gap-2 bg-gray-900 text-gray-50 hover:bg-black"
                            onClick={handleUploadAll}
                            disabled={isUploading || stagedItems.length === 0}
                          >
                            {isUploading ? "Uploading..." : "Upload references"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-3xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                            Upload progress
                          </p>
                          {uploadItems.length > 0 && !isUploading && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUploadItems([]);
                                setUploadBatchTotal(0);
                              }}
                              className="h-8"
                            >
                              Clear
                            </Button>
                          )}
                        </div>

                        <div className="mt-3">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-gray-900 transition-[width] duration-200"
                              style={{ width: `${overallProgress}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                              {uploadStatusLine}
                            </p>
                            <span className="shrink-0 text-xs font-semibold text-gray-600">
                              {Math.round(overallProgress)}%
                            </span>
                          </div>

                          {uploadErrorItems.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {uploadErrorItems.map((item) => (
                                <p key={item.id} className="text-xs text-rose-600">
                                  {item.file.name} · errore di caricamento
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        );

  return (
    <div className="w-full space-y-10">
      <section className="rounded-none border-0 border-gray-200 bg-white/95 p-4 shadow-none sm:rounded-3xl sm:border sm:p-8 sm:shadow-sm">
        <div className="flex flex-col gap-6">
	          <div className="flex items-center justify-center">
	            <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 shadow-sm">
	              <button
	                onClick={() => setActiveTab("references")}
	                className={[
	                  "inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition",
	                  activeTab === "references"
	                    ? "bg-white text-gray-900 shadow-sm"
	                    : "text-gray-600 hover:text-gray-900 hover:bg-white/70",
	                ].join(" ")}
	              >
	                <ImageIcon className="h-4 w-4" />
	                References
	              </button>
	              <button
	                onClick={() => setActiveTab("collections")}
	                className={[
	                  "inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition",
	                  activeTab === "collections"
	                    ? "bg-white text-gray-900 shadow-sm"
	                    : "text-gray-600 hover:text-gray-900 hover:bg-white/70",
	                ].join(" ")}
	              >
	                <LayoutGrid className="h-4 w-4" />
	                Collections
	              </button>
	            </div>
	          </div>

          <div className="border-t border-gray-200 pt-6">
            {activeTab === "references" ? (
                <Library
                  isImportMode={selectionMode}
                  areaSelectionEnabled={selectionMode}
                  masonryColumns={effectiveMasonryColumns}
                  headerActions={
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                          variant="outline"
                          size="icon"
                          className="library-unstyled h-10 w-10 border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                          aria-label="Grid"
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 bg-white text-gray-900">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                              Grid
                            </p>
                            <span className="text-xs font-semibold text-gray-700">
                              {effectiveMasonryColumns} cols
                            </span>
                          </div>
                          <Slider
                            value={[effectiveMasonryColumns]}
                            min={1}
                            max={8}
                            step={1}
                            disabled={isMasonryLockedToDevice}
                            onValueChange={(v) => {
                              if (isMasonryLockedToDevice) return;
                              setMasonryColumns(v[0] ?? 4);
                            }}
                          />
                          <p className="text-[11px] text-gray-500">
                            {isMasonryLockedToDevice
                              ? "On phones Reffo uses 1 column; on tablets it uses 2 columns."
                              : "Controls how many references fit per row (masonry columns)."}
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>

			                    <Button
			                      type="button"
			                      size="default"
			                      className="library-unstyled h-10 flex-1 justify-center gap-2 border border-black bg-black text-slate-50 hover:bg-black/90 hover:text-slate-50 sm:flex-none"
			                      onClick={() => setIsUploadModalOpen(true)}
			                    >
			                      <UploadCloud className="h-4 w-4 text-current" />
			                      Upload
			                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={[
                        "library-unstyled h-10 w-10 border border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
                        selectionMode
                          ? "!border-gray-900 !bg-gray-900 !text-slate-50 hover:!bg-black hover:!text-slate-50"
                          : "",
                      ].join(" ")}
                      onClick={() => setSelectionMode((v) => !v)}
                      aria-label="Select tool"
                      title="Select"
                    >
                      <MousePointer2 className="h-4 w-4 text-current" />
                    </Button>
                  </div>
                }
                selectedItems={selectedAssetIds}
                onSelectionChange={setSelectedAssetIds}
              />
            ) : (
              <CollectionsView />
            )}
          </div>
        </div>
      </section>
      {activeTab === "references" && selectionMode && selectedAssetIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          className="fixed bottom-6 left-1/2 z-30 w-[92vw] max-w-[860px] -translate-x-1/2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Badge className="border border-gray-200 bg-gray-100 text-gray-800">
                {selectedAssetIds.length} selected
              </Badge>
              <span className="text-xs text-gray-500">Drag to box-select, click to toggle.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setIsAddToCollectionOpen(true)}
              >
                <FolderPlus className="h-4 w-4" />
                Add to collection
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-600 hover:text-red-700"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setSelectedAssetIds([])}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <ReferenceDeleteConfirmation
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        count={selectedAssetIds.length}
        onConfirm={async () => {
          try {
            const ids = [...selectedAssetIds];
            await Promise.all(ids.map((id) => deleteAsset({ id })));
            toast.success(ids.length === 1 ? "Reference deleted" : "References deleted");
            setSelectedAssetIds([]);
          } catch (error) {
            console.error(error);
            toast.error("Unable to delete references");
          }
        }}
      />

      <Dialog open={isAddToCollectionOpen} onOpenChange={setIsAddToCollectionOpen}>
        <DialogContent className="sm:max-w-[560px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Add to collection</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Add {selectedAssetIds.length} selected reference{selectedAssetIds.length === 1 ? "" : "s"} to a collection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Find</label>
              <Input
                value={collectionPickerQuery}
                onChange={(e) => setCollectionPickerQuery(e.target.value)}
                placeholder="Search collections..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Create new</label>
              <div className="flex items-center gap-2">
                <Input
                  value={newCollectionTitle}
                  onChange={(e) => setNewCollectionTitle(e.target.value)}
                  placeholder="New collection name"
                />
                <Button
                  type="button"
                  variant="outline"
	                  onClick={async () => {
	                    const title = normalizeCollectionTitleDisplay(newCollectionTitle);
	                    if (!title) return;
	                    try {
	                      const existing = (collections ?? []).find(
	                        (c: any) =>
	                          !c?.isShared &&
	                          normalizeCollectionTitleKey(String(c?.title ?? "")) ===
	                            normalizeCollectionTitleKey(title),
	                      );
	                      if (existing?.id) {
	                        setPickedCollectionId(String(existing.id));
	                        setNewCollectionTitle("");
	                        toast.success("Collection already exists");
	                        return;
	                      }
	                      const id = (await createCollection({ title })) as any;
	                      setPickedCollectionId(String(id));
	                      setNewCollectionTitle("");
	                      toast.success("Collection created");
	                    } catch (error) {
                      console.error(error);
                      toast.error("Unable to create collection");
                    }
                  }}
                >
                  Create
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Pick one</label>
              <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-gray-200 bg-white">
                {(collections ?? [])
                  .filter((c: any) => !c?.isShared)
                  .filter((c: any) =>
                    collectionPickerQuery.trim()
                      ? String(c.title ?? "")
                          .toLowerCase()
                          .includes(collectionPickerQuery.trim().toLowerCase())
                      : true
                  )
                  .map((c: any) => {
                    const selected = pickedCollectionId === String(c.id);
                    return (
                      <button
                        key={String(c.id)}
                        type="button"
                        onClick={() => setPickedCollectionId(String(c.id))}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition ${
                          selected ? "bg-gray-900 text-slate-50" : "hover:bg-gray-50 text-gray-900"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{c.title}</p>
                          <p className={`text-xs ${selected ? "text-slate-200" : "text-gray-500"}`}>
                            {(c.itemCount ?? 0)} refs
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            selected ? "text-slate-100" : "text-gray-600"
                          }`}
                        >
                          {selected ? "Selected" : "Select"}
                        </span>
                      </button>
                    );
                  })}
                {(collections ?? []).filter((c: any) => !c?.isShared).length === 0 && (
                  <div className="px-4 py-6 text-sm text-gray-500">No collections yet.</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setIsAddToCollectionOpen(false);
                setPickedCollectionId(null);
                setCollectionPickerQuery("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!pickedCollectionId) {
                  toast.error("Pick a collection");
                  return;
                }
                try {
                  await addAssetsToCollection({
                    collectionId: pickedCollectionId as any,
                    assetIds: selectedAssetIds,
                  });
                  toast.success("Added to collection");
                  setIsAddToCollectionOpen(false);
                  setPickedCollectionId(null);
                  setCollectionPickerQuery("");
                  setSelectedAssetIds([]);
                } catch (error) {
                  console.error(error);
                  toast.error("Unable to add to collection");
                }
              }}
              disabled={!pickedCollectionId || selectedAssetIds.length === 0}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {uploadModalPortal}
    </div>
  );
};

export default LibraryPage;
