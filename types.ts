export interface Point {
  x: number;
  y: number;
}

export interface PointerPosition {
  canvas: Point;
  normalized: Point;
}

export enum AnnotationTool {
  SELECT = 'select',
  FREEHAND = 'freehand',
  RECTANGLE = 'rectangle',
  ELLIPSE = 'ellipse',
  ARROW = 'arrow',
  TEXT = 'text',
  COMMENT = 'comment',
  IMAGE = 'image',
}

export interface BaseAnnotation {
  id: string;
  videoId: string;
  authorId: string;
  frame: number;
  color: string;
  lineWidth: number;
  createdAt: string;
}

export interface FreehandAnnotation extends BaseAnnotation {
  type: AnnotationTool.FREEHAND;
  points: Point[];
}

export interface RectangleAnnotation extends BaseAnnotation {
  type: AnnotationTool.RECTANGLE;
  center: Point;
  width: number;
  height: number;
  rotation: number; // in radians
}

export interface ImageAnnotation extends BaseAnnotation {
  type: AnnotationTool.IMAGE;
  src: string;
  center: Point;
  width: number; // normalized
  height: number; // normalized
  rotation: number; // in radians
}

export interface EllipseAnnotation extends BaseAnnotation {
  type: AnnotationTool.ELLIPSE;
  center: Point;
  width: number;
  height: number;
  rotation: number; // in radians
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: AnnotationTool.ARROW;
  start: Point;
  end: Point;
}

export interface TextAnnotation extends BaseAnnotation {
  type: AnnotationTool.TEXT;
  position: Point;
  text: string;
  fontSize: number;
}

export type Annotation = FreehandAnnotation | RectangleAnnotation | EllipseAnnotation | ArrowAnnotation | TextAnnotation | ImageAnnotation;

export interface Comment {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  parentId?: string;
  text: string;
  frame?: number;
  resolved: boolean;
  createdAt: string;
  position?: Point;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Video {
  id: string;
  title: string;
  src: string;
  storageKey?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  projectId?: string;
  uploadedAt: string;
  lastReviewedAt?: string;
}

export interface VideoFrameData {
  presentedFrames: number;
  mediaTime: number;
}
