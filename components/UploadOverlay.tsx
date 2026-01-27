"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Upload, Image, Video, Check, AlertCircle, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDragDropUpload } from "@/hooks/useDragDropUpload";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { UploadState } from "@/types/media";
import { useCamera } from "@/app/contexts/CameraContext";
import { useBoardSettings } from "@/app/contexts/BoardSettingsContext";
import { uploadFileMultipart } from "@/lib/upload/multipart";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface UploadOverlayProps {
  boardId: string;
  userRole?: string;
}

export const UploadOverlay = ({ boardId, userRole }: UploadOverlayProps) => {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const { camera } = useCamera();
  const { autoSaveToLibrary } = useBoardSettings();
  const createMedia = useMutation(api.media.create);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isViewer = userRole === "viewer";
  
  const { handleMediaUploaded, handleFileUploaded } = useMediaUpload({ boardId, camera });
  const canUpload = !isViewer;
  
  console.log("🎬 UploadOverlay rendered with camera:", camera);
  
  const handleDrop = async (files: FileList) => {
    if (isViewer) {
      toast.error("You don't have permission to upload files.");
      return;
    }
    console.log("📤 UploadOverlay handleDrop called with files:", files.length);
    
    if (!files || files.length === 0) return;
    
    // Throttling: processa massimo 2 file contemporaneamente per evitare race conditions
    const filesArray = Array.from(files);
    const maxConcurrency = 2;
    
    // Funzione per processare un singolo file
    const processFile = async (file: File) => {
      const fileId = `${file.name}-${Date.now()}`;
      
      console.log("📁 Processing file:", file.name, "type:", file.type);
      
      // Aggiungi lo stato di upload iniziale
      setUploads((prev) => ({
        ...prev,
        [fileId]: { progress: 0, file }
      }));
      
      try {
        // Log dello stato del flag autoSaveToLibrary
        console.log("📋 UploadOverlay: autoSaveToLibrary setting:", {
          autoSaveToLibrary: autoSaveToLibrary,
          willSaveToLibrary: autoSaveToLibrary ? "YES - Files will be saved to library" : "NO - Files will only be uploaded to MinIO",
          fileName: file.name
        });
        
        // Nuovo uploader multipart diretto verso MinIO
        const uploadResult = await uploadFileMultipart(file, {
          boardId,
          context: "board",
          contextId: boardId,
          isPrivate: false,
          autoSaveToLibrary,
          onProgress: (p) => {
            console.log(`📊 Upload progress for ${file.name}: ${p}%`);
            setUploads((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], progress: p }
            }));
          }
        });
        
        console.log("✅ Upload completed:", uploadResult);
        
        if (uploadResult.success && uploadResult.url) {
        // Determina il tipo di file
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");
          const fileExtension = file.name.includes(".")
            ? file.name.split(".").pop()!.toLowerCase()
            : file.type.split("/").pop()?.toLowerCase() || "";
          
          if (isImage || isVideo) {
            const mediaType = isImage ? "image" : "video";

            await createMedia({
              boardId: boardId as Id<"boards">,
              url: uploadResult.url,
              type: mediaType,
              name: file.name,
              mimeType: file.type,
              size: file.size,
              isFromLibrary: false,
            });
            
            console.log("🎯 Calling handleMediaUploaded with:", {
              type: mediaType,
              url: uploadResult.url,
              camera: camera
            });
            
            // Aggiungi il media al canvas
            await handleMediaUploaded(mediaType, uploadResult.url);
            
            console.log("🎉 Media added to canvas successfully");
          } else {
            await createMedia({
              boardId: boardId as Id<"boards">,
              url: uploadResult.url,
              type: "file",
              name: file.name,
              mimeType: file.type,
              size: file.size,
              isFromLibrary: false,
            });
            console.log("🎯 Calling handleFileUploaded with:", {
              url: uploadResult.url,
              fileName: file.name,
              fileType: fileExtension || "file",
              fileSize: file.size,
              camera: camera
            });
            
            // Aggiungi il file al canvas
            await handleFileUploaded(uploadResult.url, file.name, fileExtension || "file", file.size);
            
            console.log("🎉 File added to canvas successfully");
          }
        
        // Notifica il completamento
          const successMessage = autoSaveToLibrary 
            ? `${file.name} uploaded and saved to library`
            : `${file.name} uploaded (not saved to library)`;
          toast.success(successMessage);
        } else {
          throw new Error((uploadResult as any).error || "Upload failed");
        }
        
        // Rimuovi lo stato dopo il completamento
        setUploads((prev) => {
          const { [fileId]: _, ...rest } = prev;
          return rest;
        });
        
      } catch (error) {
        console.error("❌ Error uploading file:", error);
        toast.error(`Error uploading ${file.name}`);
        
        // Rimuovi lo stato in caso di errore
        setUploads((prev) => {
          const { [fileId]: _, ...rest } = prev;
          return rest;
        });
      }
    };
    
    // Throttling system: processa i file con concorrenza limitata (semaforo pattern)
    const processFilesWithThrottling = async (files: File[]) => {
      let runningCount = 0;
      const fileQueue = [...files];
      const promises: Promise<void>[] = [];
      
      const processNext = async (): Promise<void> => {
        while (fileQueue.length > 0 && runningCount < maxConcurrency) {
          const file = fileQueue.shift();
          if (!file) break;
          
          runningCount++;
          const promise = processFile(file).finally(() => {
            runningCount--;
          });
          promises.push(promise);
          
          // Non aspettare qui, continua a processare altri file
          promise.then(() => processNext()).catch(() => processNext());
        }
      };
      
      // Inizia il processing
      await processNext();
      
      // Aspetta che tutti i file completino
      await Promise.all(promises);
    };
    
    // Avvia il processing con throttling
    console.log(`📋 Starting throttled upload of ${filesArray.length} files (max concurrency: ${maxConcurrency})`);
    await processFilesWithThrottling(filesArray);
    console.log(`✅ All ${filesArray.length} files processed`);
  };
  
  const { isDragging } = useDragDropUpload({
    onDrop: handleDrop,
  });
  
  useEffect(() => {
    const handleOpenPicker = () => fileInputRef.current?.click();
    window.addEventListener("board-upload-open", handleOpenPicker as EventListener);
    return () => {
      window.removeEventListener("board-upload-open", handleOpenPicker as EventListener);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        disabled={!canUpload}
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            handleDrop(files);
          }
          event.target.value = "";
        }}
      />
      {/* Drag overlay - Modern glassmorphism design */}
      {canUpload && isDragging && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center pointer-events-none">
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 max-w-lg mx-4 transform-gpu">
            {/* Gradient background overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white/60 to-purple-50/80 rounded-3xl" />
            
            {/* Animated border glow */}
            <div className="absolute -inset-px bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-blue-500/30 rounded-3xl blur-sm animate-pulse" />
            
            <div className="relative z-10 text-center">
              {/* Modern upload icon with gradient */}
              <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-6 mx-auto mb-6 w-20 h-20 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Upload className="w-10 h-10 text-white drop-shadow-sm" />
                
                {/* Floating animation dots */}
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-bounce" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150" />
              </div>
              
              <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
                Drop to Upload
              </h3>
              <p className="text-gray-600 text-lg font-medium mb-4">
                Files will be placed at the center of your view
              </p>
              
              {/* Supported formats indicator */}
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200/60">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Image className="w-4 h-4" />
                  <span>Images</span>
                </div>
                <div className="w-1 h-1 bg-gray-300 rounded-full" />
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Video className="w-4 h-4" />
                  <span>Videos</span>
                </div>
                <div className="w-1 h-1 bg-gray-300 rounded-full" />
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FileText className="w-4 h-4" />
                  <span>Files</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        
      {/* Upload progress overlay - Modern cards */}
      {Object.keys(uploads).length > 0 && (
        <div className="absolute top-6 right-6 space-y-3 pointer-events-none">
          {Object.entries(uploads).map(([fileId, upload]) => (
            <div key={fileId} className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white/20 max-w-sm transform-gpu">
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-gray-50/40 rounded-2xl" />
              
              <div className="relative z-10 flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {upload.file.type.startsWith("image/") ? (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                      <Image className="w-5 h-5 text-white" />
                    </div>
                  ) : upload.file.type.startsWith("video/") ? (
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                      <Video className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                    {upload.file.name}
                  </p>
                  
                  {/* Progress bar with modern design */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200/80 rounded-full h-2.5 shadow-inner">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2.5 rounded-full transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    
                    {/* Progress percentage with status */}
                    <div className="flex items-center gap-1">
                      {upload.progress === 100 ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : upload.progress > 0 ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="text-xs font-medium text-gray-600 min-w-[3ch]">
                        {upload.progress}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 
