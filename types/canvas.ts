export type Color = {
  r: number;
  g: number;
  b: number;
};

export type Camera = {
  x: number;
  y: number;
  scale: number;
};

// Tipo per salvare lo stato della camera dell'utente
export type CameraState = {
  x: number;
  y: number;
  scale: number;
  lastUpdate: number;
};

export enum LayerType {
  Ellipse = "ellipse",
  Rectangle = "rectangle",
  Path = "path",
  Note = "note",
  Text = "text",
  Image = "image",
  Video = "video",
  File = "file",
  Arrow = "arrow",
  Line = "line",
  Frame = "frame",
  TodoWidget = "todoWidget",
  Table = "table"
}

export type RectangleLayer = {
  type: LayerType.Rectangle;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  shadow?: boolean;
};

export type EllipseLayer = {
  type: LayerType.Ellipse;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  shadow?: boolean;
};

export type PathLayer = {
  type: LayerType.Path;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  points: number[][];
  value?: string;
  strokeWidth?: number;
  shadow?: boolean;
};



export type NoteLayer = {
  type: LayerType.Note;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  // Campi di formattazione testo come TextLayer
  textAlign?: "left" | "center" | "right" | "justify";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  lastModifiedBy?: string; // Nome dell'utente che ha modificato per ultimo
  lastModifiedAt?: string; // Timestamp dell'ultima modifica
  showMetadata?: boolean; // Se mostrare nome e data (default: true)
  connectionPoints?: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
  // Tracciamento connessioni per Mind Map
  connections?: {
    incoming: string[]; // IDs delle frecce che arrivano a questa nota
    outgoing: string[]; // IDs delle frecce che partono da questa nota
  };
};

export type TextLayer = {
  type: LayerType.Text;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  letterSpacing?: number;
  lineHeight?: number;
  textShadow?: boolean;
};

export type ImageLayer = {
  type: LayerType.Image;
  x: number;
  y: number;
  height: number;
  width: number;
  url: string;
  previewUrl?: string;
  title?: string;
  shadow?: boolean;
};

export type VideoLayer = {
  type: LayerType.Video;
  x: number;
  y: number;
  height: number;
  width: number;
  url: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  shadow?: boolean;
};

export type FileLayer = {
  type: LayerType.File;
  x: number;
  y: number;
  height: number;
  width: number;
  url: string;
  title?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  shadow?: boolean;
};

export type ArrowLayer = {
  type: LayerType.Arrow;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  strokeWidth?: number;
  shadow?: boolean;
  // Supporto per curve Bézier
  controlPoint1X?: number;
  controlPoint1Y?: number;
  controlPoint2X?: number;
  controlPoint2Y?: number;
  curved?: boolean;
  // Metadati per connessioni Mind Map
  sourceNoteId?: string; // ID della nota sorgente
  targetNoteId?: string; // ID della nota target
  sourceSide?: "top" | "right" | "bottom" | "left"; // Lato della nota sorgente
  targetSide?: "top" | "right" | "bottom" | "left"; // Lato della nota target
  isMindMapConnection?: boolean; // Flag per identificare connessioni Mind Map
  // Metadati per snap automatico
  isSnappedToSource?: boolean; // Se il punto di partenza è agganciato a una nota
  isSnappedToTarget?: boolean; // Se il punto di arrivo è agganciato a una nota
};

export type LineLayer = {
  type: LayerType.Line;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color;
  value?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  strokeWidth?: number;
  shadow?: boolean;
};

export type FrameLayer = {
  type: LayerType.Frame;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color; // Background color
  title: string;
  borderColor: Color;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  children: string[]; // IDs degli oggetti contenuti
  clipping: boolean; // Se nascondere oggetti fuori dal frame
  autoResize: boolean; // Se ridimensionare automaticamente per contenere tutto
  opacity?: number;
};

export type TodoWidgetLayer = {
  type: LayerType.TodoWidget;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color; // Background color
  todoListId?: string; // Legacy: linked todo list ID
  title?: string; // Titolo personalizzato del widget
  isMinimized?: boolean; // Se il widget è minimizzato
  showCompleted?: boolean; // Se mostrare i task completati
  maxVisibleTasks?: number; // Numero massimo di task visibili
  groups?: TodoWidgetGroup[];
  borderColor?: Color;
  borderWidth?: number;
  opacity?: number;
};

export type TodoWidgetSubtask = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoWidgetTask = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  assigneeId?: string;
  collapsed?: boolean;
  subtasks: TodoWidgetSubtask[];
};

export type TodoWidgetGroup = {
  id: string;
  title: string;
  collapsed?: boolean;
  createdAt: string;
  updatedAt: string;
  tasks: TodoWidgetTask[];
};

// Tipi per le colonne della tabella
export enum TableColumnType {
  Text = "text",
  Number = "number",
  Date = "date",
  Select = "select",
  MultiSelect = "multiSelect",
  Image = "image",
  Person = "person",
}

export type TableSelectOption = {
  id: string;
  label: string;
  color: Color;
};

export type TableColumn = {
  id: string;
  name: string;
  type: TableColumnType;
  width: number;
  options?: TableSelectOption[]; // Per Select e MultiSelect
  required?: boolean;
  defaultValue?: any;
};

export type TableCell = {
  columnId: string;
  value: any; // Il tipo dipende dal tipo di colonna
};

export type TableRow = {
  id: string;
  cells: TableCell[];
  createdAt: string;
  updatedAt: string;
};

export type TableLayer = {
  type: LayerType.Table;
  x: number;
  y: number;
  height: number;
  width: number;
  fill: Color; // Background color
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  borderColor?: Color;
  borderWidth?: number;
  headerColor?: Color;
  alternateRowColors?: boolean;
  showRowNumbers?: boolean;
  allowSorting?: boolean;
  allowFiltering?: boolean;
  opacity?: number;
};

export type Point = {
  x: number;
  y: number;
};

export type XYWH = {
  x: number;
  y: number;
  height: number;
  width: number;
};

export enum Side {
  Top = 1,
  Bottom = 2,
  Left = 4,
  Right = 8,
}

export type CanvasState =
  | {
      mode: CanvasMode.None;
    }
  | {
      mode: CanvasMode.Panning;
    }
  | {
      mode: CanvasMode.Pressing;
      origin: Point;
    }
  | {
      mode: CanvasMode.SelectionNet;
      origin: Point;
      current: Point;
    }
  | {
      mode: CanvasMode.Translating;
      current: Point;
    }
  | {
      mode: CanvasMode.Inserting;
      layerType:
        | LayerType.Ellipse
        | LayerType.Rectangle
        | LayerType.Text
        | LayerType.Note
        | LayerType.Arrow
        | LayerType.Line
        | LayerType.Frame
        | LayerType.TodoWidget
        | LayerType.Table;
      frameFormat?: {
        name: string;
        width: number;
        height: number;
      };
    }
  | {
      mode: CanvasMode.Pencil;
    }
  | {
      mode: CanvasMode.Drawing;
      layerType: LayerType.Arrow | LayerType.Line | LayerType.Rectangle | LayerType.Ellipse | LayerType.Frame | LayerType.Table;
      origin: Point;
      current?: Point;
      frameFormat?: {
        name: string;
        width: number;
        height: number;
      };
    }
  | {
      mode: CanvasMode.Resizing;
      initialBounds: XYWH;
      corner: Side;
      maintainAspectRatio?: boolean;
    }
  | {
      mode: CanvasMode.GroupResizing;
      initialBounds?: XYWH;
      corner?: Side;
      maintainAspectRatio?: boolean;
    };

export enum CanvasMode {
  None,
  Panning,
  Pressing,
  SelectionNet,
  Translating,
  Inserting,
  Resizing,
  Pencil,
  Drawing,
  GroupResizing
}

export type Layer =
  | RectangleLayer
  | EllipseLayer
  | PathLayer
  | NoteLayer
  | TextLayer
  | ImageLayer
  | VideoLayer
  | FileLayer
  | ArrowLayer
  | LineLayer
  | FrameLayer
  | TodoWidgetLayer
  | TableLayer;

// ----- REVIEW & ANNOTATION SYSTEM TYPES -----

export type ReviewSessionStatus = "active" | "completed" | "archived";

export type ReviewAssetType = "image" | "video";

export type ReviewCompareMode = "none" | "side-by-side" | "overlay";

export type ReviewUserRole = "viewer" | "annotator" | "reviewer";

export type ReviewCommentStatus = "open" | "resolved" | "acknowledged";

export type ReviewApprovalStatus = "approved" | "rejected" | "needs_changes" | "on_hold";

export type ReviewAnnotationType = "freehand" | "rectangle" | "circle" | "arrow";

export interface ReviewSession {
  _id: string;
  title: string;
  description?: string;
  boardId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  status: ReviewSessionStatus;
  // Assets
  primaryAssetId: string;
  primaryAssetType: ReviewAssetType;
  primaryAssetUrl: string;
  compareAssets?: Array<{
    id: string;
    type: ReviewAssetType;
    url: string;
    name?: string;
  }>;
  // Settings
  settings: {
    allowDrawing: boolean;
    allowComments: boolean;
    compareMode: ReviewCompareMode;
    videoSyncEnabled?: boolean;
    drawingTools: string[];
  };
  // Collaboration
  collaborators: Array<{
    userId: string;
    userName: string;
    role: ReviewUserRole;
    joinedAt: string;
  }>;
  orgId?: string;
}

export interface ReviewAnnotation {
  _id: string;
  sessionId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  assetId: string;
  frameNumber?: number;
  frameTimestamp?: number;
  type: ReviewAnnotationType;
  drawingData: {
    path?: string;
    points?: Array<{ x: number; y: number }>;
    bounds?: { x: number; y: number; width: number; height: number };
    style: {
      color: string;
      strokeWidth: number;
      opacity?: number;
      fillColor?: string;
    };
  };
  textContent?: string;
  position: { x: number; y: number };
  isVisible: boolean;
  isDeleted: boolean;
  version: number;
  parentAnnotationId?: string;
}

export interface ReviewComment {
  _id: string;
  sessionId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  assetId: string;
  frameNumber?: number;
  frameTimestamp?: number;
  content: string;
  position: { x: number; y: number };
  area?: { x: number; y: number; width: number; height: number };
  parentCommentId?: string;
  threadId: string;
  status: ReviewCommentStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  isDeleted: boolean;
  reactions?: Array<{
    userId: string;
    type: string;
    createdAt: string;
  }>;
}

export interface ReviewVideoFrame {
  _id: string;
  sessionId: string;
  assetId: string;
  frameNumber: number;
  timestamp: number;
  thumbnailUrl?: string;
  annotationCount: number;
  commentCount: number;
  analysisData?: {
    hasMotion?: boolean;
    sceneChange?: boolean;
    dominantColors?: string[];
  };
  createdAt: string;
}

export interface ReviewApproval {
  _id: string;
  sessionId: string;
  assetId: string;
  frameNumber?: number;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
  status: ReviewApprovalStatus;
  feedback?: string;
  approvalLevel: number;
  finalApproval: boolean;
  approvedVersion: string;
}

export interface ReviewPresence {
  _id: string;
  sessionId: string;
  userId: string;
  userName: string;
  currentAssetId: string;
  currentFrame?: number;
  cursorPosition?: { x: number; y: number };
  isActive: boolean;
  lastActivity: string;
  activeTool?: string;
  connectionId: string;
  joinedAt: string;
}

// Drawing tool types
export type ReviewDrawingTool = "select" | "freehand" | "rectangle" | "circle" | "arrow" | "eraser" | "move" | "comment";

// Video player state
export interface ReviewVideoState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  fps?: number;
  isLoaded?: boolean;
}

// Canvas state for drawing
export interface ReviewCanvasState {
  tool: ReviewDrawingTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  isDrawing: boolean;
  currentPath?: string;
  zoom: number;
  pan: { x: number; y: number };
}

// Video comparison types
export type VideoComparisonMode = 'normal' | 'overlay' | 'split-horizontal' | 'split-vertical';

export interface VideoComparisonState {
  mode: VideoComparisonMode;
  comparisonAssetId?: string;
  comparisonVideoUrl?: string;
  opacity: number; // 0-100 for overlay mode
  isSynced: boolean;
  syncMaster: 'primary' | 'comparison';
  splitRatio: number; // 0.5 = 50/50 split
  primaryVideo: ReviewVideoState;
  comparisonVideo: ReviewVideoState;
}

export interface ComparisonAsset {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
  duration: number;
  frameRate?: number;
  resolution?: {
    width: number;
    height: number;
  };
}

// Comment thread
export interface ReviewCommentThread {
  threadId: string;
  comments: ReviewComment[];
  position: { x: number; y: number };
  assetId: string;
  frameNumber?: number;
  status: ReviewCommentStatus;
  lastActivity: string;
}
