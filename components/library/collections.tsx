"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  FolderPlus,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { uploadFileMultipart } from "@/lib/upload/multipart";

type CollectionSummary = {
  id: Id<"assetCollections">;
  title: string;
  projectId: Id<"projects"> | null;
  coverUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isShared?: boolean;
  sharedRole?: string | null;
  itemCount?: number;
  sampleUrls?: string[];
};

const pickInitialIndex = (seed: string, max: number) => {
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % max;
};

const formatCount = (n?: number) => (typeof n === "number" ? n : 0);

const CollectionCover: React.FC<{
  seed?: string;
  title: string;
  coverUrl: string | null;
  sampleUrls: string[];
}> = ({ seed, title, coverUrl, sampleUrls }) => {
  const shouldReduceMotion = useReducedMotion();
  const urls = useMemo(() => {
    const fromSamples = (sampleUrls ?? []).filter(Boolean);
    return fromSamples.slice(0, 8);
  }, [sampleUrls]);
  const pool = urls.length > 0 ? urls : coverUrl ? [coverUrl] : [];

  const [hovered, setHovered] = useState(false);
  const [activeIdx, setActiveIdx] = useState(() =>
    pickInitialIndex(seed ?? title, Math.max(1, pool.length)),
  );

  useEffect(() => {
    if (!hovered) return;
    if (pool.length <= 1) return;
    if (shouldReduceMotion) return;
    const id = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % pool.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [hovered, pool.length, shouldReduceMotion]);

  const resolvedCover = coverUrl || pool[activeIdx] || null;
  const hasAny = Boolean(resolvedCover);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="aspect-[16/10] w-full">
        {hasAny ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={resolvedCover}
              src={resolvedCover!}
              alt={title}
              className="h-full w-full object-cover"
              initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.02 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            />
          </AnimatePresence>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wide text-slate-100/80">
            Empty
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
  );
};

export const CollectionsView: React.FC = () => {
  const collectionsRaw = useQuery(api.collections.list, {});
  const projects = useQuery(api.projects.list, {});
  const shareGroups = useQuery(api.shareGroups.list, {});

  const createCollection = useMutation(api.collections.create);
  const renameCollection = useMutation(api.collections.updateTitle);
  const deleteCollection = useMutation(api.collections.remove);
  const setProject = useMutation(api.collections.setProject);
  const setCover = useMutation(api.collections.setCover);
  const clearCover = useMutation(api.collections.clearCover);
  const shareToEmail = useMutation(api.collections.shareToEmail);
  const shareToGroup = useMutation(api.collections.shareToGroup);

  const collections = (collectionsRaw ?? []) as unknown as CollectionSummary[];

  const normalizeCollectionTitleDisplay = useCallback((title: string) => {
    const cleaned = title.replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }, []);

  const normalizeCollectionTitleKey = useCallback(
    (title: string) => title.replace(/\s+/g, " ").trim().toLowerCase(),
    [],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>("none");

  const [renameOpen, setRenameOpen] = useState<{ id: Id<"assetCollections">; title: string } | null>(null);
  const [shareOpen, setShareOpen] = useState<Id<"assetCollections"> | null>(null);
  const [assignOpen, setAssignOpen] = useState<Id<"assetCollections"> | null>(null);

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("viewer");
  const [shareGroupId, setShareGroupId] = useState<string>("none");

  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverTargetId, setCoverTargetId] = useState<Id<"assetCollections"> | null>(null);

  const [activeCollectionId, setActiveCollectionId] = useState<Id<"assetCollections"> | null>(null);
  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  );
  const [deleteTarget, setDeleteTarget] = useState<CollectionSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const assignCollection = useMemo(
    () => (assignOpen ? collections.find((c) => c.id === assignOpen) ?? null : null),
    [assignOpen, collections],
  );
  const activeAssets = useQuery(
    api.collections.listAssets,
    activeCollectionId ? { collectionId: activeCollectionId } : "skip",
  ) as unknown as Array<Doc<"assets">> | undefined;
  const [viewerAsset, setViewerAsset] = useState<Doc<"assets"> | null>(null);

  const filteredCollections = useMemo(() => {
    return collections
      .slice()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [collections]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    (projects ?? []).forEach((p: any) => map.set(String(p._id), p.name));
    return map;
  }, [projects]);

  const doCreate = useCallback(async () => {
    const title = normalizeCollectionTitleDisplay(newTitle);
    if (!title) {
      toast.error("Enter a collection name");
      return;
    }
    try {
      const projectId =
        newProjectId !== "none" ? (newProjectId as any as Id<"projects">) : undefined;

      const existing = collections.find(
        (c) =>
          c.isShared === false &&
          normalizeCollectionTitleKey(String(c.title ?? "")) === normalizeCollectionTitleKey(title),
      );
      if (existing?.id) {
        toast.success("Collection already exists");
        setActiveCollectionId(existing.id);
        setCreateOpen(false);
        setNewTitle("");
        setNewProjectId("none");
        return;
      }

      await createCollection({ title, projectId });
      toast.success("Collection created");
      setCreateOpen(false);
      setNewTitle("");
      setNewProjectId("none");
    } catch (e) {
      console.error(e);
      toast.error("Unable to create collection");
    }
  }, [
    collections,
    createCollection,
    newProjectId,
    newTitle,
    normalizeCollectionTitleDisplay,
    normalizeCollectionTitleKey,
  ]);

  const handlePickCover = useCallback((collectionId: Id<"assetCollections">) => {
    setCoverTargetId(collectionId);
    coverFileInputRef.current?.click();
  }, []);

  const handleCoverFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!coverTargetId) return;
      try {
        const res = await uploadFileMultipart(file, {
          context: "library",
          autoSaveToLibrary: false,
          onProgress: () => undefined,
        });
        await setCover({
          id: coverTargetId,
          coverUrl: res.url,
        });
        toast.success("Cover updated");
      } catch (e) {
        console.error(e);
        toast.error("Cover upload failed");
      } finally {
        setCoverTargetId(null);
      }
    },
    [coverTargetId, setCover],
  );

  const handleRename = useCallback(async () => {
    if (!renameOpen) return;
    const title = normalizeCollectionTitleDisplay(renameOpen.title);
    if (!title) {
      toast.error("Enter a valid name");
      return;
    }
    try {
      const existing = collections.find(
        (c) =>
          c.isShared === false &&
          c.id !== renameOpen.id &&
          normalizeCollectionTitleKey(String(c.title ?? "")) === normalizeCollectionTitleKey(title),
      );
      if (existing?.id) {
        toast.error("A collection with this name already exists");
        return;
      }
      await renameCollection({ id: renameOpen.id, title });
      toast.success("Name updated");
      setRenameOpen(null);
    } catch (e) {
      console.error(e);
      toast.error("Unable to rename");
    }
  }, [
    collections,
    normalizeCollectionTitleDisplay,
    normalizeCollectionTitleKey,
    renameCollection,
    renameOpen,
  ]);

  const requestDelete = useCallback(
    (collection: CollectionSummary) => {
      setDeleteTarget(collection);
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteCollection({ id: deleteTarget.id });
      toast.success("Collection deleted");
      if (activeCollectionId === deleteTarget.id) setActiveCollectionId(null);
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      toast.error("Unable to delete collection");
    } finally {
      setIsDeleting(false);
    }
  }, [activeCollectionId, deleteCollection, deleteTarget, isDeleting]);

  const handleShare = useCallback(async () => {
    if (!shareOpen) return;
    const email = shareEmail.trim();
    try {
      if (email) {
        await shareToEmail({ id: shareOpen, email, role: shareRole });
        toast.success("Shared via email");
        setShareEmail("");
      }
      if (shareGroupId !== "none") {
        await shareToGroup({ id: shareOpen, groupId: shareGroupId as any, role: shareRole });
        toast.success("Shared with group");
        setShareGroupId("none");
      }
      setShareOpen(null);
    } catch (e) {
      console.error(e);
      toast.error("Unable to share");
    }
  }, [shareEmail, shareGroupId, shareOpen, shareRole, shareToEmail, shareToGroup]);

  const handleAssign = useCallback(
    async (collectionId: Id<"assetCollections">, projectId: string) => {
      try {
        await setProject({
          id: collectionId,
          projectId: projectId !== "none" ? (projectId as any) : undefined,
        });
        toast.success("Workspace updated");
        setAssignOpen(null);
      } catch (e) {
        console.error(e);
        toast.error("Unable to assign workspace");
      }
    },
    [setProject],
  );

  const onBack = useCallback(() => {
    setActiveCollectionId(null);
    setViewerAsset(null);
  }, []);

  const ratioFor = useCallback((asset: Doc<"assets">) => {
    if (asset.width && asset.height) return asset.width / asset.height;
    return 1;
  }, []);

  return (
    <div className="space-y-6">
      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverFile}
      />

      {activeCollection ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={onBack} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{activeCollection.title}</h2>
                <p className="text-xs text-gray-500">{formatCount(activeCollection.itemCount)} refs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={Boolean(activeCollection.isShared)}
                onClick={() => setRenameOpen({ id: activeCollection.id, title: activeCollection.title })}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={Boolean(activeCollection.isShared)}
                onClick={() => handlePickCover(activeCollection.id)}
              >
                <Upload className="h-4 w-4" />
                Cover
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={Boolean(activeCollection.isShared)}
                onClick={() => setShareOpen(activeCollection.id)}
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          <div className="library-masonry">
            {(activeAssets ?? []).length === 0 && (
              <div className="library-masonry-item rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                No references in this collection yet.
              </div>
            )}
            {(activeAssets ?? []).map((asset) => {
              const mediaType = asset.type ?? "file";
              const ratio = ratioFor(asset);
              return (
                <div key={asset._id} className="library-masonry-item">
                  <button
                    className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                    onClick={() => setViewerAsset(asset)}
                  >
                    <div className="w-full bg-gray-50" style={{ aspectRatio: `${ratio}` }}>
                      {mediaType === "image" ? (
                        <img src={asset.fileUrl} alt={asset.title} className="h-full w-full object-contain" loading="lazy" />
                      ) : mediaType === "video" ? (
                        <video className="h-full w-full object-contain" src={asset.fileUrl} preload="metadata" muted playsInline />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">File</div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Collections</h2>
              <p className="text-xs text-gray-500">
                {filteredCollections.length} collection{filteredCollections.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              New collection
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCollections.map((c) => {
              const sampleUrls = (c.sampleUrls ?? []).filter(Boolean);
              const projectName = c.projectId ? projectNameById.get(String(c.projectId)) : null;
              const isShared = Boolean(c.isShared);

              return (
                <div key={String(c.id)} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md">
                  <button
                    className="w-full text-left"
                    onClick={() => setActiveCollectionId(c.id)}
                    title={c.title}
                  >
                    <CollectionCover seed={String(c.id)} title={c.title} coverUrl={c.coverUrl ?? null} sampleUrls={sampleUrls} />
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{c.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-500">
                          <span>{formatCount(c.itemCount)} refs</span>
                          {projectName && (
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                              {projectName}
                            </span>
                          )}
                          {isShared && (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                              Shared
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-gray-500">
                      {isShared ? (c.sharedRole ? `Role: ${c.sharedRole}` : "Shared") : "Owner"}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white text-gray-900">
                        <DropdownMenuItem disabled={isShared} onClick={() => setRenameOpen({ id: c.id, title: c.title })}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={isShared} onClick={() => { setAssignOpen(c.id); }}>
                          <LayoutGrid className="mr-2 h-4 w-4" />
                          Assign workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={isShared} onClick={() => setShareOpen(c.id)}>
                          <Share2 className="mr-2 h-4 w-4" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={isShared} onClick={() => handlePickCover(c.id)}>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload cover
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isShared}
                          onClick={async () => {
                            try {
                              await clearCover({ id: c.id });
                              toast.success("Cover removed");
                            } catch (e) {
                              console.error(e);
                              toast.error("Unable to remove cover");
                            }
                          }}
                        >
                          Remove cover
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isShared}
                          className="text-red-600 focus:text-red-600"
                          onClick={() => requestDelete(c)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Create a folder to group references.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Name</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Moodboard 2026" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Workspace (optional)</label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">None</SelectItem>
                  {(projects ?? []).map((p: any) => (
                    <SelectItem key={String(p._id)} value={String(p._id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameOpen)} onOpenChange={(v) => !v && setRenameOpen(null)}>
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Rename collection</DialogTitle>
            <DialogDescription className="sr-only">Rename collection</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Name</label>
            <Input
              value={renameOpen?.title ?? ""}
              onChange={(e) => setRenameOpen((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
            />
          </div>
          <DialogFooter className="justify-between">
            <Button variant="ghost" onClick={() => setRenameOpen(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignOpen)} onOpenChange={(v) => !v && setAssignOpen(null)}>
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Assign workspace</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Link this collection to a workspace (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Workspace</label>
            <Select
              value={assignCollection?.projectId ? String(assignCollection.projectId) : "none"}
              onValueChange={(value) => assignOpen && handleAssign(assignOpen, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="none">None</SelectItem>
                {(projects ?? []).map((p: any) => (
                  <SelectItem key={String(p._id)} value={String(p._id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(shareOpen)} onOpenChange={(v) => !v && setShareOpen(null)}>
        <DialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Share collection</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Share with someone via email or with a group.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Role</label>
              <Select value={shareRole} onValueChange={(v: any) => setShareRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Email</label>
              <Input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-500">Group</label>
              <Select value={shareGroupId} onValueChange={setShareGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">None</SelectItem>
                  {(shareGroups ?? []).map((g: any) => (
                    <SelectItem key={String(g.id)} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <Button variant="ghost" onClick={() => setShareOpen(null)}>
              Cancel
            </Button>
            <Button onClick={handleShare}>Share</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-[520px] bg-white text-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600">
              This will permanently delete{" "}
              <span className="font-semibold text-gray-900">
                {deleteTarget?.title ?? "this collection"}
              </span>
              . References will remain in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-slate-50"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(viewerAsset)} onOpenChange={(v) => !v && setViewerAsset(null)}>
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[86vw] max-w-[980px] max-h-[84vh] overflow-y-auto bg-white text-gray-900">
          {viewerAsset && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-lg">
                  {viewerAsset.title || viewerAsset.fileName}
                </DialogTitle>
                <DialogDescription className="sr-only">Asset preview</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 p-4">
                {viewerAsset.type === "image" ? (
                  <img src={viewerAsset.fileUrl} alt={viewerAsset.title} className="max-h-[70vh] w-full object-contain" />
                ) : viewerAsset.type === "video" ? (
                  <video src={viewerAsset.fileUrl} className="max-h-[70vh] w-full object-contain" controls />
                ) : (
                  <div className="text-sm text-gray-500">{viewerAsset.fileName}</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
