import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Video, Annotation, Comment, AnnotationTool, Point } from '../types';
import VideoPlayer from './VideoPlayer';
import AnnotationCanvas from './AnnotationCanvas';
import CommentsPane from './CommentsPane';
import Toolbar from './Toolbar';
import { ChevronLeft, PanelRightClose, PanelRightOpen, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useThemePreference, ThemePref } from '../useTheme';

interface VideoReviewerProps {
  video: Video;
  sourceUrl?: string;
  onGoBack: () => void;
  theme?: ThemePref;
}

const VideoReviewer: React.FC<VideoReviewerProps> = ({ video, sourceUrl, onGoBack, theme = 'system' }) => {
  const isDark = useThemePreference(theme);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  
  const [isCommentsPaneOpen, setIsCommentsPaneOpen] = useState(true);
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

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    // Ensure 'Friends' are synced from groups even when landing directly in reviewer.
    void syncFriends({}).catch(() => undefined);
  }, [syncFriends]);

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
    return () => { cancelled = true; };
  }, [video.id, video.storageKey, video.src, sourceUrl, getDownloadUrlAction]);

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
  };
  
  const handleSeek = (time: number) => {
    if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
        setCurrentFrame(Math.round(time * video.fps));
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
    void (async () => {
      try {
        await updateCommentPositionMutation({
          commentId: id as Id<'comments'>,
          position: newPosition,
        });
        setComments(prev => prev.map(c => c.id === id ? { ...c, position: newPosition } : c));
      } catch (error) {
        console.error('Failed to update comment position', error);
      }
    })();
  }, [updateCommentPositionMutation]);

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


  return (
    <div className={"w-full h-full flex flex-col"}>
      <header className={`flex-shrink-0 border-b px-8 py-4 flex items-center justify-between z-20 backdrop-blur ${isDark ? 'bg-black/20 border-white/10 text-white' : 'bg-white/80 border-gray-200 text-gray-900'}`}>
        <div className="flex items-center gap-4">
            <button onClick={onGoBack} className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-white/60 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-full">
                <ChevronLeft size={18} /> Back
            </button>
            <h1 className="text-xl font-semibold text-white">{video.title}</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => setShowAnnotations(s => !s)} title={showAnnotations ? 'Hide Annotations' : 'Show Annotations'} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            {showAnnotations ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button className="text-xs font-semibold text-black bg-white hover:bg-white/90 px-4 py-2 rounded-full">Share</button>
          <button onClick={() => setIsCommentsPaneOpen(o => !o)} title={isCommentsPaneOpen ? "Hide Comments" : "Show Comments"} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            {isCommentsPaneOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
          <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white font-bold">A</div>
        </div>
      </header>
      <div className="w-full h-full flex flex-1 overflow-hidden">
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
          />
          <div className="w-full flex-1 relative flex items-center justify-center overflow-hidden group">
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
        </div>
        <div className={`flex-shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out ${isCommentsPaneOpen ? 'w-[360px]' : 'w-0'}`}>
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
    </div>
  );
};

export default VideoReviewer;
