import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Film, PlayCircle, ArrowLeft, X, AlertTriangle, Info } from 'lucide-react';
import { Video, Project, ContentShare } from '../types';
import { useThemePreference } from '../useTheme';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import lottieSaved from '../assets/animations/saved.json?url';
import {
  VideoActionsMenu,
  RenameVideoModal,
  MoveVideoModal,
  ConfirmDeleteModal,
  ShareModal,
} from './Dashboard';

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
  const shareToGroup = useMutation(api.shares.shareToGroup);
  const generateShareLink = useMutation(api.shares.generateLink);
  const revokeShare = useMutation(api.shares.revoke);

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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-full bg-white/10 p-2 text-white/70 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-right">
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          <p className="text-sm text-white/60">
            {projectVideos.length} review{projectVideos.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>
      {highlightVisible && highlightMessage && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/80">{highlightMessage}</p>
          <button
            onClick={handleDismissHighlight}
            className="rounded-full bg-white/10 p-1 text-white/60 hover:text-white"
            aria-label="Dismiss highlight"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {projectVideos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 text-center text-white/60">
          No reviews yet for this project.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-full px-3 py-1.5 text-xs ${
                viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-full px-3 py-1.5 text-xs ${
                viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
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
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/40"
                  onClick={() => onStartReview(video)}
                >
                  <div className="relative aspect-video">
                    <Thumbnail video={video} />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onStartReview(video);
                      }}
                      className="absolute bottom-2 right-2 rounded-full bg-white/10 p-2 text-white opacity-90 hover:bg-white/20"
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
                    <h3 className="truncate text-sm font-semibold text-white" title={video.title}>
                      {video.title}
                    </h3>
                    <span className="text-[11px] text-white/60">{formatDuration(video.duration)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 pb-3 text-[11px] text-white/50">
                    <span>Updated {formatDate(video.lastReviewedAt ?? video.uploadedAt)}</span>
                    <span>
                      {video.width}×{video.height} • {video.fps} fps
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase text-white/40">
                  <tr>
                    <th className="px-4 py-3">Review</th>
                    <th className="hidden px-4 py-3 md:table-cell">Duration</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Last activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectVideos.map((video) => (
                    <tr key={video.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => onStartReview(video)}
                            className="text-left text-sm font-semibold text-white hover:underline"
                            title="Open review"
                          >
                            {video.title}
                          </button>
                          <div className="text-[11px] text-white/50">
                            Uploaded {formatDate(video.uploadedAt)} • {video.width}×{video.height} • {video.fps} fps
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-white/70 md:table-cell">
                        {formatDuration(video.duration)}
                      </td>
                      <td className="hidden px-4 py-3 text-white/50 sm:table-cell">
                        {formatDate(video.lastReviewedAt ?? video.uploadedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
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
    </div>
  );
};

export default ProjectWorkspace;
