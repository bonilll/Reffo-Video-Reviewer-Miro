import React from 'react';
import { AnnotationTool } from '../types';
import { MousePointer2, Pen, Square, Circle, MoveUpRight, Type, MessageSquare, Undo, Redo } from 'lucide-react';

interface ToolbarProps {
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDark?: boolean;
}

const tools = [
  { id: AnnotationTool.SELECT, icon: MousePointer2, name: 'Select' },
  { id: AnnotationTool.FREEHAND, icon: Pen, name: 'Pen' },
  { id: AnnotationTool.RECTANGLE, icon: Square, name: 'Rectangle' },
  { id: AnnotationTool.ELLIPSE, icon: Circle, name: 'Ellipse' },
  { id: AnnotationTool.ARROW, icon: MoveUpRight, name: 'Arrow' },
  { id: AnnotationTool.COMMENT, icon: MessageSquare, name: 'Comment' },
];

const colors = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#ffffff'];

const Toolbar: React.FC<ToolbarProps> = ({ 
  activeTool, setActiveTool, brushColor, setBrushColor, brushSize, setBrushSize,
  fontSize, setFontSize, undo, redo, canUndo, canRedo, isDark = true
}) => {
  
  const isDrawingTool = [AnnotationTool.FREEHAND, AnnotationTool.RECTANGLE, AnnotationTool.ELLIPSE, AnnotationTool.ARROW].includes(activeTool);
  const isTextTool = activeTool === AnnotationTool.TEXT;

  return (
    <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-10 backdrop-blur px-4 py-3 rounded-full shadow-lg flex items-center gap-4 ${isDark ? 'bg-black/70 border border-white/10 text-white/70' : 'bg-white/90 border border-gray-200 text-gray-700'}`}>
      <div className="flex items-center gap-1">
        {tools.map(tool => (
          <button
            key={tool.id}
            title={tool.name}
            onClick={() => setActiveTool(tool.id)}
            className={`p-2 rounded-full transition-colors ${
              activeTool === tool.id
                ? (isDark ? 'bg-white text-black' : 'bg-black text-white')
                : (isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800')
            }`}
          >
            <tool.icon size={20} />
          </button>
        ))}
      </div>
      <div className={`w-px h-8 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
       <div className="flex items-center gap-1">
        <button
          title="Undo (Ctrl+Z)"
          onClick={undo}
          disabled={!canUndo}
          className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800'}`}
        >
          <Undo size={20} />
        </button>
        <button
          title="Redo (Ctrl+Y)"
          onClick={redo}
          disabled={!canRedo}
          className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-gray-800'}`}
        >
          <Redo size={20} />
        </button>
      </div>
      <div className={`w-px h-8 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
      <div className="flex items-center gap-2">
        {colors.map(color => (
          <button
            key={color}
            onClick={() => setBrushColor(color)}
            className={`w-6 h-6 rounded-full transition-transform transform hover:scale-110 ${brushColor === color ? (isDark ? 'ring-2 ring-offset-2 ring-offset-black ring-white' : 'ring-2 ring-offset-2 ring-offset-white ring-black') : ''}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {(isDrawingTool || isTextTool) && <>
        <div className={`w-px h-8 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
        <div className="flex items-center gap-2">
          <span className={`text-xs uppercase ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Size</span>
          {isDrawingTool && (
            <input
                id="size"
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                className={`w-24 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
            />
          )}
          {isTextTool && (
             <input
                id="size"
                type="range"
                min="10"
                max="48"
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                className={`w-24 h-1 ${isDark ? 'accent-white' : 'accent-black'}`}
            />
          )}
        </div>
      </> }
    </div>
  );
};

export default Toolbar;
