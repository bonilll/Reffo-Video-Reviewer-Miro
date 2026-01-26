"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ComparisonAsset } from "@/types/canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from "react-dropzone";
import { Id } from "@/convex/_generated/dataModel";
import { 
  Play, 
  Search, 
  Clock, 
  Monitor,
  FileVideo,
  CheckCircle,
  X,
  Upload,
  File,
  Loader2,
  FolderOpen
} from "lucide-react";

interface VideoSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (asset: ComparisonAsset) => void;
  currentVideoId?: string; // To exclude current video from selection
  sessionId: string; // Add sessionId to get board assets
  theme?: 'dark' | 'light';
}

export function VideoSelectionModal({
  isOpen,
  onClose,
  onSelectVideo,
  currentVideoId,
  sessionId,
  theme = 'light'
}: VideoSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<ComparisonAsset | null>(null);
  const [activeTab, setActiveTab] = useState("board-assets");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch review session to get board ID
  const session = useQuery(api.review.getReviewSession, {
    sessionId: sessionId as Id<"reviewSessions">
  });

  // Fetch board media (videos and images)
  const boardMedia = useQuery(api.media.getByBoard, 
    session?.boardId ? { boardId: session.boardId } : "skip"
  );

  // Mutation to create media in board
  const createMedia = useMutation(api.media.create);

  const themeClasses = {
    container: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700 text-white' 
      : 'bg-white border-gray-200 text-gray-900',
    card: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
      : 'bg-gray-50 border-gray-200 hover:bg-gray-100',
    input: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700 text-white' 
      : 'bg-gray-100 border-gray-300 text-gray-900',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
    }
  };

  // Filter and process board media
  const filteredAssets: ComparisonAsset[] = (boardMedia || [])
    .filter(media => {
      // Exclude current video
      if (media._id === currentVideoId) return false;
      
      // Filter ONLY video assets for comparison (no images)
      const mediaType = media.type || media.mimeType || '';
      const fileName = media.name.toLowerCase();
      
      // Check by MIME type, file type, or file extension - ONLY VIDEOS
      const isVideo = mediaType.toLowerCase().includes('video') || 
                     fileName.endsWith('.mp4') || 
                     fileName.endsWith('.webm') || 
                     fileName.endsWith('.mov') ||
                     fileName.endsWith('.avi') ||
                     fileName.endsWith('.mkv') ||
                     fileName.endsWith('.m4v');
      
      if (!isVideo) return false;
      
      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return media.name.toLowerCase().includes(query);
      }
      
      return true;
    })
    .sort((a, b) => {
      // Sort by creation time (newest first)
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return timeB - timeA;
    })
    .map(media => ({
      id: media._id,
      name: media.name,
      url: media.url,
      thumbnail: undefined, // Board media doesn't have thumbnails yet
      duration: 0, // No duration in media schema
      frameRate: undefined, // No frameRate in media schema  
      resolution: undefined, // No dimensions in media schema
      type: media.type || media.mimeType || 'unknown',
      size: media.size
    }));

  // Upload handler
  const handleFileUpload = useCallback(async (files: File[]) => {
    if (!session?.boardId || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update progress
        setUploadProgress(Math.round(((i + 0.5) / files.length) * 100));
        
        // Create FormData for upload (using existing upload system)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', `uploads/${session.orgId}/${session.boardId}/${file.name.replace(/\s+/g, '-').toLowerCase()}`);
        formData.append('contentType', file.type);
        formData.append('isPrivate', 'false');
        
        // Upload to MinIO/S3 using existing API
        const uploadResponse = await fetch('/api/upload/file', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Upload failed for ${file.name}: ${errorText}`);
        }
        
        const uploadResult = await uploadResponse.json();
        
        // Validate upload result (matches existing upload system format)
        if (!uploadResult || !uploadResult.success || !uploadResult.url) {
          throw new Error(`Upload succeeded but response invalid for ${file.name}`);
        }
        
        // Create media record in Convex
        await createMedia({
          boardId: session.boardId,
          url: uploadResult.url,
          type: file.type,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          orgId: session.orgId,
          isFromLibrary: false,
        });
        
        // Update progress
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      
      // Switch to board assets tab to show uploaded files
      setActiveTab("board-assets");
      setUploadProgress(0);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [session?.boardId, session?.orgId, createMedia]);

  // Dropzone configuration - Videos only
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileUpload,
    accept: {
      'video/mp4': [],
      'video/webm': [],
      'video/quicktime': [],
      'video/x-msvideo': [], // .avi
      'video/x-matroska': [] // .mkv
    },
    maxSize: 500 * 1024 * 1024, // 500MB max for videos
    multiple: true,
    disabled: isUploading
  });

  const handleSelectAsset = (asset: ComparisonAsset) => {
    setSelectedAsset(asset);
  };

  const handleConfirmSelection = () => {
    if (selectedAsset) {
      onSelectVideo(selectedAsset);
      onClose();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatResolution = (resolution?: { width: number; height: number }) => {
    if (!resolution) return 'Unknown';
    return `${resolution.width}×${resolution.height}`;
  };

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAsset(null);
      setSearchQuery("");
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[70vw] max-w-[70vw] sm:max-w-[70vw] md:max-w-[70vw] lg:max-w-[70vw] xl:max-w-[70vw] h-[90vh] bg-white border-0 shadow-2xl rounded-2xl overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Select Video for Comparison</h1>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab("board-assets")}
                className={`px-4 py-2 rounded ${activeTab === "board-assets" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
              >
                Board Videos ({filteredAssets.length})
              </button>
              <button
                onClick={() => setActiveTab("upload")}
                className={`px-4 py-2 rounded ${activeTab === "upload" ? "bg-green-500 text-white" : "bg-gray-200"}`}
              >
                Upload Video
              </button>
            </div>

            {activeTab === "board-assets" ? (
              <div>
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded mb-4"
                />
                
                {filteredAssets.length === 0 ? (
                  <div className="text-center py-8">
                    <p>No videos found in this board</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset)}
                        className={`border-2 rounded p-4 cursor-pointer ${
                          selectedAsset?.id === asset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                          <Play className="h-8 w-8 text-gray-400" />
                        </div>
                        <h4 className="text-sm font-medium truncate">{asset.name}</h4>
                        {asset.size && (
                          <p className="text-xs text-gray-500">
                            {(asset.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded p-8 text-center">
                <input {...getInputProps()} />
                {isUploading ? (
                  <div>
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p>Uploading... {uploadProgress}%</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg">
                      {isDragActive ? "Drop your videos here!" : "Upload videos"}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Drag & drop video files here, or click to select them
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmSelection}
                disabled={!selectedAsset || isUploading}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Select Video
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}