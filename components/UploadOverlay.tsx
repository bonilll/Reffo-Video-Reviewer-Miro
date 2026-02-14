"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Upload, Image, Video, Check, AlertCircle, FileText, FileJson, FileType } from "lucide-react";

import { useDragDropUpload } from "@/hooks/useDragDropUpload";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { UploadState } from "@/types/media";
import { useCamera } from "@/app/contexts/CameraContext";
import { uploadFileMultipart } from "@/lib/upload/multipart";
import { compressImageFile, isCompressibleImage, createImagePreviewDataUrl } from "@/lib/upload/imageCompression";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface UploadOverlayProps {
  boardId: string;
  userRole?: string;
}

export const UploadOverlay = ({ boardId, userRole }: UploadOverlayProps) => {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const { camera } = useCamera();
  const autoSaveToLibrary = false;
  const createMedia = useMutation(api.media.create);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isViewer = userRole === "viewer";
  
  const { handleMediaUploaded, handleFileUploaded } = useMediaUpload({ boardId, camera });
  const canUpload = !isViewer;

  const createVideoPreviewDataUrl = async (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith("video/")) return undefined;

    const objectUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await new Promise<string | undefined>((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        const cleanup = () => {
          video.removeAttribute("src");
          video.load();
        };

        const onError = () => {
          cleanup();
          resolve(undefined);
        };

        const onLoadedData = () => {
          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;
          if (width <= 0 || height <= 0) {
            cleanup();
            resolve(undefined);
            return;
          }

          const maxDimension = 320;
          const scale = Math.min(maxDimension / width, maxDimension / height, 1);
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            resolve(undefined);
            return;
          }

          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const preview = canvas.toDataURL("image/jpeg", 0.72);
          cleanup();
          resolve(preview);
        };

        video.addEventListener("error", onError, { once: true });
        video.addEventListener(
          "loadedmetadata",
          () => {
            const trySeek = () => {
              const targetTime = Number.isFinite(video.duration) && video.duration > 1 ? 0.5 : 0;
              try {
                video.currentTime = targetTime;
              } catch {
                // Some browsers may block seek before enough data is available.
              }
            };
            trySeek();
          },
          { once: true },
        );
        video.addEventListener("seeked", onLoadedData, { once: true });
        video.addEventListener("loadeddata", onLoadedData, { once: true });

        video.src = objectUrl;
      });

      return dataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  

  const getFileCategory = (file: File) => {
    const type = file.type?.toLowerCase() ?? "";
    const name = file.name.toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (type === "application/json" || name.endsWith(".json")) return "json";
    return "file";
  };
  
  const handleDrop = async (files: FileList) => {
    if (isViewer) {
      toast.error("You don't have permission to upload files.");
      return;
    }
    
    if (!files || files.length === 0) return;
    
    // Throttling: processa massimo 2 file contemporaneamente per evitare race conditions
    const filesArray = Array.from(files);
    const maxConcurrency = 2;
    
    // Funzione per processare un singolo file
    const processFile = async (file: File) => {
      const fileId = `${file.name}-${Date.now()}`;
      const displayName = file.name;
      
      
      // Aggiungi lo stato di upload iniziale
      setUploads((prev) => ({
        ...prev,
        [fileId]: {
          progress: 0,
          file,
          stage: "preparing",
          displayName,
          meta: { wasCompressed: false },
        }
      }));
      
      try {
        let uploadFile = file;
        let previewUrl: string | undefined;
        let compressionMeta: UploadState["meta"] = { wasCompressed: false };

        if (isCompressibleImage(file)) {
          try {
            const result = await compressImageFile(file, { maxDimension: 3072, quality: 0.5 });
            uploadFile = result.file;
            compressionMeta = {
              wasCompressed: true,
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              outputType: result.outputType,
            };
          } catch (compressionError) {
            console.warn("⚠️ Image compression failed, uploading original:", compressionError);
            compressionMeta = { wasCompressed: false };
          }

          try {
            const preview = await createImagePreviewDataUrl(uploadFile, { maxDimension: 256, quality: 0.5 });
            previewUrl = preview.dataUrl;
          } catch (previewError) {
            console.warn("⚠️ Preview generation failed:", previewError);
          }
        } else if (file.type.startsWith("video/")) {
          try {
            previewUrl = await createVideoPreviewDataUrl(file);
          } catch (previewError) {
            console.warn("⚠️ Video preview generation failed:", previewError);
          }
        }

        setUploads((prev) => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            file: uploadFile,
            stage: "uploading",
            meta: compressionMeta,
          }
        }));

        // Nuovo uploader multipart diretto verso MinIO
        const uploadResult = await uploadFileMultipart(uploadFile, {
          boardId,
          context: "board",
          contextId: boardId,
          isPrivate: false,
          autoSaveToLibrary: false,
          onProgress: (p) => {
            setUploads((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], progress: p }
            }));
          }
        });
        
        
        if (uploadResult.success && uploadResult.url) {
        // Determina il tipo di file
          const isImage = uploadFile.type.startsWith("image/");
          const isVideo = uploadFile.type.startsWith("video/");
          const fileExtension = file.name.includes(".")
            ? file.name.split(".").pop()!.toLowerCase()
            : file.type.split("/").pop()?.toLowerCase() || "";
          
          if (isImage || isVideo) {
            const mediaType = isImage ? "image" : "video";

            await createMedia({
              boardId: boardId as Id<"boards">,
              url: uploadResult.url,
              type: mediaType,
              name: uploadFile.name,
              mimeType: uploadFile.type,
              size: uploadFile.size,
              isFromLibrary: false,
            });
            
            
            // Aggiungi il media al canvas
            await handleMediaUploaded(mediaType, uploadResult.url, previewUrl);
            
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
            
            // Aggiungi il file al canvas
            await handleFileUploaded(uploadResult.url, file.name, fileExtension || "file", file.size);
            
          }
        
        // Notifica il completamento
          const successMessage = `${file.name} uploaded`;
          setUploads((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], stage: "done", progress: 100 }
          }));
          toast.success(successMessage);
        } else {
          throw new Error((uploadResult as any).error || "Upload failed");
        }
        
        // Rimuovi lo stato dopo il completamento
        setTimeout(() => {
          setUploads((prev) => {
            const { [fileId]: _, ...rest } = prev;
            return rest;
          });
        }, 1200);
        
      } catch (error) {
        console.error("❌ Error uploading file:", error);
        setUploads((prev) => ({
          ...prev,
          [fileId]: { ...prev[fileId], stage: "error", error: "Upload failed" }
        }));
        toast.error(`Error uploading ${file.name}`);
        
        // Rimuovi lo stato in caso di errore
        setTimeout(() => {
          setUploads((prev) => {
            const { [fileId]: _, ...rest } = prev;
            return rest;
          });
        }, 1500);
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
    await processFilesWithThrottling(filesArray);
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
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl p-7 shadow-2xl border border-white/40 max-w-xl mx-4">
            <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.06),_transparent_65%)]" />
            <div className="relative z-10 flex items-center gap-6">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-black shadow-lg shadow-black/25">
                <Upload className="h-8 w-8 text-white" />
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-white shadow" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Drop to add</p>
                <h3 className="text-2xl font-semibold text-slate-900">Rilascia per caricare</h3>
                <p className="text-sm text-slate-500 mt-1">
                  I file verranno posizionati al centro della tua vista.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <Image className="h-3.5 w-3.5" />
                    Images
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <Video className="h-3.5 w-3.5" />
                    Videos
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <FileText className="h-3.5 w-3.5" />
                    Files
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <FileJson className="h-3.5 w-3.5" />
                    JSON
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <FileType className="h-3.5 w-3.5" />
                    PDF
                  </span>
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
            <div key={fileId} className="relative bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white/30 max-w-sm transform-gpu">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 via-white/50 to-slate-50/70" />
              
              <div className="relative z-10 flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {(() => {
                    const category = upload.file ? getFileCategory(upload.file) : "file";
                    if (category === "image") {
                      return (
                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                          <Image className="w-5 h-5 text-white" />
                        </div>
                      );
                    }
                    if (category === "video") {
                      return (
                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                      );
                    }
                    if (category === "json") {
                      return (
                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                          <FileJson className="w-5 h-5 text-white" />
                        </div>
                      );
                    }
                    if (category === "pdf") {
                      return (
                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                          <FileType className="w-5 h-5 text-white" />
                        </div>
                      );
                    }
                    return (
                      <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                    );
                  })()}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                    {upload.displayName || upload.file?.name}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 mb-2">
                    {upload.stage === "preparing" && "Ottimizzazione in corso…"}
                    {upload.stage === "uploading" && "Caricamento…"}
                    {upload.stage === "processing" && "Elaborazione…"}
                    {upload.stage === "done" && "Completato"}
                    {upload.stage === "error" && "Errore"}
                  </div>
                  
                  {/* Progress bar with modern design */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200/80 rounded-full h-2.5 shadow-inner">
                      <div 
                        className="bg-gradient-to-r from-slate-700 to-slate-600 h-2.5 rounded-full transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    
                    {/* Progress percentage with status */}
                    <div className="flex items-center gap-1">
                      {upload.stage === "done" || upload.progress === 100 ? (
                        <Check className="w-4 h-4 text-slate-700" />
                      ) : upload.stage === "uploading" ? (
                        <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      ) : upload.stage === "preparing" ? (
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-slate-500" />
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
