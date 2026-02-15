import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { colorDistance, hexToRgb, rgbToHex } from "@/utils/colorUtils";
import {
  Search,
  Filter,
  Trash2,
  Pencil,
  FileIcon,
  Check,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion, type Variants } from "framer-motion";

type FilterState = {
  search: string;
  type: "all" | "image" | "video" | "file";
  tagQuery: string;
  color: string | null;
};

type LibraryAssetType = "image" | "video" | "file";

type LibraryProps = {
  userId?: string;
  orgId?: string;
  searchQuery?: string;
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  isImportMode?: boolean;
  areaSelectionEnabled?: boolean;
  headerActions?: React.ReactNode;
  masonryColumns?: number | null;
  selectedItems?: Id<"assets">[];
  onSelectionChange?: (items: Id<"assets">[]) => void;
  allowedTypes?: LibraryAssetType[];
  onFilteredDataChange?: (data: {
    filteredReferences: Doc<"assets">[];
    filters: FilterState;
    hasActiveFilters: boolean;
    onFilterOpen: () => void;
  } | null) => void;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const normalize = (value: string) => value.toLowerCase().trim();
const tokenize = (value: string) =>
  normalize(value)
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

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

const getUserTags = (asset: Doc<"assets">) => {
  if (asset.userTokens && asset.userTokens.length > 0) {
    return mergeTags([], asset.userTokens);
  }
  return mergeTags([], asset.tokens ?? []);
};

const getAiTags = (asset: Doc<"assets">) => {
  const ai = mergeTags([], [
    ...(asset.aiTokensI18n?.it ?? []),
    ...(asset.aiTokensI18n?.en ?? []),
  ]);
  if (ai.length > 0) return ai;
  if (asset.userTokens && asset.userTokens.length > 0 && asset.tokens?.length) {
    const userSet = new Set(getUserTags(asset).map((tag) => normalize(tag)));
    return mergeTags(
      [],
      asset.tokens.filter((token) => !userSet.has(normalize(token))),
    );
  }
  return [];
};

const getAllTags = (asset: Doc<"assets">) => mergeTags([], [...getUserTags(asset), ...getAiTags(asset)]);

const TagInput: React.FC<{
  tags: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
}> = ({ tags, draft, onDraftChange, onTagsChange, placeholder }) => {
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
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
        >
          {tag}
          <button
            type="button"
            className="text-gray-400 hover:text-gray-700"
            onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
          >
            <X className="h-3 w-3" />
          </button>
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
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.stopPropagation();
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
      />
    </div>
  );
};

const filterByTags = (asset: Doc<"assets">, tags: string[]) => {
  if (tags.length === 0) return true;
  const assetTokens = getAllTags(asset).map(normalize);
  const haystack = [
    asset.title,
    asset.description,
    asset.fileName,
    asset.captionsI18n?.it,
    asset.captionsI18n?.en,
    asset.ocrText,
  ]
    .filter(Boolean)
    .map((v) => normalize(String(v)));
  return tags.some(
    (tag) =>
      assetTokens.includes(tag) ||
      haystack.some((entry) => entry.includes(tag))
  );
};

const COLOR_THRESHOLD = 40;

const averageColor = (colors: string[]) => {
  if (colors.length === 0) return "#ffffff";
  const totals = colors.reduce(
    (acc, color) => {
      const [r, g, b] = hexToRgb(color);
      acc.r += r;
      acc.g += g;
      acc.b += b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );
  const count = colors.length;
  return rgbToHex(
    Math.round(totals.r / count),
    Math.round(totals.g / count),
    Math.round(totals.b / count)
  );
};

const matchesSearch = (asset: Doc<"assets">, query: string) => {
  if (!query) return true;
  const q = normalize(query);
  const fields = [
    asset.title,
    asset.description,
    asset.fileName,
    asset.ocrText,
    asset.captionsI18n?.it,
    asset.captionsI18n?.en,
    asset.author,
  ]
    .filter(Boolean)
    .map((v) => normalize(String(v)));
  const tokens = getAllTags(asset).map(normalize);
  return (
    fields.some((field) => field.includes(q)) ||
    tokens.some((token) => token.includes(q))
  );
};

const getVariantUrl = (variant: any): string | undefined =>
  variant?.url || variant?.publicUrl || undefined;

const getAssetPreviewUrl = (asset: Doc<"assets">): string =>
  getVariantUrl((asset as any).variants?.preview) ||
  getVariantUrl((asset as any).variants?.thumb) ||
  (asset as any).blurDataUrl ||
  asset.fileUrl;

const scoreTagMatch = (token: string, tags: string[], exactWeight: number, partialWeight: number) => {
  for (const tag of tags) {
    if (tag === token) return exactWeight;
  }
  for (const tag of tags) {
    if (tag.includes(token) || token.includes(tag)) return partialWeight;
  }
  return 0;
};

const computeSearchScore = (asset: Doc<"assets">, query: string) => {
  const q = normalize(query);
  if (!q) return 0;

  const userTags = getUserTags(asset).map((tag) => normalize(tag));
  const aiTags = getAiTags(asset).map((tag) => normalize(tag));
  const title = normalize(asset.title ?? "");
  const description = normalize(asset.description ?? "");
  const captions = normalize(
    `${asset.captionsI18n?.it ?? ""} ${asset.captionsI18n?.en ?? ""}`,
  );
  const ocr = normalize(asset.ocrText ?? "");
  const fileName = normalize(asset.fileName ?? "");
  const author = normalize(asset.author ?? "");

  let score = 0;
  let matchedTokens = 0;

  if (title.includes(q)) score += 120;
  if (description.includes(q)) score += 70;
  if (captions.includes(q)) score += 50;
  if (ocr.includes(q)) score += 35;
  if (author.includes(q)) score += 30;
  if (fileName.includes(q)) score += 20;

  const tokens = tokenize(q);
  tokens.forEach((token) => {
    let tokenScore = 0;
    tokenScore = Math.max(tokenScore, scoreTagMatch(token, userTags, 110, 80));
    tokenScore = Math.max(tokenScore, scoreTagMatch(token, aiTags, 55, 30));

    if (title.includes(token)) tokenScore = Math.max(tokenScore, 85);
    if (description.includes(token)) tokenScore = Math.max(tokenScore, 55);
    if (captions.includes(token)) tokenScore = Math.max(tokenScore, 40);
    if (ocr.includes(token)) tokenScore = Math.max(tokenScore, 30);
    if (author.includes(token)) tokenScore = Math.max(tokenScore, 25);
    if (fileName.includes(token)) tokenScore = Math.max(tokenScore, 20);

    if (tokenScore > 0) matchedTokens += 1;
    score += tokenScore;
  });

  if (matchedTokens > 0) {
    score += matchedTokens * 6;
  }

  return score;
};

export const Library: React.FC<LibraryProps> = ({
  userId,
  orgId,
  searchQuery,
  selectedTags,
  onTagsChange,
  isImportMode,
  areaSelectionEnabled,
  headerActions,
  masonryColumns,
  selectedItems,
  onSelectionChange,
  allowedTypes,
  onFilteredDataChange,
}) => {
  const normalizedAllowedTypes = useMemo<LibraryAssetType[]>(() => {
    const fallback: LibraryAssetType[] = ["image", "video", "file"];
    if (!allowedTypes || allowedTypes.length === 0) return fallback;
    const unique = Array.from(new Set(allowedTypes)).filter(
      (type): type is LibraryAssetType => type === "image" || type === "video" || type === "file"
    );
    return unique.length > 0 ? unique : fallback;
  }, [allowedTypes]);

  const defaultFilterType: FilterState["type"] =
    normalizedAllowedTypes.length === 1 ? normalizedAllowedTypes[0] : "all";
  const typeFilterOptions: FilterState["type"][] =
    normalizedAllowedTypes.length === 1
      ? [normalizedAllowedTypes[0]]
      : (["all", ...normalizedAllowedTypes] as FilterState["type"][]);

  const [filters, setFilters] = useState<FilterState>({
    search: searchQuery ?? "",
    type: defaultFilterType,
    tagQuery: selectedTags?.join(", ") ?? "",
    color: null,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [viewerAssetId, setViewerAssetId] = useState<Id<"assets"> | null>(null);
  const viewerContentRef = useRef<HTMLDivElement | null>(null);
	  const viewerBodyScrollRef = useRef<HTMLDivElement | null>(null);
	  const [viewerFullscreenOpen, setViewerFullscreenOpen] = useState(false);
	  const [viewerSlideDir, setViewerSlideDir] = useState<1 | -1>(1);
	  const fullscreenWheelRef = useRef<{ acc: number; t: number } | null>(null);
	  const fullscreenNavCooldownRef = useRef(0);
  const [editingAsset, setEditingAsset] = useState<Doc<"assets"> | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    tags: [] as string[],
    tagDraft: "",
    externalLink: "",
    isPrivate: false,
  });

  const searchTerm = filters.search.trim();
  const shouldUseServerSearch = searchTerm.length >= 2;
  const searchResults = useQuery(api.assets.getUserLibrary, {
    userId,
    orgId,
    searchQuery: shouldUseServerSearch ? searchTerm : undefined,
  });
  const allAssets = useQuery(api.assets.getUserLibrary, {
    userId,
    orgId,
    searchQuery: undefined,
  });
  const searchBoostSet = useMemo(() => {
    if (!searchResults) return new Set<string>();
    return new Set(searchResults.map((asset) => String(asset._id)));
  }, [searchResults]);
  const updateMetadata = useMutation(api.assets.updateMetadata);
  const deleteAsset = useMutation(api.assets.deleteAsset);

  useEffect(() => {
    setFilters((prev) => {
      const isCurrentTypeAllowed =
        prev.type === "all"
          ? defaultFilterType === "all"
          : normalizedAllowedTypes.includes(prev.type as LibraryAssetType);
      if (isCurrentTypeAllowed) return prev;
      return { ...prev, type: defaultFilterType };
    });
  }, [defaultFilterType, normalizedAllowedTypes]);

  const selection = selectedItems ?? [];
  const selectionRef = useRef<Id<"assets">[]>(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const masonryRef = useRef<HTMLDivElement | null>(null);
  const marqueeElRef = useRef<HTMLDivElement | null>(null);
  const itemButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const suppressClickRef = useRef(false);
  const suppressClearRafRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    hasCapture: boolean;
    startClientX: number;
    startClientY: number;
    startPageX: number;
    startPageY: number;
    lastClientX: number;
    lastClientY: number;
    moved: boolean;
    baseSelection: Set<string>;
    scrollVelocity: number;
  }>({
    active: false,
    pointerId: null,
    hasCapture: false,
    startClientX: 0,
    startClientY: 0,
    startPageX: 0,
    startPageY: 0,
    lastClientX: 0,
    lastClientY: 0,
    moved: false,
    baseSelection: new Set(),
    scrollVelocity: 0,
  });
  const marqueeRafRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  const applyMarquee = useCallback(() => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const el = marqueeElRef.current;
    if (!el) return;

    // Anchor the marquee in page coordinates so it can grow while the page scrolls.
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const lastPageX = state.lastClientX + scrollX;
    const lastPageY = state.lastClientY + scrollY;

    const dragDistance = Math.hypot(lastPageX - state.startPageX, lastPageY - state.startPageY);
    // Avoid changing selection on small pointer jitter; box-select should only kick in once the user drags.
    if (dragDistance < 14) {
      el.style.display = "none";
      return;
    }
    // If the page scrolls while the cursor stays still, treat it as a drag.
    if (!state.moved) state.moved = true;

    const x1Page = Math.min(state.startPageX, lastPageX);
    const y1Page = Math.min(state.startPageY, lastPageY);
    const x2Page = Math.max(state.startPageX, lastPageX);
    const y2Page = Math.max(state.startPageY, lastPageY);

    // Convert back to client coords for rendering the overlay.
    const x1 = x1Page - scrollX;
    const y1 = y1Page - scrollY;
    const x2 = x2Page - scrollX;
    const y2 = y2Page - scrollY;

    const w = Math.max(1, x2 - x1);
    const h = Math.max(1, y2 - y1);

    el.style.display = "block";
    el.style.transform = `translate3d(${x1}px, ${y1}px, 0)`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    const next = new Set<string>(state.baseSelection);
    itemButtonRefs.current.forEach((btn, id) => {
      const r = btn.getBoundingClientRect();
      // Compare in page coordinates so off-screen items are included as the user scrolls.
      const left = r.left + scrollX;
      const right = r.right + scrollX;
      const top = r.top + scrollY;
      const bottom = r.bottom + scrollY;
      const intersects = !(right < x1Page || left > x2Page || bottom < y1Page || top > y2Page);
      if (intersects) next.add(id);
    });

    const current = new Set(selectionRef.current.map((id) => String(id)));
    if (current.size === next.size) {
      let same = true;
      for (const id of next) {
        if (!current.has(id)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }

    onSelectionChange?.(Array.from(next) as any);
  }, [onSelectionChange]);

  const scheduleMarquee = useCallback(() => {
    if (marqueeRafRef.current) return;
    marqueeRafRef.current = requestAnimationFrame(() => {
      marqueeRafRef.current = null;
      applyMarquee();
    });
  }, [applyMarquee]);

  const startAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current) return;
    const tick = () => {
      autoScrollRafRef.current = null;
      const state = dragStateRef.current;
      if (!state.active) return;
      if (!state.scrollVelocity) return;

      const prevY = window.scrollY;
      window.scrollBy(0, state.scrollVelocity);
      if (window.scrollY === prevY) {
        // Hit top/bottom; stop.
        state.scrollVelocity = 0;
        return;
      }

      // Items moved (page scrolled); recompute selection. The marquee grows in page space.
      scheduleMarquee();
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [scheduleMarquee]);

  useEffect(() => {
    return () => {
      if (marqueeRafRef.current) cancelAnimationFrame(marqueeRafRef.current);
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
      if (suppressClearRafRef.current) cancelAnimationFrame(suppressClearRafRef.current);
    };
  }, []);

  const selectedTagFilters = useMemo(
    () =>
      filters.tagQuery
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [filters.tagQuery]
  );

  const tagFilters = useMemo(
    () =>
      filters.tagQuery
        .split(",")
        .map((tag) => normalize(tag))
        .filter(Boolean),
    [filters.tagQuery]
  );

  const availableTags = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    (allAssets ?? []).forEach((asset) => {
      getAllTags(asset).forEach((token) => {
        const label = token.trim();
        if (!label) return;
        const key = normalize(label);
        const existing = map.get(key);
        if (existing) existing.count += 1;
        else map.set(key, { label, count: 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allAssets]);

  const filteredAvailableTags = useMemo(() => {
    const query = normalize(tagSearch);
    const selectedSet = new Set(selectedTagFilters.map(normalize));
    return availableTags
      .filter((tag) => (query ? normalize(tag.label).includes(query) : true))
      .filter((tag) => !selectedSet.has(normalize(tag.label)));
  }, [availableTags, selectedTagFilters, tagSearch]);

  const editTagSuggestions = useMemo(() => {
    const query = normalize(editForm.tagDraft);
    const selectedSet = new Set(editForm.tags.map(normalize));
    return availableTags
      .filter((tag) => (query ? normalize(tag.label).includes(query) : true))
      .filter((tag) => !selectedSet.has(normalize(tag.label)))
      .map((tag) => tag.label)
      .slice(0, 12);
  }, [availableTags, editForm.tagDraft, editForm.tags]);

  const colorClusters = useMemo(() => {
    if (!allAssets) return [] as { rep: string; colors: string[] }[];
    const palette: string[] = [];
    allAssets.forEach((asset) => {
      asset.dominantColors?.forEach((color) => palette.push(color));
    });
    const clusters: { rep: string; colors: string[] }[] = [];
    palette.forEach((color) => {
      const match = clusters.find((cluster) => colorDistance(cluster.rep, color) <= COLOR_THRESHOLD);
      if (match) {
        match.colors.push(color);
        match.rep = averageColor(match.colors);
      } else {
        clusters.push({ rep: color, colors: [color] });
      }
    });
    return clusters.slice(0, 12);
  }, [allAssets]);

  const filteredAssets = useMemo(() => {
    if (!allAssets) return [] as Doc<"assets">[];
    const scored = allAssets
      .map((asset) => {
        let score = searchTerm ? computeSearchScore(asset, searchTerm) : 0;
        if (searchTerm && searchBoostSet.has(String(asset._id))) {
          score += 45;
        }
        return { asset, score };
      })
      .filter(({ asset, score }) => {
        if (!normalizedAllowedTypes.includes(asset.type as LibraryAssetType)) return false;
        if (filters.type !== "all" && asset.type !== filters.type) return false;
        if (filters.color) {
          const matchesColor = (asset.dominantColors ?? []).some(
            (color) => colorDistance(filters.color!, color) <= COLOR_THRESHOLD,
          );
          if (!matchesColor) return false;
        }
        if (searchTerm && score <= 0 && !matchesSearch(asset, searchTerm)) return false;
        if (!filterByTags(asset, tagFilters)) return false;
        return true;
      });

    const sorted = scored.sort((a, b) => {
      if (searchTerm) {
        if (b.score !== a.score) return b.score - a.score;
      }
      const aTime = a.asset.updatedAt ?? a.asset._creationTime;
      const bTime = b.asset.updatedAt ?? b.asset._creationTime;
      return bTime - aTime;
    });

    return sorted.map((entry) => entry.asset);
  }, [allAssets, filters, tagFilters, searchTerm, searchBoostSet, normalizedAllowedTypes]);

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.type !== defaultFilterType ||
    Boolean(filters.tagQuery.trim()) ||
    Boolean(filters.color);

  const viewerItems = filteredAssets;
  const viewerIndex = viewerAssetId
    ? viewerItems.findIndex((item) => item._id === viewerAssetId)
    : -1;
  const viewerAsset = viewerIndex >= 0 ? viewerItems[viewerIndex] : null;
  const viewerUserTags = useMemo(() => (viewerAsset ? getUserTags(viewerAsset) : []), [viewerAsset]);
  const viewerSuggestedTags = useMemo(() => {
    if (!viewerAsset) return [];
    const aiTagsEn = mergeTags([], viewerAsset.aiTokensI18n?.en ?? []);
    if (aiTagsEn.length === 0) return [];
    const userSet = new Set(viewerUserTags.map((tag) => normalize(tag)));
    return aiTagsEn.filter((tag) => !userSet.has(normalize(tag))).slice(0, 16);
  }, [viewerAsset, viewerUserTags]);

  const viewerSuggestedDescription = useMemo(() => {
    if (!viewerAsset) return "";
    const suggestion = (viewerAsset.captionsI18n?.en ?? "").trim();
    if (!suggestion) return "";
    const current = (viewerAsset.description ?? "").trim();
    if (current && normalize(current) === normalize(suggestion)) return "";
    return suggestion;
  }, [viewerAsset]);

  useEffect(() => {
    if (viewerAssetId && viewerIndex === -1) {
      setViewerAssetId(null);
    }
  }, [viewerAssetId, viewerIndex]);

  useEffect(() => {
    if (!viewerAsset) return;
    const id = window.setTimeout(() => {
      viewerBodyScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      viewerContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [viewerAsset, viewerAssetId]);

  useEffect(() => {
    if (!viewerAsset) {
      setViewerFullscreenOpen(false);
    }
  }, [viewerAsset]);

  useEffect(() => {
    if (!viewerFullscreenOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setViewerFullscreenOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewerFullscreenOpen]);

  const handleViewerPrev = useCallback(() => {
    if (!viewerAsset || viewerItems.length === 0) return;
    setViewerSlideDir(-1);
    const nextIndex = (viewerIndex - 1 + viewerItems.length) % viewerItems.length;
    setViewerAssetId(viewerItems[nextIndex]._id);
  }, [viewerAsset, viewerIndex, viewerItems]);

  const handleViewerNext = useCallback(() => {
    if (!viewerAsset || viewerItems.length === 0) return;
    setViewerSlideDir(1);
    const nextIndex = (viewerIndex + 1) % viewerItems.length;
    setViewerAssetId(viewerItems[nextIndex]._id);
  }, [viewerAsset, viewerIndex, viewerItems]);

  useEffect(() => {
    if (!viewerAsset) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingAsset) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleViewerPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleViewerNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleViewerNext, handleViewerPrev, viewerAsset, editingAsset]);

  useEffect(() => {
    onFilteredDataChange?.({
      filteredReferences: filteredAssets,
      filters,
      hasActiveFilters,
      onFilterOpen: () => setIsFilterOpen(true),
    });
  }, [filteredAssets, filters, hasActiveFilters, onFilteredDataChange]);

  const openEdit = useCallback((asset: Doc<"assets">) => {
    setEditingAsset(asset);
    setEditForm({
      title: asset.title ?? "",
      description: asset.description ?? "",
      tags: getUserTags(asset),
      tagDraft: "",
      externalLink: asset.externalLink ?? "",
      isPrivate: Boolean(asset.isPrivate),
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingAsset) return;
    const tokens = mergeTags([], editForm.tags);
    try {
      await updateMetadata({
        id: editingAsset._id,
        title: editForm.title.trim() || editingAsset.title,
        description: editForm.description.trim() || undefined,
        userTokens: tokens,
        externalLink: editForm.externalLink.trim() || undefined,
        isPrivate: editForm.isPrivate,
      });
      toast.success("Reference updated");
      setEditingAsset(null);
    } catch (error) {
      console.error(error);
      toast.error("Unable to update reference");
    }
  }, [editingAsset, editForm, updateMetadata]);

  const fullscreenSlideVariants: Variants = {
    enter: (dir: 1 | -1) => ({ x: dir > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: 1 | -1) => ({ x: dir > 0 ? -120 : 120, opacity: 0 }),
  };

  const fullscreenOverlay =
    viewerFullscreenOpen && viewerAsset && typeof document !== "undefined"
      ? createPortal(
	          <div
	            className="fixed inset-0 z-[90] bg-black text-white"
	            role="dialog"
	            aria-modal="true"
	            aria-label="Fullscreen preview"
	            onWheel={(event) => {
	              // Trackpad horizontal swipes often arrive as wheel deltaX.
	              const now = Date.now();
	              if (now - fullscreenNavCooldownRef.current < 220) return;

              const dx = event.deltaX ?? 0;
              const dy = event.deltaY ?? 0;
              if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
              if (Math.abs(dx) < 8) return;

              const state = fullscreenWheelRef.current;
              if (!state || now - state.t > 220) {
                fullscreenWheelRef.current = { acc: dx, t: now };
              } else {
                state.acc += dx;
                state.t = now;
              }

              const acc = fullscreenWheelRef.current?.acc ?? 0;
              if (Math.abs(acc) >= 80) {
                fullscreenNavCooldownRef.current = now;
                fullscreenWheelRef.current = null;
                if (acc < 0) handleViewerNext();
	                else handleViewerPrev();
	              }
	            }}
		            style={{ touchAction: "none" }}
		          >
            <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 to-transparent px-4 py-3 text-white drop-shadow-sm">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {viewerAsset.title || viewerAsset.fileName}
                  </p>
                  <p className="text-xs text-white/70">
                    {viewerIndex + 1} of {viewerItems.length}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {viewerItems.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={handleViewerPrev}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60"
                        aria-label="Previous"
                        title="Previous"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleViewerNext}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60"
                        aria-label="Next"
                        title="Next"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewerFullscreenOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60"
                    aria-label="Exit fullscreen"
                    title="Exit fullscreen"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

	            <div className="absolute inset-0 flex items-center justify-center px-3 py-14 sm:px-6 sm:py-16">
	              <div className="relative h-full w-full max-w-6xl">
		                <AnimatePresence initial={false} custom={viewerSlideDir}>
		                  <motion.div
		                    key={String(viewerAsset._id)}
		                    custom={viewerSlideDir}
		                    variants={fullscreenSlideVariants}
		                    initial="enter"
		                    animate="center"
		                    exit="exit"
		                    transition={{ duration: 0.18, ease: "easeOut" }}
		                    className="absolute inset-0"
		                  >
		                    <motion.div
		                      drag={viewerItems.length > 1 ? "x" : false}
		                      dragConstraints={{ left: -260, right: 260 }}
		                      dragElastic={0.22}
		                      dragMomentum={false}
		                      onDragEnd={(_, info) => {
		                        const dx = info.offset.x;
		                        if (dx <= -90) handleViewerNext();
		                        else if (dx >= 90) handleViewerPrev();
		                      }}
		                      className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
		                      style={{ touchAction: "none" }}
		                    >
		                      {viewerAsset.type === "image" ? (
		                        <img
		                          src={viewerAsset.fileUrl}
		                          alt={viewerAsset.title}
		                          className="max-h-full max-w-full object-contain"
		                          draggable={false}
		                        />
		                      ) : viewerAsset.type === "video" ? (
		                        <video
		                          src={viewerAsset.fileUrl}
		                          className="max-h-full max-w-full object-contain"
		                          controls
		                          playsInline
		                        />
		                      ) : (
		                        <div className="flex flex-col items-center gap-3 text-white/70">
		                          <FileIcon className="h-12 w-12" />
		                          <span className="text-sm">{viewerAsset.fileName}</span>
		                        </div>
		                      )}
		                    </motion.div>
		                  </motion.div>
		                </AnimatePresence>
	              </div>
	            </div>

              {/* Always-visible controls (extra safety): don't block drag except on the buttons. */}
              {viewerItems.length > 1 && (
                <div className="pointer-events-none absolute inset-0 z-10">
                  <button
                    type="button"
                    onClick={handleViewerPrev}
                    className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/40 !text-white shadow-lg backdrop-blur hover:bg-black/60 sm:left-6"
                    aria-label="Previous"
                    title="Previous"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleViewerNext}
                    className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/40 !text-white shadow-lg backdrop-blur hover:bg-black/60 sm:right-6"
                    aria-label="Next"
                    title="Next"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-10">
                <div className="mx-auto flex w-full max-w-6xl justify-center">
                  <button
                    type="button"
                    onClick={() => setViewerFullscreenOpen(false)}
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-sm font-semibold !text-white shadow-lg backdrop-blur hover:bg-black/60"
                    aria-label="Exit fullscreen"
                    title="Exit fullscreen"
                  >
                    <X className="h-4 w-4" />
                    Exit
                  </button>
                </div>
              </div>
	          </div>,
	          document.body,
	        )
	      : null;

  const handleDelete = useCallback(
    async (asset: Doc<"assets">) => {
      try {
        await deleteAsset({ id: asset._id });
        toast.success("Reference deleted");
      } catch (error) {
        console.error(error);
        toast.error("Unable to delete reference");
      }
    },
    [deleteAsset]
  );

  // Analysis queue remains available via backend; UI triggers can be reintroduced if needed.

  const toggleSelection = useCallback(
    (id: Id<"assets">) => {
      if (!onSelectionChange) return;
      if (selection.includes(id)) {
        onSelectionChange(selection.filter((item) => item !== id));
      } else {
        onSelectionChange([...selection, id]);
      }
    },
    [onSelectionChange, selection]
  );

  const handleFilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...prev,
      search: "",
      type: defaultFilterType,
      tagQuery: "",
      color: null,
    }));
    onTagsChange?.([]);
  };

  const isLoading = allAssets === undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          {/* Row 1 (mobile): search + square filters button. On desktop this stays left. */}
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(event) => handleFilterChange("search", event.target.value)}
                placeholder="Search title, filename, tags, captions, OCR..."
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="relative h-10 w-10 justify-center px-0 sm:w-auto sm:gap-2 sm:px-4"
              onClick={() => setIsFilterOpen(true)}
              aria-label="Filters"
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <>
                  <span
                    className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gray-700 sm:hidden"
                    aria-hidden="true"
                  />
                  <span
                    className="hidden h-2 w-2 rounded-full bg-gray-700 sm:inline-block"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
          </div>

          {/* Row 2 (mobile): actions fill width; on desktop this sits to the right. */}
          {headerActions ? (
            <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
              {headerActions}
            </div>
          ) : null}
        </div>
        <div className="hidden items-center gap-2 text-xs text-gray-500 sm:flex">
          <span>{filteredAssets.length} items</span>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-gray-700 underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <DialogContent className="z-[120] sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription className="sr-only">
              Filter library references by type, tags, and color.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            {typeFilterOptions.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-gray-500">Type</p>
                <div className="flex flex-wrap gap-2">
                  {typeFilterOptions.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={filters.type === type ? "default" : "outline"}
                      onClick={() => handleFilterChange("type", type)}
                    >
                      {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-gray-500">Tags</p>
              <Input
                value={tagSearch}
                onChange={(event) => setTagSearch(event.target.value)}
                placeholder="Filter tags..."
              />
              <div className="flex flex-wrap gap-2">
                {selectedTagFilters.map((tag) => (
                  <button
                    key={tag}
                    className="rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-xs text-slate-50"
                    onClick={() => {
                      const next = selectedTagFilters.filter((t) => normalize(t) !== normalize(tag));
                      setFilters((prev) => ({ ...prev, tagQuery: next.join(", ") }));
                      onTagsChange?.(next);
                    }}
                  >
                    {tag}
                  </button>
                ))}
                {filteredAvailableTags.slice(0, 18).map((tag) => (
                  <button
                    key={tag.label}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                    onClick={() => {
                      const next = [...selectedTagFilters, tag.label];
                      setFilters((prev) => ({ ...prev, tagQuery: next.join(", ") }));
                      onTagsChange?.(next);
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-gray-500">Dominant color</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`h-8 w-8 rounded-full border ${filters.color ? "border-gray-200" : "border-gray-700"}`}
                  onClick={() => handleFilterChange("color", null)}
                  title="Any color"
                />
                {colorClusters.map((cluster) => (
                  <button
                    key={cluster.rep}
                    className={`h-8 w-8 rounded-full border ${filters.color === cluster.rep ? "border-gray-900" : "border-gray-200"}`}
                    style={{ backgroundColor: cluster.rep }}
                    onClick={() => handleFilterChange("color", cluster.rep)}
                    title={cluster.rep}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <Button variant="ghost" onClick={handleResetFilters}>
              Reset
            </Button>
            <Button onClick={() => setIsFilterOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isImportMode && (
        <Dialog open={Boolean(viewerAsset)} onOpenChange={(open) => !open && setViewerAssetId(null)}>
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="fixed left-1/2 top-1/2 flex h-[92dvh] max-h-[92dvh] w-[96vw] max-w-[1120px] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden bg-white p-0 text-gray-900 sm:w-[92vw] [&>button.absolute]:hidden"
          >
            {viewerAsset && (
              <>
                <DialogTitle className="sr-only">{viewerAsset.title || viewerAsset.fileName}</DialogTitle>
                <DialogDescription className="sr-only">
                  Asset preview with metadata and suggested tags.
                </DialogDescription>

                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-gray-900 sm:text-lg">
                        {viewerAsset.title || viewerAsset.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {viewerIndex + 1} of {viewerItems.length}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setViewerFullscreenOpen(true)}
                        aria-label="Open fullscreen"
                        title="Fullscreen"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                      {viewerItems.length > 1 && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleViewerPrev}
                            className="h-9 w-9"
                            aria-label="Previous reference"
                            title="Previous"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleViewerNext}
                            className="h-9 w-9"
                            aria-label="Next reference"
                            title="Next"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      <DialogClose asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label="Close preview"
                          title="Close"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogClose>
                    </div>
                  </div>

                  <div
                    ref={viewerBodyScrollRef}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] lg:flex-row lg:overflow-hidden"
                  >
                    <div className="h-[34dvh] shrink-0 border-b border-gray-200 bg-gray-50 p-4 sm:h-[48dvh] lg:h-auto lg:flex-1 lg:min-w-0 lg:border-b-0 lg:border-r lg:p-6">
                      <div className="flex h-full items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
                        {viewerAsset.type === "image" ? (
                          <img
                            src={viewerAsset.fileUrl}
                            alt={viewerAsset.title}
                            className="h-full w-full max-w-full max-h-full object-contain"
                            onClick={() => setViewerFullscreenOpen(true)}
                          />
                        ) : viewerAsset.type === "video" ? (
                          <video
                            src={viewerAsset.fileUrl}
                            className="h-full w-full max-w-full max-h-full object-contain"
                            controls
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-gray-500">
                            <FileIcon className="h-10 w-10" />
                            <span className="text-sm">{viewerAsset.fileName}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      ref={viewerContentRef}
                      className="flex-1 p-4 sm:p-6 lg:w-[420px] lg:flex-none lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:touch-pan-y lg:[-webkit-overflow-scrolling:touch]"
                    >
                      <div className="space-y-5 text-sm text-gray-700">
                        <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          try {
                            const response = await fetch(viewerAsset.fileUrl);
                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = viewerAsset.fileName || "reference";
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            URL.revokeObjectURL(url);
                          } catch {
                            const link = document.createElement("a");
                            link.href = viewerAsset.fileUrl;
                            link.download = viewerAsset.fileName || "reference";
                            link.rel = "noreferrer";
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => openEdit(viewerAsset)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit metadata
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(viewerAsset)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                        <div className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Type</p>
                              <p className="font-medium text-gray-900">{viewerAsset.type ?? "file"}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">File size</p>
                              <p className="font-medium text-gray-900">{formatBytes(viewerAsset.fileSize)}</p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Author</p>
                            <p className="text-gray-900">{viewerAsset.author || "—"}</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">External link</p>
                            {viewerAsset.externalLink ? (
                              <a
                                href={viewerAsset.externalLink}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-gray-700 underline underline-offset-2 hover:text-gray-900"
                              >
                                {viewerAsset.externalLink}
                              </a>
                            ) : (
                              <p>—</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Description</p>
                          <p className="whitespace-pre-wrap text-gray-900">{viewerAsset.description || "—"}</p>
                        </div>

                        {viewerSuggestedDescription && (
                          <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                Suggested description (EN)
                              </p>
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                                onClick={async () => {
                                  try {
                                    await updateMetadata({
                                      id: viewerAsset._id,
                                      description: viewerSuggestedDescription,
                                    });
                                    toast.success("Description updated");
                                  } catch (error) {
                                    console.error(error);
                                    toast.error("Unable to update description");
                                  }
                                }}
                              >
                                {viewerAsset.description ? "Replace" : "Use"}
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap text-gray-700">{viewerSuggestedDescription}</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Your tags</p>
                          {viewerUserTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {viewerUserTags.map((token) => (
                                <Badge key={token} variant="secondary" className="bg-gray-100 text-gray-600">
                                  {token}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p>—</p>
                          )}
                        </div>

                        {viewerSuggestedTags.length > 0 && (
                          <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Suggested tags</p>
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                                onClick={async () => {
                                  try {
                                    const next = mergeTags(viewerUserTags, viewerSuggestedTags);
                                    await updateMetadata({
                                      id: viewerAsset._id,
                                      userTokens: next,
                                    });
                                    toast.success("Tags added");
                                  } catch (error) {
                                    console.error(error);
                                    toast.error("Unable to add tags");
                                  }
                                }}
                              >
                                Add all
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {viewerSuggestedTags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300"
                                  onClick={async () => {
                                    try {
                                      const next = mergeTags(viewerUserTags, [tag]);
                                      await updateMetadata({
                                        id: viewerAsset._id,
                                        userTokens: next,
                                      });
                                      toast.success(`Added "${tag}"`);
                                    } catch (error) {
                                      console.error(error);
                                      toast.error("Unable to add tag");
                                    }
                                  }}
                                >
                                  <span className="text-[10px]">+</span>
                                  {tag}
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-gray-500">
                              AI suggestions help refine search and filters without overwriting your tags.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {fullscreenOverlay}
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <div
        ref={masonryRef}
        className="library-masonry relative"
        style={masonryColumns ? ({ columnCount: masonryColumns } as any) : undefined}
        onClickCapture={(event) => {
          // If we just finished a marquee drag, suppress the click that would otherwise
          // toggle/open an item.
          if (suppressClickRef.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClickRef.current = false;
          }
        }}
        onPointerDown={(event) => {
          if (!isImportMode) return;
          if (!areaSelectionEnabled) return;
          if (!onSelectionChange) return;
          if (event.button !== 0) return;
          if (suppressClearRafRef.current) {
            cancelAnimationFrame(suppressClearRafRef.current);
            suppressClearRafRef.current = null;
          }

          const container = masonryRef.current;
          if (!container) return;
          const startClientX = event.clientX;
          const startClientY = event.clientY;
          const startPageX = startClientX + (window.scrollX || 0);
          const startPageY = startClientY + (window.scrollY || 0);

          const base =
            event.shiftKey ? new Set(selectionRef.current.map((id) => String(id))) : new Set<string>();

          dragStateRef.current = {
            active: true,
            pointerId: event.pointerId,
            hasCapture: false,
            startClientX,
            startClientY,
            startPageX,
            startPageY,
            lastClientX: startClientX,
            lastClientY: startClientY,
            moved: false,
            baseSelection: base,
            scrollVelocity: 0,
          };
        }}
        onPointerMove={(event) => {
          const state = dragStateRef.current;
          if (!state.active) return;
          if (state.pointerId !== event.pointerId) return;
          const nextClientX = event.clientX;
          const nextClientY = event.clientY;
          state.lastClientX = nextClientX;
          state.lastClientY = nextClientY;

          const dx = nextClientX - state.startClientX;
          const dy = nextClientY - state.startClientY;
          if (!state.moved && Math.hypot(dx, dy) >= 14) {
            state.moved = true;
          }

          // Only enter marquee mode once the user actually drags.
          if (state.moved) {
            if (!state.hasCapture) {
              try {
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                state.hasCapture = true;
              } catch {
                // ignore
              }
            }

            // Prevent image drag ghost / accidental click selection when marquee is active.
            event.preventDefault();

            // Auto-scroll when close to viewport edges (OS-like marquee selection).
            const EDGE = 72;
            const MAX_SPEED = 18; // px/frame
            let velocity = 0;
            const vh = window.innerHeight || 0;
            if (nextClientY < EDGE) {
              const t = Math.max(0, Math.min(1, (EDGE - nextClientY) / EDGE));
              velocity = -Math.round(4 + t * (MAX_SPEED - 4));
            } else if (nextClientY > vh - EDGE) {
              const t = Math.max(0, Math.min(1, (nextClientY - (vh - EDGE)) / EDGE));
              velocity = Math.round(4 + t * (MAX_SPEED - 4));
            }
            state.scrollVelocity = velocity;
            if (velocity) startAutoScrollLoop();

            scheduleMarquee();
          } else {
            state.scrollVelocity = 0;
          }
        }}
        onPointerUp={(event) => {
          const state = dragStateRef.current;
          if (!state.active) return;
          if (state.pointerId !== event.pointerId) return;
          // Suppress click only if marquee selection actually kicked in.
          suppressClickRef.current = state.moved;
          if (state.moved) {
            if (suppressClearRafRef.current) cancelAnimationFrame(suppressClearRafRef.current);
            // If the browser doesn't emit a click (due to preventDefault during drag),
            // auto-clear suppression so the next intentional click still works.
            suppressClearRafRef.current = requestAnimationFrame(() => {
              suppressClickRef.current = false;
              suppressClearRafRef.current = null;
            });
          }
          dragStateRef.current.active = false;
          dragStateRef.current.pointerId = null;
          dragStateRef.current.hasCapture = false;
          dragStateRef.current.scrollVelocity = 0;
          const el = marqueeElRef.current;
          if (el) el.style.display = "none";
          try {
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={(event) => {
          const state = dragStateRef.current;
          if (!state.active) return;
          if (state.pointerId !== event.pointerId) return;
          suppressClickRef.current = state.moved;
          if (state.moved) {
            if (suppressClearRafRef.current) cancelAnimationFrame(suppressClearRafRef.current);
            suppressClearRafRef.current = requestAnimationFrame(() => {
              suppressClickRef.current = false;
              suppressClearRafRef.current = null;
            });
          }
          dragStateRef.current.active = false;
          dragStateRef.current.pointerId = null;
          dragStateRef.current.hasCapture = false;
          dragStateRef.current.scrollVelocity = 0;
          const el = marqueeElRef.current;
          if (el) el.style.display = "none";
          try {
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }}
      >
        <div
          ref={marqueeElRef}
          className="pointer-events-none fixed left-0 top-0 hidden rounded-xl border border-gray-900/60 bg-gray-900/10 shadow-[0_0_0_1px_rgba(0,0,0,0.05)] z-[2147483644]"
          style={{ width: 0, height: 0 }}
        />
        {isLoading && (
          <div className="library-masonry-item rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            Loading references...
          </div>
        )}
        {!isLoading && filteredAssets.length === 0 && (
          <div className="library-masonry-item rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            No references found.
          </div>
        )}
        {filteredAssets.map((asset) => {
          const isSelected = selection.includes(asset._id);
          const mediaType = asset.type ?? "file";
          const previewSrc = getAssetPreviewUrl(asset);
          const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
          return (
            <div key={asset._id} className="library-masonry-item">
              <button
                ref={(el) => {
                  const key = String(asset._id);
                  if (el) itemButtonRefs.current.set(key, el);
                  else itemButtonRefs.current.delete(key);
                }}
                data-asset-button="true"
                aria-pressed={isImportMode ? isSelected : undefined}
                className={[
                  "group relative w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  isImportMode
                    ? isSelected
                      ? [
                          "border-gray-200",
                          "ring-2 ring-gray-900 ring-offset-0",
                          "shadow-[0_12px_28px_rgba(15,23,42,0.10)]",
                          "after:pointer-events-none after:absolute after:inset-0 after:bg-black/10",
                        ].join(" ")
                      : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                    : "border-gray-200 hover:border-gray-300 hover:shadow-md",
                ].join(" ")}
                onClick={() => {
                  if (isImportMode) toggleSelection(asset._id);
                  else setViewerAssetId(asset._id);
                }}
              >
                <div className="w-full bg-gray-50" style={{ aspectRatio: `${ratio}` }}>
                  {mediaType === "image" ? (
                    <img
                      src={previewSrc}
                      alt={asset.title}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : mediaType === "video" ? (
                    <video
                      className="h-full w-full object-contain"
                      src={asset.fileUrl}
                      poster={previewSrc}
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <FileIcon className="h-10 w-10 text-gray-400" />
                    </div>
                  )}
                </div>
                {isImportMode && (
                  <>
                    {isSelected && (
                      <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-900/70 bg-white/95 shadow-sm backdrop-blur">
                        <span className="absolute inset-0 rounded-full bg-black/5" />
                        <Check className="relative h-4 w-4 text-gray-900" />
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(editingAsset)} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent className="z-[120] sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Edit reference</DialogTitle>
            <DialogDescription className="sr-only">
              Update title, description, and tags for this reference.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Title</label>
              <Input
                value={editForm.title}
                onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Description</label>
              <Input
                value={editForm.description}
                onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Tags</label>
              <TagInput
                tags={editForm.tags}
                draft={editForm.tagDraft}
                onDraftChange={(value) => setEditForm((prev) => ({ ...prev, tagDraft: value }))}
                onTagsChange={(tags) => setEditForm((prev) => ({ ...prev, tags }))}
                placeholder="fashion, portrait, neon"
              />
            </div>
            {editTagSuggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-gray-500">Recent used</p>
                <div className="flex flex-wrap gap-2">
                  {editTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          tags: mergeTags(prev.tags, [tag]),
                          tagDraft: "",
                        }))
                      }
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">External link</label>
              <Input
                value={editForm.externalLink}
                onChange={(event) => setEditForm((prev) => ({ ...prev, externalLink: event.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="library-private"
                type="checkbox"
                checked={editForm.isPrivate}
                onChange={(event) => setEditForm((prev) => ({ ...prev, isPrivate: event.target.checked }))}
              />
              <label htmlFor="library-private" className="text-sm text-gray-600">
                Private reference
              </label>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setEditingAsset(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Library;
