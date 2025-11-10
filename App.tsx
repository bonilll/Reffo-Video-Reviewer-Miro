import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { SignedIn, SignedOut, useUser, useClerk, useSignIn, useSignUp } from '@clerk/clerk-react';
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
  contextTitle: string | null;
  previewUrl: string | null;
  shareToken: string | null;
  displayTitle?: string;
  displaySubtitle?: string | null;
  displayPreview?: string | null;
  typeLabel?: string;
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

const getClerkErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'errors' in (error as any)) {
    const clerkErrors = (error as any).errors;
    if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
      return clerkErrors[0]?.longMessage || clerkErrors[0]?.message || 'Unable to complete the request.';
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unable to complete the request.';
};

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
  const [isMiroEmbed, setIsMiroEmbed] = useState(false); // legacy, no longer used
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const MIRO_SESSION_STORAGE_KEY = 'reffo_miro_session_id'; // legacy, no longer used
  const { isSignedIn } = useUser();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();
  const { setActive } = useClerk();

  const currentUser = useQuery(api.users.current, isSignedIn ? {} : undefined);
  const userSettings = useQuery(api.settings.getOrNull, currentUser ? {} : undefined);
  const projectsQuery = useQuery(api.projects.list, currentUser ? {} : undefined);
  const videosQuery = useQuery(api.videos.list, currentUser ? { projectId: undefined } : undefined);
  const sharedProjectsQuery = useQuery(api.shares.projectsSharedWithMe, currentUser ? {} : undefined);
  const sharedVideosQuery = useQuery(api.shares.videosSharedWithMe, currentUser ? {} : undefined);
  const notifications = useQuery(api.notifications.list, {}) as NotificationRecord[] | undefined;

  // Build projects/videos and quick lookup maps before using in notifications
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
          isOwnedByCurrentUser: true,
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
          isOwnedByCurrentUser: false,
        }))
      : [];
    const byId = new Map<string, Video>();
    [...own, ...shared].forEach((v) => {
      if (!byId.has(v.id)) {
        byId.set(v.id, v);
      }
    });
    return Array.from(byId.values());
  }, [videosQuery, sharedVideosQuery]);

  const videoMap = useMemo(() => {
    const map = new Map<string, Video>();
    videos.forEach((video) => map.set(video.id, video));
    return map;
  }, [videos]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((project) => map.set(project.id, project));
    return map;
  }, [projects]);

  const notificationsForDisplay = useMemo(() => {
    if (!notifications) return [] as NotificationRecord[];
    return notifications.map((notification) => {
      const video = notification.videoId ? videoMap.get(notification.videoId) : undefined;
      const project = notification.projectId ? projectMap.get(notification.projectId) : undefined;
      const contextTitle = notification.contextTitle ?? video?.title ?? project?.name ?? null;
      const preview = notification.previewUrl ?? video?.thumbnailUrl ?? null;
      const typeLabel = notification.type === 'mention' ? 'Mention' : 'Share';
      const displayTitle =
        notification.type === 'mention'
          ? contextTitle
            ? `Mention in ${contextTitle}`
            : 'You were mentioned'
          : contextTitle
            ? `Shared: ${contextTitle}`
            : notification.message;
      const displaySubtitle =
        notification.type === 'mention'
          ? notification.mentionText ?? notification.message
          : notification.message;
      return {
        ...notification,
        displayTitle,
        displaySubtitle,
        displayPreview: preview,
        contextTitle,
        typeLabel,
      } as NotificationRecord;
    });
  }, [notifications, videoMap, projectMap]);

  // Share-link handling
  const shareToken = useMemo(() => (route.name === 'share' ? route.token : null), [route]);
  const shareResolution = useQuery(api.shares.resolveToken, shareToken ? { token: shareToken } : undefined);
  const shareVideo = useQuery(
    api.videos.getByShareToken,
    shareToken && shareResolution && (shareResolution as any)?.videoId ? { token: shareToken } : undefined
  );
  const shareAccessLoggedRef = useRef<string | null>(null);

  const ensureUser = useMutation(api.users.ensure);
  const ensuredRef = useRef(false);
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
  const recordShareAccess = useMutation(api.notifications.recordShareAccess);
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
      ensuredRef.current = false;
      return;
    }

    if (currentUser === undefined) {
      return;
    }

    if (currentUser !== null) {
      setEnsureError(null);
      ensuredRef.current = true;
      return;
    }

    if (isEnsuringUser || ensuredRef.current) {
      return;
    }

    void attemptEnsureUser();
  }, [isSignedIn, currentUser, isEnsuringUser, attemptEnsureUser]);

  const handleRetryEnsureUser = useCallback(() => {
    if (!isEnsuringUser) {
      void attemptEnsureUser();
    }
  }, [attemptEnsureUser, isEnsuringUser]);

  

  const dataLoading = Boolean(currentUser) && (projectsQuery === undefined || videosQuery === undefined);

  // Legacy Miro/OAuth popup flows removed for a simpler, robust login.

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

  // Pick up deep links like /review/:id?comment=<commentId>&frame=<n>
  useEffect(() => {
    if (route.name !== 'review') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const commentId = params.get('comment') || params.get('c');
      const frameStr = params.get('frame') || params.get('f');
      const frame = frameStr ? Number(frameStr) : null;
      if (commentId || (typeof frame === 'number' && !Number.isNaN(frame))) {
        setPendingReviewFocus({
          videoId: route.id,
          commentId: commentId ?? null,
          frame: typeof frame === 'number' && !Number.isNaN(frame) ? frame : null,
          mentionText: null,
        });
      }
    } catch {}
  }, [route]);
  // Removed popup-based OAuth; rely on standard redirect flows.

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

  const handleSwitchAuthMode = useCallback((mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setAuthError(null);
    setVerificationCode('');
    setPendingVerificationEmail(null);
  }, []);

  const handleEmailSignIn = useCallback(async () => {
    if (!isSignInLoaded || !signIn) return;
    const identifier = authEmail.trim();
    if (!identifier || !authPassword) {
      setAuthError('Enter your email and password to continue.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await signIn.create({ identifier, password: authPassword });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        setAuthError('Additional verification is required. Please complete sign-in via the Clerk modal.');
      }
    } catch (error) {
      setAuthError(getClerkErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, isSignInLoaded, signIn, setActive]);

  const handleEmailSignUp = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) return;
    const emailAddress = authEmail.trim();
    if (!emailAddress || !authPassword) {
      setAuthError('Enter an email and password to create your account.');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords must match.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signUp.create({ emailAddress, password: authPassword });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerificationEmail(emailAddress);
      setVerificationCode('');
      setAuthMode('verify');
    } catch (error) {
      setAuthError(getClerkErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, authConfirmPassword, isSignUpLoaded, signUp]);

  const handleEmailVerification = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) return;
    const code = verificationCode.trim();
    if (!code) {
      setAuthError('Enter the verification code from your email.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        setAuthError('Unable to verify the code. Please try again.');
      }
    } catch (error) {
      setAuthError(getClerkErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }, [isSignUpLoaded, signUp, verificationCode, setActive]);

  const handleResendVerification = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) return;
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setAuthError(null);
    } catch (error) {
      setAuthError(getClerkErrorMessage(error));
    }
  }, [isSignUpLoaded, signUp]);

  const handleAuthSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (authMode === 'signin') {
        void handleEmailSignIn();
      } else if (authMode === 'signup') {
        void handleEmailSignUp();
      } else {
        void handleEmailVerification();
      }
    },
    [authMode, handleEmailSignIn, handleEmailSignUp, handleEmailVerification],
  );

  const renderEmailAuthSection = (compact = false) => {
    const dividerTextClass = compact ? 'text-[10px]' : 'text-[11px]';
    const inputClass = compact
      ? 'w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/60 focus:border-white/40 focus:outline-none'
      : 'w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-white/60 focus:border-white/50 focus:outline-none';
    const buttonClass = compact
      ? 'w-full rounded-xl bg-white/90 py-2.5 text-sm font-semibold text-black transition hover:bg-white'
      : 'w-full rounded-full bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90';
    const secondaryButtonClass = compact
      ? 'text-[11px] font-semibold text-white hover:text-white/80'
      : 'text-xs font-semibold text-white hover:text-white/80';
    const submitDisabled = authMode === 'signin'
      ? !authEmail.trim() || !authPassword || authLoading
      : authMode === 'signup'
        ? !authEmail.trim() || !authPassword || !authConfirmPassword || authLoading
        : false;
    const verificationDisabled = authLoading || verificationCode.trim().length === 0;
    const sectionSpacing = compact ? 'mt-4 space-y-3' : 'mt-6 space-y-4';

    return (
      <div className={sectionSpacing}>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/15" />
          <span className={`text-white/60 uppercase tracking-[0.35em] ${dividerTextClass}`}>or email</span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <form onSubmit={handleAuthSubmit} className="space-y-3">
          {authMode === 'verify' ? (
            <>
              <p className="text-xs text-white/70">
                We sent a 6-digit code to {pendingVerificationEmail ?? authEmail}. Enter it below to finish creating your account.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                className={`${inputClass} tracking-widest text-center text-base font-semibold uppercase`}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="123456"
              />
              <button type="submit" className={buttonClass} disabled={verificationDisabled}>
                {authLoading ? 'Verifying…' : 'Verify and continue'}
              </button>
              <div className="flex items-center justify-between text-[11px] text-white/60">
                <button type="button" className="underline underline-offset-4" onClick={handleResendVerification} disabled={authLoading}>
                  Resend code
                </button>
                <button type="button" className="underline underline-offset-4" onClick={() => handleSwitchAuthMode('signin')}>
                  Use a different email
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className={compact ? 'text-xs text-white/70' : 'text-sm text-white/80'} htmlFor={`auth-email-${compact ? 'compact' : 'full'}`}>
                  Email
                </label>
                <input
                  id={`auth-email-${compact ? 'compact' : 'full'}`}
                  type="email"
                  autoComplete="email"
                  className={inputClass}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@studio.com"
                />
              </div>
              <div className="space-y-1">
                <label className={compact ? 'text-xs text-white/70' : 'text-sm text-white/80'} htmlFor={`auth-password-${compact ? 'compact' : 'full'}`}>
                  Password
                </label>
                <input
                  id={`auth-password-${compact ? 'compact' : 'full'}`}
                  type="password"
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  className={inputClass}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {authMode === 'signup' && (
                <div className="space-y-1">
                  <label className={compact ? 'text-xs text-white/70' : 'text-sm text-white/80'} htmlFor={`auth-confirm-${compact ? 'compact' : 'full'}`}>
                    Confirm password
                  </label>
                  <input
                    id={`auth-confirm-${compact ? 'compact' : 'full'}`}
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
              )}
              <button type="submit" className={buttonClass} disabled={submitDisabled}>
                {authLoading ? 'Please wait…' : authMode === 'signin' ? 'Sign in with email' : 'Create free account'}
              </button>
            </>
          )}
          {authError && <p className="text-xs text-rose-300">{authError}</p>}
        </form>
        {authMode !== 'verify' && (
          <p className="text-center text-xs text-white/60">
            {authMode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => handleSwitchAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
            >
              {authMode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    );
  };

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

  useEffect(() => {
    if (!shareToken) return;
    if (!shareResolution) return;
    if (!currentUser) return;
    const shareMeta = shareResolution as any;
    const targetVideoId = shareMeta?.videoId ?? (shareVideo as any)?.id ?? null;
    const targetProjectId = shareMeta?.projectId ?? null;
    if (!targetVideoId && !targetProjectId) return;
    const key = `${shareToken}|${currentUser._id}`;
    if (shareAccessLoggedRef.current === key) return;
    shareAccessLoggedRef.current = key;
    void recordShareAccess({
      videoId: targetVideoId ? (targetVideoId as Id<'videos'>) : undefined,
      projectId: targetProjectId ? (targetProjectId as Id<'projects'>) : undefined,
      shareToken,
    }).catch((error) => {
      console.error('Failed to record share access', error);
    });
  }, [shareToken, shareResolution, shareVideo, currentUser, recordShareAccess]);

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

  const preference: ThemePref = (userSettings?.workspace.theme ?? 'system') as ThemePref;
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
                {renderEmailAuthSection(true)}
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
                  {renderEmailAuthSection()}
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
              notifications={notificationsForDisplay}
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
                  projects={projects}
                  videos={videos}
                  theme={preference}
                  onBack={() => navigate('/dashboard')}
                  onStartReview={handleStartReview}
                  onRenameVideo={handleRenameVideo}
                  onSetVideoProject={handleSetVideoProject}
                  onRemoveVideo={handleRemoveVideo}
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
                  ownedProjectIds={(projectsQuery ?? []).map(p => p._id as unknown as string)}
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
  const { signOut, setActive } = useClerk();
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
                  {displayNotifications.map((notification) => {
                    const preview = notification.displayPreview ?? notification.previewUrl ?? null;
                    const badgeLabel = notification.typeLabel ?? (notification.type === 'mention' ? 'Mention' : 'Share');
                    const fallbackInitial = (notification.contextTitle ?? notification.displayTitle ?? notification.message ?? 'R')
                      .charAt(0)
                      .toUpperCase();
                    return (
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
                        <div className="flex items-start gap-3">
                          <div className={`h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border ${isDark ? 'border-white/20 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
                            {preview ? (
                              <img src={preview} alt={notification.contextTitle ?? notification.message ?? 'Preview'} className="h-full w-full object-cover" />
                            ) : (
                              <div className={`flex h-full w-full items-center justify-center text-sm font-semibold ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                                {fallbackInitial}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{badgeLabel}</p>
                            <p className="text-sm font-semibold truncate">{notification.displayTitle ?? notification.message}</p>
                            {notification.displaySubtitle && (
                              <p className={`mt-0.5 text-xs line-clamp-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                                {notification.type === 'mention' ? `“${notification.displaySubtitle}”` : notification.displaySubtitle}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 text-[11px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
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
            onClick={async () => {
              try { localStorage.removeItem('reffo_miro_session_id'); } catch {}
              await signOut();
            }}
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
