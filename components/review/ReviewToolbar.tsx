"use client";

import { ReviewCanvasState, ReviewDrawingTool } from "@/types/canvas";
import { 
  Pencil, 
  Square, 
  Circle, 
  ArrowUp, 
  Type, 
  Eraser,
  Undo,
  Redo,
  MousePointer,
  Copy,
  Trash2,
  Move3D,
  RotateCw,
  MessageSquare
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface ReviewToolbarProps {
  canvasState: ReviewCanvasState;
  onCanvasStateChange: (state: ReviewCanvasState) => void;
  availableTools: string[];
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  theme?: 'dark' | 'light';
  selectedAnnotations?: string[];
  onAnnotationSelect?: (annotationIds: string[]) => void;
  onAnnotationDelete?: (annotationIds: string[]) => void;
  onAnnotationDuplicate?: (annotationIds: string[]) => void;
  onAnnotationMove?: (annotationIds: string[], deltaX: number, deltaY: number) => void;
  compareButton?: React.ReactNode;
}

const toolIcons = {
  select: MousePointer,
  freehand: Pencil,
  rectangle: Square,
  circle: Circle,
  arrow: ArrowUp,
  eraser: Eraser,
  comment: MessageSquare
};

const toolNames = {
  select: "Select",
  freehand: "Freehand",
  rectangle: "Rectangle",
  circle: "Circle",
  arrow: "Arrow",
  eraser: "Eraser",
  comment: "Comment"
};

const colors = [
  "#ef4444", // red
  "#f97316", // orange  
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#6b7280", // gray
  "#000000", // black
  "#ffffff"  // white
];

const strokeWidths = [1, 2, 3, 5, 8, 12];

// Professional Tool Button (same style as board toolbar)
const ToolButton = ({
  icon: Icon,
  onClick,
  isActive = false,
  isDisabled = false,
  title,
  size = "md"
}: {
  icon: any;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  title?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9", 
    lg: "w-10 h-10"
  };
  
  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  return (
    <button
      disabled={isDisabled}
      onClick={onClick}
      title={title}
      className={`
        relative ${sizeClasses[size]} rounded-xl flex items-center justify-center
        transition-all duration-300 ease-out group
        border border-transparent backdrop-blur-sm
        ${
        isActive 
            ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/25 border-slate-700/50 scale-105 ring-2 ring-slate-400/20" 
            : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 active:scale-95"
        } 
        ${
          isDisabled 
            ? "opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none" 
            : "cursor-pointer"
        }
        focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
        touch-manipulation
      `}
      style={{
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Gradient overlay per depth quando attivo */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-xl pointer-events-none" />
      )}
      
      {/* Icon con micro-animazioni */}
      <Icon className={`${iconSizes[size]} relative z-10 transition-all duration-300 ${
        isActive 
          ? 'drop-shadow-sm text-white' 
          : 'group-hover:scale-110 group-hover:text-slate-700'
      }`} />
      
      {/* Indicatore di stato attivo migliorato */}
      {isActive && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-lg shadow-slate-900/50 animate-pulse" />
      )}
      
      {/* Subtle glow quando attivo */}
      {isActive && (
        <div className="absolute -inset-px bg-gradient-to-r from-slate-600/20 via-slate-500/20 to-slate-600/20 rounded-xl blur-sm -z-10" />
      )}
    </button>
  );
};

// Color Button with professional styling
const ColorButton = ({
  color,
  isSelected,
  onClick,
}: {
  color: string;
  isSelected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-7 h-7 rounded-lg flex items-center justify-center
        transition-all duration-200 ease-out
        border-2 ${isSelected ? 'border-slate-800 shadow-lg shadow-black/25 scale-110 ring-2 ring-slate-300/40' : 'border-gray-300/60 hover:border-gray-400/80'}
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-1
        relative group
      `}
      style={{
        backgroundColor: color,
        WebkitTapHighlightColor: 'transparent',
      }}
      title={`Color: ${color}`}
    >
      {/* White indicator for black colors */}
      {color === "#000000" && (
        <div className="w-2.5 h-2.5 rounded-full border border-white/60" />
      )}
      {/* Dark indicator for white colors */}
      {color === "#ffffff" && (
        <div className="w-2.5 h-2.5 rounded-full border border-gray-500" />
      )}
      
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-slate-800 rounded-full border border-white shadow-md" />
      )}
    </button>
  );
};

// Stroke Width Button
const StrokeButton = ({
  width,
  isSelected,
  onClick,
}: {
  width: number;
  isSelected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-9 h-9 rounded-xl flex items-center justify-center
        transition-all duration-300 ease-out
        border border-transparent backdrop-blur-sm
        ${
        isSelected 
            ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/25 border-slate-700/50 scale-105" 
            : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105"
        }
        focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
      `}
      title={`Thickness: ${width}px`}
    >
      <div 
        className={`rounded-full ${isSelected ? 'bg-white' : 'bg-slate-600'}`}
        style={{ 
          width: Math.max(2, Math.min(width, 12)), 
          height: Math.max(2, Math.min(width, 12)) 
        }} 
      />
    </button>
  );
};

export function ReviewToolbar({
  canvasState,
  onCanvasStateChange,
  availableTools,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  theme = 'light',
  selectedAnnotations = [],
  onAnnotationSelect,
  onAnnotationDelete,
  onAnnotationDuplicate,
  onAnnotationMove,
  compareButton
}: ReviewToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Calculate popup position when opening
  const handleColorPickerToggle = () => {
    if (!showColorPicker && colorButtonRef.current) {
      const rect = colorButtonRef.current.getBoundingClientRect();
      setPopupPosition({
        x: rect.right + 12, // 12px gap to the right
        y: rect.top + (rect.height / 2) // Center vertically
      });
    }
    setShowColorPicker(!showColorPicker);
  };

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showColorPicker &&
        colorPickerRef.current &&
        colorButtonRef.current &&
        !colorPickerRef.current.contains(event.target as Node) &&
        !colorButtonRef.current.contains(event.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Close color picker on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showColorPicker) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showColorPicker]);

  const setTool = (tool: ReviewDrawingTool) => {
    onCanvasStateChange({
      ...canvasState,
      tool
    });
  };

  const setColor = (color: string) => {
    onCanvasStateChange({
      ...canvasState,
      color
    });
  };

  const setStrokeWidth = (strokeWidth: number) => {
    onCanvasStateChange({
      ...canvasState,
      strokeWidth
    });
  };

  const hasSelectedAnnotations = selectedAnnotations.length > 0;

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50 max-h-[80vh] overflow-y-auto">
      <div 
        className="flex flex-col gap-3 p-3 rounded-2xl shadow-lg border border-gray-200/60 max-w-[64px]"
        style={{ backgroundColor: '#fcfcfc' }}
      >
        {/* Selection Tool - Always first */}
        <ToolButton
          icon={MousePointer}
          onClick={() => setTool("select" as ReviewDrawingTool)}
          isActive={canvasState.tool === "select"}
          title={toolNames.select}
        />

        {/* Separator */}
        <div className="h-px bg-gray-200/60" />

        {/* Drawing Tools */}
        <div className="flex flex-col gap-2">
          {availableTools.map((toolName) => {
            const tool = toolName as ReviewDrawingTool;
            if (tool === "select") return null; // Skip select tool here
            const Icon = toolIcons[tool];
            if (!Icon) return null;

            return (
              <ToolButton
                key={tool}
                icon={Icon}
                onClick={() => setTool(tool)}
                isActive={canvasState.tool === tool}
                title={toolNames[tool]}
              />
            );
          })}
        </div>

        {/* Compare Button - positioned next to annotation/comment tools */}
        {compareButton && (
          <>
            {/* Separator */}
            <div className="h-px bg-gray-200/60" />
            
            {/* Compare Button */}
            <div className="flex justify-center">
              {compareButton}
            </div>
          </>
        )}

        {/* Separator */}
        <div className="h-px bg-gray-200/60" />

        {/* Undo/Redo */}
        <div className="flex flex-col gap-2">
          <ToolButton
            icon={Undo}
            onClick={onUndo || (() => {})}
            isDisabled={!canUndo}
            title="Undo"
            size="sm"
          />
          <ToolButton
            icon={Redo}
            onClick={onRedo || (() => {})}
            isDisabled={!canRedo}
            title="Redo"
            size="sm"
          />
        </div>

        {/* Color Picker */}
        {canvasState.tool !== "select" && canvasState.tool !== "eraser" && (
          <>
            {/* Separator */}
            <div className="h-px bg-gray-200/60" />
            
            {/* Current Color Display */}
            <button
              ref={colorButtonRef}
              onClick={handleColorPickerToggle}
              className={`w-9 h-9 rounded-xl border-2 transition-all duration-300 hover:scale-105 shadow-sm relative ${
                showColorPicker 
                  ? 'border-slate-800 shadow-lg shadow-black/25 scale-105' 
                  : 'border-gray-300/60 hover:border-gray-400/80'
              }`}
              style={{ backgroundColor: canvasState.color }}
              title="Select color"
            >
              {canvasState.color === "#000000" && (
                <div className="w-4 h-4 mx-auto rounded-full border border-white/50" />
              )}
              {canvasState.color === "#ffffff" && (
                <div className="w-4 h-4 mx-auto rounded-full border border-gray-400" />
              )}
              
              {/* Active indicator */}
              {showColorPicker && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-slate-800 rounded-full border-2 border-white shadow-lg" />
              )}
            </button>

            {/* Stroke Width */}
            <div className="flex flex-col gap-1.5">
              {strokeWidths.map((width) => (
                <StrokeButton
                  key={width}
                  width={width}
                  isSelected={canvasState.strokeWidth === width}
                  onClick={() => setStrokeWidth(width)}
                />
              ))}
            </div>
          </>
        )}

        {/* Selection Actions - Only show when annotations are selected */}
        {hasSelectedAnnotations && (
          <>
            {/* Separator */}
            <div className="h-px bg-gray-200/60" />
            
            <div className="flex flex-col gap-2">
              {/* Action Buttons */}
              {onAnnotationDuplicate && (
                <ToolButton
                  icon={Copy}
                  onClick={() => onAnnotationDuplicate(selectedAnnotations)}
                  title="Duplicate selection"
                  size="sm"
                />
              )}
              
              {onAnnotationDelete && (
                <ToolButton
                  icon={Trash2}
                  onClick={() => onAnnotationDelete(selectedAnnotations)}
                  title="Delete selection"
                  size="sm"
                />
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Color Picker Popup - Using portal to render in document body */}
      {showColorPicker && typeof window !== 'undefined' && createPortal(
        <div 
          ref={colorPickerRef}
          className="fixed z-[9999] pointer-events-auto"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: 'translateY(-50%)'
          }}
        >
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200/60 shadow-2xl shadow-black/10 p-4 min-w-[160px]">
            <div className="text-xs font-medium text-gray-600 mb-3 text-center">Choose Color</div>
            
            {/* Color Grid - Better organized */}
            <div className="grid grid-cols-5 gap-2">
              {colors.map((color) => (
                <ColorButton
                  key={color}
                  color={color}
                  isSelected={canvasState.color === color}
                  onClick={() => {
                    setColor(color);
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </div>
            
            {/* Current color info */}
            <div className="mt-3 pt-3 border-t border-gray-200/60">
              <div className="text-xs text-gray-500 text-center font-mono">
                {canvasState.color.toUpperCase()}
              </div>
            </div>
          </div>
          
          {/* Arrow pointer to toolbar */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-gray-200/60"></div>
            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white/95 absolute left-0.5 top-1/2 -translate-y-1/2"></div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
