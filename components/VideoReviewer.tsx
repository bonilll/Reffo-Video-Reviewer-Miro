import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Video,
  Annotation,
  Comment,
  AnnotationTool,
  Point,
  RectangleAnnotation,
  EllipseAnnotation,
  TextAnnotation,
  CurrentUserProfile,
} from '../types';
import VideoPlayer from './VideoPlayer';
import AnnotationCanvas from './AnnotationCanvas';
import CommentsPane from './CommentsPane';
import Toolbar from './Toolbar';
import { ChevronLeft, Eye, EyeOff, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, StepBack, StepForward, Maximize, Minimize, Share2, PanelRightOpen, PanelRightClose } from 'lucide-react';
import Timeline from './Timeline';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useThemePreference, ThemePref } from '../useTheme';
import { ShareModal } from './Dashboard';
import { useUser } from '@clerk/clerk-react';
import { compressImageFile } from '../utils/imageCompression';

type CompareMode = 'overlay' | 'side-by-side-horizontal' | 'side-by-side-vertical';

interface ReviewFocusContext {
  commentId?: string | null;
  frame?: number | null;
  mentionText?: string | null;
}

interface VideoReviewerProps {
  video: Video;
  sourceUrl?: string;
  onGoBack: () => void;
  theme?: ThemePref;
  initialFocus?: ReviewFocusContext | null;
  onConsumeInitialFocus?: () => void;
  onOpenEditor?: (compositionId: Id<'compositions'>) => void;
}

const DEFAULT_COMMENT_POSITION: Point = { x: 0.5, y: 0.5 };
const getCommentSeenStorageKey = (videoId: string) => `videoreviewer:comment-seen:${videoId}`;
const loadCommentSeenMap = (videoId: string): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getCommentSeenStorageKey(videoId));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type NotificationRecord = {
  id: string;
  type: string;
  commentId: string | null;
  readAt: number | null;
  mentionText?: string | null;
  videoId?: string | null;
};

type AnnotationHistoryEntry =
  | { kind: 'create'; annotations: Annotation[] }
  | { kind: 'delete'; annotations: Annotation[] }
  | { kind: 'update'; before: Annotation[]; after: Annotation[] };

const MAX_HISTORY_ENTRIES = 100;

const cloneAnnotation = (annotation: Annotation): Annotation =>
  JSON.parse(JSON.stringify(annotation)) as Annotation;

const cloneAnnotations = (items: Annotation[]): Annotation[] => items.map(cloneAnnotation);

const toCreatePayload = (annotation: Annotation) => {
  const payload = cloneAnnotation(annotation) as any;
  delete payload.id;
  delete payload.videoId;
  delete payload.authorId;
  delete payload.createdAt;
  delete payload.updatedAt;
  return payload;
};

const uploadBlobWithProgress = (url: string, blob: Blob, onProgress?: (percent: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      const percent = (event.loaded / event.total) * 100;
      onProgress(Math.max(0, Math.min(100, percent)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    if (blob.type) {
      xhr.setRequestHeader('Content-Type', blob.type);
    }
    xhr.send(blob);
  });

const VideoReviewer: React.FC<VideoReviewerProps> = ({ video, sourceUrl, onGoBack, theme = 'system', initialFocus = null, onConsumeInitialFocus, onOpenEditor }) => {
  const isDark = useThemePreference(theme);
  const { user: clerkUser, isSignedIn } = useUser();
  const currentUser = useQuery(api.users.current, isSignedIn ? {} : "skip") as
    | CurrentUserProfile
    | null
    | undefined;
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  
  // Comments pane visibility (default closed on small screens)
  const [showComments, setShowComments] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  const [pendingComment, setPendingComment] = useState<{ position: Point } | null>(null);


  const videoRef = useRef<HTMLVideoElement>(null);
  // Container for the whole reviewer "stage" (video + controls). Used for fullscreen + resize observing.
  const containerRef = useRef<HTMLDivElement>(null);
	  const [isPlaying, setIsPlaying] = useState(false);
	  const [currentTime, setCurrentTime] = useState(0);
	  const [currentFrame, setCurrentFrame] = useState(0);
	  // Throttle state churn from video frame callbacks and aggressive scrubbing.
	  const pendingTimeRef = useRef<number>(0);
	  const pendingFrameRef = useRef<number>(0);
	  const timeRafRef = useRef<number | null>(null);
	  const lastUiCommitRef = useRef<number>(0);
	  const pendingSeekRef = useRef<number | null>(null);
	  const seekRafRef = useRef<number | null>(null);
  
  const [activeTool, setActiveTool] = useState<AnnotationTool>(AnnotationTool.SELECT);
  const [brushColor, setBrushColorState] = useState('#ef4444'); // red-500
  const [brushSize, setBrushSizeState] = useState(4);
  const [fontSize, setFontSize] = useState(16);
  const [shapeFillEnabled, setShapeFillEnabled] = useState(true);
  const [shapeFillOpacity, setShapeFillOpacity] = useState(0.35);
  const undoStack = useRef<AnnotationHistoryEntry[]>([]);
  const redoStack = useRef<AnnotationHistoryEntry[]>([]);
  const historyRecordingRef = useRef(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const pushHistory = useCallback((entry: AnnotationHistoryEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_HISTORY_ENTRIES) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(false);
  }, []);

  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const selectedAnnotations = useMemo(() => {
    if (selectedAnnotationIds.length === 0) return [];
    const selectedSet = new Set(selectedAnnotationIds);
    return annotations.filter((a) => selectedSet.has(a.id));
  }, [annotations, selectedAnnotationIds]);
  
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeCommentPopoverId, setActiveCommentPopoverId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState<string | null>(null);

  const videoId = video.id as Id<'videos'>;

  // When annotations are hidden, also hide comment bubbles/popovers on canvas
  useEffect(() => {
    if (!showAnnotations) {
      setActiveCommentPopoverId(null);
      setPendingComment(null);
    }
  }, [showAnnotations]);

  const annotationsQuery = useQuery(api.annotations.listByVideo, { videoId });
  const commentsQuery = useQuery(api.comments.listByVideo, { videoId });

  const createAnnotationMutation = useMutation(api.annotations.create);
  const updateAnnotationMutation = useMutation(api.annotations.update);
  const deleteAnnotationsMutation = useMutation(api.annotations.removeMany);

  const createCommentMutation = useMutation(api.comments.create);
  const createCompositionMutation = useMutation(api.edits.createComposition);
  const attachEditedClipMutation = useMutation(api.edits.attachExportToReview);
  const toggleCommentResolvedMutation = useMutation(api.comments.toggleResolved);
  const deleteCommentMutation = useMutation(api.comments.remove);
  const updateCommentPositionMutation = useMutation(api.comments.updatePosition);
  const updateCommentTextMutation = useMutation(api.comments.updateText);
  const getDownloadUrlAction = useAction(api.storage.getDownloadUrl);
  const generateAnnotationAssetUploadUrl = useAction(api.storage.generateAnnotationAssetUploadUrl);
  const syncFriends = useMutation(api.shareGroups.syncFriendsFromGroups);
  // Sharing data (reuse Dashboard flows)
  const shareGroups = useQuery(api.shareGroups.list, clerkUser ? {} : undefined);
  const shareRecords = useQuery(api.shares.list, clerkUser ? {} : undefined);
  const mentionableOptions = useQuery(api.comments.mentionables, { videoId });
  const generateShareLink = useMutation(api.shares.generateLink);
  const shareToGroup = useMutation(api.shares.shareToGroup);
  const revokeShare = useMutation(api.shares.revoke);
  const [shareOpen, setShareOpen] = useState(false);
  const notifications = useQuery(api.notifications.list, {}) as NotificationRecord[] | undefined;
  const markNotificationRead = useMutation(api.notifications.markRead);
  const [commentSeenAt, setCommentSeenAt] = useState<Record<string, number>>(() => loadCommentSeenMap(video.id));
  const pendingMentionReads = useRef<Set<string>>(new Set());

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackKind, setPlaybackKind] = useState<'signed' | 'public' | 'provided'>('public');
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [creatingEdit, setCreatingEdit] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceUploading, setReplaceUploading] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [confirmDeleteRevision, setConfirmDeleteRevision] = useState<any | null>(null);
  const [deletingRevision, setDeletingRevision] = useState(false);
  const listRevisions = useQuery(api.videos.listRevisions as any, { videoId: video.id as any }) as Array<any> | undefined;
  const replaceSource = useMutation(api.videos.replaceSource as any);
  const deleteRevision = useMutation(api.videos.deleteRevision as any);
  const generateVideoUploadUrl = useAction(api.storage.generateVideoUploadUrl);
  // Multipart upload actions for large replacements (align with Dashboard)
  const createMultipart = useAction((api as any).storage.createMultipartUpload);
  const getMultipartUrls = useAction((api as any).storage.getMultipartUploadUrls);
  const completeMultipart = useAction((api as any).storage.completeMultipartUpload);
  const abortMultipart = useAction((api as any).storage.abortMultipartUpload);

  const resolveContentType = (file: File): string => {
    const t = (file.type || '').toLowerCase();
    if (t && t !== 'application/octet-stream') return t;
    const name = file.name.toLowerCase();
    if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
    if (name.endsWith('.webm')) return 'video/webm';
    if (name.endsWith('.mov')) return 'video/quicktime';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.png')) return 'image/png';
    return 'application/octet-stream';
  };

  const uploadMultipart = async (file: File, contentType: string, onProgress: (p: number) => void, reviewContextId: string) => {
    const partSize = 16 * 1024 * 1024; // 16MB parts
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));
    const { storageKey, uploadId, publicUrl } = await createMultipart({
      contentType,
      fileName: file.name,
      context: "review",
      contextId: reviewContextId,
    });
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const { urls } = await getMultipartUrls({ storageKey, uploadId, partNumbers, contentType });
    const completed: Array<{ ETag: string; PartNumber: number }> = [];
    let uploadedBytes = 0;
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
        xhr.timeout = 1000 * 60 * 15; // 15 min per part
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const partProgress = e.loaded;
            onProgress(Math.round(((uploadedBytes + partProgress) / file.size) * 100));
          }
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              const raw = xhr.getResponseHeader('ETag') || '';
              resolve(raw.replaceAll('"', ''));
            } else {
              reject(new Error(`Part ${partNumber} failed with status ${xhr.status} ${xhr.statusText || ''}`.trim()));
            }
          }
        };
        xhr.onerror = () => reject(new Error(`Network error on part ${partNumber}`));
        xhr.ontimeout = () => reject(new Error(`Timeout on part ${partNumber}`));
        xhr.send(blob);
      });
      uploadedBytes += blob.size;
      onProgress(Math.round((uploadedBytes / file.size) * 100));
      completed.push({ ETag: etag, PartNumber: partNumber });
    }
    await completeMultipart({ storageKey, uploadId, parts: completed });
    return { storageKey, publicUrl } as { storageKey: string; publicUrl: string };
  };
	  // Allow owners to insert their rendered edits back into the review
	  const showInsertButton = Boolean(video.isOwnedByCurrentUser);
	  // Editor entrypoint is intentionally hidden in reviewer UI (user request).
	  const showEditButton = false;
  const [exportsForVideo, setExportsForVideo] = useState<Array<{ export: any; composition: any }> | undefined>(undefined);
  const completedExports = (exportsForVideo ?? []).filter(
    (item) => item.export.status === 'completed' && item.export.outputPublicUrl,
  );
  const hasAttachableExports = showInsertButton && completedExports.length > 0;
  const [insertEditOpen, setInsertEditOpen] = useState(false);
  const [selectedExportId, setSelectedExportId] = useState<string | null>(null);
  const [insertFrame, setInsertFrame] = useState<number>(0);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  // A–B loop state (seconds)
  const [abLoopEnabled, setAbLoopEnabled] = useState(false);
  const [abA, setAbA] = useState<number | null>(null);
  const [abB, setAbB] = useState<number | null>(null);

  // Auto-open insert dialog when ?insertExport=ID is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const insertId = params.get('insertExport');
    if (!insertId) return;
    if (!exportsForVideo || exportsForVideo.length === 0) return;
    const found = exportsForVideo.find((it) => (it.export._id as string) === insertId && it.export.status === 'completed' && it.export.outputPublicUrl);
    if (!found) return;
    setSelectedExportId(insertId);
    setInsertEditOpen(true);
    // Clean up param in URL (shallow)
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('insertExport');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {}
  }, [exportsForVideo]);
  const [loopMenuOpen, setLoopMenuOpen] = useState(false);
  const [effectiveFps, setEffectiveFps] = useState<number>(Math.max(1, Math.floor(video.fps || 24)));
  const [fpsDetected, setFpsDetected] = useState<boolean>(false);

  // Reset FPS detection marker when switching video/source
  useEffect(() => {
    setFpsDetected(false);
  }, [video.id, playbackUrl]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareSource, setCompareSource] = useState<{ url: string; name: string; objectUrl?: boolean } | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('overlay');
  const [compareOpacity, setCompareOpacity] = useState(0.6);
  const [compareDraft, setCompareDraft] = useState<{ url: string | null; name: string | null; objectUrl?: boolean; mode: CompareMode; opacity: number; offsetFrames: number }>({ url: null, name: null, objectUrl: false, mode: 'overlay', opacity: 0.6, offsetFrames: 0 });
  const compareVideoOverlayRef = useRef<HTMLVideoElement>(null);
  const compareVideoSideRef = useRef<HTMLVideoElement>(null);
  const draftUrlRef = useRef<string | null>(null);
  const prevCompareUrlRef = useRef<string | null>(null);
  const appliedFocusRef = useRef<string | null>(null);
  const [compareOffsetFrames, setCompareOffsetFrames] = useState<number>(0);

  useEffect(() => {
    // Ensure 'Friends' are synced from groups even when landing directly in reviewer.
    void syncFriends({}).catch(() => undefined);
  }, [syncFriends]);

  const rootIdLookup = useMemo(() => {
    const parentById = new Map<string, string | null>();
    comments.forEach((comment) => parentById.set(comment.id, comment.parentId ?? null));
    const cache = new Map<string, string>();

    const resolve = (id: string): string => {
      const cached = cache.get(id);
      if (cached) return cached;
      const parent = parentById.get(id);
      if (!parent) {
        cache.set(id, id);
        return id;
      }
      const root = resolve(parent);
      cache.set(id, root);
      return root;
    };

    comments.forEach((comment) => {
      cache.set(comment.id, resolve(comment.id));
    });

    return cache;
  }, [comments]);

  const resolveRootCommentId = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      return rootIdLookup.get(id) ?? id;
    },
    [rootIdLookup],
  );

  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    comments.forEach((comment) => {
      const rootId = resolveRootCommentId(comment.id);
      if (!rootId) return;
      counts[rootId] = (counts[rootId] ?? 0) + 1;
    });
    return counts;
  }, [comments, resolveRootCommentId]);

  const threadLatestActivity = useMemo(() => {
    const latest: Record<string, number> = {};
    comments.forEach((comment) => {
      const rootId = resolveRootCommentId(comment.id);
      if (!rootId) return;
      const created = Date.parse(comment.createdAt);
      if (Number.isNaN(created)) return;
      latest[rootId] = Math.max(latest[rootId] ?? 0, created);
    });
    return latest;
  }, [comments, resolveRootCommentId]);

  const threadUnread = useMemo(() => {
    const unread: Record<string, boolean> = {};
    Object.entries(threadLatestActivity).forEach(([rootId, updated]) => {
      const seenAt = commentSeenAt[rootId] ?? 0;
      unread[rootId] = seenAt < updated;
    });
    return unread;
  }, [commentSeenAt, threadLatestActivity]);

  const mentionAlerts = useMemo(() => {
    const alerts: Record<string, { unread: boolean; notificationIds: string[] }> = {};
    (notifications ?? []).forEach((notification) => {
      if (notification.type !== 'mention' || !notification.commentId) return;
      const rootId = resolveRootCommentId(notification.commentId);
      if (!rootId) return;
      const entry = alerts[rootId] ?? { unread: false, notificationIds: [] };
      entry.unread = entry.unread || !notification.readAt;
      entry.notificationIds.push(notification.id);
      alerts[rootId] = entry;
    });
    return alerts;
  }, [notifications, resolveRootCommentId]);

  const commentThreadMeta = useMemo(() => {
    const meta: Record<string, { count: number; unread: boolean; mentionAlert: { unread: boolean; notificationIds: string[] } | null }> = {};
    comments.forEach((comment) => {
      const rootId = resolveRootCommentId(comment.id) ?? comment.id;
      meta[comment.id] = {
        count: threadCounts[rootId] ?? 1,
        unread: threadUnread[rootId] ?? false,
        mentionAlert: mentionAlerts[rootId] ?? null,
      };
    });
    return meta;
  }, [comments, mentionAlerts, resolveRootCommentId, threadCounts, threadUnread]);

  const markCommentSeen = useCallback((rootId: string) => {
    setCommentSeenAt((prev) => {
      const now = Date.now();
      if (prev[rootId] && prev[rootId] >= now - 250) {
        return prev;
      }
      return { ...prev, [rootId]: now };
    });
  }, []);

  const markMentionsAsRead = useCallback(
    (rootId: string) => {
      const entry = mentionAlerts[rootId];
      if (!entry || !entry.unread) return;
      entry.notificationIds.forEach((notificationId) => {
        if (pendingMentionReads.current.has(notificationId)) return;
        pendingMentionReads.current.add(notificationId);
        void markNotificationRead({ notificationId: notificationId as Id<'notifications'> }).finally(() => {
          pendingMentionReads.current.delete(notificationId);
        });
      });
    },
    [markNotificationRead, mentionAlerts],
  );

  useEffect(() => {
    const rootId = resolveRootCommentId(activeCommentId);
    if (!rootId) return;
    markCommentSeen(rootId);
    markMentionsAsRead(rootId);
  }, [activeCommentId, markCommentSeen, markMentionsAsRead, resolveRootCommentId]);

  useEffect(() => {
    const rootId = resolveRootCommentId(activeCommentPopoverId);
    if (!rootId) return;
    markCommentSeen(rootId);
    markMentionsAsRead(rootId);
  }, [activeCommentPopoverId, markCommentSeen, markMentionsAsRead, resolveRootCommentId]);

  useEffect(() => {
    setCommentSeenAt(loadCommentSeenMap(video.id));
  }, [video.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getCommentSeenStorageKey(video.id), JSON.stringify(commentSeenAt));
    } catch {
      // no-op
    }
  }, [commentSeenAt, video.id]);

  const loadVideoMetadata = useCallback((file: File) => {
    return new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const videoEl = document.createElement('video');
      const revoke = () => {
        if (videoEl.src.startsWith('blob:')) URL.revokeObjectURL(videoEl.src);
      };
      videoEl.preload = 'metadata';
      videoEl.onloadedmetadata = () => {
        const meta = {
          width: videoEl.videoWidth || 1920,
          height: videoEl.videoHeight || 1080,
          duration: Number.isFinite(videoEl.duration) ? videoEl.duration : 0,
        };
        revoke();
        resolve(meta);
      };
      videoEl.onerror = () => {
        revoke();
        reject(new Error('Unable to read video metadata.'));
      };
      videoEl.src = URL.createObjectURL(file);
    });
  }, []);

  const uploadAnnotationAsset = useCallback(
    async (
      file: File,
      kind: 'image' | 'video',
      onProgress: (progressPercent: number) => void,
    ): Promise<{
      src: string;
      storageKey: string;
      byteSize: number;
      mimeType: string;
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
      duration?: number;
    }> => {
      try {
        if (kind === 'image') {
          onProgress?.(5);
          const compressed = await compressImageFile(file, {
            maxBytes: 20 * 1024 * 1024,
            maxDimension: 2560,
            minDimension: 320,
          });
          onProgress?.(20);

          const uploadDetails = await generateAnnotationAssetUploadUrl({
            contentType: compressed.mimeType,
            fileName: file.name,
            videoId: video.id as Id<'videos'>,
            assetType: 'image',
          });
          if (!uploadDetails) {
            throw new Error('Unable to obtain upload credentials');
          }
          onProgress?.(30);

          await uploadBlobWithProgress(uploadDetails.uploadUrl, compressed.blob, (p) => {
            const mapped = 30 + p * 0.7;
            onProgress?.(Math.min(99, mapped));
          });

          onProgress?.(100);
          return {
            src: uploadDetails.publicUrl,
            storageKey: uploadDetails.storageKey,
            byteSize: compressed.blob.size,
            mimeType: compressed.mimeType,
            width: compressed.width,
            height: compressed.height,
            originalWidth: compressed.originalWidth,
            originalHeight: compressed.originalHeight,
          };
        }

        const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error('Video exceeds the 200MB limit. Please upload a shorter clip.');
        }

        onProgress?.(5);
        const metadata = await loadVideoMetadata(file);
        onProgress?.(15);

        const mimeType = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4';
        const uploadDetails = await generateAnnotationAssetUploadUrl({
          contentType: mimeType,
          fileName: file.name,
          videoId: video.id as Id<'videos'>,
          assetType: 'video',
        });
        if (!uploadDetails) {
          throw new Error('Unable to obtain upload credentials');
        }
        onProgress?.(25);

        await uploadBlobWithProgress(uploadDetails.uploadUrl, file, (p) => {
          const mapped = 25 + p * 0.7;
          onProgress?.(Math.min(99, mapped));
        });

        onProgress?.(100);
        return {
          src: uploadDetails.publicUrl,
          storageKey: uploadDetails.storageKey,
          byteSize: file.size,
          mimeType,
          width: metadata.width,
          height: metadata.height,
          originalWidth: metadata.width,
          originalHeight: metadata.height,
          duration: metadata.duration,
        };
      } catch (error) {
        console.error('Annotation media upload failed', error);
        const message = error instanceof Error ? error.message : 'Media upload failed';
        throw new Error(message);
      }
    },
    [generateAnnotationAssetUploadUrl, loadVideoMetadata, video.id],
  );

  useEffect(() => {
    const prev = prevCompareUrlRef.current;
    const nextUrl = compareSource?.objectUrl ? compareSource.url : null;
    if (prev && prev.startsWith('blob:') && prev !== nextUrl) {
      URL.revokeObjectURL(prev);
    }
    prevCompareUrlRef.current = nextUrl ?? null;
  }, [compareSource]);

  useEffect(() => {
    return () => {
      if (prevCompareUrlRef.current && prevCompareUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(prevCompareUrlRef.current);
      }
      if (draftUrlRef.current && draftUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(draftUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        if (sourceUrl) {
          if (!cancelled) { setPlaybackUrl(sourceUrl); setPlaybackKind('provided'); setPlaybackAttempt(0); }
        } else if (video.storageKey) {
          const url = await getDownloadUrlAction({ storageKey: video.storageKey });
          if (!cancelled) { setPlaybackUrl(url); setPlaybackKind('signed'); setPlaybackAttempt(0); }
        } else {
          if (!cancelled) { setPlaybackUrl(video.src); setPlaybackKind('public'); setPlaybackAttempt(0); }
        }
      } catch (e) {
        console.error('Failed to get playback URL, falling back to video.src', e);
        if (!cancelled) { setPlaybackUrl(video.src); setPlaybackKind('public'); setPlaybackAttempt(0); }
      }
    };
    setup();
    return () => { cancelled = true; };
  }, [video.id, video.storageKey, video.src, sourceUrl, getDownloadUrlAction]);

  // Fallback if the main video fails to become playable
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let timer: number | undefined;
    const tryFallback = async (reason: string) => {
      if (playbackAttempt > 0) return; // single fallback
      setPlaybackAttempt(1);
      console.warn('Playback fallback due to', reason, 'from', playbackKind);
      try {
        if (playbackKind !== 'public' && video.src) {
          setPlaybackUrl(video.src);
          setPlaybackKind('public');
          return;
        }
        if (playbackKind !== 'signed' && video.storageKey) {
          const url = await getDownloadUrlAction({ storageKey: video.storageKey });
          setPlaybackUrl(url);
          setPlaybackKind('signed');
          return;
        }
      } catch (e) {
        console.error('Fallback failed', e);
      }
    };
    const onCanPlay = () => { if (timer) window.clearTimeout(timer); };
    const onError = () => tryFallback('error');
    const onStalled = () => { if (!el.readyState || el.readyState < 3) tryFallback('stalled'); };
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('error', onError);
    el.addEventListener('stalled', onStalled);
    timer = window.setTimeout(() => { if (!el.readyState || el.readyState < 3) tryFallback('timeout'); }, 10000);
    return () => {
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('error', onError);
      el.removeEventListener('stalled', onStalled);
      if (timer) window.clearTimeout(timer);
    };
  }, [playbackUrl, playbackKind, playbackAttempt, video.storageKey, video.src, getDownloadUrlAction]);

  const compareElements = useCallback(() => {
    const els: HTMLVideoElement[] = [];
    if (compareVideoOverlayRef.current) els.push(compareVideoOverlayRef.current);
    if (compareVideoSideRef.current) els.push(compareVideoSideRef.current);
    return els;
  }, []);

  // Smoothly synchronize the comparison element to the main video's time
  const syncCompareElement = useCallback((el: HTMLVideoElement, mainTime: number) => {
    if (!el) return;
    const fps = Math.max(1, Math.floor(video.fps || 24));
    const offsetSec = Math.max(0, compareOffsetFrames) / fps;
    const target = Math.max(0, mainTime - offsetSec);

    // Before offset: keep paused at 0 for a clean start
    if (mainTime + 1 / fps < offsetSec) {
      try { el.pause(); } catch {}
      try { if (el.currentTime !== 0) el.currentTime = 0; } catch {}
      el.playbackRate = 1.0;
      return;
    }

    const current = el.currentTime || 0;
    const diff = target - current;
    const SEEK_THRESHOLD = 0.75; // seconds – bigger jumps seek to avoid drift
    const RATE_EPSILON = 0.04;   // seconds – tiny diffs use normal rate
    if (Math.abs(diff) > SEEK_THRESHOLD) {
      try { el.currentTime = target; } catch {}
      el.playbackRate = 1.0;
      if (isPlaying) { const p = el.play(); (p as any)?.catch?.(() => undefined); }
    } else {
      // Micro adjust playbackRate to converge smoothly without thrashing seeks
      // Scale correction by diff (sec) with gentle factor and clamp
      const correction = 1.0 + diff * 0.6; // 0.6 chosen empirically for quick converge without jitter
      const rate = Math.max(0.8, Math.min(1.25, correction));
      el.playbackRate = Math.abs(diff) < RATE_EPSILON ? 1.0 : rate;
      if (isPlaying) { const p = el.play(); (p as any)?.catch?.(() => undefined); } else { try { el.pause(); } catch {} }
    }
  }, [compareOffsetFrames, video.fps, isPlaying]);

  useEffect(() => {
    const els = compareElements();
    els.forEach((el) => {
      if (!compareSource) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        return;
      }
      el.muted = true;
      el.loop = loopEnabled;
      const sync = () => {
        const mainTime = videoRef.current?.currentTime ?? 0;
        if (!Number.isNaN(mainTime)) syncCompareElement(el, mainTime);
      };
      if (el.readyState >= 1) {
        sync();
      } else {
        el.addEventListener('loadedmetadata', sync, { once: true });
      }
    });
    // Also resync when layout/mode or offset changes so newly mounted element plays in sync
  }, [compareSource, compareMode, compareOffsetFrames, video.fps, loopEnabled, isPlaying, compareElements, syncCompareElement]);

  useEffect(() => {
    const els = compareElements();
    els.forEach((el) => {
      if (!compareSource) return;
      const mainTime = videoRef.current?.currentTime ?? 0;
      if (!Number.isNaN(mainTime)) syncCompareElement(el, mainTime);
    });
    // Ensure play/pause and minor drift corrections when switching between overlay/side-by-side
  }, [isPlaying, compareSource, compareMode, compareElements, syncCompareElement]);

  const convertAnnotationFromServer = useCallback((doc: any): Annotation => {
    const { id, videoId: docVideoId, authorId, createdAt, ...rest } = doc;
    return {
      ...(rest as Partial<Annotation>),
      id,
      videoId: docVideoId,
      authorId,
      createdAt: new Date(createdAt ?? Date.now()).toISOString(),
    } as Annotation;
  }, []);

  const openCompareModal = useCallback(() => {
    if (draftUrlRef.current && draftUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(draftUrlRef.current);
      draftUrlRef.current = null;
    }
    setCompareDraft({
      url: compareSource?.url ?? null,
      name: compareSource?.name ?? null,
      objectUrl: false,
      mode: compareMode,
      opacity: compareOpacity,
      offsetFrames: compareOffsetFrames,
    });
    setCompareModalOpen(true);
  }, [compareSource, compareMode, compareOpacity, compareOffsetFrames]);

  const closeCompareModal = useCallback(() => {
    if (draftUrlRef.current && draftUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(draftUrlRef.current);
      draftUrlRef.current = null;
    }
    setCompareModalOpen(false);
  }, []);

  const applyCompareDraft = useCallback(() => {
    if (compareDraft.url) {
      setCompareSource({
        url: compareDraft.url,
        name: compareDraft.name ?? 'Secondary video',
        objectUrl: compareDraft.objectUrl,
      });
      setCompareMode(compareDraft.mode);
      setCompareOpacity(compareDraft.opacity);
      setCompareOffsetFrames(compareDraft.offsetFrames || 0);
    } else {
      setCompareSource(null);
    }

    if (draftUrlRef.current && compareDraft.url === draftUrlRef.current) {
      draftUrlRef.current = null;
    } else if (draftUrlRef.current && draftUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(draftUrlRef.current);
      draftUrlRef.current = null;
    }

    setCompareModalOpen(false);
  }, [compareDraft]);

  const clearCompare = useCallback(() => {
    setCompareSource(null);
    setCompareModalOpen(false);
  }, []);

  const handleCompareFileChange = useCallback((file: File | null) => {
    if (draftUrlRef.current && draftUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(draftUrlRef.current);
      draftUrlRef.current = null;
    }
    if (!file) {
      setCompareDraft(prev => ({ ...prev, url: null, name: null, objectUrl: false }));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    draftUrlRef.current = objectUrl;
    setCompareDraft(prev => ({ ...prev, url: objectUrl, name: file.name, objectUrl: true }));
  }, []);

  const handleDraftModeChange = useCallback((mode: CompareMode) => {
    setCompareDraft(prev => ({ ...prev, mode }));
  }, []);

  const handleDraftOpacityChange = useCallback((value: number) => {
    setCompareDraft(prev => ({ ...prev, opacity: value }));
  }, []);

  const handleDraftOffsetChange = useCallback((value: number) => {
    const v = Number.isFinite(value) ? Math.round(value) : 0;
    setCompareDraft(prev => ({ ...prev, offsetFrames: v }));
  }, []);

  const convertCommentFromServer = useCallback((doc: any): Comment => ({
    id: doc.id,
    videoId: doc.videoId,
    authorId: doc.authorId,
    authorName: doc.authorName,
    authorAvatar: doc.authorAvatar ?? '',
    parentId: doc.parentId ?? undefined,
    text: doc.text,
    frame: doc.frame ?? undefined,
    resolved: doc.resolved,
    createdAt: new Date(doc.createdAt ?? Date.now()).toISOString(),
    updatedAt: doc.updatedAt ?? doc.createdAt ?? Date.now(),
    position: doc.position ?? undefined,
  }), []);

  const serializeAnnotationForMutation = useCallback((annotation: Annotation) => {
    const { id, videoId: _videoId, authorId, createdAt, ...rest } = annotation as any;
    return rest;
  }, []);

  useEffect(() => {
    if (!annotationsQuery) return;
    const serverAnnos = annotationsQuery.map(convertAnnotationFromServer);
    setAnnotations(prev => {
      const hasTemps = prev.some(a => a.id.startsWith('client-'));
      if (hasTemps) {
        // While temp items exist, prefer keeping local to avoid flicker
        // but merge in any new server items not present locally
        const localIds = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const s of serverAnnos) {
          if (!localIds.has(s.id)) merged.push(s);
        }
        return merged;
      }
      // Merge preferring local edits by id
      const localById = new Map(prev.map(a => [a.id, a]));
      const merged: Annotation[] = [];
      for (const s of serverAnnos) {
        merged.push(localById.get(s.id) ?? s);
      }
      // Keep any local temp (should be none here) just in case
      for (const a of prev) {
        if (a.id.startsWith('client-') && !merged.find(m => m.id === a.id)) {
          merged.push(a);
        }
      }
      return merged;
    });
  }, [annotationsQuery, convertAnnotationFromServer]);

  useEffect(() => {
    if (commentsQuery) {
      setComments(commentsQuery.map(convertCommentFromServer));
    }
  }, [commentsQuery, convertCommentFromServer]);
  
  // State changes are persisted directly to Convex within handlers; no parent callbacks required.

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    historyRecordingRef.current = true;
  }, [video.id]);

	  const handleTimeUpdate = (time: number, frame: number) => {
	    // Keep React updates bounded; the <video> paints itself, so UI can update slower than the decode rate.
	    const now = performance.now();
	    pendingTimeRef.current = time;
	    pendingFrameRef.current = frame;
	    const UI_INTERVAL_MS = isPlaying ? 33 : 0; // ~30Hz while playing; immediate when paused/seeking
	    if (
	      timeRafRef.current == null &&
	      (UI_INTERVAL_MS === 0 || now - lastUiCommitRef.current >= UI_INTERVAL_MS)
	    ) {
	      timeRafRef.current = window.requestAnimationFrame(() => {
	        timeRafRef.current = null;
	        setCurrentTime(pendingTimeRef.current);
	        setCurrentFrame(pendingFrameRef.current);
	        lastUiCommitRef.current = performance.now();
	      });
	    }
	    // Enforce A–B loop if enabled and valid
	    const fpsCanonical = Math.max(1, Math.floor(video.fps || 24));
	    const epsilon = 1 / fpsCanonical;
	    if (abLoopEnabled && abA != null && abB != null && abB > abA + epsilon) {
	      if (time >= abB - epsilon) {
        handleSeek(abA);
        if (!isPlaying) setIsPlaying(true);
        return;
      }
    }
    if (compareSource) {
      const els = compareElements();
      for (const el of els) syncCompareElement(el, time);
    }
    if (loopEnabled && duration > 0) {
      // Fallback epsilon equals one frame duration
      const epsilon2 = 1 / Math.max(1, video.fps);
      if (time >= duration - epsilon2) {
        handleSeek(0);
        if (!isPlaying) setIsPlaying(true);
      }
	    }
	  };
	  
	  const applySeek = useCallback(
	    (time: number) => {
	      const el = videoRef.current;
	      if (!el) return;
	      const clamped = Math.max(0, Math.min(duration > 0 ? duration : Number.POSITIVE_INFINITY, time));
	      const anyEl = el as any;
	      try {
	        // fastSeek is optimized in some browsers for scrubbing.
	        if (typeof anyEl.fastSeek === "function") anyEl.fastSeek(clamped);
	        else el.currentTime = clamped;
	      } catch {
	        try { el.currentTime = clamped; } catch {}
	      }

	      // Update UI immediately, but not on every mousemove (we rAF-throttle seek calls).
	      const fpsCanonical = Math.max(1, Math.floor(video.fps || 24));
	      pendingTimeRef.current = clamped;
	      pendingFrameRef.current = Math.round(clamped * fpsCanonical);
	      if (timeRafRef.current == null) {
	        timeRafRef.current = window.requestAnimationFrame(() => {
	          timeRafRef.current = null;
	          setCurrentTime(pendingTimeRef.current);
	          setCurrentFrame(pendingFrameRef.current);
	        });
	      }

	      if (compareSource) {
	        compareElements().forEach((cmp) => {
	          const anyCmp = cmp as any;
	          try {
	            if (typeof anyCmp.fastSeek === "function") anyCmp.fastSeek(clamped);
	            else cmp.currentTime = clamped;
	          } catch {}
	        });
	      }
	    },
	    [compareElements, compareSource, duration, video.fps],
	  );

	  const handleSeek = useCallback(
	    (time: number) => {
	      pendingSeekRef.current = time;
	      if (seekRafRef.current != null) return;
	      seekRafRef.current = window.requestAnimationFrame(() => {
	        seekRafRef.current = null;
	        const target = pendingSeekRef.current;
	        pendingSeekRef.current = null;
	        if (target == null) return;
	        applySeek(target);
	      });
	    },
	    [applySeek],
	  );

	  useEffect(() => {
	    return () => {
	      if (timeRafRef.current != null) window.cancelAnimationFrame(timeRafRef.current);
	      if (seekRafRef.current != null) window.cancelAnimationFrame(seekRafRef.current);
	      timeRafRef.current = null;
	      seekRafRef.current = null;
	    };
	  }, []);

  const handleAddAnnotation = useCallback((newAnnotation: Omit<Annotation, 'id' | 'videoId' | 'authorId' | 'createdAt'>) => {
    const tempId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const temp: Annotation = {
      ...(newAnnotation as any),
      id: tempId,
      videoId: video.id,
      authorId: 'me',
      createdAt: new Date().toISOString(),
    } as Annotation;
    setAnnotations(prev => [...prev, temp]);
    void (async () => {
      try {
        const created = await createAnnotationMutation({
          videoId,
          annotation: newAnnotation as any,
        });
        const real = convertAnnotationFromServer(created);
        setAnnotations(prev => prev.map(a => (a.id === tempId ? real : a)));
        if (historyRecordingRef.current) {
          pushHistory({ kind: 'create', annotations: cloneAnnotations([real]) });
        }
      } catch (error) {
        console.error('Failed to add annotation', error);
        // remove temp on error
        setAnnotations(prev => prev.filter(a => a.id !== tempId));
      }
    })();
  }, [createAnnotationMutation, videoId, convertAnnotationFromServer, video.id, pushHistory]);

  const handleUpdateAnnotations = useCallback((updatedAnnotations: Annotation[]) => {
    const shouldRecord = historyRecordingRef.current;
    let beforeSnapshots: Annotation[] = [];
    if (shouldRecord) {
      const ids = new Set(updatedAnnotations.map((annotation) => annotation.id));
      beforeSnapshots = annotations.filter((annotation) => ids.has(annotation.id)).map(cloneAnnotation);
    }
    // Optimistic local update first
    setAnnotations(prev => prev.map(a => {
      const updated = updatedAnnotations.find(u => u.id === a.id);
      return updated ? updated : a;
    }));
    if (shouldRecord && beforeSnapshots.length > 0) {
      pushHistory({ kind: 'update', before: beforeSnapshots, after: cloneAnnotations(updatedAnnotations) });
    }
    void (async () => {
      try {
        await Promise.all(
          updatedAnnotations.map(annotation =>
            updateAnnotationMutation({
              annotationId: annotation.id as Id<'annotations'>,
              annotation: serializeAnnotationForMutation(annotation),
            })
          )
        );
      } catch (error) {
        console.error('Failed to update annotations', error);
      }
    })();
  }, [annotations, updateAnnotationMutation, serializeAnnotationForMutation, pushHistory]);

  const patchSelectedAnnotations = useCallback(
    (mutator: (annotation: Annotation) => Annotation | null) => {
      if (selectedAnnotationIds.length === 0) return;
      const selectedSet = new Set(selectedAnnotationIds);
      const updates: Annotation[] = [];
      for (const annotation of annotations) {
        if (!selectedSet.has(annotation.id)) continue;
        const next = mutator(annotation);
        if (next && next !== annotation) {
          updates.push(next);
        }
      }
      if (updates.length > 0) {
        handleUpdateAnnotations(updates);
      }
    },
    [annotations, selectedAnnotationIds, handleUpdateAnnotations],
  );

  const handleDeleteAnnotations = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const shouldRecord = historyRecordingRef.current;
    let deletedSnapshots: Annotation[] = [];
    if (shouldRecord) {
      const targetIds = new Set(ids);
      deletedSnapshots = annotations.filter((annotation) => targetIds.has(annotation.id)).map(cloneAnnotation);
    }
    // Optimistic remove
    setAnnotations(prev => prev.filter(a => !ids.includes(a.id)));
    setSelectedAnnotationIds([]);
    if (shouldRecord && deletedSnapshots.length > 0) {
      pushHistory({ kind: 'delete', annotations: deletedSnapshots });
    }
    void (async () => {
      try {
        await deleteAnnotationsMutation({
          annotationIds: ids.map(id => id as Id<'annotations'>),
        });
      } catch (error) {
        console.error('Failed to delete annotations', error);
      }
    })();
  }, [annotations, deleteAnnotationsMutation, pushHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotationIds.length === 0) return;
    handleDeleteAnnotations(selectedAnnotationIds);
  }, [handleDeleteAnnotations, selectedAnnotationIds]);

  const handleUndo = useCallback(async () => {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current.pop()!;
    historyRecordingRef.current = false;
    try {
      switch (entry.kind) {
        case 'create': {
          const ids = entry.annotations.map((annotation) => annotation.id);
          if (ids.length) {
            handleDeleteAnnotations(ids);
          }
          break;
        }
        case 'delete': {
          const restored: Annotation[] = [];
          for (const annotation of entry.annotations) {
            try {
              const created = await createAnnotationMutation({
                videoId: (annotation.videoId ?? video.id) as Id<'videos'>,
                annotation: toCreatePayload(annotation),
              });
              const real = convertAnnotationFromServer(created);
              restored.push(real);
            } catch (error) {
              console.error('Failed to restore annotation', error);
            }
          }
          if (restored.length) {
            setAnnotations((prev) => [...prev, ...restored]);
            setSelectedAnnotationIds(restored.map((annotation) => annotation.id));
            entry.annotations = cloneAnnotations(restored);
          }
          break;
        }
        case 'update': {
          if (entry.before.length) {
            handleUpdateAnnotations(entry.before);
          }
          break;
        }
      }
    } finally {
      historyRecordingRef.current = true;
    }
    redoStack.current.push(entry);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, [handleDeleteAnnotations, createAnnotationMutation, convertAnnotationFromServer, handleUpdateAnnotations, setAnnotations, setSelectedAnnotationIds, video.id]);

  const handleRedo = useCallback(async () => {
    if (redoStack.current.length === 0) return;
    const entry = redoStack.current.pop()!;
    historyRecordingRef.current = false;
    try {
      switch (entry.kind) {
        case 'create': {
          const recreated: Annotation[] = [];
          for (const annotation of entry.annotations) {
            try {
              const created = await createAnnotationMutation({
                videoId: (annotation.videoId ?? video.id) as Id<'videos'>,
                annotation: toCreatePayload(annotation),
              });
              const real = convertAnnotationFromServer(created);
              recreated.push(real);
            } catch (error) {
              console.error('Failed to recreate annotation', error);
            }
          }
          if (recreated.length) {
            setAnnotations((prev) => [...prev, ...recreated]);
            setSelectedAnnotationIds(recreated.map((annotation) => annotation.id));
            entry.annotations = cloneAnnotations(recreated);
          }
          break;
        }
        case 'delete': {
          const ids = entry.annotations.map((annotation) => annotation.id);
          if (ids.length) {
            handleDeleteAnnotations(ids);
          }
          break;
        }
        case 'update': {
          if (entry.after.length) {
            handleUpdateAnnotations(entry.after);
          }
          break;
        }
      }
    } finally {
      historyRecordingRef.current = true;
    }
    undoStack.current.push(entry);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, [handleDeleteAnnotations, createAnnotationMutation, convertAnnotationFromServer, handleUpdateAnnotations, setAnnotations, setSelectedAnnotationIds, video.id]);

  const triggerUndo = useCallback(() => {
    void handleUndo();
  }, [handleUndo]);

  const triggerRedo = useCallback(() => {
    void handleRedo();
  }, [handleRedo]);

  const handleBrushColorChange = useCallback(
    (color: string) => {
      setBrushColorState(color);
      patchSelectedAnnotations((annotation) => {
        if (annotation.color === color) return null;
        return { ...annotation, color };
      });
    },
    [patchSelectedAnnotations, setBrushColorState],
  );

  const handleBrushSizeChange = useCallback(
    (size: number) => {
      setBrushSizeState(size);
      patchSelectedAnnotations((annotation) => {
        if (annotation.type === AnnotationTool.TEXT) return null;
        if ((annotation.lineWidth ?? 0) === size) return null;
        return { ...annotation, lineWidth: size };
      });
    },
    [patchSelectedAnnotations, setBrushSizeState],
  );

  const handleShapeFillToggle = useCallback(
    (enabled: boolean) => {
      setShapeFillEnabled(enabled);
      let targetOpacity = shapeFillOpacity;
      if (enabled && targetOpacity <= 0) {
        targetOpacity = 0.35;
        setShapeFillOpacity(0.35);
      }
      if (!enabled) {
        targetOpacity = 0;
      }
      const finalOpacity = clamp01(targetOpacity);
      patchSelectedAnnotations((annotation) => {
        if (annotation.type !== AnnotationTool.RECTANGLE && annotation.type !== AnnotationTool.ELLIPSE) {
          return null;
        }
        const currentOpacity = (annotation as RectangleAnnotation | EllipseAnnotation).fillOpacity ?? 0;
        if (Math.abs(currentOpacity - finalOpacity) < 0.001) {
          return null;
        }
        return { ...annotation, fillOpacity: finalOpacity };
      });
    },
    [patchSelectedAnnotations, shapeFillOpacity, setShapeFillEnabled, setShapeFillOpacity],
  );

  const handleShapeFillOpacityChange = useCallback(
    (opacity: number) => {
      const normalized = clamp01(opacity);
      setShapeFillOpacity(normalized);
      if (!shapeFillEnabled) return;
      patchSelectedAnnotations((annotation) => {
        if (annotation.type !== AnnotationTool.RECTANGLE && annotation.type !== AnnotationTool.ELLIPSE) {
          return null;
        }
        const currentOpacity = (annotation as RectangleAnnotation | EllipseAnnotation).fillOpacity ?? 0;
        if (Math.abs(currentOpacity - normalized) < 0.001) {
          return null;
        }
        return { ...annotation, fillOpacity: normalized };
      });
    },
    [shapeFillEnabled, patchSelectedAnnotations, setShapeFillOpacity],
  );

  useEffect(() => {
    if (selectedAnnotationIds.length === 0) return;
    const selectedSet = new Set(selectedAnnotationIds);
    const shapes = annotations.filter(
      (annotation) =>
        selectedSet.has(annotation.id) &&
        (annotation.type === AnnotationTool.RECTANGLE || annotation.type === AnnotationTool.ELLIPSE),
    ) as (RectangleAnnotation | EllipseAnnotation)[];
    if (shapes.length === 0) return;
    const opacities = shapes.map((shape) => shape.fillOpacity ?? 0);
    const anyFilled = opacities.some((value) => value > 0.001);
    setShapeFillEnabled(anyFilled);
    if (anyFilled) {
      const average = opacities.reduce((sum, value) => sum + value, 0) / opacities.length;
      setShapeFillOpacity(clamp01(average));
    }
  }, [annotations, selectedAnnotationIds, setShapeFillEnabled, setShapeFillOpacity]);

  // Keep style controls in sync with selected annotations (so you can edit while the Select tool is active).
  useEffect(() => {
    if (selectedAnnotations.length === 0) return;

    // Color: only auto-sync when selection is uniform.
    // Note: image/video annotations typically use `color: 'transparent'`; syncing to that would make
    // subsequent strokes/text appear "invisible". Keep previous brushColor in that case.
    const colors = selectedAnnotations
      .map((a) => a.color)
      .filter((c) => Boolean(c) && c !== 'transparent');
    if (colors.length > 0 && colors.every((c) => c === colors[0])) {
      setBrushColorState(colors[0] as string);
    }

    // Stroke width: average across non-text annotations.
    const strokeCandidates = selectedAnnotations.filter((a) => a.type !== AnnotationTool.TEXT);
    if (strokeCandidates.length > 0) {
      const widths = strokeCandidates
        .map((a) => (a as any).lineWidth as number)
        .filter((v) => Number.isFinite(v) && v > 0);
      if (widths.length > 0) {
        const avg = Math.round(widths.reduce((sum, v) => sum + v, 0) / widths.length);
        setBrushSizeState(Math.max(1, Math.min(24, avg)));
      }
    }

    // Font size: average across selected text annotations.
    const textCandidates = selectedAnnotations.filter((a) => a.type === AnnotationTool.TEXT) as TextAnnotation[];
    if (textCandidates.length > 0) {
      const sizes = textCandidates.map((t) => t.fontSize).filter((v) => Number.isFinite(v) && v > 0);
      if (sizes.length > 0) {
        const avg = Math.round(sizes.reduce((sum, v) => sum + v, 0) / sizes.length);
        setFontSize(Math.max(10, Math.min(48, avg)));
      }
    }
  }, [selectedAnnotations, setBrushColorState, setBrushSizeState, setFontSize]);

  const handleAddComment = useCallback((text: string, parentId?: string) => {
    const pendingPosition = pendingComment?.position;
    const fallbackPosition = !parentId && !pendingPosition ? DEFAULT_COMMENT_POSITION : undefined;
    const positionToSend = pendingPosition ?? fallbackPosition;
    void (async () => {
      try {
        const created = await createCommentMutation({
          videoId,
          text,
          parentId: parentId ? (parentId as Id<'comments'>) : undefined,
          frame: isNaN(currentFrame) ? undefined : currentFrame,
          position: positionToSend,
        });
        setPendingComment(null);
        const mapped = convertCommentFromServer(created);
        setComments(prev => [...prev, mapped]);
        if (pendingPosition) {
          setActiveCommentPopoverId(mapped.id);
        }
        const parentRoot = mapped.parentId ? resolveRootCommentId(mapped.parentId) ?? mapped.parentId : mapped.id;
        const rootId = resolveRootCommentId(mapped.id) ?? parentRoot ?? mapped.id;
        markCommentSeen(rootId);
      } catch (error) {
        console.error('Failed to add comment', error);
      }
    })();
  }, [convertCommentFromServer, createCommentMutation, currentFrame, markCommentSeen, pendingComment, resolveRootCommentId, videoId]);
  
  const handleToggleCommentResolved = useCallback((id: string) => {
    void (async () => {
      try {
        await toggleCommentResolvedMutation({ commentId: id as Id<'comments'> });
        setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c));
      } catch (error) {
        console.error('Failed to toggle comment resolution', error);
      }
    })();
  }, [toggleCommentResolvedMutation]);

  const handleEditCommentText = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void (async () => {
      try {
        await updateCommentTextMutation({ commentId: id as Id<'comments'>, text: trimmed });
        setComments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, text: trimmed, updatedAt: Date.now() } : c)),
        );
      } catch (error) {
        console.error('Failed to update comment', error);
      }
    })();
  }, [updateCommentTextMutation]);
  
  const handleUpdateCommentPosition = useCallback((id: string, newPosition: Point) => {
    // Optimistic update first to avoid UI delay
    let previous: Point | undefined;
    setComments(prev => {
      const before = prev.find(c => c.id === id)?.position;
      previous = before;
      return prev.map(c => (c.id === id ? { ...c, position: newPosition } : c));
    });

    void (async () => {
      try {
        await updateCommentPositionMutation({
          commentId: id as Id<'comments'>,
          position: newPosition,
        });
      } catch (error) {
        console.error('Failed to update comment position', error);
        // Revert on failure
        setComments(prev => prev.map(c => (c.id === id ? { ...c, position: previous } : c)) as any);
      }
    })();
  }, [updateCommentPositionMutation, setComments]);

  const handleDeleteComment = useCallback((commentId: string) => {
    void (async () => {
      try {
        await deleteCommentMutation({ commentId: commentId as Id<'comments'> });
        setActiveCommentId(prev => (prev === commentId ? null : prev));
      } catch (error) {
        console.error('Failed to delete comment', error);
      }
    })();
  }, [deleteCommentMutation]);


  const handleCommentPlacement = useCallback((position: Point) => {
    // This now just sets the pending comment state, which triggers the NewCommentPopover on the canvas
    setPendingComment({ position });
  }, []);

  const jumpToFrame = (frame: number | undefined) => {
    if (frame !== undefined) {
      handleSeek(frame / video.fps);
    }
  };

  useEffect(() => {
    setHighlightedCommentId(null);
    setMentionHighlight(null);
    setActiveCommentPopoverId(null);
    appliedFocusRef.current = null;
  }, [video.id]);

  // Handle deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const time = params.get('t');
    const noteId = params.get('note');

    if (time) {
      const seconds = parseFloat(time);
      if (!isNaN(seconds)) {
        setTimeout(() => handleSeek(seconds), 500); // Delay to allow video to load
      }
    }
    if (noteId) {
      setActiveCommentId(noteId);
      setHighlightedCommentId(noteId);
      setMentionHighlight(null);
      setActiveCommentPopoverId(noteId);
    }
  }, [video.fps]);

  useEffect(() => {
    if (!initialFocus) {
      appliedFocusRef.current = null;
      return;
    }

    const key = [
      video.id,
      initialFocus.commentId ?? '',
      initialFocus.frame ?? '',
      initialFocus.mentionText ?? '',
    ].join('|');

    if (appliedFocusRef.current === key) {
      return;
    }

    const targetComment = initialFocus.commentId
      ? comments.find((c) => c.id === initialFocus.commentId)
      : null;

    if (initialFocus.commentId && !targetComment) {
      // Wait until the comment is available locally
      return;
    }

    if (initialFocus.commentId) {
      setActiveCommentId(initialFocus.commentId);
      setHighlightedCommentId(initialFocus.commentId);
      setMentionHighlight(initialFocus.mentionText ?? null);
      setActiveCommentPopoverId(initialFocus.commentId);
    } else {
      setHighlightedCommentId(null);
      setMentionHighlight(null);
      setActiveCommentPopoverId(null);
    }

    const resolvedFrame =
      initialFocus.frame ??
      (targetComment && typeof targetComment.frame === 'number' ? targetComment.frame : undefined);

    if (typeof resolvedFrame === 'number' && Number.isFinite(video.fps) && video.fps > 0) {
      const time = resolvedFrame / video.fps;
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = time;
        } catch {}
      }
      setCurrentTime(time);
      setCurrentFrame(resolvedFrame);
      if (compareSource) {
        compareElements().forEach((el) => {
          try {
            el.currentTime = time;
          } catch {}
        });
      }
    }

    appliedFocusRef.current = key;
    onConsumeInitialFocus?.();
  }, [
    initialFocus,
    comments,
    video.id,
    effectiveFps,
    compareSource,
    compareElements,
    onConsumeInitialFocus,
  ]);


  // Derived helpers for external controls
  const stepFrame = useCallback((deltaFrames: number) => {
    const fps = Math.max(1, Math.floor(video.fps || 24));
    const newTime = Math.max(0, Math.min(duration, (currentFrame + deltaFrames) / fps));
    handleSeek(newTime);
  }, [currentFrame, duration, video.fps, handleSeek]);

  const jumpFrames = useMemo(() => {
    const frames = new Set<number>();
    annotations.forEach(a => frames.add(a.frame));
    comments.forEach(c => c.frame !== undefined && frames.add(c.frame));
    return Array.from(frames).sort((a, b) => a - b);
  }, [annotations, comments]);
  const hasJumpMarks = jumpFrames.length > 0;

  const handleJump = useCallback((direction: 'prev' | 'next') => {
    let targetFrame: number | undefined;
    if (direction === 'next') {
      targetFrame = jumpFrames.find(f => f > currentFrame);
      if (targetFrame === undefined && jumpFrames.length) targetFrame = jumpFrames[0];
    } else {
      const reversed = [...jumpFrames].reverse();
      targetFrame = reversed.find(f => f < currentFrame);
      if (targetFrame === undefined && jumpFrames.length) targetFrame = jumpFrames[jumpFrames.length - 1];
    }
    if (targetFrame !== undefined) handleSeek(targetFrame / Math.max(1, Math.floor(video.fps || 24)));
  }, [jumpFrames, currentFrame, handleSeek, video.fps]);

  // Keyboard shortcuts:
  // - Space: play/pause
  // - Left/Right: prev/next frame
  // - Shift+Left/Right: prev/next marker
  // - Cmd/Ctrl+Z, Cmd+Shift+Z/Ctrl+Y: undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (target && (target.isContentEditable || target.closest?.('[contenteditable="true"]')))
      ) {
        return;
      }

      // Arrow keys
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          if (jumpFrames.length > 0) {
            handleJump(e.key === "ArrowLeft" ? "prev" : "next");
          }
        } else {
          stepFrame(e.key === "ArrowLeft" ? -1 : 1);
        }
        return;
      }

      // Spacebar: play/pause
      if (
        (e.code === "Space" || e.key === " ") &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setIsPlaying((p) => !p);
        return;
      }

      // Undo/redo
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isUndo = (isMac ? e.metaKey : e.ctrlKey) && e.key === "z" && !e.shiftKey;
      const isRedo = isMac ? (e.metaKey && e.shiftKey && e.key === "z") : (e.ctrlKey && e.key === "y");
      if (isUndo) {
        e.preventDefault();
        if (canUndo) triggerUndo();
        return;
      }
      if (isRedo) {
        e.preventDefault();
        if (canRedo) triggerRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, triggerRedo, triggerUndo, stepFrame, handleJump, jumpFrames.length]);

  const commentsBeforeFullscreenRef = useRef<boolean | null>(null);

  const getFullscreenElement = () => {
    if (typeof document === 'undefined') return null;
    return (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      null
    );
  };

  const toggleFullscreen = () => {
    const el = containerRef.current as any;
    if (!el) return;
    if (!getFullscreenElement()) {
      // Hide the comments panel while in fullscreen and restore it on exit.
      // We only hide it after fullscreen is actually active, so a rejected/unsupported request
      // doesn't leave the comments stuck closed.
      commentsBeforeFullscreenRef.current = showComments;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
      if (req) {
        try {
          const result = req.call(el);
          if (result && typeof result.then === 'function') {
            result.catch(() => {
              commentsBeforeFullscreenRef.current = null;
            });
          }
        } catch {
          commentsBeforeFullscreenRef.current = null;
        }
      } else {
        commentsBeforeFullscreenRef.current = null;
      }
    } else {
      const exit = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen || (document as any).mozCancelFullScreen;
      if (exit) exit.call(document);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(getFullscreenElement());
      setIsFullscreen(active);
      if (active && commentsBeforeFullscreenRef.current != null) {
        setShowComments(false);
      } else if (!active && commentsBeforeFullscreenRef.current != null) {
        setShowComments(commentsBeforeFullscreenRef.current);
        commentsBeforeFullscreenRef.current = null;
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    // Safari/iOS
    document.addEventListener('webkitfullscreenchange', onFsChange as any);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
    };
  }, []);

  // Layout sizing is handled via flex + `h-[100dvh]` on the page root.
  // We avoid manual height calculations that can get stale after resizes.

  // Share helpers
  const activeShares = useMemo(() => {
    if (!shareRecords) return [] as any[];
    return shareRecords.filter((s: any) => s.isActive);
  }, [shareRecords]);

  const existingVideoShares = useMemo(() => activeShares.filter((s: any) => s.videoId === (video.id as any)), [activeShares, video.id]);

  const handleShareToGroup = useCallback(async ({ groupId, allowDownload, allowComments }: { groupId: string; allowDownload: boolean; allowComments: boolean; }) => {
    await shareToGroup({ groupId: groupId as any, videoId: video.id as any, allowDownload, allowComments });
  }, [shareToGroup, video.id]);

  const handleGenerateLink = useCallback(async ({ allowDownload, allowComments }: { allowDownload: boolean; allowComments: boolean; }) => {
    const token = await generateShareLink({ videoId: video.id as any, allowDownload, allowComments });
    return token;
  }, [generateShareLink, video.id]);

  const handleUnshare = useCallback(async (shareId: string) => {
    await revokeShare({ shareId: shareId as any });
  }, [revokeShare]);

  const formatClock = useCallback((secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);
  
  const headerDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : (duration || 0);

  useEffect(() => {
    if (insertEditOpen) {
      setInsertFrame(currentFrame);
    }
  }, [insertEditOpen, currentFrame]);

  const handleOpenEditor = useCallback(async () => {
    if (!showEditButton) return;
    if (creatingEdit) return;
    try {
      setCreatingEdit(true);
      const safeTitle = (video.title || 'Untitled').trim();
      const result = await createCompositionMutation({
        title: `${safeTitle} edit`,
        description: `Created from review ${safeTitle}`,
        sourceVideoId: video.id as Id<'videos'>,
        projectId: video.projectId ? (video.projectId as Id<'projects'>) : undefined,
      });
      if (result?.compositionId && onOpenEditor) {
        onOpenEditor(result.compositionId as Id<'compositions'>);
      }
    } catch (err) {
      console.error('Failed to create edit composition', err);
    } finally {
      setCreatingEdit(false);
    }
  }, [creatingEdit, createCompositionMutation, onOpenEditor, video, showEditButton]);

  const handleInsertEditedClip = useCallback(() => {
    if (!showInsertButton) return;
    if (!exportsForVideo || exportsForVideo.length === 0) return;
    setSelectedExportId(null);
    setAttachError(null);
    setInsertFrame(currentFrame);
    setInsertEditOpen(true);
  }, [exportsForVideo, currentFrame, showInsertButton]);

  const handleAttachEditedClip = useCallback(async () => {
    if (!selectedExportId) {
      setAttachError('Seleziona prima un export.');
      return;
    }
    setAttachError(null);
    try {
      setAttachLoading(true);
      await attachEditedClipMutation({
        exportId: selectedExportId as Id<'compositionExports'>,
        videoId: video.id as Id<'videos'>,
        frame: insertFrame,
      });
      setInsertEditOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossibile inserire la clip.';
      setAttachError(message);
    } finally {
      setAttachLoading(false);
    }
  }, [attachEditedClipMutation, insertFrame, selectedExportId, video.id]);

  const pageMaxWidth = "max-w-[1800px]";
  const pagePadX = "px-4 sm:px-6 lg:px-12";
	  const ui = {
    pageBg: isDark ? "bg-neutral-950" : "bg-gray-50",
    card: isDark
      ? "border-white/10 bg-black/40 text-white"
      : "border-gray-200 bg-white/95 text-gray-900",
    cardSolid: isDark
      ? "border-white/10 bg-black/70 text-white"
      : "border-gray-200 bg-white text-gray-900",
    subtleText: isDark ? "text-white/50" : "text-gray-500",
    subtleLabel: isDark ? "text-white/60" : "text-gray-500",
    iconBtn: isDark
      ? "bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
      : "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50",
    chip: isDark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50",
    chipActive: isDark ? "bg-white text-black" : "bg-white text-gray-900 shadow-sm",
    chipInactive: isDark
      ? "text-white/60 hover:text-white hover:bg-white/10"
      : "text-gray-600 hover:text-gray-900 hover:bg-white/70",
    primaryBtn: isDark ? "bg-white text-black hover:bg-white/90" : "bg-gray-900 text-gray-50 hover:bg-black",
    softBtn: isDark ? "bg-white/10 hover:bg-white/20 text-white/80" : "bg-gray-100 hover:bg-gray-200 text-gray-900",
	  };
	  const headerActionBtn =
	    "h-10 w-10 rounded-full bg-white text-black border border-black/10 shadow-sm hover:bg-gray-50 transition-colors active:scale-[0.98]";
	  const headerActionBtnSmall =
	    "h-9 w-9 rounded-full bg-white text-black border border-black/10 shadow-sm hover:bg-gray-50 transition-colors active:scale-[0.98]";
	  const stageAspectRatio = (() => {
	    const w = Math.max(1, Math.floor(video.width || 16));
	    const h = Math.max(1, Math.floor(video.height || 9));
	    if (compareSource && compareMode !== 'overlay') {
	      if (compareMode === 'side-by-side-vertical') return `${w}/${h * 2}`;
	      return `${w * 2}/${h}`; // side-by-side-horizontal
	    }
	    return `${w}/${h}`;
	  })();

	  return (
	    <div className={`h-[100dvh] w-full flex flex-col overflow-hidden ${ui.pageBg}`}>
      {showInsertButton && (
        <EditedExportsErrorBoundary>
          <EditedExportsQuery videoId={videoId} onData={setExportsForVideo} />
        </EditedExportsErrorBoundary>
      )}
      {confirmDeleteRevision && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className={`${isDark ? 'bg-black/85 text-white' : 'bg-white text-gray-900'} w-full max-w-md rounded-2xl border ${isDark ? 'border-white/10' : 'border-gray-200'} shadow-2xl`}>
            <div className={`px-4 py-3 ${isDark ? 'bg-white/5 border-b border-white/10' : 'bg-gray-50 border-b border-gray-200'} flex items-center justify-between`}>
              <h3 className="text-sm font-semibold">Delete version</h3>
              <button className={isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'} onClick={() => setConfirmDeleteRevision(null)}>✕</button>
            </div>
            <div className="p-4 text-sm space-y-3">
              <p className="opacity-90">Are you sure you want to delete this uploaded version? This action cannot be undone.</p>
              <div className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} rounded-xl border p-3 text-xs grid grid-cols-2 gap-2`}>
                <div className="opacity-70">Filename</div>
                <div className="truncate">{confirmDeleteRevision.fileName || new URL(confirmDeleteRevision.publicUrl, window.location.href).pathname.split('/').pop()}</div>
                <div className="opacity-70">Uploaded</div>
                <div>{new Date(confirmDeleteRevision.createdAt).toLocaleString()}</div>
                <div className="opacity-70">Resolution</div>
                <div>{confirmDeleteRevision.width}×{confirmDeleteRevision.height}</div>
                <div className="opacity-70">Duration</div>
                <div>{Math.round(confirmDeleteRevision.duration)}s</div>
              </div>
              {replaceError && <div className="text-xs text-red-400">{replaceError}</div>}
              <div className="pt-1 flex justify-end gap-2">
                <button className={`${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'} rounded-full px-3 py-1.5 text-sm font-semibold`} onClick={() => setConfirmDeleteRevision(null)} disabled={deletingRevision}>Cancel</button>
                <button className={`${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50`} onClick={async () => {
                  setReplaceError(null);
                  setDeletingRevision(true);
                  try {
                    await deleteRevision({ revisionId: confirmDeleteRevision.id as any });
                    setConfirmDeleteRevision(null);
                  } catch (e:any) {
                    setReplaceError(e?.message || 'Failed to delete');
                  } finally {
                    setDeletingRevision(false);
                  }
                }} disabled={deletingRevision}>{deletingRevision ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
	      <div className={`w-full flex flex-1 min-h-0 overflow-hidden ${isFullscreen ? '' : `${pagePadX} pt-6 pb-8`}`}>
	        <div className={`mx-auto w-full ${pageMaxWidth} flex flex-1 min-h-0 min-w-0 gap-6`}>
	          <div className="flex-1 flex flex-col min-h-0 min-w-0 gap-4">
	            <header className="flex-shrink-0">
	              <section className={`rounded-3xl border shadow-sm ${ui.card}`}>
	                <div className="px-4 py-3 sm:px-6 sm:py-4 grid grid-cols-3 items-center min-w-0">
	                  <div className="justify-self-start">
	                    <button
	                      onClick={onGoBack}
	                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase transition ${ui.iconBtn}`}
	                    >
	                      <ChevronLeft size={16} /> Back
	                    </button>
	                  </div>
	                  <div className="min-w-0 text-center col-start-2">
	                    <h1 className="text-base md:text-lg font-semibold truncate" title={video.title}>
	                      {video.title}
	                    </h1>
	                    <div className={`${ui.subtleText} text-[11px]`}>
	                      {video.width}×{video.height} • {fpsDetected ? `${effectiveFps} fps` : '... fps'} • {formatClock(headerDuration)}
	                    </div>
	                  </div>
	                  <div className="justify-self-end" />
	                </div>
	              </section>
	            </header>
      {replaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`${isDark ? 'bg-black/85 text-white' : 'bg-white text-gray-900'} w-full max-w-3xl rounded-3xl border ${isDark ? 'border-white/10' : 'border-gray-200'} p-0 shadow-2xl overflow-hidden`}>
            <div className={`px-5 py-4 ${isDark ? 'bg-white/5 border-b border-white/10' : 'bg-gray-50 border-b border-gray-200'} flex items-center justify-between`}>
              <h2 className="text-base font-semibold tracking-wide">Replace base video</h2>
              <button onClick={() => setReplaceOpen(false)} className={isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'}>✕</button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
              <div className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} rounded-2xl border p-4 space-y-3`}>
                <div className="font-semibold mb-2">Current</div>
                <div className="space-y-1 text-xs opacity-80">
                  <div>{video.width}×{video.height} • {video.fps} fps • {Math.round(video.duration)}s</div>
                  <div>Uploaded {new Date(video.uploadedAt).toLocaleString()}</div>
                </div>
                <div className="mt-3">
                  <label className={`${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'} inline-block cursor-pointer rounded-full px-3 py-1 text-xs font-semibold`}>
                    Upload new version
                    <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setReplaceError(null);
                      setReplaceUploading(true);
                      setReplaceProgress(0);
                      try {
                        const meta = await (async () => new Promise<{width:number;height:number;fps:number;duration:number}>((resolve, reject) => {
                          const el = document.createElement('video');
                          el.preload = 'metadata';
                          el.onloadedmetadata = () => { resolve({ width: el.videoWidth, height: el.videoHeight, fps: Math.max(1, Math.floor(video.fps || 24)), duration: el.duration }); URL.revokeObjectURL(el.src); };
                          el.onerror = () => { URL.revokeObjectURL(el.src); reject(new Error('Unable to read video metadata.')); };
                          el.src = URL.createObjectURL(file);
                        }))();
                        const contentType = resolveContentType(file);
                        const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB, align with Dashboard
                        const reviewContextId = (video as any).reviewId ?? video.id;
                        let result: { storageKey: string; publicUrl: string };
                        if (file.size >= MULTIPART_THRESHOLD) {
                          result = await uploadMultipart(file, contentType, (p) => setReplaceProgress(p), reviewContextId);
                        } else {
                          const creds = await generateVideoUploadUrl({
                            contentType,
                            fileName: file.name,
                            context: "review",
                            contextId: reviewContextId,
                          });
                          await new Promise<void>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('PUT', creds.uploadUrl, true);
                            xhr.setRequestHeader('Content-Type', contentType);
                            xhr.timeout = 1000 * 60 * 45; // 45 min
                            xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setReplaceProgress(Math.round((ev.loaded/ev.total)*100)); };
                            xhr.onreadystatechange = () => { if (xhr.readyState === XMLHttpRequest.DONE) { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Upload failed (${xhr.status})`)); } };
                            xhr.onerror = () => reject(new Error('Network error during upload'));
                            xhr.ontimeout = () => reject(new Error('Upload timed out'));
                            xhr.send(file);
                          });
                          result = { storageKey: creds.storageKey, publicUrl: creds.publicUrl };
                        }
                        await replaceSource({ videoId: video.id as any, storageKey: result.storageKey, publicUrl: result.publicUrl, width: Math.max(1, Math.floor(meta.width)), height: Math.max(1, Math.floor(meta.height)), fps: Math.max(1, Math.floor(meta.fps)), duration: Math.max(0, Math.round(meta.duration)), newTitle: file.name });
                        // Immediately use the new public URL to avoid long loading while queries refresh
                        setPlaybackUrl(result.publicUrl);
                        setPlaybackKind('public');
                        setPlaybackAttempt(0);
                        setReplaceOpen(false);
                      } catch (err:any) { setReplaceError(err?.message || 'Failed to replace video'); } finally { setReplaceUploading(false); }
                    }} />
                  </label>
                </div>
                {replaceUploading && (<div className="mt-2 text-xs opacity-80">Uploading… {replaceProgress}%</div>)}
                {replaceError && (<div className="mt-2 text-xs text-red-400">{replaceError}</div>)}
              </div>
              <div className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} rounded-2xl border p-0`}> 
                <div className="p-4 font-semibold">History</div>
                <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-2 text-sm">
                  {/* Current entry */}
                  <details open className={`${isDark ? 'bg-black/30 border-white/10' : 'bg-white border-gray-200'} rounded-xl border`}>
                    <summary className="px-3 py-2 cursor-pointer flex items-center justify-between">
                      <span className="font-semibold text-sm">Current</span>
                      <span className="opacity-60 text-xs">{video.title}</span>
                    </summary>
                    <div className="px-3 pb-3 pt-1 flex items-center justify-between text-xs opacity-90">
                      <div className="space-y-1">
                        <div>Resolution: {video.width}×{video.height}</div>
                        <div>Frame rate: {video.fps} fps</div>
                        <div>Duration: {Math.round(video.duration)}s</div>
                        <div>Uploaded: {new Date(video.uploadedAt).toLocaleString()}</div>
                      </div>
                      <span className="opacity-60">In use</span>
                    </div>
                  </details>
                  {/* All uploads including current */}
                  {(() => {
                    const uploads: Array<any> = [];
                    const currentUpload = {
                      id: 'current',
                      storageKey: video.storageKey,
                      publicUrl: video.src,
                      width: video.width,
                      height: video.height,
                      fps: video.fps,
                      duration: video.duration,
                      createdAt: Date.parse(video.uploadedAt),
                      fileName: video.title,
                    };
                    uploads.push(currentUpload);
                    (listRevisions ?? []).forEach((r) => {
                      if (!uploads.find((u) => u.storageKey === r.storageKey)) uploads.push(r);
                    });
                    if (uploads.length === 0) return <div className="opacity-60 text-xs px-2">No previous versions.</div>;
                    return uploads.map((rev, idx) => (
                    <details key={rev.id as string} className={`${isDark ? 'bg-black/30 border-white/10' : 'bg-white border-gray-200'} rounded-xl border`}>
                      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between">
                        <span className="font-semibold text-sm">{rev.fileName || new URL(rev.publicUrl, window.location.href).pathname.split('/').pop()}</span>
                        <span className="opacity-60 text-xs">{new Date(rev.createdAt).toLocaleString()}</span>
                      </summary>
                      <div className="px-3 pb-3 pt-1 flex items-center justify-between text-xs opacity-90">
                        <div className="space-y-1">
                          <div>Resolution: {rev.width}×{rev.height}</div>
                          <div>Frame rate: {rev.fps} fps</div>
                          <div>Duration: {Math.round(rev.duration)}s</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              setReplaceError(null);
                              try {
                                await replaceSource({ videoId: video.id as any, storageKey: rev.storageKey, publicUrl: rev.publicUrl, width: rev.width, height: rev.height, fps: rev.fps, duration: rev.duration, thumbnailUrl: (rev as any).thumbnailUrl ?? undefined, newTitle: rev.fileName || video.title });
                                setPlaybackUrl(rev.publicUrl);
                                setPlaybackKind('public');
                                setPlaybackAttempt(0);
                                setReplaceOpen(false);
                              } catch (e:any) { setReplaceError(e?.message || 'Failed to switch version'); }
                            }}
                            disabled={rev.storageKey === video.storageKey}
                            className={`${rev.storageKey === video.storageKey ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} rounded-full px-3 py-1 font-semibold`}
                          >Use</button>
                          <button
                            onClick={() => { setReplaceError(null); setConfirmDeleteRevision(rev); }}
                            disabled={rev.storageKey === video.storageKey}
                            className={`${rev.storageKey === video.storageKey ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'} rounded-full px-3 py-1 font-semibold`}
                          >Delete</button>
                        </div>
                      </div>
                    </details>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
	          <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0 gap-4">
            <section
              className={`relative flex-1 min-h-0 overflow-hidden rounded-3xl border shadow-sm ${ui.cardSolid} ${
                isFullscreen ? 'rounded-none border-0 shadow-none' : ''
              }`}
            >
	              <Toolbar 
	                activeTool={activeTool} 
	                setActiveTool={setActiveTool}
	                selectedAnnotations={selectedAnnotations}
	                onDeleteSelected={handleDeleteSelected}
	                canDeleteSelected={selectedAnnotationIds.length > 0}
	                deleteCount={selectedAnnotationIds.length}
	                brushColor={brushColor}
	                setBrushColor={handleBrushColorChange}
	                brushSize={brushSize}
	                setBrushSize={handleBrushSizeChange}
                fontSize={fontSize}
                setFontSize={setFontSize}
                shapeFillEnabled={shapeFillEnabled}
                onToggleShapeFill={handleShapeFillToggle}
                shapeFillOpacity={shapeFillOpacity}
                onChangeShapeFillOpacity={handleShapeFillOpacityChange}
                undo={triggerUndo}
                redo={triggerRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                isDark={isDark}
                onOpenCompare={openCompareModal}
                onOpenReplace={video.isOwnedByCurrentUser ? () => setReplaceOpen(true) : undefined}
              />
		              <div className="w-full h-full relative overflow-hidden bg-black">
		                <div className="absolute inset-0 flex items-center justify-center">
		                  <div className="relative h-full w-auto max-w-full" style={{ aspectRatio: stageAspectRatio }}>
		                    <div className="relative w-full h-full overflow-hidden">
	            {compareSource && compareMode !== 'overlay' ? (
	              <div className={`w-full h-full flex ${compareMode === 'side-by-side-vertical' ? 'flex-col' : 'flex-row'}`}>
	                <div className="relative flex-1 min-w-0 flex items-center justify-center overflow-hidden group">
	                  <VideoPlayer
	                    ref={videoRef}
	                    video={video}
                    sourceUrl={playbackUrl ?? undefined}
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    onTimeUpdate={handleTimeUpdate}
                    annotations={showAnnotations ? annotations : []}
                    comments={comments}
                    onSeek={handleSeek}
                    currentFrame={currentFrame}
                    externalControls
                    onDuration={setDuration}
                    loopEnabled={loopEnabled}
                  />
                  <AnnotationCanvas
                    video={video}
                    videoElement={videoRef.current}
                    currentFrame={currentFrame}
                    annotations={showAnnotations ? annotations : []}
                    onAddAnnotation={handleAddAnnotation}
                    onUpdateAnnotations={handleUpdateAnnotations}
                    onDeleteAnnotations={handleDeleteAnnotations}
                    activeTool={activeTool}
                    brushColor={brushColor}
                    brushSize={brushSize}
                    fontSize={fontSize}
                    shapeFillEnabled={shapeFillEnabled}
                    shapeFillOpacity={shapeFillOpacity}
                    selectedAnnotationIds={selectedAnnotationIds}
                    setSelectedAnnotationIds={setSelectedAnnotationIds}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    onCommentPlacement={handleCommentPlacement}
                    activeCommentPopoverId={activeCommentPopoverId}
                    setActiveCommentPopoverId={setActiveCommentPopoverId}
                    onUpdateCommentPosition={handleUpdateCommentPosition}
                    onAddComment={handleAddComment}
                    onToggleCommentResolved={handleToggleCommentResolved}
                    onEditComment={handleEditCommentText}
                    onJumpToFrame={jumpToFrame}
                    pendingComment={pendingComment}
                    setPendingComment={setPendingComment}
                    isDark={isDark}
                    onUploadAsset={uploadAnnotationAsset}
                    threadMeta={commentThreadMeta}
                    mentionOptions={mentionableOptions ?? []}
	                  />
	                </div>
	                <div className="relative flex-1 min-w-0 flex items-center justify-center overflow-hidden bg-black/80">
	                  <video
	                    key={`cmp-side-${compareMode}-${compareSource.url}`}
	                    ref={compareVideoSideRef}
                    src={compareSource.url}
                    className="w-full h-full object-contain"
                    preload="metadata"
                    muted
                    playsInline
                    autoPlay={isPlaying}
                    onLoadedMetadata={(e) => {
                      try {
                        const el = e.currentTarget as HTMLVideoElement;
                        el.muted = true;
                        el.loop = loopEnabled;
                        const t = videoRef.current?.currentTime ?? 0;
                        syncCompareElement(el, Number.isFinite(t) ? t : 0);
                      } catch {}
                    }}
                  />
	                </div>
	              </div>
	            ) : (
	              <div className="relative w-full h-full flex items-center justify-center overflow-hidden group">
                <VideoPlayer
                  ref={videoRef}
                  video={video}
                  sourceUrl={playbackUrl ?? undefined}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  onTimeUpdate={handleTimeUpdate}
                  annotations={showAnnotations ? annotations : []}
                  comments={comments}
                  onSeek={handleSeek}
                  currentFrame={currentFrame}
                  externalControls
                  onDuration={setDuration}
                  onFps={(fps) => { setEffectiveFps(Math.max(1, Math.round(fps))); setFpsDetected(true); }}
                  loopEnabled={loopEnabled}
                />
                <AnnotationCanvas
                  video={video}
                  videoElement={videoRef.current}
                  currentFrame={currentFrame}
                  annotations={showAnnotations ? annotations : []}
                  onAddAnnotation={handleAddAnnotation}
                  onUpdateAnnotations={handleUpdateAnnotations}
                  onDeleteAnnotations={handleDeleteAnnotations}
                  activeTool={activeTool}
                  brushColor={brushColor}
                  brushSize={brushSize}
                  fontSize={fontSize}
                  shapeFillEnabled={shapeFillEnabled}
                  shapeFillOpacity={shapeFillOpacity}
                  selectedAnnotationIds={selectedAnnotationIds}
                  setSelectedAnnotationIds={setSelectedAnnotationIds}
                  comments={showAnnotations ? comments : []}
                  activeCommentId={activeCommentId}
                  onCommentPlacement={handleCommentPlacement}
                  activeCommentPopoverId={activeCommentPopoverId}
                  setActiveCommentPopoverId={setActiveCommentPopoverId}
                  onUpdateCommentPosition={handleUpdateCommentPosition}
                  onAddComment={handleAddComment}
                  onToggleCommentResolved={handleToggleCommentResolved}
                  onEditComment={handleEditCommentText}
                  onJumpToFrame={jumpToFrame}
                  pendingComment={pendingComment}
                  setPendingComment={setPendingComment}
                  isDark={isDark}
                  onUploadAsset={uploadAnnotationAsset}
                  threadMeta={commentThreadMeta}
                  mentionOptions={mentionableOptions ?? []}
                />
                {compareSource && compareMode === 'overlay' && (
                  <video
                    key={`cmp-overlay-${compareMode}-${compareSource.url}`}
                    ref={compareVideoOverlayRef}
                    src={compareSource.url}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{ opacity: compareOpacity }}
                    preload="metadata"
                    muted
                    playsInline
                    autoPlay={isPlaying}
                    onLoadedMetadata={(e) => {
                      try {
                        const el = e.currentTarget as HTMLVideoElement;
                        el.muted = true;
                        el.loop = loopEnabled;
                        const t = videoRef.current?.currentTime ?? 0;
                        syncCompareElement(el, Number.isFinite(t) ? t : 0);
                      } catch {}
                    }}
                  />
	                )}
	              </div>
	            )}
	            {compareSource && (
	              <div
	                className={`absolute top-4 right-4 md:top-6 md:right-6 z-30 w-[min(90vw,260px)] rounded-3xl border px-4 py-4 shadow-lg ${
	                  isDark ? 'bg-black/75 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
	                }`}
	              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${isDark ? 'text-white/70' : 'text-gray-500'}`}>Compare</p>
                    <p className={`text-xs truncate max-w-[220px] ${isDark ? 'text-white/90' : 'text-gray-900'}`}>{compareSource.name}</p>
                  </div>
                  <button
                    onClick={clearCompare}
                    className={`text-[11px] uppercase font-semibold ${isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span>Mode</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCompareMode('overlay')}
                      className={`${compareMode === 'overlay'
                        ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-gray-900')
                        : (isDark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-black/5 text-gray-700 hover:bg-black/10')}
                        px-2.5 py-1 rounded-full text-[11px] font-semibold`}
                      title="Overlay"
                    >
                      Overlay
                    </button>
                    <button
                      onClick={() => setCompareMode('side-by-side-horizontal')}
                      className={`${compareMode === 'side-by-side-horizontal'
                        ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-gray-900')
                        : (isDark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-black/5 text-gray-700 hover:bg-black/10')}
                        px-2.5 py-1 rounded-full text-[11px] font-semibold`}
                      title="Horizontal"
                    >
                      H
                    </button>
                    <button
                      onClick={() => setCompareMode('side-by-side-vertical')}
                      className={`${compareMode === 'side-by-side-vertical'
                        ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-gray-900')
                        : (isDark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-black/5 text-gray-700 hover:bg-black/10')}
                        px-2.5 py-1 rounded-full text-[11px] font-semibold`}
                      title="Vertical"
                    >
                      V
                    </button>
                    <button
                      onClick={openCompareModal}
                      className={`${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'} px-2.5 py-1 rounded-full text-[11px] font-semibold`}
                      title="More options"
                    >
                      …
                    </button>
                  </div>
                </div>
                {compareMode === 'overlay' && (
                  <div className="mt-3">
                    <label className="flex items-center justify-between text-[11px] uppercase gap-3">
                      <span className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>Opacity</span>
                      <span className={`${isDark ? 'text-white/80' : 'text-gray-800'}`}>{Math.round(compareOpacity * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={compareOpacity}
                      onChange={(e) => setCompareOpacity(Number(e.target.value))}
                      className={`mt-2 w-full ${isDark ? 'accent-white' : 'accent-black'}`}
                    />
                  </div>
                )}

                {/* Offset control (frames) */}
                <div className="mt-3">
                  <label className={`flex items-center justify-between text-[11px] uppercase gap-3`}>
                    <span className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>Offset</span>
                    <span className={`${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                      {compareOffsetFrames} f • ≈ {(compareOffsetFrames / Math.max(1, Math.floor(video.fps || 24))).toFixed(2)}s
                    </span>
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setCompareOffsetFrames((v) => Math.max(0, v - 1))}
                      className={`${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'} px-2 py-1 rounded-full text-[11px] font-semibold`}
                      title="-1 frame"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={compareOffsetFrames}
                      onChange={(e) => setCompareOffsetFrames(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      className={`${isDark ? 'bg-white/10 text-white border-white/10' : 'bg-black/5 text-gray-900 border-gray-300'} w-20 rounded-md border px-2 py-1 text-[11px]`}
                    />
                    <button
                      onClick={() => setCompareOffsetFrames((v) => v + 1)}
                      className={`${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'} px-2 py-1 rounded-full text-[11px] font-semibold`}
                      title="+1 frame"
                    >
                      +
                    </button>
                  </div>
                </div>
	              </div>
	            )}
		                    </div>
		                  </div>
		                </div>
		              </div>
            </section>

            {/* Transport + timeline */}
            <div className="flex-none flex items-stretch justify-center">
              <div
                className={`w-full rounded-3xl border shadow-sm ${ui.card} flex flex-col gap-3 px-3 py-3 sm:px-6 ${
                  isFullscreen ? 'rounded-none border-0 shadow-none' : ''
                }`}
              >
                <div className="flex-1 flex flex-col">
                  <Timeline
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={handleSeek}
                    video={video}
                    annotations={annotations}
                    comments={comments}
                    abLoop={{ a: abA ?? undefined, b: abB ?? undefined }}
                    onAbChange={(which, t) => {
                      const clamped = Math.max(0, Math.min(duration, t));
                      if (which === 'a') {
                        setAbA(clamped);
                        // If current time is before new A, jump inside loop when active
                        if (abLoopEnabled && abB != null && clamped < (abB as number) && currentTime < clamped) {
                          handleSeek(clamped);
                        }
                      } else {
                        setAbB(clamped);
                        const fpsCanonical = Math.max(1, Math.floor(video.fps || 24));
                        const epsilon = 1 / fpsCanonical;
                        if (abLoopEnabled && abA != null && clamped > (abA as number) && currentTime >= clamped - epsilon) {
                          handleSeek(abA as number);
                        }
                      }
                    }}
                    isDark={isDark}
                  />
                  {/* Removed resolution • fps row under the timeline as requested */}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4">
                  {/* Left side: Loop toggle */}
                  <div className="relative flex items-center gap-3 justify-center md:justify-start flex-wrap">
                    <div className="group relative">
                      <button
                        onClick={() => setLoopMenuOpen((v) => !v)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${ui.softBtn}`}
                      >
                        Loop ▾
                      </button>
                      <div
                        className={`absolute left-0 bottom-full mb-2 ${loopMenuOpen ? 'block' : 'hidden'} min-w-[220px] rounded-2xl border shadow-2xl z-30 backdrop-blur ${ui.cardSolid}`}
                        onMouseLeave={() => setLoopMenuOpen(false)}
                      >
                        <button
                          onClick={() => setLoopEnabled((v) => !v)}
                          className={`block w-full px-3 py-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                        >
                          Global loop: {loopEnabled ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => setAbLoopEnabled((v) => !v)}
                          className={`block w-full px-3 py-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                        >
                          A–B loop: {abLoopEnabled ? 'On' : 'Off'}
                        </button>
                        <div className={`my-1 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                        <button
                          onClick={() => setAbA(currentTime)}
                          className={`block w-full px-3 py-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                          title="Set point A at current time"
                        >
                          Set A at current time
                        </button>
                        <button
                          onClick={() => setAbB(currentTime)}
                          className={`block w-full px-3 py-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                          title="Set point B at current time"
                        >
                          Set B at current time
                        </button>
                        <button
                          onClick={() => { setAbA(null); setAbB(null); setAbLoopEnabled(false); }}
                          className={`block w-full px-3 py-2 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                        >
                          Clear A and B
                        </button>
                        {(abA != null || abB != null) && (
                          <div className={`px-3 py-2 text-[11px] ${ui.subtleText}`}>
                            A: {formatClock(abA ?? 0)} {abB != null && '•'} {abB != null && `B: ${formatClock(abB)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Center cluster: frame step | jump mark | play | jump mark | frame step */}
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => stepFrame(-1)}
                        className={`p-2 rounded-full ${ui.softBtn}`}
                        title="Previous frame"
                        aria-label="Previous frame"
                      >
                        <StepBack size={18} />
                      </button>
                      <button
                        onClick={() => handleJump('prev')}
                        disabled={!hasJumpMarks}
                        className={`p-2 rounded-full ${ui.softBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                        title={hasJumpMarks ? "Previous marker" : "No markers"}
                        aria-label="Previous marker"
                      >
                        <SkipBack size={18} />
                      </button>
                      <button
                        onClick={() => setIsPlaying((p) => !p)}
                        className={`p-3 rounded-full ${ui.primaryBtn}`}
                        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                      </button>
                      <button
                        onClick={() => handleJump('next')}
                        disabled={!hasJumpMarks}
                        className={`p-2 rounded-full ${ui.softBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                        title={hasJumpMarks ? "Next marker" : "No markers"}
                        aria-label="Next marker"
                      >
                        <SkipForward size={18} />
                      </button>
                      <button
                        onClick={() => stepFrame(1)}
                        className={`p-2 rounded-full ${ui.softBtn}`}
                        title="Next frame"
                        aria-label="Next frame"
                      >
                        <StepForward size={18} />
                      </button>
                    </div>
                  </div>
                  {/* Right side: volume & fullscreen */}
                  <div className="flex items-center gap-3 justify-center md:justify-end">
                    <button onClick={() => { const next = !isMuted; setIsMuted(next); if (videoRef.current) videoRef.current.muted = next; }} className={`p-2 rounded-full ${ui.softBtn}`}>
                      {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setVolume(value);
                        if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; }
                        setIsMuted(value === 0);
                      }}
                      className={`w-20 md:w-24 ${isDark ? 'accent-white' : 'accent-gray-900'}`}
                    />
                    <button onClick={toggleFullscreen} className={`p-2 rounded-full ${ui.softBtn}`}>
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

	          </div>
	        </div>

	        {/* Desktop sidebar: spans full height (including the title header) */}
	        <aside
	          className={`hidden md:flex flex-col min-h-0 flex-shrink-0 transition-[width] duration-200 ease-out ml-4 ${
	            showComments ? 'w-[360px]' : 'w-12'
	          }`}
	        >
	          {showComments ? (
	            <section className={`h-full overflow-hidden rounded-3xl border shadow-sm ${ui.card} flex flex-col`}>
	              <div className={`grid grid-cols-4 items-center justify-items-center gap-2 px-3 py-3 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
	                <button
	                  onClick={() => setShowComments(false)}
	                  title="Hide sidebar"
	                  aria-label="Hide sidebar"
	                  className={headerActionBtnSmall}
	                >
	                  <PanelRightClose size={18} className="mx-auto" />
	                </button>
	                <button
	                  onClick={() => setShowAnnotations((s) => !s)}
	                  title={showAnnotations ? 'Hide Annotations' : 'Show Annotations'}
	                  aria-label={showAnnotations ? 'Hide Annotations' : 'Show Annotations'}
	                  className={headerActionBtnSmall}
	                >
	                  {showAnnotations ? <EyeOff size={18} className="mx-auto" /> : <Eye size={18} className="mx-auto" />}
	                </button>
	                <button
	                  onClick={() => setShareOpen(true)}
	                  title="Share"
	                  aria-label="Share"
	                  className={headerActionBtnSmall}
	                >
	                  <Share2 size={16} className="mx-auto" />
	                </button>
	                {currentUser?.avatar || clerkUser?.imageUrl ? (
	                  <img
	                    src={currentUser?.avatar || clerkUser?.imageUrl}
	                    alt={
	                      currentUser?.name ??
	                      clerkUser?.fullName ??
	                      clerkUser?.emailAddresses[0]?.emailAddress ??
	                      'User'
	                    }
	                    className={`w-9 h-9 rounded-full object-cover ${isDark ? 'border border-white/10' : 'border border-gray-200'}`}
	                  />
	                ) : (
	                  <div
	                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
	                      isDark ? 'bg-white/5 border border-white/10 text-white' : 'bg-white border border-gray-200 text-gray-800'
	                    }`}
	                  >
	                    {(currentUser?.name?.[0] ?? clerkUser?.firstName?.[0] ?? 'U').toUpperCase()}
	                  </div>
	                )}
	              </div>
	              <div className="flex-1 min-h-0">
	                <CommentsPane
	                  comments={comments}
	                  currentFrame={currentFrame}
	                  onAddComment={handleAddComment}
	                  onToggleResolve={handleToggleCommentResolved}
	                  onJumpToFrame={jumpToFrame}
	                  activeCommentId={activeCommentId}
	                  setActiveCommentId={setActiveCommentId}
	                  onDeleteComment={handleDeleteComment}
	                  isDark={isDark}
	                  highlightCommentId={highlightedCommentId}
	                  highlightTerm={mentionHighlight}
	                  mentionOptions={mentionableOptions ?? []}
	                />
	              </div>
	            </section>
	          ) : (
	            <div className="h-full flex items-start justify-center pt-1">
	              <button
	                onClick={() => setShowComments(true)}
	                title="Show sidebar"
	                aria-label="Show sidebar"
	                className={headerActionBtnSmall}
	              >
	                <PanelRightOpen size={18} className="mx-auto" />
	              </button>
	            </div>
	          )}
	        </aside>
	      </div>

	        {showComments && (
	          <div className="md:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowComments(false)} />
            <div
              className={`absolute inset-x-0 bottom-0 h-[75vh] max-h-[80vh] rounded-t-3xl border shadow-2xl ${ui.cardSolid}`}
            >
              <div className={`absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full ${isDark ? 'bg-white/30' : 'bg-gray-300'}`} />
              <button
                onClick={() => setShowComments(false)}
                className={`${isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'} absolute right-3 top-2 text-sm`}
              >
                Close
              </button>
              <div className="h-full pt-6">
                <CommentsPane
                  comments={comments}
                  currentFrame={currentFrame}
                  onAddComment={handleAddComment}
                  onToggleResolve={handleToggleCommentResolved}
                  onJumpToFrame={jumpToFrame}
                  activeCommentId={activeCommentId}
                  setActiveCommentId={setActiveCommentId}
                  onDeleteComment={handleDeleteComment}
                  isDark={isDark}
                  highlightCommentId={highlightedCommentId}
                  highlightTerm={mentionHighlight}
                  mentionOptions={mentionableOptions ?? []}
                />
              </div>
            </div>
          </div>
	        )}

	      {/* Mobile: when sidebar is closed, keep a single open button */}
	      {!showComments && (
	        <button
	          onClick={() => setShowComments(true)}
	          className={`md:hidden fixed right-4 top-4 z-30 ${headerActionBtn}`}
	          title="Show comments"
	          aria-label="Show comments"
	        >
	          <PanelRightOpen size={18} className="mx-auto" />
	        </button>
	      )}
      {shareOpen && shareGroups && (
        <ShareModal
          video={video}
          groups={shareGroups as any}
          existingShares={existingVideoShares as any}
          isDark={isDark}
          onShareToGroup={(args) => handleShareToGroup(args)}
          onGenerateLink={(args) => handleGenerateLink(args as any)}
          onUnshare={(id) => handleUnshare(id)}
          onClose={() => setShareOpen(false)}
        />
      )}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeCompareModal} />
          <div className={`relative w-full max-w-xl rounded-2xl border px-6 py-6 shadow-2xl ${isDark ? 'bg-black/90 border-white/10 text-white/80' : 'bg-white border-gray-200 text-gray-900'}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Compare video</h2>
              <button onClick={closeCompareModal} className={`${isDark ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-900'} text-sm`}>Close</button>
            </div>
            <div className="mt-5 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload comparison clip</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleCompareFileChange(e.target.files?.[0] ?? null)}
                  className={`${isDark ? 'w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40' : 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400'}`}
                />
                {compareDraft.name && (
                  <p className="text-xs opacity-70">Selected: {compareDraft.name}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCompareFileChange(null)}
                    className={`${isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'} text-xs underline`}
                  >
                    Clear selection
                  </button>
                  {compareSource && (
                    <button
                      onClick={clearCompare}
                      className={`${isDark ? 'text-red-300 hover:text-red-200' : 'text-red-600 hover:text-red-700'} text-xs underline`}
                    >
                      Remove current compare
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Display mode</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { id: 'overlay', label: 'Overlay' },
                    { id: 'side-by-side-horizontal', label: 'Horizontal' },
                    { id: 'side-by-side-vertical', label: 'Vertical' },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className={`${compareDraft.mode === mode.id ? (isDark ? 'border-white/40 bg-white/10 text-white' : 'border-black bg-black/5 text-gray-900') : (isDark ? 'border-white/20 text-white/70 hover:border-white/40' : 'border-gray-300 text-gray-600 hover:border-gray-500')} flex cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition`}
                    >
                      <input
                        type="radio"
                        name="compare-mode"
                        value={mode.id}
                        checked={compareDraft.mode === mode.id}
                        onChange={() => handleDraftModeChange(mode.id as CompareMode)}
                        className="hidden"
                      />
                      {mode.label}
                    </label>
                  ))}
                </div>
                {compareDraft.mode === 'overlay' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase">
                      <span className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>Opacity</span>
                      <span className={`${isDark ? 'text-white/80' : 'text-gray-800'}`}>{Math.round(compareDraft.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={compareDraft.opacity}
                      onChange={(e) => handleDraftOpacityChange(Number(e.target.value))}
                      className={`w-full ${isDark ? 'accent-white' : 'accent-black'}`}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeCompareModal}
                className={`${isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'} text-sm font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={applyCompareDraft}
                className={`${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} px-4 py-2 text-sm font-semibold rounded-full transition`}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
	      {showInsertButton && insertEditOpen && (
	        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
	          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-gray-900/95 p-6 text-slate-50 shadow-2xl">
	            <div className="flex items-center justify-between">
	              <div>
	                <h2 className="text-xl font-semibold">Insert edited clip</h2>
	                <p className="text-sm text-slate-200">Select a rendered edit and the frame where it should appear inside this review.</p>
	              </div>
	              <button
	                onClick={() => setInsertEditOpen(false)}
	                className="text-slate-200 hover:text-slate-50"
	              >
	                ✕
	              </button>
	            </div>
	            <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-2 text-sm">
	              {(exportsForVideo ?? []).length === 0 && (
	                <p className="text-xs text-slate-300">No edits available yet. Render an edit in the editor first.</p>
	              )}
              {(exportsForVideo ?? []).map((item) => {
                const isCompleted = item.export.status === 'completed' && item.export.outputPublicUrl;
                return (
                  <label
                    key={item.export._id as string}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 ${
                      isCompleted ? 'border-white/15 hover:bg-white/5' : 'border-white/5 opacity-60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedExport"
                      className="mt-1"
                      disabled={!isCompleted}
                      checked={selectedExportId === (item.export._id as string)}
                      onChange={() => setSelectedExportId(item.export._id as string)}
                    />
                    <div className="flex-1">
	                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
                        <span>{item.composition.title}</span>
                        <span>
                          {item.export.status}
                          {item.export.status === 'running' && ` • ${Math.round(item.export.progress)}%`}
                        </span>
                      </div>
	                      <div className="text-sm font-semibold text-slate-50">
	                        {new Date(item.export.createdAt).toLocaleString()}
	                      </div>
	                      {!isCompleted && (
	                        <div className="text-[11px] text-slate-300">Only completed exports can be inserted.</div>
	                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm">
	              <label className="flex items-center gap-3">
	                <span className="text-slate-200">Frame</span>
	                <input
                  type="number"
                  min={0}
                  value={Math.round(insertFrame)}
                  onChange={(e) => setInsertFrame(Math.max(0, Number(e.target.value) || 0))}
	                  className="w-32 rounded border border-white/20 bg-black/40 px-3 py-1 text-slate-50"
	                />
	                <span className="text-slate-300">(Current: {currentFrame})</span>
	              </label>
              {attachError && <p className="text-sm text-red-400">{attachError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-3 text-sm">
	              <button
	                onClick={() => setInsertEditOpen(false)}
	                className="rounded-full border border-white/20 px-4 py-2 text-slate-50 hover:bg-white/10"
	              >
                Cancel
              </button>
              <button
                onClick={handleAttachEditedClip}
                disabled={attachLoading || !selectedExportId}
                className="rounded-full bg-white px-4 py-2 font-semibold text-black hover:bg-white/90 disabled:opacity-50"
              >
                {attachLoading ? 'Inserting…' : 'Insert clip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoReviewer;

// Isolated child that queries edited exports; errors are handled by boundary so
// missing backend functions don't crash the reviewer.
const EditedExportsQuery: React.FC<{
  videoId: Id<'videos'>;
  onData: (rows: Array<{ export: any; composition: any }>) => void;
}> = ({ videoId, onData }) => {
  const rows = useQuery(api.edits.listExportsForVideo, { videoId }) as Array<{ export: any; composition: any }> | undefined;
  useEffect(() => {
    if (rows) onData(rows);
  }, [rows, onData]);
  return null;
};

class EditedExportsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.warn('Edited exports suppressed error', err); }
  render() { return this.state.hasError ? null : this.props.children; }
}
