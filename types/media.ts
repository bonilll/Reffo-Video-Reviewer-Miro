export type MediaType = string;

export interface MediaFile {
  id: string;
  boardId: string;
  url: string;
  type: MediaType;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface UploadState {
  progress: number;
  error?: string;
  file?: File;
}

export interface MediaUploadResult {
  url: string;
  name: string;
  mimeType: string;
  type: MediaType;
  size: number;
  boardId: string;
} 