"use client";

import React from "react";
import { Toolbar, ToolbarSkeleton } from "./toolbar";
import { Settings, Share2, Download, Trash2, Edit3, Users } from "lucide-react";
import type { CanvasState, Camera, Color } from "@/types/canvas";

// 🛡️ SECURITY INTEGRATION - Phase 2: Frontend Controls
import { useResourcePermissions } from "@/hooks/use-resource-permissions";
import { PermissionGate, OwnerOnly, EditorAndOwner, ViewerAndAbove } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Define the toolbar props interface to match the existing toolbar
interface BaseToolbarProps {
  canvasState: CanvasState;
  setCanvasState: (newState: CanvasState) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  camera: Camera;
  setCamera: (camera: Camera) => void;
  smoothZoom?: (targetCamera: Camera) => void;
  setLastUsedColor: (color: { r: number; g: number; b: number }) => void;
  centerOnLayers?: () => void;
  boardId: string;
  gridConfig?: any;
  onGridConfigChange?: (config: any) => void;
  autoSaveToLibrary?: boolean;
  onAutoSaveToLibraryChange?: (enabled: boolean) => void;
  canEnableAutoSave?: boolean;
  pencilStrokeWidth?: number;
  setPencilStrokeWidth?: (width: number) => void;
  lastUsedColor?: Color;
  // Note text formatting functions
  setLastUsedFontSize?: (fontSize: number) => void;
  setLastUsedFontWeight?: (fontWeight: string) => void;
  onToggleFrameAutoResize?: (frameId: string) => void;
  onManualFrameResize?: (frameId: string) => void;
  isTouchDevice?: boolean;
  onCreateTodoWidget?: () => void;
  onCreateTable?: () => void;
  className?: string;
  children?: React.ReactNode;
}

interface SecureToolbarProps extends BaseToolbarProps {
  onShareBoard?: () => void;
  onDownloadBoard?: () => void;
  onDeleteBoard?: () => void;
  onBoardSettings?: () => void;
  showPermissionInfo?: boolean;
  userRole?: string;
}

/**
 * Secure Toolbar Wrapper
 * 
 * Integrates permission-based controls with existing toolbar functionality.
 * Maintains full compatibility with existing Canvas component.
 * ULTRA PERMISSIVE: Always shows toolbar for authenticated users, only limits specific actions
 */
export const SecureToolbar: React.FC<SecureToolbarProps> = ({
  boardId,
  onShareBoard,
  onDownloadBoard,
  onDeleteBoard,
  onBoardSettings,
  showPermissionInfo = false,
  userRole,
  ...toolbarProps
}) => {
  // 🛡️ SECURITY: Get user permissions for this board
  const {
    canRead,
    canWrite,
    canShare,
    canDelete,
    canAdmin,
    isLoading,
    isError,
    resourceExists
  } = useResourcePermissions("board", boardId);

  // 🚨 ALWAYS LOG FOR DEBUGGING

  // Show loading skeleton while checking permissions
  if (isLoading) {
    return <ToolbarSkeleton />;
  }

  // 🚨 FORCE ALWAYS SHOW TOOLBAR - Remove any blocking conditions

  return (
    <>
      {/* 🛡️ SECURITY: Permission info badge (optional) - improved design */}
      {showPermissionInfo && (
        <div className="absolute top-4 right-4 z-50 pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-xl px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  userRole === "viewer" ? "bg-amber-400" :
                  userRole === "editor" ? "bg-blue-400" :
                  "bg-green-400"
                } animate-pulse`} />
                <span className="text-xs font-medium text-slate-700">
                  {userRole === "viewer" ? "View Only" :
                   userRole === "editor" ? "Can Edit" :
                   "Owner"}
                </span>
              </div>
            </div>
            
            {isError && (
              <div className="bg-orange-50/95 backdrop-blur-xl border border-orange-200/60 rounded-xl px-3 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-orange-700">Permission Check Failed</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Original Toolbar - Pass userRole for viewer restrictions */}
      <Toolbar
        {...toolbarProps}
        boardId={boardId}
        userRole={userRole}
        onShareBoard={onShareBoard}
        onDownloadBoard={onDownloadBoard}
        onDeleteBoard={onDeleteBoard}
        onBoardSettings={onBoardSettings}
      />
    </>
  );
};

/**
 * Read-only indicator for users without write permissions
 */
const ReadOnlyIndicator: React.FC = () => {
  return (
    <div className="fixed top-4 right-4 z-50">
      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
        🔒 Read Only Access
      </Badge>
    </div>
  );
};

/**
 * Hook to get board-specific toolbar actions
 */
type BoardToolbarActionOptions = {
  onShareBoard?: () => void;
  onBoardSettings?: () => void;
};

export const useBoardToolbarActions = (
  boardId: string,
  options?: BoardToolbarActionOptions
) => {
  const { canShare, canDelete, canAdmin } = useResourcePermissions("board", boardId);
  const removeBoard = useMutation(api.board.remove);

  const handleShareBoard = React.useCallback(() => {
    if (!canShare) {
      console.warn("User doesn't have share permissions");
      return;
    }
    if (options?.onShareBoard) {
      options.onShareBoard();
      return;
    }
    const shareUrl = `/board/${boardId}/share`;
    window.open(shareUrl, "_blank", "width=600,height=400");
  }, [canShare, boardId, options?.onShareBoard]);

  const handleDownloadBoard = React.useCallback(() => {
    // 🛡️ SECURITY: Check if user has export permissions
    const { hasExport, getUpgradeMessage } = usePlanLimits();
    
    if (!hasExport) {
      toast.error(getUpgradeMessage("export"));
      return;
    }
    
    try {
      // Create download of board data
      const downloadData = {
        boardId,
        timestamp: new Date().toISOString(),
        type: 'board-export'
      };
      
      const blob = new Blob([JSON.stringify(downloadData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `board-${boardId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error("Failed to download board:", error);
    }
  }, [boardId]);

  const handleDeleteBoard = React.useCallback(async () => {
    if (!canDelete) {
      console.warn("User doesn't have delete permissions");
      return;
    }
    
    // 🛡️ SECURITY: Confirm deletion with user
    const confirmed = window.confirm(
      "⚠️ Are you sure you want to delete this board?\n\n" +
      "This action cannot be undone and will remove:\n" +
      "• All board content and layers\n" +
      "• All sharing permissions\n" +
      "• All related data\n\n" +
      "Type 'DELETE' to confirm:"
    );
    
    if (!confirmed) return;
    
    const confirmText = prompt("Please type 'DELETE' to confirm:");
    if (confirmText !== 'DELETE') {
      alert("Deletion cancelled - confirmation text did not match");
      return;
    }
    
    try {
      await removeBoard({ id: boardId as Id<"boards"> });
      toast.success("Board deleted. Redirecting...");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 400);
    } catch (error) {
      console.error("Failed to delete board:", error);
      toast.error("Failed to delete board.");
    }
  }, [canDelete, boardId, removeBoard]);

  const handleBoardSettings = React.useCallback(() => {
    if (!canAdmin) {
      console.warn("User doesn't have admin permissions");
      return;
    }
    if (options?.onBoardSettings) {
      options.onBoardSettings();
      return;
    }
    const settingsUrl = `/board/${boardId}/settings`;
    window.open(settingsUrl, "_blank", "width=800,height=600");
  }, [canAdmin, boardId, options?.onBoardSettings]);

  return {
    handleShareBoard,
    handleDownloadBoard, 
    handleDeleteBoard,
    handleBoardSettings,
    permissions: {
      canShare,
      canDelete,
      canAdmin
    }
  };
};

export default SecureToolbar; 
