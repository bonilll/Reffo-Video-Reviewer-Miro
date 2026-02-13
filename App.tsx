import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  SignedIn,
  SignedOut,
  useUser,
  useClerk,
  useSignIn,
  useSignUp,
  AuthenticateWithRedirectCallback,
} from '@clerk/clerk-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from './convex/_generated/api';
import VideoReviewer from './components/VideoReviewer';
import Dashboard from './components/Dashboard';
import ProfileSettings from './components/ProfileSettings';
import EditorPage from './components/editor/EditorPage';
import ProjectWorkspace from './components/ProjectWorkspace';
import LibraryPage from './components/LibraryPage';
import { CurrentUserProfile, Project, Video } from './types';
import type { Id } from './convex/_generated/dataModel';
import logo from './assets/logo.svg';
import googleLogo from './assets/google.svg';
import { useThemePreference, ThemePref } from './useTheme';
import { Bell, Menu, X } from 'lucide-react';
import { useConsent } from './contexts/ConsentContext';
import PrivacyPolicy from './components/legal/PrivacyPolicy';
import CookiePolicy from './components/legal/CookiePolicy';
import TermsOfUse from './components/legal/TermsOfUse';
import { CookieSettingsTrigger } from './components/legal/CookieSettingsTrigger';
import { LanguageSwitcher } from './components/legal/LanguageSwitcher';
import { BoardPageWrapper } from './components/board/BoardPageWrapper';
// Lottie assets as static URLs to ensure they are included in Vite build
import lottieLoaderRaw from './assets/animations/Loader.json?raw';
import lottieImageLoaderRaw from './assets/animations/imageloader.json?raw';
const lottieLoader = `data:application/json;charset=utf-8,${encodeURIComponent(lottieLoaderRaw as unknown as string)}`;
const lottieImageLoader = `data:application/json;charset=utf-8,${encodeURIComponent(lottieImageLoaderRaw as unknown as string)}`;

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
  reviewId?: string;
};

type LegalPage = 'privacy' | 'cookies' | 'terms';

type Route =
  | { name: 'home' }
  | { name: 'workspaces' }
  | { name: 'library' }
  | { name: 'profile' }
  | { name: 'ssoCallback' }
  | { name: 'project'; id: string }
  | { name: 'review'; id: string }
  | { name: 'board'; id: string }
  | { name: 'share'; token: string }
  | { name: 'legal'; page: LegalPage }
  | { name: 'edit'; id: string };

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
  if (pathname === '/workspaces') return { name: 'workspaces' };
  // Legacy path
  if (pathname === '/dashboard') return { name: 'workspaces' };
  if (pathname === '/sso-callback') return { name: 'ssoCallback' };
  if (pathname === '/library') return { name: 'library' };
  if (pathname === '/profile') return { name: 'profile' };
  if (pathname === '/privacy' || pathname === '/privacy-policy') return { name: 'legal', page: 'privacy' };
  if (pathname === '/cookie-policy' || pathname === '/cookies') return { name: 'legal', page: 'cookies' };
  if (pathname === '/terms' || pathname === '/terms-of-use') return { name: 'legal', page: 'terms' };
  const editMatch = pathname.match(/^\/edit\/([^\/?#]+)/);
  if (editMatch) return { name: 'edit', id: editMatch[1] };
  const boardMatch = pathname.match(/^\/board\/([^\/?#]+)/);
  if (boardMatch) return { name: 'board', id: boardMatch[1] };
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

type SeoInput = {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
};

const setSeo = (input: SeoInput) => {
  const setMeta = (selector: string, content: string) => {
    const el = document.head.querySelector(selector) as HTMLMetaElement | null;
    if (el) el.setAttribute("content", content);
  };
  const setLink = (selector: string, href: string) => {
    const el = document.head.querySelector(selector) as HTMLLinkElement | null;
    if (el) el.setAttribute("href", href);
  };

  if (typeof document !== "undefined") {
    const absoluteIcon = (() => {
      try {
        const u = new URL(input.canonicalUrl);
        return `${u.origin}/icon.svg`;
      } catch {
        return "/icon.svg";
      }
    })();

    document.title = input.title;
    setMeta('meta[data-seo="description"]', input.description);
    setMeta('meta[data-seo="og:title"]', input.title);
    setMeta('meta[data-seo="og:description"]', input.description);
    setMeta('meta[data-seo="og:url"]', input.canonicalUrl);
    setMeta('meta[data-seo="og:image"]', absoluteIcon);
    setMeta('meta[data-seo="twitter:title"]', input.title);
    setMeta('meta[data-seo="twitter:description"]', input.description);
    setMeta('meta[data-seo="twitter:image"]', absoluteIcon);
    setMeta('meta[data-seo="robots"]', input.robots);
    setLink('link[data-seo="canonical"]', input.canonicalUrl);
  }
};

const buildCanonicalUrl = (pathname: string) => {
  const base =
    ((import.meta as any)?.env?.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ||
    window.location.origin.replace(/\/$/, "");
  const url = new URL(base + (pathname.startsWith("/") ? pathname : `/${pathname}`));
  return url.toString();
};

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
  const [view, setView] = useState<'workspaces' | 'library' | 'reviewer' | 'profile' | 'project' | 'legal' | 'editor' | 'board'>('workspaces');
  const [legalPage, setLegalPage] = useState<LegalPage>('privacy');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [sharedSelectedVideo, setSharedSelectedVideo] = useState<Video | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [reviewSourceUrl, setReviewSourceUrl] = useState<string | null>(null);
  const [activeCompositionId, setActiveCompositionId] = useState<string | null>(null);
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
  // Access potential UI helpers in a version-tolerant way
  const clerkAny = useClerk() as any;
  const consent = useConsent();
  const consentText = consent.text;

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
          reviewId: (video as any).reviewId ?? undefined,
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
          reviewId: (video as any).reviewId ?? undefined,
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
  const ensureAttemptsRef = useRef(0);
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
        reviewId: payload.reviewId,
      });

      return {
        id: created.id,
        title: created.title,
        src: created.src,
        storageKey: created.storageKey ?? undefined,
        thumbnailUrl: (created as any).thumbnailUrl ?? undefined,
        reviewId: (created as any).reviewId ?? undefined,
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
      ensureAttemptsRef.current = 0;
    } catch (error) {
      console.error('Failed to sync user in Convex', error);
      ensureAttemptsRef.current += 1;
      const message = (error as any)?.data?.message ?? (error as Error)?.message ?? '';
      const isTransient =
        /NOT_AUTHENTICATED/i.test(message) ||
        /No auth provider/i.test(message) ||
        /Server Error/i.test(message);
      if (isTransient && ensureAttemptsRef.current < 3) {
        setTimeout(() => {
          if (!ensuredRef.current) {
            void attemptEnsureUser();
          }
        }, 1000 * ensureAttemptsRef.current);
      } else {
        setEnsureError('Unable to connect your account to the backend. Please try again.');
      }
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
    const oauthParams = {
      strategy: 'oauth_google' as const,
      redirectUrl: '/sso-callback',
      redirectUrlComplete: '/workspaces',
    };

    const shouldUseSignUpFlow = authMode === 'signup';
    if (shouldUseSignUpFlow && (!isSignUpLoaded || !signUp)) return;
    if (!shouldUseSignUpFlow && (!isSignInLoaded || !signIn)) return;

    try {
      setAuthError(null);
      setAuthLoading(true);

      // When user is on sign-up mode, start from signUp resource.
      // This makes the "register with Google" intent explicit.
      if (shouldUseSignUpFlow) {
        await signUp.authenticateWithRedirect(oauthParams);
        return;
      }

      await signIn.authenticateWithRedirect(oauthParams);
    } catch (err) {
      console.error('Google auth redirect failed', err);
      setAuthError(getClerkErrorMessage(err));
      setAuthLoading(false);
    }
  }, [authMode, isSignInLoaded, signIn, isSignUpLoaded, signUp]);

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
        // Handle Client Trust / second factor by delegating to Clerk UI.
        // Prefer opening the modal; fall back to redirect if modal not available.
        try {
          if (clerkAny?.openSignIn) {
            await clerkAny.openSignIn({ redirectUrl: window.location.href, redirectUrlComplete: '/workspaces' });
          } else if (clerkAny?.redirectToSignIn) {
            clerkAny.redirectToSignIn({ redirectUrl: window.location.href, redirectUrlComplete: '/workspaces' });
          }
        } catch (e) {
          // Surface a helpful message if UI can't be opened for any reason
          setAuthError('Additional verification is required. Please complete sign-in in the Clerk window.');
        }
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
      ? 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none'
      : 'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none';
    const buttonClass = compact
      ? 'w-full rounded-xl border border-gray-900 bg-white py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50'
      : 'w-full rounded-full border border-gray-900 bg-white py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50';
    const secondaryButtonClass = compact
      ? 'text-[11px] font-semibold text-gray-700 hover:text-gray-900'
      : 'text-xs font-semibold text-gray-700 hover:text-gray-900';
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
          <span className="h-px flex-1 bg-gray-200" />
          <span className={`text-gray-500 uppercase tracking-[0.35em] ${dividerTextClass}`}>or email</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <form onSubmit={handleAuthSubmit} className="space-y-3">
          {authMode === 'verify' ? (
            <>
              <p className="text-xs text-gray-600">
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
              <div className="flex items-center justify-between text-[11px] text-gray-500">
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
                <label className={compact ? 'text-xs text-gray-600' : 'text-sm text-gray-700'} htmlFor={`auth-email-${compact ? 'compact' : 'full'}`}>
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
                <label className={compact ? 'text-xs text-gray-600' : 'text-sm text-gray-700'} htmlFor={`auth-password-${compact ? 'compact' : 'full'}`}>
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
                  <label className={compact ? 'text-xs text-gray-600' : 'text-sm text-gray-700'} htmlFor={`auth-confirm-${compact ? 'compact' : 'full'}`}>
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
          {authError && <p className="text-xs text-rose-600">{authError}</p>}
        </form>
        {authMode !== 'verify' && (
          <p className="text-center text-xs text-gray-500">
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

  const renderLegalPage = () => {
    let Component: React.ReactNode = null;
    if (legalPage === 'privacy') Component = <PrivacyPolicy />;
    else if (legalPage === 'cookies') Component = <CookiePolicy />;
    else Component = <TermsOfUse />;
    const navItems: Array<{ label: string; page: LegalPage; path: string }> = [
      { label: consentText.footer.privacy, page: 'privacy', path: '/privacy' },
      { label: consentText.footer.cookies, page: 'cookies', path: '/cookie-policy' },
      { label: consentText.footer.terms, page: 'terms', path: '/terms' },
    ];
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-950 to-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <img src={logo} alt="Reffo" className="h-7 w-auto" />
                <span className="text-lg font-semibold">Reffo</span>
              </div>
              <p className="text-xs text-white/60">Legal documentation</p>
            </div>
            <nav className="flex flex-wrap items-center gap-2 text-xs">
              {navItems.map((item) => (
                <button
                  key={item.page}
                  onClick={() => navigate(item.path)}
                  className={`rounded-full px-3 py-1.5 ${
                    legalPage === item.page ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <LanguageSwitcher compact className="ml-2 flex items-center gap-2" />
            </nav>
          </header>
          <div className="py-6">
            {Component}
            <div className="mt-8 text-center">
              <CookieSettingsTrigger variant="footer" className="text-xs underline text-white/80 hover:text-white" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (route.name === 'ssoCallback') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-semibold text-gray-900">Completing sign-in</h1>
            <p className="text-sm text-gray-600">One moment while we finish your Google authentication.</p>
          </div>
          <AuthenticateWithRedirectCallback
            signInFallbackRedirectUrl="/workspaces"
            signInForceRedirectUrl="/workspaces"
            signUpFallbackRedirectUrl="/workspaces"
            signUpForceRedirectUrl="/workspaces"
          />
        </div>
      </div>
    );
  }

  if (view === 'legal') {
    return renderLegalPage();
  }

  // Route → internal state sync
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Route → SEO/meta (SPA-friendly). Private/app routes default to noindex.
  useEffect(() => {
    const defaultTitle = "Reffo";
    const defaultDescription =
      "Fast, focused video feedback for teams. Review, collaborate, and ship faster with Reffo.";
    const canonicalPath =
      route.name === "legal"
        ? route.page === "privacy"
          ? "/privacy-policy"
          : route.page === "cookies"
            ? "/cookie-policy"
            : "/terms-of-use"
        : window.location.pathname;
    const canonicalUrl = buildCanonicalUrl(canonicalPath);

    const isIndexablePublicRoute =
      route.name === "home" ||
      (route.name === "legal" &&
        (route.page === "privacy" || route.page === "cookies" || route.page === "terms"));

    const robots = isIndexablePublicRoute ? "index,follow" : "noindex,nofollow";

    let title = defaultTitle;
    let description = defaultDescription;

    if (route.name === "legal") {
      const pageTitle =
        route.page === "privacy"
          ? "Privacy Policy"
          : route.page === "cookies"
            ? "Cookie Policy"
            : "Terms of Use";
      title = `${pageTitle} | ${defaultTitle}`;
      description = `Read the ${pageTitle.toLowerCase()} for Reffo.`;
    } else if (route.name === "workspaces") {
      title = `Workspaces | ${defaultTitle}`;
    } else if (route.name === "library") {
      title = `Library | ${defaultTitle}`;
    } else if (route.name === "profile") {
      title = `Profile | ${defaultTitle}`;
    } else if (route.name === "project") {
      title = `Project | ${defaultTitle}`;
    } else if (route.name === "review") {
      title = `Review | ${defaultTitle}`;
    } else if (route.name === "board") {
      title = `Board | ${defaultTitle}`;
    } else if (route.name === "edit") {
      title = `Editor | ${defaultTitle}`;
    } else if (route.name === "share") {
      title = `Shared Review | ${defaultTitle}`;
    }

    setSeo({ title, description, canonicalUrl, robots });
  }, [route]);

  useEffect(() => {
    setActiveCompositionId(null);
    if (route.name !== 'board') {
      setActiveBoardId(null);
    }
    // derive view + IDs from route
    if (route.name === 'home') {
      // If signed in, prefer workspaces URL; otherwise keep landing.
      if (isSignedIn) {
        navigate('/workspaces', true);
        return;
      }
      setView('workspaces');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'workspaces') {
      // Redirect legacy /dashboard to /workspaces for backward compatibility.
      if (window.location.pathname === '/dashboard') {
        navigate('/workspaces', true);
        return;
      }
      setView('workspaces');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'library') {
      setView('library');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'profile') {
      setView('profile');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'ssoCallback') {
      setView('workspaces');
      setActiveProjectId(null);
      return;
    }
    if (route.name === 'project') {
      setActiveProjectId(route.id);
      setView('project');
      return;
    }
    if (route.name === 'board') {
      setActiveBoardId(route.id);
      setView('board');
      return;
    }
    if (route.name === 'review') {
      setSelectedVideoId(route.id);
      setView('reviewer');
      return;
    }
    if (route.name === 'edit') {
      setActiveCompositionId(route.id);
      setView('editor');
      return;
    }
    if (route.name === 'share') {
      // handled below when shareResolution/shareVideo load
      return;
    }
    if (route.name === 'legal') {
      setLegalPage(route.page);
      setView('legal');
      return;
    }
    setView('workspaces');
    setActiveProjectId(null);
    setSelectedVideoId(null);
    setActiveBoardId(null);
    setActiveCompositionId(null);
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

  const handleGoBackToWorkspaces = useCallback(() => {
    setSelectedVideoId(null);
    setPendingReviewFocus(null);
    setPendingProjectFocus(null);
    navigate('/workspaces');
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

      navigate('/workspaces');
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
          <div className="min-h-screen w-full bg-gray-50 px-4 py-6">
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-2xl">
              <div className="mb-2 flex items-center justify-center gap-2 text-gray-900">
                <img src={logo} alt="Reffo" className="h-7 w-auto" />
                <span className="text-base font-semibold">Reffo</span>
              </div>
              <p className="mb-5 text-xs text-gray-600">Fast, focused video feedback.</p>
              <div className="flex flex-col items-stretch gap-3">
                <button
                  onClick={handleGoogleSignIn}
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-gray-900 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                >
                  <img src={googleLogo} alt="Google" className="h-5 w-5" />
                  Continue with Google
                </button>
                {renderEmailAuthSection(true)}
              </div>
              <p className="mt-4 text-[11px] text-gray-500">
                By continuing you agree to our{' '}
                <button onClick={() => navigate('/terms')} className="underline">
                  {consentText.footer.terms}
                </button>{' '}
                and{' '}
                <button onClick={() => navigate('/privacy')} className="underline">
                  {consentText.footer.privacy}
                </button>
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-12">
            <div className="w-full max-w-xl space-y-8">
              <div className="text-center">
                <div className="mx-auto mb-2 flex items-center justify-center gap-2">
                  <img src={logo} alt="Reffo" className="h-8 w-auto" />
                  <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Reffo</h1>
                </div>
                <p className="text-sm text-gray-600 sm:text-base">Fast, focused video feedback for teams.</p>
              </div>
              <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                <div className="space-y-3">
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-full border border-gray-900 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                  >
                    <img src={googleLogo} alt="Google" className="h-5 w-5" />
                    Continue with Google
                  </button>
                  {renderEmailAuthSection()}
                </div>
                <p className="mt-4 text-center text-xs text-gray-500">
                  By continuing you agree to our{' '}
                  <button onClick={() => navigate('/terms')} className="underline">
                    {consentText.footer.terms}
                  </button>{' '}
                  and{' '}
                  <button onClick={() => navigate('/privacy')} className="underline">
                    {consentText.footer.privacy}
                  </button>
                  .
                </p>
              </div>
              <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  <p className="text-xs uppercase text-gray-500">Trusted workflows</p>
                  <p className="mt-1 text-gray-700">Import, comment, and ship faster with a pipeline built for editors, directors, and producers.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  <p className="text-xs uppercase text-gray-500">Launch ready</p>
                  <p className="mt-1 text-gray-700">Invite your crew in minutes and keep feedback in sync across every project.</p>
                </div>
              </div>
              <footer className="flex flex-col items-center gap-2 text-center text-xs text-gray-500">
                <button onClick={() => navigate('/privacy')} className="underline underline-offset-2">{consentText.footer.privacy}</button>
                {' · '}
                <button onClick={() => navigate('/cookie-policy')} className="underline underline-offset-2">{consentText.footer.cookies}</button>
                {' · '}
                <button onClick={() => navigate('/terms')} className="underline underline-offset-2">{consentText.footer.terms}</button>
                <LanguageSwitcher compact />
              </footer>
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
          <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white border border-gray-200 rounded-3xl p-10 w-full max-w-md text-center space-y-4 shadow-2xl">
              <h2 className="text-xl font-semibold text-gray-900">Sync error</h2>
              <p className="text-gray-600">{ensureError ?? 'We could not connect your account right now.'}</p>
              <button
                onClick={handleRetryEnsureUser}
                className="w-full border border-gray-900 bg-white text-gray-900 font-semibold py-2.5 rounded-full transition hover:bg-gray-50"
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
            onGoBack={handleGoBackToWorkspaces}
            theme={preference}
            initialFocus={activeReviewFocus}
            onConsumeInitialFocus={() => {
              setPendingReviewFocus((focus) => {
                if (!focus) return null;
                return focus.videoId === currentVideo.id ? null : focus;
              });
            }}
            onOpenEditor={(compositionId) => navigate(`/edit/${compositionId}`)}
          />
        ) : view === 'editor' && activeCompositionId ? (
          <EditorPage
            compositionId={activeCompositionId as Id<'compositions'>}
            onExit={() => navigate('/workspaces')}
            onOpenComposition={(id) => navigate(`/edit/${id}`)}
            onExitToReview={(videoId) => navigate(`/review/${videoId}`)}
          />
        ) : view === 'board' && activeBoardId ? (
          <BoardPageWrapper boardId={activeBoardId} />
        ) : (
          <div className="min-h-screen flex flex-col">
            <AppHeader
              active={view === 'profile' ? 'profile' : view === 'library' ? 'library' : 'workspaces'}
              onNavigate={(target) => {
                if (target === 'workspaces') navigate('/workspaces');
                else if (target === 'library') navigate('/library');
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
	            <main className="flex-1 overflow-y-auto px-0 py-4 sm:px-6 sm:py-10 lg:px-12">
              {view === 'profile' ? (
                <ProfileSettings
                  user={{
                    name: currentUser.name ?? null,
                    email: currentUser.email,
                    avatar: currentUser.avatar ?? null,
                    authAvatar: (currentUser as CurrentUserProfile).authAvatar ?? null,
                    customAvatar: (currentUser as CurrentUserProfile).customAvatar ?? null,
                    avatarSource: (currentUser as CurrentUserProfile).avatarSource ?? null,
                  }}
                  projects={projects}
                  onBack={() => navigate('/workspaces')}
                />
              ) : view === 'library' ? (
                <LibraryPage />
              ) : view === 'project' && activeProjectId ? (
                <ProjectWorkspace
                  project={projects.find((p) => p.id === activeProjectId)!}
                  projects={projects}
                  videos={videos}
                  theme={preference}
                  onBack={() => navigate('/workspaces')}
                  onStartReview={handleStartReview}
                  onRenameVideo={handleRenameVideo}
                  onSetVideoProject={handleSetVideoProject}
                  onRemoveVideo={handleRemoveVideo}
                  onCompleteUpload={handleCompleteUpload}
                  onGenerateUploadUrl={generateUploadUrl as any}
                  onOpenBoard={(boardId) => {
                    setActiveBoardId(boardId);
                    navigate(`/board/${boardId}`);
                  }}
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
                  onGenerateUploadUrl={generateUploadUrl as any}
                  onGetDownloadUrl={getDownloadUrl}
                  onOpenProject={(projectId) => {
                    setActiveProjectId(projectId);
                    navigate(`/project/${projectId}`);
                  }}
                />
              )}
            </main>
	            <footer className={`border-t ${isDark ? 'border-white/10 bg-black/40 text-white/70' : 'border-gray-200 bg-white text-gray-600'} px-0 py-4 sm:px-6 lg:px-12`}>
              <div className="flex flex-wrap items-center justify-center gap-4 px-4 text-xs sm:px-0">
                <button onClick={() => navigate('/privacy')} className="underline underline-offset-2">
                  {consentText.footer.privacy}
                </button>
                <button onClick={() => navigate('/cookie-policy')} className="underline underline-offset-2">
                  {consentText.footer.cookies}
                </button>
                <button onClick={() => navigate('/terms')} className="underline underline-offset-2">
                  {consentText.footer.terms}
                </button>
                {view !== 'editor' && view !== 'reviewer' && (
                  <CookieSettingsTrigger
                    variant="footer"
                    className={
                      isDark
                        ? 'text-xs underline text-white/70 hover:text-white'
                        : 'text-xs underline text-gray-700 hover:text-gray-900'
                    }
                  />
                )}
                <LanguageSwitcher compact className={
                  isDark
                    ? 'flex items-center gap-2 text-white/70'
                    : 'flex items-center gap-2 text-gray-700'
                } />
              </div>
            </footer>
          </div>
        )}
      </SignedIn>
    </div>
  );
};

export default App;

interface AppHeaderProps {
  active: 'workspaces' | 'library' | 'profile';
  onNavigate: (view: 'workspaces' | 'library' | 'profile') => void;
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
		  const { user: clerkUser } = useUser();
		  const [notifOpen, setNotifOpen] = React.useState(false);
		  const notifRef = useRef<HTMLDivElement | null>(null);
		  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
	  const displayNotifications = notifications ?? [];
	  const base = user.name || user.email;
	  const initials = base
	    .split(' ')
	    .map((part) => part[0]?.toUpperCase())
	    .join('')
	    .slice(0, 2);
	  const avatarUrl = user.avatar ?? clerkUser?.imageUrl ?? null;
	
	  useEffect(() => {
	    if (!mobileMenuOpen) return;
	    const prevOverflow = document.body.style.overflow;
	    document.body.style.overflow = "hidden";
	    const onKeyDown = (event: KeyboardEvent) => {
	      if (event.key === "Escape") {
	        setMobileMenuOpen(false);
	      }
	    };
	    window.addEventListener("keydown", onKeyDown);
	    return () => {
	      window.removeEventListener("keydown", onKeyDown);
	      document.body.style.overflow = prevOverflow;
	    };
	  }, [mobileMenuOpen]);

	  useEffect(() => {
	    if (!notifOpen) return;
	    const onPointerDown = (event: PointerEvent) => {
	      const root = notifRef.current;
	      if (!root) return;
	      if (root.contains(event.target as Node)) return;
	      setNotifOpen(false);
	    };
	    const onKeyDown = (event: KeyboardEvent) => {
	      if (event.key === "Escape") {
	        setNotifOpen(false);
	      }
	    };
	    window.addEventListener("pointerdown", onPointerDown);
	    window.addEventListener("keydown", onKeyDown);
	    return () => {
	      window.removeEventListener("pointerdown", onPointerDown);
	      window.removeEventListener("keydown", onKeyDown);
	    };
	  }, [notifOpen]);
	
	  const go = (target: 'workspaces' | 'library' | 'profile') => {
	    setNotifOpen(false);
	    setMobileMenuOpen(false);
	    onNavigate(target);
	  };

		  const mobileMenu =
		    mobileMenuOpen && typeof document !== "undefined"
		      ? createPortal(
		          <div
		            className={`fixed inset-0 z-[100] flex flex-col md:hidden ${
		              isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"
		            }`}
		            role="dialog"
		            aria-modal="true"
		            aria-label="Navigation menu"
		          >
		            {/* Top bar: match the main navbar sizing/spacing/logo */}
		            <div className={`border-b ${isDark ? "border-white/10" : "border-gray-200"}`}>
		              <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-12">
		                <button
		                  type="button"
		                  onClick={() => go("workspaces")}
		                  className={`flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 ${
		                    isDark ? "focus:ring-white/20" : "focus:ring-gray-300"
		                  }`}
		                  aria-label="Go to Workspaces"
		                >
		                  <img src={logo} alt="Reffo" className="h-7 w-auto" />
		                  <span className={isDark ? "text-sm font-semibold text-white/80" : "text-sm font-semibold text-gray-900"}>
		                    Reffo Studio
		                  </span>
		                </button>
		                <button
		                  onClick={() => setMobileMenuOpen(false)}
		                  className={
		                    isDark
		                      ? "rounded-full border border-white/20 bg-black/40 p-2 text-white/90 hover:bg-black/60"
		                      : "rounded-full border border-gray-200 bg-white p-2 text-gray-800 hover:bg-gray-50"
		                  }
		                  aria-label="Close menu"
		                >
		                  <X size={18} />
		                </button>
		              </div>
		            </div>

		            {/* Body: centered menu content */}
		            <div className="flex flex-1 flex-col overflow-y-auto">
		              <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-8">
		                <div className="space-y-4">
		                  <button
		                    type="button"
		                    onClick={() => go("profile")}
		                    className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
		                      isDark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"
		                    }`}
		                  >
		                    <div
		                      className={
		                        isDark
		                          ? "flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-sm font-semibold text-white"
		                          : "flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900"
		                      }
		                    >
		                      {avatarUrl ? (
		                        <img src={avatarUrl} alt={user.email} className="h-10 w-10 rounded-full object-cover" />
		                      ) : (
		                        <span>{initials}</span>
		                      )}
		                    </div>
		                    <div className="min-w-0 flex-1">
		                      <div className="text-sm font-semibold truncate">{user.name ?? user.email}</div>
		                      <div className={isDark ? "text-xs text-white/60 truncate" : "text-xs text-gray-600 truncate"}>
		                        {user.email}
		                      </div>
		                    </div>
		                  </button>

		                  <div className="space-y-2">
		                    <button
		                      type="button"
		                      onClick={() => go("workspaces")}
		                      className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold text-left transition ${
		                        active === "workspaces"
		                          ? isDark
		                            ? "!border-white/25 !bg-black !text-white ring-1 ring-white/35 shadow-sm"
		                            : "!border-gray-900 !bg-gray-900 !text-white shadow-sm"
		                          : isDark
		                            ? "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
		                            : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
		                      }`}
		                    >
		                      Workspaces
		                    </button>
		                    <button
		                      type="button"
		                      onClick={() => go("library")}
		                      className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold text-left transition ${
		                        active === "library"
		                          ? isDark
		                            ? "!border-white/25 !bg-black !text-white ring-1 ring-white/35 shadow-sm"
		                            : "!border-gray-900 !bg-gray-900 !text-white shadow-sm"
		                          : isDark
		                            ? "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
		                            : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
		                      }`}
		                    >
		                      Library
		                    </button>
		                    <button
		                      type="button"
		                      onClick={() => go("profile")}
		                      className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold text-left transition ${
		                        active === "profile"
		                          ? isDark
		                            ? "!border-white/25 !bg-black !text-white ring-1 ring-white/35 shadow-sm"
		                            : "!border-gray-900 !bg-gray-900 !text-white shadow-sm"
		                          : isDark
		                            ? "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
		                            : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
		                      }`}
		                    >
		                      Profile
		                    </button>
		                  </div>

		                  <button
		                    type="button"
		                    onClick={async () => {
		                      setMobileMenuOpen(false);
		                      try {
		                        localStorage.removeItem("reffo_miro_session_id");
		                      } catch {}
		                      await signOut();
		                    }}
		                    className={
		                      isDark
		                        ? "w-full rounded-full border border-white/20 bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/80"
		                        : "w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
		                    }
		                  >
		                    Logout
		                  </button>
		                </div>
		              </div>
		            </div>
		          </div>,
		          document.body
		        )
		      : null;

	  return (
	    <header className={`sticky top-0 z-30 backdrop-blur border-b ${isDark ? 'border-white/10 bg-black/20 text-white' : 'border-gray-200 bg-white/80 text-gray-900'}`}>
	      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-12">
	        <div className="flex items-center gap-6">
	          <button
	            type="button"
	            onClick={() => go('workspaces')}
	            className={`flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-white/20' : 'focus:ring-gray-300'}`}
	            aria-label="Go to Workspaces"
	          >
		            <img src={logo} alt="Reffo" className="h-7 w-auto" />
		            <span className={isDark ? "text-sm font-semibold text-white/80" : "text-sm font-semibold text-gray-900"}>
		              Reffo Studio
		            </span>
		          </button>
		          <nav className={`hidden items-center gap-3 text-sm md:flex ${isDark ? "text-white/60" : "text-gray-600"}`}>
		            <HeaderNavButton
		              label="Workspaces"
		              active={active === 'workspaces'}
	              onClick={() => go('workspaces')}
	              isDark={isDark}
	            />
	            <HeaderNavButton
	              label="Library"
	              active={active === 'library'}
	              onClick={() => go('library')}
	              isDark={isDark}
	            />
	            <HeaderNavButton
	              label="Profile"
	              active={active === 'profile'}
	              onClick={() => go('profile')}
	              isDark={isDark}
	            />
	          </nav>
	        </div>
	        <div className="flex items-center gap-2 sm:gap-3">
	          <div className="relative" ref={notifRef}>
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
	              <div className={`absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border shadow-2xl backdrop-blur ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
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
	            onClick={() => {
	              setNotifOpen(false);
	              setMobileMenuOpen(true);
	            }}
	            className={isDark ? 'md:hidden rounded-full border border-white/20 bg-black/30 p-2 text-white/80 hover:text-white' : 'md:hidden rounded-full border border-gray-200 bg-white p-2 text-gray-700 hover:text-gray-900'}
	            aria-label="Open menu"
	          >
	            <Menu size={16} />
	          </button>
	          <div className="hidden text-right text-xs text-white/60 sm:block">
	            <p className="font-semibold text-white/80">{user.name ?? user.email}</p>
	            <p>{user.email}</p>
	          </div>
	          <button
	            onClick={() => go('profile')}
	            className={isDark ? 'hidden md:flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-sm font-semibold text-white hover:border-white/40' : 'hidden md:flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:border-gray-300'}
	            aria-label="Open profile"
	          >
	            {avatarUrl ? (
	              <img src={avatarUrl} alt={user.email} className="h-10 w-10 rounded-full object-cover" />
	            ) : (
	              <span>{initials}</span>
	            )}
	          </button>
	          <button
	            onClick={async () => {
	              try { localStorage.removeItem('reffo_miro_session_id'); } catch {}
	              await signOut();
	            }}
	            className={isDark ? 'hidden md:inline-flex rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white/70 hover:text-white' : 'hidden md:inline-flex rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900'}
	          >
	            Logout
	          </button>
	        </div>
	      </div>

	      {mobileMenu}
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
