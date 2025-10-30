import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from './convex/_generated/api';
import { Loader2 } from 'lucide-react';
import VideoReviewer from './components/VideoReviewer';
import Dashboard from './components/Dashboard';
import { Project, Video } from './types';
import type { Id } from './convex/_generated/dataModel';

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'reviewer'>('dashboard');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [reviewSourceUrl, setReviewSourceUrl] = useState<string | null>(null);
  const [isEnsuringUser, setIsEnsuringUser] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const { isSignedIn } = useUser();

  const currentUser = useQuery(api.users.current, isSignedIn ? {} : undefined);
  const projectsQuery = useQuery(api.projects.list, currentUser ? {} : undefined);
  const videosQuery = useQuery(api.videos.list, currentUser ? { projectId: undefined } : undefined);

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

  const attemptEnsureUser = useCallback(async () => {
    setIsEnsuringUser(true);
    setEnsureError(null);
    try {
      await ensureUser();
    } catch (error) {
      console.error('Failed to sync user in Convex', error);
      setEnsureError('Impossibile collegare il tuo account al backend. Riprova.');
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
    if (!projectsQuery) return [];
    return projectsQuery.map((project) => ({
      id: project._id,
      name: project.name,
      createdAt: new Date(project.createdAt).toISOString(),
    }));
  }, [projectsQuery]);

  const videos: Video[] = useMemo(() => {
    if (!videosQuery) return [];
    return videosQuery.map((video) => ({
      id: video.id,
      title: video.title,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? undefined,
      uploadedAt: new Date(video.uploadedAt).toISOString(),
      lastReviewedAt: video.lastReviewedAt
        ? new Date(video.lastReviewedAt).toISOString()
        : undefined,
    }));
  }, [videosQuery]);

  const dataLoading = Boolean(currentUser) && (projectsQuery === undefined || videosQuery === undefined);

  const currentVideo = useMemo(() => {
    if (!selectedVideoId) return null;
    return videos.find((video) => video.id === selectedVideoId) ?? null;
  }, [videos, selectedVideoId]);

  const handleStartReview = useCallback(
    async (video: Video) => {
      setSelectedVideoId(video.id);
      setView('reviewer');
      setReviewSourceUrl(null);
      try {
        // Prefetch playback URL to minimize wait time in the reviewer
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

  const handleGoBackToDashboard = useCallback(() => {
    setView('dashboard');
    setSelectedVideoId(null);
  }, []);

  return (
    <div className="w-screen h-screen bg-gray-950 text-gray-200 flex flex-col font-sans">
      <SignedOut>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-md text-center space-y-4">
            <h1 className="text-2xl font-semibold text-white">Video Review Workspace</h1>
            <p className="text-gray-400">
              Accedi con il tuo account per gestire progetti, video e revisioni.
            </p>
            <SignInButton mode="modal">
              <button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg transition-colors">
                Accedi con Clerk
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {currentUser === undefined || isEnsuringUser ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-cyan-500" size={32} />
              <p className="text-gray-400">Collego il tuo account...</p>
            </div>
          </div>
        ) : currentUser === null ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-md text-center space-y-4">
              <h2 className="text-xl font-semibold text-white">Errore di sincronizzazione</h2>
              <p className="text-gray-400">{ensureError ?? 'Impossibile collegare il tuo account in questo momento.'}</p>
              <button
                onClick={handleRetryEnsureUser}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg transition-colors"
                disabled={isEnsuringUser}
              >
                Riprova
              </button>
            </div>
          </div>
        ) : dataLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-cyan-500" size={32} />
          </div>
        ) : view === 'dashboard' ? (
          <Dashboard
            videos={videos}
            projects={projects}
            onStartReview={handleStartReview}
            onCreateProject={async (name) => {
              await createProject({ name });
            }}
            onUpdateProject={async ({ id, name }) => {
              await updateProject({ projectId: id as Id<'projects'>, name });
            }}
            onDeleteProject={async (projectId) => {
              await deleteProject({ projectId: projectId as Id<'projects'> });
            }}
            onSetVideoProject={async (videoId, projectId) => {
              await assignVideoProject({
                videoId: videoId as Id<'videos'>,
                projectId: projectId ? (projectId as Id<'projects'>) : undefined,
              });
            }}
            onRenameVideo={async (videoId, title) => {
              await updateVideoMetadata({ videoId: videoId as Id<'videos'>, title });
            }}
            onCompleteUpload={async (payload) => {
              return await completeUpload({
                ...payload,
                projectId: payload.projectId
                  ? (payload.projectId as Id<'projects'>)
                  : undefined,
              });
            }}
            onRemoveVideo={async (videoId) => {
              await removeVideo({ videoId: videoId as Id<'videos'> });
            }}
            onGenerateUploadUrl={generateUploadUrl}
            userButton={<UserButton afterSignOutUrl="/" />} 
          />
        ) : (
          currentVideo && (
            <VideoReviewer
              key={currentVideo.id}
              video={currentVideo}
              sourceUrl={reviewSourceUrl ?? undefined}
              onGoBack={handleGoBackToDashboard}
            />
          )
        )}
      </SignedIn>
    </div>
  );
};

export default App;
