import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
  CheckSquare,
  Square,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type FilterState = {
  search: string;
  type: "all" | "image" | "video" | "file";
  tagQuery: string;
  color: string | null;
};

type LibraryProps = {
  userId?: string;
  orgId?: string;
  searchQuery?: string;
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  isImportMode?: boolean;
  selectedItems?: Id<"assets">[];
  onSelectionChange?: (items: Id<"assets">[]) => void;
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

const filterByTags = (asset: Doc<"assets">, tags: string[]) => {
  if (tags.length === 0) return true;
  const assetTokens = asset.tokens?.map(normalize) ?? [];
  const haystack = [asset.title, asset.description, asset.fileName]
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
  const fields = [asset.title, asset.description, asset.fileName, asset.ocrText]
    .filter(Boolean)
    .map((v) => normalize(String(v)));
  const tokens = asset.tokens?.map(normalize) ?? [];
  return (
    fields.some((field) => field.includes(q)) ||
    tokens.some((token) => token.includes(q))
  );
};

export const Library: React.FC<LibraryProps> = ({
  userId,
  orgId,
  searchQuery,
  selectedTags,
  onTagsChange,
  isImportMode,
  selectedItems,
  onSelectionChange,
  onFilteredDataChange,
}) => {
  const [filters, setFilters] = useState<FilterState>({
    search: searchQuery ?? "",
    type: "all",
    tagQuery: selectedTags?.join(", ") ?? "",
    color: null,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [viewerAssetId, setViewerAssetId] = useState<Id<"assets"> | null>(null);
  const viewerContentRef = useRef<HTMLDivElement | null>(null);
  const [editingAsset, setEditingAsset] = useState<Doc<"assets"> | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    tokens: "",
    externalLink: "",
    isPrivate: false,
  });

  const assets = useQuery(api.assets.getUserLibrary, {
    userId,
    orgId,
    searchQuery: filters.search,
  });
  const updateMetadata = useMutation(api.assets.updateMetadata);
  const deleteAsset = useMutation(api.assets.deleteAsset);

  const selection = selectedItems ?? [];

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
    (assets ?? []).forEach((asset) => {
      asset.tokens?.forEach((token) => {
        const label = token.trim();
        if (!label) return;
        const key = normalize(label);
        const existing = map.get(key);
        if (existing) existing.count += 1;
        else map.set(key, { label, count: 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [assets]);

  const filteredAvailableTags = useMemo(() => {
    const query = normalize(tagSearch);
    const selectedSet = new Set(selectedTagFilters.map(normalize));
    return availableTags
      .filter((tag) => (query ? normalize(tag.label).includes(query) : true))
      .filter((tag) => !selectedSet.has(normalize(tag.label)));
  }, [availableTags, selectedTagFilters, tagSearch]);

  const colorClusters = useMemo(() => {
    if (!assets) return [] as { rep: string; colors: string[] }[];
    const palette: string[] = [];
    assets.forEach((asset) => {
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
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (!assets) return [] as Doc<"assets">[];
    return assets
      .filter((asset) => {
        if (filters.type !== "all" && asset.type !== filters.type) return false;
        if (filters.color) {
          const matchesColor = (asset.dominantColors ?? []).some(
            (color) => colorDistance(filters.color!, color) <= COLOR_THRESHOLD
          );
          if (!matchesColor) return false;
        }
        if (!matchesSearch(asset, filters.search)) return false;
        if (!filterByTags(asset, tagFilters)) return false;
        return true;
      })
      .sort((a, b) => (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime));
  }, [assets, filters, tagFilters]);

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.type !== "all" ||
    Boolean(filters.tagQuery.trim()) ||
    Boolean(filters.color);

  const viewerItems = filteredAssets;
  const viewerIndex = viewerAssetId
    ? viewerItems.findIndex((item) => item._id === viewerAssetId)
    : -1;
  const viewerAsset = viewerIndex >= 0 ? viewerItems[viewerIndex] : null;

  useEffect(() => {
    if (viewerAssetId && viewerIndex === -1) {
      setViewerAssetId(null);
    }
  }, [viewerAssetId, viewerIndex]);

  useEffect(() => {
    if (!viewerAsset) return;
    const id = window.setTimeout(() => {
      viewerContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [viewerAsset, viewerAssetId]);

  const handleViewerPrev = useCallback(() => {
    if (!viewerAsset || viewerItems.length === 0) return;
    const nextIndex = (viewerIndex - 1 + viewerItems.length) % viewerItems.length;
    setViewerAssetId(viewerItems[nextIndex]._id);
  }, [viewerAsset, viewerIndex, viewerItems]);

  const handleViewerNext = useCallback(() => {
    if (!viewerAsset || viewerItems.length === 0) return;
    const nextIndex = (viewerIndex + 1) % viewerItems.length;
    setViewerAssetId(viewerItems[nextIndex]._id);
  }, [viewerAsset, viewerIndex, viewerItems]);

  useEffect(() => {
    if (!viewerAsset) return;
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [handleViewerNext, handleViewerPrev, viewerAsset]);

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
      tokens: asset.tokens?.join(", ") ?? "",
      externalLink: asset.externalLink ?? "",
      isPrivate: Boolean(asset.isPrivate),
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingAsset) return;
    const tokens = editForm.tokens
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      await updateMetadata({
        id: editingAsset._id,
        title: editForm.title.trim() || editingAsset.title,
        description: editForm.description.trim() || undefined,
        tokens,
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
      type: "all",
      tagQuery: "",
      color: null,
    }));
    onTagsChange?.([]);
  };

  const isLoading = assets === undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={filters.search}
              onChange={(event) => handleFilterChange("search", event.target.value)}
              placeholder="Search title, filename, tags..."
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setIsFilterOpen(true)}
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-gray-700" />}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
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
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-gray-500">Type</p>
              <div className="flex flex-wrap gap-2">
                {(["all", "image", "video", "file"] as const).map((type) => (
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
            ref={viewerContentRef}
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-none max-h-[85vh] overflow-y-auto bg-white text-gray-900"
          >
            {viewerAsset && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <DialogTitle className="text-xl">
                      {viewerAsset.title || viewerAsset.fileName}
                    </DialogTitle>
                    <p className="text-xs text-gray-500">
                      {viewerIndex + 1} of {viewerItems.length}
                    </p>
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
                  <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    {viewerAsset.type === "image" ? (
                      <img
                        src={viewerAsset.fileUrl}
                        alt={viewerAsset.title}
                        className="max-h-[70vh] w-full object-contain"
                      />
                    ) : viewerAsset.type === "video" ? (
                      <video
                        src={viewerAsset.fileUrl}
                        className="max-h-[70vh] w-full object-contain"
                        controls
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-gray-500">
                        <FileIcon className="h-10 w-10" />
                        <span className="text-sm">{viewerAsset.fileName}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 text-sm text-gray-700">
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
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Type</p>
                      <p>{viewerAsset.type ?? "file"}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Author</p>
                      <p>{viewerAsset.author || "—"}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Description</p>
                      <p>{viewerAsset.description || "—"}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Tags</p>
                      {viewerAsset.tokens && viewerAsset.tokens.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {viewerAsset.tokens.map((token) => (
                            <Badge key={token} variant="secondary" className="bg-gray-100 text-gray-600">
                              {token}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p>—</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">External link</p>
                      {viewerAsset.externalLink ? (
                        <a
                          href={viewerAsset.externalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-gray-700 underline underline-offset-2"
                        >
                          {viewerAsset.externalLink}
                        </a>
                      ) : (
                        <p>—</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">File size</p>
                      <p>{formatBytes(viewerAsset.fileSize)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {viewerItems.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleViewerPrev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white shadow-sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleViewerNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white shadow-sm"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <div className="library-masonry">
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
          const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
          return (
            <div key={asset._id} className="library-masonry-item">
              <button
                className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                onClick={() => {
                  if (isImportMode) toggleSelection(asset._id);
                  else setViewerAssetId(asset._id);
                }}
              >
                <div className="w-full bg-gray-50" style={{ aspectRatio: `${ratio}` }}>
                  {mediaType === "image" ? (
                    <img
                      src={asset.fileUrl}
                      alt={asset.title}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : mediaType === "video" ? (
                    <video
                      className="h-full w-full object-contain"
                      src={asset.fileUrl}
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
                  <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow">
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {isSelected ? "Selected" : "Select"}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(editingAsset)} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Edit reference</DialogTitle>
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
              <Input
                value={editForm.tokens}
                onChange={(event) => setEditForm((prev) => ({ ...prev, tokens: event.target.value }))}
                placeholder="fashion, portrait, neon"
              />
            </div>
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
