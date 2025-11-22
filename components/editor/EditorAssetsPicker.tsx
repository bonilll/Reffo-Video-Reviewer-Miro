import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

type Props = {
  onPick: (asset: any) => void;
  projectId?: string | null;
};

type Asset = {
  id: string;
  title: string;
  src: string;
  storageKey: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  uploadedAt: number;
  projectId?: string | null;
  thumbnailUrl?: string | null;
};

const fmtDur = (s: number) => {
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

const EditorAssetsPicker: React.FC<Props> = ({ onPick, projectId }) => {
  const assets = useQuery((api as any).videos.listEditAssets, {}) as Asset[] | undefined;

  const [query, setQuery] = React.useState('');
  const [onlyProject, setOnlyProject] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<'new' | 'old' | 'az' | 'dur'>('new');
  const [tile, setTile] = React.useState(220); // tile width px
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (!assets) return [] as Asset[];
    let arr = assets.slice();
    if (onlyProject && projectId) {
      arr = arr.filter((a) => (a.projectId ?? null) === projectId);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((a) => a.title.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case 'old':
        arr.sort((a, b) => a.uploadedAt - b.uploadedAt);
        break;
      case 'az':
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'dur':
        arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
      default:
        arr.sort((a, b) => b.uploadedAt - a.uploadedAt);
        break;
    }
    return arr;
  }, [assets, onlyProject, projectId, query, sortBy]);

  // Pause all previews when leaving list
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    return () => {
      if (!listRef.current) return;
      const videos = listRef.current.querySelectorAll('video');
      videos.forEach((v) => { try { v.pause(); v.currentTime = 0; } catch {} });
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-black/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Asset Library</div>
          <div className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/60">
            {filtered.length}{assets ? ` / ${assets.length}` : ''}
          </div>
          <div className="ml-auto flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              className="accent-white"
              checked={onlyProject}
              onChange={(e) => setOnlyProject(e.target.checked)}
            />
            This project
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/80"
            title="Sort"
          >
            <option value="new">Newest</option>
            <option value="old">Oldest</option>
            <option value="az">A–Z</option>
            <option value="dur">Duration</option>
          </select>
          <div className="flex items-center gap-2 text-xs text-white/70" title="Thumb size">
            <span>−</span>
            <input
              type="range"
              min={160}
              max={320}
              value={tile}
              onChange={(e) => setTile(Number(e.target.value))}
              className="h-1.5 w-24 appearance-none rounded-full bg-white/10 accent-white"
            />
            <span>+</span>
          </div>
        </div>
        </div>
        <div className="px-3 pb-3">
          <input
            type="search"
            placeholder="Search assets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 placeholder-white/40"
          />
        </div>
      </div>
      {!assets ? (
        <div className="p-4 text-[12px] text-white/60">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-[12px] text-white/60">No assets match your filters.</div>
      ) : (
        <div
          ref={listRef}
          className="grid flex-1 grid-cols-2 gap-3 overflow-auto p-3 pr-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          style={{ gridAutoRows: `${tile * 0.65}px` }}
        >
          {filtered.map((a) => (
            <div
              key={a.id}
              className="group relative isolate overflow-hidden rounded-xl border border-white/10 bg-black/40"
              style={{ width: `${tile}px` }}
              onMouseEnter={() => setHoveredId(a.id)}
              onMouseLeave={() => setHoveredId((cur) => (cur === a.id ? null : cur))}
              onDoubleClick={() => onPick(a)}
            >
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <video
                  className="absolute inset-0 h-full w-full object-cover"
                  src={a.src}
                  muted
                  playsInline
                  preload="metadata"
                  poster={a.thumbnailUrl || undefined}
                  onCanPlay={(e) => { if (hoveredId === a.id) { try { (e.currentTarget as HTMLVideoElement).play(); } catch {} } }}
                  onMouseEnter={(e) => { try { (e.currentTarget as HTMLVideoElement).currentTime = 0; (e.currentTarget as HTMLVideoElement).play(); } catch {} }}
                  onMouseLeave={(e) => { try { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; } catch {} }}
                  loop
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] text-white/90">
                  <span className="truncate">{a.title}</span>
                  <span className="ml-2 shrink-0 text-white/70">{a.width}×{a.height} · {Math.round(a.fps)} · {fmtDur(a.duration || 0)}</span>
                </div>
              </div>
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20"
                  onClick={() => onPick(a)}
                  title="Insert at playhead"
                >
                  Insert
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EditorAssetsPicker;
