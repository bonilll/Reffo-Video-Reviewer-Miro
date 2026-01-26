import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadFileMultipart } from "@/lib/upload/multipart";
import { Library } from "@/components/library/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  UploadCloud,
  ImageIcon,
  VideoIcon,
  FileIcon,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

type UploadItem = {
  id: string;
  file: File;
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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
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
  const stagedItemsRef = useRef<StagedItem[]>([]);
  const [sharedTagDraft, setSharedTagDraft] = useState("");
  const [itemTagDrafts, setItemTagDrafts] = useState<Record<string, string>>({});
  const [hoverPreview, setHoverPreview] = useState<{
    url: string;
    type: "image" | "video" | "file";
    title: string;
    x: number;
    y: number;
    aspectRatio: number;
  } | null>(null);

  const createAsset = useMutation(api.assets.create);
  const patchDerived = useMutation(api.assets.patchDerived);
  const updateMetadata = useMutation(api.assets.updateMetadata);
  const enqueueJob = useMutation(api.assetJobs.enqueue);

  const assets = useQuery(api.assets.getUserLibrary, {});

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
    for (const item of stagedItems) {
      const id = crypto.randomUUID();
      setUploadItems((prev) => [
        { id, file: item.file, progress: 0, status: "queued" },
        ...prev,
      ]);
      try {
        setUploadStatus(id, "uploading");
        const result = await uploadFileMultipart(item.file, {
          autoSaveToLibrary: true,
          onProgress: (progress) => setUploadProgress(id, progress),
        });

        setUploadStatus(id, "processing");
        const type = getAssetType(item.file);
        const assetId = (await createAsset({
          title: item.title || item.file.name,
          fileUrl: result.url,
          fileName: item.file.name,
          type,
          mimeType: item.file.type || undefined,
          fileSize: item.file.size,
          source: "upload",
        })) as Id<"assets">;

        if (type === "image") {
          try {
            const metadata = await extractImageMetadata(item.file);
            await patchDerived({
              id: assetId,
              width: metadata.width,
              height: metadata.height,
              aspectRatio: metadata.aspectRatio,
              dominantColors: metadata.dominantColors,
              phash: metadata.phash,
            });
          } catch (error) {
            console.warn("Image metadata extraction failed", error);
          }
        }

        if (type === "video") {
          try {
            const metadata = await extractVideoMetadata(item.file);
            await patchDerived({
              id: assetId,
              width: metadata.width,
              height: metadata.height,
              durationSeconds: metadata.durationSeconds,
              aspectRatio: metadata.aspectRatio,
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

        setUploadStatus(id, "done");
        toast.success(`${item.file.name} uploaded`);
      } catch (error) {
        console.error(error);
        setUploadStatus(id, "error", (error as Error).message);
        toast.error(`Upload failed: ${item.file.name}`);
      }
    }
    setIsUploading(false);
    setStagedItems((prev) => {
      prev.forEach((item) => releaseObjectUrl(item.previewUrl));
      return [];
    });
    setSelectedStageId(null);
  }, [
    autoQueueAnalysis,
    createAsset,
    enqueueJob,
    isUploading,
    patchDerived,
    setUploadProgress,
    setUploadStatus,
    stagedItems,
    syncShared,
    updateMetadata,
    sharedMeta,
  ]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
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

  return (
    <div className="w-full space-y-10">
      <section className="rounded-3xl border border-gray-200 bg-white/95 p-8 shadow-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Reference Library
                </p>
                <h1 className="text-3xl font-semibold text-gray-900">
                  Organize references, faster.
                </h1>
                <p className="text-sm text-gray-600">
                  Upload images, videos, and files. Extract colors and metadata now, queue AI
                  analysis later.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border border-gray-200 bg-gray-100 text-gray-700">
                {assets?.length ?? 0} items
              </Badge>
            </div>
          </div>
          <Collapsible open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          {!isUploadOpen && (
            <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                  <UploadCloud className="h-4 w-4" />
                </div>
                <span>Open this section to upload new references.</span>
              </div>
            </div>
          )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />

            <CollapsibleContent className="grid gap-6 lg:grid-cols-[1.45fr,0.95fr]">
              <div className="space-y-6">
                <div
                  className={`relative rounded-3xl border border-dashed p-6 transition ${
                    isDragging
                      ? "border-gray-700 bg-gray-50"
                      : "border-gray-300 bg-white"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-start gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-900 border border-gray-200">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Stage references</h2>
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
                    <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                      <UploadCloud className="h-4 w-4" />
                      Choose files
                    </Button>
                  </div>
                </div>
              </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Staged preview</h3>
                      <p className="text-sm text-gray-600">
                        {stagedItems.length > 0
                          ? `${stagedItems.length} files ready`
                          : "Stage files to preview before upload."}
                      </p>
                    </div>
                    {stagedItems.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          stagedItems.forEach((item) => releaseObjectUrl(item.previewUrl));
                          setStagedItems([]);
                          setSelectedStageId(null);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  {stagedItems.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {stagedItems.map((item) => {
                        const ratio = item.aspectRatio && Number.isFinite(item.aspectRatio) ? item.aspectRatio : 1;
                        const type = getAssetType(item.file);
                        return (
                          <button
                            key={item.id}
                            className={`group relative overflow-hidden rounded-2xl border ${
                              item.id === selectedStageId
                                ? "border-gray-900"
                                : "border-gray-200"
                            }`}
                            style={{ width: 120, aspectRatio: `${ratio}` }}
                            onClick={() => setSelectedStageId(item.id)}
                            onMouseEnter={(event) => {
                              setHoverPreview({
                                url: item.previewUrl,
                                type,
                                title: item.title,
                                x: event.clientX,
                                y: event.clientY,
                                aspectRatio: ratio,
                              });
                            }}
                            onMouseMove={(event) => {
                              setHoverPreview((prev) =>
                                prev ? { ...prev, x: event.clientX, y: event.clientY } : prev
                              );
                            }}
                            onMouseLeave={() => setHoverPreview(null)}
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
                          </button>
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
                        updateStagedItem(selectedItem.id, { title: event.target.value });
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
                      value={syncShared ? sharedMeta.description : selectedItem?.description ?? ""}
                      onChange={(event) => updateSyncField("description", event.target.value)}
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
                      value={syncShared ? sharedMeta.externalLink : selectedItem?.externalLink ?? ""}
                      onChange={(event) => updateSyncField("externalLink", event.target.value)}
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
            </CollapsibleContent>

            {hoverPreview && (
              <div
                className="pointer-events-none fixed z-50"
                style={{ left: hoverPreview.x + 16, top: hoverPreview.y + 16 }}
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

            {stagedItems.length > 0 && (
              <div className="flex justify-center pt-2">
                <Button
                  className="px-10 py-6 text-base font-semibold bg-gray-900 text-gray-50 hover:bg-black"
                  onClick={handleUploadAll}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading..." : `Upload ${stagedItems.length} references`}
                </Button>
              </div>
            )}

            <div className="mt-3 flex justify-center">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
                {isUploadOpen ? "Hide upload settings" : "Show upload settings"}
                {isUploadOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CollapsibleTrigger>
            </div>
          </Collapsible>

          {uploadItems.length > 0 && (
            <div className="rounded-3xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Upload queue
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadItems([])}
                >
                  Clear
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {uploadItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{item.file.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.status === "error" ? item.error : `${item.progress}%`}
                        </p>
                      </div>
                      <Badge className="border border-gray-200 bg-white text-gray-600">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-2 h-1 w-full rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-gray-900 transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <Library />
          </div>
        </div>
      </section>
    </div>
  );
};

export default LibraryPage;
