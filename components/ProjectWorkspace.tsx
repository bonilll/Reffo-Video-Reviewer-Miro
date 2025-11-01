import React, { useMemo } from 'react';
import { Film, PlayCircle, ArrowLeft } from 'lucide-react';
import { Video, Project } from '../types';
import { useThemePreference } from '../useTheme';

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

const ProjectWorkspace: React.FC<{
  project: Project;
  videos: Video[];
  theme: 'light' | 'dark' | 'system';
  onBack: () => void;
  onStartReview: (video: Video) => void | Promise<void>;
}> = ({ project, videos, theme, onBack, onStartReview }) => {
  const isDark = useThemePreference(theme);
  const list = useMemo(() => videos.filter(v => v.projectId === project.id), [videos, project.id]);

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
          <p className="text-sm text-white/60">{list.length} review{list.length === 1 ? '' : 's'}</p>
        </div>
      </header>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 text-center text-white/60">
          No reviews yet for this project.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((video) => (
            <div key={video.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="relative aspect-video">
                <Thumbnail video={video} />
                <button
                  onClick={() => onStartReview(video)}
                  className="absolute bottom-2 right-2 rounded-full bg-white/10 p-2 text-white opacity-90 hover:bg-white/20"
                  title="Open"
                >
                  <PlayCircle size={20} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 px-2 py-2">
                <h3 className="truncate text-sm font-semibold text-white" title={video.title}>{video.title}</h3>
                <span className="text-[11px] text-white/50">{formatDate(video.uploadedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectWorkspace;

