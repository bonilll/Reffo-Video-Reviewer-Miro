import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { nanoid } from 'nanoid';
import {
  Film,
  PlayCircle,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  Link as LinkIcon,
  X,
  Loader2,
  Search,
  Users,
  AlertTriangle,
  Info,
  ChevronDown,
} from 'lucide-react';
// Ensure saved animation is included in build output
import lottieSavedRaw from '../assets/animations/saved.json?raw';
const lottieSaved = `data:application/json;charset=utf-8,${encodeURIComponent(lottieSavedRaw as unknown as string)}`;
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Project, Video, ShareGroup, ContentShare } from '../types';
import { useThemePreference } from '../useTheme';
import { publicBaseUrl } from '../utils/url';

interface UploadMetadata {
  storageKey: string;
  publicUrl: string;
  title: string;
  description?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  projectId: string;
  thumbnailUrl?: string;
  reviewId?: string;
}

interface DashboardProps {
  user: {
    name?: string | null;
    email: string;
    avatar?: string | null;
  };
  videos: Video[];
  projects: Project[];
  ownedProjectIds?: string[];
  onStartReview: (video: Video) => void | Promise<void>;
  onCreateProject: (name: string) => Promise<string | void>;
  onUpdateProject: (project: { id: string; name: string }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSetVideoProject: (videoId: string, projectId: string) => Promise<void>;
  onRenameVideo: (videoId: string, title: string) => Promise<void>;
  onCompleteUpload: (payload: UploadMetadata) => Promise<Video>;
  onRemoveVideo: (videoId: string) => Promise<void>;
  onGenerateUploadUrl: (args: { contentType: string; fileName?: string; context?: "review" | "board" | "library"; contextId?: string }) => Promise<{
    storageKey: string;
    uploadUrl: string;
    publicUrl: string;
  }>;
  onGetDownloadUrl: (args: { storageKey: string; expiresIn?: number }) => Promise<string>;
  onOpenProject?: (projectId: string) => void;
}

interface UploadState {
  file: File;
  objectUrl: string;
  metadata: {
    width: number;
    height: number;
    duration: number;
    fps: number;
  };
  thumbnailBlob?: Blob | null;
  reviewId: string;
}

interface ActionToast {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

const formatDate = (isoString: string) =>
  new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

const getInitials = (name?: string | null) => {
  if (!name) return '';
  const [first, second] = name.split(' ');
  if (first && second) {
    return `${first[0]}${second[0]}`.toUpperCase();
  }
  return first.slice(0, 2).toUpperCase();
};

const ProjectBadge: React.FC<{ count: number }> = ({ count }) => (
  <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
    {count} video{count === 1 ? '' : 's'}
  </span>
);

export const VideoActionsMenu: React.FC<{
  onRename: () => void;
  onMove: () => void;
  onShare: () => void;
  onDelete: () => void;
  isDark?: boolean;
}> = ({ onRename, onMove, onShare, onDelete, isDark }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const MENU_WIDTH = 192; // w-48 in Tailwind (12rem)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const updateCoords = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(
      Math.max(gap, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - gap
    );
    const top = Math.min(
      rect.bottom + gap,
      window.innerHeight - gap
    );
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateCoords]);

  return (
    <div
      className="relative"
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
          if (!open) {
            // position on next frame to ensure refs are ready
            requestAnimationFrame(() => updateCoords());
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-50 w-48 rounded-xl border shadow-2xl backdrop-blur ${isDark ? 'border-white/10 bg-black/90' : 'border-gray-200 bg-white'}`}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
              onClick={(e) => {
                e.stopPropagation();
                onRename();
                setOpen(false);
              }}
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
              onClick={(e) => {
                e.stopPropagation();
                onMove();
                setOpen(false);
              }}
            >
              <Folder size={14} /> Move to project
            </button>
            <button
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
              onClick={(e) => {
                e.stopPropagation();
                onShare();
                setOpen(false);
              }}
            >
              <Share2 size={14} /> Share
            </button>
            <div className={`my-1 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
            <button
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-red-300 hover:bg-white/10' : 'text-red-600 hover:bg-black/5'}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setOpen(false);
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>,
          document.body
        )
      }
    </div>
  );
};

const ThumbnailPreview: React.FC<{ video: Video }> = ({ video }) => {
  const [failed, setFailed] = useState(false);

  if (video.thumbnailUrl && !failed) {
    return (
      <img
        src={video.thumbnailUrl}
        alt={video.title}
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  if (!failed) {
    return (
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={video.src}
        muted
        playsInline
        preload="metadata"
        poster={video.thumbnailUrl}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Film size={40} className="text-white/40" />
    </div>
  );
};

const PROJECTS_VIEW_MODE_STORAGE_KEY = 'dashboard:projects:view-mode';

const Dashboard: React.FC<DashboardProps> = ({
  user,
  videos,
  projects,
  ownedProjectIds,
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
  onOpenProject,
}) => {
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const [pendingUpload, setPendingUpload] = useState<UploadState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [videoToRename, setVideoToRename] = useState<Video | null>(null);
  const [videoToMove, setVideoToMove] = useState<Video | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
  const [videoToShare, setVideoToShare] = useState<Video | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [sharingModalOpen, setSharingModalOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      const stored = window.localStorage.getItem(PROJECTS_VIEW_MODE_STORAGE_KEY);
      return stored === 'list' || stored === 'grid' ? (stored as 'grid' | 'list') : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteTarget, setInviteTarget] = useState<ShareGroup | null>(null);
  const [renameTarget, setRenameTarget] = useState<ShareGroup | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);
  const ensuredDefaultProject = useRef(false);

  const shareGroups = useQuery(api.shareGroups.list, {});
  const shareRecords = useQuery(api.shares.list, {});
  const workspaceSettings = useQuery(api.settings.getOrNull, {});
  const isDark = useThemePreference((workspaceSettings?.workspace.theme as any) ?? 'system');

  const shareToGroup = useMutation(api.shares.shareToGroup);
  const generateShareLink = useMutation(api.shares.generateLink);
  const revokeShare = useMutation(api.shares.revoke);
  const autoShareVideo = useMutation(api.shares.autoShareVideo);
  const createShareGroup = useMutation(api.shareGroups.create);
  const updateShareGroup = useMutation(api.shareGroups.update);
  const archiveShareGroup = useMutation(api.shareGroups.archive);
  const addMemberMutation = useMutation(api.shareGroups.addMember);
  const updateMemberMutation = useMutation(api.shareGroups.updateMember);
  const removeMemberMutation = useMutation(api.shareGroups.removeMember);
  const syncFriends = useMutation(api.shareGroups.syncFriendsFromGroups);
  const friends = useQuery(api.friends.list, {});

  // One-time sync of friends from existing groups for owner
  useEffect(() => {
    if (shareGroups && shareGroups.length) {
      void syncFriends({}).catch(() => undefined);
    }
  }, [shareGroups, syncFriends]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(term));
  }, [projects, searchTerm]);


  useEffect(() => {
    if (!projects.length || ensuredDefaultProject.current) {
      return;
    }
    if (!selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PROJECTS_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [viewMode]);

  const pushToast = useCallback((tone: ActionToast['tone'], message: string) => {
    setToasts((current) => [{ id: toastId.current++, tone, message }, ...current]);
  }, []);

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };


  const prepareUpload = async (file: File) => {
    setUploadLogs([]);
    setUploadProgress(0);
    const objectUrl = URL.createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = objectUrl;

    const metadata = await new Promise<UploadState['metadata']>((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        resolve({
          width: videoElement.videoWidth,
          height: videoElement.videoHeight,
          duration: videoElement.duration,
          fps: videoElement.getVideoPlaybackQuality?.().totalVideoFrames && videoElement.duration > 0
            ? Math.round(videoElement.getVideoPlaybackQuality().totalVideoFrames / videoElement.duration)
            : 24,
        });
      };
      videoElement.onerror = () => {
        reject(new Error('Unable to read video metadata.'));
      };
    });

    const captureFrame = async () => {
      try {
        const canvas = document.createElement('canvas');
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / metadata.width);
        const width = Math.max(1, Math.round(metadata.width * scale));
        const height = Math.max(1, Math.round(metadata.height * scale));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        const targetTime = Math.min(Math.max(0.2, metadata.duration * 0.2), Math.max(metadata.duration - 0.1, 0.2));
        videoElement.currentTime = targetTime;
        await new Promise<void>((resolve) => {
          videoElement.onseeked = () => resolve();
        });
        context.drawImage(videoElement, 0, 0, width, height);
        return await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
        );
      } catch {
        return null;
      }
    };

    const thumbnailBlob = await captureFrame();

    setPendingUpload({ file, objectUrl, metadata, thumbnailBlob, reviewId: nanoid() });
    setShowUploadModal(true);
  };

  const ensureDefaultProject = useCallback(async () => {
    if (projects.length) return;
    if (ensuredDefaultProject.current) return;
    const name = 'Starter Project';
    ensuredDefaultProject.current = true;
    const createdId = (await onCreateProject(name)) || null;
    if (createdId) {
      setSelectedProjectId(createdId);
    }
    pushToast('info', 'Created a starter project to get you going.');
  }, [onCreateProject, projects.length, pushToast]);

  useEffect(() => {
    if (!projects.length) {
      void ensureDefaultProject();
    }
  }, [projects.length, ensureDefaultProject]);

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await prepareUpload(file);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to prepare upload.');
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      pushToast('error', 'Only video files are supported for upload.');
      return;
    }
    try {
      await prepareUpload(file);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to prepare upload.');
    }
  };

  const resetUploadState = () => {
    if (pendingUpload) URL.revokeObjectURL(pendingUpload.objectUrl);
    setPendingUpload(null);
    setUploadLogs([]);
    setUploadProgress(0);
    setShowUploadModal(false);
  };

  const persistThumbnail = async (blob: Blob | null, fileName: string, reviewId: string) => {
    if (!blob) return undefined;
    try {
      const thumbMeta = await onGenerateUploadUrl({
        contentType: 'image/jpeg',
        fileName: `${fileName.replace(/\.[^.]+$/, '')}-thumbnail.jpg`,
        context: "review",
        contextId: reviewId,
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', thumbMeta.uploadUrl, true);
        xhr.setRequestHeader('Content-Type', 'image/jpeg');
        xhr.timeout = 1000 * 60 * 10; // 10 minutes for thumbnail
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Thumbnail upload failed with status ${xhr.status} ${xhr.statusText || ''}`.trim()));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error while uploading thumbnail.'));
        xhr.ontimeout = () => reject(new Error('Thumbnail upload timed out.'));
        xhr.send(blob);
      });
      return thumbMeta.publicUrl;
    } catch (error) {
      console.warn('Thumbnail upload failed', error);
      pushToast('error', 'Thumbnail upload failed. The review will use a live preview instead.');
      return undefined;
    }
  };

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

  // Multipart upload helpers via Convex actions (cast to any to avoid typegen drift)
  const createMultipart = useAction((api as any).storage.createMultipartUpload);
  const getMultipartUrls = useAction((api as any).storage.getMultipartUploadUrls);
  const completeMultipart = useAction((api as any).storage.completeMultipartUpload);
  const abortMultipart = useAction((api as any).storage.abortMultipartUpload);

  const uploadMultipart = async (file: File, contentType: string, onProgress: (p: number) => void, reviewId: string) => {
    const partSize = 16 * 1024 * 1024; // 16MB per part (Cloudflare-friendly)
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));
    const { storageKey, uploadId, publicUrl } = await createMultipart({
      contentType,
      fileName: file.name,
      context: "review",
      contextId: reviewId,
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
        xhr.timeout = 1000 * 60 * 15; // 15 minutes per part
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

  const proceedUpload = async () => {
    if (!pendingUpload) return;
    if (!selectedProjectId) {
      pushToast('error', 'Select a project before uploading.');
      return;
    }
    setIsUploading(true);
    setUploadLogs([`Preparing upload for ${pendingUpload.file.name}`]);
    setUploadProgress(0);

    try {
      const contentType = resolveContentType(pendingUpload.file);
      const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
      let uploadResult: { storageKey: string; publicUrl: string };
      if (pendingUpload.file.size >= MULTIPART_THRESHOLD) {
        setUploadLogs((cur) => [...cur, `Using multipart upload (${Math.ceil(pendingUpload.file.size / (16 * 1024 * 1024))} parts)…`] );
        uploadResult = await uploadMultipart(pendingUpload.file, contentType, (p) => setUploadProgress(p), pendingUpload.reviewId);
      } else {
        const { storageKey, uploadUrl, publicUrl } = await onGenerateUploadUrl({
          contentType,
          fileName: pendingUpload.file.name,
          context: "review",
          contextId: pendingUpload.reviewId,
        });
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', contentType);
          xhr.timeout = 1000 * 60 * 45; // 45 minutes for large uploads
          setUploadLogs((cur) => [...cur, 'Upload started…']);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
          };
          xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                const msg = xhr.responseText ? `: ${xhr.responseText.slice(0, 200)}` : '';
                reject(new Error(`Upload failed with status ${xhr.status} ${xhr.statusText || ''}${msg}`.trim()));
              }
            }
          };
          xhr.onerror = () => reject(new Error('Network error during video upload.'));
          xhr.ontimeout = () => reject(new Error('Upload timed out (URL expired or network/proxy limit hit). Try a smaller file or faster connection.'));
          xhr.send(pendingUpload.file);
        });
        uploadResult = { storageKey, publicUrl };
      }

      setUploadLogs((current) => [...current, 'Upload completed, saving review…']);

      const thumbnailUrl = await persistThumbnail(
        pendingUpload.thumbnailBlob ?? null,
        pendingUpload.file.name,
        pendingUpload.reviewId,
      );

      const created = await onCompleteUpload({
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        title: pendingUpload.file.name,
        width: pendingUpload.metadata.width,
        height: pendingUpload.metadata.height,
        fps: pendingUpload.metadata.fps,
        duration: pendingUpload.metadata.duration,
        projectId: selectedProjectId,
        thumbnailUrl,
        reviewId: pendingUpload.reviewId,
      });

      setUploadLogs((current) => [...current, 'Review created successfully.']);
      // Ensure project-level group shares are propagated to the new video
      if (selectedProjectId) {
        await autoShareVideo({
          videoId: created.id as any,
          projectId: selectedProjectId as any,
        }).catch(() => undefined);
      }
      const autoShareGroups = workspaceSettings?.workspace.autoShareGroupIds ?? [];
      if (autoShareGroups.length) {
        await Promise.all(
          autoShareGroups.map((groupId) =>
            shareToGroup({
              videoId: created.id as any,
              projectId: undefined,
              groupId: groupId as any,
              allowDownload: true,
              allowComments: true,
            }).catch(() => undefined)
          )
        );
      }

      pushToast('success', 'Upload complete. Opening reviewer.');
      await onStartReview(created);
    } catch (error) {
      console.error(error);
      pushToast('error', error instanceof Error ? error.message : 'Failed to complete upload.');
      setUploadLogs((current) => [...current, 'Upload failed.']);
    } finally {
      setIsUploading(false);
      resetUploadState();
    }
  };

  const handleRename = async (video: Video, title: string) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can rename this review.');
      setVideoToRename(null);
      return;
    }
    if (!title.trim()) return;
    await onRenameVideo(video.id, title.trim());
    setVideoToRename(null);
    pushToast('success', 'Review title updated.');
  };

  const handleMove = async (video: Video, projectId: string) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can move this review.');
      setVideoToMove(null);
      return;
    }
    await onSetVideoProject(video.id, projectId);
    setVideoToMove(null);
    pushToast('success', 'Review moved to project.');
  };

  const handleDelete = async (video: Video) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can delete this review.');
      setVideoToDelete(null);
      return;
    }
    await onRemoveVideo(video.id);
    setVideoToDelete(null);
    pushToast('success', 'Review deleted.');
  };

  const shareVideoToGroup = async (
    video: Video,
    groupId: string,
    allowDownload: boolean,
    allowComments: boolean,
  ) => {
    await shareToGroup({
      videoId: video.id as any,
      projectId: undefined,
      groupId: groupId as any,
      allowDownload,
      allowComments,
    });
    pushToast('success', 'Review shared with group.');
  };

  const shareProjectToGroup = async (
    project: Project,
    groupId: string,
    allowDownload: boolean,
    allowComments: boolean,
  ) => {
    await shareToGroup({
      videoId: undefined,
      projectId: project.id as any,
      groupId: groupId as any,
      allowDownload,
      allowComments,
    });
    pushToast('success', 'Project shared with group. Future reviews will follow.');
  };

  const generateVideoLink = async (
    video: Video,
    allowDownload: boolean,
    allowComments: boolean,
    expiresAt?: number,
  ) => {
    const token = await generateShareLink({
      videoId: video.id as any,
      projectId: undefined,
      allowDownload,
      allowComments,
      expiresAt,
    });
    pushToast('success', 'Shareable link generated. Copy it from the sharing panel.');
    return token;
  };

  const generateProjectLink = async (
    project: Project,
    allowDownload: boolean,
    allowComments: boolean,
    expiresAt?: number,
  ) => {
    const token = await generateShareLink({
      videoId: undefined,
      projectId: project.id as any,
      allowDownload,
      allowComments,
      expiresAt,
    });
    pushToast('success', 'Project link generated.');
    return token;
  };

  const activeShares = useMemo(() => {
    if (!shareRecords) return [];
    return shareRecords.filter((share) => share.isActive);
  }, [shareRecords]);

  // Quick lookups for labeling share links with human-friendly names
  const videosById = useMemo(() => {
    const map = new Map<string, Video>();
    for (const v of videos) map.set(v.id, v);
    return map;
  }, [videos]);
  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const getVideoShares = (videoId: string) =>
    activeShares.filter((share) => share.videoId === videoId);

  const getGroupById = (groupId: string) =>
    shareGroups?.find((group) => group.id === groupId) ?? null;

  const openRenameModal = (video: Video) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can rename this review.');
      return;
    }
    setVideoToRename(video);
  };

  const openMoveModal = (video: Video) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can move this review.');
      return;
    }
    setVideoToMove(video);
  };

  const openDeleteModal = (video: Video) => {
    if (video.isOwnedByCurrentUser === false) {
      pushToast('info', 'Only the owner can delete this review.');
      return;
    }
    setVideoToDelete(video);
  };

  const openShareModal = (video: Video) => {
    setVideoToShare(video);
  };

  const openProjectWorkspace = (projectId: string) => {
    if (onOpenProject) {
      onOpenProject(projectId);
      return;
    }
    const projectVideos = videos.filter((v) => v.projectId === projectId);
    const primary = projectVideos[0];
    if (primary) {
      void onStartReview(primary);
    } else {
      pushToast('info', 'Upload a review to this project to open the reviewer.');
    }
  };

  return (
    <div className="space-y-10 library-skin">
      <section className="library-panel p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Workspaces</p>
              <h1 className="text-3xl font-semibold text-gray-900">Projects</h1>
              <p className="text-sm text-gray-600">
                Projects contain boards and review sessions. Manage everything from here.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search projects"
                  className="w-full rounded-full border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 sm:w-72"
                />
              </div>
              <button
                onClick={() => {
                  setProjectToEdit(null);
                  setProjectModalOpen(true);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90 sm:w-auto"
              >
                <Plus size={16} /> New project
              </button>
              <button
                onClick={() => setSharingModalOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 sm:w-auto"
              >
                Sharing options
              </button>
            </div>
          </div>
        <div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-full px-3 py-1.5 text-xs ${viewMode === 'list' ? 'bg-gray-900 text-slate-50' : 'text-gray-500 hover:text-gray-900'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-full px-3 py-1.5 text-xs ${viewMode === 'grid' ? 'bg-gray-900 text-slate-50' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Grid
            </button>
          </div>

          {viewMode === 'list' ? (
            <div className="mt-4">
              {/* Mobile-first list (cards). The table layout is too wide for small screens. */}
              <div className="space-y-3 sm:hidden">
                {filteredProjects.map((project) => {
                  const isOwned = ownedProjectIds?.includes(project.id) ?? true;
                  const projectVideos = videos.filter((video) => video.projectId === project.id);
                  const recent = projectVideos[0];
                  return (
                    <div
                      key={project.id}
                      onClick={() => openProjectWorkspace(project.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openProjectWorkspace(project.id);
                        }
                      }}
                      className="w-full cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{project.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                            <span className="inline-flex items-center gap-1">
                              <span className="font-semibold text-gray-900">{projectVideos.length}</span>
                              <span>review{projectVideos.length === 1 ? '' : 's'}</span>
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="truncate">
                              {recent ? formatDate(recent.lastReviewedAt ?? recent.uploadedAt) : 'Not started'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToEdit(project);
                              setProjectModalOpen(true);
                            }}
                            disabled={!isOwned}
                            className={`rounded-full p-2 ${!isOwned ? 'cursor-not-allowed bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}
                            aria-label="Edit project"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToShare(project);
                            }}
                            className="rounded-full bg-gray-100 p-2 text-gray-600 hover:text-gray-900"
                            aria-label="Share project"
                          >
                            <Share2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectDeleteTarget(project);
                            }}
                            disabled={!isOwned}
                            className={`rounded-full p-2 ${!isOwned ? 'cursor-not-allowed bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}
                            aria-label="Delete project"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop/tablet table */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white sm:block">
                <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Reviews</th>
                    <th className="px-4 py-3">Last activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => {
                const isOwned = ownedProjectIds?.includes(project.id) ?? true;
                const projectVideos = videos.filter((video) => video.projectId === project.id);
                const recent = projectVideos[0];
                return (
                  <tr
                    key={project.id}
                    className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                    onClick={() => openProjectWorkspace(project.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProjectWorkspace(project.id);
                      }
                    }}
                  >
                    <td className="px-4 py-3 text-gray-900">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900" title="Open workspace">
                          {project.name}
                        </span>
                        {(() => {
                          // Only consider project-level shares (exclude per-video propagated entries)
                          const shares = activeShares.filter(s => s.projectId === project.id && s.groupId && !s.videoId);
                          if (shares.length === 0) return null;
                          const names = Array.from(new Set(
                            shares.map(s => getGroupById(s.groupId as any)?.name).filter(Boolean) as string[]
                          ));
                          const shown = names.slice(0,3);
                          const more = Math.max(0, names.length - shown.length);
                          return (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {shown.map((n, i) => (
                                <span key={i} className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">{n}</span>
                              ))}
                              {more > 0 && (
                                <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">+{more} more</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{projectVideos.length}</td>
                    <td className="px-4 py-3 text-gray-500">{recent ? formatDate(recent.lastReviewedAt ?? recent.uploadedAt) : 'Not started'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToEdit(project);
                              setProjectModalOpen(true);
                            }}
                            disabled={!isOwned}
                            className={`rounded-full p-1 ${!isOwned ? 'cursor-not-allowed bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToShare(project);
                            }}
                            className="rounded-full bg-gray-100 p-1 text-gray-600 hover:text-gray-900"
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectDeleteTarget(project);
                            }}
                            disabled={!isOwned}
                            className={`rounded-full p-1 ${!isOwned ? 'cursor-not-allowed bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}
                          >
                            <Trash2 size={14} />
                          </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
                </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => {
          const isOwned = ownedProjectIds?.includes(project.id) ?? true;
          const projectVideos = videos.filter((video) => video.projectId === project.id);
          const recentReview = projectVideos[0];
          return (
            <div key={project.id} className="library-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                    <Folder size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{project.name}</h3>
                    <p className="text-xs text-gray-500">Created {formatDate(project.createdAt)}</p>
                    {(() => {
                      // Only consider project-level shares (exclude per-video propagated entries)
                      const shares = activeShares.filter(s => s.projectId === project.id && s.groupId && !s.videoId);
                      if (shares.length === 0) return null;
                      const names = Array.from(new Set(
                        shares.map(s => getGroupById(s.groupId as any)?.name).filter(Boolean) as string[]
                      ));
                      const shown = names.slice(0,3);
                      const more = Math.max(0, names.length - shown.length);
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {shown.map((n, i) => (
                            <span key={i} className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">{n}</span>
                          ))}
                          {more > 0 && (
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">+{more} more</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <VideoActionsMenu
                  onRename={() => {
                    if (!isOwned) { pushToast('info', 'Only the owner can rename this project.'); return; }
                    setProjectToEdit(project);
                    setProjectModalOpen(true);
                  }}
                  onMove={() => {
                    const firstVideo = projectVideos[0];
                    if (firstVideo) {
                      openMoveModal(firstVideo);
                    }
                  }}
                  onShare={() => setProjectToShare(project)}
                  onDelete={() => { if (!isOwned) { pushToast('info', 'Only the owner can delete this project.'); return; } setProjectDeleteTarget(project); }}
                  isDark={isDark}
                />
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Reviews</span>
                  <span className="text-gray-900">{projectVideos.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last activity</span>
                  <span>
                    {projectVideos.length
                      ? formatDate(
                          projectVideos[0].lastReviewedAt ?? projectVideos[0].uploadedAt,
                        )
                      : 'Not started'}
                  </span>
                </div>
              </div>
              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90"
                onClick={() => openProjectWorkspace(project.id)}
              >
                Open workspace
              </button>
            </div>
          );
        })}
        {filteredProjects.length === 0 && (
          <div className="library-card-muted p-6 text-center text-sm text-gray-500">
            No projects match your search.
          </div>
        )}
          </div>
          )}
        </div>
        </div>
      </section>

      {sharingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center dashboard-overlay p-4 backdrop-blur">
          <div className="library-panel w-full max-w-5xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sharing workspace</h2>
                <p className="text-sm text-gray-600">
                  Create groups, invite collaborators, and share reviews or entire projects.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      await createShareGroup({ name: `Team ${shareGroups?.length ? shareGroups.length + 1 : 1}` });
                      pushToast('success', 'Collaboration group created.');
                    } catch (error) {
                      console.error(error);
                      pushToast('error', 'Unable to create group.');
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90"
                >
                  <Users size={16} /> New group
                </button>
                <button
                  onClick={() => setSharingModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {(shareGroups ?? []).map((group) => (
                <div key={group.id} className="library-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{group.name}</h3>
                      <p className="text-xs text-gray-500">
                        {group.members.length} member{group.members.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenameTarget(group)}
                        className="rounded-full bg-gray-100 p-1 text-gray-600 hover:text-gray-900"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          await archiveShareGroup({ groupId: group.id as any });
                          pushToast('success', 'Group archived.');
                        }}
                        className="rounded-full bg-gray-100 p-1 text-gray-600 hover:text-gray-900"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2 text-xs text-gray-600">
                    {group.members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <div>
                          <p className="font-semibold text-gray-900">{member.email}</p>
                          <p className="text-gray-500">{member.role} • {member.status}</p>
                        </div>
                        <button
                          onClick={async () => {
                            await removeMemberMutation({ memberId: member.id as any });
                            pushToast('success', 'Member removed.');
                          }}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setInviteTarget(group)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-black/90"
                  >
                    Invite collaborator
                  </button>
                </div>
              ))}
              {(shareGroups?.length ?? 0) === 0 && (
                <div className="library-card-muted p-6 text-center text-sm text-gray-500">
                  Create your first sharing group to collaborate with teammates.
                </div>
              )}
            </div>

            <div className="mt-8 library-card p-5">
              <h3 className="text-base font-semibold text-gray-900">Active share links</h3>
              <div className="mt-4 space-y-3 text-xs text-gray-600">
                {activeShares.filter((share) => share.linkToken).length === 0 ? (
                  <p className="text-gray-500">Generate a link from a review to see it here.</p>
                ) : (
                  activeShares
                    .filter((share) => share.linkToken)
                    .map((share) => (
                      <div
                        key={share.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                      >
                        <div>
                          {(() => {
                            const v = share.videoId ? videosById.get(share.videoId) : undefined;
                            const p = share.projectId ? projectsById.get(share.projectId) : (v?.projectId ? projectsById.get(v.projectId) : undefined);
                            if (v) {
                              return (
                                <>
                                  <p className="font-semibold text-gray-900">Link for review “{v.title}” {p ? <span className="text-gray-500">• Project “{p.name}”</span> : null}</p>
                                  <p className="text-gray-500">Token: {share.linkToken?.slice(0, 12)}… • {share.allowComments ? 'Comments allowed' : 'View only'}</p>
                                </>
                              );
                            }
                            if (p) {
                              return (
                                <>
                                  <p className="font-semibold text-gray-900">Link for project “{p.name}”</p>
                                  <p className="text-gray-500">Token: {share.linkToken?.slice(0, 12)}… • {share.allowComments ? 'Comments allowed' : 'View only'}</p>
                                </>
                              );
                            }
                            return (
                              <>
                                <p className="font-semibold text-gray-900">Link</p>
                                <p className="text-gray-500">Token: {share.linkToken?.slice(0, 12)}… • {share.allowComments ? 'Comments allowed' : 'View only'}</p>
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              const url = `${publicBaseUrl()}/share/${share.linkToken}`;
                              if (navigator.clipboard && 'writeText' in navigator.clipboard) {
                                void navigator.clipboard.writeText(url);
                              } else {
                                window.prompt('Copy this link', url);
                              }
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900"
                          >
                            <LinkIcon size={14} /> Copy link
                          </button>
                          <button
                            onClick={() => revokeShare({ shareId: share.id as any })}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                          >
                            Disable
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 left-4 md:left-auto md:bottom-6 md:right-6 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-xl"
          >
            {toast.tone === 'success' ? (
              <lottie-player
                src={lottieSaved}
                autoplay
                style={{ width: '36px', height: '36px' }}
                ref={(el: any) => {
                  if (el) {
                    el.loop = false;
                    const handler = () => dismissToast(toast.id);
                    el.addEventListener('complete', handler, { once: true });
                  }
                }}
              ></lottie-player>
            ) : toast.tone === 'error' ? (
              <AlertTriangle size={18} />
            ) : (
              <Info size={18} />
            )}
            <span>{toast.message}</span>
            <button onClick={() => dismissToast(toast.id)} className="text-gray-500 hover:text-gray-900">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {showUploadModal && pendingUpload && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
          <div className={`w-full max-w-lg rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Prepare upload</h3>
                <p className="text-sm text-white/60">Review the details before processing your video.</p>
              </div>
              <button onClick={resetUploadState} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="font-semibold text-white">File</h4>
                <p>{pendingUpload.file.name}</p>
                <p>
                  {pendingUpload.metadata.width}×{pendingUpload.metadata.height} • {Math.round(pendingUpload.metadata.duration)}s
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 font-semibold text-white">Assign to project</h4>
                <div className="flex flex-wrap gap-2">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        selectedProjectId === project.id
                          ? 'border-white/60 bg-white/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                      }`}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
                <InlineCreateProject
                  onCreate={async (name) => {
                    const id = await onCreateProject(name);
                    if (typeof id === 'string') setSelectedProjectId(id);
                  }}
                />
              </div>
              {uploadLogs.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h4 className="font-semibold text-white">Upload logs</h4>
                  <ul className="mt-2 space-y-1 text-xs text-white/60">
                    {uploadLogs.map((log, index) => (
                      <li key={index}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}
              {isUploading && (
                <div className="rounded-full bg-white/10 p-1">
                  <div className="h-2 w-full rounded-full bg-white/20">
                    <div
                      className="h-2 rounded-full bg-white transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-white/60">{uploadProgress}%</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={resetUploadState}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={proceedUpload}
                disabled={!selectedProjectId || isUploading}
                className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 transition enabled:hover:bg-black/90 disabled:opacity-40"
              >
                {isUploading ? 'Uploading…' : 'Upload' }
              </button>
            </div>
          </div>
        </div>
      )}

      {videoToRename && (
        <RenameVideoModal
          video={videoToRename}
          onClose={() => setVideoToRename(null)}
          onSubmit={(title) => handleRename(videoToRename, title)}
          isDark={isDark}
        />
      )}

      {videoToMove && (
        <MoveVideoModal
          video={videoToMove}
          projects={projects}
          onClose={() => setVideoToMove(null)}
          onSubmit={(projectId) => handleMove(videoToMove, projectId)}
          isDark={isDark}
        />
      )}

      {videoToDelete && (
        <ConfirmDeleteModal
          video={videoToDelete}
          onClose={() => setVideoToDelete(null)}
          onConfirm={() => handleDelete(videoToDelete)}
          isDark={isDark}
        />
      )}

      {videoToShare && shareGroups && (
        <ShareModal
          video={videoToShare}
          projectName={videoToShare.projectId ? (projects.find(p => p.id === videoToShare.projectId)?.name) : undefined}
          groups={shareGroups}
          existingShares={getVideoShares(videoToShare.id)}
          isDark={isDark}
          onGenerateLink={(options) =>
            generateVideoLink(
              videoToShare,
              options.allowDownload,
              options.allowComments,
              options.expiresAt,
            )
          }
          onShareToGroup={(args) =>
            shareVideoToGroup(
              videoToShare,
              args.groupId,
              args.allowDownload,
              args.allowComments,
            )
          }
          onUnshare={async (shareId) => {
            await revokeShare({ shareId: shareId as any });
            pushToast('success', 'Sharing removed.');
          }}
          onClose={() => setVideoToShare(null)}
        />
      )}

      {inviteTarget && (
        <div className={`fixed inset-0 z-50 grid place-items-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
          <div className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Invite collaborator</h3>
              <button onClick={() => setInviteTarget(null)} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <InviteForm
              onSubmit={async (email, role) => {
                await addMemberMutation({ groupId: inviteTarget.id as any, email, role });
                setInviteTarget(null);
                pushToast('success', 'Invitation sent.');
              }}
              onCancel={() => setInviteTarget(null)}
            />
          </div>
        </div>
      )}

      {renameTarget && (
        <div className={`fixed inset-0 z-50 grid place-items-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
          <div className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Rename team</h3>
              <button onClick={() => setRenameTarget(null)} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <RenameTeamForm
              defaultValue={renameTarget.name}
              onSubmit={async (name) => {
                await updateShareGroup({ groupId: renameTarget.id as any, name });
                setRenameTarget(null);
                pushToast('success', 'Team renamed.');
              }}
              onCancel={() => setRenameTarget(null)}
            />
          </div>
        </div>
      )}

  {projectToShare && shareGroups && (
        <ShareModal
          project={projectToShare}
          projectName={projectToShare.name}
          groups={shareGroups}
          // Show only project-level shares; ignore per‑video propagated entries
          existingShares={activeShares.filter((share) => share.projectId === projectToShare.id && !share.videoId)}
          isDark={isDark}
          onGenerateLink={(options) =>
            generateProjectLink(
              projectToShare,
              options.allowDownload,
              options.allowComments,
              options.expiresAt,
            )
          }
          onShareToGroup={(args) =>
            shareProjectToGroup(
              projectToShare,
              args.groupId,
              args.allowDownload,
              args.allowComments,
            )
          }
          onUnshare={async (shareId) => {
            await revokeShare({ shareId: shareId as any });
            pushToast('success', 'Sharing removed.');
          }}
          onClose={() => setProjectToShare(null)}
        />
      )}

      {projectDeleteTarget && (
        <div className={`fixed inset-0 z-50 grid place-items-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
          <div className={`w-full max-w-md space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Delete project</h3>
              <button onClick={() => setProjectDeleteTarget(null)} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-sm text-white/70">
              <p>
                “{projectDeleteTarget.name}” and all its reviews will be permanently deleted, including video files, thumbnails, comments, annotations, and any sharing links or team permissions. This action cannot be undone.
              </p>
              <p className="text-white/50">Make sure you exported any important content before continuing.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setProjectDeleteTarget(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!projectDeleteTarget) return;
                  setIsDeletingProject(true);
                  await onDeleteProject(projectDeleteTarget.id);
                  setIsDeletingProject(false);
                  setProjectDeleteTarget(null);
                  pushToast('success', 'Project deleted.');
                }}
                disabled={isDeletingProject}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-rose-500 disabled:opacity-40"
              >
                {isDeletingProject ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {projectModalOpen && (
        <ProjectModal
          initialName={projectToEdit?.name ?? ''}
          onCancel={() => {
            setProjectModalOpen(false);
            setProjectToEdit(null);
          }}
          onSubmit={async (name) => {
            if (projectToEdit) {
              await onUpdateProject({ id: projectToEdit.id, name });
              pushToast('success', 'Project name updated.');
            } else {
              const id = (await onCreateProject(name)) as string | void;
              pushToast('success', 'Project created.');
              if (typeof id === 'string') {
                setSelectedProjectId(id);
              }
            }
            setProjectModalOpen(false);
            setProjectToEdit(null);
          }}
          isDark={isDark}
        />
      )}
    </div>
  );
};

interface RenameVideoModalProps {
  video: Video;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void> | void;
  isDark: boolean;
}

export const RenameVideoModal: React.FC<RenameVideoModalProps> = ({ video, onClose, onSubmit, isDark }) => {
  const [title, setTitle] = useState(video.title);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSubmit(title.trim());
    setSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <form onSubmit={handleSubmit} className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Rename review</h3>
          <button onClick={onClose} type="button" className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
          placeholder="Review title"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 transition enabled:hover:bg-black/90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface MoveVideoModalProps {
  video: Video;
  projects: Project[];
  onClose: () => void;
  onSubmit: (projectId: string) => Promise<void> | void;
  isDark: boolean;
}

export const MoveVideoModal: React.FC<MoveVideoModalProps> = ({ video, projects, onClose, onSubmit, isDark }) => {
  const [target, setTarget] = useState<string>(video.projectId ?? projects[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;
    setSaving(true);
    await onSubmit(target);
    setSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <form onSubmit={handleSubmit} className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Move review</h3>
          <button onClick={onClose} type="button" className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`w-full justify-between inline-flex items-center rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-white/10 bg-white/5 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
          >
            <span>{projects.find((p) => p.id === target)?.name ?? 'Select project'}</span>
            <ChevronDown size={16} className={isDark ? 'text-white/60' : 'text-gray-500'} />
          </button>
          {open && (
            <div className={`absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl border ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setTarget(project.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left ${
                    target === project.id
                      ? isDark
                        ? 'bg-white/10'
                        : 'bg-black/5'
                      : isDark
                        ? 'hover:bg-white/10'
                        : 'hover:bg-black/5'
                  }`}
                >
                  <span>{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
          className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!target || saving}
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 transition enabled:hover:bg-black/90 disabled:opacity-40"
          >
            {saving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface ConfirmDeleteModalProps {
  video: Video;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDark: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ video, onClose, onConfirm, isDark }) => {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <div className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Delete review</h3>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-white/60">
          “{video.title}” will be permanently removed. Comments, annotations, and any sharing links or team permissions will also be deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-rose-500 disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ShareModalProps {
  video?: Video;
  project?: Project;
  groups: ShareGroup[];
  existingShares: ContentShare[];
  projectName?: string;
  isDark: boolean;
  onShareToGroup: (args: {
    groupId: string;
    allowDownload: boolean;
    allowComments: boolean;
    videoId?: string;
    projectId?: string;
  }) => Promise<void> | void;
  onGenerateLink: (args: {
    allowDownload: boolean;
    allowComments: boolean;
    expiresAt?: number;
    videoId?: string;
    projectId?: string;
  }) => Promise<string>;
  onUnshare: (shareId: string) => Promise<void> | void;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  video,
  project,
  groups,
  existingShares,
  projectName,
  isDark,
  onShareToGroup,
  onGenerateLink,
  onUnshare,
  onClose,
}) => {
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(() => existingShares.find((share) => share.linkToken)?.linkToken ?? null);
  const [generating, setGenerating] = useState(false);
  const assetKind = video ? 'review' : 'project';
  const assetTitle = video ? video.title : project?.name ?? '';
  const shareArgs = {
    videoId: video?.id,
    projectId: project?.id,
  };

  // Deduplicate visible shares: one row per group or link
  const visibleShares = React.useMemo(() => {
    const seen = new Set<string>();
    const out: typeof existingShares = [];
    for (const s of existingShares) {
      const key = s.groupId ? `g:${s.groupId}` : s.linkToken ? `l:${s.linkToken}` : `id:${s.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }, [existingShares]);

  const handleGenerateLink = async () => {
    setGenerating(true);
    const token = await onGenerateLink({
      allowDownload,
      allowComments,
      videoId: shareArgs.videoId,
      projectId: shareArgs.projectId,
    });
    setLinkToken(token);
    setGenerating(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <div className={`w-full max-w-2xl space-y-6 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Share “{assetTitle}” {assetKind}</h3>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-6">
          {visibleShares.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-sm font-semibold text-white">Currently shared with</h4>
              <div className="mt-3 space-y-2 text-xs text-white/70">
                {visibleShares.map(share => {
                  const group = share.groupId ? groups.find(g => g.id === (share.groupId as any)) : null;
                  return (
                    <div key={share.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
                      <div>
                        {group ? (
                          <>
                            <p className="font-semibold text-white">{group.name}</p>
                            <p className="text-white/50">{group.members.length} member{group.members.length === 1 ? '' : 's'}</p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-white">Public link</p>
                            <p className="text-white/50">Token: {(share.linkToken ?? '').slice(0,12)}…</p>
                            <p className="text-white/50">
                              {video
                                ? (<>
                                    Review “{video.title}”{projectName ? <> • Project “{projectName}”</> : null}
                                  </>)
                                : project
                                  ? (<>Project “{project.name}”</>)
                                  : null}
                            </p>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => onUnshare(share.id)}
                        className="rounded-full bg-white/10 px-3 py-1 text-white/70 hover:text-white"
                      >
                        Unshare
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-semibold text-white">Share with a team group</h4>
            <p className="mt-1 text-xs text-white/60">Add this {assetKind} to an existing collaboration group.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() =>
                    onShareToGroup({
                      groupId: group.id,
                      allowDownload,
                      allowComments,
                      videoId: shareArgs.videoId,
                      projectId: shareArgs.projectId,
                    })
                  }
                  className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-white/70 hover:border-white/30 hover:text-white"
                >
                  <div>
                    <p className="font-semibold text-white">{group.name}</p>
                    <p className="text-xs text-white/50">
                      {group.members.length} member{group.members.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Users size={18} className="text-white/40" />
                </button>
              ))}
              {groups.length === 0 && (
                <p className="text-xs text-white/50">
                  Create a sharing group first from the collaboration workspace.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-semibold text-white">Shareable link</h4>
            <p className="mt-1 text-xs text-white/60">
              Generate a link that grants access to this {assetKind} without inviting collaborators one by one.
            </p>
            <div className="mt-4 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <input
                  type="radio"
                  name="access-level"
                  checked={!allowComments}
                  onChange={() => setAllowComments(false)}
                />
                <div>
                  <p className="font-semibold text-white">Viewer</p>
                  <p className="text-white/50">Can view only</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <input
                  type="radio"
                  name="access-level"
                  checked={allowComments}
                  onChange={() => setAllowComments(true)}
                />
                <div>
                  <p className="font-semibold text-white">Editor</p>
                  <p className="text-white/50">Can add comments</p>
                </div>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={handleGenerateLink}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                disabled={generating}
              >
                {generating ? <Loader2 className="animate-spin" size={16} /> : <LinkIcon size={16} />}
                {linkToken ? 'Refresh link' : 'Generate link'}
              </button>
              {linkToken && (
                <button
                  onClick={() => {
                    const url = `${publicBaseUrl()}/share/${linkToken}`;
                    if (navigator.clipboard && 'writeText' in navigator.clipboard) {
                      void navigator.clipboard.writeText(url);
                    } else {
                      window.prompt('Copy this link', url);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
                >
                  Copy link
                </button>
              )}
            </div>
            {linkToken && (
              <div className="mt-2 text-xs text-white/50 space-y-0.5">
                <p>Token: {linkToken}</p>
                <p>
                  {video
                    ? (<>
                        Review “{video.title}”{projectName ? <> • Project “{projectName}”</> : null}
                      </>)
                    : project
                      ? (<>Project “{project.name}”</>)
                      : null}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

interface ProjectModalProps {
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void> | void;
  isDark: boolean;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ initialName, onCancel, onSubmit, isDark }) => {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSubmit(name.trim());
    setSaving(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center dashboard-overlay ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <form onSubmit={handleSubmit} className={`w-full max-w-sm space-y-4 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{initialName ? 'Rename project' : 'New project'}</h3>
          <button onClick={onCancel} type="button" className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 transition enabled:hover:bg-black/90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Dashboard;

const InviteForm: React.FC<{
  onSubmit: (email: string, role: 'owner' | 'admin' | 'editor' | 'viewer') => void | Promise<void>;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'editor' | 'viewer'>('editor');
  const [saving, setSaving] = useState(false);
  const friends = useQuery(api.friends.list, {});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [query, setQuery] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => {
    const list = (friends ?? []).map((f) => ({ id: f.id, label: (f as any).contactName ?? (f as any).contactEmail, email: (f as any).contactEmail }));
    if (!query) return list.slice(0, 5);
    const q = query.toLowerCase();
    return list.filter((s) => s.label.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, 5);
  }, [friends, query]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setSaving(true);
        await onSubmit(email.trim(), role);
        setSaving(false);
      }}
      className="space-y-4"
    >
      <div>
        <label className="text-xs font-semibold uppercase text-white/40">Email</label>
        <div className="relative">
          <input
            ref={emailRef}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setQuery(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
            placeholder="name@studio.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute z-10 mt-2 w-full rounded-xl border border-white/10 bg-black/80 text-sm text-white shadow-2xl">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setEmail(s.email); setQuery(s.email); setSuggestOpen(false); emailRef.current?.blur(); }}
                >
                  <span>{s.label}</span>
                  <span className="text-white/40">{s.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase text-white/40">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">
          Cancel
        </button>
        <button type="submit" disabled={saving || !email.trim()} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 enabled:hover:bg-black/90 disabled:opacity-40">
          {saving ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </form>
  );
};

const RenameTeamForm: React.FC<{
  defaultValue: string;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}> = ({ defaultValue, onSubmit, onCancel }) => {
  const [name, setName] = useState(defaultValue);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        await onSubmit(name.trim());
        setSaving(false);
      }}
      className="space-y-4"
    >
      <div>
        <label className="text-xs font-semibold uppercase text-white/40">Team name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-slate-50 enabled:hover:bg-black/90 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
};

const InlineCreateProject: React.FC<{
  onCreate: (name: string) => void | Promise<void>;
}> = ({ onCreate }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        await onCreate(name.trim());
        setSaving(false);
        setName('');
      }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
      />
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-xs font-semibold text-slate-50 enabled:hover:bg-black/90 disabled:opacity-40"
      >
        <Plus size={14} /> Create
      </button>
    </form>
  );
};
