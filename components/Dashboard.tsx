// FIX: Import `useEffect` hook from react.
import React, { useRef, useState, useMemo, useEffect, ReactNode } from 'react';
import { Video, Project } from '../types';
import {
  UploadCloud,
  Film,
  PlayCircle,
  Folder,
  Plus,
  MoreHorizontal,
  Grip,
  List,
  ChevronLeft,
  Trash2,
  Pencil,
  X,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface UploadMetadata {
  storageKey: string;
  publicUrl: string;
  title: string;
  description?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  projectId?: string | null;
  thumbnailUrl?: string;
}

interface DashboardProps {
    videos: Video[];
    projects: Project[];
  onStartReview: (video: Video) => void | Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
  onUpdateProject: (project: { id: string; name: string }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSetVideoProject: (videoId: string, projectId: string | null) => Promise<void>;
  onRenameVideo: (videoId: string, title: string) => Promise<void>;
  onCompleteUpload: (payload: UploadMetadata) => Promise<Video>;
  onRemoveVideo: (videoId: string) => Promise<void>;
  onGenerateUploadUrl: (args: { contentType: string; fileName?: string }) => Promise<{ storageKey: string; uploadUrl: string; publicUrl: string }>;
  userButton: ReactNode;
  // Optional: fetch a signed URL for thumbnails/videos
  onGetDownloadUrl?: (args: { storageKey: string; expiresIn?: number }) => Promise<string>;
}

const formatSimpleDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
    day: 'numeric',
    });

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const VideoActionsMenu: React.FC<{ onRename: () => void; onMove: () => void; onDelete: () => void }> = ({ onRename, onMove, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10">
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-black border border-white/10 rounded-xl shadow-2xl z-30 py-1">
          <button
            onClick={() => {
              onRename();
              setOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
          >
            <Pencil size={14} /> Rename
          </button>
          <button
            onClick={() => {
              onMove();
              setOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
          >
            <Folder size={14} /> Move to Project
          </button>
          <div className="my-1 h-px bg-white/10" />
          <button
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm text-red-300 hover:bg-white/10 flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};

const ProjectCard: React.FC<{
  project: Project;
  videoCount: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}> = ({ project, videoCount, onSelect, onRename, onDelete }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
    <div
      onClick={onSelect}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/40 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between">
        <Folder size={24} className="text-white/75" />
                        <div className="relative" ref={menuRef}>
          <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10">
            <MoreHorizontal size={16} />
                            </button>
          {open && (
            <div className="absolute right-0 mt-2 w-40 bg-black border border-white/10 rounded-xl shadow-2xl z-30 py-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-1.5 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
              >
                <Pencil size={14} /> Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-1.5 text-sm text-red-300 hover:bg-white/10 flex items-center gap-2"
              >
                <Trash2 size={14} /> Delete
                            </button>
                                </div>
                            )}
                        </div>
                    </div>
      <div className="mt-8 space-y-2">
        <h3 className="text-white font-semibold text-base truncate" title={project.name}>
          {project.name}
        </h3>
        <p className="text-xs text-white/45">{videoCount} {videoCount === 1 ? 'review' : 'reviews'}</p>
            </div>
        </div>
    );
};

const VideoGridCard: React.FC<{ video: Video; onStartReview: (video: Video) => void; onRename: (video: Video) => void; onMove: (video: Video) => void; onDelete: (video: Video) => void; onGetDownloadUrl?: (args: { storageKey: string; expiresIn?: number }) => Promise<string>; }> = ({ video, onStartReview, onRename, onMove, onDelete, onGetDownloadUrl }) => {
  const [videoError, setVideoError] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>(video.src);
  const videoRef = useRef<HTMLVideoElement>(null);
  const signedOnce = useRef(false);
  const retrying = useRef(false);

  const signIfNeeded = async () => {
    if (!signedOnce.current && onGetDownloadUrl && video.storageKey) {
      const signed = await onGetDownloadUrl({ storageKey: video.storageKey, expiresIn: 60 * 60 }).catch(() => undefined);
      if (signed) {
        setPreviewSrc(signed);
        if (videoRef.current) {
          try {
            videoRef.current.src = signed;
            videoRef.current.load();
          } catch {}
        }
        signedOnce.current = true;
      }
    }
  };

  const handleEnter = async () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.loop = true;
    // @ts-expect-error
    el.playsInline = true;
    await signIfNeeded();
    const playSafe = async () => {
      try {
        await el.play();
      } catch (err: any) {
        // Autoplay blocked or other issue; keep poster
      }
    };
    if (el.readyState < 2) {
      const onCanPlay = () => {
        el.removeEventListener('canplay', onCanPlay);
        void playSafe();
      };
      el.addEventListener('canplay', onCanPlay, { once: true });
      try { el.load(); } catch {}
    } else {
      void playSafe();
    }
  };

  const handleLeave = () => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    try { el.currentTime = 0; } catch {}
  };

  const handleError = async () => {
    if (retrying.current) { setVideoError(true); return; }
    retrying.current = true;
    await signIfNeeded();
    const el = videoRef.current;
    if (el) {
      try {
        await el.play();
        setVideoError(false);
        retrying.current = false;
        return;
      } catch {}
    }
    setVideoError(true);
    retrying.current = false;
  };

    return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden group hover:border-white/30 transition-all">
      <div className="relative aspect-video bg-black" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {!videoError ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            src={previewSrc}
            poster={video.thumbnailUrl}
            preload="metadata"
            muted
            playsInline
            loop
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={handleError}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={44} className="text-white/35" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => onStartReview(video)} className="text-white transform transition-transform hover:scale-110">
            <PlayCircle size={56} />
                    </button>
                </div>
        <div className="absolute top-3 right-3">
          <VideoActionsMenu onRename={() => onRename(video)} onMove={() => onMove(video)} onDelete={() => onDelete(video)} />
        </div>
            </div>
            <div className="p-4">
                <h3 className="font-semibold text-white truncate" title={video.title}>{video.title}</h3>
        <div className="text-xs text-white/50 flex items-center justify-between mt-2">
                    <span>{formatSimpleDate(video.uploadedAt)}</span>
                    <span>{formatDuration(video.duration)}</span>
                </div>
            </div>
        </div>
    );
};

const VideoListItem: React.FC<{ video: Video; onStartReview: (video: Video) => void; onRename: (video: Video) => void; onMove: (video: Video) => void; onDelete: (video: Video) => void; onGetDownloadUrl?: (args: { storageKey: string; expiresIn?: number }) => Promise<string>; }> = ({ video, onStartReview, onRename, onMove, onDelete, onGetDownloadUrl }) => {
  const [videoError, setVideoError] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>(video.src);
  const videoRef = useRef<HTMLVideoElement>(null);
  const signedOnce = useRef(false);
  const retrying = useRef(false);

  const signIfNeeded = async () => {
    if (!signedOnce.current && onGetDownloadUrl && video.storageKey) {
      const signed = await onGetDownloadUrl({ storageKey: video.storageKey, expiresIn: 60 * 60 }).catch(() => undefined);
      if (signed) {
        setPreviewSrc(signed);
        if (videoRef.current) {
          try {
            videoRef.current.src = signed;
            videoRef.current.load();
          } catch {}
        }
        signedOnce.current = true;
      }
    }
  };

  const handleEnter = async () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.loop = true;
    // @ts-expect-error
    el.playsInline = true;
    await signIfNeeded();
    const playSafe = async () => {
      try {
        await el.play();
      } catch (err: any) {
        // Autoplay blocked or other issue; keep poster
      }
    };
    if (el.readyState < 2) {
      const onCanPlay = () => {
        el.removeEventListener('canplay', onCanPlay);
        void playSafe();
      };
      el.addEventListener('canplay', onCanPlay, { once: true });
      try { el.load(); } catch {}
    } else {
      void playSafe();
    }
  };

  const handleLeave = () => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    try { el.currentTime = 0; } catch {}
  };

  const handleError = async () => {
    if (retrying.current) { setVideoError(true); return; }
    retrying.current = true;
    await signIfNeeded();
    const el = videoRef.current;
    if (el) {
      try {
        await el.play();
        setVideoError(false);
        retrying.current = false;
        return;
      } catch {}
    }
    setVideoError(true);
    retrying.current = false;
  };

  return (
    <div className="group flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-white/25 hover:bg-white/10 transition-all">
      <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-black/60" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {!videoError ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            src={previewSrc}
            poster={video.thumbnailUrl}
            preload="metadata"
            muted
            playsInline
            loop
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={handleError}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={26} className="text-white/40" />
          </div>
        )}
        <button
          onClick={() => onStartReview(video)}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition"
        >
          <PlayCircle size={28} className="text-white" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white truncate" title={video.title}>{video.title}</h3>
          <span className="text-xs text-white/45 whitespace-nowrap">{formatDuration(video.duration)}</span>
        </div>
        <div className="text-xs text-white/40 mt-1 flex items-center gap-3">
          <span>{formatSimpleDate(video.uploadedAt)}</span>
          <span>{video.projectId ? 'In project' : 'No project'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onStartReview(video)}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-white/10 rounded-full hover:bg-white/20 border border-white/10"
        >
          Open
        </button>
        <VideoActionsMenu onRename={() => onRename(video)} onMove={() => onMove(video)} onDelete={() => onDelete(video)} />
      </div>
    </div>
  );
};

const RecentlyReviewedSection: React.FC<{
  videos: Video[];
  onStartReview: (video: Video) => void;
  onRename: (video: Video) => void;
  onMove: (video: Video) => void;
  onDelete: (video: Video) => void;
  onGetDownloadUrl?: (args: { storageKey: string; expiresIn?: number }) => Promise<string>;
}> = ({ videos, onStartReview, onRename, onMove, onDelete, onGetDownloadUrl }) => {
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const topFive = useMemo(
    () =>
      [...videos]
        .filter((v) => v.lastReviewedAt)
        .sort((a, b) => new Date(b.lastReviewedAt || 0).getTime() - new Date(a.lastReviewedAt || 0).getTime())
        .slice(0, 5),
    [videos]
  );

  const unassigned = useMemo(() => {
    const topIds = new Set(topFive.map((v) => v.id));
    return videos
      .filter((v) => !v.projectId)
      .filter((v) => !topIds.has(v.id))
      .sort((a, b) => new Date(b.lastReviewedAt || 0).getTime() - new Date(a.lastReviewedAt || 0).getTime());
  }, [videos, topFive]);

  const slice = useMemo(() => unassigned.slice(0, page * pageSize), [unassigned, page, pageSize]);

  if (topFive.length === 0 && unassigned.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
        <h2 className="text-xs font-semibold tracking-[0.45em] text-white/40 uppercase">Recently Reviewed</h2>
        <p className="text-sm text-white/50 mt-3">Nessuna review recente ancora disponibile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {topFive.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold tracking-[0.45em] text-white/40 uppercase">Top 5 Recently Reviewed</h2>
            <span className="text-xs text-white/40">Aggiornato automaticamente</span>
          </div>
          <div className="space-y-3">
            {topFive.map((video) => (
              <VideoListItem
                key={video.id}
                video={video}
                onStartReview={onStartReview}
                onRename={onRename}
                onMove={onMove}
                onDelete={onDelete}
                onGetDownloadUrl={onGetDownloadUrl}
              />
            ))}
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold tracking-[0.45em] text-white/40 uppercase">Unassigned Reviews</h2>
            {slice.length < unassigned.length && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="text-xs font-semibold text-white bg-white/10 px-3 py-1.5 rounded-full hover:bg-white/20 border border-white/10"
              >
                Load more
              </button>
            )}
          </div>
          <div className="space-y-3">
            {slice.map((video) => (
              <VideoListItem
                key={video.id}
                video={video}
                onStartReview={onStartReview}
                onRename={onRename}
                onMove={onMove}
                onDelete={onDelete}
                onGetDownloadUrl={onGetDownloadUrl}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({
  videos,
  projects,
  onStartReview,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSetVideoProject,
  onRenameVideo,
  onCompleteUpload,
  onRemoveVideo,
  onGenerateUploadUrl,
  onGetDownloadUrl,
  userButton,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [projectsView, setProjectsView] = useState<'grid' | 'list'>('grid');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [pendingUpload, setPendingUpload] = useState<{
    file: File;
    objectUrl: string;
    metadata: { width: number; height: number; duration: number };
    thumbnailBlob?: Blob | null;
  } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    const [showProjectModal, setShowProjectModal] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [videoToRename, setVideoToRename] = useState<Video | null>(null);
  const [videoToMove, setVideoToMove] = useState<Video | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [deleteVideoError, setDeleteVideoError] = useState<string | null>(null);
  const [isProjectSaving, setIsProjectSaving] = useState(false);
  const [projectModalError, setProjectModalError] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

  const videosInProject = useMemo(() => {
    if (!activeProject) return [];
    return videos.filter((v) => v.projectId === activeProject.id);
  }, [videos, activeProject]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projects]
  );

  const preparePendingUpload = async (file: File) => {
    setUploadError(null);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadLogs([]);
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            const objectUrl = URL.createObjectURL(file);
            videoElement.src = objectUrl;

    const metadataPromise = new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
        resolve({
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight,
                    duration: videoElement.duration,
        });
      };
      videoElement.onerror = () => reject(new Error('Impossibile leggere i metadati del video'));
    });

    try {
      const metadata = await metadataPromise;
      // Capture a thumbnail from ~0.2s
      let thumbnailBlob: Blob | null = null;
      try {
        const capture = async () => {
          return new Promise<Blob | null>((resolve) => {
            const targetTime = Math.min(Math.max(0.2, 0), Math.max(0.2, metadata.duration - 0.1));
            const onSeeked = () => {
              const maxW = 640;
              const scale = Math.min(1, maxW / (videoElement.videoWidth || maxW));
              const w = Math.max(1, Math.round((videoElement.videoWidth || maxW) * scale));
              const h = Math.max(1, Math.round((videoElement.videoHeight || maxW) * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(null);
              ctx.drawImage(videoElement, 0, 0, w, h);
              canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };
            videoElement.currentTime = isFinite(targetTime) ? targetTime : 0;
            videoElement.onseeked = onSeeked;
            setTimeout(() => {
              if (!videoElement.seeking) onSeeked();
            }, 750);
          });
        };
        thumbnailBlob = await capture();
      } catch (_) {
        thumbnailBlob = null;
      }
      setPendingUpload({ file, objectUrl, metadata, thumbnailBlob });
      setSelectedProjectId(activeProject?.id ?? null);
      setShowAssignModal(true);
    } catch (error) {
      console.error('Video metadata read failed', error);
      setUploadError(error instanceof Error ? error.message : 'Impossibile leggere i metadati');
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  };

  const DeleteVideoModal: React.FC = () => {
    const handleDelete = async () => {
      if (!videoToDelete || isDeletingVideo) return;
      setDeleteVideoError(null);
      setIsDeletingVideo(true);
      try {
        await onRemoveVideo(videoToDelete.id);
        setVideoToDelete(null);
      } catch (error) {
        console.error('Video delete failed', error);
        setDeleteVideoError(error instanceof Error ? error.message : 'Unable to delete');
      } finally {
        setIsDeletingVideo(false);
      }
    };

    if (!videoToDelete) return null;

    return (
      <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
        <div className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl space-y-6">
          <header className="px-6 pt-6">
            <h2 className="text-lg font-semibold text-white">Delete review</h2>
            <p className="text-xs text-white/50 mt-2">
              "{videoToDelete.title}" verrà rimosso dalla tua libreria. L'azione non può essere annullata.
            </p>
            {deleteVideoError && <p className="text-xs text-red-300 mt-3">{deleteVideoError}</p>}
          </header>
          <footer className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setVideoToDelete(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeletingVideo}
              className="px-4 py-2 rounded-full text-xs font-semibold text-red-200 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-40"
            >
              {isDeletingVideo ? 'Deleting…' : 'Delete'}
            </button>
          </footer>
        </div>
      </div>
    );
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await preparePendingUpload(file);
    } finally {
      // reset input per permettere di selezionare lo stesso file di nuovo
      event.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type || !file.type.startsWith('video/')) {
      setUploadError('Trascina un file video valido (mp4, webm, mov).');
      return;
    }
    try {
      await preparePendingUpload(file);
    } catch {
      // l'errore è già gestito in preparePendingUpload
    }
  };

  const proceedUpload = async () => {
    if (!pendingUpload) return;
    const { file, objectUrl, metadata, thumbnailBlob } = pendingUpload;
    setShowAssignModal(false);
    setIsUploading(true);
    setUploadError(null);
    setUploadLogs([]);
    setUploadLogs((prev) => [...prev, `Lettura metadati video: ${file.name}`]);
    setUploadLogs((prev) => [
      ...prev,
      `Metadati: ${metadata.width}x${metadata.height}, ${Math.round(metadata.duration)}s`,
    ]);
    try {
      setUploadLogs((prev) => [...prev, `Richiesta URL di upload prefirmato...`]);
      const { storageKey, uploadUrl, publicUrl } = await onGenerateUploadUrl({
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
      setUploadLogs((prev) => [...prev, `Upload verso storage iniziato`]);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadLogs((prev) => [...prev, `Upload completato (${xhr.status})`]);
              resolve();
        } else {
              reject(new Error(`Upload failed: HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Errore di rete durante l'upload"));
        xhr.send(file);
      });

      // Optional thumbnail upload
      let thumbUrl: string | undefined = undefined;
      if (thumbnailBlob) {
        try {
          setUploadLogs((prev) => [...prev, `Upload thumbnail...`]);
          const thumbMeta = await onGenerateUploadUrl({
            contentType: 'image/jpeg',
            fileName: `${file.name.replace(/\.[^.]+$/, '')}.jpg`,
          });
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', thumbMeta.uploadUrl, true);
            xhr.setRequestHeader('Content-Type', 'image/jpeg');
            xhr.onreadystatechange = () => {
              if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
                } else {
                  reject(new Error(`Thumbnail upload failed: HTTP ${xhr.status}`));
                }
              }
            };
            xhr.onerror = () => reject(new Error('Errore di rete durante l\'upload thumbnail'));
            xhr.send(thumbnailBlob);
          });
          thumbUrl = thumbMeta.publicUrl;
        } catch (e) {
          console.warn('Thumbnail upload failed', e);
        }
      }

      setUploadLogs((prev) => [...prev, `Registrazione video su backend...`]);
      const created = await onCompleteUpload({
        storageKey,
        publicUrl,
        title: file.name,
        width: metadata.width,
        height: metadata.height,
        fps: 24,
        duration: metadata.duration,
        projectId: selectedProjectId ?? null,
        thumbnailUrl: thumbUrl,
      });
      setUploadLogs((prev) => [...prev, `Video registrato con successo`]);

      const videoForReview: Video = {
        id: created.id,
        title: created.title,
        src: created.src,
        storageKey: created.storageKey,
        width: created.width,
        height: created.height,
        fps: created.fps,
        duration: created.duration,
        projectId: created.projectId ?? undefined,
        uploadedAt: new Date(created.uploadedAt).toISOString(),
        lastReviewedAt: created.lastReviewedAt
          ? new Date(created.lastReviewedAt).toISOString()
          : undefined,
      };
      await onStartReview(videoForReview);
      setUploadLogs([]);
    } catch (error) {
      console.error('Video upload failed', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
      setUploadLogs((prev) => [
        ...prev,
        `Errore: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    } finally {
      setIsUploading(false);
      if (pendingUpload) URL.revokeObjectURL(pendingUpload.objectUrl);
      setPendingUpload(null);
      setSelectedProjectId(null);
    }
  };

  const handleProjectFormSubmit = async (projectName: string) => {
    setProjectModalError(null);
    setIsProjectSaving(true);
    try {
      if (projectToEdit) {
        await onUpdateProject({ id: projectToEdit.id, name: projectName });
        } else {
        await onCreateProject(projectName);
        }
        setProjectToEdit(null);
        setShowProjectModal(false);
    } catch (error) {
      console.error('Project save failed', error);
      setProjectModalError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsProjectSaving(false);
    }
  };

    const ProjectModal: React.FC = () => {
        const [name, setName] = useState(projectToEdit?.name || '');
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            inputRef.current?.focus();
        }, []);
        
    const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
      if (!name.trim() || isProjectSaving) return;
      await handleProjectFormSubmit(name.trim());
        };

        return (
      <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
        <div className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <header className="flex items-center justify-between px-6 pt-6">
              <h2 className="text-lg font-semibold text-white">
                {projectToEdit ? 'Rename Project' : 'Create Project'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!isProjectSaving) {
                    setShowProjectModal(false);
                    setProjectToEdit(null);
                    setProjectModalError(null);
                  }
                }}
                className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
                            </button>
            </header>
            <div className="px-6">
              <label className="text-xs font-semibold tracking-[0.3em] uppercase text-white/40">
                Name
              </label>
                            <input
                                ref={inputRef}
                                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white"
                placeholder="Project title"
              />
              {projectModalError && (
                <p className="text-xs text-red-300 mt-2">{projectModalError}</p>
              )}
                        </div>
            <footer className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isProjectSaving) {
                    setShowProjectModal(false);
                    setProjectToEdit(null);
                    setProjectModalError(null);
                  }
                }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
              >
                Cancel
                            </button>
              <button
                type="submit"
                disabled={!name.trim() || isProjectSaving}
                className="px-4 py-2 rounded-full text-xs font-semibold text-black bg-white hover:bg-white/90 disabled:opacity-40"
              >
                {isProjectSaving ? 'Saving…' : projectToEdit ? 'Save changes' : 'Create project'}
                            </button>
            </footer>
                    </form>
                </div>
            </div>
        );
    };
    
  const AssignProjectModal: React.FC = () => (
    <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
      <div className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl">
        <header className="flex items-center justify-between px-6 pt-6">
          <h2 className="text-lg font-semibold text-white">Aggiungi alla cartella</h2>
          <button
            type="button"
            onClick={() => {
              setShowAssignModal(false);
              setPendingUpload(null);
            }}
            className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-6 py-6 space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-[0.3em] uppercase text-white/40">
              Destinazione
            </label>
            <select
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
            >
              <option value="">Nessun progetto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
                </div>
          {pendingUpload && (
            <div className="text-xs text-white/50 space-y-2">
              <p><span className="text-white/70">File:</span> {pendingUpload.file.name}</p>
              <p>
                <span className="text-white/70">Dimensioni:</span> {pendingUpload.metadata.width}×
                {pendingUpload.metadata.height}
              </p>
              <p>
                <span className="text-white/70">Durata:</span> {Math.round(pendingUpload.metadata.duration)}s
              </p>
            </div>
          )}
        </div>
        <footer className="px-6 pb-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAssignModal(false);
              setPendingUpload(null);
            }}
            className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={proceedUpload}
            className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10"
          >
            Carica e apri
          </button>
        </footer>
            </div>
        </div>
    );
    
  const RenameVideoModal: React.FC = () => {
    const [name, setName] = useState(videoToRename?.title || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setName(videoToRename?.title || '');
      setError(null);
    }, [videoToRename]);

    if (!videoToRename) return null;

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      setError(null);
      try {
        await onRenameVideo(videoToRename.id, name.trim());
        setVideoToRename(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to rename');
      } finally {
        setSaving(false);
      }
    };

        return (
      <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
        <form onSubmit={submit} className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl space-y-6">
          <header className="flex items-center justify-between px-6 pt-6">
            <h2 className="text-lg font-semibold text-white">Rename Review</h2>
            <button
              type="button"
              onClick={() => setVideoToRename(null)}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
            >
              <X size={18} />
                        </button>
          </header>
          <div className="px-6">
            <label className="text-xs font-semibold tracking-[0.3em] uppercase text-white/40">
              New name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white"
              placeholder="Review title"
            />
            {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
                    </div>
          <footer className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setVideoToRename(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    );
  };

  const MoveVideoModal: React.FC = () => {
    const [targetProject, setTargetProject] = useState<string | null>(videoToMove?.projectId || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openPicker, setOpenPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setTargetProject(videoToMove?.projectId || null);
      setError(null);
      setOpenPicker(false);
    }, [videoToMove]);

    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
          setOpenPicker(false);
        }
      };
      document.addEventListener('mousedown', onDocClick);
      return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    if (!videoToMove) return null;

    const submit = async () => {
      setSaving(true);
      setError(null);
      try {
        await onSetVideoProject(videoToMove.id, targetProject);
        setVideoToMove(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to move');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
        <div className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl">
          <header className="flex items-center justify-between px-6 pt-6">
            <h2 className="text-lg font-semibold text-white">Move Review</h2>
            <button
              type="button"
              onClick={() => setVideoToMove(null)}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
            >
              <X size={18} />
            </button>
                </header>
          <div className="px-6 py-6 space-y-4">
            <label className="text-xs font-semibold tracking-[0.3em] uppercase text-white/40">
              Destination
            </label>
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setOpenPicker((v) => !v)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-left flex items-center justify-between hover:bg-white/10"
              >
                <span className="truncate">{targetProject ? (projects.find(p => p.id === targetProject)?.name ?? 'Seleziona') : 'No project'}</span>
                <span className="text-white/40">▾</span>
              </button>
              {openPicker && (
                <div className="absolute z-10 mt-2 w-full bg-black border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-auto">
                  <button
                    className={`w-full text-left px-4 py-2 text-sm ${!targetProject ? 'text-white' : 'text-white/80'} hover:bg-white/10`}
                    onClick={() => { setTargetProject(null); setOpenPicker(false); }}
                  >
                    No project
                  </button>
                  <div className="h-px bg-white/10" />
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 ${targetProject === project.id ? 'text-white' : 'text-white/80'}`}
                      onClick={() => { setTargetProject(project.id); setOpenPicker(false); }}
                    >
                      {project.name}
                    </button>
                  ))}
                    </div>
              )}
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
          <footer className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setVideoToMove(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-40"
            >
              {saving ? 'Moving…' : 'Move'}
            </button>
          </footer>
        </div>
      </div>
    );
  };

  const DeleteProjectModal: React.FC = () => {
    const handleDelete = async () => {
      if (!projectToDelete || isDeletingProject) return;
      setDeleteProjectError(null);
      setIsDeletingProject(true);
      try {
        await onDeleteProject(projectToDelete.id);
        setProjectToDelete(null);
      } catch (error) {
        console.error('Project delete failed', error);
        setDeleteProjectError(error instanceof Error ? error.message : 'Unable to delete project');
      } finally {
        setIsDeletingProject(false);
      }
    };

    if (!projectToDelete) return null;

    return (
      <div className="fixed inset-0 bg-black/70 z-50 grid place-items-center p-4 backdrop-blur">
        <div className="w-full max-w-md bg-black border border-white/10 rounded-3xl shadow-2xl space-y-6">
          <header className="px-6 pt-6">
            <h2 className="text-lg font-semibold text-white">Delete project</h2>
            <p className="text-xs text-white/50 mt-2">
              "{projectToDelete.name}" verrà rimosso. Le review resteranno disponibili nella tua libreria.
            </p>
            {deleteProjectError && <p className="text-xs text-red-300 mt-3">{deleteProjectError}</p>}
          </header>
          <footer className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setProjectToDelete(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeletingProject}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-40"
            >
              {isDeletingProject ? 'Deleting…' : 'Delete'}
            </button>
          </footer>
            </div>
        </div>
    );
  };
    
    if (activeProject) {
        return (
      <div className="min-h-full flex flex-col">
        <header className="flex-shrink-0 px-12 py-6 border-b border-white/10 bg-black/60 backdrop-blur">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-white/40">
            <button
              onClick={() => setActiveProject(null)}
              className="inline-flex items-center gap-2 text-white/60 hover:text-white"
            >
              <ChevronLeft size={18} /> Projects
                        </button>
            <span className="text-white/40">/</span>
            <span className="text-white tracking-normal text-lg font-semibold flex items-center gap-2">
              <Folder size={20} /> {activeProject.name}
            </span>
                    </div>
                </header>
        <main className="flex-1 px-12 py-12 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-[0.4em] text-white/40 font-semibold">Project Reviews</h2>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1">
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded-full ${view === 'grid' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`}
              >
                <Grip size={18} />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 rounded-full ${view === 'list' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`}
              >
                <List size={18} />
              </button>
            </div>
                    </div>
                    {view === 'grid' ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {videosInProject.map((video) => (
                <VideoGridCard
                  key={video.id}
                  video={video}
                  onStartReview={onStartReview}
                  onRename={(v) => setVideoToRename(v)}
                  onMove={(v) => setVideoToMove(v)}
                  onDelete={(v) => setVideoToDelete(v)}
                  onGetDownloadUrl={onGetDownloadUrl}
                />
              ))}
                        </div>
                    ) : (
            <div className="space-y-4">
              {videosInProject.map((video) => (
                <VideoListItem
                  key={video.id}
                  video={video}
                  onStartReview={onStartReview}
                  onRename={(v) => setVideoToRename(v)}
                  onMove={(v) => setVideoToMove(v)}
                  onDelete={(v) => setVideoToDelete(v)}
                  onGetDownloadUrl={onGetDownloadUrl}
                />
              ))}
                        </div>
                    )}
          {videosInProject.length === 0 && (
            <p className="text-center text-white/40 mt-16">
              Non ci sono review in questo progetto. Caricane una per iniziare.
            </p>
          )}
                </main>
        {videoToRename && <RenameVideoModal />}
        {videoToMove && <MoveVideoModal />}
        {videoToDelete && <DeleteVideoModal />}
            </div>
    );
    }

    return (
    <div className="min-h-full flex flex-col">
            {showProjectModal && <ProjectModal />}
      {showAssignModal && <AssignProjectModal />}
            {projectToDelete && <DeleteProjectModal />}
      {videoToRename && <RenameVideoModal />}
      {videoToMove && <MoveVideoModal />}
      {videoToDelete && <DeleteVideoModal />}
      <header className="flex-shrink-0 px-12 py-6 border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold tracking-[0.5em] text-white/40 uppercase">Reffo</span>
            <h1 className="text-2xl font-semibold text-white mt-2 flex items-center gap-3">
              <PlayCircle size={22} /> Video Reviewer Workspace
            </h1>
          </div>
          <div className="flex items-center gap-3">{userButton}</div>
        </div>
            </header>
      <main className="flex-1 px-12 py-12 overflow-y-auto">
        <div className="grid gap-10 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)]">
          <section
            className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 transition ${
              isDragActive ? 'ring-2 ring-white/40 border-white/30 bg-white/10' : ''
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDragActive) setIsDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_40%)]" />
            <div className="relative flex flex-col gap-6">
                <div>
                <h2 className="text-xs font-semibold tracking-[0.4em] text-white/40 uppercase">Upload</h2>
                <p className="text-3xl font-semibold text-white mt-3">Importa una nuova review</p>
                <p className="text-sm text-white/50 mt-2 max-w-xl">
                  Carica un video e scegli la destinazione. Al termine verrai portato direttamente nella sessione di review.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-6 py-3 rounded-full shadow-sm hover:bg-white/20 transition disabled:opacity-40 border border-white/10"
                >
                  {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={20} />}
                  {isUploading ? 'Upload in corso' : 'Seleziona file'}
                            </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                />
                {uploadError && <span className="text-xs text-red-300">{uploadError}</span>}
                        </div>
              {isUploading && (
                <div className="space-y-2">
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-2 bg-white transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  <div className="text-xs text-white/50">{uploadProgress}%</div>
                </div>
              )}
              {uploadLogs.length > 0 && (
                <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-xs text-white/70 max-h-44 overflow-auto">
                  <div className="font-semibold text-white mb-2">Upload logs</div>
                  <ul className="space-y-1">
                    {uploadLogs.map((log, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="block h-1.5 w-1.5 rounded-full bg-white/50" />
                        <span>{log}</span>
                      </li>
                    ))}
                  </ul>
                    </div>
                )}
            </div>
          </section>

          <section className="space-y-8">
            <RecentlyReviewedSection
              videos={videos}
              onStartReview={onStartReview}
              onRename={(v) => setVideoToRename(v)}
              onMove={(v) => setVideoToMove(v)}
              onDelete={(v) => setVideoToDelete(v)}
              onGetDownloadUrl={onGetDownloadUrl}
            />
          </section>
        </div>

        <section className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
                <div>
              <h2 className="text-xs font-semibold tracking-[0.4em] text-white/40 uppercase">Projects</h2>
              <p className="text-xl font-semibold text-white mt-2">Organizza le tue revisioni</p>
                            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1">
                <button
                  onClick={() => setProjectsView('grid')}
                  className={`p-2 rounded-full ${projectsView === 'grid' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`}
                >
                  <Grip size={18} />
                </button>
                <button
                  onClick={() => setProjectsView('list')}
                  className={`p-2 rounded-full ${projectsView === 'list' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`}
                >
                  <List size={18} />
                            </button>
                        </div>
              <button
                onClick={() => setShowProjectModal(true)}
                className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-4 py-2 rounded-full hover:bg-white/20 border border-white/10"
              >
                <Plus size={16} /> Nuovo progetto
                            </button>
                    </div>
                    </div>

                     {projectsView === 'grid' ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {sortedProjects.map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                  videoCount={videos.filter((v) => v.projectId === project.id).length}
                                    onSelect={() => setActiveProject(project)}
                  onRename={() => {
                    setProjectToEdit(project);
                    setShowProjectModal(true);
                  }}
                                    onDelete={() => setProjectToDelete(project)}
                                />
                            ))}
                        </div>
                    ) : (
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                            <table className="w-full text-left">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Name</th>
                    <th className="px-6 py-4 font-semibold">Videos</th>
                    <th className="px-6 py-4 font-semibold">Created</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                  {sortedProjects.map((project) => {
                    const count = videos.filter((v) => v.projectId === project.id).length;
                                        return (
                      <tr key={project.id} className="border-t border-white/10 hover:bg-white/10 transition-colors">
                        <td className="px-6 py-4 text-white">
                          <button
                            onClick={() => setActiveProject(project)}
                            className="inline-flex items-center gap-3 hover:text-white/80"
                          >
                            <Folder size={18} /> {project.name}
                          </button>
                                                </td>
                        <td className="px-6 py-4 text-white/60">{count}</td>
                        <td className="px-6 py-4 text-white/60">{formatSimpleDate(project.createdAt)}</td>
                        <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setActiveProject(project)}
                              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-md"
                            >
                              <ExternalLink size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setProjectToEdit(project);
                                setShowProjectModal(true);
                              }}
                              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-md"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setProjectToDelete(project)}
                              className="p-1.5 text-white/60 hover:text-red-300 hover:bg-white/10 rounded-md"
                            >
                              <Trash2 size={16} />
                            </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

          {projects.length === 0 && (
            <p className="text-center text-white/40 pt-10">Non hai ancora creato progetti. Creane uno per iniziare.</p>
          )}
        </section>
            </main>
        </div>
    );
};

export default Dashboard;
