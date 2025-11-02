import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  UploadCloud,
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
import lottieSaved from '../assets/animations/saved.json?url';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Project, Video, ShareGroup, ContentShare } from '../types';
import { useThemePreference } from '../useTheme';

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
}

interface DashboardProps {
  user: {
    name?: string | null;
    email: string;
    avatar?: string | null;
  };
  videos: Video[];
  projects: Project[];
  onStartReview: (video: Video) => void | Promise<void>;
  onCreateProject: (name: string) => Promise<string | void>;
  onUpdateProject: (project: { id: string; name: string }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSetVideoProject: (videoId: string, projectId: string) => Promise<void>;
  onRenameVideo: (videoId: string, title: string) => Promise<void>;
  onCompleteUpload: (payload: UploadMetadata) => Promise<Video>;
  onRemoveVideo: (videoId: string) => Promise<void>;
  onGenerateUploadUrl: (args: { contentType: string; fileName?: string }) => Promise<{
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

const VideoActionsMenu: React.FC<{
  onRename: () => void;
  onMove: () => void;
  onShare: () => void;
  onDelete: () => void;
  isDark?: boolean;
}> = ({ onRename, onMove, onShare, onDelete, isDark }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className={`absolute right-0 mt-2 w-48 rounded-xl border shadow-2xl backdrop-blur ${isDark ? 'border-white/10 bg-black/90' : 'border-gray-200 bg-white'}`}>
          <button
            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
            onClick={() => {
              onRename();
              setOpen(false);
            }}
          >
            <Pencil size={14} /> Rename
          </button>
          <button
            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
            onClick={() => {
              onMove();
              setOpen(false);
            }}
          >
            <Folder size={14} /> Move to project
          </button>
          <button
            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}
            onClick={() => {
              onShare();
              setOpen(false);
            }}
          >
            <Share2 size={14} /> Share
          </button>
          <div className={`my-1 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
          <button
            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${isDark ? 'text-red-300 hover:bg-white/10' : 'text-red-600 hover:bg-black/5'}`}
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
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

const Dashboard: React.FC<DashboardProps> = ({
  user,
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
  const [isDragActive, setIsDragActive] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
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

  const recentVideos = useMemo(() => {
    const sorted = [...videos]
      .sort((a, b) => {
        const aTime = a.lastReviewedAt ? Date.parse(a.lastReviewedAt) : Date.parse(a.uploadedAt);
        const bTime = b.lastReviewedAt ? Date.parse(b.lastReviewedAt) : Date.parse(b.uploadedAt);
        return bTime - aTime;
      })
      .slice(0, 6);
    return sorted;
  }, [videos]);

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

    setPendingUpload({ file, objectUrl, metadata, thumbnailBlob });
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

  const persistThumbnail = async (blob: Blob | null, fileName: string) => {
    if (!blob) return undefined;
    try {
      const thumbMeta = await onGenerateUploadUrl({
        contentType: 'image/jpeg',
        fileName: `${fileName.replace(/\.[^.]+$/, '')}-thumbnail.jpg`,
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
              reject(new Error(`Thumbnail upload failed with status ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error while uploading thumbnail.'));
        xhr.send(blob);
      });
      return thumbMeta.publicUrl;
    } catch (error) {
      console.warn('Thumbnail upload failed', error);
      pushToast('error', 'Thumbnail upload failed. The review will use a live preview instead.');
      return undefined;
    }
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
      const { storageKey, uploadUrl, publicUrl } = await onGenerateUploadUrl({
        contentType: pendingUpload.file.type || 'application/octet-stream',
        fileName: pendingUpload.file.name,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', pendingUpload.file.type || 'application/octet-stream');
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error during video upload.'));
        xhr.send(pendingUpload.file);
      });

      setUploadLogs((current) => [...current, 'Upload completed, saving review…']);

      const thumbnailUrl = await persistThumbnail(pendingUpload.thumbnailBlob ?? null, pendingUpload.file.name);

      const created = await onCompleteUpload({
        storageKey,
        publicUrl,
        title: pendingUpload.file.name,
        width: pendingUpload.metadata.width,
        height: pendingUpload.metadata.height,
        fps: pendingUpload.metadata.fps,
        duration: pendingUpload.metadata.duration,
        projectId: selectedProjectId,
        thumbnailUrl,
      });

      setUploadLogs((current) => [...current, 'Review created successfully.']);
      const projectShares = activeShares.filter(
        (share) => share.projectId === selectedProjectId && !share.videoId,
      );
      if (projectShares.length) {
        await autoShareVideo({
          videoId: created.id as any,
          projectId: selectedProjectId as any,
        });
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
    if (!title.trim()) return;
    await onRenameVideo(video.id, title.trim());
    setVideoToRename(null);
    pushToast('success', 'Review title updated.');
  };

  const handleMove = async (video: Video, projectId: string) => {
    await onSetVideoProject(video.id, projectId);
    setVideoToMove(null);
    pushToast('success', 'Review moved to project.');
  };

  const handleDelete = async (video: Video) => {
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

  const getVideoShares = (videoId: string) =>
    activeShares.filter((share) => share.videoId === videoId);

  const getGroupById = (groupId: string) =>
    shareGroups?.find((group) => group.id === groupId) ?? null;

  const openRenameModal = (video: Video) => {
    setVideoToRename(video);
  };

  const openMoveModal = (video: Video) => {
    setVideoToMove(video);
  };

  const openDeleteModal = (video: Video) => {
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
    <div className="space-y-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Recently reviewed</h2>
              <p className="text-sm text-white/60">Your last six sessions at a glance.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-black/20 p-4 text-center text-xs text-white/50">
                No reviews yet. Upload a video to start collaborating.
              </div>
            ) : (
              recentVideos.map((video) => (
                <div
                  key={video.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 cursor-pointer"
                  onClick={() => onStartReview(video)}
                >
                  <div className="relative aspect-video">
                    <ThumbnailPreview video={video} />
                    <button
                      onClick={() => onStartReview(video)}
                      className="absolute bottom-2 right-2 rounded-full bg-white/10 p-2 text-white opacity-90 hover:bg-white/20"
                      title="Open"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClickCapture={(e) => { e.stopPropagation(); onStartReview(video); }}
                    >
                      <PlayCircle size={20} />
                    </button>
                    <div className="absolute right-3 top-3">
                      <VideoActionsMenu
                        onRename={() => openRenameModal(video)}
                        onMove={() => openMoveModal(video)}
                        onShare={() => openShareModal(video)}
                        onDelete={() => openDeleteModal(video)}
                        isDark={isDark}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-2 pt-2">
                    <h3 className="truncate text-sm font-semibold text-white" title={video.title}>{video.title}</h3>
                    <span className="text-[11px] text-white/50">{formatDuration(video.duration)}</span>
                  </div>
                  <div className="px-2 pb-2 text-[11px] text-white/50">
                    <span>Uploaded {formatDate(video.uploadedAt)}</span>
                    <span className="mx-1">•</span>
                    <span>
                      {video.width}×{video.height}
                    </span>
                    <span className="mx-1">•</span>
                    <span>{video.fps} fps</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className={`rounded-3xl border border-white/10 bg-white/5 p-6 transition ${
            isDragActive ? 'ring-2 ring-white/40' : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Upload review</h2>
              <p className="text-sm text-white/60">
                Drag and drop a video here or use the button below. Each review needs a project.
              </p>
            </div>
            <UploadCloud className="text-white" size={28} />
          </div>
          <div className="mt-6 space-y-4">
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 font-semibold text-white hover:bg-white/20"
            >
              <UploadCloud size={18} /> Select video
            </button>
            <input
              type="file"
              ref={uploadInputRef}
              className="hidden"
              accept="video/*"
              onChange={handleFileInput}
            />
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">Upload checklist</h3>
              <ul className="mt-3 space-y-2 text-xs text-white/60">
                <li>• Accepted formats: MP4, MOV, WebM.</li>
                <li>• Maximum size depends on your plan.</li>
                <li>• Assign the review to a project before starting.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">Quick stats</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/70">
                <div>
                  <p className="text-white/40">Reviews this week</p>
                  <p className="text-lg font-semibold text-white">{videos.length}</p>
                </div>
                <div>
                  <p className="text-white/40">Active projects</p>
                  <p className="text-lg font-semibold text-white">{projects.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Projects</h2>
            <p className="text-sm text-white/60">Organise reviews by client, campaign, or delivery.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search projects"
                className="rounded-full border border-white/10 bg-black/20 py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
              />
            </div>
            <button
              onClick={() => {
                setProjectToEdit(null);
                setProjectModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <Plus size={16} /> New project
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-full px-3 py-1.5 text-xs ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-full px-3 py-1.5 text-xs ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
          >
            Grid
          </button>
        </div>

        {viewMode === 'list' ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase text-white/40">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const projectVideos = videos.filter((video) => video.projectId === project.id);
                  const recent = projectVideos[0];
                  return (
                    <tr key={project.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3 text-white">
                        <div className="flex flex-col">
                          <button
                            onClick={() => openProjectWorkspace(project.id)}
                            className="text-left font-semibold hover:underline"
                            title="Open workspace"
                          >
                            {project.name}
                          </button>
                          {(() => {
                            const shares = activeShares.filter(s => s.projectId === project.id && s.groupId);
                            if (shares.length === 0) return null;
                            const names = shares.map(s => getGroupById(s.groupId as any)?.name).filter(Boolean) as string[];
                            const shown = names.slice(0,3);
                            const more = Math.max(0, names.length - shown.length);
                            return (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {shown.map((n, i) => (
                                  <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">{n}</span>
                                ))}
                                {more > 0 && (
                                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">+{more} more</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">{projectVideos.length}</td>
                      <td className="px-4 py-3 text-white/50">{recent ? formatDate(recent.lastReviewedAt ?? recent.uploadedAt) : 'Not started'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setProjectToEdit(project);
                              setProjectModalOpen(true);
                            }}
                            className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setProjectToShare(project)}
                            className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            onClick={() => setProjectDeleteTarget(project)}
                            className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
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
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const projectVideos = videos.filter((video) => video.projectId === project.id);
            const recentReview = projectVideos[0];
            return (
              <div key={project.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
                      <Folder size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{project.name}</h3>
                      <p className="text-xs text-white/50">Created {formatDate(project.createdAt)}</p>
                      {(() => {
                        const shares = activeShares.filter(s => s.projectId === project.id && s.groupId);
                        if (shares.length === 0) return null;
                        const names = shares.map(s => getGroupById(s.groupId as any)?.name).filter(Boolean) as string[];
                        const shown = names.slice(0,3);
                        const more = Math.max(0, names.length - shown.length);
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {shown.map((n, i) => (
                              <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">{n}</span>
                            ))}
                            {more > 0 && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">+{more} more</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <VideoActionsMenu
                    onRename={() => {
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
                    onDelete={() => setProjectDeleteTarget(project)}
                    isDark={isDark}
                  />
                </div>
                <div className="mt-4 space-y-3 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <span>Reviews</span>
                    <span className="text-white">{projectVideos.length}</span>
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
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                  onClick={() => openProjectWorkspace(project.id)}
                >
                  Open workspace
                </button>
              </div>
            );
          })}
          {filteredProjects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-6 text-center text-sm text-white/60">
              No projects match your search.
            </div>
          )}
        </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Sharing workspace</h2>
            <p className="text-sm text-white/60">
              Create groups, invite collaborators, and share reviews or entire projects.
            </p>
          </div>
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
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            <Users size={16} /> New group
          </button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {(shareGroups ?? []).map((group) => (
            <div key={group.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">{group.name}</h3>
                  <p className="text-xs text-white/50">
                    {group.members.length} member{group.members.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRenameTarget(group)}
                    className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      await archiveShareGroup({ groupId: group.id as any });
                      pushToast('success', 'Group archived.');
                    }}
                    className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-xs text-white/70">
                {group.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div>
                      <p className="font-semibold text-white">{member.email}</p>
                      <p className="text-white/40">{member.role} • {member.status}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await removeMemberMutation({ memberId: member.id as any });
                        pushToast('success', 'Member removed.');
                      }}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60 hover:text-white"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setInviteTarget(group)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
              >
                Invite collaborator
              </button>
            </div>
          ))}
          {(shareGroups?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-6 text-center text-sm text-white/60">
              Create your first sharing group to collaborate with teammates.
            </div>
          )}
        </div>
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
          <h3 className="text-base font-semibold text-white">Active share links</h3>
          <div className="mt-4 space-y-3 text-xs text-white/70">
            {activeShares.filter((share) => share.linkToken).length === 0 ? (
              <p className="text-white/50">Generate a link from a review to see it here.</p>
            ) : (
              activeShares
                .filter((share) => share.linkToken)
                .map((share) => (
                  <div
                    key={share.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-white">Link for {share.videoId ? 'review' : 'project'}</p>
                      <p className="text-white/40">
                        Token: {share.linkToken?.slice(0, 12)}… • {share.allowComments ? 'Comments allowed' : 'View only'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/share/${share.linkToken}`;
                          if (navigator.clipboard && 'writeText' in navigator.clipboard) {
                            void navigator.clipboard.writeText(url);
                          } else {
                            window.prompt('Copy this link', url);
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
                      >
                        <LinkIcon size={14} /> Copy link
                      </button>
                      <button
                        onClick={() => revokeShare({ shareId: share.id as any })}
                        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white"
                      >
                        Disable
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>

      <div className="fixed bottom-6 right-6 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-xl backdrop-blur"
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
            <button onClick={() => dismissToast(toast.id)} className="text-white/60 hover:text-white">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {showUploadModal && pendingUpload && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={proceedUpload}
                disabled={!selectedProjectId || isUploading}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-40"
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
        <div className={`fixed inset-0 z-50 grid place-items-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
        <div className={`fixed inset-0 z-50 grid place-items-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
          groups={shareGroups}
          existingShares={activeShares.filter((share) => share.projectId === projectToShare.id)}
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
        <div className={`fixed inset-0 z-50 grid place-items-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
              <button onClick={() => setProjectDeleteTarget(null)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">
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
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black enabled:hover:bg-white/90 disabled:opacity-40"
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

const RenameVideoModal: React.FC<RenameVideoModalProps> = ({ video, onClose, onSubmit, isDark }) => {
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-40"
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

const MoveVideoModal: React.FC<MoveVideoModalProps> = ({ video, projects, onClose, onSubmit, isDark }) => {
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-40"
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

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ video, onClose, onConfirm, isDark }) => {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
            className="rounded-full bg-red-400 px-4 py-2 text-sm font-semibold text-black transition enabled:hover:bg-red-300 disabled:opacity-40"
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
      <div className={`w-full max-w-2xl space-y-6 rounded-3xl border border-white/10 ${isDark ? 'bg-black/80' : 'bg-white'} p-6`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Share “{assetTitle}” {assetKind}</h3>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-6">
          {existingShares.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-sm font-semibold text-white">Currently shared with</h4>
              <div className="mt-3 space-y-2 text-xs text-white/70">
                {existingShares.map(share => {
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
                    const url = `${window.location.origin}/share/${linkToken}`;
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
              <p className="mt-2 text-xs text-white/50">Token: {linkToken}</p>
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/80' : 'bg-black/30'} p-4 backdrop-blur`}>
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
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-40"
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
        <button type="submit" disabled={saving || !email.trim()} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black enabled:hover:bg-white/90 disabled:opacity-40">
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
        <button type="submit" disabled={saving || !name.trim()} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black enabled:hover:bg-white/90 disabled:opacity-40">
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
        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-black enabled:hover:bg-white/90 disabled:opacity-40"
      >
        <Plus size={14} /> Create
      </button>
    </form>
  );
};
