import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SignedIn, SignedOut, SignInButton, useUser, useClerk } from '@clerk/clerk-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from './convex/_generated/api';
import VideoReviewer from './components/VideoReviewer';
import Dashboard from './components/Dashboard';
import ProfileSettings from './components/ProfileSettings';
import ProjectWorkspace from './components/ProjectWorkspace';
import { Project, Video } from './types';
import type { Id } from './convex/_generated/dataModel';
import logo from './assets/logo.svg';
import { useThemePreference, applyTheme, ThemePref } from './useTheme';
import { Sun, Moon } from 'lucide-react';

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

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'reviewer' | 'profile' | 'project'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sharedSelectedVideo, setSharedSelectedVideo] = useState<Video | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [reviewSourceUrl, setReviewSourceUrl] = useState<string | null>(null);
  const [isEnsuringUser, setIsEnsuringUser] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const { isSignedIn } = useUser();

  const currentUser = useQuery(api.users.current, isSignedIn ? {} : undefined);
  const userSettings = useQuery(api.settings.getOrNull, currentUser ? {} : undefined);
  const projectsQuery = useQuery(api.projects.list, currentUser ? {} : undefined);
  const videosQuery = useQuery(api.videos.list, currentUser ? { projectId: undefined } : undefined);
  const sharedProjectsQuery = useQuery(api.shares.projectsSharedWithMe, currentUser ? {} : undefined);
  const sharedVideosQuery = useQuery(api.shares.videosSharedWithMe, currentUser ? {} : undefined);

  // Share-link handling
  const shareToken = useMemo(() => {
    const m = window.location.pathname.match(/^\/share\/(.+)$/);
    return m ? m[1] : null;
  }, []);
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

  const currentVideo = useMemo(() => {
    if (!selectedVideoId) return null;
    return videos.find((video) => video.id === selectedVideoId) ?? sharedSelectedVideo;
  }, [videos, selectedVideoId, sharedSelectedVideo]);

  const handleStartReview = useCallback(
    async (video: Video) => {
      setSelectedVideoId(video.id);
      setSharedSelectedVideo(null);
      setView('reviewer');
      setReviewSourceUrl(null);
      try {
        if (video.storageKey) {
          const url = await getDownloadUrl({ storageKey: video.storageKey });
          setReviewSourceUrl(url);
        }
      } catch (e) {
        console.warn('Prefetch playback URL failed, will fallback in reviewer', e);
      }
      try {
        await updateVideoMetadata({
          videoId: video.id as Id<'videos'>,
          lastReviewedAt: Date.now(),
        });
      } catch (error) {
        console.error('Failed to update last reviewed timestamp', error);
      }
    },
    [updateVideoMetadata, getDownloadUrl]
  );

  // If landing on /share/:token, open the linked review
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

  const handleGoBackToDashboard = useCallback(() => {
    setView('dashboard');
    setSelectedVideoId(null);
  }, []);

  const preference = userSettings?.workspace.theme ?? 'system';
  const isDark = useThemePreference(preference);

  return (
    // Rely on body.theme-dark / body.theme-light from useThemePreference + index.css
    <div className={"min-h-screen flex flex-col transition-colors"}>
      <SignedOut>
        <div className="min-h-screen">
          <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-12 px-6 py-16 lg:flex-row lg:py-24">
            <div className="w-full space-y-8">
              <div className="flex items-center gap-3 text-sm text-white/60">
                <img src={logo} alt="Reffo" className="h-8 w-auto" />
                <span className="uppercase tracking-widest text-[10px] text-white/40">Collaborative review suite</span>
              </div>
              <div className="space-y-6">
                <h1 className="text-4xl font-semibold text-white sm:text-5xl">
                  Feedback that moves productions forward.
                </h1>
                <p className="text-base text-white/70 sm:text-lg">
                  Reffo centralises your edits, comments, and approvals in one secure workspace built for fast-paced video teams.
                </p>
                <ul className="space-y-3 text-sm text-white/70">
                  <li>• Frame-accurate comments synced with cloud storage.</li>
                  <li>• Projects, permissions, and delivery-ready share links.</li>
                  <li>• Designed for studios collaborating across time zones.</li>
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <SignInButton mode="modal" signInOptions={{ strategy: 'oauth_google' }}>
                  <button className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-white/90">
                    <img src="/assets/icon-192x192.png" alt="Google" className="h-5 w-5" />
                    Continue with Google
                  </button>
                </SignInButton>
                <SignInButton mode="modal">
                  <button className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition hover:text-white">
                    Sign in with email
                  </button>
                </SignInButton>
              </div>
              <p className="text-xs text-white/40">
                By continuing you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <lottie-player
                  src="/assets/animations/imageloader.json"
                  autoplay
                  loop
                  mode="normal"
                  style={{ width: '100%', height: '280px' }}
                ></lottie-player>
              </div>
              <div className="mt-6 space-y-3 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase text-white/40">Trusted workflows</p>
                  <p className="mt-1 text-white/80">Import, comment, and ship faster with a pipeline built for editors, directors, and producers.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase text-white/40">Launch ready</p>
                  <p className="mt-1 text-white/80">Invite your crew in minutes and keep feedback in sync across every project.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        {currentUser === undefined || isEnsuringUser ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="flex flex-col items-center gap-4 text-white/70">
              <lottie-player
                src="/assets/animations/loader.json"
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
              src="/assets/animations/loader.json"
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
          />
        ) : (
          <div className="min-h-screen flex flex-col">
            <AppHeader
              active={view === 'profile' ? 'profile' : 'dashboard'}
              onNavigate={(target) => setView(target)}
              user={{
                name: currentUser.name ?? null,
                email: currentUser.email,
                avatar: currentUser.avatar ?? null,
              }}
              isDark={isDark}
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
                  onBack={() => setView('dashboard')}
                />
              ) : view === 'project' && activeProjectId ? (
                <ProjectWorkspace
                  project={projects.find((p) => p.id === activeProjectId)!}
                  videos={videos}
                  theme={preference}
                  onBack={() => setView('dashboard')}
                  onStartReview={handleStartReview}
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
                    setView('project');
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
}

const AppHeader: React.FC<AppHeaderProps & { isDark: boolean }> = ({ active, onNavigate, user, isDark }) => {
  const { signOut } = useClerk();
  const settingsDoc = useQuery(api.settings.getOrNull, {});
  const updateSettings = useMutation(api.settings.update);
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
