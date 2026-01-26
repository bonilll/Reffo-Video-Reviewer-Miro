import React from "react";
import {
  Circle,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
  ZoomIn,
  LayoutGrid,
  Maximize2,
  ChevronDown,
  Hand,
  Move3D,
  ArrowUpRight,
  Minus,
  Shapes,
  Save,
  RectangleHorizontal,
  Edit3,
  RotateCcw,
  RotateCw,
  ZoomOut,
  Focus,
  Grid3X3,
  FileText,
  MessageSquare,
  Frame,
  Paintbrush,
  ArrowRight,
  Calendar,
  BookOpen,
  Sparkles,
  AlignLeft,
  StickyNote as PostIt,
  PenTool,
  Layers,
  Archive,
  CheckSquare,
  CalendarDays,
  Database,
  Package,
  Pen,
  Library,
  MousePointer,
  Upload,
  Menu,
  X,
  MoreHorizontal,
  Settings,
  Info,
  Table as TableIcon,
  Download,
  Share2,
  Trash2
} from "lucide-react";
import { useState, useRef } from "react";

import { CanvasMode, LayerType, type CanvasState, type Camera, type Color } from "@/types/canvas";
import { useSelection } from "@/hooks/useSelection";

import { ToolButton } from "./tool-button";
import { useSelectionBounds } from "@/hooks/use-selection-bounds";
import { useSelf, useStorage, useMutation } from "@/liveblocks.config";
import { SelectionTools } from "./selection-tools";
import { LibraryButton } from "./library-button";
import { TodoButton } from "@/app/components/TodoButton";
import { CalendarButton } from "@/app/components/CalendarButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GridSettings, GridConfig } from "./grid-settings";

// Individual tool tooltip component - appears above each tool individually
const ToolTooltip = ({ children, label, isVisible }: { 
  children: React.ReactNode; 
  label: string; 
  isVisible: boolean 
}) => {
  return (
    <div className="relative">
      {children}
      {isVisible && label && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-4 duration-200 ease-out">
          <div className="relative">
            {/* Background piatto senza glassmorphism */}
            <div className="border border-gray-200/60 text-gray-900 px-3 py-2 rounded-lg shadow-lg text-xs font-medium whitespace-nowrap" style={{ backgroundColor: '#fcfcfc' }}>
              {/* Content con testo nero */}
              <span className="relative z-10 tracking-wide text-gray-900">{label}</span>
            </div>
            
            {/* Arrow che punta verso il basso */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent" style={{ borderTopColor: '#fcfcfc' }} />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent border-t-gray-200/60" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ENABLE_LIBRARY = false;
const ENABLE_TODO = false;
const ENABLE_CALENDAR = false;



type ToolbarProps = {
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
  gridConfig?: GridConfig;
  onGridConfigChange?: (config: GridConfig) => void;
  autoSaveToLibrary?: boolean;
  onAutoSaveToLibraryChange?: (enabled: boolean) => void;
  canEnableAutoSave?: boolean;
  pencilStrokeWidth?: number;
  setPencilStrokeWidth?: (width: number) => void;
  lastUsedColor?: Color;
  // Note text formatting functions
  setLastUsedFontSize?: (fontSize: number) => void;
  setLastUsedFontWeight?: (fontWeight: string) => void;
  // Frame control functions
  onToggleFrameAutoResize?: (frameId: string) => void;
  onManualFrameResize?: (frameId: string) => void;
  // Mobile support
  isTouchDevice?: boolean;
  // Todo widget creation
  onCreateTodoWidget?: () => void;
  // Table creation
  onCreateTable?: () => void;
  // User role for permission control
  userRole?: string;
  // Board actions
  onShareBoard?: () => void;
  onDownloadBoard?: () => void;
  onDeleteBoard?: () => void;
  onBoardSettings?: () => void;
};

// Mobile Selection Bar Component
const MobileSelectionBar = ({
  camera,
  setLastUsedColor,
  pencilStrokeWidth,
  setPencilStrokeWidth,
  canvasState,
  lastUsedColor,
  setLastUsedFontSize,
  setLastUsedFontWeight,
  onToggleFrameAutoResize,
  onManualFrameResize,
  onActionHover,
  onActionHoverEnd,
  userRole,
}: {
  camera: Camera;
  setLastUsedColor: (color: Color) => void;
  pencilStrokeWidth?: number;
  setPencilStrokeWidth?: (width: number) => void;
  canvasState?: any;
  lastUsedColor?: Color;
  setLastUsedFontSize?: (fontSize: number) => void;
  setLastUsedFontWeight?: (fontWeight: string) => void;
  onToggleFrameAutoResize?: (frameId: string) => void;
  onManualFrameResize?: (frameId: string) => void;
  onActionHover?: (label: string) => void;
  onActionHoverEnd?: () => void;
  userRole?: string;
}) => {
  const [showMoreTools, setShowMoreTools] = useState(false);

  // Don't show selection bar for viewers
  if (userRole === "viewer") {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 mobile-selection-bar">
      <div className="border border-gray-200/60 rounded-2xl shadow-lg" style={{ backgroundColor: '#fcfcfc' }}>
        {/* Prima riga - Controlli essenziali sempre visibili */}
        <div className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <SelectionTools
              camera={camera}
              setLastUsedColor={setLastUsedColor}
              onActionHover={onActionHover}
              onActionHoverEnd={onActionHoverEnd}
              onShowColorPicker={() => {}}
              containerRef={null}
              pencilStrokeWidth={pencilStrokeWidth}
              setPencilStrokeWidth={setPencilStrokeWidth}
              canvasState={canvasState}
              lastUsedColor={lastUsedColor}
              setLastUsedFontSize={setLastUsedFontSize}
              setLastUsedFontWeight={setLastUsedFontWeight}
              onToggleFrameAutoResize={onToggleFrameAutoResize}
              onManualFrameResize={onManualFrameResize}
              isTouchDevice={true}
            />
          </div>
        </div>
        
        {/* Footer con indicatori */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200/50 bg-gray-50/30">
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span>←</span>
            <span>Scroll horizontally</span>
            <span>→</span>
          </div>
          
          {/* Pulsante per strumenti aggiuntivi se necessario in futuro */}
          <div className="text-xs text-gray-400">
            All tools
          </div>
        </div>
      </div>
    </div>
  );
};

// Mobile Toolbar Component with Popup Menu
const MobileToolbar = ({
  canvasState,
  setCanvasState,
  undo,
  redo,
  canUndo,
  canRedo,
  camera,
  setCamera,
  smoothZoom,
  setLastUsedColor,
  centerOnLayers,
  boardId,
  gridConfig,
  onGridConfigChange,
  autoSaveToLibrary,
  onAutoSaveToLibraryChange,
  canEnableAutoSave = true,
  lastShapeTool,
  setLastShapeTool,
  handleHover,
  handleHoverEnd,
  zoomPercentage,
  setZoomTo,
  zoomOptions,
  onCreateTodoWidget,
  isViewer,
}: {
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
  gridConfig?: GridConfig;
  onGridConfigChange?: (config: GridConfig) => void;
  autoSaveToLibrary?: boolean;
  onAutoSaveToLibraryChange?: (enabled: boolean) => void;
  canEnableAutoSave?: boolean;
  lastShapeTool: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line;
  setLastShapeTool: (tool: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line) => void;
  handleHover: (label: string) => void;
  handleHoverEnd: () => void;
  zoomPercentage: number;
  setZoomTo: (zoom: number) => void;
  zoomOptions: Array<{label: string, value: number}>;
  onCreateTodoWidget?: () => void;
  isViewer?: boolean;
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const openFilePicker = () => {
    window.dispatchEvent(new CustomEvent("board-upload-open"));
    setIsMenuOpen(false);
  };

  const getShapeIcon = (shapeType: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line) => {
    switch (shapeType) {
      case LayerType.Rectangle: return Square;
      case LayerType.Ellipse: return Circle;
      case LayerType.Arrow: return ArrowRight;
      case LayerType.Line: return Minus;
      default: return Square;
    }
  };

  const setShapeTool = (layerType: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line) => {
    setCanvasState({
      mode: CanvasMode.Inserting,
      layerType,
    });
    setLastShapeTool(layerType);
    setIsMenuOpen(false);
  };

  // Primary tools sempre visibili
  const primaryTools = [
    {
      icon: MousePointer,
      label: "Selection",
      onClick: () => setCanvasState({ mode: CanvasMode.None }),
      isActive: canvasState.mode === CanvasMode.None ||
                canvasState.mode === CanvasMode.Translating ||
                canvasState.mode === CanvasMode.SelectionNet ||
                canvasState.mode === CanvasMode.Pressing ||
                canvasState.mode === CanvasMode.Resizing,
    },
    {
      icon: PostIt,
      label: "Note",
      onClick: () => setCanvasState({ mode: CanvasMode.Inserting, layerType: LayerType.Note }),
      isActive: canvasState.mode === CanvasMode.Inserting && canvasState.layerType === LayerType.Note,
    },
    {
      icon: Frame,
      label: "Frame",
      onClick: () => setCanvasState({ mode: CanvasMode.Inserting, layerType: LayerType.Frame }),
      isActive: canvasState.mode === CanvasMode.Inserting && canvasState.layerType === LayerType.Frame,
    },
  ];

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <div className="border border-gray-200/60 rounded-2xl shadow-lg p-3" style={{ backgroundColor: '#fcfcfc' }}>
        <div className="flex items-center justify-between">
          {/* Primary Tools */}
          <div className="flex items-center gap-2">
            {primaryTools.map((tool, index) => (
              <ToolButton
                key={index}
                label={tool.label}
                icon={tool.icon}
                onClick={tool.onClick}
                isActive={tool.isActive}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
                size="lg"
              />
            ))}
          </div>

          {/* Zoom Display */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100/80 rounded-xl">
            <span className="text-sm font-semibold text-gray-700">{zoomPercentage}%</span>
          </div>

          {/* Menu Button */}
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white shadow-lg transition-all duration-200"
                onMouseEnter={() => handleHover("Menu")}
                onMouseLeave={handleHoverEnd}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-72 border border-gray-200/60 shadow-lg rounded-2xl p-4 mb-2"
              style={{ backgroundColor: '#fcfcfc' }}
              sideOffset={8}
            >
              {/* Tools Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 px-2">Tools</h3>
                
                <div className="grid grid-cols-2 gap-2">
                  <DropdownMenuItem
                    onClick={() => {
                      setCanvasState({ mode: CanvasMode.Inserting, layerType: LayerType.Text });
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-gray-100/80 cursor-pointer"
                  >
                    <AlignLeft className="h-5 w-5" />
                    <span className="text-sm">Text</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem
                    onClick={() => {
                      setCanvasState({ mode: CanvasMode.Pencil });
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-gray-100/80 cursor-pointer"
                  >
                    <Pen className="h-5 w-5" />
                    <span className="text-sm">Pen</span>
                  </DropdownMenuItem>

                  {!isViewer && (
                    <DropdownMenuItem
                      onClick={openFilePicker}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-gray-100/80 cursor-pointer"
                    >
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">Upload</span>
                    </DropdownMenuItem>
                  )}
                </div>

                {/* Shapes Section */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 px-2 mb-2">Shapes</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <DropdownMenuItem
                      onClick={() => setShapeTool(LayerType.Rectangle)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer"
                    >
                      <Square className="h-4 w-4" />
                      <span className="text-sm">Rectangle</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShapeTool(LayerType.Ellipse)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer"
                    >
                      <Circle className="h-4 w-4" />
                      <span className="text-sm">Circle</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShapeTool(LayerType.Arrow)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      <span className="text-sm">Arrow</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShapeTool(LayerType.Line)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                      <span className="text-sm">Line</span>
                    </DropdownMenuItem>
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator className="my-4" />

              {/* Actions Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 px-2">Actions</h3>
                
                <div className="flex items-center gap-2">
                  <DropdownMenuItem
                    onClick={() => {
                      undo();
                      setIsMenuOpen(false);
                    }}
                    disabled={!canUndo}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer flex-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="text-sm">Undo</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem
                    onClick={() => {
                      redo();
                      setIsMenuOpen(false);
                    }}
                    disabled={!canRedo}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer flex-1"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span className="text-sm">Redo</span>
                  </DropdownMenuItem>
                </div>

                {/* Zoom Controls */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 px-2 mb-2">Zoom</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newScale = Math.max(0.1, camera.scale * 0.8);
                        setCamera({ ...camera, scale: newScale });
                      }}
                      className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    
                    <div className="flex-1 grid grid-cols-3 gap-1">
                      {[0.5, 1, 2].map((zoom) => (
                        <button
                          key={zoom}
                          onClick={() => {
                            setZoomTo(zoom);
                            setIsMenuOpen(false);
                          }}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                            Math.abs(camera.scale - zoom) < 0.01
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {Math.round(zoom * 100)}%
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => {
                        const newScale = Math.min(5, camera.scale * 1.2);
                        setCamera({ ...camera, scale: newScale });
                      }}
                      className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {centerOnLayers && (
                  <DropdownMenuItem
                    onClick={() => {
                      centerOnLayers();
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100/80 cursor-pointer"
                  >
                    <Focus className="h-4 w-4" />
                    <span className="text-sm">Fit to screen</span>
                  </DropdownMenuItem>
                )}
              </div>

              <DropdownMenuSeparator className="my-4" />

              {/* Utility Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 px-2">Utility</h3>
                
                <div className="flex items-center gap-2">
                  {ENABLE_LIBRARY ? <LibraryButton boardId={boardId} size="sm" /> : null}
                  {ENABLE_TODO ? <TodoButton size="sm" onCreateWidget={onCreateTodoWidget} /> : null}
                  {ENABLE_CALENDAR ? <CalendarButton size="sm" /> : null}
                  
                  {gridConfig && onGridConfigChange && (
                    <div className="flex-1">
                      <GridSettings 
                        config={gridConfig}
                        onConfigChange={onGridConfigChange}
                      />
                    </div>
                  )}
                </div>

                {onAutoSaveToLibraryChange && (
                  <div className="flex items-center justify-between px-2">
                    <span className={`text-sm ${!canEnableAutoSave && !autoSaveToLibrary ? 'text-gray-400' : 'text-gray-700'}`}>
                      Auto-save
                      {!canEnableAutoSave && !autoSaveToLibrary && (
                        <span className="text-xs text-red-500 block">Storage limit reached</span>
                      )}
                    </span>
                    <button
                      onClick={() => onAutoSaveToLibraryChange(!autoSaveToLibrary)}
                      disabled={!canEnableAutoSave && !autoSaveToLibrary}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        !canEnableAutoSave && !autoSaveToLibrary
                          ? 'bg-red-200 cursor-not-allowed'
                          : autoSaveToLibrary 
                            ? 'bg-green-500' 
                            : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        autoSaveToLibrary ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                )}
                

              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export const Toolbar = ({
  canvasState,
  setCanvasState,
  undo,
  redo,
  canRedo,
  canUndo,
  camera,
  setCamera,
  smoothZoom,
  setLastUsedColor,
  centerOnLayers,
  boardId,
  gridConfig,
  onGridConfigChange,
  autoSaveToLibrary,
  onAutoSaveToLibraryChange,
  canEnableAutoSave = true,
  pencilStrokeWidth,
  setPencilStrokeWidth,
  lastUsedColor,
  setLastUsedFontSize,
  setLastUsedFontWeight,
  onToggleFrameAutoResize,
  onManualFrameResize,
  isTouchDevice = false,
  onCreateTodoWidget,
  onCreateTable,
  userRole,
  onShareBoard,
  onDownloadBoard,
  onDeleteBoard,
  onBoardSettings,
}: ToolbarProps) => {
  // Stato per tracciare quale tool ha l'hover (ora individuale per ogni tool)
  const [hoveredTool, setHoveredTool] = useState<string>("");
  // Stato per il color picker
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Stato per tracciare dropdown aperti
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
  // Riferimento al contenitore della toolbar
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Stato per l'ultimo strumento forma utilizzato
  const [lastShapeTool, setLastShapeTool] = useState<LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line>(LayerType.Rectangle);
  
  // Verificare se ci sono selezioni attive
  const selection = useSelf((me) => me.presence.selection);
  const selectionBounds = useSelectionBounds();
  const hasSelection = selection.length > 0 && selectionBounds !== null;
  const { selectedLayers } = useSelection();
  
  // Controlla se lo strumento testo è attivo o se è selezionato un testo
  const isTextActive = 
    (canvasState.mode === CanvasMode.Inserting && canvasState.layerType === LayerType.Text) || 
    (hasSelection && selectedLayers.length === 1 && selectedLayers[0]?.type === LayerType.Text);
  
  // Verifica se un elemento di testo è in modalità di modifica (ma non una nota)
  const isTextEditing = isTextActive;
  
  // Opzioni di zoom
  const zoomOptions = [
    { label: "500%", value: 5 },
    { label: "400%", value: 4 },
    { label: "300%", value: 3 },
    { label: "200%", value: 2 },
    { label: "150%", value: 1.5 },
    { label: "100%", value: 1 },
    { label: "75%", value: 0.75 },
    { label: "50%", value: 0.5 },
    { label: "25%", value: 0.25 },
    { label: "10%", value: 0.1 },
  ];

  // Export presets (A4, 1080p, 4K)
  const exportPresets = [
    { label: "A4 Portrait (794x1123)", width: 794, height: 1123 },
    { label: "A4 Landscape (1123x794)", width: 1123, height: 794 },
    { label: "Full HD 1080p (1920x1080)", width: 1920, height: 1080 },
    { label: "4K UHD (3840x2160)", width: 3840, height: 2160 },
  ];

  const showBoardActions =
    !!onShareBoard || !!onDownloadBoard || !!onDeleteBoard || !!onBoardSettings;

  const exportCanvasAsImage = async (preset: { width: number; height: number; label: string }) => {
    try {
      const rootEl = document.querySelector('.board-canvas') as HTMLElement | null;
      if (!rootEl) return;
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(rootEl, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: 'white',
        width: preset.width,
        height: preset.height,
        style: {
          width: `${preset.width}px`,
          height: `${preset.height}px`,
        } as any,
        skipAutoScale: true,
        canvasWidth: preset.width,
        canvasHeight: preset.height,
        cacheBust: true,
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `board-${preset.label.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  // Calcola la percentuale di zoom corrente
  const zoomPercentage = Math.round(camera.scale * 100);

  // Funzione per impostare un livello di zoom specifico
  const setZoomTo = (zoomLevel: number) => {
    if (!smoothZoom) return;
    
    // Calcola il centro dello schermo
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Converti il centro dello schermo in coordinate mondo con il zoom attuale
    const worldX = (centerX - camera.x) / camera.scale;
    const worldY = (centerY - camera.y) / camera.scale;
    
    // Calcola la nuova posizione della camera per mantenere il centro
    const newX = centerX - worldX * zoomLevel;
    const newY = centerY - worldY * zoomLevel;
    
    // Applica il nuovo zoom
      smoothZoom({
        x: newX,
        y: newY,
      scale: zoomLevel
    });
  };

  const handleHover = (label: string) => {
    setHoveredTool(label);
  };

  const handleHoverEnd = () => {
    setHoveredTool("");
  };
  
  // Helper functions per gestire dropdown aperti
  const addOpenDropdown = (dropdownId: string) => {
    setOpenDropdowns(prev => new Set([...prev, dropdownId]));
  };
  
  const removeOpenDropdown = (dropdownId: string) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev);
      newSet.delete(dropdownId);
      return newSet;
    });
  };
  
  // Funzione per verificare se mostrare tooltip (non mostrare se dropdown correlato è aperto)
  const shouldShowTooltip = (tooltipId: string, dropdownId?: string) => {
    if (dropdownId && openDropdowns.has(dropdownId)) {
      return false;
    }
    return hoveredTool === tooltipId;
  };
  
  const handleColorPickerVisibility = (visible: boolean) => {
    setShowColorPicker(visible);
  };

  const openFilePicker = () => {
    window.dispatchEvent(new CustomEvent("board-upload-open"));
  };

  // Funzione per ottenere l'icona dello strumento forma
  const getShapeIcon = (shapeType: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line) => {
    switch (shapeType) {
      case LayerType.Rectangle: return Square;
      case LayerType.Ellipse: return Circle;
      case LayerType.Arrow: return ArrowRight;
      case LayerType.Line: return Minus;
      default: return Square;
    }
  };

  // Ottieni l'icona attualmente attiva per le forme
  const currentShapeIcon = ((canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && 
    (canvasState.layerType === LayerType.Rectangle || 
     canvasState.layerType === LayerType.Ellipse || 
     canvasState.layerType === LayerType.Arrow || 
     canvasState.layerType === LayerType.Line))
    ? getShapeIcon(canvasState.layerType as LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line)
    : getShapeIcon(lastShapeTool);

  // Funzione per impostare lo strumento forma e aggiornare l'ultimo utilizzato
  const setShapeTool = (layerType: LayerType.Rectangle | LayerType.Ellipse | LayerType.Arrow | LayerType.Line) => {
    if (isViewer) {
      console.log("🔒 Viewer mode: Shape tools disabled");
      return;
    }
    
    setCanvasState({
      mode: CanvasMode.Inserting,
      layerType,
    });
    setLastShapeTool(layerType);
  };

  // Viewer restrictions - only allow viewing and camera controls
  const isViewer = userRole === "viewer";
  
  // Disable editing functions for viewers
  const handleCanvasStateChange = isViewer 
    ? () => {
        console.log("🔒 Viewer mode: Editing tools disabled");
        // For viewers, force selection mode only
        setCanvasState({ mode: CanvasMode.None });
      }
    : setCanvasState;
  
  const handleUndo = isViewer 
    ? () => console.log("🔒 Viewer mode: Undo disabled")
    : undo;
    
  const handleRedo = isViewer 
    ? () => console.log("🔒 Viewer mode: Redo disabled") 
    : redo;
  // Render export dropdown in toolbar actions area (top-right tools group likely)
  // We'll add a small button with dropdown listing presets

  return (
    <>
      {/* Mobile Layout - mostrato solo su schermi piccoli */}
      <div className="block md:hidden">
        {isTouchDevice && (
          <>
            {/* Mobile Toolbar */}
            <MobileToolbar
              canvasState={canvasState}
              setCanvasState={handleCanvasStateChange}
              undo={handleUndo}
              redo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              camera={camera}
              setCamera={setCamera}
              smoothZoom={smoothZoom}
              setLastUsedColor={setLastUsedColor}
              centerOnLayers={centerOnLayers}
              boardId={boardId}
              gridConfig={gridConfig}
              onGridConfigChange={onGridConfigChange}
              autoSaveToLibrary={autoSaveToLibrary}
              onAutoSaveToLibraryChange={onAutoSaveToLibraryChange}
              canEnableAutoSave={canEnableAutoSave}
              lastShapeTool={lastShapeTool}
              setLastShapeTool={setLastShapeTool}
              handleHover={handleHover}
              handleHoverEnd={handleHoverEnd}
              zoomPercentage={zoomPercentage}
              setZoomTo={setZoomTo}
              zoomOptions={zoomOptions}
              onCreateTodoWidget={onCreateTodoWidget}
              isViewer={isViewer}
            />

            {/* Mobile Selection Bar */}
            {hasSelection && (
              <MobileSelectionBar
                camera={camera}
                setLastUsedColor={setLastUsedColor}
                pencilStrokeWidth={pencilStrokeWidth}
                setPencilStrokeWidth={setPencilStrokeWidth}
                canvasState={canvasState}
                lastUsedColor={lastUsedColor}
                setLastUsedFontSize={setLastUsedFontSize}
                setLastUsedFontWeight={setLastUsedFontWeight}
                onToggleFrameAutoResize={onToggleFrameAutoResize}
                onManualFrameResize={onManualFrameResize}
                onActionHover={handleHover}
                onActionHoverEnd={handleHoverEnd}
                userRole={userRole}
              />
            )}
          </>
        )}
      </div>

      {/* Desktop Toolbar - mostrato solo su schermi medi e grandi */}
      <div className="hidden md:block">
        {/* Fixed positioned container that maintains center regardless of selection tools */}
        <div className="toolbar-container pointer-events-none absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center">
          
          {/* Selection tools - positioned above with separate container */}
          {(hasSelection || canvasState.mode === CanvasMode.Pencil) && !isViewer && (
            <div className="selection-tools-container pointer-events-auto mb-3 w-max">
              <SelectionTools 
                camera={camera}
                setLastUsedColor={setLastUsedColor}
                onActionHover={handleHover}
                onActionHoverEnd={handleHoverEnd}
                onShowColorPicker={handleColorPickerVisibility}
                containerRef={toolbarRef}
                pencilStrokeWidth={pencilStrokeWidth}
                setPencilStrokeWidth={setPencilStrokeWidth}
                canvasState={canvasState}
                lastUsedColor={lastUsedColor}
                setLastUsedFontSize={setLastUsedFontSize}
                setLastUsedFontWeight={setLastUsedFontWeight}
                onToggleFrameAutoResize={onToggleFrameAutoResize}
                onManualFrameResize={onManualFrameResize}
                isTouchDevice={false}
                boardId={boardId}
              />
            </div>
          )}
          
          {/* Main toolbar with fixed width to prevent shifting */}
          <div 
            ref={toolbarRef}
            className="pointer-events-auto relative w-max rounded-2xl border border-gray-200/60 p-3 shadow-lg"
            style={{ backgroundColor: '#fcfcfc' }}
          >
            {/* Content */}
            <div className="relative z-10 flex items-center gap-1.5">
              {/* Gruppo strumenti base - only for non-viewers */}
              {!isViewer && (
                <>
                  <div className="flex items-center gap-x-1.5 relative z-10">
                    <ToolTooltip label="Selection" isVisible={shouldShowTooltip("Selection")}>
                      <div 
                        onMouseEnter={() => handleHover("Selection")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={MousePointer}
                          onClick={() => handleCanvasStateChange({ mode: CanvasMode.None })}
                          isActive={
                            canvasState.mode === CanvasMode.None ||
                            canvasState.mode === CanvasMode.Translating ||
                            canvasState.mode === CanvasMode.SelectionNet ||
                            canvasState.mode === CanvasMode.Pressing ||
                            canvasState.mode === CanvasMode.Resizing
                          }
                        />
                      </div>
                    </ToolTooltip>

                    <ToolTooltip label="Text" isVisible={shouldShowTooltip("Text")}>
                      <div 
                        onMouseEnter={() => handleHover("Text")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={AlignLeft}
                          onClick={() =>
                            handleCanvasStateChange({
                              mode: CanvasMode.Inserting,
                              layerType: LayerType.Text,
                            })
                          }
                          isActive={
                            canvasState.mode === CanvasMode.Inserting &&
                            canvasState.layerType === LayerType.Text
                          }
                        />
                      </div>
                    </ToolTooltip>

                    <ToolTooltip label="Sticky note" isVisible={shouldShowTooltip("Sticky note")}>
                      <div 
                        onMouseEnter={() => handleHover("Sticky note")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={PostIt}
                          onClick={() =>
                            handleCanvasStateChange({
                              mode: CanvasMode.Inserting,
                              layerType: LayerType.Note,
                            })
                          }
                          isActive={
                            canvasState.mode === CanvasMode.Inserting &&
                            canvasState.layerType === LayerType.Note
                          }
                        />
                      </div>
                    </ToolTooltip>

                    {/* Frame with dropdown for formats */}
                    <ToolTooltip label="Frame" isVisible={shouldShowTooltip("Frame", "frame")}>
                      <DropdownMenu onOpenChange={(open) => {
                        if (open) {
                          addOpenDropdown("frame");
                          // NON attivare il tool quando si apre - aspetta che l'utente selezioni un formato
                        } else {
                          removeOpenDropdown("frame");
                        }
                      }}>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className={`
                              relative w-11 h-11 rounded-xl flex items-center justify-center
                              transition-all duration-300 ease-out group
                              border border-transparent backdrop-blur-sm
                              ${
                                canvasState.mode === CanvasMode.Inserting && canvasState.layerType === LayerType.Frame
                                  ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/25 border-slate-700/50 scale-105 ring-2 ring-slate-400/20" 
                                  : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 active:scale-95"
                              }
                              focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
                              touch-manipulation cursor-pointer
                            `}
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                            }}
                            title="Frame"
                            onMouseEnter={() => handleHover("Frame")}
                            onMouseLeave={handleHoverEnd}
                          >
                            <div className="relative flex items-center justify-center">
                              <Frame className={`h-5 w-5 transition-all duration-300 ${
                                canvasState.mode === CanvasMode.Inserting && canvasState.layerType === LayerType.Frame 
                                  ? 'drop-shadow-sm' : 'group-hover:scale-110'
                              }`} />
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-48 bg-white/95 backdrop-blur-2xl border border-gray-200/50 shadow-2xl shadow-black/10 rounded-2xl p-3 mt-2" sideOffset={8}>
                          <DropdownMenuItem
                            onClick={() => {
                              console.log('🖼️ Setting A4 Portrait frame format:', { name: 'A4 Portrait', width: 800, height: 1131 });
                              handleCanvasStateChange({ mode: CanvasMode.Inserting, layerType: LayerType.Frame, frameFormat: { name: 'A4 Portrait', width: 800, height: 1131 } });
                            }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <RectangleHorizontal className="h-4 w-4 rotate-90" />
                            <span className="text-sm font-medium">A4 Portrait</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              console.log('🖼️ Setting 16:9 frame format:', { name: '16:9', width: 1600, height: 900 });
                              handleCanvasStateChange({ mode: CanvasMode.Inserting, layerType: LayerType.Frame, frameFormat: { name: '16:9', width: 1600, height: 900 } });
                            }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <RectangleHorizontal className="h-4 w-4" />
                            <span className="text-sm font-medium">16:9</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              console.log('🖼️ Setting 4:3 frame format:', { name: '4:3', width: 1200, height: 900 });
                              handleCanvasStateChange({ mode: CanvasMode.Inserting, layerType: LayerType.Frame, frameFormat: { name: '4:3', width: 1200, height: 900 } });
                            }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <RectangleHorizontal className="h-4 w-4" />
                            <span className="text-sm font-medium">4:3</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              console.log('🖼️ Setting 1:1 frame format:', { name: '1:1', width: 900, height: 900 });
                              handleCanvasStateChange({ mode: CanvasMode.Inserting, layerType: LayerType.Frame, frameFormat: { name: '1:1', width: 900, height: 900 } });
                            }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <Square className="h-4 w-4" />
                            <span className="text-sm font-medium">1:1 Square</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleCanvasStateChange({ mode: CanvasMode.Inserting, layerType: LayerType.Frame })}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span className="text-sm">Custom Size</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ToolTooltip>

                    {/* Gruppo Shapes con dropdown moderno migliorato */}
                    <ToolTooltip label="Shapes" isVisible={shouldShowTooltip("Shapes", "shapes")}>
                      <DropdownMenu onOpenChange={(open) => {
                        if (open) {
                          addOpenDropdown("shapes");
                        } else {
                          removeOpenDropdown("shapes");
                        }
                      }}>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className={`
                              relative w-11 h-11 rounded-xl flex items-center justify-center
                              transition-all duration-300 ease-out group
                              border border-transparent backdrop-blur-sm
                              ${
                              ((canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && 
                               (canvasState.layerType === LayerType.Rectangle || 
                                canvasState.layerType === LayerType.Ellipse || 
                                canvasState.layerType === LayerType.Arrow || 
                                canvasState.layerType === LayerType.Line))
                                ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/25 border-slate-700/50 scale-105 ring-2 ring-slate-400/20" 
                                : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 active:scale-95"
                              }
                              focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
                              touch-manipulation cursor-pointer
                            `}
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                            }}
                            title="Shapes"
                            onMouseEnter={() => handleHover("Shapes")}
                            onMouseLeave={handleHoverEnd}
                          >
                            <div className="relative flex items-center justify-center">
                              {React.createElement(currentShapeIcon, {
                                className: `h-5 w-5 transition-all duration-300 ${
                                  ((canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && 
                                   (canvasState.layerType === LayerType.Rectangle || 
                                    canvasState.layerType === LayerType.Ellipse || 
                                    canvasState.layerType === LayerType.Arrow || 
                                    canvasState.layerType === LayerType.Line)) ? 'drop-shadow-sm' : 'group-hover:scale-110'
                                }`
                              })}
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-48 bg-white/95 backdrop-blur-2xl border border-gray-200/50 shadow-2xl shadow-black/10 rounded-2xl p-3 mt-2" sideOffset={8}>
                          <DropdownMenuItem
                            onClick={() => setShapeTool(LayerType.Rectangle)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer ${
                              (canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && canvasState.layerType === LayerType.Rectangle
                                ? 'bg-gray-900 text-white font-semibold shadow-lg shadow-gray-900/25' 
                                : 'hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm'
                            }`}
                          >
                            <Square className="h-4 w-4" />
                            <span className="text-sm">Rectangle</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setShapeTool(LayerType.Ellipse)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer ${
                              (canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && canvasState.layerType === LayerType.Ellipse
                                ? 'bg-gray-900 text-white font-semibold shadow-lg shadow-gray-900/25' 
                                : 'hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm'
                            }`}
                          >
                            <Circle className="h-4 w-4" />
                            <span className="text-sm">Circle</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setShapeTool(LayerType.Arrow)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer ${
                              (canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && canvasState.layerType === LayerType.Arrow
                                ? 'bg-gray-900 text-white font-semibold shadow-lg shadow-gray-900/25' 
                                : 'hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm'
                            }`}
                          >
                            <ArrowUpRight className="h-4 w-4" />
                            <span className="text-sm">Arrow</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setShapeTool(LayerType.Line)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer ${
                              (canvasState.mode === CanvasMode.Inserting || canvasState.mode === CanvasMode.Drawing) && canvasState.layerType === LayerType.Line
                                ? 'bg-gray-900 text-white font-semibold shadow-lg shadow-gray-900/25' 
                                : 'hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm'
                            }`}
                          >
                            <Minus className="h-4 w-4" />
                            <span className="text-sm">Line</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ToolTooltip>

                    <ToolTooltip label="Pen" isVisible={shouldShowTooltip("Pen")}>
                      <div 
                        onMouseEnter={() => handleHover("Pen")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={Pen}
                          onClick={() =>
                            handleCanvasStateChange({
                              mode: CanvasMode.Pencil,
                            })
                          }
                          isActive={canvasState.mode === CanvasMode.Pencil}
                        />
                      </div>
                    </ToolTooltip>
                  </div>

                  {/* Separatore dopo strumenti base */}
                  <div className="w-px h-10 bg-gradient-to-b from-transparent via-slate-300/60 to-transparent mx-3 relative z-10" />

                  {/* Gruppo undo/redo */}
                  <div className="flex items-center gap-x-1.5 relative z-10">
                    <ToolTooltip label="Undo" isVisible={shouldShowTooltip("Undo")}>
                      <div 
                        onMouseEnter={() => handleHover("Undo")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={RotateCcw}
                          onClick={handleUndo}
                          isDisabled={!canUndo}
                        />
                      </div>
                    </ToolTooltip>
                    
                    <ToolTooltip label="Redo" isVisible={shouldShowTooltip("Redo")}>
                      <div 
                        onMouseEnter={() => handleHover("Redo")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ToolButton
                          label=""
                          icon={RotateCw}
                          onClick={handleRedo}
                          isDisabled={!canRedo}
                        />
                      </div>
                    </ToolTooltip>
                  </div>
                </>
              )}

              {/* Viewer Mode - only selection tool */}
              {isViewer && (
                <div className="flex items-center gap-x-1.5 relative z-10">
                  <div 
                    onMouseEnter={() => handleHover("Viewer Mode - Selection Only")}
                    onMouseLeave={handleHoverEnd}
                  >
                    <ToolButton
                      label=""
                      icon={MousePointer}
                      onClick={() => handleCanvasStateChange({ mode: CanvasMode.None })}
                      isActive={true}
                    />
                  </div>
                  
                  {/* Viewer indicator - improved design */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/80 border border-amber-200/60 rounded-xl backdrop-blur-sm">
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-amber-700">View Only</span>
                  </div>
                </div>
              )}

              {/* Separatore prima dello zoom */}
              <div className="w-px h-10 bg-gradient-to-b from-transparent via-slate-300/60 to-transparent mx-3 relative z-10" />

              {/* Gruppo zoom e navigazione */}
              <div className="flex items-center gap-x-1.5 relative z-10">
                {/* Zoom Dropdown moderno */}
                <ToolTooltip label="Zoom" isVisible={shouldShowTooltip("Zoom", "zoom")}>
                  <DropdownMenu onOpenChange={(open) => {
                    if (open) {
                      addOpenDropdown("zoom");
                    } else {
                      removeOpenDropdown("zoom");
                    }
                  }}>
                    <DropdownMenuTrigger asChild>
                      <div 
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/60 hover:bg-white/80 cursor-pointer transition-all duration-300 border border-transparent hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 group"
                        title="Select zoom level"
                        onMouseEnter={() => handleHover("Zoom")}
                        onMouseLeave={handleHoverEnd}
                      >
                        <ZoomIn className="h-4 w-4 text-slate-500 group-hover:text-slate-700 transition-colors duration-300" />
                        <span className="text-sm font-semibold text-slate-700 min-w-[3ch] text-center tracking-wide">{zoomPercentage}%</span>
                        <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-600 transition-colors duration-300" />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-32 bg-white/95 backdrop-blur-2xl border border-gray-200/50 shadow-2xl shadow-black/10 rounded-xl p-2">
                      {zoomOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => setZoomTo(option.value)}
                          className={`text-center justify-center rounded-lg mx-1 my-0.5 transition-all duration-300 font-medium ${
                            Math.abs(camera.scale - option.value) < 0.01 
                              ? 'bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md scale-[0.98]' 
                              : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-white text-slate-700 hover:text-slate-900 hover:scale-[1.02]'
                          }`}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ToolTooltip>
                
                {centerOnLayers && (
                  <ToolTooltip label="Fit to screen" isVisible={shouldShowTooltip("Fit to screen")}>
                    <div 
                      className="p-2.5 rounded-xl bg-white/60 hover:bg-white/80 cursor-pointer transition-all duration-300 border border-transparent hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 group"
                      onClick={centerOnLayers}
                      title="Center on elements"
                      onMouseEnter={() => handleHover("Fit to screen")}
                      onMouseLeave={handleHoverEnd}
                    >
                      <Focus className="h-4 w-4 text-slate-500 group-hover:text-slate-700 transition-colors duration-300" />
                    </div>
                  </ToolTooltip>
                )}
                
                {/* Grid Settings */}
                {gridConfig && onGridConfigChange && (
                  <ToolTooltip label="Grid and background" isVisible={shouldShowTooltip("Grid and background")}>
                    <div 
                      onMouseEnter={() => handleHover("Grid and background")}
                      onMouseLeave={handleHoverEnd}
                    >
                      <GridSettings 
                        config={gridConfig}
                        onConfigChange={onGridConfigChange}
                      />
                    </div>
                  </ToolTooltip>
                )}
                
                {/* Export removed from main toolbar */}
              </div>
              
              {/* Editing tools - hidden for viewers */}
              {!isViewer && (
                <>
                  {/* Separatore prima degli utility tools */}
                  <div className="w-px h-10 bg-gradient-to-b from-transparent via-slate-300/60 to-transparent mx-3 relative z-10" />
                  
                  {/* Gruppo utility */}
                  <div className="flex items-center gap-x-1">
                    
                    {/* Auto-save to Library Button */}
                    {onAutoSaveToLibraryChange && (
                      <ToolTooltip 
                        label={
                          !canEnableAutoSave 
                            ? "Storage limit reached - upgrade to enable auto-save" 
                            : autoSaveToLibrary 
                              ? "Auto-save enabled" 
                              : "Auto-save disabled"
                        } 
                        isVisible={shouldShowTooltip("Auto-save")}
                      >
                        <div 
                          onMouseEnter={() => handleHover("Auto-save")}
                          onMouseLeave={handleHoverEnd}
                        >
                          <button
                            onClick={() => onAutoSaveToLibraryChange(!autoSaveToLibrary)}
                            disabled={!canEnableAutoSave && !autoSaveToLibrary}
                            className={`
                              relative w-10 h-10 rounded-xl flex items-center justify-center
                              transition-all duration-200 ease-out border border-transparent
                              ${!canEnableAutoSave && !autoSaveToLibrary
                                ? "bg-red-50 text-red-400 border-red-200 cursor-not-allowed opacity-60"
                                : autoSaveToLibrary 
                                  ? "bg-green-100 text-green-600 border-green-200 hover:bg-green-200 shadow-sm scale-105" 
                                  : "bg-transparent text-gray-400 hover:bg-gray-100/80 hover:text-gray-600 hover:border-gray-200/60 active:scale-95"
                              }
                              focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:ring-offset-2
                              touch-manipulation cursor-pointer
                            `}
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            <Upload className={`h-5 w-5 ${autoSaveToLibrary ? 'drop-shadow-sm' : ''}`} />
                            
                            {/* Indicatore di stato attivo */}
                            {autoSaveToLibrary && (
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-green-600 rounded-full shadow-sm" />
                            )}
                            
                            {/* Indicatore di limite superato */}
                            {!canEnableAutoSave && !autoSaveToLibrary && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full shadow-sm flex items-center justify-center">
                                <X className="h-2 w-2 text-white" />
                              </div>
                            )}
                          </button>
                        </div>
                      </ToolTooltip>
                    )}

                    {!isViewer && (
                      <ToolTooltip label="Upload files" isVisible={shouldShowTooltip("Upload files")}>
                        <div onMouseEnter={() => handleHover("Upload files")} onMouseLeave={handleHoverEnd}>
                          <button
                            onClick={openFilePicker}
                            className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ease-out border border-transparent bg-transparent text-gray-400 hover:bg-gray-100/80 hover:text-gray-600 hover:border-gray-200/60 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 touch-manipulation cursor-pointer"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <Upload className="h-5 w-5" />
                          </button>
                        </div>
                      </ToolTooltip>
                    )}
                    
                    {/* Library Button */}
                    {ENABLE_LIBRARY ? (
                      <ToolTooltip label="Library" isVisible={shouldShowTooltip("Library")}>
                        <LibraryButton 
                          boardId={boardId}
                          onActionHover={(label) => {
                            // Normalize the label to "Library" regardless of what LibraryButton passes
                            handleHover("Library");
                          }}
                          onActionHoverEnd={handleHoverEnd}
                        />
                      </ToolTooltip>
                    ) : null}
                    
                    {/* Todo Button */}
                    {ENABLE_TODO ? (
                      <ToolTooltip label="Todo" isVisible={shouldShowTooltip("Todo")}>
                        <div 
                          onMouseEnter={() => handleHover("Todo")}
                          onMouseLeave={handleHoverEnd}
                        >
                          <TodoButton 
                            boardId={boardId}
                            onCreateWidget={onCreateTodoWidget}
                          />
                        </div>
                      </ToolTooltip>
                    ) : null}
                    
                    {/* Calendar Button */}
                    {ENABLE_CALENDAR ? (
                      <ToolTooltip label="Calendar" isVisible={shouldShowTooltip("Calendar")}>
                        <div 
                          onMouseEnter={() => handleHover("Calendar")}
                          onMouseLeave={handleHoverEnd}
                        >
                          <CalendarButton 
                            boardId={boardId}
                          />
                        </div>
                      </ToolTooltip>
                    ) : null}
                    
                    {/* More Tools Dropdown */}
                    <ToolTooltip label="More Tools" isVisible={shouldShowTooltip("More Tools", "moreTools")}>
                      <DropdownMenu onOpenChange={(open) => {
                        if (open) {
                          addOpenDropdown("moreTools");
                        } else {
                          removeOpenDropdown("moreTools");
                        }
                      }}>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ease-out group border border-transparent backdrop-blur-sm bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2 touch-manipulation cursor-pointer"
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                            }}
                            title="More Tools"
                            onMouseEnter={() => handleHover("More Tools")}
                            onMouseLeave={handleHoverEnd}
                          >
                            <MoreHorizontal className="h-5 w-5 transition-all duration-300 group-hover:scale-110" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-48 bg-white/95 backdrop-blur-2xl border border-gray-200/50 shadow-2xl shadow-black/10 rounded-2xl p-3 mt-2" sideOffset={8}>
                          <DropdownMenuItem
                            onClick={() => onCreateTable?.()}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                          >
                            <TableIcon className="h-4 w-4" />
                            <span className="text-sm">Table</span>
                          </DropdownMenuItem>
                          {showBoardActions ? (
                            <>
                              <DropdownMenuSeparator className="my-2" />
                              {onShareBoard ? (
                                <DropdownMenuItem
                                  onClick={onShareBoard}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                                >
                                  <Share2 className="h-4 w-4" />
                                  <span className="text-sm">Share board</span>
                                </DropdownMenuItem>
                              ) : null}
                              {onDownloadBoard ? (
                                <DropdownMenuItem
                                  onClick={onDownloadBoard}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                                >
                                  <Download className="h-4 w-4" />
                                  <span className="text-sm">Download</span>
                                </DropdownMenuItem>
                              ) : null}
                              {onBoardSettings ? (
                                <DropdownMenuItem
                                  onClick={onBoardSettings}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-gray-100/80 text-gray-700 hover:text-gray-900 hover:shadow-sm"
                                >
                                  <Settings className="h-4 w-4" />
                                  <span className="text-sm">Board settings</span>
                                </DropdownMenuItem>
                              ) : null}
                              {onDeleteBoard ? (
                                <DropdownMenuItem
                                  onClick={onDeleteBoard}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 cursor-pointer hover:bg-red-50 text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-sm">Delete board</span>
                                </DropdownMenuItem>
                              ) : null}
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ToolTooltip>
                  </div>
                </>
              )}
              

            </div>
          </div>
        </div>
      </div>
      
      {/* Individual tooltips are now handled by each tool, no need for centralized label */}
    </>
  );
};

export const ToolbarSkeleton = () => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div
        className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-xl h-[56px] w-[400px] animate-pulse"
        aria-hidden
      >
        <div className="flex items-center justify-center h-full px-4 gap-x-2">
          {/* Gruppo strumenti base */}
          <div className="flex items-center gap-x-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-10 h-10 bg-gray-200/60 rounded-xl" />
            ))}
          </div>
          
          {/* Separatore */}
          <div className="w-px h-8 bg-gray-300/60 mx-2" />
          
          {/* Gruppo undo/redo */}
          <div className="flex items-center gap-x-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="w-10 h-10 bg-gray-200/60 rounded-xl" />
            ))}
          </div>
          
          {/* Separatore */}
          <div className="w-px h-8 bg-gray-300/60 mx-2" />
          
          {/* Gruppo zoom */}
          <div className="flex items-center gap-x-1">
            <div className="w-20 h-10 bg-gray-200/60 rounded-xl" />
            <div className="w-10 h-10 bg-gray-200/60 rounded-xl" />
            <div className="w-10 h-10 bg-gray-200/60 rounded-xl" />
          </div>
          
          {/* Separatore */}
          <div className="w-px h-8 bg-gray-300/60 mx-2" />
          
          {/* Gruppo utility */}
          <div className="flex items-center gap-x-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-10 h-10 bg-gray-200/60 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
