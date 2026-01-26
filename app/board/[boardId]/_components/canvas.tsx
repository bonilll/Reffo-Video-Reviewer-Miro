"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { nanoid } from "nanoid";
import { LiveObject } from "@liveblocks/client";
import { toast } from "sonner";

import {
  useHistory,
  useCanUndo,
  useCanRedo,
  useMutation,
  useStorage,
  useOthersMapped,
  useSelf,
} from "@/liveblocks.config";
import {
  Camera,
  CanvasMode,
  CanvasState,
  Color,
  LayerType,
  Point,
  Side,
  XYWH,
  TodoWidgetLayer,
  TableLayer,
  TableColumn,
  TableRow,
  TableCell,
  TableColumnType,
} from "@/types/canvas";
import { useDisableScrollBounce } from "@/hooks/use-disable-scroll-bounce";
import { useDeleteLayers } from "@/hooks/use-delete-layers";
import { useSelectionBounds } from "@/hooks/use-selection-bounds";
import { useArrowSnap } from "@/hooks/use-arrow-snap";
import { useCamera } from "@/app/contexts/CameraContext";
import { useBoardSettings } from "@/app/contexts/BoardSettingsContext";
import { useCameraPersistence } from "@/hooks/use-camera-persistence";
import { useMobileGestures } from "@/hooks/use-mobile-gestures";
import { useResourcePermissions } from "@/hooks/use-resource-permissions";
import { Id } from "@/convex/_generated/dataModel";

import { Info } from "./info";
import { Participants } from "./participants";
import { SecureToolbar, useBoardToolbarActions } from "./secure-toolbar";
import { CursorsPresence } from "./cursors-presence";
import { SelectionBox } from "./selection-box";
import { LayerPreview } from "./layer-preview";
import { Path } from "./path";
import { GridRenderer } from "./grid-renderer";
import { GridConfig } from "./grid-settings";
import { FrameContextMenu } from "./frame-context-menu";
import { NoteConnectionPoints } from "./note-connection-points";
import { ArrowSnapIndicators } from "./arrow-snap-indicators";
import { TodoListSelectorModal } from "./todo-list-selector-modal";
import { SnapGuidelines } from "./snap-guidelines";

import { 
  colorToCSS, 
  connectionIdToColor, 
  findIntersectingLayersWithRectangle, 
  penPointsToPathLayer, 
  pointerEventToCanvasPoint, 
  resizeBounds,
  resizeGroupBounds,
  findLayersInFrame,
  isLayerContainedInFrame,
  isLayerOverlappingFrame,
  calculateFrameBoundsForLayers,
  shouldFrameAutoResize,
  calculateOptimalFrameBounds,
  shouldTriggerAutoResize,
  interpolateFrameBounds,
  findParentFrame,
  getFrameHierarchy,
  shouldLayerMoveIndependently,
  getImmediateChildren,
  absoluteToRelative,
  relativeToAbsolute,
  constrainToAngle,
  constrainToSquare,
  getLayerAspectRatio,
  constrainResizeToAspectRatio
} from "@/lib/utils";
import { 
  calculateSnapLines, 
  calculateSnapPosition, 
  layerToLayerBounds,
  snapArrowToConnectionPoints,
  SnapLine,
  SNAP_CONFIG 
} from "@/lib/snap-utils";

// Rimuovi il limite: usa -1 per infinito
const MAX_LAYERS = -1;

// Costanti per lo zoom
const ZOOM_SPEED = 0.0007; // Aumentato per sensibilità 7% per scatto di rotella
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

type CanvasProps = {
  boardId: string;
  userRole?: string;
  onOpenShare?: () => void;
};

// Componente SelectionNet semplice
const SelectionNet = ({ origin, current }: { origin: Point; current: Point }) => {
  return (
    <rect
      className="fill-blue-500/5 stroke-blue-500 stroke-1"
      x={Math.min(origin.x, current.x)}
      y={Math.min(origin.y, current.y)}
      width={Math.abs(origin.x - current.x)}
      height={Math.abs(origin.y - current.y)}
    />
  );
};

export const Canvas = ({ boardId, userRole, onOpenShare }: CanvasProps) => {
  const layerIds = useStorage((root) => root.layerIds);
  const pencilDraft = useSelf((me) => me.presence.pencilDraft);

  // 🛡️ SECURITY: Viewer restrictions - disable editing for viewers
  const isViewer = userRole === "viewer";
  
  // Get board permissions and project info for todo list selector
  const { projectId } = useResourcePermissions("board", boardId as Id<"boards">);
  
  console.log("🔒 Canvas Security Check:", {
    boardId,
    userRole,
    isViewer,
    timestamp: new Date().toISOString()
  });

  // 🛡️ SECURITY: Board toolbar actions with permission checking
  const {
    handleShareBoard,
    handleDownloadBoard, 
    handleDeleteBoard,
    handleBoardSettings,
    permissions
  } = useBoardToolbarActions(boardId, { onShareBoard: onOpenShare });

  // CAMERA CONTEXT - per sincronizzare con componenti esterni
  const { camera: contextCamera, setCamera: setContextCamera } = useCamera();

  // BOARD SETTINGS CONTEXT - per le impostazioni della board
  const { gridConfig, updateGridConfig, autoSaveToLibrary, updateAutoSaveToLibrary, canEnableAutoSave } = useBoardSettings();
  
  // Funzione per calcolare il colore contrario al background
  const getContrastingColor = useCallback((backgroundColor: string): Color => {
    // Converte il colore hex/string in RGB per analizzarlo
    let r = 0, g = 0, b = 0;
    
    if (backgroundColor.startsWith('#')) {
      // Gestisce formato hex
      const hex = backgroundColor.slice(1);
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      }
    } else if (backgroundColor.startsWith('rgb')) {
      // Gestisce formato rgb(r,g,b)
      const matches = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (matches) {
        r = parseInt(matches[1]);
        g = parseInt(matches[2]);
        b = parseInt(matches[3]);
      }
    }
    
    // Calcola la luminosità del background (0-255)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    
    // Se il background è scuro (luminosità < 128), usa colore chiaro
    // Se il background è chiaro, usa colore scuro
    if (luminance < 128) {
      // Background scuro -> testo/forme chiare (bianco o grigio molto chiaro)
      return { r: 248, g: 250, b: 252 }; // slate-50
    } else {
      // Background chiaro -> testo/forme scure (nero o grigio molto scuro)
      return { r: 30, g: 41, b: 59 }; // slate-800
    }
  }, []);
  
  // Inizializza lastUsedColor basato sul background corrente
  const [lastUsedColor, setLastUsedColor] = useState<Color>(() => 
    getContrastingColor(gridConfig.backgroundColor)
  );

  // Aggiorna automaticamente lastUsedColor quando cambia il background
  useEffect(() => {
    const newContrastingColor = getContrastingColor(gridConfig.backgroundColor);
    setLastUsedColor(newContrastingColor);
  }, [gridConfig.backgroundColor, getContrastingColor]);

  const [canvasState, setCanvasState] = useState<CanvasState>({
    mode: CanvasMode.None,
  });

  // Stati per le impostazioni di testo delle note
  const [lastUsedFontSize, setLastUsedFontSize] = useState<number>(16);
  const [lastUsedFontWeight, setLastUsedFontWeight] = useState<string>("normal");

  // Sistema camera semplificato - stato locale per performance
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  
  // Sistema di snap - linee guida attive durante il drag
  const [activeSnapLines, setActiveSnapLines] = useState<SnapLine[]>([]);
  
  // Informazioni del layer corrente per l'opacità delle guide
  const [currentMovingLayer, setCurrentMovingLayer] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  
  // Integrazione persistenza camera con Convex
  const { savedCamera, hasCameraLoaded } = useCameraPersistence({
    boardId,
    camera,
    onCameraLoad: (loadedCamera) => {
      console.log("📷 Canvas: Loading camera from Convex:", loadedCamera);
      setCamera(loadedCamera);
    }
  });
  
  // Stato per lo spessore del tratto della matita
  const [pencilStrokeWidth, setPencilStrokeWidth] = useState(16);

  // SINCRONIZZAZIONE: aggiorna il context ogni volta che la camera locale cambia
  useEffect(() => {
    // Solo sincronizza dopo che la camera è stata caricata da Convex
    if (hasCameraLoaded) {
      console.log("📷 Canvas camera updated, syncing with context:", camera);
      setContextCamera(camera);
    }
  }, [camera, setContextCamera, hasCameraLoaded]);



  // Gestione panning
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Stato per la posizione iniziale del mouse durante il resize
  const [resizeInitialMousePos, setResizeInitialMousePos] = useState<Point | null>(null);

  // Stato per lo snapshot iniziale dei layer durante il group resize
  const [initialLayersSnapshot, setInitialLayersSnapshot] = useState<Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null>(null);

  // Stato per il resize di frecce e linee
  const [isResizingArrowLine, setIsResizingArrowLine] = useState<{
    layerId: string;
    isStartPoint: boolean;
  } | null>(null);

  // Stato per il context menu dei frame
  const [frameContextMenu, setFrameContextMenu] = useState<{
    frameId: string;
    x: number;
    y: number;
  } | null>(null);

  // Stato per la clipboard (copia e incolla)
  const [clipboard, setClipboard] = useState<Array<any> | null>(null);

  // Stato per tracciare il tasto Shift
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  
  // Stato per tracciare il tasto Alt (per duplicazione)
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Stato per la posizione corrente del mouse (per snap indicators)
  const [currentMousePosition, setCurrentMousePosition] = useState<Point>({ x: 0, y: 0 });

  // Stato per la creazione del widget todo
  const [showTodoListSelector, setShowTodoListSelector] = useState(false);

  // Stato per la creazione delle tabelle


  useDisableScrollBounce();
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Ottieni la selezione e i layers
  const mySelection = useSelf((me) => me.presence.selection);
  const allLayers = useStorage((root) => root.layers);
  const currentUser = useSelf();
  
  // Hook per snap automatico delle frecce
  const { updateArrowSnap, checkSnapPreview, getSnapPoint, SNAP_DISTANCE } = useArrowSnap();

  const insertLayer = useMutation(
    (
      { storage, setMyPresence },
      layerType: LayerType.Ellipse | LayerType.Rectangle | LayerType.Text | LayerType.Note | LayerType.Arrow | LayerType.Line | LayerType.Frame | LayerType.Image | LayerType.Video | LayerType.File,
      position: Point,
      endPosition?: Point,
      userInfo?: { name?: string },
      frameFormat?: { name: string; width: number; height: number },
    ) => {
      const liveLayers = storage.get("layers");
      if (MAX_LAYERS >= 0 && liveLayers.size >= MAX_LAYERS) {
        return;
      }

      const liveLayerIds = storage.get("layerIds");
      const layerId = nanoid();
      
      let layer;
      
      if (layerType === LayerType.Frame) {
        console.log('🏗️ insertLayer received frameFormat:', frameFormat, 'endPosition:', endPosition);
        // Per frame, crea un frame con dimensioni di default o drag
        let frameWidth = 300;
        let frameHeight = 200;
        let frameX = position.x;
        let frameY = position.y;
        
        // Se c'è un formato preset, usalo (a meno che non ci sia un drag)
        if (frameFormat && !endPosition) {
          console.log('✅ Using frameFormat dimensions:', frameFormat.width, 'x', frameFormat.height);
          frameWidth = frameFormat.width;
          frameHeight = frameFormat.height;
        } else if (endPosition) {
          // Se c'è un drag, usa le dimensioni dragged (Custom Size)
          const minX = Math.min(position.x, endPosition.x);
          const minY = Math.min(position.y, endPosition.y);
          frameWidth = Math.max(Math.abs(endPosition.x - position.x), 100);
          frameHeight = Math.max(Math.abs(endPosition.y - position.y), 80);
          frameX = minX;
          frameY = minY;
        }
        
        layer = new LiveObject({
          type: LayerType.Frame,
          x: frameX,
          y: frameY,
          height: frameHeight,
          width: frameWidth,
          fill: { r: 255, g: 255, b: 255 }, // Background bianco puro
          title: "Frame",
          borderColor: { r: 226, g: 232, b: 240 }, // Bordo grigio moderno
          borderWidth: 1,
          borderStyle: "solid" as const,
          children: [],
          clipping: false,
          autoResize: false,
          opacity: 1,
        });
      } else if (layerType === LayerType.Arrow || layerType === LayerType.Line) {
        // Per frecce e linee, usiamo la posizione di partenza e di arrivo
        const startPoint = position;
        const endPoint = endPosition || { x: position.x + 100, y: position.y + 50 };
        
        // Calcola il bounding box base
        const minX = Math.min(startPoint.x, endPoint.x);
        const minY = Math.min(startPoint.y, endPoint.y);
        const maxX = Math.max(startPoint.x, endPoint.x);
        const maxY = Math.max(startPoint.y, endPoint.y);
        
        const baseWidth = Math.max(maxX - minX, 50); // Minimo 50px
        const baseHeight = Math.max(maxY - minY, 20); // Minimo 20px
        
        // Calcola lo spazio extra necessario per frecce e linee
        const strokeWidth = 2;
        const extraForStroke = strokeWidth * 2; // Spazio per lo spessore della linea
        
        let extraForArrowHead = 0;
        if (layerType === LayerType.Arrow) {
          // Calcola la lunghezza effettiva della freccia
          const arrowLength = Math.sqrt(
            Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)
          );
          // Usa la stessa formula del componente Arrow
          const arrowHeadLength = Math.min(Math.max(arrowLength * 0.2, 8), 25); // Min 8px, Max 25px, 20% della lunghezza
          extraForArrowHead = Math.max(arrowHeadLength, 15); // Minimo 15px di spazio
        }
        
        // Calcola lo spazio totale extra necessario
        const extraSpace = extraForStroke + extraForArrowHead + 10; // +10px di margine di sicurezza
        
        // Estendi il bounding box in tutte le direzioni
        const finalX = minX - extraSpace;
        const finalY = minY - extraSpace;
        const finalWidth = baseWidth + (extraSpace * 2);
        const finalHeight = baseHeight + (extraSpace * 2);
        
        layer = new LiveObject({
          type: layerType,
          x: finalX,
          y: finalY,
          height: finalHeight,
          width: finalWidth,
          fill: lastUsedColor,
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y,
          strokeWidth: strokeWidth,
          // Inizializza i campi di snap
          sourceNoteId: undefined,
          targetNoteId: undefined,
          sourceSide: undefined,
          targetSide: undefined,
          isSnappedToSource: false,
          isSnappedToTarget: false,
          isMindMapConnection: false,
        });
      } else if (layerType === LayerType.Rectangle || layerType === LayerType.Ellipse) {
        // Per rettangoli e cerchi con drag
        if (endPosition) {
          const minX = Math.min(position.x, endPosition.x);
          const minY = Math.min(position.y, endPosition.y);
          const width = Math.abs(endPosition.x - position.x);
          const height = Math.abs(endPosition.y - position.y);
          
          // Dimensioni minime per visibilità
          const finalWidth = Math.max(width, 20);
          const finalHeight = Math.max(height, 20);
          
          layer = new LiveObject({
            type: layerType,
            x: minX,
            y: minY,
            height: finalHeight,
            width: finalWidth,
            fill: lastUsedColor,
          });
        } else {
          // Fallback per click singolo
          layer = new LiveObject({
        type: layerType,
        x: position.x,
        y: position.y,
            height: 100,
            width: 100,
            fill: lastUsedColor,
          });
        }
      } else if (layerType === LayerType.Image || layerType === LayerType.Video || layerType === LayerType.File) {
        // Per Image, Video, File - crea layer con dimensioni di default
        const defaultSize = 200;
        const defaultUrl = layerType === LayerType.Image ? "/placeholder-image.png" : 
                          layerType === LayerType.Video ? "/placeholder-video.mp4" : 
                          "/placeholder-file.pdf";
        
        if (layerType === LayerType.Image) {
          layer = new LiveObject({
            type: LayerType.Image,
            x: position.x,
            y: position.y,
            height: defaultSize,
            width: defaultSize,
            url: defaultUrl,
            title: "New Image",
            shadow: true,
          });
        } else if (layerType === LayerType.Video) {
          layer = new LiveObject({
            type: LayerType.Video,
            x: position.x,
            y: position.y,
            height: defaultSize,
            width: defaultSize,
            url: defaultUrl,
            title: "New Video",
            shadow: true,
          });
        } else if (layerType === LayerType.File) {
          layer = new LiveObject({
            type: LayerType.File,
            x: position.x,
            y: position.y,
            height: defaultSize,
            width: defaultSize,
            url: defaultUrl,
            title: "New File",
            fileName: "document.pdf",
            fileType: "pdf",
            fileSize: 0,
            shadow: true,
          });
        }
      } else {
        // Per altri tipi di layer, usa la logica esistente
        const isNote = layerType === LayerType.Note;
        const size = isNote ? 200 : 100; // Note iniziano con 200px, altri con 100px
        
        // Crea il layer base
        const baseLayer = {
        type: layerType,
        x: position.x,
        y: position.y,
          height: size,
          width: size,
          fill: lastUsedColor,
        };
        
        // Aggiungi campi specifici per le note
        if (isNote) {
          layer = new LiveObject({
            ...baseLayer,
            fontSize: lastUsedFontSize, // Usa l'ultima dimensione testo utilizzata
            fontWeight: lastUsedFontWeight, // Usa l'ultimo peso carattere utilizzato
            textAlign: "center", // Default al centro per le note
            lastModifiedBy: userInfo?.name || "User",
            lastModifiedAt: new Date().toISOString(),
            showMetadata: true,
          });
        } else {
          layer = new LiveObject(baseLayer);
        }
      }

      // Insert the layer in the correct position based on type
      if (layerType === LayerType.Frame) {
        // For frames: find the correct position among existing frames
        // Frames should be behind all non-frame elements
        const allLayerIds = [...liveLayerIds.toArray()];
        let insertPosition = 0;
        
        // Find the last frame position (frames should be inserted after existing frames but before non-frames)
        for (let i = 0; i < allLayerIds.length; i++) {
          const existingLayer = liveLayers.get(allLayerIds[i]);
          if (existingLayer && existingLayer.get("type") === LayerType.Frame) {
            insertPosition = i + 1;
          } else {
            // Found first non-frame, stop here
            break;
          }
        }
        
        // Insert the frame at the calculated position
        liveLayerIds.insert(layerId, insertPosition);
      } else {
        // For non-frames: add at the end (in front of everything)
      liveLayerIds.push(layerId);
      }
      
      liveLayers.set(layerId, layer);

      setMyPresence({ selection: [layerId] }, { addToHistory: true });
      
      return layerId; // Restituisci l'ID del layer creato
    },
    [lastUsedColor, lastUsedFontSize, lastUsedFontWeight],
  );

  // Mutation specializzata per inserire frecce/linee con metadati di snap
  const insertLayerWithSnap = useMutation(
    (
      { storage, setMyPresence },
      layerType: LayerType.Arrow | LayerType.Line,
      position: Point,
      endPosition: Point,
      userInfo?: { name?: string },
      sourceSnap?: any,
      targetSnap?: any
    ) => {
      const liveLayers = storage.get("layers");
      if (MAX_LAYERS >= 0 && liveLayers.size >= MAX_LAYERS) {
        return;
      }

      const liveLayerIds = storage.get("layerIds");
      const layerId = nanoid();
      
      // Calcola il bounding box
      const minX = Math.min(position.x, endPosition.x);
      const minY = Math.min(position.y, endPosition.y);
      const maxX = Math.max(position.x, endPosition.x);
      const maxY = Math.max(position.y, endPosition.y);
      
      const baseWidth = Math.max(maxX - minX, 50);
      const baseHeight = Math.max(maxY - minY, 20);
      
      const strokeWidth = 2;
      const extraForStroke = strokeWidth * 2;
      
      let extraForArrowHead = 0;
      if (layerType === LayerType.Arrow) {
        const arrowLength = Math.sqrt(
          Math.pow(endPosition.x - position.x, 2) + Math.pow(endPosition.y - position.y, 2)
        );
        const arrowHeadLength = Math.min(Math.max(arrowLength * 0.2, 8), 25);
        extraForArrowHead = Math.max(arrowHeadLength, 15);
      }
      
      const extraSpace = extraForStroke + extraForArrowHead + 10;
      let finalX = minX - extraSpace;
      let finalY = minY - extraSpace;
      let finalWidth = baseWidth + (extraSpace * 2);
      let finalHeight = baseHeight + (extraSpace * 2);
      
      // Calcola curve automatiche se la freccia è snappata
      let curveData = {};
      const hasSnap = sourceSnap || targetSnap;
      
      if (hasSnap && layerType === LayerType.Arrow) {
        const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
          position.x,
          position.y,
          endPosition.x,
          endPosition.y,
          sourceSnap?.side,
          targetSnap?.side
        );
        
        curveData = {
          curved: true,
          controlPoint1X: controlPoint1.x,
          controlPoint1Y: controlPoint1.y,
          controlPoint2X: controlPoint2.x,
          controlPoint2Y: controlPoint2.y,
        };
        
        // Ricalcola bounding box includendo i punti di controllo
        const allX = [position.x, endPosition.x, controlPoint1.x, controlPoint2.x];
        const allY = [position.y, endPosition.y, controlPoint1.y, controlPoint2.y];
        const newMinX = Math.min(...allX) - extraSpace;
        const newMaxX = Math.max(...allX) + extraSpace;
        const newMinY = Math.min(...allY) - extraSpace;
        const newMaxY = Math.max(...allY) + extraSpace;
        
        finalX = newMinX;
        finalY = newMinY;
        finalWidth = newMaxX - newMinX;
        finalHeight = newMaxY - newMinY;
      }
      
      // Crea il layer con tutti i metadati di snap e curve
      const layer = new LiveObject({
        type: layerType,
        x: finalX,
        y: finalY,
        height: finalHeight,
        width: finalWidth,
        fill: lastUsedColor,
        startX: position.x,
        startY: position.y,
        endX: endPosition.x,
        endY: endPosition.y,
        strokeWidth: strokeWidth,
        // Metadati di snap
        sourceNoteId: sourceSnap?.id,
        targetNoteId: targetSnap?.id,
        sourceSide: sourceSnap?.side,
        targetSide: targetSnap?.side,
        isSnappedToSource: !!sourceSnap,
        isSnappedToTarget: !!targetSnap,
        isMindMapConnection: false,
        // Curve automatiche
        ...curveData,
      });

      // Inserisci il layer
      liveLayerIds.push(layerId);
      liveLayers.set(layerId, layer);

      setMyPresence({ selection: [layerId] }, { addToHistory: true });
      
      console.log("✅ Created arrow with snap metadata:", layerId, {
        sourceSnap: sourceSnap ? `${sourceSnap.id}:${sourceSnap.side}` : 'none',
        targetSnap: targetSnap ? `${targetSnap.id}:${targetSnap.side}` : 'none'
      });
      
      return layerId;
    },
    [lastUsedColor],
  );

  // Gestione movimento del layer per mantenere coerenza con snap automatico
  const translateArrowLine = useMutation(
    ({ storage }, layerId: string, offset: Point) => {
      const liveLayers = storage.get("layers");
      const layer = liveLayers.get(layerId);
      
      if (layer && (layer.get("type") === LayerType.Arrow || layer.get("type") === LayerType.Line)) {
        const layerData = layer.toObject() as any;
        
        // Calcola le nuove posizioni
        const newStartX = layerData.startX + offset.x;
        const newStartY = layerData.startY + offset.y;
        const newEndX = layerData.endX + offset.x;
        const newEndY = layerData.endY + offset.y;
        
        // Applica snap automatico se la freccia non è già agganciata
        const snapResult = updateArrowSnap(layerId, newStartX, newStartY, newEndX, newEndY);
        
        // Se lo snap ha modificato le posizioni, usa quelle; altrimenti usa le posizioni originali + offset
        const finalStartX = snapResult?.newStartX ?? newStartX;
        const finalStartY = snapResult?.newStartY ?? newStartY;
        const finalEndX = snapResult?.newEndX ?? newEndX;
        const finalEndY = snapResult?.newEndY ?? newEndY;
        
        // Calcola nuovo bounding box
        const minX = Math.min(finalStartX, finalEndX) - 20;
        const maxX = Math.max(finalStartX, finalEndX) + 20;
        const minY = Math.min(finalStartY, finalEndY) - 20;
        const maxY = Math.max(finalStartY, finalEndY) + 20;
        
        // Rimuovi il layer esistente e creane uno nuovo con posizioni aggiornate
        liveLayers.delete(layerId);
        const newLayer = new LiveObject({
          type: layerData.type,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          fill: layerData.fill,
          startX: finalStartX,
          startY: finalStartY,
          endX: finalEndX,
          endY: finalEndY,
          strokeWidth: layerData.strokeWidth || 2,
          // Mantieni metadati di snap se esistenti
          sourceNoteId: snapResult?.sourceNote || layerData.sourceNoteId,
          targetNoteId: snapResult?.targetNote || layerData.targetNoteId,
          sourceSide: layerData.sourceSide,
          targetSide: layerData.targetSide,
          isSnappedToSource: snapResult?.snappedToSource ?? layerData.isSnappedToSource,
          isSnappedToTarget: snapResult?.snappedToTarget ?? layerData.isSnappedToTarget,
          isMindMapConnection: layerData.isMindMapConnection,
        });
        liveLayers.set(layerId, newLayer);
        
        console.log("🔄 Arrow/Line translated with snap:", layerId, {
          offset,
          snapApplied: !!snapResult,
          snappedToSource: snapResult?.snappedToSource,
          snappedToTarget: snapResult?.snappedToTarget
        });
      }
    },
    [updateArrowSnap]
  );

  // Helper function per aggiornare TUTTE le frecce connesse (più aggressive)
  const updateAllConnectedArrows = useMutation(({ storage }) => {
    const liveLayers = storage.get("layers");
    const arrowsToUpdate: Array<{ id: string; arrow: any }> = [];
    
    // Trova tutte le frecce connesse (Mind Map e Snapped)
    liveLayers.forEach((layer: any, layerId: string) => {
      const layerData = layer.toObject();
      if (layerData.type === LayerType.Arrow) {
        const isMindMapArrow = layerData.isMindMapConnection;
        const isSnappedArrow = layerData.isSnappedToSource || layerData.isSnappedToTarget;
        
        if (isMindMapArrow || isSnappedArrow) {
          arrowsToUpdate.push({ id: layerId, arrow: layerData });
        }
      }
    });

    // Aggiorna ogni freccia
    arrowsToUpdate.forEach(({ id, arrow }) => {
      const arrowLayer = liveLayers.get(id);
      if (!arrowLayer) return;

      let newStartX = arrow.startX;
      let newStartY = arrow.startY;
      let newEndX = arrow.endX;
      let newEndY = arrow.endY;
      let needsUpdate = false;

      // Aggiorna punto di partenza se connesso a una nota
      if (arrow.sourceNoteId) {
        const sourceNote = liveLayers.get(arrow.sourceNoteId);
        if (sourceNote) {
          const connectionPoint = getMindMapConnectionPoint(
            sourceNote.get("x"),
            sourceNote.get("y"),
            sourceNote.get("width"),
            sourceNote.get("height"),
            arrow.sourceSide || "right"
          );
          if (Math.abs(newStartX - connectionPoint.x) > 1 || Math.abs(newStartY - connectionPoint.y) > 1) {
            newStartX = connectionPoint.x;
            newStartY = connectionPoint.y;
            needsUpdate = true;
          }
        }
      }

      // Aggiorna punto di arrivo se connesso a una nota
      if (arrow.targetNoteId) {
        const targetNote = liveLayers.get(arrow.targetNoteId);
        if (targetNote) {
          const connectionPoint = getMindMapConnectionPoint(
            targetNote.get("x"),
            targetNote.get("y"),
            targetNote.get("width"),
            targetNote.get("height"),
            arrow.targetSide || "left"
          );
          if (Math.abs(newEndX - connectionPoint.x) > 1 || Math.abs(newEndY - connectionPoint.y) > 1) {
            newEndX = connectionPoint.x;
            newEndY = connectionPoint.y;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        const isMindMapArrow = arrow.isMindMapConnection;
        
        let updateData: any = {
          startX: newStartX,
          startY: newStartY,
          endX: newEndX,
          endY: newEndY,
        };

        // Calcola curve per entrambi i tipi
        if (isMindMapArrow || arrow.isSnappedToSource || arrow.isSnappedToTarget) {
          const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
            newStartX,
            newStartY,
            newEndX,
            newEndY,
            arrow.sourceSide,
            arrow.targetSide
          );

          // Calcola bounding box includendo le curve
          const minX = Math.min(newStartX, newEndX, controlPoint1.x, controlPoint2.x) - 20;
          const maxX = Math.max(newStartX, newEndX, controlPoint1.x, controlPoint2.x) + 20;
          const minY = Math.min(newStartY, newEndY, controlPoint1.y, controlPoint2.y) - 20;
          const maxY = Math.max(newStartY, newEndY, controlPoint1.y, controlPoint2.y) + 20;

          updateData = {
            ...updateData,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            curved: true,
            controlPoint1X: controlPoint1.x,
            controlPoint1Y: controlPoint1.y,
            controlPoint2X: controlPoint2.x,
            controlPoint2Y: controlPoint2.y,
          };
        } else {
          // Per frecce non snappate: bounding box semplice
          const minX = Math.min(newStartX, newEndX) - 20;
          const maxX = Math.max(newStartX, newEndX) + 20;
          const minY = Math.min(newStartY, newEndY) - 20;
          const maxY = Math.max(newStartY, newEndY) + 20;

          updateData = {
            ...updateData,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
        }

        // Aggiorna la freccia
        arrowLayer.update(updateData);
      }
    });
  }, []);

  // Helper function per aggiornare le frecce Mind Map quando le note vengono spostate
  const updateMindMapArrows = (liveLayers: any, movedNoteIds: Set<string>) => {
    console.log("🔄 Updating Mind Map arrows for moved notes:", Array.from(movedNoteIds));
    
    // Trova tutte le frecce Mind Map che sono connesse alle note spostate
    const arrowsToUpdate: Array<{ id: string; arrow: any }> = [];
    
    liveLayers.forEach((layer: any, layerId: string) => {
      const layerData = layer.toObject();
      if (layerData.type === LayerType.Arrow) {
        // Includi frecce Mind Map e frecce snappate
        const isMindMapArrow = layerData.isMindMapConnection;
        const isSnappedArrow = layerData.isSnappedToSource || layerData.isSnappedToTarget;
        
        // Debug solo per frecce che hanno metadati di snap
        if (isSnappedArrow || isMindMapArrow) {
          console.log("🔍 Connected arrow", layerId, "metadata:", {
            type: isMindMapArrow ? "Mind Map" : "Snapped",
            sourceNoteId: layerData.sourceNoteId,
            targetNoteId: layerData.targetNoteId,
            sourceSide: layerData.sourceSide,
            targetSide: layerData.targetSide
          });
        }
        
        if (isMindMapArrow || isSnappedArrow) {
          const needsUpdate = 
            (layerData.sourceNoteId && movedNoteIds.has(layerData.sourceNoteId)) ||
            (layerData.targetNoteId && movedNoteIds.has(layerData.targetNoteId));
          
          if (needsUpdate) {
            arrowsToUpdate.push({ id: layerId, arrow: layerData });
            console.log("🎯 Found arrow to update:", layerId, 
              isMindMapArrow ? "(Mind Map)" : "(Snapped)", 
              "connected to notes:", layerData.sourceNoteId, "->", layerData.targetNoteId);
          }
        }
      }
    });

    // Aggiorna ogni freccia
    arrowsToUpdate.forEach(({ id, arrow }) => {
      const arrowLayer = liveLayers.get(id);
      if (!arrowLayer) return;

      let newStartX = arrow.startX;
      let newStartY = arrow.startY;
      let newEndX = arrow.endX;
      let newEndY = arrow.endY;
      let needsUpdate = false;

      // Aggiorna punto di partenza se la nota sorgente è stata spostata
      if (arrow.sourceNoteId && movedNoteIds.has(arrow.sourceNoteId)) {
        const sourceNote = liveLayers.get(arrow.sourceNoteId);
        if (sourceNote) {
          const connectionPoint = getMindMapConnectionPoint(
            sourceNote.get("x"),
            sourceNote.get("y"),
            sourceNote.get("width"),
            sourceNote.get("height"),
            arrow.sourceSide || "right"
          );
          newStartX = connectionPoint.x;
          newStartY = connectionPoint.y;
          needsUpdate = true;
        }
      }

      // Aggiorna punto di arrivo se la nota target è stata spostata
      if (arrow.targetNoteId && movedNoteIds.has(arrow.targetNoteId)) {
        const targetNote = liveLayers.get(arrow.targetNoteId);
        if (targetNote) {
          const connectionPoint = getMindMapConnectionPoint(
            targetNote.get("x"),
            targetNote.get("y"),
            targetNote.get("width"),
            targetNote.get("height"),
            arrow.targetSide || "left"
          );
          newEndX = connectionPoint.x;
          newEndY = connectionPoint.y;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        const isMindMapArrow = arrow.isMindMapConnection;
        
        let updateData: any = {
          startX: newStartX,
          startY: newStartY,
          endX: newEndX,
          endY: newEndY,
        };

        if (isMindMapArrow) {
          // Per frecce Mind Map: usa la stessa funzione delle frecce snappate per consistenza
          const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
            newStartX,
            newStartY,
            newEndX,
            newEndY,
            arrow.sourceSide,
            arrow.targetSide
          );

          // Calcola bounding box includendo le curve
          const minX = Math.min(newStartX, newEndX, controlPoint1.x, controlPoint2.x) - 20;
          const maxX = Math.max(newStartX, newEndX, controlPoint1.x, controlPoint2.x) + 20;
          const minY = Math.min(newStartY, newEndY, controlPoint1.y, controlPoint2.y) - 20;
          const maxY = Math.max(newStartY, newEndY, controlPoint1.y, controlPoint2.y) + 20;

          updateData = {
            ...updateData,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            curved: true,
            controlPoint1X: controlPoint1.x,
            controlPoint1Y: controlPoint1.y,
            controlPoint2X: controlPoint2.x,
            controlPoint2Y: controlPoint2.y,
          };
        } else {
          // Per frecce snappate: calcola curve automatiche se sono snappate
          if (arrow.isSnappedToSource || arrow.isSnappedToTarget) {
            const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
              newStartX,
              newStartY,
              newEndX,
              newEndY,
              arrow.sourceSide,
              arrow.targetSide
            );
            
            // Calcola bounding box includendo le curve
            const minX = Math.min(newStartX, newEndX, controlPoint1.x, controlPoint2.x) - 20;
            const maxX = Math.max(newStartX, newEndX, controlPoint1.x, controlPoint2.x) + 20;
            const minY = Math.min(newStartY, newEndY, controlPoint1.y, controlPoint2.y) - 20;
            const maxY = Math.max(newStartY, newEndY, controlPoint1.y, controlPoint2.y) + 20;

            updateData = {
              ...updateData,
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
              curved: true,
              controlPoint1X: controlPoint1.x,
              controlPoint1Y: controlPoint1.y,
              controlPoint2X: controlPoint2.x,
              controlPoint2Y: controlPoint2.y,
            };
          } else {
            // Per frecce non snappate: bounding box semplice
            const minX = Math.min(newStartX, newEndX) - 20;
            const maxX = Math.max(newStartX, newEndX) + 20;
            const minY = Math.min(newStartY, newEndY) - 20;
            const maxY = Math.max(newStartY, newEndY) + 20;

            updateData = {
              ...updateData,
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
            };
          }
        }

        // Aggiorna la freccia
        arrowLayer.update(updateData);

        console.log("✅ Updated", isMindMapArrow ? "Mind Map" : "Snapped", "arrow:", id, 
          "new positions:", { newStartX, newStartY, newEndX, newEndY });
      }
    });
  };

  // Helper functions per Mind Map
  const getMindMapConnectionPoint = (
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    side: "top" | "right" | "bottom" | "left"
  ): { x: number; y: number } => {
    switch (side) {
      case "top":
        return { x: x + width / 2, y: y };
      case "right":
        return { x: x + width, y: y + height / 2 };
      case "bottom":
        return { x: x + width / 2, y: y + height };
      case "left":
        return { x: x, y: y + height / 2 };
      default:
        return { x: x + width / 2, y: y + height / 2 };
    }
  };



  // Funzione per calcolare curve automatiche stile Figma per frecce snappate
  const calculateAutoCurveControlPoints = (
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    sourceSide?: "top" | "right" | "bottom" | "left",
    targetSide?: "top" | "right" | "bottom" | "left"
  ): { controlPoint1: { x: number; y: number }; controlPoint2: { x: number; y: number } } => {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Fattore di curvatura basato sulla distanza (più lontano = più curvo)
    const curveFactor = Math.min(distance * 0.4, 150); // Max 150px di curvatura
    
    let control1X = startX;
    let control1Y = startY;
    let control2X = endX;
    let control2Y = endY;
    
    // Calcola punti di controllo basati sui lati delle note
    if (sourceSide) {
      switch (sourceSide) {
        case "top":
          control1Y = startY - curveFactor;
          break;
        case "bottom":
          control1Y = startY + curveFactor;
          break;
        case "left":
          control1X = startX - curveFactor;
          break;
        case "right":
          control1X = startX + curveFactor;
          break;
      }
    } else {
      // Se non c'è lato sorgente, usa direzione generale
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        control1X = startX + (deltaX > 0 ? curveFactor : -curveFactor);
      } else {
        control1Y = startY + (deltaY > 0 ? curveFactor : -curveFactor);
      }
    }
    
    if (targetSide) {
      switch (targetSide) {
        case "top":
          control2Y = endY - curveFactor;
          break;
        case "bottom":
          control2Y = endY + curveFactor;
          break;
        case "left":
          control2X = endX - curveFactor;
          break;
        case "right":
          control2X = endX + curveFactor;
          break;
      }
    } else {
      // Se non c'è lato target, usa direzione generale
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        control2X = endX + (deltaX > 0 ? -curveFactor : curveFactor);
      } else {
        control2Y = endY + (deltaY > 0 ? -curveFactor : curveFactor);
      }
    }
    
    return {
      controlPoint1: { x: control1X, y: control1Y },
      controlPoint2: { x: control2X, y: control2Y }
    };
  };

  // AGGIORNAMENTO FRECCE: aggiorna periodicamente le frecce connesse
  useEffect(() => {
    const interval = setInterval(() => {
      updateAllConnectedArrows();
    }, 500); // Ogni 500ms

    return () => clearInterval(interval);
  }, [updateAllConnectedArrows]);

  const translateSelectedLayers = useMutation(
    ({ storage, self }, point: Point) => {
      if (canvasState.mode !== CanvasMode.Translating) {
        return;
      }

      // Verifica che canvasState.current sia valido
      if (!canvasState.current || isNaN(canvasState.current.x) || isNaN(canvasState.current.y)) {
        console.error("❌ TRANSLATE ERROR - Invalid canvasState.current:", canvasState.current);
        return;
      }

      // Verifica che il point sia valido
      if (!point || isNaN(point.x) || isNaN(point.y)) {
        console.error("❌ TRANSLATE ERROR - Invalid point:", point);
        return;
      }

      const offset = {
        x: point.x - canvasState.current.x,
        y: point.y - canvasState.current.y,
      };

      const liveLayers = storage.get("layers");
      const selectedIds = self.presence.selection;

      // DEBUG: Log what's happening
      console.log("🔥 TRANSLATE DEBUG - Selected IDs:", selectedIds);
      
      // DEBUG: Show current frame hierarchy for selected frames
      for (const selectedId of selectedIds) {
        const layer = liveLayers.get(selectedId);
        if (layer && layer.get("type") === LayerType.Frame) {
          const frameData = layer.toObject() as any;
          console.log("🔥 TRANSLATE DEBUG - Selected frame", selectedId, "has children:", frameData.children);
          
          // Show details of each child
          if (frameData.children && frameData.children.length > 0) {
            for (const childId of frameData.children) {
              const childLayer = liveLayers.get(childId);
              if (childLayer) {
                console.log("   🔸 Child", childId, "type:", childLayer.get("type"), "at:", childLayer.get("x"), childLayer.get("y"));
              } else {
                console.log("   ❌ Child", childId, "NOT FOUND in layers!");
              }
            }
          } else {
            console.log("   📭 Frame has NO children");
          }
        }
      }

      // FIXED: Simpler approach - when a frame is selected, ALL its children move with it
      // Only block parent frames if a child is selected AND the parent is NOT selected
      const blockedParentFrames = new Set<string>();
      
      // First pass: identify frames that should be blocked
      for (const selectedId of selectedIds) {
        const selectedLayer = liveLayers.get(selectedId);
        if (!selectedLayer) continue;
        
        // Find ALL potential parent frames (not just frame parents)
        const layerIds = Array.from(liveLayers.keys()) as string[];
        for (const potentialParentId of layerIds) {
          if (potentialParentId === selectedId) continue;
          
          // CRITICAL: Never block a frame that is explicitly selected
          if (selectedIds.includes(potentialParentId)) {
            console.log("🔒 NOT BLOCKING parent", potentialParentId, "because it's explicitly selected");
            continue;
          }
          
          const potentialParent = liveLayers.get(potentialParentId);
          if (!potentialParent || potentialParent.get("type") !== LayerType.Frame) continue;
          
          const parentData = potentialParent.toObject() as any;
          const children = parentData.children || [];
          
          // Block this parent if it contains the selected layer but is not itself selected
          if (children.includes(selectedId)) {
            blockedParentFrames.add(potentialParentId);
            console.log("🔒 BLOCKING parent frame:", potentialParentId, "because child", selectedId, "is selected (and parent is not)");
          }
        }
      }
      
      console.log("🔒 BLOCKED parent frames:", Array.from(blockedParentFrames));

      // Build the complete set of layers to move
      const layersToMove = new Set<string>();
      
      // Add all explicitly selected layers
      for (const id of selectedIds) {
        layersToMove.add(id);
        console.log("🔥 TRANSLATE DEBUG - Adding selected layer:", id);
      }
      
      // For each selected frame, add ALL its children recursively
      // This ensures that when a parent frame is moved, all nested content moves with it
      function addFrameChildrenRecursively(frameId: string, depth = 0) {
        const frame = liveLayers.get(frameId);
        if (!frame || frame.get("type") !== LayerType.Frame) {
          console.log("❌ TRANSLATE DEBUG - Frame", frameId, "not found or not a frame");
          return;
        }
        
        const frameData = frame.toObject() as any;
        const children = frameData.children as string[] || [];
        
        console.log("🔥 TRANSLATE DEBUG - Frame", frameId, "at depth", depth, "has children:", children);
        
        if (children.length === 0) {
          console.log("📭 TRANSLATE DEBUG - Frame", frameId, "has NO children to add");
          return;
        }
        
        for (const childId of children) {
          // Skip if this child is explicitly selected (already handled)
          if (selectedIds.includes(childId)) {
            console.log("🔥 TRANSLATE DEBUG - Skipping child", childId, "(explicitly selected)");
            continue;
          }
          
          // IMPORTANT: When a frame is selected, ALL its children should move with it
          // The blocking logic only applies to prevent parent frames from auto-moving
          // when their children are selected, NOT to prevent children from moving
          // when their parent is selected
          
          // Check if child exists
          const childLayer = liveLayers.get(childId);
          if (!childLayer) {
            console.log("❌ TRANSLATE DEBUG - Child", childId, "not found in layers, skipping");
            continue;
          }
          
          // Add this child to movement set (even if it's a blocked parent frame)
          layersToMove.add(childId);
          console.log("✅ TRANSLATE DEBUG - Added child:", childId, "type:", childLayer.get("type"), "(moving with selected parent)");
          
          // If the child is also a frame, recursively add its children
          if (childLayer.get("type") === LayerType.Frame) {
            console.log("🔄 TRANSLATE DEBUG - Child", childId, "is a frame, adding its children recursively");
            addFrameChildrenRecursively(childId, depth + 1);
          }
        }
      }
      
      // Process all selected frames to add their children
      console.log("🔄 TRANSLATE DEBUG - Processing selected frames to add their children...");
      for (const selectedId of selectedIds) {
        const layer = liveLayers.get(selectedId);
        if (layer && layer.get("type") === LayerType.Frame) {
          console.log("🔄 TRANSLATE DEBUG - Processing selected frame:", selectedId);
          addFrameChildrenRecursively(selectedId);
        } else if (layer) {
          console.log("🔄 TRANSLATE DEBUG - Selected layer", selectedId, "is not a frame, type:", layer.get("type"));
        } else {
          console.log("❌ TRANSLATE DEBUG - Selected layer", selectedId, "not found!");
        }
      }

      // REFINED: Only remove blocked parent frames that are NOT children of selected frames
      // If a blocked frame is a child of a selected frame, it should move with its parent
      const childrenOfSelectedFrames = new Set<string>();
      
      // First, collect all children of selected frames
      for (const selectedId of selectedIds) {
        const layer = liveLayers.get(selectedId);
        if (layer && layer.get("type") === LayerType.Frame) {
          const frameData = layer.toObject() as any;
          const children = frameData.children as string[] || [];
          for (const childId of children) {
            childrenOfSelectedFrames.add(childId);
            // Also add recursive children
            function addRecursiveChildren(frameId: string) {
              const frame = liveLayers.get(frameId);
              if (frame && frame.get("type") === LayerType.Frame) {
                const frameData = frame.toObject() as any;
                const children = frameData.children as string[] || [];
                for (const childId of children) {
                  childrenOfSelectedFrames.add(childId);
                  addRecursiveChildren(childId);
                }
              }
            }
            addRecursiveChildren(childId);
          }
        }
      }
      
      // Only remove blocked frames that are NOT children of selected frames
      for (const blockedFrameId of blockedParentFrames) {
        if (!childrenOfSelectedFrames.has(blockedFrameId)) {
          layersToMove.delete(blockedFrameId);
          console.log("🔒 TRANSLATE DEBUG - Removed blocked parent frame:", blockedFrameId, "(not a child of selected frame)");
        } else {
          console.log("🔒 TRANSLATE DEBUG - Keeping blocked frame:", blockedFrameId, "(child of selected frame)");
        }
      }

      console.log("🔥 TRANSLATE DEBUG - Final layers to move:", Array.from(layersToMove));
      console.log("🔥 TRANSLATE DEBUG - Total layers to move:", layersToMove.size);

      // Move all identified layers
      let movedCount = 0;
      for (const id of layersToMove) {
        const layer = liveLayers.get(id);
        if (!layer) {
          console.log("❌ TRANSLATE DEBUG - Layer", id, "not found, skipping");
          continue;
        }

        const layerType = layer.get("type");
        const oldX = layer.get("x");
        const oldY = layer.get("y");
        
        console.log("🔥 TRANSLATE DEBUG - Moving layer", id, "of type", layerType, "from", oldX, oldY, "by offset", offset);

        // Verifica che le coordinate siano valide
        if (isNaN(oldX) || isNaN(oldY)) {
          console.error("❌ TRANSLATE ERROR - Layer", id, "has invalid coordinates:", oldX, oldY);
          continue;
        }

        // Verifica che l'offset sia valido
        if (isNaN(offset.x) || isNaN(offset.y)) {
          console.error("❌ TRANSLATE ERROR - Invalid offset:", offset);
          continue;
        }

        if (layer.get("type") === LayerType.Arrow || layer.get("type") === LayerType.Line) {
          // Handle arrows and lines specially
          translateArrowLine(id, offset);
          console.log("↗️ TRANSLATE DEBUG - Moved arrow/line:", id);
        } else {
          // Move regular layers and frames normally
          let newX = oldX + offset.x;
          let newY = oldY + offset.y;
          
          // Verifica che le nuove coordinate siano valide
          if (isNaN(newX) || isNaN(newY)) {
            console.error("❌ TRANSLATE ERROR - Calculated invalid coordinates:", newX, newY);
            continue;
          }
          
          // Applica sistema di snap solo per il primo layer selezionato (per performance)
          if (movedCount === 0) {
            const layerWidth = layer.get("width") || 0;
            const layerHeight = layer.get("height") || 0;
            const layerType = layer.get("type");
            
            // Calcola snap lines da tutti i layer eccetto quelli in movimento
            const allLayerBounds: any[] = [];
            const allLayerIds = Array.from(liveLayers.keys()) as string[];
            
            for (const layerId of allLayerIds) {
              if (layersToMove.has(layerId)) continue; // Escludi layer in movimento
              
              const otherLayer = liveLayers.get(layerId);
              const bounds = layerToLayerBounds(otherLayer, layerId);
              if (bounds) {
                allLayerBounds.push(bounds);
              }
            }
            
            // Trova il frame genitore se questo layer è all'interno di un frame
            let parentFrameBounds = null;
            if (layerType !== LayerType.Frame) {
              // Cerca se questo layer è figlio di qualche frame
              for (const potentialParentId of allLayerIds) {
                const potentialParent = liveLayers.get(potentialParentId);
                if (potentialParent && potentialParent.get("type") === LayerType.Frame) {
                  const frameData = potentialParent.toObject() as any;
                  const children = frameData.children as string[] || [];
                  
                  if (children.includes(id)) {
                    // Questo layer è figlio di questo frame
                    parentFrameBounds = layerToLayerBounds(potentialParent, potentialParentId);
                    break;
                  }
                }
              }
            }
            
            // Calcola snap lines (includendo il frame genitore se presente)
            const snapLines = calculateSnapLines(
              allLayerBounds, 
              id, 
              newX, 
              newY, 
              layerWidth, 
              layerHeight,
              parentFrameBounds || undefined
            );
            
            const snapResult = calculateSnapPosition(
              newX, 
              newY, 
              layerWidth, 
              layerHeight, 
              snapLines, 
              SNAP_CONFIG.threshold
            );
            
            // Usa le coordinate snappate
            newX = snapResult.x;
            newY = snapResult.y;
            
            // Aggiorna le snap lines attive e info layer corrente per la visualizzazione
            setActiveSnapLines(snapResult.activeSnapLines);
            setCurrentMovingLayer({
              x: newX,
              y: newY,
              width: layerWidth,
              height: layerHeight
            });
          }
          
          layer.update({
            x: newX,
            y: newY
          });
          console.log("📦 TRANSLATE DEBUG - Moved layer:", id, "to", newX, newY);
        }
        movedCount++;
      }
      
      console.log("✅ TRANSLATE DEBUG - Successfully moved", movedCount, "layers total");

      // Aggiorna le frecce Mind Map connesse alle note spostate
      const movedNotes = new Set<string>();
      for (const id of layersToMove) {
        const layer = liveLayers.get(id);
        if (layer && layer.get("type") === LayerType.Note) {
          movedNotes.add(id);
        }
      }
      if (movedNotes.size > 0) {
        updateMindMapArrows(liveLayers, movedNotes);
      }

      setCanvasState({ mode: CanvasMode.Translating, current: point });
    },
    [canvasState, translateArrowLine],
  );

  const unselectLayers = useMutation(({ self, setMyPresence }) => {
    if (self.presence.selection.length > 0) {
      setMyPresence({ selection: [] }, { addToHistory: true });
    }
  }, []);

  const updateSelectionNet = useMutation(
    ({ storage, setMyPresence }, current: Point, origin: Point) => {
      const layers = storage.get("layers").toImmutable();
      setCanvasState({
        mode: CanvasMode.SelectionNet,
        origin,
        current,
      });

      const ids = findIntersectingLayersWithRectangle(
        layerIds,
        layers,
        origin,
        current,
      );

      setMyPresence({ selection: ids });
    },
    [layerIds],
  );

  const startMultiSelection = useCallback((current: Point, origin: Point) => {
    if (Math.abs(current.x - origin.x) + Math.abs(current.y - origin.y) > 5) {
      setCanvasState({
        mode: CanvasMode.SelectionNet,
        origin,
        current,
      });
    }
  }, []);

  const continueDrawing = useMutation(
    ({ self, setMyPresence }, point: Point, e: React.PointerEvent) => {
      const { pencilDraft } = self.presence;

      if (
        canvasState.mode !== CanvasMode.Pencil ||
        e.buttons !== 1 ||
        pencilDraft == null
      ) {
        return;
      }

      setMyPresence({
        cursor: point,
        pencilDraft:
          pencilDraft.length === 1 &&
          pencilDraft[0][0] === point.x &&
          pencilDraft[0][1] === point.y
            ? pencilDraft
            : [...pencilDraft, [point.x, point.y, e.pressure]],
      });
    },
    [canvasState.mode],
  );

  // Drawing mode handlers for media overlay
  const handleDrawingModeStart = useCallback(
    (point: Point) => {
      if (canvasState.mode === CanvasMode.Inserting) {
        // Transition from Inserting to Drawing mode
        setCanvasState({
          mode: CanvasMode.Drawing,
          layerType: canvasState.layerType,
          origin: point,
          frameFormat: canvasState.frameFormat
        });
      }
    },
    [canvasState, setCanvasState]
  );

  const handleDrawingModeMove = useCallback(
    (point: Point) => {
      if (canvasState.mode === CanvasMode.Drawing) {
        setCanvasState({
          ...canvasState,
          current: point
        });
      }
    },
    [canvasState, setCanvasState]
  );

  const handleDrawingModeEnd = useCallback(
    (point: Point) => {
      if (canvasState.mode === CanvasMode.Drawing && canvasState.current) {
        // Same logic as onPointerUp for Drawing mode
        if (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line) {
          console.log("🎯 Applying snap to new arrow/line during creation");
          const snapped = snapArrowToConnectionPoints(
            { x: canvasState.origin.x, y: canvasState.origin.y },
            point,
            allLayers
          );
          insertLayer(canvasState.layerType, canvasState.origin, snapped.endPoint);
        } else {
          insertLayer(canvasState.layerType, canvasState.origin, point);
        }
        
        // Reset to None mode
        setCanvasState({ mode: CanvasMode.None });
      }
    },
    [canvasState, allLayers, insertLayer, setCanvasState, snapArrowToConnectionPoints]
  );

  const insertPath = useMutation(
    ({ storage, self, setMyPresence }) => {
      const liveLayers = storage.get("layers");
      const { pencilDraft } = self.presence;

      if (
        pencilDraft == null ||
        pencilDraft.length < 2 ||
        (MAX_LAYERS >= 0 && liveLayers.size >= MAX_LAYERS)
      ) {
        setMyPresence({ pencilDraft: null });
        return;
      }

      const id = nanoid();
      liveLayers.set(
        id,
        new LiveObject(penPointsToPathLayer(pencilDraft, lastUsedColor, pencilStrokeWidth)),
      );

      const liveLayerIds = storage.get("layerIds");
      liveLayerIds.push(id);
      setMyPresence({ pencilDraft: null });
      setCanvasState({ mode: CanvasMode.Pencil });
    },
    [lastUsedColor, pencilStrokeWidth],
  );

  // === FRAME CONTAINMENT MUTATIONS ===

  const updateFrameChildren = useMutation(
    ({ storage }) => {
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      
      console.log("🔄 UPDATING frame children relationships");
      
      // First, clear all children arrays to rebuild them
      for (const layerId of liveLayerIds) {
        const layer = liveLayers.get(layerId);
        if (layer && layer.get("type") === LayerType.Frame) {
          layer.update({ children: [] });
        }
      }
      
      // Get all frames and sort them by area (LARGEST first for proper containment hierarchy)
      const frameIds = Array.from(liveLayerIds).filter(id => {
        const layer = liveLayers.get(id);
        return layer && layer.get("type") === LayerType.Frame;
      });
      
      // Sort frames by area (LARGEST first) to build proper parent-child hierarchy
      // Large frames (parents) should claim objects first, then smaller frames (children) 
      // should only claim objects that are very specifically close to them and not already claimed
      frameIds.sort((a, b) => {
        const layerA = liveLayers.get(a);
        const layerB = liveLayers.get(b);
        if (!layerA || !layerB) return 0;
        
        const areaA = layerA.get("width") * layerA.get("height");
        const areaB = layerB.get("width") * layerB.get("height");
        return areaB - areaA; // LARGEST first
      });
      
      // Helper function to check if assigning childId to parentId would create a circular dependency
      function wouldCreateCircularDependency(parentId: string, childId: string, tempAssignments: Map<string, string[]>): boolean {
        if (parentId === childId) return true;
        
        // Check if childId already has parentId as a descendant in temp assignments
        const childChildren = tempAssignments.get(childId) || [];
        for (const grandChildId of childChildren) {
          if (grandChildId === parentId) return true;
          if (wouldCreateCircularDependency(parentId, grandChildId, tempAssignments)) return true;
        }
        
        return false;
      }
      
      // Build containment relationships from scratch with circular dependency prevention
      // Use a temporary map to track assignments before committing them
      const tempChildrenAssignments = new Map<string, string[]>();
      
      // Initialize temp assignments
      for (const frameId of frameIds) {
        tempChildrenAssignments.set(frameId, []);
      }
      
      // NEW STRATEGY: For each non-frame object, assign it to the SMALLEST frame that contains it
      // This ensures objects are assigned to their most specific container
      
      // First, collect all non-frame objects
      const nonFrameObjects = Array.from(liveLayerIds).filter(id => {
        const layer = liveLayers.get(id);
        return layer && layer.get("type") !== LayerType.Frame;
      });
      
      console.log("🔄 ASSIGNING", nonFrameObjects.length, "non-frame objects to their most specific frames");
      
      // For each non-frame object, find the smallest frame that contains it
      for (const objectId of nonFrameObjects) {
        const objectLayer = liveLayers.get(objectId);
        if (!objectLayer) continue;
        
        const objectData = objectLayer.toObject() as any;
        
        // Find all frames that contain this object
        const containingFrames: Array<{frameId: string, area: number}> = [];
        
        for (const frameId of frameIds) {
          const frame = liveLayers.get(frameId);
          if (!frame) continue;
          
          const frameData = frame.toObject() as any;
          
          if (isLayerOverlappingFrame(objectData, frameData)) {
            const frameArea = frameData.width * frameData.height;
            containingFrames.push({ frameId, area: frameArea });
          }
        }
        
        // Sort by area and assign to the smallest frame
        if (containingFrames.length > 0) {
          containingFrames.sort((a, b) => a.area - b.area); // Smallest first
          const smallestFrameId = containingFrames[0].frameId;
          
          const currentChildren = tempChildrenAssignments.get(smallestFrameId) || [];
          currentChildren.push(objectId);
          tempChildrenAssignments.set(smallestFrameId, currentChildren);
          
          console.log("🔄 ASSIGNED", objectData.type, objectId, "to SMALLEST containing frame", smallestFrameId, "(area:", containingFrames[0].area, ")");
          console.log("   📏 Other containing frames:", containingFrames.slice(1).map(f => `${f.frameId}(${f.area})`).join(", "));
        } else {
          console.log("🔄 Object", objectId, "is not contained in any frame");
        }
      }
      
      // Then, handle frame-to-frame relationships
      console.log("🔄 BUILDING frame hierarchy...");
      
      // For each frame, check if it should be a child of another frame
      for (const frameId of frameIds) {
        const frame = liveLayers.get(frameId);
        if (!frame) continue;
        
        const frameData = frame.toObject() as any;
        const frameArea = frameData.width * frameData.height;
        
        // Find all frames that contain this frame
        const containingFrames: Array<{frameId: string, area: number}> = [];
        
        for (const otherFrameId of frameIds) {
          if (otherFrameId === frameId) continue; // Skip self
          
          const otherFrame = liveLayers.get(otherFrameId);
          if (!otherFrame) continue;
          
          const otherFrameData = otherFrame.toObject() as any;
          
          if (isLayerOverlappingFrame(frameData, otherFrameData)) {
            const otherFrameArea = otherFrameData.width * otherFrameData.height;
            // Only consider frames that are larger than this one
            if (otherFrameArea > frameArea) {
              containingFrames.push({ frameId: otherFrameId, area: otherFrameArea });
            }
          }
        }
        
        // Assign to the smallest containing frame (if any)
        if (containingFrames.length > 0) {
          containingFrames.sort((a, b) => a.area - b.area); // Smallest first
          const parentFrameId = containingFrames[0].frameId;
          
          // Check for circular dependency
          if (!wouldCreateCircularDependency(parentFrameId, frameId, tempChildrenAssignments)) {
            const currentChildren = tempChildrenAssignments.get(parentFrameId) || [];
            currentChildren.push(frameId);
            tempChildrenAssignments.set(parentFrameId, currentChildren);
            
            console.log("🔄 ASSIGNED FRAME", frameId, "(area:", frameArea, ") as child of frame", parentFrameId, "(area:", containingFrames[0].area, ")");
          } else {
            console.log("🚫 PREVENTED circular dependency: frame", parentFrameId, "cannot contain frame", frameId);
          }
        }
      }
      
      // Commit all assignments to actual frames
      for (const [frameId, children] of tempChildrenAssignments) {
        const frame = liveLayers.get(frameId);
        if (frame) {
          frame.update({ children });
          console.log("🔄 Frame", frameId, "now has children:", children);
        }
      }
    },
    [isLayerOverlappingFrame]
  );

  // === SHARED FRAME RESIZE LOGIC ===

  // Funzione condivisa per calcolare i bounds ottimali del frame
  const calculateFrameOptimalBounds = useCallback((
    childrenLayers: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      type: LayerType;
    }>,
    options: {
      smartPadding?: boolean;
      preserveAspectRatio?: boolean;
    } = {}
  ) => {
    if (childrenLayers.length === 0) {
      return { x: 0, y: 0, width: 100, height: 80 };
    }

    // Calculate the actual bounding box of all children
    const contentBounds = childrenLayers.reduce((acc, layer) => ({
      minX: Math.min(acc.minX, layer.x),
      minY: Math.min(acc.minY, layer.y),
      maxX: Math.max(acc.maxX, layer.x + layer.width),
      maxY: Math.max(acc.maxY, layer.y + layer.height)
    }), { 
      minX: Infinity, 
      minY: Infinity, 
      maxX: -Infinity, 
      maxY: -Infinity 
    });

    // Calculate padding based on content type and density
    const contentWidth = contentBounds.maxX - contentBounds.minX;
    const contentHeight = contentBounds.maxY - contentBounds.minY;
    const contentArea = contentWidth * contentHeight;
    const layerCount = childrenLayers.length;
    const density = layerCount / Math.max(contentArea / 10000, 1);

    // Base padding
    let padding = 20;
    
    if (options.smartPadding !== false) {
      // Adjust padding based on content density
      const densityFactor = Math.min(Math.max(density, 0.5), 2);
      padding = Math.round(20 + (50 - 20) * (densityFactor - 0.5));

      // Adjust padding based on layer types
      const hasTextLayers = childrenLayers.some(l => l.type === LayerType.Text || l.type === LayerType.Note);
      const hasShapes = childrenLayers.some(l => l.type === LayerType.Rectangle || l.type === LayerType.Ellipse);
      
      if (hasTextLayers && !hasShapes) {
        padding = Math.round(padding * 0.8); // Less padding for text-only content
      } else if (hasShapes && !hasTextLayers) {
        padding = Math.round(padding * 1.2); // More padding for shape-heavy content
      }
    }

    // Calculate header space to avoid overlap with title
    // Estimate header height based on frame height (same logic as Frame component)
    const estimatedFrameHeight = contentHeight + (padding * 2) + 50; // Rough estimate for header calculation
    const headerHeight = Math.max(32, Math.min(40, estimatedFrameHeight * 0.12));
    
    // Extra top padding for header space
    const topPadding = padding + headerHeight + 8; // +8px extra spacing below header

    // Calculate final frame bounds
    const finalX = contentBounds.minX - padding;
    const finalY = contentBounds.minY - topPadding; // Use extended top padding
    let finalWidth = Math.max(contentWidth + (padding * 2), 100);
    let finalHeight = Math.max(contentHeight + padding + topPadding, 80); // Bottom padding + top padding with header

    if (options.preserveAspectRatio) {
      const currentRatio = finalWidth / finalHeight;
      const targetRatio = 16 / 10;

      if (currentRatio > targetRatio) {
        finalHeight = finalWidth / targetRatio;
    } else {
        finalWidth = finalHeight * targetRatio;
      }
    }

    return {
      x: finalX,
      y: finalY,
      width: finalWidth,
      height: finalHeight
    };
  }, []);
  
  const autoResizeFrame = useMutation(
    ({ storage }, frameId: string) => {
      const liveLayers = storage.get("layers");
      const frame = liveLayers.get(frameId);
      
      if (!frame || frame.get("type") !== LayerType.Frame) {
        return;
      }

      // Check if autoResize is enabled
      const frameData = frame.toObject() as any;
      if (!frameData.autoResize) return;

      const children = frameData.children as string[];
      if (children.length === 0) return;

      // Get children layers
      const childrenLayers = children
        .map(id => {
          const layer = liveLayers.get(id);
          if (!layer) return null;
          return {
            x: layer.get("x"),
            y: layer.get("y"),
            width: layer.get("width"),
            height: layer.get("height"),
            type: layer.get("type") as LayerType
          };
        })
        .filter(Boolean) as Array<{
          x: number;
          y: number;
          width: number;
          height: number;
          type: LayerType;
        }>;

      if (childrenLayers.length === 0) return;

      // Use the same shared calculation logic with same parameters as manual resize
      const optimalBounds = calculateFrameOptimalBounds(childrenLayers, {
        smartPadding: true,
        preserveAspectRatio: false
      });
      
      // Apply the new bounds directly (same as manual resize)
      frame.update({
        x: Math.round(optimalBounds.x),
        y: Math.round(optimalBounds.y),
        width: Math.round(optimalBounds.width),
        height: Math.round(optimalBounds.height)
      });
    },
    [calculateFrameOptimalBounds]
  );

  const toggleFrameAutoResize = useMutation(
    ({ storage }, frameId: string) => {
      const liveLayers = storage.get("layers");
      const frame = liveLayers.get(frameId);
      
      if (!frame || frame.get("type") !== LayerType.Frame) {
        return false;
      }

      const frameData = frame.toObject() as any;
      const newAutoResize = !frameData.autoResize;
      
      frame.update({ autoResize: newAutoResize });
      
      // If enabling auto-resize, immediately apply it
      if (newAutoResize) {
        setTimeout(() => {
          autoResizeFrame(frameId);
        }, 100);
      }
      
      return newAutoResize;
    },
    [autoResizeFrame]
  );

  const manualResizeFrameToFit = useMutation(
    ({ storage }, frameId: string) => {
      const liveLayers = storage.get("layers");
      const frame = liveLayers.get(frameId);
      
      if (!frame || frame.get("type") !== LayerType.Frame) {
      return;
    }
    
      const frameData = frame.toObject() as any;
      const children = frameData.children as string[];
      
      if (children.length === 0) return;

      // Get children layers
      const childrenLayers = children
        .map(id => {
          const layer = liveLayers.get(id);
          if (!layer) return null;
          return {
            x: layer.get("x"),
            y: layer.get("y"),
            width: layer.get("width"),
            height: layer.get("height"),
            type: layer.get("type") as LayerType
          };
        })
        .filter(Boolean) as Array<{
          x: number;
          y: number;
          width: number;
          height: number;
          type: LayerType;
        }>;

      if (childrenLayers.length === 0) return;

      // Use the same shared calculation logic as auto-resize
      const optimalBounds = calculateFrameOptimalBounds(childrenLayers, {
        smartPadding: true,
        preserveAspectRatio: false
      });
      
      // Apply the new bounds in a single operation
      frame.update({
        x: Math.round(optimalBounds.x),
        y: Math.round(optimalBounds.y),
        width: Math.round(optimalBounds.width),
        height: Math.round(optimalBounds.height)
      });
    },
    [calculateFrameOptimalBounds]
  );

  const moveFrameWithChildren = useMutation(
    ({ storage }, frameId: string, offset: Point) => {
      const liveLayers = storage.get("layers");
      const frame = liveLayers.get(frameId);
      
      if (!frame || frame.get("type") !== LayerType.Frame) return;

      // Move the frame
      frame.update({
        x: frame.get("x") + offset.x,
        y: frame.get("y") + offset.y
      });

      // Move all children (including nested frames)
      const frameData = frame.toObject() as any;
      const children = frameData.children as string[];
      for (const childId of children) {
        const child = liveLayers.get(childId);
        if (child) {
          if (child.get("type") === LayerType.Frame) {
            // Recursively move nested frames with their children
            moveFrameWithChildren(childId, offset);
          } else if (child.get("type") === LayerType.Arrow || child.get("type") === LayerType.Line) {
            // Handle arrows and lines specially
            translateArrowLine(childId, offset);
          } else {
            // Move regular layers
            child.update({
              x: child.get("x") + offset.x,
              y: child.get("y") + offset.y
            });
          }
        }
      }
    },
    [translateArrowLine]
  );

  const startDrawing = useMutation(
    ({ setMyPresence }, point: Point, pressure: number) => {
      setMyPresence({
        pencilDraft: [[point.x, point.y, pressure]],
        penColor: lastUsedColor,
      });
    },
    [lastUsedColor],
  );

  const resizeSelectedLayer = useMutation(
    ({ storage, self }, point: Point, e: React.PointerEvent) => {
      if (canvasState.mode !== CanvasMode.Resizing || !resizeInitialMousePos) {
      return;
    }
    
      // Calcola il delta di movimento del mouse
      const deltaX = point.x - resizeInitialMousePos.x;
      const deltaY = point.y - resizeInitialMousePos.y;
      
      // Calcola la nuova posizione basata sul corner e sul delta
      let targetPoint = { ...point };
      
      // Calcola la posizione target dell'handle basata sul corner iniziale
      const initialBounds = canvasState.initialBounds;
      let targetHandleX = initialBounds.x;
      let targetHandleY = initialBounds.y;
      
      if ((canvasState.corner & Side.Right) === Side.Right) {
        targetHandleX = initialBounds.x + initialBounds.width + deltaX;
      } else if ((canvasState.corner & Side.Left) === Side.Left) {
        targetHandleX = initialBounds.x + deltaX;
      } else {
        targetHandleX = initialBounds.x + initialBounds.width / 2 + deltaX;
      }
      
      if ((canvasState.corner & Side.Bottom) === Side.Bottom) {
        targetHandleY = initialBounds.y + initialBounds.height + deltaY;
      } else if ((canvasState.corner & Side.Top) === Side.Top) {
        targetHandleY = initialBounds.y + deltaY;
      } else {
        targetHandleY = initialBounds.y + initialBounds.height / 2 + deltaY;
      }
      
      targetPoint = { x: targetHandleX, y: targetHandleY };

      const liveLayers = storage.get("layers");
      const layer = liveLayers.get(self.presence.selection[0]);

      if (layer) {
        let bounds;
        
        // Check if Shift is pressed and get aspect ratio for the layer
        if (isShiftPressed) {
          const layerData = layer.toObject() as any;
          const aspectRatio = getLayerAspectRatio(layerData) || (initialBounds.width / initialBounds.height);
          
          // Use constrained resize to maintain aspect ratio
          bounds = constrainResizeToAspectRatio(
            canvasState.initialBounds,
            canvasState.corner,
            targetPoint,
            aspectRatio
          );
        } else {
          // Normal resize without constraints
          bounds = resizeBounds(
            canvasState.initialBounds,
            canvasState.corner,
            targetPoint
          );
        }

        layer.update(bounds);
      }
    },
    [canvasState, resizeInitialMousePos, isShiftPressed],
  );

  // Nuovo: Resize per selezioni multiple (gruppo)
  const resizeSelectedLayers = useMutation(
    ({ storage, self }, point: Point, e: React.PointerEvent) => {
      if (canvasState.mode !== CanvasMode.GroupResizing || !resizeInitialMousePos || !initialLayersSnapshot) {
      return;
    }
    
      if (!canvasState.initialBounds || !canvasState.corner) {
        return;
      }

      // Calcola il delta di movimento del mouse
      const deltaX = point.x - resizeInitialMousePos.x;
      const deltaY = point.y - resizeInitialMousePos.y;
      
      // Calcola la nuova posizione basata sul corner e sul delta
      const initialBounds = canvasState.initialBounds;
      let targetHandleX = initialBounds.x;
      let targetHandleY = initialBounds.y;
      
      if ((canvasState.corner & Side.Right) === Side.Right) {
        targetHandleX = initialBounds.x + initialBounds.width + deltaX;
      } else if ((canvasState.corner & Side.Left) === Side.Left) {
        targetHandleX = initialBounds.x + deltaX;
      } else {
        targetHandleX = initialBounds.x + initialBounds.width / 2 + deltaX;
      }
      
      if ((canvasState.corner & Side.Bottom) === Side.Bottom) {
        targetHandleY = initialBounds.y + initialBounds.height + deltaY;
      } else if ((canvasState.corner & Side.Top) === Side.Top) {
        targetHandleY = initialBounds.y + deltaY;
      } else {
        targetHandleY = initialBounds.y + initialBounds.height / 2 + deltaY;
      }
      
      const targetPoint = { x: targetHandleX, y: targetHandleY };

      const liveLayers = storage.get("layers");

      // Verifica se il tasto Shift è premuto per mantenere le proporzioni
      const maintainAspectRatio = e.shiftKey || isShiftPressed;

      // USA LO SNAPSHOT INIZIALE invece delle coordinate correnti!
      const resizedLayers = resizeGroupBounds(
        canvasState.initialBounds,
        initialLayersSnapshot,
        canvasState.corner,
        targetPoint,
        maintainAspectRatio
      );

      // Applica le nuove dimensioni e posizioni ai layer
      const movedNoteIds = new Set<string>();
      resizedLayers.forEach(({ id, x, y, width, height }) => {
        const layer = liveLayers.get(id);
        if (layer) {
          layer.update({
            x: Math.round(x),
            y: Math.round(y), 
            width: Math.max(5, Math.round(width)), // Dimensione minima
            height: Math.max(5, Math.round(height))
          });
          
          // Traccia le note che sono state ridimensionate per aggiornare le frecce
          if (layer.get("type") === LayerType.Note) {
            movedNoteIds.add(id);
          }
        }
      });
      
      // Aggiorna le frecce Mind Map collegate alle note ridimensionate
      if (movedNoteIds.size > 0) {
        updateMindMapArrows(liveLayers, movedNoteIds);
      }
    },
    [canvasState, resizeInitialMousePos, initialLayersSnapshot, isShiftPressed],
  );

  const onResizeHandlePointerDown = useCallback(
    (corner: Side, initialBounds: XYWH, e: React.PointerEvent) => {
      history.pause();
      
      // Salva semplicemente la posizione iniziale del mouse
      const mousePoint = pointerEventToCanvasPoint(e, camera);
      setResizeInitialMousePos(mousePoint);
      
      // Determina se stiamo ridimensionando un singolo layer o più layer
      const selection = mySelection || [];
      
      if (selection.length === 1) {
        // Resize singolo layer
        setCanvasState({
          mode: CanvasMode.Resizing,
          initialBounds,
          corner,
        });
      } else if (selection.length > 1) {
        // Per il resize di gruppo, cattura lo snapshot iniziale dei layer
        const snapshot = selection.map(id => {
          const layer = allLayers?.get(id);
          if (layer) {
            return {
              id,
              x: layer.x,
              y: layer.y,
              width: layer.width,
              height: layer.height
            };
          }
          return null;
        }).filter(Boolean) as Array<{
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }>;
        
        setInitialLayersSnapshot(snapshot);
        
        // Resize gruppo di layer
        setCanvasState({
          mode: CanvasMode.GroupResizing,
          initialBounds,
          corner,
        });
      }
    },
    [history, mySelection, camera, allLayers],
  );

  // Gestione inizio resize di punti frecce/linee
  const onArrowLinePointPointerDown = useCallback(
    (isStartPoint: boolean, layerId: string) => {
      history.pause();
      setIsResizingArrowLine({ layerId, isStartPoint });
    },
    [history]
  );

  // Mutation per aggiornare i punti di frecce e linee con snap automatico
  const updateArrowLinePoint = useMutation(
    ({ storage }, layerId: string, isStartPoint: boolean, newPoint: Point) => {
      const liveLayers = storage.get("layers");
      const layer = liveLayers.get(layerId);
      
      if (layer && (layer.get("type") === LayerType.Arrow || layer.get("type") === LayerType.Line)) {
        const layerData = layer.toObject() as any;
        
        // Determine the origin point (the point that stays fixed)
        const originPoint = isStartPoint 
          ? { x: layerData.endX, y: layerData.endY }
          : { x: layerData.startX, y: layerData.startY };
        
        // Apply angle constraint if Shift is pressed
        let constrainedPoint = newPoint;
        if (isShiftPressed) {
          constrainedPoint = constrainToAngle(originPoint, newPoint);
        }
        
        // Applica snap automatico al punto che stiamo trascinando
        let finalPoint = constrainedPoint;
        let snapInfo = null;
        
        // Trova note vicine per il punto che stiamo trascinando
        const nearestNote = checkSnapPreview(constrainedPoint.x, constrainedPoint.y);
        if (nearestNote) {
          const snapPoint = getSnapPoint(nearestNote.note, nearestNote.side);
          finalPoint = snapPoint;
          snapInfo = nearestNote;
          console.log("🎯 Snapped arrow point to:", nearestNote.id, nearestNote.side);
        }
        
        // Calcola le nuove coordinate
        const newStartX = isStartPoint ? finalPoint.x : layerData.startX;
        const newStartY = isStartPoint ? finalPoint.y : layerData.startY;
        const newEndX = isStartPoint ? layerData.endX : finalPoint.x;
        const newEndY = isStartPoint ? layerData.endY : finalPoint.y;
        
        // Calcola il bounding box base
        const minX = Math.min(newStartX, newEndX);
        const minY = Math.min(newStartY, newEndY);
        const maxX = Math.max(newStartX, newEndX);
        const maxY = Math.max(newStartY, newEndY);
        
        const baseWidth = Math.max(maxX - minX, 50);
        const baseHeight = Math.max(maxY - minY, 20);
        
        // Calcola lo spazio extra necessario per frecce e linee
        const strokeWidth = layerData.strokeWidth || 2;
        const extraForStroke = strokeWidth * 2; // Spazio per lo spessore della linea
        
        let extraForArrowHead = 0;
        if (layerData.type === LayerType.Arrow) {
          // Calcola la lunghezza effettiva della freccia
          const arrowLength = Math.sqrt(
            Math.pow(newEndX - newStartX, 2) + Math.pow(newEndY - newStartY, 2)
          );
          // Usa la stessa formula del componente Arrow
          const arrowHeadLength = Math.min(Math.max(arrowLength * 0.2, 8), 25); // Min 8px, Max 25px, 20% della lunghezza
          extraForArrowHead = Math.max(arrowHeadLength, 15); // Minimo 15px di spazio
        }
        
        // Calcola lo spazio totale extra necessario
        const extraSpace = extraForStroke + extraForArrowHead + 10; // +10px di margine di sicurezza
        
        // Estendi il bounding box in tutte le direzioni
        let finalX = minX - extraSpace;
        let finalY = minY - extraSpace;
        let finalWidth = baseWidth + (extraSpace * 2);
        let finalHeight = baseHeight + (extraSpace * 2);
        
        // Aggiorna i metadati di snap
        let updatedMetadata = {
          sourceNoteId: layerData.sourceNoteId,
          targetNoteId: layerData.targetNoteId,
          sourceSide: layerData.sourceSide,
          targetSide: layerData.targetSide,
          isSnappedToSource: layerData.isSnappedToSource || false,
          isSnappedToTarget: layerData.isSnappedToTarget || false,
          isMindMapConnection: layerData.isMindMapConnection || false,
          curved: layerData.curved || false,
          controlPoint1X: layerData.controlPoint1X,
          controlPoint1Y: layerData.controlPoint1Y,
          controlPoint2X: layerData.controlPoint2X,
          controlPoint2Y: layerData.controlPoint2Y,
        };
        
        if (snapInfo) {
          if (isStartPoint) {
            // Aggiorna metadati per il punto di partenza
            updatedMetadata.sourceNoteId = snapInfo.id;
            updatedMetadata.sourceSide = snapInfo.side;
            updatedMetadata.isSnappedToSource = true;
          } else {
            // Aggiorna metadati per il punto di arrivo
            updatedMetadata.targetNoteId = snapInfo.id;
            updatedMetadata.targetSide = snapInfo.side;
            updatedMetadata.isSnappedToTarget = true;
          }
        } else {
          // Rimuovi snap per il punto che stiamo trascinando se non c'è più una nota vicina
          if (isStartPoint) {
            updatedMetadata.sourceNoteId = undefined;
            updatedMetadata.sourceSide = undefined;
            updatedMetadata.isSnappedToSource = false;
          } else {
            updatedMetadata.targetNoteId = undefined;
            updatedMetadata.targetSide = undefined;
            updatedMetadata.isSnappedToTarget = false;
          }
        }
        
        // Calcola curve automatiche se la freccia è snappata e è di tipo Arrow
        if ((updatedMetadata.isSnappedToSource || updatedMetadata.isSnappedToTarget) && 
            layerData.type === LayerType.Arrow) {
          const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
            newStartX,
            newStartY,
            newEndX,
            newEndY,
            updatedMetadata.sourceSide,
            updatedMetadata.targetSide
          );
          
          updatedMetadata.curved = true;
          updatedMetadata.controlPoint1X = controlPoint1.x;
          updatedMetadata.controlPoint1Y = controlPoint1.y;
          updatedMetadata.controlPoint2X = controlPoint2.x;
          updatedMetadata.controlPoint2Y = controlPoint2.y;
          
          // Ricalcola bounding box includendo i punti di controllo
          const allX = [newStartX, newEndX, controlPoint1.x, controlPoint2.x];
          const allY = [newStartY, newEndY, controlPoint1.y, controlPoint2.y];
          const newMinX = Math.min(...allX);
          const newMaxX = Math.max(...allX);
          const newMinY = Math.min(...allY);
          const newMaxY = Math.max(...allY);
          
          finalX = newMinX - extraSpace;
          finalY = newMinY - extraSpace;
          finalWidth = (newMaxX - newMinX) + (extraSpace * 2);
          finalHeight = (newMaxY - newMinY) + (extraSpace * 2);
        } else if (!updatedMetadata.isSnappedToSource && !updatedMetadata.isSnappedToTarget) {
          // Se non c'è più snap, rimuovi le curve
          updatedMetadata.curved = false;
          updatedMetadata.controlPoint1X = undefined;
          updatedMetadata.controlPoint1Y = undefined;
          updatedMetadata.controlPoint2X = undefined;
          updatedMetadata.controlPoint2Y = undefined;
        }
        
        // Rimuovi il layer esistente e creane uno nuovo con metadati aggiornati
        liveLayers.delete(layerId);
        const newLayer = new LiveObject({
          type: layerData.type,
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          fill: layerData.fill,
          startX: newStartX,
          startY: newStartY,
          endX: newEndX,
          endY: newEndY,
          strokeWidth: strokeWidth,
          ...updatedMetadata,
        });
        liveLayers.set(layerId, newLayer);
        
        console.log("✅ Updated arrow point with snap:", layerId, {
          isStartPoint,
          snapped: !!snapInfo,
          snapTo: snapInfo ? `${snapInfo.id}:${snapInfo.side}` : 'none'
        });
      }
    },
    [isShiftPressed, checkSnapPreview, getSnapPoint]
  );

  const svgRef = useRef<SVGSVGElement>(null);

  // Funzione per lo zoom fluido
  const smoothZoom = useCallback((targetCamera: Camera) => {
    setCamera(targetCamera);
  }, []);

  // Gestione del movimento del puntatore
  const onPointerMove = useMutation(
    ({ setMyPresence }, e: React.PointerEvent) => {
      e.preventDefault();

      if (isPanning) {
        return;
      }

      const current = pointerEventToCanvasPoint(e, camera);
      
      // Aggiorna la posizione corrente del mouse per gli snap indicators
      setCurrentMousePosition(current);

      if (canvasState.mode === CanvasMode.Pressing) {
        startMultiSelection(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.SelectionNet) {
        updateSelectionNet(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.Translating) {
        translateSelectedLayers(current);
      } else if (canvasState.mode === CanvasMode.Resizing) {
        resizeSelectedLayer(current, e);
      } else if (canvasState.mode === CanvasMode.GroupResizing) {
        resizeSelectedLayers(current, e);
      } else if (canvasState.mode === CanvasMode.Pencil) {
        continueDrawing(current, e);
      } else if (canvasState.mode === CanvasMode.Drawing) {
        // Apply constraints during drawing if Shift is pressed
        let constrainedCurrent = current;
        
        if (isShiftPressed) {
          if (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line) {
            // Constrain to 45-degree angles for lines and arrows
            constrainedCurrent = constrainToAngle(canvasState.origin, current);
          } else if (canvasState.layerType === LayerType.Rectangle || canvasState.layerType === LayerType.Ellipse) {
            // Constrain to square for rectangles and circles
            constrainedCurrent = constrainToSquare(canvasState.origin, current);
          }
        }
        
        console.log("🎨 Drawing mode - updating current:", constrainedCurrent);
        // Aggiorna la posizione corrente per frecce e linee
        setCanvasState({
          ...canvasState,
          current: constrainedCurrent
        });
      }

      // Gestione resize punti frecce/linee
      if (isResizingArrowLine) {
        updateArrowLinePoint(isResizingArrowLine.layerId, isResizingArrowLine.isStartPoint, current);
      }

      setMyPresence({ cursor: current });
    },
    [
      startMultiSelection,
      updateSelectionNet,
      continueDrawing,
      canvasState,
      resizeSelectedLayer,
      resizeSelectedLayers,
      translateSelectedLayers,
      isPanning,
      camera,
      setCanvasState,
      isResizingArrowLine,
      updateArrowLinePoint,
      isShiftPressed,
    ],
  );

  // Gestione degli eventi di panning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning && panStart) {
        try {
        e.preventDefault();
        e.stopPropagation();
        } catch (error) {
          // Ignora l'errore se preventDefault non può essere chiamato
        }
        
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        
        setPanStart({ x: e.clientX, y: e.clientY });
        
        const newCamera = {
          ...camera,
          x: camera.x + deltaX,
          y: camera.y + deltaY
        };
        
        setCamera(newCamera);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (isPanning) {
        try {
        e.preventDefault();
        } catch (error) {
          // Ignora l'errore se preventDefault non può essere chiamato
        }
        
        setIsPanning(false);
        setPanStart(null);
        
        document.body.style.cursor = isSpacePressed ? 'grab' : 'auto';
        setCanvasState({ mode: CanvasMode.None });
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    window.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [isPanning, panStart, camera, isSpacePressed, setCanvasState]);

  // Gestione wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    try {
    e.preventDefault();
    } catch (error) {
      // Ignora l'errore se preventDefault non può essere chiamato
    }
    
    // ZOOM come comportamento di default (senza bisogno di Ctrl/Cmd)
    // Ma se Shift è premuto, usa il PAN verticale invece dello zoom
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      if (e.shiftKey) {
        // Shift + scroll verticale = PAN verticale
        const newCamera = {
          ...camera,
          x: camera.x,
          y: camera.y - e.deltaY
        };
        setCamera(newCamera);
      } else {
        // Scroll verticale normale = ZOOM
        const scale = camera.scale;
      
      const viewportX = e.clientX;
      const viewportY = e.clientY;
        const worldX = (viewportX - camera.x) / scale;
        const worldY = (viewportY - camera.y) / scale;
      
      const delta = -e.deltaY * ZOOM_SPEED;
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale + delta));
      
      const newX = viewportX - worldX * newScale;
      const newY = viewportY - worldY * newScale;
      
      const newCamera = {
        x: newX,
        y: newY,
        scale: newScale
      };
      
        setCamera(newCamera);
      }
    } else if (Math.abs(e.deltaX) > 0) {
      // Scroll orizzontale = PAN orizzontale
      const newCamera = {
        ...camera,
        x: camera.x - e.deltaX,
        y: camera.y
      };
      
        setCamera(newCamera);
    }
  }, [camera]);

  // Event listener per wheel
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    
    svgElement.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      svgElement.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Event listener per chiudere context menu
  useEffect(() => {
    if (!frameContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      setFrameContextMenu(null);
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [frameContextMenu]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
  }, []);

  const selections = useOthersMapped((other) => other.presence.selection);

  const layerIdsToColorSelection = useMemo(() => {
    const result: Record<string, string> = {};

    for (const user of selections) {
      const [connectionId, selection] = user;

    for (const layerId of selection) {
        result[layerId] = connectionIdToColor(connectionId);
      }
    }

    return result;
  }, [selections]);

  const deleteLayers = useDeleteLayers();

  // === COPY & PASTE MUTATIONS ===

  const copySelectedLayers = useMutation(
    ({ storage, self }) => {
      const selection = self.presence.selection;
      if (selection.length === 0) return;

      const liveLayers = storage.get("layers");
      const copiedLayers: Array<any> = [];

      console.log("📋 COPY - Copying", selection.length, "selected layers");

      for (const layerId of selection) {
        const layer = liveLayers.get(layerId);
        if (layer) {
          const layerData = layer.toObject();
          copiedLayers.push({
            ...layerData,
            originalId: layerId // Store original ID for reference
          });
          console.log("📋 COPY - Copied layer", layerId, "type:", layerData.type);
        }
      }

      setClipboard(copiedLayers);
      console.log("📋 COPY - Clipboard updated with", copiedLayers.length, "layers");
      
      // Show user feedback
      console.log(`✅ Copied ${copiedLayers.length} item${copiedLayers.length > 1 ? 's' : ''} to clipboard`);
    },
    []
  );

  // Mutation per duplicare i layer selezionati con un offset (per Alt+drag)
  const duplicateSelectedLayers = useMutation(
    ({ storage, setMyPresence, self }, offset: Point) => {
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      const selectedIds = self.presence.selection;
      
      if (selectedIds.length === 0) return [];
      
      const newLayerIds: string[] = [];
      
      console.log("🔄 ALT+DRAG - Duplicating", selectedIds.length, "selected layers with offset", offset);
      
      for (const id of selectedIds) {
        const layer = liveLayers.get(id);
        if (layer) {
          const layerData = layer.toObject() as any;
          const newLayerId = nanoid();
          
          // Crea il layer duplicato con offset
          let duplicatedLayer;
          
          if (layerData.type === LayerType.Arrow || layerData.type === LayerType.Line) {
            // Per frecce e linee, aggiorna anche i punti start/end
            duplicatedLayer = new LiveObject({
              ...layerData,
              x: layerData.x + offset.x,
              y: layerData.y + offset.y,
              startX: layerData.startX + offset.x,
              startY: layerData.startY + offset.y,
              endX: layerData.endX + offset.x,
              endY: layerData.endY + offset.y,
              // Rimuovi connessioni snap per evitare conflitti
              sourceNoteId: undefined,
              targetNoteId: undefined,
              isSnappedToSource: false,
              isSnappedToTarget: false,
            });
          } else if (layerData.type === LayerType.Frame) {
            // Per i frame, duplica senza figli (saranno gestiti dalla gerarchia)
            duplicatedLayer = new LiveObject({
              ...layerData,
              x: layerData.x + offset.x,
              y: layerData.y + offset.y,
              children: [], // I figli saranno ricostruiti automaticamente
            });
          } else {
            // Per tutti gli altri tipi di layer
            duplicatedLayer = new LiveObject({
              ...layerData,
              x: layerData.x + offset.x,
              y: layerData.y + offset.y,
            });
          }
          
          // Aggiungi il layer duplicato
          liveLayerIds.push(newLayerId);
          liveLayers.set(newLayerId, duplicatedLayer);
          newLayerIds.push(newLayerId);
          
          console.log("🔄 ALT+DRAG - Duplicated layer", id, "→", newLayerId, "type:", layerData.type);
        }
      }
      
      // Seleziona i layer duplicati
      if (newLayerIds.length > 0) {
        setMyPresence({ selection: newLayerIds }, { addToHistory: true });
        console.log("🔄 ALT+DRAG - Selected", newLayerIds.length, "duplicated layers");
      }
      
      return newLayerIds;
    },
    []
  );

  const pasteClipboardLayers = useMutation(
    ({ storage, setMyPresence }) => {
      if (!clipboard || clipboard.length === 0) {
        console.log("📋 PASTE - Clipboard is empty");
        return;
      }

      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");

      if (MAX_LAYERS >= 0 && (liveLayers.size + clipboard.length > MAX_LAYERS)) {
        console.log("📋 PASTE - Cannot paste: would exceed max layers");
        return;
      }

      const pastedLayerIds: string[] = [];
      // Smart offset: use multiple of 20 based on how many times we've pasted
      const pasteOffset = 20; 

      console.log("📋 PASTE - Pasting", clipboard.length, "layers");

      for (const clipboardLayer of clipboard) {
        const newLayerId = nanoid();
        let newLayer;

        // Create new layer based on type with offset position
        if (clipboardLayer.type === LayerType.Frame) {
          newLayer = new LiveObject({
            ...clipboardLayer,
            x: clipboardLayer.x + pasteOffset,
            y: clipboardLayer.y + pasteOffset,
            children: [], // Frame children will be rebuilt by updateFrameChildren
          });
        } else if (clipboardLayer.type === LayerType.Arrow || clipboardLayer.type === LayerType.Line) {
          // For arrows and lines, offset both start and end points
          newLayer = new LiveObject({
            ...clipboardLayer,
            x: clipboardLayer.x + pasteOffset,
            y: clipboardLayer.y + pasteOffset,
            startX: clipboardLayer.startX + pasteOffset,
            startY: clipboardLayer.startY + pasteOffset,
            endX: clipboardLayer.endX + pasteOffset,
            endY: clipboardLayer.endY + pasteOffset,
          });
        } else {
          // For all other layer types (Rectangle, Ellipse, Text, Note, Path)
          newLayer = new LiveObject({
            ...clipboardLayer,
            x: clipboardLayer.x + pasteOffset,
            y: clipboardLayer.y + pasteOffset,
          });
        }

        // Remove the originalId property
        delete (newLayer as any).originalId;

        liveLayers.set(newLayerId, newLayer);
        liveLayerIds.push(newLayerId);
        pastedLayerIds.push(newLayerId);

        console.log("📋 PASTE - Pasted layer", newLayerId, "type:", clipboardLayer.type, "at offset", pasteOffset);
      }

      // Select the pasted layers
      setMyPresence({ selection: pastedLayerIds }, { addToHistory: true });

      // Update frame children relationships after pasting
      setTimeout(() => {
        updateFrameChildren();
      }, 100);

      console.log("📋 PASTE - Successfully pasted", pastedLayerIds.length, "layers");
      console.log(`✅ Pasted ${pastedLayerIds.length} item${pastedLayerIds.length > 1 ? 's' : ''}`);
    },
    [clipboard, updateFrameChildren]
  );

  const selectAllLayers = useMutation(
    ({ storage, setMyPresence }) => {
      const liveLayerIds = storage.get("layerIds");
      const allLayerIds = Array.from(liveLayerIds) as string[];
      
      if (allLayerIds.length === 0) {
        console.log("🔲 SELECT ALL - No layers to select");
        return;
      }

      setMyPresence({ selection: allLayerIds }, { addToHistory: true });
      console.log(`🔲 SELECT ALL - Selected ${allLayerIds.length} layers`);
    },
    []
  );

  const handleMobileTap = useMutation(
    ({ storage, setMyPresence }, point: Point) => {
      if (canvasState.mode === CanvasMode.None) {
        const liveLayers = storage.get("layers");
        let hitLayer = null;
        
        if (liveLayers) {
          for (const [layerId, layer] of liveLayers.entries()) {
            const layerData = layer.toObject();
            if (
              point.x >= layerData.x &&
              point.x <= layerData.x + layerData.width &&
              point.y >= layerData.y &&
              point.y <= layerData.y + layerData.height
            ) {
              hitLayer = layerId;
              break;
            }
          }
        }
        
        if (hitLayer) {
          setMyPresence({ selection: [hitLayer] }, { addToHistory: true });
        } else {
          setMyPresence({ selection: [] }, { addToHistory: true });
        }
      }
    },
    [canvasState.mode]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Controlla se siamo in modalità editing
      const activeElement = document.activeElement;
      const isEditing = activeElement && (
        activeElement.hasAttribute('contenteditable') ||
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      );
      
      // Track Shift key state
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      
      // Track Alt key state
      if (e.key === 'Alt') {
        setIsAltPressed(true);
      }
      
      switch (e.key) {
        case "z": {
          if (e.ctrlKey || e.metaKey) {
            if (e.shiftKey) {
              history.redo();
            } else {
              history.undo();
            }
            break;
          }
        }
        case "y": {
          // Redo con Ctrl+Y (alternativa a Ctrl+Shift+Z)
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            history.redo();
            break;
          }
        }
        case "c": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Copy selected layers
            if (mySelection && mySelection.length > 0) {
      e.preventDefault();
              e.stopPropagation();
              copySelectedLayers();
            }
            break;
          }
        }
        case "v": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Paste layers from clipboard
            e.preventDefault();
            e.stopPropagation();
            pasteClipboardLayers();
            break;
          }
          if (!e.ctrlKey && !e.metaKey && !isEditing) {
            // Select tool (V key without modifiers)
            e.preventDefault();
            setCanvasState({ mode: CanvasMode.None });
            break;
          }
        }
        case "a": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Select all layers
            e.preventDefault();
            e.stopPropagation();
            selectAllLayers();
            break;
          }
        }
        case "d": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Duplicate selected layers
            if (mySelection && mySelection.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              copySelectedLayers();
              // Small delay to ensure copy is complete
              setTimeout(() => {
                pasteClipboardLayers();
              }, 10);
            }
            break;
          }
        }
        case "0": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Reset position to center of canvas
            e.preventDefault();
            e.stopPropagation();
            if (smoothZoom) {
              smoothZoom({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                scale: camera.scale // Mantieni lo zoom corrente
              });
            }
            break;
          }
        }
        case "1": {
          if ((e.ctrlKey || e.metaKey) && !isEditing && centerOnLayers) {
            // Fit to screen / Center on layers
            e.preventDefault();
            e.stopPropagation();
            centerOnLayers();
            break;
          }
        }
        case "=":
        case "+": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Zoom in
            e.preventDefault();
            e.stopPropagation();
            if (smoothZoom) {
              const newZoom = Math.min(camera.scale * 1.2, 5); // Max zoom 5x
              smoothZoom({
                x: camera.x,
                y: camera.y,
                scale: newZoom
              });
            }
            break;
          }
        }
        case "-": {
          if ((e.ctrlKey || e.metaKey) && !isEditing) {
            // Zoom out
            e.preventDefault();
            e.stopPropagation();
            if (smoothZoom) {
              const newZoom = Math.max(camera.scale / 1.2, 0.1); // Min zoom 0.1x
              smoothZoom({
                x: camera.x,
                y: camera.y,
                scale: newZoom
              });
            }
            break;
          }
        }
        // Tool shortcuts
        case "t": {
          if (!isEditing) {
            // Text tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Text,
            });
            break;
          }
        }
        case "n": {
          if (!isEditing) {
            // Note tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Note,
            });
            break;
          }
        }
        case "p": {
          if (!isEditing) {
            // Pencil tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Pencil,
            });
            break;
          }
        }
        case "r": {
          if (!isEditing) {
            // Rectangle tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Rectangle,
            });
            break;
          }
        }
        case "o": {
          if (!isEditing) {
            // Ellipse/Circle tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Ellipse,
            });
            break;
          }
        }
        case "l": {
          if (!isEditing) {
            // Line tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Line,
            });
            break;
          }
        }
        case "f": {
          if (!isEditing) {
            // Frame tool
            e.preventDefault();
            setCanvasState({
              mode: CanvasMode.Inserting,
              layerType: LayerType.Frame,
            });
            break;
          }
        }
        case "h": {
          if (!isEditing && centerOnLayers) {
            // Fit to screen / Center on layers
            e.preventDefault();
            e.stopPropagation();
            centerOnLayers();
            break;
          }
        }
        case "Delete":
        case "Backspace":
        case "Canc": // Supporto per tastiere italiane
        case "Del": // Supporto alternativo
        {
          // Solo cancella i layer se:
          // 1. Non stiamo editando testo
          // 2. Abbiamo una selezione valida
          // 3. Non siamo in modalità inserimento o disegno
          if (!isEditing && 
              mySelection && 
              mySelection.length > 0 &&
              canvasState.mode !== CanvasMode.Inserting &&
              canvasState.mode !== CanvasMode.Drawing &&
              canvasState.mode !== CanvasMode.Pencil) {
            e.preventDefault();
            e.stopPropagation();
            deleteLayers();
          }
            break;
          }
        case "Escape": {
          // Annulla operazioni in corso
          if (canvasState.mode === CanvasMode.Inserting ||
              canvasState.mode === CanvasMode.Drawing ||
              canvasState.mode === CanvasMode.Pencil) {
            e.preventDefault();
            setCanvasState({ mode: CanvasMode.None });
          } else if (mySelection && mySelection.length > 0) {
            // Deseleziona se c'è una selezione
            e.preventDefault();
            unselectLayers();
          }
          break;
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      // Track Shift key state
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
      
      // Track Alt key state
      if (e.key === 'Alt') {
        setIsAltPressed(false);
      }
    }

      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);

    return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteLayers, history, mySelection, canvasState.mode, setCanvasState, unselectLayers, copySelectedLayers, pasteClipboardLayers, selectAllLayers, smoothZoom, camera]);

  const selectionBounds = useSelectionBounds();

  // Gestione eventi tastiera per panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressed) {
        // ✅ VERIFICA SE L'UTENTE STA DIGITANDO IN UN ELEMENTO DI INPUT
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.hasAttribute('contenteditable') ||
          activeElement.getAttribute('contenteditable') === 'true'
        );
        
        // Solo previeni il default se NON sta digitando
        if (!isTyping) {
          e.preventDefault();
        setIsSpacePressed(true);
          document.body.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        document.body.style.cursor = 'auto';
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (isSpacePressed && e.button === 0) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'grabbing';
      } else if (e.button === 2) { // Right click
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'grabbing';
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isSpacePressed]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const point = pointerEventToCanvasPoint(e, camera);

      // 🛡️ SECURITY: Block editing interactions for viewers
      if (isViewer) {
        console.log("🔒 Viewer mode: Editing interactions disabled");
        // For viewers, only allow selection mode - no editing
        setCanvasState({ mode: CanvasMode.None });
        return;
      }

      if (canvasState.mode === CanvasMode.Inserting) {
        // Per frecce, linee, rettangoli e cerchi, inizia la modalità drawing
        if (canvasState.layerType === LayerType.Arrow || 
            canvasState.layerType === LayerType.Line ||
            canvasState.layerType === LayerType.Rectangle ||
            canvasState.layerType === LayerType.Ellipse ||
            canvasState.layerType === LayerType.Frame) {
          console.log("🎨 Starting drawing mode:", canvasState.layerType, "at point:", point);
          console.log('🎨 Switching to Drawing mode with frameFormat:', canvasState.frameFormat);
          setCanvasState({
            mode: CanvasMode.Drawing,
            layerType: canvasState.layerType,
            origin: point,
            frameFormat: canvasState.frameFormat
          });
        return;
      }
        // Per altri layer (Text, Note), continua con la logica normale
        return;
      }

      if (canvasState.mode === CanvasMode.Pencil) {
        startDrawing(point, e.pressure);
        return;
      }

      // Se Shift è premuto, non deselezionare quando si clicca su area vuota
      // Mantieni la selezione corrente per permettere selezione multipla
      if (isShiftPressed) {
        console.log("🔘 SHIFT+CLICK - Clicked on empty area, maintaining selection");
        // Non avviare il pressing mode per evitare selection net
        return;
      }

      setCanvasState({ origin: point, mode: CanvasMode.Pressing });
    },
    [camera, canvasState.mode, setCanvasState, startDrawing, isViewer, isShiftPressed],
  );

  const onPointerUp = useMutation(
    ({}, e) => {
      const point = pointerEventToCanvasPoint(e, camera);

      if (
        canvasState.mode === CanvasMode.None ||
        canvasState.mode === CanvasMode.Pressing
      ) {
        // Solo deseleziona se Shift NON è premuto
        // Con Shift premuto, mantieni la selezione corrente
        if (!isShiftPressed) {
        unselectLayers();
        }
        setCanvasState({
          mode: CanvasMode.None,
        });
      } else if (canvasState.mode === CanvasMode.Pencil) {
        insertPath();
      } else if (canvasState.mode === CanvasMode.Drawing) {
        // Completa il disegno di tutti i tipi di layer
        if (canvasState.current) {
          // Per frecce e linee, applica lo snap automatico prima di inserire
          if (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line) {
            console.log("🎯 Applying snap to new arrow/line during creation");
            
            // Trova punti di snap per inizio e fine
            const sourceSnap = checkSnapPreview(canvasState.origin.x, canvasState.origin.y);
            const targetSnap = checkSnapPreview(canvasState.current.x, canvasState.current.y, sourceSnap?.id);
            
            // Applica snap alle coordinate
            let finalStartX = canvasState.origin.x;
            let finalStartY = canvasState.origin.y;
            let finalEndX = canvasState.current.x;
            let finalEndY = canvasState.current.y;
            
            if (sourceSnap) {
              const snapPoint = getSnapPoint(sourceSnap.note, sourceSnap.side);
              finalStartX = snapPoint.x;
              finalStartY = snapPoint.y;
              console.log("🎯 Snapped start to:", sourceSnap.id, sourceSnap.side);
            }
            
            if (targetSnap) {
              const snapPoint = getSnapPoint(targetSnap.note, targetSnap.side);
              finalEndX = snapPoint.x;
              finalEndY = snapPoint.y;
              console.log("🎯 Snapped end to:", targetSnap.id, targetSnap.side);
            }
            
            // Inserisci il layer con coordinate snappate e metadati
            const layerId = insertLayerWithSnap(
              canvasState.layerType, 
              { x: finalStartX, y: finalStartY }, 
              { x: finalEndX, y: finalEndY }, 
              currentUser?.info,
              sourceSnap,
              targetSnap
            );
          } else {
            insertLayer(canvasState.layerType, canvasState.origin, canvasState.current, currentUser?.info, canvasState.frameFormat);
          }
        } else {
          // Se non c'è movimento, crea un layer di default
          let endPoint;
          if (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line) {
            endPoint = { x: canvasState.origin.x + 100, y: canvasState.origin.y + 50 };
            
            // Applica snap anche per frecce di default
            const sourceSnap = checkSnapPreview(canvasState.origin.x, canvasState.origin.y);
            const targetSnap = checkSnapPreview(endPoint.x, endPoint.y, sourceSnap?.id);
            
            let finalStartX = canvasState.origin.x;
            let finalStartY = canvasState.origin.y;
            let finalEndX = endPoint.x;
            let finalEndY = endPoint.y;
            
            if (sourceSnap) {
              const snapPoint = getSnapPoint(sourceSnap.note, sourceSnap.side);
              finalStartX = snapPoint.x;
              finalStartY = snapPoint.y;
            }
            
            if (targetSnap) {
              const snapPoint = getSnapPoint(targetSnap.note, targetSnap.side);
              finalEndX = snapPoint.x;
              finalEndY = snapPoint.y;
            }
            
            const layerId = insertLayerWithSnap(
              canvasState.layerType, 
              { x: finalStartX, y: finalStartY }, 
              { x: finalEndX, y: finalEndY }, 
              currentUser?.info,
              sourceSnap,
              targetSnap
            );
          } else if (canvasState.layerType === LayerType.Frame) {
            // Per frame, usa preset se disponibile, altrimenti dimensioni default
            console.log('📐 onPointerUp Frame creation - frameFormat:', canvasState.frameFormat);
            if (canvasState.frameFormat) {
              // Se c'è un preset, non passare endPosition per usare le dimensioni preset
              console.log('📐 Using preset dimensions:', canvasState.frameFormat);
              insertLayer(canvasState.layerType, canvasState.origin, undefined, currentUser?.info, canvasState.frameFormat);
            } else {
              // Solo per custom size senza preset
              console.log('📐 Using default dimensions (300x200)');
              endPoint = { x: canvasState.origin.x + 300, y: canvasState.origin.y + 200 };
              insertLayer(canvasState.layerType, canvasState.origin, endPoint, currentUser?.info, canvasState.frameFormat);
            }
          } else {
            // Per rettangoli e cerchi, crea una forma quadrata di default
            endPoint = { x: canvasState.origin.x + 100, y: canvasState.origin.y + 100 };
            insertLayer(canvasState.layerType, canvasState.origin, endPoint, currentUser?.info, canvasState.frameFormat);
          }
        }
        setCanvasState({ mode: CanvasMode.None });
      } else if (canvasState.mode === CanvasMode.Inserting) {
        // Per Text e Note che non usano il drawing mode
        if (canvasState.layerType === LayerType.Text || canvasState.layerType === LayerType.Note) {
          insertLayer(canvasState.layerType, point, undefined, currentUser?.info, canvasState.frameFormat);
          // Ritorna automaticamente allo strumento di selezione dopo aver creato il layer
          setCanvasState({ mode: CanvasMode.None });
        }
      } else if (canvasState.mode === CanvasMode.Resizing || canvasState.mode === CanvasMode.GroupResizing) {
        // Reset per resize singolo e gruppo
        setCanvasState({
          mode: CanvasMode.None,
        });
        // Reset della posizione iniziale del mouse e snapshot dei layer
        setResizeInitialMousePos(null);
        setInitialLayersSnapshot(null);
      } else {
        setCanvasState({
          mode: CanvasMode.None,
        });
        // Pulisci le snap lines e info layer quando finisce il drag
        setActiveSnapLines([]);
        setCurrentMovingLayer(null);
      }

      history.resume();
      
      // Reset del resize di frecce/linee
      if (isResizingArrowLine) {
        setIsResizingArrowLine(null);
      }

      // Update frame children after any layer operation
      // ALWAYS update hierarchy to ensure objects that moved outside frames are properly handled
      setTimeout(() => {
        updateFrameChildren();
        
        // Auto-resize frames that have auto-resize enabled
        // BUT SKIP frames that contain explicitly selected child frames and skip during translating mode
        if (canvasState.mode !== CanvasMode.Translating && allLayers && mySelection) {
          const selectedIds = mySelection;
          
          allLayers.forEach((layer, layerId) => {
            if (layer.type === LayerType.Frame && (layer as any).autoResize) {
              const frameData = layer as any;
              const children = frameData.children || [];
              
              // Check if any children are explicitly selected
              const hasSelectedChildren = children.some((childId: string) => selectedIds.includes(childId));
              
              // Only auto-resize if NO children are explicitly selected
              // This prevents parent frames from moving when child frames are being moved independently
              if (!hasSelectedChildren) {
                autoResizeFrame(layerId);
              }
            }
          });
        }
      }, 50);
    },
    [
      setCanvasState,
      camera,
      canvasState,
      history,
      insertLayer,
      unselectLayers,
      insertPath,
      updateFrameChildren,
      allLayers,
      autoResizeFrame,
      mySelection,
      isShiftPressed,
    ],
  );

  const onPointerLeave = useMutation(({ setMyPresence }) => {
    setMyPresence({ cursor: null });
  }, []);

  const onLayerPointerDown = useMutation(
    ({ self, setMyPresence }, e: React.PointerEvent, layerId: string) => {
      // 🛡️ SECURITY: Block layer interactions for viewers
      if (isViewer) {
        console.log("🔒 Viewer mode: Layer interactions disabled");
        return;
      }
      
      // Se siamo in modalità Inserting per disegnare forme, delega al canvas principale
      // per gestire la transizione a modalità Drawing
      if (canvasState.mode === CanvasMode.Inserting) {
        // Chiama la funzione onPointerDown del canvas per gestire la transizione
        onPointerDown(e);
        return;
      }
      
      if (canvasState.mode === CanvasMode.Pencil) {
        return;
      }

      history.pause();
      e.stopPropagation();

      const point = pointerEventToCanvasPoint(e, camera);

      // Se Alt è premuto, duplica i layer selezionati
      if (isAltPressed && !isShiftPressed) {
        console.log("🔄 ALT+DRAG - Alt key detected, duplicating layers");
        
        // Se il layer cliccato non è nella selezione, selezionalo prima
        let layersToSelect = self.presence.selection;
        if (!layersToSelect.includes(layerId)) {
          layersToSelect = [layerId];
          setMyPresence({ selection: layersToSelect }, { addToHistory: true });
        }
        
        // Duplica i layer selezionati con un piccolo offset iniziale
        const initialOffset = { x: 0, y: 0 }; // Offset zero iniziale, sarà applicato durante il drag
        const duplicatedIds = duplicateSelectedLayers(initialOffset);
        
        // Inizia il trascinamento dei layer duplicati
        if (duplicatedIds.length > 0) {
          setCanvasState({ mode: CanvasMode.Translating, current: point });
          console.log("🔄 ALT+DRAG - Started translating duplicated layers");
        }
        return;
      }

      // Se Shift è premuto, gestisci la selezione multipla
      if (isShiftPressed) {
        console.log("🔘 SHIFT+CLICK - Multi-selection mode");
        
        const currentSelection = self.presence.selection;
        let newSelection: string[];
        
        if (currentSelection.includes(layerId)) {
          // Se il layer è già selezionato, rimuovilo dalla selezione
          newSelection = currentSelection.filter(id => id !== layerId);
          console.log("🔘 SHIFT+CLICK - Removed layer from selection:", layerId);
        } else {
          // Se il layer non è selezionato, aggiungilo alla selezione
          newSelection = [...currentSelection, layerId];
          console.log("🔘 SHIFT+CLICK - Added layer to selection:", layerId);
        }
        
        setMyPresence({ selection: newSelection }, { addToHistory: true });
        
        // Non iniziare il trascinamento in modalità selezione multipla
        // L'utente può poi trascinare normalmente senza Shift
        return;
      }

      // Logica di selezione normale - seleziona solo il layer cliccato
      if (!self.presence.selection.includes(layerId)) {
        setMyPresence({ selection: [layerId] }, { addToHistory: true });
      }
      
      // Inizia sempre il trascinamento quando un layer viene cliccato (senza Shift)
      setCanvasState({ mode: CanvasMode.Translating, current: point });
    },
    [setCanvasState, camera, history, canvasState.mode, isViewer, isAltPressed, isShiftPressed, duplicateSelectedLayers, onPointerDown],
  );

  const onLayerContextMenu = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      // Only show context menu for frames
      const layer = allLayers?.get(layerId);
      if (!layer || layer.type !== LayerType.Frame) {
        return;
      }

      // Don't show context menu for frames anymore since controls are in toolbar
      // Users can use the toolbar when frame is selected
      return;

      e.preventDefault();
      e.stopPropagation();

      setFrameContextMenu({
        frameId: layerId,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [allLayers],
  );

  const closeFrameContextMenu = useCallback(() => {
    setFrameContextMenu(null);
  }, []);

  const handleToggleAutoResize = useCallback(
    (frameId: string) => {
      toggleFrameAutoResize(frameId);
    },
    [toggleFrameAutoResize],
  );

  const handleManualResize = useCallback(
    (frameId: string) => {
      manualResizeFrameToFit(frameId);
    },
    [manualResizeFrameToFit],
  );

  const handleDeleteFrame = useCallback(
    (frameId: string) => {
      // Use the existing delete layers functionality
      deleteLayers();
    },
    [deleteLayers],
  );

  // Funzione per centrare la vista sui layer
  const centerOnLayers = useCallback(() => {
    if (!allLayers || allLayers.size === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    allLayers.forEach((layer) => {
      minX = Math.min(minX, layer.x);
      minY = Math.min(minY, layer.y);
      maxX = Math.max(maxX, layer.x + layer.width);
      maxY = Math.max(maxY, layer.y + layer.height);
    });
    
    if (minX === Infinity) return;
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;
    
    const padding = 100;
    const scaleX = (window.innerWidth - padding) / width;
    const scaleY = (window.innerHeight - padding) / height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    const newCamera = {
      x: window.innerWidth / 2 - centerX * scale,
      y: window.innerHeight / 2 - centerY * scale,
      scale: scale
    };
    
    smoothZoom(newCamera);
  }, [allLayers, smoothZoom]);

  // Mobile gesture handling
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useMobileGestures({
    camera,
    setCamera,
    onTap: (point) => {
      handleMobileTap(point);
    },
    onLongPress: (point) => {
      // Handle long press - could show context menu
      console.log('Long press at', point);
    }
  });

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Mobile device detection
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Funzione per creare un widget todo
  const handleCreateTodoWidget = () => {
    if (isViewer) {
      console.log("🔒 Viewer mode: Todo widget creation disabled");
      return;
    }
    
    setShowTodoListSelector(true);
  };

  // Funzione per creare il widget con la lista selezionata
  const handleTodoListSelected = useMutation(
    ({ storage, setMyPresence }, listId: string, listName: string) => {
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      
      // Calcola il centro della vista
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      // Converti le coordinate dello schermo in coordinate del canvas
      const canvasX = (centerX - camera.x) / camera.scale;
      const canvasY = (centerY - camera.y) / camera.scale;
      
      // Crea il widget todo
      const layerId = nanoid();
      
      // Debug coordinate calculation
      console.log("🎯 TODO WIDGET CREATION DEBUG:", {
        centerX,
        centerY,
        cameraX: camera.x,
        cameraY: camera.y,
        cameraScale: camera.scale,
        canvasX,
        canvasY,
        finalX: canvasX - 160,
        finalY: canvasY - 200
      });
      
      // Verifica che le coordinate siano valide
      const finalX = canvasX - 160;
      const finalY = canvasY - 200;
      
      if (isNaN(finalX) || isNaN(finalY)) {
        console.error("❌ TODO WIDGET - Invalid coordinates calculated:", { finalX, finalY, canvasX, canvasY, camera });
        toast.error("Errore nella creazione del widget: coordinate non valide");
        return;
      }
      
      const layer = new LiveObject({
        type: LayerType.TodoWidget,
        x: finalX, // Centra il widget (320px / 2)
        y: finalY, // Centra il widget (400px / 2)
        width: 320,
        height: 400,
        fill: { r: 255, g: 255, b: 255 }, // Bianco
        todoListId: listId,
        title: listName,
        isMinimized: false,
        showCompleted: false,
        maxVisibleTasks: 10,
        borderColor: { r: 229, g: 231, b: 235 }, // gray-200
        borderWidth: 1,
        opacity: 1,
      } as TodoWidgetLayer);
      
      liveLayers.set(layerId, layer);
      liveLayerIds.push(layerId);
      
      // Seleziona il nuovo widget
      setMyPresence({ selection: [layerId] }, { addToHistory: true });
      
      console.log("✅ Todo widget created:", layerId);
    },
    [camera]
  );
  
  useEffect(() => {
    const checkTouch = () => {
      const hasTouchEvents = 'ontouchstart' in window || 
        window.navigator.maxTouchPoints > 0 ||
        (window.navigator as any).msMaxTouchPoints > 0;
      
      setIsTouchDevice(hasTouchEvents);
    };

    checkTouch();
    window.addEventListener('resize', checkTouch);
    
    return () => {
      window.removeEventListener('resize', checkTouch);
    };
  }, []);

  // Funzione per aprire il dialog di configurazione della tabella
  const handleCreateTable = useMutation(
    ({ storage, setMyPresence }) => {
      if (isViewer) {
        console.log("🔒 Viewer mode: Table creation disabled");
        return;
      }
      
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      
      // Calcola il centro della vista
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      // Converti le coordinate dello schermo in coordinate del canvas
      const canvasX = (centerX - camera.x) / camera.scale;
      const canvasY = (centerY - camera.y) / camera.scale;
      
      // Crea una tabella di default con colonna numero
      const defaultColumns: TableColumn[] = [
        {
          id: `col_${nanoid()}`,
          name: "#",
          type: TableColumnType.Number,
          width: 60,
          required: false
        },
        {
          id: `col_${nanoid()}`,
          name: "Colonna 1",
          type: TableColumnType.Text,
          width: 150,
          required: false
        }
      ];
      
      // Crea 5 righe iniziali
      const initialRows: TableRow[] = [];
      for (let i = 0; i < 5; i++) {
        const row: TableRow = {
          id: `row_${nanoid()}`,
          cells: [
            {
              columnId: defaultColumns[0].id,
              value: i + 1 // Numero di riga
            },
            {
              columnId: defaultColumns[1].id,
              value: ""
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        initialRows.push(row);
      }
      
      // Crea la tabella
      const layerId = nanoid();
      const defaultWidth = 400;
      const defaultHeight = 300;
      
      const finalX = canvasX - defaultWidth / 2;
      const finalY = canvasY - defaultHeight / 2;
      
      if (isNaN(finalX) || isNaN(finalY)) {
        console.error("❌ TABLE - Invalid coordinates calculated:", { finalX, finalY, canvasX, canvasY, camera });
        toast.error("Errore nella creazione della tabella: coordinate non valide");
        return;
      }
      
      const layer = new LiveObject({
        type: LayerType.Table,
        x: finalX,
        y: finalY,
        width: defaultWidth,
        height: defaultHeight,
        fill: { r: 255, g: 255, b: 255 }, // Bianco
        title: "Nuova Tabella",
        columns: defaultColumns,
        rows: initialRows,
        borderColor: { r: 229, g: 231, b: 235 }, // gray-200
        borderWidth: 1,
        headerColor: { r: 249, g: 250, b: 251 }, // gray-50
        alternateRowColors: true,
        showRowNumbers: false,
        allowSorting: true,
        allowFiltering: true,
        opacity: 1,
      } as TableLayer);
      
      liveLayers.set(layerId, layer);
      liveLayerIds.push(layerId);
      
      // Seleziona la nuova tabella
      setMyPresence({ selection: [layerId] }, { addToHistory: true });
      
      console.log("✅ Table created:", layerId);
      toast.success("Tabella creata con successo!");
    },
    [camera, isViewer]
  );

  // Add board-active class to body when component mounts
  useEffect(() => {
    document.body.classList.add('board-active');
    return () => {
      document.body.classList.remove('board-active');
    };
  }, []);

  return (
    <main className="board-container">
      <div 
        className={`board-canvas relative ${
          gridConfig.backgroundColor === "#000000" ? "dark-background" : ""
        } ${isTouchDevice ? 'mobile-canvas' : ''}`}
        style={{ backgroundColor: gridConfig.backgroundColor }}
      >
      <Info boardId={boardId} />
      <Participants />
      <SecureToolbar
        canvasState={canvasState}
        setCanvasState={setCanvasState}
        undo={history.undo}
        redo={history.redo}
        canUndo={canUndo}
        canRedo={canRedo}
        camera={camera}
        setCamera={setCamera}
        smoothZoom={smoothZoom}
        setLastUsedColor={setLastUsedColor}
        centerOnLayers={centerOnLayers}
        boardId={boardId}
        gridConfig={gridConfig}
        onGridConfigChange={updateGridConfig}
        autoSaveToLibrary={autoSaveToLibrary}
        onAutoSaveToLibraryChange={updateAutoSaveToLibrary}
        canEnableAutoSave={canEnableAutoSave}
        pencilStrokeWidth={pencilStrokeWidth}
        setPencilStrokeWidth={setPencilStrokeWidth}
        lastUsedColor={lastUsedColor}
        setLastUsedFontSize={setLastUsedFontSize}
        setLastUsedFontWeight={setLastUsedFontWeight}
        onToggleFrameAutoResize={handleToggleAutoResize}
        onManualFrameResize={handleManualResize}
        isTouchDevice={isTouchDevice}
        onShareBoard={permissions.canShare ? handleShareBoard : undefined}
        onDownloadBoard={handleDownloadBoard}
        onDeleteBoard={permissions.canDelete ? handleDeleteBoard : undefined}
        onBoardSettings={permissions.canAdmin ? handleBoardSettings : undefined}
        onCreateTodoWidget={handleCreateTodoWidget}
        onCreateTable={handleCreateTable}
        showPermissionInfo={false}
        userRole={userRole}
      />

      <svg
        ref={svgRef}
        className="h-[100vh] w-[100vw] select-none"
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={onContextMenu}
        style={{ 
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
        <g
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          {/* Grid background - primo elemento per apparire dietro tutto */}
          {gridConfig.enabled && <GridRenderer camera={camera} config={gridConfig} />}
          
          {/* Snap guidelines - appaiono sopra la griglia durante il drag */}
          <SnapGuidelines 
            snapLines={activeSnapLines} 
            camera={camera}
            currentLayerX={currentMovingLayer?.x}
            currentLayerY={currentMovingLayer?.y}
            currentLayerWidth={currentMovingLayer?.width}
            currentLayerHeight={currentMovingLayer?.height}
          />
          
          {/* Prima renderizza le frecce (z-index più basso) */}
          {layerIds
            .filter(layerId => {
              const layer = allLayers?.get(layerId);
              return layer?.type === "arrow";
            })
            .map((layerId) => (
                          <LayerPreview
                key={layerId}
                id={layerId}
                onLayerPointerDown={onLayerPointerDown}
                onLayerContextMenu={onLayerContextMenu}
                selectionColor={layerIdsToColorSelection[layerId]}
                lastUsedColor={lastUsedColor}
                camera={camera}
                canvasState={canvasState}
                boardId={boardId}
                backgroundColor={gridConfig.backgroundColor}
                onDrawingStart={startDrawing}
                onDrawingContinue={continueDrawing}
                onDrawingEnd={insertPath}
                onDrawingModeStart={handleDrawingModeStart}
                onDrawingModeMove={handleDrawingModeMove}
                onDrawingModeEnd={handleDrawingModeEnd}
              />
            ))
          }
          {/* Poi renderizza tutti gli altri layer (z-index più alto) */}
          {layerIds
            .filter(layerId => {
              const layer = allLayers?.get(layerId);
              return layer?.type !== "arrow";
            })
            .map((layerId) => (
              <LayerPreview
                key={layerId}
                id={layerId}
                onLayerPointerDown={onLayerPointerDown}
                onLayerContextMenu={onLayerContextMenu}
                selectionColor={layerIdsToColorSelection[layerId]}
                lastUsedColor={lastUsedColor}
                camera={camera}
                canvasState={canvasState}
                boardId={boardId}
                backgroundColor={gridConfig.backgroundColor}
                onDrawingStart={startDrawing}
                onDrawingContinue={continueDrawing}
                onDrawingEnd={insertPath}
                onDrawingModeStart={handleDrawingModeStart}
                onDrawingModeMove={handleDrawingModeMove}
                onDrawingModeEnd={handleDrawingModeEnd}
              />
            ))
          }
          <SelectionBox 
            onResizeHandlePointerDown={onResizeHandlePointerDown} 
            onArrowLinePointPointerDown={onArrowLinePointPointerDown}
            canvasState={canvasState.mode}
            camera={camera}
          />
          
          {canvasState.mode === CanvasMode.SelectionNet &&
            canvasState.current != null && (
              <SelectionNet
                origin={canvasState.origin}
                current={canvasState.current}
              />
            )}
          <CursorsPresence />
          
          {/* Mind Map Connection Points - renderizzati per ultimi per essere in cima */}
                        <NoteConnectionPoints 
              lastUsedColor={lastUsedColor} 
              lastUsedFontSize={lastUsedFontSize}
              lastUsedFontWeight={lastUsedFontWeight}
            />
              <ArrowSnapIndicators 
                camera={camera} 
                canvasState={canvasState}
                isResizingArrowLine={isResizingArrowLine}
                resizePoint={currentMousePosition}
              />
          {pencilDraft != null && pencilDraft.length > 0 && (
            <Path
              points={pencilDraft}
              fill={colorToCSS(lastUsedColor)}
              x={0}
              y={0}
              strokeWidth={pencilStrokeWidth}
            />
          )}
          {/* Preview per tutti gli strumenti di disegno durante il drawing */}
          {canvasState.mode === CanvasMode.Drawing && canvasState.current && (
            canvasState.layerType === LayerType.Arrow ? (
              <g>
                <line
                  x1={canvasState.origin.x}
                  y1={canvasState.origin.y}
                  x2={canvasState.current.x}
                  y2={canvasState.current.y}
                  stroke={colorToCSS(lastUsedColor)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={isShiftPressed ? "8,4" : "5,5"}
                  opacity={0.8}
                />
                {/* Visual indicator for angle constraint */}
                {isShiftPressed && (
                  <circle
                    cx={canvasState.current.x}
                    cy={canvasState.current.y}
                    r={4}
                    fill={colorToCSS(lastUsedColor)}
                    opacity={0.6}
                  />
                )}
                {/* Testa della freccia preview */}
                {(() => {
                  const angle = Math.atan2(canvasState.current.y - canvasState.origin.y, canvasState.current.x - canvasState.origin.x);
                  
                  // Calcola la lunghezza effettiva della freccia per la preview
                  const arrowLength = Math.sqrt(
                    Math.pow(canvasState.current.x - canvasState.origin.x, 2) + 
                    Math.pow(canvasState.current.y - canvasState.origin.y, 2)
                  );
                  
                  // Usa la stessa formula del componente Arrow
                  const arrowHeadLength = Math.min(Math.max(arrowLength * 0.2, 8), 25); // Min 8px, Max 25px, 20% della lunghezza
                  
                  const arrowHead1X = canvasState.current.x - arrowHeadLength * Math.cos(angle - Math.PI / 6);
                  const arrowHead1Y = canvasState.current.y - arrowHeadLength * Math.sin(angle - Math.PI / 6);
                  const arrowHead2X = canvasState.current.x - arrowHeadLength * Math.cos(angle + Math.PI / 6);
                  const arrowHead2Y = canvasState.current.y - arrowHeadLength * Math.sin(angle + Math.PI / 6);
                  
                  return (
                    <polygon
                      points={`${canvasState.current.x},${canvasState.current.y} ${arrowHead1X},${arrowHead1Y} ${arrowHead2X},${arrowHead2Y}`}
                      fill={colorToCSS(lastUsedColor)}
                      stroke={colorToCSS(lastUsedColor)}
                      strokeWidth={1}
                      strokeLinejoin="round"
                      opacity={0.8}
                    />
                  );
                })()}
              </g>
            ) : canvasState.layerType === LayerType.Line ? (
              <g>
                <line
                  x1={canvasState.origin.x}
                  y1={canvasState.origin.y}
                  x2={canvasState.current.x}
                  y2={canvasState.current.y}
                  stroke={colorToCSS(lastUsedColor)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={isShiftPressed ? "8,4" : "5,5"}
                  opacity={0.8}
                />
                {/* Visual indicator for angle constraint */}
                {isShiftPressed && (
                  <circle
                    cx={canvasState.current.x}
                    cy={canvasState.current.y}
                    r={4}
                    fill={colorToCSS(lastUsedColor)}
                    opacity={0.6}
                  />
                )}
              </g>
            ) : canvasState.layerType === LayerType.Rectangle ? (
              <g>
                <rect
                  x={Math.min(canvasState.origin.x, canvasState.current.x)}
                  y={Math.min(canvasState.origin.y, canvasState.current.y)}
                  width={Math.abs(canvasState.current.x - canvasState.origin.x)}
                  height={Math.abs(canvasState.current.y - canvasState.origin.y)}
                  fill={colorToCSS(lastUsedColor)}
                  stroke={colorToCSS(lastUsedColor)}
                  strokeWidth={2}
                  strokeDasharray={isShiftPressed ? "8,4" : "5,5"}
                  opacity={0.5}
                  fillOpacity={0.2}
                />
                {/* Visual indicator for square constraint */}
                {isShiftPressed && (
                  <text
                    x={Math.min(canvasState.origin.x, canvasState.current.x) + Math.abs(canvasState.current.x - canvasState.origin.x) / 2}
                    y={Math.min(canvasState.origin.y, canvasState.current.y) - 8}
                    fontSize={10}
                    fill={colorToCSS(lastUsedColor)}
                    textAnchor="middle"
                    opacity={0.8}
                  >
                    □ Square
                  </text>
                )}
              </g>
            ) : canvasState.layerType === LayerType.Ellipse ? (
              <g>
                <ellipse
                  cx={(canvasState.origin.x + canvasState.current.x) / 2}
                  cy={(canvasState.origin.y + canvasState.current.y) / 2}
                  rx={Math.abs(canvasState.current.x - canvasState.origin.x) / 2}
                  ry={Math.abs(canvasState.current.y - canvasState.origin.y) / 2}
                  fill={colorToCSS(lastUsedColor)}
                  stroke={colorToCSS(lastUsedColor)}
                  strokeWidth={2}
                  strokeDasharray={isShiftPressed ? "8,4" : "5,5"}
                  opacity={0.5}
                  fillOpacity={0.2}
                />
                {/* Visual indicator for circle constraint */}
                {isShiftPressed && (
                  <text
                    x={(canvasState.origin.x + canvasState.current.x) / 2}
                    y={Math.min(canvasState.origin.y, canvasState.current.y) - 8}
                    fontSize={10}
                    fill={colorToCSS(lastUsedColor)}
                    textAnchor="middle"
                    opacity={0.8}
                  >
                    ○ Circle
                  </text>
                )}
              </g>
            ) : canvasState.layerType === LayerType.Frame ? (
              (() => {
                const previewX = Math.min(canvasState.origin.x, canvasState.current.x);
                const previewY = Math.min(canvasState.origin.y, canvasState.current.y);
                const previewWidth = Math.abs(canvasState.current.x - canvasState.origin.x);
                const previewHeight = Math.abs(canvasState.current.y - canvasState.origin.y);
                const previewHeaderHeight = Math.max(24, Math.min(32, previewHeight * 0.12));
                
                return (
                  <g opacity={0.7}>
                    {/* Frame background */}
                    <rect
                      x={previewX}
                      y={previewY}
                      width={previewWidth}
                      height={previewHeight}
                      fill="white"
                      stroke="#e2e8f0"
                      strokeWidth={1.5}
                      strokeDasharray="6,4"
                      rx={8}
                      ry={8}
                      opacity={0.9}
                    />
                    
                    {/* Header */}
                    <rect
                      x={previewX}
                      y={previewY}
                      width={previewWidth}
                      height={previewHeaderHeight}
                      fill="rgba(248, 250, 252, 0.95)"
                      stroke="none"
                      rx={8}
                      ry={8}
                      style={{
                        clipPath: `inset(0 0 ${previewHeight - previewHeaderHeight}px 0 round 8px)`
                      }}
                    />
                    
                    {/* Header border */}
                    <line
                      x1={previewX + 8}
                      x2={previewX + previewWidth - 8}
                      y1={previewY + previewHeaderHeight - 0.5}
                      y2={previewY + previewHeaderHeight - 0.5}
                      stroke="rgba(203, 213, 225, 0.6)"
                      strokeWidth={1}
                    />
                    
                    {/* Title */}
                    <text
                      x={previewX + 12}
                      y={previewY + previewHeaderHeight / 2}
                      fontSize={Math.max(10, Math.min(12, previewHeaderHeight * 0.35))}
                      fontWeight="600"
                      fill="#475569"
                      dominantBaseline="middle"
                      style={{
                        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
                      }}
                    >
                      Frame
                    </text>
                  </g>
                );
              })()
            ) : null
          )}
          
          {/* Hint per Shift key constraints */}
          {(canvasState.mode === CanvasMode.Drawing || 
            canvasState.mode === CanvasMode.Resizing || 
            canvasState.mode === CanvasMode.GroupResizing ||
            isResizingArrowLine) && !isShiftPressed && (
            <g>
              <rect
                className="fill-black/80 stroke-none"
                x={10}
                y={10}
                width={200}
                height={32}
                rx={8}
                ry={8}
                opacity={0.9}
              />
              <text
                className="text-sm fill-white font-medium"
                x={20}
                y={28}
                dominantBaseline="middle"
              >
                {canvasState.mode === CanvasMode.Drawing 
                  ? (canvasState.layerType === LayerType.Arrow || canvasState.layerType === LayerType.Line
                      ? "Hold Shift for 45° angles"
                      : "Hold Shift for squares/circles")
                  : "Hold Shift to keep proportions"
                }
              </text>
            </g>
          )}
          

          
          {/* Shift active indicator */}
          {isShiftPressed && (
            (canvasState.mode === CanvasMode.Drawing || 
             canvasState.mode === CanvasMode.Resizing || 
             canvasState.mode === CanvasMode.GroupResizing ||
             isResizingArrowLine) && (
              <g>
                <rect
                  className="fill-blue-600 stroke-none"
                  x={10}
                  y={10}
                  width={120}
                  height={32}
                  rx={8}
                  ry={8}
                  opacity={0.95}
                />
                <text
                  className="text-sm fill-white font-semibold"
                  x={20}
                  y={28}
                  dominantBaseline="middle"
                >
                  ⇧ Constraints ON
                </text>
              </g>
            )
          )}
          

        </g>
      </svg>

      {/* Frame Context Menu */}
      {frameContextMenu && (
        <FrameContextMenu
          frameId={frameContextMenu.frameId}
          x={frameContextMenu.x}
          y={frameContextMenu.y}
          onClose={closeFrameContextMenu}
          onToggleAutoResize={handleToggleAutoResize}
          onManualResize={handleManualResize}
          onDelete={handleDeleteFrame}
        />
      )}

      {/* Todo List Selector Modal */}
      <TodoListSelectorModal
        isOpen={showTodoListSelector}
        onClose={() => setShowTodoListSelector(false)}
        onSelectList={(listId, listName) => {
          handleTodoListSelected(listId, listName);
          setShowTodoListSelector(false);
        }}
        projectId={projectId}
      />

      {/* Table Config Dialog */}

      </div>
    </main>
  );
};
