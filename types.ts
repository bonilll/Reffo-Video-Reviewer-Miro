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
  VIDEO = 'video',
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
  storageKey?: string;
  originalWidth?: number;
  originalHeight?: number;
  byteSize?: number;
  mimeType?: string;
}

export interface VideoAnnotation extends BaseAnnotation {
  type: AnnotationTool.VIDEO;
  src: string;
  center: Point;
  width: number;
  height: number;
  rotation: number;
  storageKey?: string;
  originalWidth?: number;
  originalHeight?: number;
  byteSize?: number;
  mimeType?: string;
  duration?: number;
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

export type Annotation = FreehandAnnotation | RectangleAnnotation | EllipseAnnotation | ArrowAnnotation | TextAnnotation | ImageAnnotation | VideoAnnotation;

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
  thumbnailUrl?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  projectId?: string;
  uploadedAt: string;
  lastReviewedAt?: string;
}

export interface ShareGroupMember {
  id: string;
  email: string;
  userId?: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'pending';
  invitedAt: string;
  acceptedAt?: string | null;
}

export interface ShareGroup {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  members: ShareGroupMember[];
}

export interface ContentShare {
  id: string;
  videoId?: string | null;
  projectId?: string | null;
  groupId?: string | null;
  linkToken?: string | null;
  allowDownload: boolean;
  allowComments: boolean;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

export interface UserSettings {
  id: string;
  notifications: {
    reviewUpdates: boolean;
    commentMentions: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    loginAlerts: boolean;
    backupEmail?: string | null;
  };
  workspace: {
    defaultProjectId?: string | null;
    autoShareGroupIds: string[];
    theme: 'light' | 'dark' | 'system';
  };
  integrations: {
    slackWebhook?: string | null;
    notionWorkspaceUrl?: string | null;
    frameIoAccount?: string | null;
  };
  billing: {
    plan: string;
    seats: number;
    renewalDate: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VideoFrameData {
  presentedFrames: number;
  mediaTime: number;
}
