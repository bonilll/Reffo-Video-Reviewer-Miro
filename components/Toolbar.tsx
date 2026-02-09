import React from 'react';
import { Annotation, AnnotationTool } from '../types';
import { MousePointer2, Pen, Square, Circle, MoveUpRight, MessageSquare, Undo, Redo, SquareStack, SlidersHorizontal, Droplet, MoreHorizontal, X, Trash2 } from 'lucide-react';

interface ToolbarProps {
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  selectedAnnotations?: Annotation[];
  onDeleteSelected?: () => void;
  canDeleteSelected?: boolean;
  deleteCount?: number;
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
  selectedAnnotations = [],
  onDeleteSelected,
  canDeleteSelected = false,
  deleteCount = 0,
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
  const selectionHasDrawing =
    selectedAnnotations.some((a) =>
      a.type === AnnotationTool.FREEHAND ||
      a.type === AnnotationTool.RECTANGLE ||
      a.type === AnnotationTool.ELLIPSE ||
      a.type === AnnotationTool.ARROW,
    );
  const selectionHasText = selectedAnnotations.some((a) => a.type === AnnotationTool.TEXT);
  const selectionSupportsFill = selectedAnnotations.some((a) => a.type === AnnotationTool.RECTANGLE || a.type === AnnotationTool.ELLIPSE);
  const showStrokeControls = isDrawingTool || selectionHasDrawing;
  const showFontControls = isTextTool || selectionHasText;
  const showFillControls = supportsFill || selectionSupportsFill;
  const [openPanel, setOpenPanel] = React.useState<null | 'style' | 'fill' | 'more'>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const closePanels = () => setOpenPanel(null);
  const closeAll = () => { setOpenPanel(null); setMobileOpen(false); };
  const ActiveToolIcon = tools.find((t) => t.id === activeTool)?.icon ?? MousePointer2;

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener('mousedown', onDocClick);
    const onTouchStart = (e: TouchEvent) => onDocClick(e as any);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  const handleDeleteTap = () => {
    if (!canDeleteSelected || !onDeleteSelected) return;
    onDeleteSelected();
  };

  return (
    <div
      ref={rootRef}
      className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-30"
    >
      {/* Desktop toolbar */}
      <div
        className={`hidden md:flex items-center gap-2 backdrop-blur px-2.5 py-2 rounded-full border shadow-sm ${
          isDark ? 'bg-black/70 border-white/10 text-white' : 'bg-white/90 border-gray-200 text-gray-900'
        }`}
      >
        <div className="flex items-center gap-0.5">
          {tools.map(tool => (
            <button
              key={tool.id}
              title={tool.name}
              onClick={() => setActiveTool(tool.id)}
              className={`h-8 w-8 inline-flex items-center justify-center rounded-full transition ${
                activeTool === tool.id
                  ? (isDark ? 'bg-white text-black shadow-sm' : 'bg-gray-900 text-gray-50 shadow-sm')
                  : (isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700')
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
            className={`h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Undo size={16} />
          </button>
          <button
            title="Redo (Ctrl+Y)"
            onClick={redo}
            disabled={!canRedo}
            className={`h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Redo size={16} />
          </button>
        </div>
        <div className={`w-px h-6 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
        <div className="flex items-center gap-1">
          <button
            title="Style"
            onClick={() => setOpenPanel(openPanel === 'style' ? null : 'style')}
            className={`h-8 w-8 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            <SlidersHorizontal size={16} />
          </button>
          {showFillControls && (
            <button
              title="Fill"
              onClick={() => setOpenPanel(openPanel === 'fill' ? null : 'fill')}
              className={`h-8 w-8 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <Droplet size={16} />
            </button>
          )}
          <button
            title="More"
            onClick={() => setOpenPanel(openPanel === 'more' ? null : 'more')}
            className={`h-8 w-8 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Mobile toolbar (collapsed + expandable) */}
      <div className="md:hidden">
        {!mobileOpen ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className={`h-11 w-11 rounded-full border shadow-sm backdrop-blur flex items-center justify-center ${
                isDark ? 'bg-black/70 border-white/10 text-white' : 'bg-white/90 border-gray-200 text-gray-900'
              }`}
              title="Tools"
              aria-label="Tools"
            >
              <ActiveToolIcon size={18} />
            </button>
            <button
              onClick={handleDeleteTap}
              disabled={!canDeleteSelected}
              className={`h-11 w-11 rounded-full border shadow-sm backdrop-blur flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark ? 'bg-black/70 border-white/10 text-white hover:bg-black/80' : 'bg-white/90 border-gray-200 text-gray-900 hover:bg-white'
              }`}
              title={
                !canDeleteSelected
                  ? 'Select an item to delete'
                  : `Delete selected${deleteCount ? ` (${deleteCount})` : ''}`
              }
              aria-label="Delete selected"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ) : (
          <div
            className={`backdrop-blur px-3 py-3 rounded-3xl border shadow-2xl w-[min(92vw,360px)] ${
              isDark ? 'bg-black/75 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">Tools</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDeleteTap}
                  disabled={!canDeleteSelected}
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                  }`}
                  title={
                    !canDeleteSelected
                      ? 'Select an item to delete'
                      : `Delete selected${deleteCount ? ` (${deleteCount})` : ''}`
                  }
                  aria-label="Delete selected"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  onClick={closeAll}
                  aria-label="Close tools"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  title={tool.name}
                  onClick={() => setActiveTool(tool.id)}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full transition ${
                    activeTool === tool.id
                      ? (isDark ? 'bg-white text-black shadow-sm' : 'bg-gray-900 text-gray-50 shadow-sm')
                      : (isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700')
                  }`}
                >
                  <tool.icon size={18} />
                </button>
              ))}
            </div>
            <div className={`my-2 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  title="Undo (Ctrl+Z)"
                  onClick={undo}
                  disabled={!canUndo}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Undo size={18} />
                </button>
                <button
                  title="Redo (Ctrl+Y)"
                  onClick={redo}
                  disabled={!canRedo}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Redo size={18} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  title="Style"
                  onClick={() => setOpenPanel(openPanel === 'style' ? null : 'style')}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                >
                  <SlidersHorizontal size={18} />
                </button>
                {showFillControls && (
                  <button
                    title="Fill"
                    onClick={() => setOpenPanel(openPanel === 'fill' ? null : 'fill')}
                    className={`h-10 w-10 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  >
                    <Droplet size={18} />
                  </button>
                )}
                <button
                  title="More"
                  onClick={() => setOpenPanel(openPanel === 'more' ? null : 'more')}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panels */}
      {openPanel === 'style' && (
        <div
          className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 rounded-3xl border shadow-2xl backdrop-blur-md overflow-hidden max-h-[60vh] ${
            isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
          }`}
        >
          <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-white/5 border-b border-white/10' : 'bg-gray-50 border-b border-gray-200'}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Style</span>
            <button className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`} onClick={closePanels}><X size={14} /></button>
          </div>
          <div className="p-4 flex flex-col gap-4 min-w-[260px] overflow-y-auto">
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
            {showStrokeControls && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase opacity-70">Stroke</span>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className={`w-40 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
                />
                <span className="text-xs opacity-70 w-8 tabular-nums">{brushSize}</span>
              </div>
            )}
            {showFontControls && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase opacity-70">Font</span>
                <input
                  type="range"
                  min={10}
                  max={48}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className={`w-40 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
                />
                <span className="text-xs opacity-70 w-12 tabular-nums">{fontSize}px</span>
              </div>
            )}
          </div>
        </div>
      )}

      {openPanel === 'fill' && showFillControls && (
        <div
          className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 rounded-3xl border shadow-2xl backdrop-blur-md overflow-hidden max-h-[60vh] ${
            isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
          }`}
        >
          <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-white/5 border-b border-white/10' : 'bg-gray-50 border-b border-gray-200'}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Fill</span>
            <button className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`} onClick={closePanels}><X size={14} /></button>
          </div>
          <div className="p-4 flex flex-col gap-4 min-w-[260px] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable</span>
              <button
                onClick={() => onToggleShapeFill(!shapeFillEnabled)}
                className={`${shapeFillEnabled ? (isDark ? 'bg-white text-black' : 'bg-black text-gray-50') : (isDark ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-800')} px-3 py-1 rounded-full text-xs font-semibold`}
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
        <div
          className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 rounded-3xl border shadow-2xl backdrop-blur-md overflow-hidden max-h-[60vh] ${
            isDark ? 'bg-black/85 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900'
          }`}
        >
          <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-white/5 border-b border-white/10' : 'bg-gray-50 border-b border-gray-200'}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">More</span>
            <button className={`p-1 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`} onClick={closePanels}><X size={14} /></button>
          </div>
          <div className="p-2 min-w-[260px] overflow-y-auto">
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
