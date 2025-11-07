import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SignedIn, SignedOut, useUser, useClerk, useSignIn } from '@clerk/clerk-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from './convex/_generated/api';
import VideoReviewer from './components/VideoReviewer';
import Dashboard from './components/Dashboard';
import ProfileSettings from './components/ProfileSettings';
import ProjectWorkspace from './components/ProjectWorkspace';
import { Project, Video } from './types';
import type { Id } from './convex/_generated/dataModel';
import logo from './assets/logo.svg';
import googleLogo from './assets/google.svg';
import { useThemePreference, applyTheme, ThemePref } from './useTheme';
import { Sun, Moon } from 'lucide-react';
import { Bell } from 'lucide-react';
// Lottie assets as static URLs to ensure they are included in Vite build
import lottieLoader from './assets/animations/Loader.json?url';
import lottieImageLoader from './assets/animations/imageloader.json?url';

type UploadPayload = {
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
};

type Route =
  | { name: 'home' }
  | { name: 'dashboard' }
  | { name: 'profile' }
  | { name: 'project'; id: string }
  | { name: 'review'; id: string }
  | { name: 'share'; token: string };

type NotificationRecord = {
  id: string;
  type: string;
  message: string;
  videoId: string | null;
  projectId: string | null;
  commentId: string | null;
  frame: number | null;
  mentionText: string | null;
  fromUserId: string | null;
  createdAt: number;
  readAt: number | null;
};

type ReviewFocus = {
  videoId: string;
  commentId?: string | null;
  frame?: number | null;
  mentionText?: string | null;
};

const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(timestamp).toLocaleDateString();
};

function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  if (pathname === '/dashboard') return { name: 'dashboard' };
  if (pathname === '/profile') return { name: 'profile' };
  const projectMatch = pathname.match(/^\/project\/([^\/?#]+)/);
  if (projectMatch) return { name: 'project', id: projectMatch[1] };
  const reviewMatch = pathname.match(/^\/review\/([^\/?#]+)/);
  if (reviewMatch) return { name: 'review', id: reviewMatch[1] };
  const shareMatch = pathname.match(/^\/share\/([^\/?#]+)/);
  if (shareMatch) return { name: 'share', token: shareMatch[1] };
  
  // default to home
  return { name: 'home' };
}

function navigate(path: string, replace = false) {
  const url = path.startsWith('/') ? path : `/${path}`;
  try {
    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch (_) {
    window.location.assign(url);
  }
}

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [view, setView] = useState<'dashboard' | 'reviewer' | 'profile' | 'project'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sharedSelectedVideo, setSharedSelectedVideo] = useState<Video | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [reviewSourceUrl, setReviewSourceUrl] = useState<string | null>(null);
  const [pendingReviewFocus, setPendingReviewFocus] = useState<ReviewFocus | null>(null);
  const [pendingProjectFocus, setPendingProjectFocus] = useState<{ projectId: string; message?: string } | null>(null);
  const [isEnsuringUser, setIsEnsuringUser] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [isMiroEmbed, setIsMiroEmbed] = useState(false);
  const { isSignedIn } = useUser();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();

  const currentUser = useQuery(api.users.current, isSignedIn ? {} : undefined);
  const userSettings = useQuery(api.settings.getOrNull, currentUser ? {} : undefined);
  const projectsQuery = useQuery(api.projects.list, currentUser ? {} : undefined);
  const videosQuery = useQuery(api.videos.list, currentUser ? { projectId: undefined } : undefined);
  const sharedProjectsQuery = useQuery(api.shares.projectsSharedWithMe, currentUser ? {} : undefined);
  const sharedVideosQuery = useQuery(api.shares.videosSharedWithMe, currentUser ? {} : undefined);
  const notifications = useQuery(api.notifications.list, {}) as NotificationRecord[] | undefined;

  // Share-link handling
  const shareToken = useMemo(() => (route.name === 'share' ? route.token : null), [route]);
  const shareResolution = useQuery(api.shares.resolveToken, shareToken ? { token: shareToken } : undefined);
  const shareVideo = useQuery(
    api.videos.getByShareToken,
    shareToken && shareResolution && (shareResolution as any)?.videoId ? { token: shareToken } : undefined
  );

  const ensureUser = useMutation(api.users.ensure);
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.remove);
  const assignVideoProject = useMutation(api.projects.setProjectForVideo);
  const completeUpload = useMutation(api.videos.completeUpload);
  const updateVideoMetadata = useMutation(api.videos.updateMetadata);
  const removeVideo = useMutation(api.videos.remove);
  const generateUploadUrl = useAction(api.storage.generateVideoUploadUrl);
  const getDownloadUrl = useAction(api.storage.getDownloadUrl);
  const markNotificationRead = useMutation(api.notifications.markRead);
  const markAllNotificationsRead = useMutation(api.notifications.markAllRead);
  const hasUnreadNotifications = useMemo(() => notifications?.some((n) => !n.readAt) ?? false, [notifications]);

  const handleCreateProject = useCallback(
    async (name: string) => {
      const created = await createProject({ name });
      return created as unknown as string;
    },
    [createProject]
  );

  const handleUpdateProject = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      await updateProject({ projectId: id as Id<'projects'>, name });
    },
    [updateProject]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await deleteProject({ projectId: projectId as Id<'projects'> });
    },
    [deleteProject]
  );

  const handleSetVideoProject = useCallback(
    async (videoId: string, projectId: string) => {
      await assignVideoProject({
        videoId: videoId as Id<'videos'>,
        projectId: projectId as Id<'projects'>,
      });
    },
    [assignVideoProject]
  );

  const handleRenameVideo = useCallback(
    async (videoId: string, title: string) => {
      await updateVideoMetadata({ videoId: videoId as Id<'videos'>, title });
    },
    [updateVideoMetadata]
  );

  const handleRemoveVideo = useCallback(
    async (videoId: string) => {
      await removeVideo({ videoId: videoId as Id<'videos'> });
    },
    [removeVideo]
  );

  const handleCompleteUpload = useCallback(
    async (payload: UploadPayload) => {
      const created = await completeUpload({
        storageKey: payload.storageKey,
        publicUrl: payload.publicUrl,
        title: payload.title,
        description: payload.description,
        width: payload.width,
        height: payload.height,
        fps: payload.fps,
        duration: payload.duration,
        projectId: payload.projectId as Id<'projects'>,
        thumbnailUrl: payload.thumbnailUrl,
      });

      return {
        id: created.id,
        title: created.title,
        src: created.src,
        storageKey: created.storageKey ?? undefined,
        thumbnailUrl: (created as any).thumbnailUrl ?? undefined,
        width: created.width,
        height: created.height,
        fps: created.fps,
        duration: created.duration,
        projectId: created.projectId ?? undefined,
        uploadedAt: new Date(created.uploadedAt).toISOString(),
        lastReviewedAt: created.lastReviewedAt
          ? new Date(created.lastReviewedAt).toISOString()
          : undefined,
      } satisfies Video;
    },
    [completeUpload]
  );

  const attemptEnsureUser = useCallback(async () => {
    setIsEnsuringUser(true);
    setEnsureError(null);
    try {
      await ensureUser();
    } catch (error) {
      console.error('Failed to sync user in Convex', error);
      setEnsureError('Unable to connect your account to the backend. Please try again.');
    } finally {
      setIsEnsuringUser(false);
    }
  }, [ensureUser]);

  useEffect(() => {
    if (!isSignedIn) {
      setIsEnsuringUser(false);
      setEnsureError(null);
      return;
    }

    if (currentUser === undefined) {
      return;
    }

    if (currentUser !== null) {
      setEnsureError(null);
      return;
    }

    if (isEnsuringUser) {
      return;
    }

    void attemptEnsureUser();
  }, [isSignedIn, currentUser, isEnsuringUser, attemptEnsureUser]);

  const handleRetryEnsureUser = useCallback(() => {
    if (!isEnsuringUser) {
      void attemptEnsureUser();
    }
  }, [attemptEnsureUser, isEnsuringUser]);

  const projects: Project[] = useMemo(() => {
    const own = projectsQuery
      ? projectsQuery.map((project) => ({ id: project._id, name: project.name, createdAt: new Date(project.createdAt).toISOString() }))
      : [];
    const shared = sharedProjectsQuery
      ? sharedProjectsQuery.map((project: any) => ({ id: project._id, name: project.name, createdAt: new Date(project.createdAt).toISOString() }))
      : [];
    const byId = new Map<string, Project>();
    [...own, ...shared].forEach((p) => byId.set(p.id, p));
    return Array.from(byId.values());
  }, [projectsQuery, sharedProjectsQuery]);

  const videos: Video[] = useMemo(() => {
    const own = videosQuery
      ? videosQuery.map((video) => ({
          id: video.id,
          title: video.title,
          src: video.src,
          storageKey: video.storageKey,
          thumbnailUrl: (video as any).thumbnailUrl ?? undefined,
          width: video.width,
          height: video.height,
          fps: video.fps,
          duration: video.duration,
          projectId: video.projectId ?? undefined,
          uploadedAt: new Date(video.uploadedAt).toISOString(),
          lastReviewedAt: video.lastReviewedAt ? new Date(video.lastReviewedAt).toISOString() : undefined,
        }))
      : [];
    const shared = sharedVideosQuery
      ? sharedVideosQuery.map((video: any) => ({
          id: video.id,
          title: video.title,
          src: video.src,
          storageKey: video.storageKey,
          thumbnailUrl: (video as any).thumbnailUrl ?? undefined,
          width: video.width,
          height: video.height,
          fps: video.fps,
          duration: video.duration,
          projectId: video.projectId ?? undefined,
          uploadedAt: new Date(video.uploadedAt).toISOString(),
          lastReviewedAt: video.lastReviewedAt ? new Date(video.lastReviewedAt).toISOString() : undefined,
        }))
      : [];
    const byId = new Map<string, Video>();
    [...own, ...shared].forEach((v) => byId.set(v.id, v));
    return Array.from(byId.values());
  }, [videosQuery, sharedVideosQuery]);

  const dataLoading = Boolean(currentUser) && (projectsQuery === undefined || videosQuery === undefined);

  // Detect if running inside Miro panel so we can adapt the landing layout
  useEffect(() => {
    try {
      const isEmbed = Boolean((window as any).miro && (window as any).miro.board && (window as any).miro.board.ui);
      setIsMiroEmbed(isEmbed);
    } catch {}
  }, []);

  const currentVideo = useMemo(() => {
    if (!selectedVideoId) return null;
    return videos.find((video) => video.id === selectedVideoId) ?? sharedSelectedVideo;
  }, [videos, selectedVideoId, sharedSelectedVideo]);

  const activeReviewFocus = useMemo(() => {
    if (!pendingReviewFocus || !currentVideo) return null;
    if (pendingReviewFocus.videoId !== currentVideo.id) return null;
    return {
      commentId: pendingReviewFocus.commentId ?? null,
      frame: pendingReviewFocus.frame ?? null,
      mentionText: pendingReviewFocus.mentionText ?? null,
    };
  }, [pendingReviewFocus, currentVideo]);

  const activeProjectHighlight = useMemo(() => {
    if (!pendingProjectFocus || view !== 'project' || !activeProjectId) return null;
    if (pendingProjectFocus.projectId !== activeProjectId) return null;
    return pendingProjectFocus;
  }, [pendingProjectFocus, view, activeProjectId]);
  const handleGoogleSignIn = useCallback(async () => {
    if (!isSignInLoaded || !signIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: window.location.href,
        redirectUrlComplete: '/dashboard',
      });
    } catch (err) {
      console.error('Google sign-in redirect failed', err);
    }
  }, [isSignInLoaded, signIn]);

  const handleStartReview = useCallback(
    async (video: Video) => {
      setSelectedVideoId(video.id);
      setSharedSelectedVideo(null);
      setReviewSourceUrl(null);
      setPendingReviewFocus(null);
      try {
        if (video.storageKey) {
          const url = await getDownloadUrl({ storageKey: video.storageKey });
          setReviewSourceUrl(url);
        }
      } catch (e) {
        console.warn('Prefetch playback URL failed, will fallback in reviewer', e);
      }
      // Only attempt to update lastReviewedAt if user is signed in
      if (currentUser) {
        try {
          await updateVideoMetadata({
            videoId: video.id as Id<'videos'>,
            lastReviewedAt: Date.now(),
          });
        } catch (error) {
          console.error('Failed to update last reviewed timestamp', error);
        }
      }
      navigate(`/review/${video.id}`);
    },
    [updateVideoMetadata, getDownloadUrl, currentUser, navigate]
  );

  // Route → internal state sync
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // derive view + IDs from route
    if (route.name === 'home') {
      // If signed in, prefer dashboard URL; otherwise keep landing.
      if (isSignedIn) {
        navigate('/dashboard', true);
        return;
      }
      setView('dashboard');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'dashboard') {
      setView('dashboard');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'profile') {
      setView('profile');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'project') {
      setActiveProjectId(route.id);
      setView('project');
      return;
    }
    if (route.name === 'review') {
      setSelectedVideoId(route.id);
      setView('reviewer');
      return;
    }
    if (route.name === 'share') {
      // handled below when shareResolution/shareVideo load
      return;
    }
  }, [route]);

  // If landing on /share/:token, open the linked review/project
  useEffect(() => {
    if (!shareToken) return;
    if (shareResolution === undefined) return; // loading
    if (shareResolution === null) return; // invalid or expired
    if (shareResolution && (shareResolution as any).projectId) {
      setActiveProjectId((shareResolution as any).projectId as string);
      setView('project');
      return;
    }
    if (shareVideo) {
      const v: Video = {
        id: (shareVideo as any).id,
        title: (shareVideo as any).title,
        src: (shareVideo as any).src,
        storageKey: (shareVideo as any).storageKey,
        thumbnailUrl: (shareVideo as any).thumbnailUrl ?? undefined,
        width: (shareVideo as any).width,
        height: (shareVideo as any).height,
        fps: (shareVideo as any).fps,
        duration: (shareVideo as any).duration,
        projectId: (shareVideo as any).projectId ?? undefined,
        uploadedAt: new Date((shareVideo as any).uploadedAt).toISOString(),
        lastReviewedAt: (shareVideo as any).lastReviewedAt ? new Date((shareVideo as any).lastReviewedAt).toISOString() : undefined,
      };
      setSharedSelectedVideo(v);
      setSelectedVideoId(v.id);
      setView('reviewer');
    }
  }, [shareToken, shareResolution, shareVideo]);

  // No special handling required for top-level redirects;
  // Clerk manages the Google OAuth flow entirely after authenticateWithRedirect.

  const handleGoBackToDashboard = useCallback(() => {
    setSelectedVideoId(null);
    setPendingReviewFocus(null);
    setPendingProjectFocus(null);
    navigate('/dashboard');
  }, [navigate]);

  const handleNotificationClick = useCallback(
    (notification: NotificationRecord) => {
      void markNotificationRead({ notificationId: notification.id as Id<'notifications'> }).catch((error) => {
        console.error('Failed to mark notification read', error);
      });

      if (notification.type === 'mention' && notification.videoId) {
        setPendingReviewFocus({
          videoId: notification.videoId,
          commentId: notification.commentId ?? null,
          frame: notification.frame ?? null,
          mentionText: notification.mentionText ?? null,
        });
        navigate(`/review/${notification.videoId}`);
        return;
      }

      if (notification.type === 'share') {
        if (notification.projectId) {
          setPendingProjectFocus({ projectId: notification.projectId, message: notification.message });
          navigate(`/project/${notification.projectId}`);
          return;
        }
        if (notification.videoId) {
          setPendingReviewFocus({ videoId: notification.videoId });
          navigate(`/review/${notification.videoId}`);
          return;
        }
      }

      if (notification.videoId) {
        setPendingReviewFocus({
          videoId: notification.videoId,
          commentId: notification.commentId ?? null,
          frame: notification.frame ?? null,
          mentionText: notification.mentionText ?? null,
        });
        navigate(`/review/${notification.videoId}`);
        return;
      }

      if (notification.projectId) {
        setPendingProjectFocus({ projectId: notification.projectId, message: notification.message });
        navigate(`/project/${notification.projectId}`);
        return;
      }

      navigate('/dashboard');
    },
    [markNotificationRead, navigate],
  );

  const handleMarkAllNotificationsRead = useCallback(() => {
    void markAllNotificationsRead({}).catch((error) => {
      console.error('Failed to mark notifications read', error);
    });
  }, [markAllNotificationsRead]);

  const preference = userSettings?.workspace.theme ?? 'system';
  const isDark = useThemePreference(preference);

  return (
    // Rely on body.theme-dark / body.theme-light from useThemePreference + index.css
    <div className={"min-h-screen flex flex-col transition-colors"}>
      <SignedOut>
        {isMiroEmbed ? (
          <div className="min-h-screen w-full px-4 py-6">
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/40 p-5 text-center shadow-2xl backdrop-blur">
              <div className="mb-2 flex items-center justify-center gap-2 text-white">
                <img src={logo} alt="Reffo" className="h-7 w-auto" />
                <span className="text-base font-semibold">Reffo Reviewer</span>
              </div>
              <p className="mb-5 text-xs text-white/60">Fast, focused video feedback.</p>
              <div className="flex flex-col items-stretch gap-3">
                <button
                  onClick={handleGoogleSignIn}
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-white/90"
                >
                  <img src={googleLogo} alt="Google" className="h-5 w-5" />
                  Continue with Google
                </button>
              </div>
              <p className="mt-4 text-[11px] text-white/40">By continuing you agree to our Terms and Privacy Policy.</p>
            </div>
          </div>
        ) : (
          <div className="min-h-screen flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-xl space-y-8">
              <div className="text-center">
                <div className="mx-auto mb-2 flex items-center justify-center gap-2">
                  <img src={logo} alt="Reffo" className="h-8 w-auto" />
                  <h1 className="text-2xl font-semibold text-white sm:text-3xl">Reffo Reviewer</h1>
                </div>
                <p className="text-sm text-white/70 sm:text-base">Fast, focused video feedback for teams.</p>
              </div>
              <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                <div className="space-y-3">
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-white/90"
                  >
                    <img src={googleLogo} alt="Google" className="h-5 w-5" />
                    Continue with Google
                  </button>
                </div>
                <p className="mt-4 text-center text-xs text-white/40">By continuing you agree to our Terms of Service and Privacy Policy.</p>
              </div>
              <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                  <p className="text-xs uppercase text-white/40">Trusted workflows</p>
                  <p className="mt-1 text-white/80">Import, comment, and ship faster with a pipeline built for editors, directors, and producers.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                  <p className="text-xs uppercase text-white/40">Launch ready</p>
                  <p className="mt-1 text-white/80">Invite your crew in minutes and keep feedback in sync across every project.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </SignedOut>
      <SignedIn>
        {currentUser === undefined || isEnsuringUser ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="flex flex-col items-center gap-4 text-white/70">
              <lottie-player
                src={lottieLoader}
                autoplay
                loop
                style={{ width: '140px', height: '140px' }}
              ></lottie-player>
              <p>Linking your account…</p>
            </div>
          </div>
        ) : currentUser === null ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-black/70 border border-white/10 rounded-3xl p-10 w-full max-w-md text-center space-y-4 shadow-2xl backdrop-blur">
              <h2 className="text-xl font-semibold text-white">Sync error</h2>
              <p className="text-white/60">{ensureError ?? 'We could not connect your account right now.'}</p>
              <button
                onClick={handleRetryEnsureUser}
                className="w-full bg-white text-black font-semibold py-2.5 rounded-full transition hover:bg-white/90"
                disabled={isEnsuringUser}
              >
                Try again
              </button>
            </div>
          </div>
        ) : dataLoading ? (
          <div className="flex-1 flex items-center justify-center text-white/70">
            <lottie-player
              src={lottieLoader}
              autoplay
              loop
              style={{ width: '140px', height: '140px' }}
            ></lottie-player>
          </div>
        ) : view === 'reviewer' && currentVideo ? (
          <VideoReviewer
            key={currentVideo.id}
            video={currentVideo}
            sourceUrl={reviewSourceUrl ?? undefined}
            onGoBack={handleGoBackToDashboard}
            theme={preference}
            initialFocus={activeReviewFocus}
            onConsumeInitialFocus={() => {
              setPendingReviewFocus((focus) => {
                if (!focus) return null;
                return focus.videoId === currentVideo.id ? null : focus;
              });
            }}
          />
        ) : (
          <div className="min-h-screen flex flex-col">
            <AppHeader
              active={view === 'profile' ? 'profile' : 'dashboard'}
              onNavigate={(target) => {
                if (target === 'dashboard') navigate('/dashboard');
                else navigate('/profile');
              }}
              user={{
                name: currentUser.name ?? null,
                email: currentUser.email,
                avatar: currentUser.avatar ?? null,
              }}
              isDark={isDark}
              notifications={notifications ?? []}
              hasUnreadNotifications={hasUnreadNotifications}
              onNotificationClick={handleNotificationClick}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            />
            <main className="flex-1 overflow-y-auto px-6 py-10 lg:px-12">
              {view === 'profile' ? (
                <ProfileSettings
                  user={{
                    name: currentUser.name ?? null,
                    email: currentUser.email,
                    avatar: currentUser.avatar ?? null,
                  }}
                  projects={projects}
                  onBack={() => navigate('/dashboard')}
                />
              ) : view === 'project' && activeProjectId ? (
                <ProjectWorkspace
                  project={projects.find((p) => p.id === activeProjectId)!}
                  videos={videos}
                  theme={preference}
                  onBack={() => navigate('/dashboard')}
                  onStartReview={handleStartReview}
                  highlightMessage={activeProjectHighlight ? activeProjectHighlight.message ?? 'This project was shared with you.' : null}
                  onDismissHighlight={() => {
                    setPendingProjectFocus((focus) => {
                      if (!focus) return null;
                      return focus.projectId === activeProjectId ? null : focus;
                    });
                  }}
                />
              ) : (
                <Dashboard
                  user={{
                    name: currentUser.name ?? null,
                    email: currentUser.email,
                    avatar: currentUser.avatar ?? null,
                  }}
                  videos={videos}
                  projects={projects}
                  onStartReview={handleStartReview}
                  onCreateProject={handleCreateProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                  onSetVideoProject={handleSetVideoProject}
                  onRenameVideo={handleRenameVideo}
                  onCompleteUpload={handleCompleteUpload}
                  onRemoveVideo={handleRemoveVideo}
                  onGenerateUploadUrl={generateUploadUrl}
                  onGetDownloadUrl={getDownloadUrl}
                  onOpenProject={(projectId) => {
                    setActiveProjectId(projectId);
                    navigate(`/project/${projectId}`);
                  }}
                />
              )}
            </main>
          </div>
        )}
      </SignedIn>
    </div>
  );
};

export default App;

interface AppHeaderProps {
  active: 'dashboard' | 'profile';
  onNavigate: (view: 'dashboard' | 'profile') => void;
  user: {
    name?: string | null;
    email: string;
    avatar?: string | null;
  };
  notifications: NotificationRecord[];
  hasUnreadNotifications: boolean;
  onNotificationClick: (notification: NotificationRecord) => void;
  onMarkAllNotificationsRead: () => void;
}

const AppHeader: React.FC<AppHeaderProps & { isDark: boolean }> = ({
  active,
  onNavigate,
  user,
  isDark,
  notifications,
  hasUnreadNotifications,
  onNotificationClick,
  onMarkAllNotificationsRead,
}) => {
  const { signOut } = useClerk();
  const settingsDoc = useQuery(api.settings.getOrNull, {});
  const updateSettings = useMutation(api.settings.update);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const displayNotifications = notifications ?? [];
  const base = user.name || user.email;
  const initials = base
    .split(' ')
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  return (
    <header className={`sticky top-0 z-30 backdrop-blur border-b ${isDark ? 'border-white/10 bg-black/20 text-white' : 'border-gray-200 bg-white/80 text-gray-900'}`}>
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Reffo" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-white/80">Reffo Studio</span>
          </div>
          <nav className="hidden items-center gap-3 text-sm text-white/60 md:flex">
            <HeaderNavButton
              label="Dashboard"
              active={active === 'dashboard'}
              onClick={() => onNavigate('dashboard')}
              isDark={isDark}
            />
            <HeaderNavButton
              label="Profile"
              active={active === 'profile'}
              onClick={() => onNavigate('profile')}
              isDark={isDark}
            />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className={isDark ? 'rounded-full border border-white/20 bg-black/30 p-2 text-white/80 hover:text-white' : 'rounded-full border border-gray-200 bg-white p-2 text-gray-700 hover:text-gray-900'}
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>
            {hasUnreadNotifications && (
              <span className="absolute -right-1 -top-1 inline-block h-2 w-2 rounded-full bg-red-500" />
            )}
            {notifOpen && (
              <div className={`absolute right-0 mt-2 w-80 rounded-xl border shadow-2xl backdrop-blur ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
                <div className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className={isDark ? 'text-white/70' : 'text-gray-600'}>Notifications</span>
                  <button
                    onClick={() => {
                      setNotifOpen(false);
                      onMarkAllNotificationsRead();
                    }}
                    disabled={!hasUnreadNotifications}
                    className={`${hasUnreadNotifications ? (isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900') : (isDark ? 'text-white/30 cursor-default' : 'text-gray-300 cursor-default')}`}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-auto py-1">
                  {displayNotifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => {
                        setNotifOpen(false);
                        onNotificationClick(notification);
                      }}
                      className={`w-full px-3 py-2 text-left transition ${
                        notification.readAt
                          ? isDark
                            ? 'text-white/60 hover:bg-white/10'
                            : 'text-gray-600 hover:bg-gray-50'
                          : isDark
                            ? 'bg-white/10 text-white hover:bg-white/20'
                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{notification.message}</p>
                          {notification.mentionText && (
                            <p className={`mt-1 text-xs line-clamp-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              “{notification.mentionText}”
                            </p>
                          )}
                        </div>
                        <span className={`shrink-0 text-[11px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))}
                  {displayNotifications.length === 0 && (
                    <div className={isDark ? 'px-3 py-6 text-center text-white/50' : 'px-3 py-6 text-center text-gray-500'}>No notifications</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              const next: ThemePref = isDark ? 'light' : 'dark';
              applyTheme(next);
              try {
                await updateSettings({
                  workspace: {
                    theme: next,
                    autoShareGroupIds: settingsDoc?.workspace.autoShareGroupIds ?? [],
                    ...(settingsDoc?.workspace.defaultProjectId
                      ? { defaultProjectId: settingsDoc.workspace.defaultProjectId }
                      : {}),
                  },
                });
              } catch {}
            }}
            className={isDark
              ? 'rounded-full border border-white/20 bg-black/30 p-2 text-white/80 hover:text-white'
              : 'rounded-full border border-gray-200 bg-white p-2 text-gray-700 hover:text-gray-900'}
            aria-label="Toggle theme"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="hidden text-right text-xs text-white/60 sm:block">
            <p className="font-semibold text-white/80">{user.name ?? user.email}</p>
            <p>{user.email}</p>
          </div>
          <button
            onClick={() => onNavigate('profile')}
            className={isDark ? 'flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-sm font-semibold text-white hover:border-white/40' : 'flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:border-gray-300'}
            aria-label="Open profile"
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.email} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </button>
          <button
            onClick={() => signOut()}
            className={isDark ? 'rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white/70 hover:text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900'}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

interface HeaderNavButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const HeaderNavButton: React.FC<HeaderNavButtonProps & { isDark?: boolean }> = ({ label, active, onClick, isDark }) => (
  <button
    onClick={onClick}
    className={`rounded-full px-3 py-1.5 transition ${
      active
        ? isDark
          ? 'bg-black/30 text-white'
          : 'bg-black/5 text-gray-900'
        : isDark
          ? 'text-white/70 hover:text-white'
          : 'text-gray-600 hover:text-gray-900'
    }`}
  >
    {label}
  </button>
);
