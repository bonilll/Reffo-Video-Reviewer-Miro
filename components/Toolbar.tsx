import React from 'react';
import { AnnotationTool } from '../types';
import { MousePointer2, Pen, Square, Circle, MoveUpRight, MessageSquare, Undo, Redo, SquareStack, SlidersHorizontal, Droplet, MoreHorizontal, X } from 'lucide-react';

interface ToolbarProps {
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  shapeFillEnabled: boolean;
  onToggleShapeFill: (enabled: boolean) => void;
  shapeFillOpacity: number;
  onChangeShapeFillOpacity: (opacity: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDark?: boolean;
  onOpenCompare?: () => void;
  onOpenReplace?: () => void;
}

const tools = [
  { id: AnnotationTool.SELECT, icon: MousePointer2, name: 'Select' },
  { id: AnnotationTool.FREEHAND, icon: Pen, name: 'Pen' },
  { id: AnnotationTool.RECTANGLE, icon: Square, name: 'Rectangle' },
  { id: AnnotationTool.ELLIPSE, icon: Circle, name: 'Ellipse' },
  { id: AnnotationTool.ARROW, icon: MoveUpRight, name: 'Arrow' },
  { id: AnnotationTool.COMMENT, icon: MessageSquare, name: 'Comment' },
];

const colors = ['#ffffff', '#ef4444', '#f97316', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#0ea5e9', '#22c55e', '#eab308', '#f43f5e'];

const Toolbar: React.FC<ToolbarProps> = ({ 
  activeTool,
  setActiveTool,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  fontSize,
  setFontSize,
  shapeFillEnabled,
  onToggleShapeFill,
  shapeFillOpacity,
  onChangeShapeFillOpacity,
  undo,
  redo,
  canUndo,
  canRedo,
  isDark = true,
  onOpenCompare,
  onOpenReplace,
}) => {
  
  const isDrawingTool = [AnnotationTool.FREEHAND, AnnotationTool.RECTANGLE, AnnotationTool.ELLIPSE, AnnotationTool.ARROW].includes(activeTool);
  const isTextTool = activeTool === AnnotationTool.TEXT;
  const supportsFill = [AnnotationTool.RECTANGLE, AnnotationTool.ELLIPSE].includes(activeTool);
  const [openPanel, setOpenPanel] = React.useState<null | 'style' | 'fill' | 'more'>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const closePanels = () => setOpenPanel(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`absolute top-6 left-1/2 -translate-x-1/2 z-20 backdrop-blur px-2.5 py-2 rounded-full shadow-lg flex items-center gap-2 ${isDark ? 'bg-black/70 border border-white/10 text-white/80' : 'bg-white/90 border border-gray-200 text-gray-800'}`}
    >
      <div className="flex items-center gap-0.5">
        {tools.map(tool => (
          <button
            key={tool.id}
            title={tool.name}
            onClick={() => setActiveTool(tool.id)}
            className={`p-1.5 rounded-full transition ${
              activeTool === tool.id
                ? (
                    isDark
                      ? 'text-white ring-1 ring-white ring-offset-2 ring-offset-black/40'
                      : 'text-black ring-1 ring-black ring-offset-2 ring-offset-white'
                  )
                : (isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800')
            }`}
          >
            <tool.icon size={16} />
          </button>
        ))}
      </div>
      <div className={`w-px h-6 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
       <div className="flex items-center gap-1">
        <button
          title="Undo (Ctrl+Z)"
          onClick={undo}
          disabled={!canUndo}
          className={`p-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800'}`}
        >
          <Undo size={16} />
        </button>
        <button
          title="Redo (Ctrl+Y)"
          onClick={redo}
          disabled={!canRedo}
          className={`p-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800'}`}
        >
          <Redo size={16} />
        </button>
      </div>
      <div className={`w-px h-6 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
      <div className="flex items-center gap-1">
        <button
          title="Style"
          onClick={() => setOpenPanel(openPanel === 'style' ? null : 'style')}
          className={`p-1.5 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
        >
          <SlidersHorizontal size={16} />
        </button>
        {supportsFill && (
          <button
            title="Fill"
            onClick={() => setOpenPanel(openPanel === 'fill' ? null : 'fill')}
            className={`p-1.5 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
          >
            <Droplet size={16} />
          </button>
        )}
        <button
          title="More"
          onClick={() => setOpenPanel(openPanel === 'more' ? null : 'more')}
          className={`p-1.5 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Panels */}
      {openPanel === 'style' && (
        <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 rounded-2xl border shadow-2xl ${isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
          <div className="p-3 flex flex-col gap-3 min-w-[220px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase opacity-70">Style</span>
              <button className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`} onClick={closePanels}><X size={14} /></button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setBrushColor(color)}
                  title={color}
                  className={`h-6 w-6 rounded-full border ${brushColor === color ? (isDark ? 'ring-2 ring-white border-transparent' : 'ring-2 ring-gray-800 border-transparent') : (isDark ? 'border-white/10' : 'border-gray-200')}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            {(isDrawingTool || isTextTool) && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase opacity-70">{isDrawingTool ? 'Stroke' : 'Font'}</span>
                <input
                  type="range"
                  min={isDrawingTool ? 1 : 10}
                  max={isDrawingTool ? 24 : 48}
                  value={isDrawingTool ? brushSize : fontSize}
                  onChange={(e) => (isDrawingTool ? setBrushSize(Number(e.target.value)) : setFontSize(Number(e.target.value)))}
                  className={`w-40 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
                />
                <span className="text-xs opacity-70 w-8 tabular-nums">{isDrawingTool ? brushSize : `${fontSize}px`}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {openPanel === 'fill' && supportsFill && (
        <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 rounded-2xl border shadow-2xl ${isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
          <div className="p-3 flex flex-col gap-3 min-w-[220px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase opacity-70">Fill</span>
              <button className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`} onClick={closePanels}><X size={14} /></button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable</span>
              <button
                onClick={() => onToggleShapeFill(!shapeFillEnabled)}
                className={`${shapeFillEnabled ? (isDark ? 'bg-white text-black' : 'bg-black text-white') : (isDark ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-800')} px-3 py-1 rounded-full text-xs font-semibold`}
              >
                {shapeFillEnabled ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] uppercase opacity-70">Opacity</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(Math.max(0, Math.min(1, shapeFillOpacity)) * 100)}
                onChange={(e) => onChangeShapeFillOpacity(Number(e.target.value) / 100)}
                className={`w-40 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
                disabled={!shapeFillEnabled}
              />
              <span className="text-xs opacity-70 w-10 tabular-nums">{Math.round(shapeFillOpacity * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {openPanel === 'more' && (
        <div className={`absolute top-full mt-2 right-0 rounded-2xl border shadow-2xl ${isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
          <div className="p-2 min-w-[200px]">
            {onOpenCompare && (
              <button
                onClick={() => { closePanels(); onOpenCompare?.(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
              >
                <SquareStack size={16} /> Compare video
              </button>
            )}
            {onOpenReplace && (
              <button
                onClick={() => { closePanels(); onOpenReplace?.(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                title="Replace base video"
              >
                Replace video
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Toolbar;
