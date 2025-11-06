import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Video, Annotation, Comment, AnnotationTool, Point } from '../types';
import VideoPlayer from './VideoPlayer';
import AnnotationCanvas from './AnnotationCanvas';
import CommentsPane from './CommentsPane';
import Toolbar from './Toolbar';
import { ChevronLeft, Eye, EyeOff, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Rewind, FastForward, Maximize, Minimize, Share2 } from 'lucide-react';
import Timeline from './Timeline';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useThemePreference, ThemePref } from '../useTheme';
import { ShareModal } from './Dashboard';
import { useUser } from '@clerk/clerk-react';

type CompareMode = 'overlay' | 'side-by-side-horizontal' | 'side-by-side-vertical';

interface VideoReviewerProps {
  video: Video;
  sourceUrl?: string;
  onGoBack: () => void;
  theme?: ThemePref;
}

const VideoReviewer: React.FC<VideoReviewerProps> = ({ video, sourceUrl, onGoBack, theme = 'system' }) => {
  const isDark = useThemePreference(theme);
  const { user: clerkUser } = useUser();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  
  // Comments pane is always visible
  const [pendingComment, setPendingComment] = useState<{ position: Point } | null>(null);


  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  
  const [activeTool, setActiveTool] = useState<AnnotationTool>(AnnotationTool.SELECT);
  const [brushColor, setBrushColor] = useState('#ef4444'); // red-500
  const [brushSize, setBrushSize] = useState(4);
  const [fontSize, setFontSize] = useState(16);

  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeCommentPopoverId, setActiveCommentPopoverId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  const videoId = video.id as Id<'videos'>;

  const annotationsQuery = useQuery(api.annotations.listByVideo, { videoId });
  const commentsQuery = useQuery(api.comments.listByVideo, { videoId });

  const createAnnotationMutation = useMutation(api.annotations.create);
  const updateAnnotationMutation = useMutation(api.annotations.update);
  const deleteAnnotationsMutation = useMutation(api.annotations.removeMany);

  const createCommentMutation = useMutation(api.comments.create);
  const toggleCommentResolvedMutation = useMutation(api.comments.toggleResolved);
  const deleteCommentMutation = useMutation(api.comments.remove);
  const updateCommentPositionMutation = useMutation(api.comments.updatePosition);
  const getDownloadUrlAction = useAction(api.storage.getDownloadUrl);
  const syncFriends = useMutation(api.shareGroups.syncFriendsFromGroups);
  // Sharing data (reuse Dashboard flows)
  const shareGroups = useQuery(api.shareGroups.list, clerkUser ? {} : undefined);
  const shareRecords = useQuery(api.shares.list, clerkUser ? {} : undefined);
  const generateShareLink = useMutation(api.shares.generateLink);
  const shareToGroup = useMutation(api.shares.shareToGroup);
  const revokeShare = useMutation(api.shares.revoke);
  const [shareOpen, setShareOpen] = useState(false);

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [videoWidthPx, setVideoWidthPx] = useState(0);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareSource, setCompareSource] = useState<{ url: string; name: string; objectUrl?: boolean } | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('overlay');
  const [compareOpacity, setCompareOpacity] = useState(0.6);
  const [compareDraft, setCompareDraft] = useState<{ url: string | null; name: string | null; objectUrl?: boolean; mode: CompareMode; opacity: number }>({ url: null, name: null, objectUrl: false, mode: 'overlay', opacity: 0.6 });
  const compareVideoOverlayRef = useRef<HTMLVideoElement>(null);
  const compareVideoSideRef = useRef<HTMLVideoElement>(null);
  const draftUrlRef = useRef<string | null>(null);
  const prevCompareUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Ensure 'Friends' are synced from groups even when landing directly in reviewer.
    void syncFriends({}).catch(() => undefined);
  }, [syncFriends]);

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

  const updateVideoWidth = useCallback(() => {
    const w = videoRef.current?.getBoundingClientRect().width ?? 0;
    setVideoWidthPx(w);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        if (sourceUrl) {
          if (!cancelled) setPlaybackUrl(sourceUrl);
        } else if (video.storageKey) {
          const url = await getDownloadUrlAction({ storageKey: video.storageKey });
          if (!cancelled) setPlaybackUrl(url);
        } else {
          if (!cancelled) setPlaybackUrl(video.src);
        }
      } catch (e) {
        console.error('Failed to get playback URL, falling back to video.src', e);
        if (!cancelled) setPlaybackUrl(video.src);
      }
    };
    setup();
    // Measure display width once source/metadata stabilize
    setTimeout(updateVideoWidth, 50);
    return () => { cancelled = true; };
  }, [video.id, video.storageKey, video.src, sourceUrl, getDownloadUrlAction, updateVideoWidth]);

  useEffect(() => {
    setTimeout(updateVideoWidth, 60);
  }, [compareSource, compareMode, updateVideoWidth]);

  const compareElements = useCallback(() => {
    const els: HTMLVideoElement[] = [];
    if (compareVideoOverlayRef.current) els.push(compareVideoOverlayRef.current);
    if (compareVideoSideRef.current) els.push(compareVideoSideRef.current);
    return els;
  }, []);

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
        if (videoRef.current && !Number.isNaN(videoRef.current.currentTime)) {
          try { el.currentTime = videoRef.current.currentTime; } catch {}
        }
        if (isPlaying) {
          const p = el.play();
          (p as any)?.catch?.(() => undefined);
        }
      };
      if (el.readyState >= 1) {
        sync();
      } else {
        el.addEventListener('loadedmetadata', sync, { once: true });
      }
    });
  }, [compareSource, loopEnabled, isPlaying, compareElements]);

  useEffect(() => {
    const els = compareElements();
    els.forEach((el) => {
      if (!compareSource) return;
      if (isPlaying) {
        const p = el.play();
        (p as any)?.catch?.(() => undefined);
      } else {
        el.pause();
      }
    });
  }, [isPlaying, compareSource, compareElements]);

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
    });
    setCompareModalOpen(true);
  }, [compareSource, compareMode, compareOpacity]);

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

  const undo = useCallback(() => {}, []);
  const redo = useCallback(() => {}, []);
  const canUndo = false;
  const canRedo = false;
  
  // State changes are persisted directly to Convex within handlers; no parent callbacks required.

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isUndo = (isMac ? e.metaKey : e.ctrlKey) && e.key === 'z' && !e.shiftKey;
      const isRedo = (isMac ? e.metaKey && e.shiftKey && e.key === 'z' : e.ctrlKey && e.key === 'y');

      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);


  const handleTimeUpdate = (time: number, frame: number) => {
    setCurrentTime(time);
    setCurrentFrame(frame);
    if (compareSource) {
      compareElements().forEach((el) => {
        const diff = Math.abs((el.currentTime || 0) - time);
        if (diff > 0.2) {
          try { el.currentTime = time; } catch {}
        }
      });
    }
    if (loopEnabled && duration > 0) {
      // Fallback epsilon equals one frame duration
      const epsilon = 1 / Math.max(1, video.fps);
      if (time >= duration - epsilon) {
        handleSeek(0);
        if (!isPlaying) setIsPlaying(true);
      }
    }
  };
  
  const handleSeek = (time: number) => {
    if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
        setCurrentFrame(Math.round(time * video.fps));
    }
    if (compareSource) {
      compareElements().forEach((el) => {
        try { el.currentTime = time; } catch {}
      });
    }
  };

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
      } catch (error) {
        console.error('Failed to add annotation', error);
        // remove temp on error
        setAnnotations(prev => prev.filter(a => a.id !== tempId));
      }
    })();
  }, [createAnnotationMutation, videoId, convertAnnotationFromServer, video.id]);

  const handleUpdateAnnotations = useCallback((updatedAnnotations: Annotation[]) => {
    // Optimistic local update first
    setAnnotations(prev => prev.map(a => {
      const updated = updatedAnnotations.find(u => u.id === a.id);
      return updated ? updated : a;
    }));
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
  }, [updateAnnotationMutation, serializeAnnotationForMutation]);

  const handleDeleteAnnotations = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    // Optimistic remove
    setAnnotations(prev => prev.filter(a => !ids.includes(a.id)));
    setSelectedAnnotationIds([]);
    void (async () => {
      try {
        await deleteAnnotationsMutation({
          annotationIds: ids.map(id => id as Id<'annotations'>),
        });
      } catch (error) {
        console.error('Failed to delete annotations', error);
      }
    })();
  }, [deleteAnnotationsMutation]);

  const handleAddComment = useCallback((text: string, parentId?: string) => {
    void (async () => {
      try {
        const created = await createCommentMutation({
          videoId,
          text,
          parentId: parentId ? (parentId as Id<'comments'>) : undefined,
          frame: isNaN(currentFrame) ? undefined : currentFrame,
          position: pendingComment?.position,
        });
        setPendingComment(null);
        const mapped = convertCommentFromServer(created);
        setComments(prev => [...prev, mapped]);
        if (mapped.position) {
          setActiveCommentPopoverId(mapped.id);
        }
      } catch (error) {
        console.error('Failed to add comment', error);
      }
    })();
  }, [createCommentMutation, videoId, currentFrame, pendingComment, convertCommentFromServer]);
  
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
      setIsCommentsPaneOpen(true);
    }
  }, [video.fps]);


  // Derived helpers for external controls
  const stepFrame = useCallback((deltaFrames: number) => {
    const newTime = Math.max(0, Math.min(duration, (currentFrame + deltaFrames) / video.fps));
    handleSeek(newTime);
  }, [currentFrame, duration, video.fps]);

  const jumpFrames = useMemo(() => {
    const frames = new Set<number>();
    annotations.forEach(a => frames.add(a.frame));
    comments.forEach(c => c.frame !== undefined && frames.add(c.frame));
    return Array.from(frames).sort((a, b) => a - b);
  }, [annotations, comments]);

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
    if (targetFrame !== undefined) handleSeek(targetFrame / video.fps);
  }, [jumpFrames, currentFrame, handleSeek, video.fps]);

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    const el = containerRef.current as any;
    if (!el) return;
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen || (document as any).mozCancelFullScreen;
      if (exit) exit.call(document);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const onResize = () => updateVideoWidth();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateVideoWidth]);

  const headerEl = useRef<HTMLDivElement>(null);
  const controlsEl = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  const recalcHeights = useCallback(() => {
    const headerH = headerEl.current?.getBoundingClientRect().height ?? 0;
    const vh = window.innerHeight;
    const next = Math.max(0, vh - headerH);
    setAvailableHeight(next);
  }, []);

  useEffect(() => {
    recalcHeights();
    const onResize = () => recalcHeights();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalcHeights]);

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

  return (
    <div className={"w-full h-full flex flex-col"}>
      <header
        ref={headerEl}
        className={`flex-shrink-0 border-b px-4 md:px-8 py-3 md:py-4 grid grid-cols-[minmax(0,1fr)_360px] items-center z-20 backdrop-blur ${
          isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white/80 border-gray-200 text-gray-900'
        }`}
      >
        {/* Left column (aligned with video area): back at left, title centered */}
        <div className="grid grid-cols-3 items-center min-w-0">
          <div className="justify-self-start">
            <button
              onClick={onGoBack}
              className={`${
                isDark
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } inline-flex items-center gap-2 text-[11px] font-semibold uppercase px-3 py-1.5 rounded-full transition`}
            >
              <ChevronLeft size={16} /> Back
            </button>
          </div>
          <div className="min-w-0 text-center col-start-2">
            <h1
              className={`${isDark ? 'text-white' : 'text-gray-900'} text-base md:text-lg font-semibold truncate`}
              title={video.title}
            >
              {video.title}
            </h1>
            <div className={`${isDark ? 'text-white/50' : 'text-gray-500'} text-[11px]`}> 
              {video.width}×{video.height} • {video.fps} fps • {formatClock(headerDuration)}
            </div>
          </div>
          <div />
        </div>
        {/* Right column (aligned with comments): actions centered */}
        <div className="flex items-center justify-center gap-2 md:gap-3">
          <button
            onClick={() => setShowAnnotations((s) => !s)}
            title={showAnnotations ? 'Hide Annotations' : 'Show Annotations'}
            className={`${
              isDark ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            } p-2 rounded-full transition-colors`}
          >
            {showAnnotations ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button
            onClick={() => setShareOpen(true)}
            title="Share"
            aria-label="Share"
            className={`${
              isDark
                ? 'text-black bg-white hover:bg-white/90'
                : 'bg-white border border-black'
            } inline-flex items-center justify-center p-2 rounded-full transition`}
          >
            {isDark ? (
              <Share2 size={16} />
            ) : (
              <Share2 size={16} color="#000" />
            )}
          </button>
          {clerkUser?.imageUrl ? (
            <img
              src={clerkUser.imageUrl}
              alt={clerkUser.fullName ?? clerkUser.emailAddresses[0]?.emailAddress ?? 'User'}
              className={`w-8 h-8 rounded-full object-cover ${isDark ? 'border border-white/20' : 'border border-gray-200'}`}
            />
          ) : (
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-gray-100 border border-gray-300 text-gray-800'
              }`}
            >
              {(clerkUser?.firstName?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
        </div>
      </header>
      <div className="w-full flex flex-1 overflow-hidden" ref={containerRef} style={availableHeight != null ? { height: availableHeight, maxHeight: availableHeight } : undefined}>
        <div className={`flex-1 flex flex-col relative ${isDark ? 'bg-black/60' : 'bg-white'}`}>
          <Toolbar 
            activeTool={activeTool} 
            setActiveTool={setActiveTool}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            fontSize={fontSize}
            setFontSize={setFontSize}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            isDark={isDark}
            onOpenCompare={openCompareModal}
          />
          <div className="w-full flex-1 relative overflow-hidden">
            {compareSource && compareMode !== 'overlay' ? (
              <div className={`w-full h-full flex ${compareMode === 'side-by-side-vertical' ? 'flex-col' : 'flex-row'}`}>
                <div className="relative flex-1 flex items-center justify-center overflow-hidden group">
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
                    selectedAnnotationIds={selectedAnnotationIds}
                    setSelectedAnnotationIds={setSelectedAnnotationIds}
                    comments={comments}
                    activeCommentId={activeCommentId}
                    onCommentPlacement={handleCommentPlacement}
                    activeCommentPopoverId={activeCommentPopoverId}
                    setActiveCommentPopoverId={setActiveCommentPopoverId}
                    onUpdateCommentPosition={handleUpdateCommentPosition}
                    onAddComment={handleAddComment}
                    pendingComment={pendingComment}
                    setPendingComment={setPendingComment}
                    isDark={isDark}
                  />
                </div>
                <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black/80">
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
                        if (!Number.isNaN(t)) el.currentTime = t;
                        if (isPlaying) { const p = el.play(); (p as any)?.catch?.(()=>{}); }
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
                  selectedAnnotationIds={selectedAnnotationIds}
                  setSelectedAnnotationIds={setSelectedAnnotationIds}
                  comments={comments}
                  activeCommentId={activeCommentId}
                  onCommentPlacement={handleCommentPlacement}
                  activeCommentPopoverId={activeCommentPopoverId}
                  setActiveCommentPopoverId={setActiveCommentPopoverId}
                  onUpdateCommentPosition={handleUpdateCommentPosition}
                  onAddComment={handleAddComment}
                  pendingComment={pendingComment}
                  setPendingComment={setPendingComment}
                  isDark={isDark}
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
                        if (!Number.isNaN(t)) el.currentTime = t;
                        if (isPlaying) { const p = el.play(); (p as any)?.catch?.(()=>{}); }
                      } catch {}
                    }}
                  />
                )}
              </div>
            )}
            {compareSource && (
              <div
                className={`absolute top-6 right-6 z-30 min-w-[240px] rounded-xl border px-4 py-3 shadow-lg ${isDark ? 'bg-black/70 border-white/10 text-white/80' : 'bg-white/90 border-gray-200 text-gray-800'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold">Compare</p>
                    <p className="text-xs truncate max-w-[200px]">{compareSource.name}</p>
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
                  <button
                    onClick={openCompareModal}
                    className={`${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'} px-3 py-1 rounded-full text-[11px] font-semibold`}
                  >
                    {compareMode === 'overlay' ? 'Overlay' : compareMode === 'side-by-side-horizontal' ? 'Horizontal' : 'Vertical'}
                  </button>
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
              </div>
            )}
          </div>
          {/* Left Controls: restricted to video display width and not under comments */}
          <div className="flex-none">
            <div className={`flex items-stretch justify-center px-0 pb-6 ${isDark ? 'bg-black' : 'bg-gray-100'}`}>
              <div
                ref={controlsEl}
                className={`${isDark ? 'bg-black border-t border-white/10 text-white' : 'bg-gray-100 border-t border-gray-200 text-gray-900'} flex flex-col gap-3 px-6 py-3 h-28`}
                style={{ width: videoWidthPx ? `${videoWidthPx}px` : '100%' }}
              >
                <div className="flex-1 flex flex-col">
                  <Timeline
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={handleSeek}
                    video={video}
                    annotations={annotations}
                    comments={comments}
                    isDark={isDark}
                  />
                  <div className={`mt-2 grid grid-cols-[1fr_auto_1fr] items-center text-xs uppercase ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    <div />
                    <div className="justify-self-end">
                      <span>{video.width}×{video.height} • {video.fps} fps</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  {/* Left side: Loop toggle */}
                  <div className="flex items-center gap-3 justify-start">
                    <button
                      onClick={() => setLoopEnabled((v) => !v)}
                      className={`${loopEnabled ? (isDark ? 'bg-white text-black' : 'bg-transparent ring-2 ring-black text-gray-900') : (isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/5 text-gray-800 hover:bg-black/10')} px-3 py-1 rounded-full text-xs font-semibold`}
                    >
                      Loop {loopEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  {/* Center cluster: prev mark | transport | next mark */}
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => handleJump('prev')} className={`${isDark ? 'px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80' : 'px-3 py-1 rounded-full bg-black/5 hover:bg-black/10 text-gray-800'}`}>Prev</button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => stepFrame(-1)} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white/80' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}><Rewind size={18} /></button>
                      <button onClick={() => stepFrame(-video.fps)} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white/80' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}><SkipBack size={18} /></button>
                      <button onClick={() => setIsPlaying(p => !p)} className={`p-3 rounded-full ${isDark ? 'bg-white text-black hover:bg-white/90 ring-2 ring-white/20' : 'bg-white text-black hover:bg-white/90 ring-2 ring-black/10'}`}>
                        {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                      </button>
                      <button onClick={() => stepFrame(video.fps)} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white/80' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}><SkipForward size={18} /></button>
                      <button onClick={() => stepFrame(1)} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white/80' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}><FastForward size={18} /></button>
                    </div>
                    <button onClick={() => handleJump('next')} className={`${isDark ? 'px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80' : 'px-3 py-1 rounded-full bg-black/5 hover:bg-black/10 text-gray-800'}`}>Next</button>
                  </div>
                  {/* Right side: volume & fullscreen */}
                  <div className="flex items-center gap-3 justify-end">
                    <button onClick={() => { const next = !isMuted; setIsMuted(next); if (videoRef.current) videoRef.current.muted = next; }} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}>
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
                      className={`w-24 ${isDark ? 'accent-white' : 'accent-black'}`}
                    />
                    <button onClick={toggleFullscreen} className={`p-2 rounded-full ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800'}`}>
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={`flex-shrink-0 overflow-hidden w-[360px] min-h-[93vh]`} style={{ minHeight: '93vh' }}>
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
          />
        </div>
      </div>
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
    </div>
  );
};

export default VideoReviewer;
