import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { Film, PlayCircle, ArrowLeft, X, AlertTriangle, Info, LayoutGrid, Plus, MoreHorizontal, Pencil, Trash2, UploadCloud } from 'lucide-react';
import { Video, Project, ContentShare, Board } from '../types';
import { useThemePreference } from '../useTheme';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import lottieSavedRaw from '../assets/animations/saved.json?raw';
const lottieSaved = `data:application/json;charset=utf-8,${encodeURIComponent(lottieSavedRaw as unknown as string)}`;
import {
  VideoActionsMenu,
  RenameVideoModal,
  MoveVideoModal,
  ConfirmDeleteModal,
  ShareModal,
} from './Dashboard';
import { compressImage } from '../lib/image-compression';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const Thumbnail: React.FC<{ video: Video }> = ({ video }) => {
  const [failed, setFailed] = React.useState(false);
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

const fallbackBoardCovers = [
  new URL('../assets/boardcover/1.jpg', import.meta.url).href,
  new URL('../assets/boardcover/2.jpg', import.meta.url).href,
  new URL('../assets/boardcover/3.jpg', import.meta.url).href,
];

const BoardThumbnail: React.FC<{ board: Board; fallbackUrl: string }> = ({ board, fallbackUrl }) => {
  const [failed, setFailed] = React.useState(false);
  if (board.imageUrl && !failed) {
    return (
      <img
        src={board.imageUrl}
        alt={board.title}
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  if (fallbackUrl && !failed) {
    return (
      <img
        src={fallbackUrl}
        alt={board.title}
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
      <LayoutGrid size={36} className="text-gray-300" />
    </div>
  );
};

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const getViewModeStorageKey = (projectId: string) => `projectworkspace:view-mode:${projectId}`;

const loadStoredViewMode = (key: string): 'grid' | 'list' => {
  if (typeof window === 'undefined') return 'grid';
  try {
    const stored = window.localStorage.getItem(key);
    return stored === 'list' || stored === 'grid' ? (stored as 'grid' | 'list') : 'grid';
  } catch {
    return 'grid';
  }
};

const persistViewMode = (key: string, mode: 'grid' | 'list') => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // ignore storage errors
  }
};

type WorkspaceToast = {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
};

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

const ProjectWorkspace: React.FC<{
  project: Project;
  projects: Project[];
  videos: Video[];
  theme: 'light' | 'dark' | 'system';
  onBack: () => void;
  onStartReview: (video: Video) => void | Promise<void>;
  onRenameVideo: (videoId: string, title: string) => Promise<void>;
  onSetVideoProject: (videoId: string, projectId: string) => Promise<void>;
  onRemoveVideo: (videoId: string) => Promise<void>;
  onCompleteUpload: (payload: UploadMetadata) => Promise<Video>;
  onGenerateUploadUrl: (args: { contentType: string; fileName?: string; context?: "review" | "board" | "library"; contextId?: string }) => Promise<{
    storageKey: string;
    uploadUrl: string;
    publicUrl: string;
  }>;
  onOpenBoard?: (boardId: string) => void;
  highlightMessage?: string | null;
  onDismissHighlight?: () => void;
}> = ({
  project,
  projects,
  videos,
  theme,
  onBack,
  onStartReview,
  onRenameVideo,
  onSetVideoProject,
  onRemoveVideo,
  onCompleteUpload,
  onGenerateUploadUrl,
  onOpenBoard,
  highlightMessage,
  onDismissHighlight,
}) => {
  const isDark = useThemePreference(theme);
  const viewModeKey = getViewModeStorageKey(project.id);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => loadStoredViewMode(viewModeKey));
  const [videoToRename, setVideoToRename] = useState<Video | null>(null);
  const [videoToMove, setVideoToMove] = useState<Video | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
  const [videoToShare, setVideoToShare] = useState<Video | null>(null);
  const [highlightVisible, setHighlightVisible] = useState(Boolean(highlightMessage));
  const [toasts, setToasts] = useState<WorkspaceToast[]>([]);
  const toastId = useRef(0);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [activeTab, setActiveTab] = useState<'review' | 'boards'>('review');
  const [boardViewMode, setBoardViewMode] = useState<'grid' | 'list'>('grid');
  const [boardToRename, setBoardToRename] = useState<Board | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [boardRenameValue, setBoardRenameValue] = useState('');
  const [isUpdatingBoard, setIsUpdatingBoard] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverTargetBoard, setCoverTargetBoard] = useState<Board | null>(null);
  const [pendingUpload, setPendingUpload] = useState<UploadState | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setViewMode(loadStoredViewMode(viewModeKey));
  }, [viewModeKey]);

  useEffect(() => {
    persistViewMode(viewModeKey, viewMode);
  }, [viewMode, viewModeKey]);

  useEffect(() => {
    setHighlightVisible(Boolean(highlightMessage));
  }, [highlightMessage]);

  const pushToast = useCallback((tone: WorkspaceToast['tone'], message: string) => {
    setToasts((current) => [{ id: toastId.current++, tone, message }, ...current]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const handleDismissHighlight = useCallback(() => {
    setHighlightVisible(false);
    onDismissHighlight?.();
  }, [onDismissHighlight]);

  const shareGroups = useQuery(api.shareGroups.list, {});
  const shareRecords = useQuery(api.shares.list, {});
  const workspaceSettings = useQuery(api.settings.getOrNull, {});
  const boardsQuery = useQuery(api.boards.listByProject, { projectId: project.id as any });
  const shareToGroup = useMutation(api.shares.shareToGroup);
  const generateShareLink = useMutation(api.shares.generateLink);
  const revokeShare = useMutation(api.shares.revoke);
  const autoShareVideo = useMutation(api.shares.autoShareVideo);
  const createBoard = useMutation(api.boards.create);
  const updateBoardTitle = useMutation(api.boards.updateTitle);
  const deleteBoard = useMutation(api.boards.remove);
  const updateBoardImage = useMutation(api.board.updateImage);
  const createMultipart = useAction((api as any).storage.createMultipartUpload);
  const getMultipartUrls = useAction((api as any).storage.getMultipartUploadUrls);
  const completeMultipart = useAction((api as any).storage.completeMultipartUpload);

  const activeShares = useMemo(
    () => (shareRecords ?? []).filter((share) => share.isActive),
    [shareRecords],
  );

  const getVideoShares = useCallback(
    (videoId: string): ContentShare[] => activeShares.filter((share) => share.videoId === videoId),
    [activeShares],
  );

  const projectVideos = useMemo(() => {
    const getTime = (video: Video) => {
      const source = video.lastReviewedAt ?? video.uploadedAt;
      return source ? Date.parse(source) : 0;
    };
    return videos
      .filter((video) => video.projectId === project.id)
      .sort((a, b) => getTime(b) - getTime(a));
  }, [videos, project.id]);

  const boards = useMemo<Board[]>(() => {
    if (!boardsQuery) return [];
    return boardsQuery.map((board: any) => ({
      id: board._id as string,
      title: board.title,
      createdAt: new Date(board.createdAt ?? board._creationTime).toISOString(),
      updatedAt: board.updatedAt ? new Date(board.updatedAt).toISOString() : undefined,
      projectId: board.projectId ?? null,
      imageUrl: board.imageUrl ?? null,
      isShared: board.isShared ?? false,
      sharedRole: board.sharedRole ?? null,
    }));
  }, [boardsQuery]);

  const handleRename = useCallback(
    async (video: Video, title: string) => {
      const next = title.trim();
      if (!next) return;
      if (video.isOwnedByCurrentUser === false) {
        pushToast('info', 'Only the owner can rename this review.');
        setVideoToRename(null);
        return;
      }
      try {
        await onRenameVideo(video.id, next);
        setVideoToRename(null);
        pushToast('success', 'Review title updated.');
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to rename review.');
      }
    },
    [onRenameVideo, pushToast],
  );

  const handleMove = useCallback(
    async (video: Video, projectId: string) => {
      if (!projectId) return;
      if (video.isOwnedByCurrentUser === false) {
        pushToast('info', 'Only the owner can move this review.');
        setVideoToMove(null);
        return;
      }
      try {
        if (video.projectId !== projectId) {
          await onSetVideoProject(video.id, projectId);
        }
        setVideoToMove(null);
        pushToast('success', 'Review moved to project.');
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to move review.');
      }
    },
    [onSetVideoProject, pushToast],
  );

  const handleDelete = useCallback(
    async (video: Video) => {
      if (video.isOwnedByCurrentUser === false) {
        pushToast('info', 'Only the owner can delete this review.');
        setVideoToDelete(null);
        return;
      }
      try {
        await onRemoveVideo(video.id);
        setVideoToDelete(null);
        pushToast('success', 'Review deleted.');
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to delete review.');
      }
    },
    [onRemoveVideo, pushToast],
  );

  const shareVideoToGroup = useCallback(
    async (video: Video, groupId: string, allowDownload: boolean, allowComments: boolean) => {
      try {
        await shareToGroup({
          videoId: video.id as any,
          projectId: undefined,
          groupId: groupId as any,
          allowDownload,
          allowComments,
        });
        pushToast('success', 'Review shared with group.');
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to share review.');
      }
    },
    [shareToGroup, pushToast],
  );

  const generateVideoLink = useCallback(
    async (video: Video, allowDownload: boolean, allowComments: boolean, expiresAt?: number) => {
      try {
        const token = await generateShareLink({
          videoId: video.id as any,
          projectId: undefined,
          allowDownload,
          allowComments,
          expiresAt,
        });
        pushToast('success', 'Shareable link generated.');
        return token;
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to generate link.');
        throw error;
      }
    },
    [generateShareLink, pushToast],
  );

  const unshareVideo = useCallback(
    async (shareId: string) => {
      try {
        await revokeShare({ shareId: shareId as any });
        pushToast('success', 'Sharing removed.');
      } catch (error) {
        console.error(error);
        pushToast('error', 'Unable to update sharing.');
        throw error;
      }
    },
    [revokeShare, pushToast],
  );

  const handleCreateBoard = useCallback(async () => {
    const title = newBoardTitle.trim();
    if (!title || isCreatingBoard) return;
    try {
      setIsCreatingBoard(true);
      const boardId = await createBoard({ title, projectId: project.id as any });
      setNewBoardTitle('');
      pushToast('success', 'Board created');
      if (boardId && onOpenBoard) {
        onOpenBoard(boardId as unknown as string);
      }
    } catch (error) {
      console.error('Failed to create board', error);
      pushToast('error', 'Could not create board');
    } finally {
      setIsCreatingBoard(false);
    }
  }, [newBoardTitle, isCreatingBoard, createBoard, project.id, onOpenBoard, pushToast]);

  const handleRenameBoard = useCallback(async () => {
    if (!boardToRename) return;
    const nextTitle = boardRenameValue.trim();
    if (!nextTitle || isUpdatingBoard) return;
    try {
      setIsUpdatingBoard(true);
      await updateBoardTitle({ id: boardToRename.id as any, title: nextTitle });
      setBoardToRename(null);
      setBoardRenameValue('');
      pushToast('success', 'Board renamed.');
    } catch (error) {
      console.error('Failed to rename board', error);
      pushToast('error', 'Unable to rename board.');
    } finally {
      setIsUpdatingBoard(false);
    }
  }, [boardToRename, boardRenameValue, isUpdatingBoard, updateBoardTitle, pushToast]);

  const handleDeleteBoard = useCallback(async () => {
    if (!boardToDelete) return;
    try {
      await deleteBoard({ id: boardToDelete.id as any });
      setBoardToDelete(null);
      pushToast('success', 'Board deleted.');
    } catch (error) {
      console.error('Failed to delete board', error);
      pushToast('error', 'Unable to delete board.');
    }
  }, [boardToDelete, deleteBoard, pushToast]);

  const openCoverPicker = useCallback((board: Board) => {
    setCoverTargetBoard(board);
    requestAnimationFrame(() => {
      coverInputRef.current?.click();
    });
  }, []);

  const handleCoverInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !coverTargetBoard) return;
      if (!file.type.startsWith('image/')) {
        pushToast('error', 'Please upload an image file.');
        event.target.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        pushToast('error', 'Image is too large. Limit is 5MB.');
        event.target.value = '';
        return;
      }
      try {
        const compressed = await compressImage(file);
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (!e.target?.result) return;
          const imageUrl = e.target.result.toString();
          await updateBoardImage({ id: coverTargetBoard.id as any, imageUrl });
          pushToast('success', 'Board cover updated.');
        };
        reader.readAsDataURL(compressed);
      } catch (error) {
        console.error('Failed to update cover', error);
        pushToast('error', 'Unable to update board cover.');
      } finally {
        event.target.value = '';
        setCoverTargetBoard(null);
      }
    },
    [coverTargetBoard, pushToast, updateBoardImage],
  );

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

  const resetUploadState = () => {
    if (pendingUpload) URL.revokeObjectURL(pendingUpload.objectUrl);
    setPendingUpload(null);
    setUploadLogs([]);
    setUploadProgress(0);
    setShowUploadModal(false);
  };

  const prepareUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      throw new Error('Only video files are supported for upload.');
    }

    const objectUrl = URL.createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = objectUrl;
    videoElement.muted = true;
    videoElement.playsInline = true;

    const metadata = await new Promise<UploadState['metadata']>((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        resolve({
          width: videoElement.videoWidth || 1920,
          height: videoElement.videoHeight || 1080,
          duration: videoElement.duration || 0,
          fps: videoElement.getVideoPlaybackQuality
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
    try {
      await prepareUpload(file);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to prepare upload.');
    }
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
        xhr.timeout = 1000 * 60 * 10;
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

  const uploadMultipart = async (file: File, contentType: string, onProgress: (p: number) => void, reviewId: string) => {
    const partSize = 16 * 1024 * 1024;
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
        xhr.timeout = 1000 * 60 * 15;
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
    setIsUploading(true);
    setUploadLogs([`Preparing upload for ${pendingUpload.file.name}`]);
    setUploadProgress(0);

    try {
      const contentType = resolveContentType(pendingUpload.file);
      const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
      let uploadResult: { storageKey: string; publicUrl: string };
      if (pendingUpload.file.size >= MULTIPART_THRESHOLD) {
        setUploadLogs((cur) => [...cur, `Using multipart upload (${Math.ceil(pendingUpload.file.size / (16 * 1024 * 1024))} parts)…`]);
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
          xhr.timeout = 1000 * 60 * 45;
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
        projectId: project.id,
        thumbnailUrl,
        reviewId: pendingUpload.reviewId,
      });

      setUploadLogs((current) => [...current, 'Review created successfully.']);
      await autoShareVideo({
        videoId: created.id as any,
        projectId: project.id as any,
      }).catch(() => undefined);
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

  return (
    <div className="space-y-6 library-skin">
      <header className="library-panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-full border border-gray-200 bg-white p-2 text-gray-600 hover:text-gray-900"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-600">
              {projectVideos.length} review{projectVideos.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1">
          <button
            onClick={() => setActiveTab('review')}
            className={`tab-button rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeTab === 'review'
                ? 'tab-button-active'
                : 'tab-button-inactive text-gray-500 hover:text-gray-900'
            }`}
          >
            Reviews
          </button>
          <button
            onClick={() => setActiveTab('boards')}
            className={`tab-button rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeTab === 'boards'
                ? 'tab-button-active'
                : 'tab-button-inactive text-gray-500 hover:text-gray-900'
            }`}
          >
            Boards
          </button>
        </div>
        <input
          type="file"
          ref={coverInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleCoverInput}
        />
        {activeTab === 'review' && (
          <div
            className={`w-full rounded-2xl border border-gray-200 bg-white p-4 ${
              isDragActive ? 'ring-2 ring-gray-300' : ''
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
                <h2 className="text-base font-semibold text-gray-900">Upload review</h2>
                <p className="text-sm text-gray-600">
                  Drag and drop a video here or use the button below. It will be added to “{project.name}”.
                </p>
              </div>
              <UploadCloud className="text-gray-700" size={24} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
              >
                <UploadCloud size={16} /> Select video
              </button>
              <input
                type="file"
                ref={uploadInputRef}
                className="hidden"
                accept="video/*"
                onChange={handleFileInput}
              />
              <span className="text-xs text-gray-500">MP4, MOV, WebM supported.</span>
            </div>
          </div>
        )}
      </header>

      {activeTab === 'review' ? (
        <>
          {highlightVisible && highlightMessage && (
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700">{highlightMessage}</p>
              <button
                onClick={handleDismissHighlight}
                className="rounded-full border border-gray-200 bg-white p-1 text-gray-600 hover:text-gray-900"
                aria-label="Dismiss highlight"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {projectVideos.length === 0 ? (
            <div className="library-card-muted p-8 text-center text-gray-500">
              No reviews yet for this project.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  List
                </button>
              </div>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {projectVideos.map((video) => (
                    <div
                      key={video.id}
                      className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                      onClick={() => onStartReview(video)}
                    >
                      <div className="relative aspect-video">
                        <Thumbnail video={video} />
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onStartReview(video);
                          }}
                          className="absolute bottom-2 right-2 rounded-full bg-white/90 p-2 text-gray-700 opacity-90 hover:bg-gray-100 shadow-sm"
                          title="Open"
                        >
                          <PlayCircle size={20} />
                        </button>
                        <div className="absolute right-3 top-3">
                          <VideoActionsMenu
                            onRename={() => {
                              if (video.isOwnedByCurrentUser === false) {
                                pushToast('info', 'Only the owner can rename this review.');
                                return;
                              }
                              setVideoToRename(video);
                            }}
                            onMove={() => {
                              if (video.isOwnedByCurrentUser === false) {
                                pushToast('info', 'Only the owner can move this review.');
                                return;
                              }
                              setVideoToMove(video);
                            }}
                            onShare={() => setVideoToShare(video)}
                            onDelete={() => {
                              if (video.isOwnedByCurrentUser === false) {
                                pushToast('info', 'Only the owner can delete this review.');
                                return;
                              }
                              setVideoToDelete(video);
                            }}
                            isDark={isDark}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 px-3 pt-3">
                        <h3 className="truncate text-sm font-semibold text-gray-900" title={video.title}>
                          {video.title}
                        </h3>
                        <span className="text-[11px] text-gray-500">{formatDuration(video.duration)}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 pb-3 text-[11px] text-gray-500">
                        <span>Updated {formatDate(video.lastReviewedAt ?? video.uploadedAt)}</span>
                        <span>
                          {video.width}×{video.height} • {video.fps} fps
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="min-w-[640px] w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Review</th>
                        <th className="hidden px-4 py-3 md:table-cell">Duration</th>
                        <th className="hidden px-4 py-3 sm:table-cell">Last activity</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectVideos.map((video) => (
                        <tr
                          key={video.id}
                          className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                          onClick={() => onStartReview(video)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onStartReview(video);
                            }
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-semibold text-gray-900" title="Open review">
                                {video.title}
                              </span>
                              <div className="text-[11px] text-gray-500">
                                Uploaded {formatDate(video.uploadedAt)} • {video.width}×{video.height} • {video.fps} fps
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                            {formatDuration(video.duration)}
                          </td>
                          <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">
                            {formatDate(video.lastReviewedAt ?? video.uploadedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                              <VideoActionsMenu
                                onRename={() => {
                                  if (video.isOwnedByCurrentUser === false) {
                                    pushToast('info', 'Only the owner can rename this review.');
                                    return;
                                  }
                                  setVideoToRename(video);
                                }}
                                onMove={() => {
                                  if (video.isOwnedByCurrentUser === false) {
                                    pushToast('info', 'Only the owner can move this review.');
                                    return;
                                  }
                                  setVideoToMove(video);
                                }}
                                onShare={() => setVideoToShare(video)}
                                onDelete={() => {
                                  if (video.isOwnedByCurrentUser === false) {
                                    pushToast('info', 'Only the owner can delete this review.');
                                    return;
                                  }
                                  setVideoToDelete(video);
                                }}
                                isDark={isDark}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <section className="library-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Boards</h2>
              <p className="text-xs text-gray-600">Boards live inside this project.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs text-gray-600">
                <LayoutGrid size={14} className="text-gray-500" />
                <span>{boards.length} board{boards.length === 1 ? '' : 's'}</span>
              </div>
              <input
                value={newBoardTitle}
                onChange={(event) => setNewBoardTitle(event.target.value)}
                placeholder="Board title"
                className="w-44 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button
                onClick={handleCreateBoard}
                disabled={!newBoardTitle.trim() || isCreatingBoard}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={14} />
                {isCreatingBoard ? 'Creating…' : 'Create board'}
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setBoardViewMode('grid')}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    boardViewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setBoardViewMode('list')}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    boardViewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {boards.length === 0 ? (
            <div className="mt-5 library-card-muted p-6 text-center text-xs text-gray-500">
              No boards yet in this project.
            </div>
          ) : boardViewMode === 'grid' ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((board, index) => (
                <div
                  key={board.id}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  onClick={() => onOpenBoard?.(board.id)}
                >
                  <div className="relative aspect-video">
                    <BoardThumbnail
                      board={board}
                      fallbackUrl={fallbackBoardCovers[index % fallbackBoardCovers.length]}
                    />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenBoard?.(board.id);
                      }}
                      className="absolute bottom-2 right-2 rounded-full bg-white/90 p-2 text-gray-700 opacity-90 hover:bg-gray-100 shadow-sm"
                      title="Open"
                    >
                      <LayoutGrid size={18} />
                    </button>
                    <div className="absolute right-3 top-3" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-full bg-white/90 p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                            <MoreHorizontal size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="border border-slate-200 bg-white text-slate-900 shadow-xl">
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 focus:bg-slate-100"
                            onClick={() => openCoverPicker(board)}
                          >
                            <UploadCloud size={14} />
                            Set cover
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-200" />
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 focus:bg-slate-100"
                            onClick={() => {
                              setBoardToRename(board);
                              setBoardRenameValue(board.title);
                            }}
                          >
                            <Pencil size={14} />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-200" />
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50"
                            onClick={() => setBoardToDelete(board)}
                          >
                            <Trash2 size={14} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 pt-3">
                    <h3 className="truncate text-sm font-semibold text-gray-900" title={board.title}>
                      {board.title}
                    </h3>
                    {board.isShared ? (
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                        {board.sharedRole ?? 'shared'}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between px-3 pb-3 text-[11px] text-gray-500">
                    <span>
                      Updated {formatDate(board.updatedAt ?? board.createdAt)}
                    </span>
                    <span>Created {formatDate(board.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Board</th>
                    <th className="hidden px-4 py-3 md:table-cell">Last activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.map((board) => (
                    <tr
                      key={board.id}
                      className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                      onClick={() => onOpenBoard?.(board.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenBoard?.(board.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-gray-900">{board.title}</span>
                          <div className="text-[11px] text-gray-500">
                            Created {formatDate(board.createdAt)}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                        {formatDate(board.updatedAt ?? board.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="rounded-full bg-gray-100 p-1 text-gray-600 hover:text-gray-900">
                                <MoreHorizontal size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="border border-slate-200 bg-white text-slate-900 shadow-xl">
                              <DropdownMenuItem
                                className="cursor-pointer gap-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 focus:bg-slate-100"
                                onClick={() => openCoverPicker(board)}
                              >
                                <UploadCloud size={14} />
                                Set cover
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-200" />
                              <DropdownMenuItem
                                className="cursor-pointer gap-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 focus:bg-slate-100"
                                onClick={() => {
                                  setBoardToRename(board);
                                  setBoardRenameValue(board.title);
                                }}
                              >
                                <Pencil size={14} />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-200" />
                              <DropdownMenuItem
                                className="cursor-pointer gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50"
                                onClick={() => setBoardToDelete(board)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center dashboard-overlay bg-black/30 p-4 backdrop-blur">
          <div className="library-panel w-full max-w-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Prepare upload</h3>
                <p className="text-sm text-gray-600">Review the details before uploading to “{project.name}”.</p>
              </div>
              <button onClick={resetUploadState} className="rounded-full border border-gray-200 bg-white p-1 text-gray-600 hover:text-gray-900">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="font-semibold text-gray-900">File</h4>
                <p>{pendingUpload.file.name}</p>
                <p>
                  {pendingUpload.metadata.width}×{pendingUpload.metadata.height} • {Math.round(pendingUpload.metadata.duration)}s
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="mb-2 font-semibold text-gray-900">Project</h4>
                <p className="text-sm text-gray-700">{project.name}</p>
              </div>
              {uploadLogs.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-semibold text-gray-900">Upload logs</h4>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {uploadLogs.map((log, index) => (
                      <li key={index}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}
              {isUploading && (
                <div className="rounded-full bg-gray-100 p-1">
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-gray-900 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-600">{uploadProgress}%</p>
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
                disabled={isUploading}
                className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-gray-800 disabled:opacity-40"
              >
                {isUploading ? 'Uploading…' : 'Upload'}
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
          onShareToGroup={(args) =>
            shareVideoToGroup(videoToShare, args.groupId, args.allowDownload, args.allowComments)
          }
          onGenerateLink={(options) =>
            generateVideoLink(videoToShare, options.allowDownload, options.allowComments, options.expiresAt)
          }
          onUnshare={(shareId) => unshareVideo(shareId)}
          onClose={() => setVideoToShare(null)}
        />
      )}

      <Dialog
        open={Boolean(boardToRename)}
        onOpenChange={(open) => {
          if (!open) {
            setBoardToRename(null);
            setBoardRenameValue('');
          }
        }}
      >
        <DialogContent className="max-w-md bg-white border border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>Rename board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              value={boardRenameValue}
              onChange={(event) => setBoardRenameValue(event.target.value)}
              placeholder="Board title"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBoardToRename(null);
                  setBoardRenameValue('');
                }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameBoard}
                disabled={!boardRenameValue.trim() || isUpdatingBoard}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingBoard ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(boardToDelete)}
        onOpenChange={(open) => {
          if (!open) setBoardToDelete(null);
        }}
      >
        <DialogContent className="max-w-md bg-white border border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>Delete board?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will permanently delete the board and its content.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBoardToDelete(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBoard}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectWorkspace;
