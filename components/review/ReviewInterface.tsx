"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ReviewSession, ReviewCanvasState, ReviewVideoState, ReviewComment } from "@/types/canvas";
import { ReviewToolbar } from "./ReviewToolbar";
import { ReviewCanvas } from "./ReviewCanvas";
import { ReviewVideoPlayer } from "./ReviewVideoPlayer";
import { MediaContainer, VideoControls } from "./MediaContainer";
import { CompareButton } from "./ComparisonSettingsOverlay";
import { ReviewCommentsSidebar } from "./ReviewCommentsSidebar";
import { ReviewCollaboration } from "./ReviewCollaboration";
import { ReviewAnnotationSelector } from "./ReviewAnnotationSelector";
import { ReviewAnnotationManager } from "./ReviewAnnotationManager";
import { ReviewKeyboardShortcuts } from "./ReviewKeyboardShortcuts";
import { CreateCommentInput } from "./CreateCommentInput";
import { ReviewDeleteConfirmation } from "./ReviewDeleteConfirmation";
import { ReviewSharingModal } from "./ReviewSharingModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Eye, EyeOff, MessageSquare, Pencil, Settings, Sidebar, MoreHorizontal, Maximize2, Minimize2, Share2 } from "lucide-react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

interface ReviewInterfaceProps {
  session: ReviewSession;
}

export function ReviewInterface({ session }: ReviewInterfaceProps) {
  // Auth
  const { user } = useUser();
  
  // Core state
  const theme: 'light' | 'dark' = 'light';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogType, setDeleteDialogType] = useState<"annotation" | "comment" | "annotations" | "comments">("annotation");
  const [deleteDialogCount, setDeleteDialogCount] = useState(0);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [pendingDeleteCallback, setPendingDeleteCallback] = useState<(() => void) | null>(null);
  
  // Canvas state
  const [canvasState, setCanvasState] = useState<ReviewCanvasState>({
    tool: "select",
    color: "#3b82f6",
    strokeWidth: 3,
    opacity: 1,
    isDrawing: false,
    zoom: 1,
    pan: { x: 0, y: 0 }
  });

  // Make canvasState available globally for comment bubbles
  useEffect(() => {
    (window as any).reviewCanvasState = canvasState;
  }, [canvasState]);

  // Video state
  const [videoState, setVideoState] = useState<ReviewVideoState>({
    currentTime: 0,
    currentFrame: 0,
    isPlaying: false,
    duration: 0,
    totalFrames: 0,
    playbackRate: 1,
    volume: 1,
    isMuted: false
  });

  // Selection and interaction state
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [clipboardData, setClipboardData] = useState<any[]>([]);

  // Comment popup state (using anchored popup system)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<ReviewComment | null>(null);
  
  // Comparison modal state
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  
  // Sharing modal state
  const [sharingModalOpen, setSharingModalOpen] = useState(false);
  
  // Define video type early (needed for useEffect dependencies)
  const isVideo = session.primaryAssetType === "video";
  
  // Create compare button component
  const compareButton = useMemo(() => {
    if (!isVideo) return null;
    
    return (
      <CompareButton
        currentMode="normal"
        hasComparisonVideo={false}
        onClick={() => setComparisonModalOpen(true)}
        disabled={false}
      />
    );
  }, [isVideo]);
  
  // Canvas coordinate system state
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [canvasNativeSize, setCanvasNativeSize] = useState({ width: 800, height: 600 });

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(0);

  // Data fetching (moved up to be available early)
  const annotations = useQuery(api.review.getAnnotations, {
    sessionId: session._id as Id<"reviewSessions">
  });

  const comments = useQuery(api.review.getComments, {
    sessionId: session._id as Id<"reviewSessions">
  });

  // Filter annotations for current frame (for videos only) - moved up
  const currentFrameAnnotations = useMemo(() => {
    if (!annotations) return [];
    
    // For videos, only show annotations from current frame
    if (isVideo) {
      return annotations.filter(annotation => 
        annotation.frameNumber === videoState.currentFrame
      );
    }
    
    // For static images, show all annotations
    return annotations;
  }, [annotations, isVideo, videoState.currentFrame]);

  // Filter comments for current frame (for videos only) - moved up
  const currentFrameComments = useMemo(() => {
    if (!comments) return [];
    
    // For videos, only show comments from current frame
    if (isVideo) {
      return comments.filter(comment => 
        comment.frameNumber === videoState.currentFrame
      );
    }
    
    // For static images, show all comments
    return comments;
  }, [comments, isVideo, videoState.currentFrame]);

  // Check responsive breakpoints and calculate available height
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setIsMobile(width < 640);
      setIsTablet(width >= 640 && width < 1024);
      
      // Auto-close sidebar on mobile
      if (width < 768) {
        setSidebarOpen(false);
      }
      
      // Calculate precise heights for optimal viewport usage
      const headerHeight = isMobile ? 112 : 64; // Main header
      const topbarHeight = isMobile ? 48 : 0; // Mobile view controls bar
      
      // Video controls height - estimate based on current VideoControls implementation
      // Minimized: ~40px, Expanded: ~160px (approximate average for calculation)
      const videoControlsHeight = isVideo ? 100 : 0;
      
      // Calculate available height for media container, accounting for all UI elements
      const totalReservedHeight = headerHeight + topbarHeight + videoControlsHeight;
      const availableHeightValue = Math.max(400, height - totalReservedHeight); // Minimum 400px
      
      setAvailableHeight(availableHeightValue);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, isVideo]);

  // Clear selection when tool changes (following board pattern)
  useEffect(() => {
    if (canvasState.tool !== "select") {
      setSelectedAnnotationIds([]);
      setSelectedCommentIds([]);
    }
  }, [canvasState.tool]);

  // Clear selection when frame changes for videos (selected items might not be visible anymore)
  useEffect(() => {
    if (isVideo) {
      setSelectedAnnotationIds([]);
      setSelectedCommentIds([]);
    }
  }, [videoState.currentFrame, isVideo]);

  // Update canvas rect and native size dynamically
  useEffect(() => {
    const updateCanvasInfo = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCanvasRect(rect);
        setCanvasNativeSize({
          width: canvas.width,
          height: canvas.height
        });
      }
    };

    // Initial update
    updateCanvasInfo();

    // Update on resize
    window.addEventListener('resize', updateCanvasInfo);
    
    // Update on video state changes (for video player)
    const interval = setInterval(updateCanvasInfo, 1000);

    return () => {
      window.removeEventListener('resize', updateCanvasInfo);
      clearInterval(interval);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Data fetching (annotations and comments moved up)
  const presence = useQuery(api.review.getSessionPresence, {
    sessionId: session._id as Id<"reviewSessions">
  });

  const deleteAnnotation = useMutation(api.review.deleteAnnotation);
  const deleteComment = useMutation(api.review.deleteComment);
  const updateAnnotation = useMutation(api.review.updateAnnotation);
  const batchUpdateCommentPositions = useMutation(api.review.batchUpdateCommentPositions);

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    
    const lastActionId = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, lastActionId]);
    setUndoStack(prev => prev.slice(0, -1));
    
    // Delete the last annotation
    try {
      await deleteAnnotation({ annotationId: lastActionId as Id<"reviewAnnotations"> });
    } catch (error) {
      console.error("Error undoing annotation:", error);
    }
  };

  const handleRedo = useCallback(() => {
    // Implement redo functionality
  }, []);

  const addToUndoStack = (annotationId: string) => {
    setUndoStack(prev => [...prev, annotationId]);
    setRedoStack([]); // Clear redo stack when new action is performed
  };

  // Selection handlers
  const handleAnnotationSelect = (annotationIds: string[]) => {
    setSelectedAnnotationIds(annotationIds);
  };

  const handleCommentSelect = (commentIds: string[]) => {
    setSelectedCommentIds(commentIds);
  };

  const handleCommentMove = async (commentIds: string[], deltaX: number, deltaY: number) => {
    try {
      // Find the comments to update
      const commentsToUpdate: any[] = [];
      
      for (const id of commentIds) {
        const comment = comments?.find(c => c._id === id);
        if (!comment) continue;

        // Calculate new position
        const newPosition = {
          x: comment.position.x + deltaX,
          y: comment.position.y + deltaY
        };

        commentsToUpdate.push({
          commentId: id,
          position: newPosition
        });
      }

      if (commentsToUpdate.length === 0) {
        console.warn("No valid comments to update");
        return;
      }

      // Update all comment positions in batch
      await batchUpdateCommentPositions({ updates: commentsToUpdate });
      
      console.log(`Successfully moved ${commentsToUpdate.length} comments`);
    } catch (error) {
      console.error("Error moving comments:", error);
    }
  };

  const handleCommentClick = (comment: ReviewComment, position: { x: number; y: number }) => {
    console.log('🟢 ReviewInterface handleCommentClick called:', {
      commentId: comment._id,
      currentActiveCommentId: activeCommentId,
      willToggle: activeCommentId === comment._id
    });
    
    // Toggle behavior: if clicking on the same comment that's already open, close it
    if (activeCommentId === comment._id) {
      // Same comment clicked - close it
      console.log('📄 Closing comment');
      setActiveCommentId(null);
      setActiveComment(null);
    } else {
      // Different comment clicked - open it (or first time opening)
      console.log('📝 Opening comment');
      setActiveComment(comment);
      setActiveCommentId(comment._id);
    }
  };

  const handleCommentPopupClose = () => {
    setActiveCommentId(null);
    setActiveComment(null);
  };

  const handleCommentUpdate = () => {
    // Refresh comments data - handled by Convex reactivity
  };

  const handleAnnotationDelete = async (annotationIds: string[]) => {
    const count = annotationIds.length;
    
    // Show custom confirmation dialog
    setDeleteDialogType(count === 1 ? "annotation" : "annotations");
    setDeleteDialogCount(count);
    setPendingDeleteIds(annotationIds);
    setPendingDeleteCallback(() => async () => {
      for (const id of annotationIds) {
        try {
          await deleteAnnotation({ annotationId: id as Id<"reviewAnnotations"> });
        } catch (error) {
          console.error("Error deleting annotation:", error);
        }
      }
      setSelectedAnnotationIds([]);
    });
    setDeleteDialogOpen(true);
  };

  const handleCommentDelete = async (commentIds: string[]) => {
    const count = commentIds.length;
    
    // Show custom confirmation dialog
    setDeleteDialogType(count === 1 ? "comment" : "comments");
    setDeleteDialogCount(count);
    setPendingDeleteIds(commentIds);
    setPendingDeleteCallback(() => async () => {
      for (const id of commentIds) {
        try {
          await deleteComment({ commentId: id as Id<"reviewComments"> });
        } catch (error) {
          console.error("Error deleting comment:", error);
        }
      }
      setSelectedCommentIds([]);
    });
    setDeleteDialogOpen(true);
  };

  const handleAnnotationDuplicate = async (annotationIds: string[]) => {
    // For now, just clear selection - duplication would need a specific API
    setSelectedAnnotationIds([]);
  };

  const handleAnnotationMove = async (annotationIds: string[], deltaX: number, deltaY: number) => {
    for (const id of annotationIds) {
      try {
        // Find the annotation to update
        const annotation = annotations?.find(a => a._id === id);
        if (!annotation) continue;

        console.log("Moving annotation:", { id, deltaX, deltaY, currentPosition: annotation.position });

        // Update position with delta (coordinates should already be normalized)
        const newPosition = {
          x: annotation.position.x + deltaX,
          y: annotation.position.y + deltaY
        };

        // Update bounds if they exist (coordinates should already be normalized)
        let newBounds = annotation.drawingData.bounds;
        if (newBounds) {
          newBounds = {
            ...newBounds,
            x: newBounds.x + deltaX,
            y: newBounds.y + deltaY
          };
        }

        // Update points for freehand annotations (coordinates should already be normalized)
        let newPoints = annotation.drawingData.points;
        if (newPoints) {
          newPoints = newPoints.map(point => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }));
        }

        console.log("Updating annotation with:", { 
          newPosition, 
          newBounds, 
          pointsCount: newPoints?.length 
        });

        // Update the annotation via API
        await updateAnnotation({ 
          annotationId: id as any,
          updates: {
            position: newPosition,
            drawingData: {
              ...annotation.drawingData,
              bounds: newBounds,
              points: newPoints
            }
          }
        });
      } catch (error) {
        console.error("Error moving annotation:", error);
      }
    }
  };

  const handleAnnotationResize = async (annotationId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const annotation = annotations?.find(a => a._id === annotationId);
      if (!annotation) return;

      // Handle freehand annotations differently - scale the points
      if (annotation.type === "freehand" && annotation.drawingData.points) {
        // Calculate original bounds from points
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        annotation.drawingData.points.forEach(point => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });

        const originalBounds = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };

        // Calculate scale factors
        const scaleX = bounds.width / originalBounds.width;
        const scaleY = bounds.height / originalBounds.height;

        // Scale all points
        const scaledPoints = annotation.drawingData.points.map(point => ({
          x: bounds.x + (point.x - originalBounds.x) * scaleX,
          y: bounds.y + (point.y - originalBounds.y) * scaleY
        }));

        // Update with scaled points
        await updateAnnotation({ 
          annotationId: annotationId as any,
          updates: {
            position: { x: bounds.x, y: bounds.y },
            drawingData: {
              ...annotation.drawingData,
              points: scaledPoints
            }
          }
        });
      } else {
        // Handle bounded annotations (rectangles, circles, etc.)
        const newPosition = { x: bounds.x, y: bounds.y };
        const newBounds = { ...bounds };

        await updateAnnotation({ 
          annotationId: annotationId as any,
          updates: {
            position: newPosition,
            drawingData: {
              ...annotation.drawingData,
              bounds: newBounds
            }
          }
        });
      }
    } catch (error) {
      console.error("Error resizing annotation:", error);
    }
  };

  const handleAnnotationRotate = async (annotationId: string, rotation: number) => {
    // TODO: Implement rotation when schema supports it
    console.log("Rotation not yet supported in schema:", { annotationId, rotation });
  };

  const handleAnnotationTransform = async (annotationId: string, transform: { x: number; y: number; width: number; height: number; rotation?: number }) => {
    // For now, just handle position and size changes
    await handleAnnotationResize(annotationId, {
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height
    });
  };


  const handleAnnotationToggleVisibility = async (annotationIds: string[], visible: boolean) => {
    for (const id of annotationIds) {
      try {
        // Note: visibility toggle not implemented in API yet
        // TODO: Implement visibility toggle
      } catch (error) {
        console.error("Error toggling annotation visibility:", error);
      }
    }
  };

  // State for frame jump target
  const [frameJumpTarget, setFrameJumpTarget] = useState<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  
  // Video controls state
  const [videoControlsState, setVideoControlsState] = useState<{
    videoReady: boolean;
    controlsMinimized: boolean;
    isLoopEnabled: boolean;
    isMuted: boolean;
    volume: number;
    timelineRef: React.RefObject<HTMLDivElement>;
    videoRef: React.RefObject<HTMLVideoElement>;
  } | null>(null);

  const handleFrameJump = (frameNumber: number) => {
    // Set the frame jump target to trigger the jump in the video player
    setFrameJumpTarget(frameNumber);
    
    // Also update video state for consistency
    setVideoState(prev => {
      // Calculate time based on frame number
      // Assuming 30 FPS as default, but use totalFrames if available
      const fps = prev.totalFrames > 0 && prev.duration > 0 
        ? prev.totalFrames / prev.duration 
        : 30;
      
      // Calculate time to ensure Math.floor(currentTime * fps) = frameNumber
      // Add small offset to ensure we're within the correct frame
      const newTime = (frameNumber + 0.001) / fps;
      
      return {
        ...prev,
        currentFrame: frameNumber,
        currentTime: newTime
      };
    });
  };

  const handleVideoStateChange = (newVideoState: ReviewVideoState) => {
    setVideoState(newVideoState);
    // Update videoReady when video state changes and has duration
    if (newVideoState.duration > 0 && !videoReady) {
      setVideoReady(true);
    }
  };

  const handleSelectAll = () => {
    if (!currentFrameAnnotations) return;
    
    const allIds = currentFrameAnnotations.map(a => a._id);
    setSelectedAnnotationIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedAnnotationIds([]);
    setSelectedCommentIds([]);
  };

  const handleCopyAnnotations = useCallback(() => {
    if (selectedAnnotationIds.length === 0) return;
    
    const annotationData = selectedAnnotationIds.map(id => 
      currentFrameAnnotations.find(a => a._id === id)
    ).filter(Boolean);
    
    setClipboardData(annotationData);
  }, [selectedAnnotationIds, currentFrameAnnotations]);

  const handlePasteAnnotations = useCallback(() => {
    if (clipboardData.length === 0) return;
    
    // TODO: Implement paste functionality
    // This would involve creating new annotations based on clipboard data
    // with new IDs and potentially offset positions
    
    setClipboardData([]);
  }, [clipboardData]);

  // Reset frame jump target after it's been processed
  useEffect(() => {
    if (frameJumpTarget !== null) {
      // Reset after a short delay to allow the video player to process the jump
      const timer = setTimeout(() => {
        setFrameJumpTarget(null);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [frameJumpTarget]);

  // Test frame jump on page load - runs only once
  useEffect(() => {
    if (isVideo && videoReady) {
      // Test sequence: frame 1 -> frame 0 -> stop
      const testSequence = async () => {
        console.log("🔄 Starting frame jump test sequence...");
        
        // Wait for video to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Jump to frame 1
        console.log("📍 Jumping to frame 1");
        handleFrameJump(1);
        
        // Wait 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Jump to frame 0
        console.log("📍 Jumping to frame 0");
        handleFrameJump(0);
        
        console.log("✅ Frame jump test sequence completed");
      };
      
      testSequence();
    }
  }, [isVideo, videoReady]); // Only run when video becomes ready

  // Calculate annotated frames
  const annotatedFrames = useMemo(() => {
    const frames = new Set<number>();
    
    if (annotations) {
      annotations.forEach(annotation => {
        if (annotation.frameNumber !== undefined) {
          frames.add(annotation.frameNumber);
        }
      });
    }
    
    if (comments) {
      comments.forEach(comment => {
        if (comment.frameNumber !== undefined) {
          frames.add(comment.frameNumber);
        }
      });
    }
    
    return Array.from(frames).sort((a, b) => a - b);
  }, [annotations, comments]);

  // Modern theme system - simplified classes
  const baseClasses = {
    container: theme === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900',
    header: theme === 'dark' ? 'bg-gray-900/95 border-gray-800 backdrop-blur-sm' : 'bg-white/95 border-gray-200 backdrop-blur-sm',
    sidebar: theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    panel: theme === 'dark' ? 'bg-gray-900/90 border-gray-800' : 'bg-white/90 border-gray-200',
    ghost: theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    border: theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
    textPrimary: theme === 'dark' ? 'text-white' : 'text-gray-900',
    textSecondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-700',
    textMuted: theme === 'dark' ? 'text-gray-500' : 'text-gray-500',
    separator: theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
  };

  return (
    <div className={`${baseClasses.container} h-screen flex flex-col transition-colors duration-300`} style={{ backgroundColor: theme === 'dark' ? '#0f0f23' : '#f8fafc' }}>
      {/* Modern Header */}
      <div className={`${baseClasses.header} border-b z-50 sticky top-0`}>
        <div className="px-4 lg:px-6 py-2">
          <div className="flex items-center justify-between">
            {/* Left Section - Back Button, Title and Info */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {/* Back to Board Button */}
                <Link href={`/board/${session.boardId}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`${baseClasses.ghost} flex items-center gap-2`}
                    title="Torna alla board"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                
                <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-black rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  R
                </div>
                <div className="hidden sm:block">
                  <h1 className={`font-bold text-lg ${baseClasses.textPrimary}`}>
                    {session.title || 'Review Session'}
                  </h1>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge 
                      variant={session.status === "active" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {session.status === "active" ? "Active" : 
                       session.status === "completed" ? "Completed" : "Archived"}
                    </Badge>
                    <span className={`${baseClasses.textMuted} hidden md:inline`}>
                      {presence?.length || 0} online
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Section - View Controls (Desktop) */}
            {!isMobile && (
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 border ${baseClasses.border} rounded-xl p-1 bg-gray-50/50 dark:bg-gray-800/50`}>
                  <Button
                    variant={showAnnotations ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setShowAnnotations(!showAnnotations)}
                    className="text-xs h-8 gap-2"
                  >
                    <Pencil className="h-3 w-3" />
                    {!isTablet && <span>Annotations</span>}
                  </Button>
                  <Button
                    variant={showComments ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setShowComments(!showComments)}
                    className="text-xs h-8 gap-2"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {!isTablet && <span>Comments</span>}
                  </Button>
                </div>
              </div>
            )}

            {/* Right Section - Actions */}
            <div className="flex items-center gap-2">
              {/* Mobile menu for view controls */}
              {isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${baseClasses.ghost} h-9 w-9 p-0 rounded-xl`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              )}

              {/* Fullscreen toggle */}
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className={`${baseClasses.ghost} h-9 w-9 p-0 rounded-xl`}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}

              {/* Sharing settings - Only for owner */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSharingModalOpen(true)}
                className={`${baseClasses.ghost} h-9 w-9 p-0 rounded-xl`}
                title="Impostazioni condivisione"
              >
                <Share2 className="h-4 w-4" />
              </Button>

              {/* Sidebar toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`${baseClasses.ghost} h-9 w-9 p-0 rounded-xl relative`}
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <Sidebar className="h-4 w-4" />
                {comments && comments.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-xs text-white font-bold">
                      {comments.length > 9 ? '9+' : comments.length}
                    </span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View Controls */}
      {isMobile && (
        <div className={`${baseClasses.header} border-b px-4 py-1`}>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant={showAnnotations ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowAnnotations(!showAnnotations)}
              className="text-xs gap-2 flex-1"
            >
              <Pencil className="h-3 w-3" />
              <span>Annotations</span>
            </Button>
            <Button
              variant={showComments ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowComments(!showComments)}
              className="text-xs gap-2 flex-1"
            >
              <MessageSquare className="h-3 w-3" />
              <span>Comments</span>
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" style={{ height: `${availableHeight}px` }}>
        {/* Left Panel - Toolbar (Desktop & Tablet) */}
        {session.settings.allowDrawing && !isMobile && (
          <div className={`${baseClasses.panel} w-16 lg:w-20 flex flex-col items-center py-4 border-r`}>
            <ReviewToolbar
              canvasState={canvasState}
              onCanvasStateChange={setCanvasState}
              availableTools={["select", ...session.settings.drawingTools]}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              theme={theme}
              selectedAnnotations={selectedAnnotationIds}
              onAnnotationSelect={handleAnnotationSelect}
              onAnnotationDelete={handleAnnotationDelete}
              onAnnotationDuplicate={handleAnnotationDuplicate}
              onAnnotationMove={handleAnnotationMove}
              compareButton={compareButton}
            />
          </div>
        )}

        {/* Center Panel - Unified Media Container */}
        <div className={`flex-1 flex flex-col relative ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`}>
          <div className={`flex-1 relative overflow-hidden ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`} style={{ height: `${availableHeight}px` }}>
            <MediaContainer
              mediaUrl={session.primaryAssetUrl}
              mediaType={isVideo ? "video" : "image"}
              mediaWidth={isVideo ? 1920 : canvasNativeSize.width}
              mediaHeight={isVideo ? 1080 : canvasNativeSize.height}
              canvasState={canvasState}
              onCanvasStateChange={setCanvasState}
              videoState={videoState}
              onVideoStateChange={handleVideoStateChange}
              annotations={currentFrameAnnotations}
              comments={currentFrameComments}
              selectedAnnotationIds={selectedAnnotationIds}
              selectedCommentIds={selectedCommentIds}
              onAnnotationSelect={handleAnnotationSelect}
              onCommentSelect={handleCommentSelect}
              onAnnotationMove={handleAnnotationMove}
              onCommentMove={handleCommentMove}
              onAnnotationResize={handleAnnotationResize}
              onAnnotationCreated={addToUndoStack}
              onCommentClick={handleCommentClick}
              showAnnotations={showAnnotations}
              showComments={showComments}
              theme={theme}
              sessionId={session._id}
              assetId={session.primaryAssetId}
              annotatedFrames={annotatedFrames}
              maxHeight={availableHeight}
              openDropdownCommentId={undefined}
              openPopupCommentId={activeCommentId}
              onPopupClose={handleCommentPopupClose}
              onCommentUpdate={handleCommentUpdate}
              frameJumpTarget={frameJumpTarget}
              comparisonModalOpen={comparisonModalOpen}
              onComparisonModalChange={setComparisonModalOpen}
              onVideoControlsStateChange={setVideoControlsState}
            />
          </div>
          
          {/* Video Controls (fixed at bottom) */}
          {isVideo && videoState && videoControlsState && (
            <div className="absolute left-0 right-0 bottom-0 z-10">
              <VideoControls
                videoState={videoState}
                onVideoStateChange={handleVideoStateChange}
                videoRef={videoControlsState.videoRef}
                videoReady={videoControlsState.videoReady}
                setVideoReady={(ready) => {
                  setVideoControlsState(prev => prev ? { ...prev, videoReady: ready } : null);
                }}
                controlsMinimized={videoControlsState.controlsMinimized}
                setControlsMinimized={(minimized) => {
                  setVideoControlsState(prev => prev ? { ...prev, controlsMinimized: minimized } : null);
                }}
                isLoopEnabled={videoControlsState.isLoopEnabled}
                setIsLoopEnabled={(enabled) => {
                  setVideoControlsState(prev => prev ? { ...prev, isLoopEnabled: enabled } : null);
                }}
                isMuted={videoControlsState.isMuted}
                setIsMuted={(muted) => {
                  setVideoControlsState(prev => prev ? { ...prev, isMuted: muted } : null);
                }}
                volume={videoControlsState.volume}
                setVolume={(volume) => {
                  setVideoControlsState(prev => prev ? { ...prev, volume } : null);
                }}
                timelineRef={videoControlsState.timelineRef}
                annotatedFrames={annotatedFrames}
                theme={theme}
              />
            </div>
          )}

          {/* Mobile Toolbar - Floating */}
          {session.settings.allowDrawing && isMobile && (
            <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 ${baseClasses.panel} rounded-2xl border shadow-2xl p-2 backdrop-blur-sm`}>
              <div className="flex items-center gap-2">
                <ReviewToolbar
                  canvasState={canvasState}
                  onCanvasStateChange={setCanvasState}
                  availableTools={["select", ...session.settings.drawingTools.slice(0, 4)]}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  theme={theme}
                  selectedAnnotations={selectedAnnotationIds}
                  onAnnotationSelect={handleAnnotationSelect}
                  onAnnotationDelete={handleAnnotationDelete}
                  onAnnotationDuplicate={handleAnnotationDuplicate}
                  onAnnotationMove={handleAnnotationMove}
                  compareButton={compareButton}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Comments & Collaboration */}
        {sidebarOpen && (
          <div 
            className={`
              ${baseClasses.sidebar} border-l flex flex-col transition-all duration-300
              ${isMobile 
                ? 'absolute right-0 top-0 bottom-0 w-80 z-40 shadow-2xl' 
                : 'w-80 lg:w-96 relative'
              }
            `}
          >
            {/* Mobile sidebar overlay */}
            {isMobile && (
              <div 
                className="fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            
            <div className="flex-1 flex flex-col relative z-50">
              <ReviewCommentsSidebar
                session={session}
                comments={comments || []}
                currentFrame={isVideo ? videoState.currentFrame : undefined}
                showComments={showComments}
                theme={theme}
                onFrameJump={handleFrameJump}
              />
              
              <div className={`border-t ${baseClasses.separator}`}>
                <ReviewCollaboration
                  session={session}
                  presence={presence || []}
                  theme={theme}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Handler */}
      <ReviewKeyboardShortcuts
        canvasState={canvasState}
        onCanvasStateChange={setCanvasState}
        selectedAnnotationIds={selectedAnnotationIds}
        selectedCommentIds={selectedCommentIds}
        onAnnotationSelect={handleAnnotationSelect}
        onCommentSelect={handleCommentSelect}
        onAnnotationDelete={handleAnnotationDelete}
        onCommentDelete={handleCommentDelete}
        onAnnotationDuplicate={handleAnnotationDuplicate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopyAnnotations}
        onPaste={handlePasteAnnotations}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        disabled={false}
      />

      {/* Delete Confirmation Dialog */}
      <ReviewDeleteConfirmation
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => {
          if (pendingDeleteCallback) {
            pendingDeleteCallback();
          }
        }}
        itemType={deleteDialogType}
        itemCount={deleteDialogCount}
      />

      {/* Sharing Modal */}
      <ReviewSharingModal
        isOpen={sharingModalOpen}
        onClose={() => setSharingModalOpen(false)}
        sessionId={session._id}
        sessionTitle={session.title || 'Review Session'}
        isOwner={session.createdBy === user?.id}
      />

      {/* Comment popup is now handled by anchored system in CommentBubble */}
    </div>
  );
}
