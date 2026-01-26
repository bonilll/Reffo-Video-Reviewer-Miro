"use client";

import { memo } from "react";
import { 
  Maximize2, 
  ToggleLeft, 
  ToggleRight,
  Zap,
  Trash2
} from "lucide-react";
import { useStorage } from "@/liveblocks.config";
import { LayerType } from "@/types/canvas";

interface FrameContextMenuProps {
  frameId: string;
  x: number;
  y: number;
  onClose: () => void;
  onToggleAutoResize: (frameId: string) => void;
  onManualResize: (frameId: string) => void;
  onDelete: (frameId: string) => void;
}

export const FrameContextMenu = memo(({ 
  frameId, 
  x, 
  y, 
  onClose, 
  onToggleAutoResize, 
  onManualResize,
  onDelete 
}: FrameContextMenuProps) => {
  const frameLayer = useStorage((root) => root.layers.get(frameId));
  
  if (!frameLayer || frameLayer.type !== LayerType.Frame) {
    return null;
  }

  const frame = frameLayer as any;
  const isAutoResize = frame.autoResize || false;
  const hasChildren = frame.children?.length > 0;

  const handleToggleAutoResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleAutoResize(frameId);
    onClose();
  };

  const handleManualResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    onManualResize(frameId);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(frameId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Context Menu */}
      <div
        className="fixed z-50 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 py-1 min-w-[220px] animate-in fade-in-0 zoom-in-95 duration-150"
        style={{
          left: x,
          top: y,
          transform: 'translate(-50%, -10px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium text-gray-800">
              {frame.title || "Frame"}
            </span>
            {hasChildren && (
              <span className="text-xs text-gray-500 bg-gray-100/60 px-2 py-1 rounded-full font-medium">
                {frame.children.length}
              </span>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-1">
          {/* Auto-Resize Toggle */}
          <button
            onClick={handleToggleAutoResize}
            className="w-full px-4 py-2.5 text-left hover:bg-gray-50/60 flex items-center gap-3 text-sm transition-colors duration-150 group"
          >
            <div className="flex items-center justify-center w-5 h-5">
              {isAutoResize ? (
                <ToggleRight className="w-4 h-4 text-blue-500" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-gray-400 group-hover:text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 text-sm">Auto-Resize</div>
              <div className="text-xs text-gray-500 truncate">
                {isAutoResize ? "Si adatta automaticamente" : "Dimensione fissa"}
              </div>
            </div>
            {isAutoResize && (
              <Zap className="w-3.5 h-3.5 text-blue-500 opacity-60" />
            )}
          </button>

          {/* Manual Resize to Fit */}
          {hasChildren && (
            <button
              onClick={handleManualResize}
              className="w-full px-4 py-2.5 text-left hover:bg-gray-50/60 flex items-center gap-3 text-sm transition-colors duration-150 group"
            >
              <div className="flex items-center justify-center w-5 h-5">
                <Maximize2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm">Adatta al contenuto</div>
                <div className="text-xs text-gray-500 truncate">
                  Ridimensiona una sola volta
                </div>
              </div>
            </button>
          )}

          {/* Separator */}
          <div className="border-t border-gray-100/50 my-1 mx-2"></div>

          {/* Delete Frame */}
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2.5 text-left hover:bg-red-50/60 flex items-center gap-3 text-sm transition-colors duration-150 group"
          >
            <div className="flex items-center justify-center w-5 h-5">
              <Trash2 className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-red-600 text-sm">Elimina Frame</div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
});

FrameContextMenu.displayName = "FrameContextMenu"; 