// FIX: Import `useEffect` hook from react.
import React, { useRef, useState, useMemo, useEffect, ReactNode } from 'react';
import { Video, Project } from '../types';
import { UploadCloud, Film, PlayCircle, Folder, Plus, MoreHorizontal, Grip, List, ChevronLeft, Trash2, Pencil, X, ExternalLink, Loader2 } from 'lucide-react';

interface UploadMetadata {
    storageKey: string;
    publicUrl: string;
    title: string;
    description?: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    projectId?: string | null;
}

interface DashboardProps {
    videos: Video[];
    projects: Project[];
    onStartReview: (video: Video) => void | Promise<void>;
    onCreateProject: (name: string) => Promise<void>;
    onUpdateProject: (project: { id: string; name: string }) => Promise<void>;
    onDeleteProject: (projectId: string) => Promise<void>;
    onSetVideoProject: (videoId: string, projectId: string | null) => Promise<void>;
    onRenameVideo: (videoId: string, title: string) => Promise<void>;
    onCompleteUpload: (payload: UploadMetadata) => Promise<void>;
    onRemoveVideo: (videoId: string) => Promise<void>;
    onGenerateUploadUrl: (args: { contentType: string; fileName?: string }) => Promise<{ storageKey: string; uploadUrl: string; publicUrl: string }>;
    userButton: ReactNode;
}

const formatSimpleDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

const ProjectCard: React.FC<{ project: Project, videoCount: number, onSelect: () => void, onRename: () => void, onDelete: () => void }> = ({ project, videoCount, onSelect, onRename, onDelete }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleMenuToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(o => !o);
    };
    
    // Close menu on click outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div onClick={onSelect} className="bg-gray-900 rounded-lg shadow-lg border border-gray-800 group transition-all duration-300 hover:border-cyan-500 hover:scale-[1.02] hover:shadow-cyan-500/10 cursor-pointer">
            <div className="p-5 flex flex-col justify-between h-full">
                <div>
                    <div className="flex justify-between items-start">
                        <Folder size={32} className="text-cyan-500 mb-3" />
                        <div className="relative" ref={menuRef}>
                            <button onClick={handleMenuToggle} className="p-1 rounded-full text-gray-400 hover:bg-gray-800 hover:text-white">
                                <MoreHorizontal size={20} />
                            </button>
                            {menuOpen && (
                                <div className="absolute top-full right-0 mt-1 w-32 bg-gray-800 border border-gray-700 rounded-md shadow-xl z-20 py-1">
                                    <button onClick={(e) => { e.stopPropagation(); onRename(); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"><Pencil size={14}/> Rename</button>
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"><Trash2 size={14}/> Delete</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <h3 className="font-bold text-white text-lg truncate" title={project.name}>{project.name}</h3>
                </div>
                <div className="text-sm text-gray-400 mt-2">
                    <span>{videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>
                </div>
            </div>
        </div>
    );
}

const VideoCard: React.FC<{ video: Video, onStartReview: (video: Video) => void, onRename: (video: Video) => void, onMove: (video: Video) => void }> = ({ video, onStartReview, onRename, onMove }) => {
    const [thumbFailed, setThumbFailed] = useState(false);
    return (
        <div key={video.id} className="bg-gray-900 rounded-lg overflow-hidden shadow-lg border border-gray-800 group transition-all hover:border-cyan-500">
            <div className="relative aspect-video bg-black">
                {!thumbFailed ? (
                    <video
                        className="absolute inset-0 w-full h-full object-cover"
                        src={video.src}
                        preload="metadata"
                        muted
                        playsInline
                        onError={() => setThumbFailed(true)}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                <Film size={48} className="text-gray-600" />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => onStartReview(video)} className="text-white transform transition-transform hover:scale-110">
                        <PlayCircle size={64} />
                    </button>
                </div>
                <div className="absolute top-2 right-2">
                    <VideoActionsMenu onRename={() => onRename(video)} onMove={() => onMove(video)} />
                </div>
            </div>
            <div className="p-4">
                <h3 className="font-semibold text-white truncate" title={video.title}>{video.title}</h3>
                <div className="text-sm text-gray-400 mt-1 flex justify-between">
                    <span>{formatSimpleDate(video.uploadedAt)}</span>
                    <span>{formatDuration(video.duration)}</span>
                </div>
            </div>
        </div>
    );
};

const VideoActionsMenu: React.FC<{ onRename: () => void; onMove: () => void }> = ({ onRename, onMove }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);
    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)} className="p-1 rounded-md text-gray-300 hover:bg-gray-800"><MoreHorizontal size={18} /></button>
            {open && (
                <div className="absolute right-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-md shadow-xl z-10 py-1">
                    <button onClick={() => { onRename(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"><Pencil size={14}/> Rename</button>
                    <button onClick={() => { onMove(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"><Folder size={14}/> Move to Project</button>
                </div>
            )}
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({
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
    userButton,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [view, setView] = useState<'grid' | 'list'>('list');
    const [projectsView, setProjectsView] = useState<'grid' | 'list'>('list');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);
    const [pendingUpload, setPendingUpload] = useState<{
        file: File;
        objectUrl: string;
        metadata: { width: number; height: number; duration: number };
    } | null>(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    
    // Modals state
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [videoToRename, setVideoToRename] = useState<Video | null>(null);
    const [videoToMove, setVideoToMove] = useState<Video | null>(null);
    const [isProjectSaving, setIsProjectSaving] = useState(false);
    const [projectModalError, setProjectModalError] = useState<string | null>(null);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadError(null);
            setIsUploading(false);
            setUploadProgress(0);
            setUploadLogs([]);
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            
            const objectUrl = URL.createObjectURL(file);
            videoElement.src = objectUrl;

            const metadataPromise = new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
                    resolve({
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight,
                    duration: videoElement.duration,
                    });
                };
                videoElement.onerror = () => reject(new Error('Impossibile leggere i metadati del video'));    
            });

            try {
                const metadata = await metadataPromise;
                setPendingUpload({ file, objectUrl, metadata });
                setSelectedProjectId(activeProject?.id ?? null);
                setShowAssignModal(true);
            } catch (error) {
                console.error('Video metadata read failed', error);
                setUploadError(error instanceof Error ? error.message : 'Impossibile leggere i metadati');
                URL.revokeObjectURL(objectUrl);
                if (event.target) event.target.value = '';
            }
        }
    };

    const proceedUpload = async () => {
        if (!pendingUpload) return;
        const { file, objectUrl, metadata } = pendingUpload;
        setShowAssignModal(false);
        setIsUploading(true);
        setUploadError(null);
        setUploadLogs([]);
        setUploadLogs(prev => [...prev, `Lettura metadati video: ${file.name}`]);
        setUploadLogs(prev => [...prev, `Metadati: ${metadata.width}x${metadata.height}, ${Math.round(metadata.duration)}s`]);
        try {
            setUploadLogs(prev => [...prev, `Richiesta URL di upload prefirmato...`]);
            const { storageKey, uploadUrl, publicUrl } = await onGenerateUploadUrl({
                contentType: file.type || 'application/octet-stream',
                fileName: file.name,
            });
            setUploadLogs(prev => [...prev, `Upload verso storage iniziato`]);

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl, true);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        setUploadProgress(percent);
                    }
                };
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            setUploadLogs(prev => [...prev, `Upload completato (${xhr.status})`]);
                            resolve();
                        } else {
                            reject(new Error(`Upload failed: HTTP ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Errore di rete durante l\'upload'));
                xhr.send(file);
            });

            setUploadLogs(prev => [...prev, `Registrazione video su backend...`]);
            const created = await onCompleteUpload({
                storageKey,
                publicUrl,
                title: file.name,
                width: metadata.width,
                height: metadata.height,
                fps: 24,
                duration: metadata.duration,
                projectId: selectedProjectId ?? null,
            } as any);
            setUploadLogs(prev => [...prev, `Video registrato con successo`]);

            // Avvia subito la review del video caricato
            const videoForReview: Video = {
                id: (created as any).id,
                title: (created as any).title,
                src: (created as any).src,
                storageKey: (created as any).storageKey,
                width: (created as any).width,
                height: (created as any).height,
                fps: (created as any).fps,
                duration: (created as any).duration,
                projectId: (created as any).projectId ?? undefined,
                uploadedAt: new Date((created as any).uploadedAt).toISOString(),
                lastReviewedAt: (created as any).lastReviewedAt ? new Date((created as any).lastReviewedAt).toISOString() : undefined,
            };
            await onStartReview(videoForReview);
            // Se tutto ok e nessun errore, non mostrare i log
            setUploadLogs([]);
        } catch (error) {
            console.error('Video upload failed', error);
            setUploadError(error instanceof Error ? error.message : 'Upload failed');
            setUploadLogs(prev => [...prev, `Errore: ${error instanceof Error ? error.message : String(error)}`]);
        } finally {
            setIsUploading(false);
            if (pendingUpload) URL.revokeObjectURL(pendingUpload.objectUrl);
            setPendingUpload(null);
            setSelectedProjectId(null);
        }
    };

    const recentlyReviewed = useMemo(() => {
        return videos
            .filter(v => v.lastReviewedAt)
            .sort((a, b) => new Date(b.lastReviewedAt!).getTime() - new Date(a.lastReviewedAt!).getTime())
            .slice(0, 5);
    }, [videos]);

    const sortedProjects = useMemo(() => {
        return [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [projects]);

    const handleProjectFormSubmit = async (projectName: string) => {
        setProjectModalError(null);
        setIsProjectSaving(true);
        try {
            if (projectToEdit) {
                await onUpdateProject({ id: projectToEdit.id, name: projectName });
        } else {
                await onCreateProject(projectName);
        }
        setProjectToEdit(null);
        setShowProjectModal(false);
        } catch (error) {
            console.error('Project save failed', error);
            setProjectModalError(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setIsProjectSaving(false);
    }
    };
    
    const videosInProject = useMemo(() => {
        if (!activeProject) return [];
        return videos.filter(v => v.projectId === activeProject.id);
    }, [videos, activeProject]);

    const RecentlyReviewedSection: React.FC<{ videos: Video[]; onStartReview: (v: Video) => void; onRename: (v: Video) => void; onMove: (v: Video) => void; }> = ({ videos, onStartReview, onRename, onMove }) => {
        const [page, setPage] = useState(1);
        const pageSize = 5;
        const top5 = useMemo(() => {
            return [...videos]
                .filter(v => v.lastReviewedAt)
                .sort((a, b) => new Date(b.lastReviewedAt || 0).getTime() - new Date(a.lastReviewedAt || 0).getTime())
                .slice(0, 5);
        }, [videos]);
        const unassigned = useMemo(() => {
            const topIds = new Set(top5.map(v => v.id));
            return videos
                .filter(v => !v.projectId)
                .filter(v => !topIds.has(v.id))
                .sort((a, b) => new Date(b.lastReviewedAt || 0).getTime() - new Date(a.lastReviewedAt || 0).getTime());
        }, [videos, top5]);
        const unassignedSlice = unassigned.slice(0, page * pageSize);
        if (top5.length === 0 && unassigned.length === 0) return null;
        return (
            <div className="space-y-8">
                {top5.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-200 mb-4">Top 5 Recently Reviewed</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {top5.map(video => (
                                <VideoCard key={video.id} video={video} onStartReview={onStartReview} onRename={onRename} onMove={onMove} />
                            ))}
                        </div>
                    </div>
                )}
                {unassigned.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-semibold text-gray-200">Unassigned Reviews</h2>
                            {unassignedSlice.length < unassigned.length && (
                                <button onClick={() => setPage(p => p + 1)} className="text-cyan-500 hover:text-cyan-400 text-sm font-semibold">Load more</button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {unassignedSlice.map(video => (
                                <VideoCard key={video.id} video={video} onStartReview={onStartReview} onRename={onRename} onMove={onMove} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const ProjectModal: React.FC = () => {
        const [name, setName] = useState(projectToEdit?.name || '');
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            inputRef.current?.focus();
        }, []);
        
        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!name.trim() || isProjectSaving) return;
            await handleProjectFormSubmit(name.trim());
        };

        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 w-full max-w-md">
                    <form onSubmit={handleSubmit}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-800">
                            <h2 className="text-lg font-semibold text-white">{projectToEdit ? 'Rename Project' : 'Create New Project'}</h2>
                            <button type="button" onClick={() => { setShowProjectModal(false); setProjectToEdit(null); }} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-800">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <label htmlFor="projectName" className="text-sm font-medium text-gray-300">Project Name</label>
                            <input
                                ref={inputRef}
                                id="projectName"
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Summer Campaign"
                                className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            {projectModalError && (
                                <p className="text-sm text-red-400 mt-3">{projectModalError}</p>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-gray-950/50 flex justify-end gap-3 rounded-b-xl">
                            <button type="button" onClick={() => { if (!isProjectSaving) { setShowProjectModal(false); setProjectToEdit(null); setProjectModalError(null); } }} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50" disabled={isProjectSaving}>Cancel</button>
                            <button type="submit" disabled={!name.trim() || isProjectSaving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isProjectSaving ? 'Saving...' : projectToEdit ? 'Save Changes' : 'Create Project'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const AssignProjectModal: React.FC = () => {
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 w-full max-w-md">
                    <div className="flex items-center justify-between p-4 border-b border-gray-800">
                        <h2 className="text-lg font-semibold text-white">Aggiungi alla cartella</h2>
                        <button type="button" onClick={() => { setShowAssignModal(false); }} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-800">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-sm font-medium text-gray-300">Seleziona progetto</label>
                            <select
                                className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                value={selectedProjectId ?? ''}
                                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                            >
                                <option value="">Nessun progetto</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        {pendingUpload && (
                            <div className="text-sm text-gray-400">
                                <div><span className="text-gray-300">File:</span> {pendingUpload.file.name}</div>
                                <div><span className="text-gray-300">Dimensioni:</span> {pendingUpload.metadata.width}×{pendingUpload.metadata.height}</div>
                                <div><span className="text-gray-300">Durata:</span> {Math.round(pendingUpload.metadata.duration)}s</div>
                            </div>
                        )}
                    </div>
                    <div className="px-6 py-4 bg-gray-950/50 flex justify-end gap-3 rounded-b-xl">
                        <button type="button" onClick={() => { setShowAssignModal(false); setPendingUpload(null); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700">Annulla</button>
                        <button type="button" onClick={proceedUpload} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500">Carica e apri review</button>
                    </div>
                </div>
            </div>
        );
    };

    const RenameVideoModal: React.FC = () => {
        const [name, setName] = useState(videoToRename?.title || '');
        const [saving, setSaving] = useState(false);
        const [error, setError] = useState<string | null>(null);
        useEffect(() => { setName(videoToRename?.title || ''); setError(null); }, [videoToRename]);
        if (!videoToRename) return null;
        const submit = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return;
            setSaving(true);
            setError(null);
            try {
                await onRenameVideo(videoToRename.id, name.trim());
                setVideoToRename(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to rename');
            } finally {
                setSaving(false);
            }
        };
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 w-full max-w-md">
                    <form onSubmit={submit}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-800">
                            <h2 className="text-lg font-semibold text-white">Rename Review</h2>
                            <button type="button" onClick={() => setVideoToRename(null)} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-800">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="text-sm font-medium text-gray-300">New name</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
                        </div>
                        <div className="px-6 py-4 bg-gray-950/50 flex justify-end gap-3 rounded-b-xl">
                            <button type="button" onClick={() => setVideoToRename(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700">Cancel</button>
                            <button type="submit" disabled={!name.trim() || saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const MoveVideoModal: React.FC = () => {
        const [targetProject, setTargetProject] = useState<string | null>(videoToMove?.projectId || null);
        const [saving, setSaving] = useState(false);
        const [error, setError] = useState<string | null>(null);
        useEffect(() => { setTargetProject(videoToMove?.projectId || null); setError(null); }, [videoToMove]);
        if (!videoToMove) return null;
        const submit = async () => {
            setSaving(true);
            setError(null);
            try {
                await onSetVideoProject(videoToMove.id, targetProject);
                setVideoToMove(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to move');
            } finally {
                setSaving(false);
            }
        };
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 w-full max-w-md">
                    <div className="flex items-center justify-between p-4 border-b border-gray-800">
                        <h2 className="text-lg font-semibold text-white">Move Review to Project</h2>
                        <button type="button" onClick={() => setVideoToMove(null)} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-800">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <label className="text-sm font-medium text-gray-300">Destination project</label>
                        <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" value={targetProject ?? ''} onChange={(e) => setTargetProject(e.target.value || null)}>
                            <option value="">No project</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {error && <p className="text-sm text-red-400">{error}</p>}
                    </div>
                    <div className="px-6 py-4 bg-gray-950/50 flex justify-end gap-3 rounded-b-xl">
                        <button type="button" onClick={() => setVideoToMove(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700">Cancel</button>
                        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50">{saving ? 'Moving...' : 'Move'}</button>
                    </div>
                </div>
            </div>
        );
    };

    const DeleteProjectModal: React.FC = () => {
        const handleDelete = async () => {
            if (!projectToDelete || isDeletingProject) return;
            setDeleteProjectError(null);
            setIsDeletingProject(true);
            try {
                await onDeleteProject(projectToDelete.id);
                setProjectToDelete(null);
            } catch (error) {
                console.error('Project delete failed', error);
                setDeleteProjectError(error instanceof Error ? error.message : 'Unable to delete project');
            } finally {
                setIsDeletingProject(false);
            }
        };

        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 w-full max-w-md p-6">
                <h2 className="text-lg font-semibold text-white">Delete Project</h2>
                <p className="text-gray-400 mt-2">Are you sure you want to delete "{projectToDelete?.name}"? Videos in this project will not be deleted.</p>
                    {deleteProjectError && (
                        <p className="text-sm text-red-400 mt-4">{deleteProjectError}</p>
                    )}
                <div className="mt-6 flex justify-end gap-3">
                        <button onClick={() => { if (!isDeletingProject) { setProjectToDelete(null); setDeleteProjectError(null); } }} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50" disabled={isDeletingProject}>Cancel</button>
                        <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50" disabled={isDeletingProject}>
                            {isDeletingProject ? 'Deleting...' : 'Delete'}
                        </button>
                </div>
            </div>
        </div>
    );
    };
    
    if (activeProject) {
        return (
            <div className="w-full h-full flex flex-col">
                <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setActiveProject(null)} className="p-1 rounded-md hover:bg-gray-700 transition-colors flex items-center gap-1 text-sm">
                            <ChevronLeft size={18} /> Back to Projects
                        </button>
                        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Folder size={22}/> {activeProject.name}</h1>
                    </div>
                </header>
                <main className="flex-1 p-8 overflow-y-auto">
                    <div className="flex justify-end items-center mb-6 gap-2">
                        <button onClick={() => setView('grid')} className={`p-2 rounded-md ${view === 'grid' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><Grip size={20} /></button>
                        <button onClick={() => setView('list')} className={`p-2 rounded-md ${view === 'list' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><List size={20} /></button>
                    </div>

                    {view === 'grid' ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {videosInProject.map(video => (
                                <VideoCard key={video.id} video={video} onStartReview={onStartReview} onRename={(v) => setVideoToRename(v)} onMove={(v) => setVideoToMove(v)} />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-lg">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-800 text-sm text-gray-400">
                                    <tr>
                                        <th className="p-4 font-medium">Name</th>
                                        <th className="p-4 font-medium">Uploaded</th>
                                        <th className="p-4 font-medium">Duration</th>
                                        <th className="p-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {videosInProject.map(video => (
                                        <tr key={video.id} className="border-b border-gray-800 last:border-b-0 hover:bg-gray-850">
                                            <td className="p-4 text-white font-semibold flex items-center gap-3"><Film size={18}/> {video.title}</td>
                                            <td className="p-4 text-gray-300">{formatSimpleDate(video.uploadedAt)}</td>
                                            <td className="p-4 text-gray-300">{formatDuration(video.duration)}</td>
                                            <td className="p-4 text-right">
                                                <div className="inline-flex items-center gap-2">
                                                    <button onClick={() => onStartReview(video)} className="text-cyan-500 hover:text-cyan-400 font-semibold">Review</button>
                                                    <VideoActionsMenu onRename={() => setVideoToRename(video)} onMove={() => setVideoToMove(video)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                     {videosInProject.length === 0 && <p className="text-center text-gray-500 mt-16">This project is empty. Upload a video to get started.</p>}
                </main>
            </div>
        )
    }

    return (
        <div className="w-full h-full flex flex-col">
            {showProjectModal && <ProjectModal />}
            {showAssignModal && <AssignProjectModal />}
            {videoToRename && <RenameVideoModal />}
            {videoToMove && <MoveVideoModal />}
            {projectToDelete && <DeleteProjectModal />}
            <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold text-white flex items-center gap-3"><PlayCircle /> Review Dashboard</h1>
                <div className="flex items-center gap-3">
                    {userButton}
                </div>
            </header>
            <main className="flex-1 p-8 overflow-y-auto space-y-12">
                {/* 1. Upload Section */}
                <div>
                    <div className="bg-gray-900 border-2 border-dashed border-gray-800 rounded-xl p-8 text-center flex flex-col items-center">
                        <UploadCloud size={48} className="text-cyan-500 mb-4" />
                        <h2 className="text-xl font-semibold text-white">Upload Your Videos for Review</h2>
                        <p className="text-gray-400 mt-1 max-w-md">Drag & drop files here, or click to browse.</p>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4,video/webm,video/quicktime" className="hidden" />
                        <div className="mt-6">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" /> Uploading...
                                    </>
                                ) : (
                                    'Upload from Computer'
                                )}
                            </button>
                            {uploadError && (
                                <p className="text-sm text-red-400 mt-3">{uploadError}</p>
                            )}
                        {isUploading && (
                            <div className="mt-3">
                                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-2 bg-cyan-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                                </div>
                                <div className="mt-1 text-xs text-gray-400">{uploadProgress}%</div>
                            </div>
                        )}
                        {uploadLogs.length > 0 && (
                            <div className="mt-4 text-xs bg-gray-900 border border-gray-800 rounded-md p-3 text-gray-300 max-h-40 overflow-auto">
                                <div className="font-semibold text-gray-200 mb-1">Upload logs</div>
                                <ul className="list-disc list-inside space-y-1">
                                    {uploadLogs.map((l, idx) => (
                                        <li key={idx}>{l}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                {/* 2. Recently Reviewed */}
                <RecentlyReviewedSection videos={videos} onStartReview={onStartReview} onRename={(v) => setVideoToRename(v)} onMove={(v) => setVideoToMove(v)} />

                {/* 3. Projects */}
                <div>
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold text-gray-200">Projects</h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setProjectsView('grid')} className={`p-2 rounded-md ${projectsView === 'grid' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`} title="Grid View"><Grip size={20} /></button>
                                <button onClick={() => setProjectsView('list')} className={`p-2 rounded-md ${projectsView === 'list' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`} title="List View"><List size={20} /></button>
                            </div>
                            <button onClick={() => setShowProjectModal(true)} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                <Plus size={18} /> New Project
                            </button>
                        </div>
                    </div>
                     {projectsView === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {sortedProjects.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    videoCount={videos.filter(v => v.projectId === project.id).length}
                                    onSelect={() => setActiveProject(project)}
                                    onRename={() => { setProjectToEdit(project); setShowProjectModal(true); }}
                                    onDelete={() => setProjectToDelete(project)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-lg">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-800 text-sm text-gray-400">
                                    <tr>
                                        <th className="p-4 font-medium">Name</th>
                                        <th className="p-4 font-medium">Videos</th>
                                        <th className="p-4 font-medium">Created</th>
                                        <th className="p-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedProjects.map(project => {
                                        const videoCount = videos.filter(v => v.projectId === project.id).length;
                                        return (
                                            <tr key={project.id} className="border-b border-gray-800 last:border-b-0 hover:bg-gray-850 transition-colors">
                                                <td className="p-4 text-white font-semibold">
                                                    <a href="#" onClick={(e) => { e.preventDefault(); setActiveProject(project); }} className="flex items-center gap-3 hover:text-cyan-400 transition-colors">
                                                        <Folder size={18}/> {project.name}
                                                    </a>
                                                </td>
                                                <td className="p-4 text-gray-300">{videoCount}</td>
                                                <td className="p-4 text-gray-300">{formatSimpleDate(project.createdAt)}</td>
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                         <button onClick={(e) => { e.stopPropagation(); setActiveProject(project); }} className="p-1.5 text-gray-400 hover:text-cyan-400 hover:bg-gray-700 rounded-md" title="Open Project"><ExternalLink size={16} /></button>
                                                         <button onClick={(e) => { e.stopPropagation(); setProjectToEdit(project); setShowProjectModal(true); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md" title="Rename"><Pencil size={16} /></button>
                                                         <button onClick={(e) => { e.stopPropagation(); setProjectToDelete(project); }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md" title="Delete"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {projects.length === 0 && <p className="text-center text-gray-500 mt-16">No projects yet. Create one to get started!</p>}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;