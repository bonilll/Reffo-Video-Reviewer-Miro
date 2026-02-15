"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

const buildVideoPreviewSeekCandidates = (duration?: number): number[] => {
  if (!Number.isFinite(duration) || (duration ?? 0) <= 0) {
    return [1.2, 2.4, 3.8];
  }
  const safeDuration = duration as number;
  if (safeDuration <= 1) {
    return [Math.max(0.08, safeDuration * 0.45)];
  }
  const rawCandidates = [
    Math.min(Math.max(safeDuration * 0.15, 1.0), safeDuration - 0.08),
    safeDuration * 0.28,
    safeDuration * 0.42,
    safeDuration * 0.58,
    safeDuration * 0.72,
  ];
  return Array.from(
    new Set(
      rawCandidates
        .map((t) => Math.max(0.08, Math.min(safeDuration - 0.08, t)))
        .map((t) => Math.round(t * 100) / 100)
    )
  );
};

export const UploadOverlay = ({ boardId, userRole }: UploadOverlayProps) => {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const { camera } = useCamera();
  const autoSaveToLibrary = false;
  const createMedia = useMutation(api.media.create);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isViewer = userRole === "viewer";
  
  const { handleMediaUploaded, handleFileUploaded } = useMediaUpload({ boardId, camera });
  const canUpload = !isViewer;

  const createVideoPreviewCapture = async (
    file: File
  ): Promise<{ dataUrl?: string; blob?: Blob }> => {
    if (!file.type.startsWith("video/")) return {};

    const objectUrl = URL.createObjectURL(file);
    try {
      const result = await new Promise<{ dataUrl?: string; blob?: Blob }>((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        let seekIndex = 0;
        let candidateTimes: number[] = [];
        let timeoutId: number | null = null;
        let seekScheduled = false;

        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        const finalize = (payload?: { dataUrl?: string; blob?: Blob }) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(payload ?? {});
        };

        const cleanup = () => {
          video.pause();
          video.onloadedmetadata = null;
          video.onloadeddata = null;
          video.onseeked = null;
          video.onerror = null;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
          video.removeAttribute("src");
          video.load();
        };

        const onError = () => {
          finalize({});
        };

        const captureFrame = async (): Promise<{ dataUrl?: string; blob?: Blob; brightness?: number | null }> => {
          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;
          if (width <= 0 || height <= 0) {
            return {};
          }

          const maxDimension = 360;
          const scale = Math.min(maxDimension / width, maxDimension / height, 1);
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return {};
          }

          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          let brightness: number | null = null;
          try {
            const sampleSize = 18;
            const sampleCanvas = document.createElement("canvas");
            sampleCanvas.width = sampleSize;
            sampleCanvas.height = sampleSize;
            const sampleCtx = sampleCanvas.getContext("2d");
            if (sampleCtx) {
              sampleCtx.drawImage(video, 0, 0, sampleSize, sampleSize);
              const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
              let total = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
              }
              brightness = total / (sampleSize * sampleSize);
            }
          } catch {
            brightness = null;
          }

          const dataUrl = canvas.toDataURL("image/jpeg", 0.74);
          const blob = await new Promise<Blob | undefined>((resolveBlob) => {
            canvas.toBlob((value) => resolveBlob(value ?? undefined), "image/jpeg", 0.74);
          });
          return { dataUrl, blob, brightness };
        };

        const seekNextCandidate = () => {
          if (settled || seekScheduled) return;
          if (candidateTimes.length === 0) {
            candidateTimes = buildVideoPreviewSeekCandidates(video.duration);
          }
          const index = Math.max(0, Math.min(seekIndex, candidateTimes.length - 1));
          const targetTime = candidateTimes[index];
          try {
            seekScheduled = true;
            video.currentTime = targetTime;
          } catch {
            finalize({});
          }
        };

        const onCaptureAttempt = async () => {
          seekScheduled = false;
          const frame = await captureFrame();
          if (!frame.dataUrl) {
            finalize({});
            return;
          }

          const looksTooDark = typeof frame.brightness === "number" ? frame.brightness < 18 : false;
          const hasMoreCandidates = seekIndex < candidateTimes.length - 1;

          if (looksTooDark && hasMoreCandidates) {
            seekIndex += 1;
            seekNextCandidate();
            return;
          }

          finalize({ dataUrl: frame.dataUrl, blob: frame.blob });
        };

        video.addEventListener("error", onError, { once: true });
        video.onloadedmetadata = () => {
          candidateTimes = buildVideoPreviewSeekCandidates(video.duration);
          seekNextCandidate();
        };
        video.onloadeddata = () => {
          if (!seekScheduled) {
            seekNextCandidate();
          }
        };
        video.onseeked = () => {
          void onCaptureAttempt();
        };

        timeoutId = window.setTimeout(() => finalize({}), 10000);

        video.src = objectUrl;
      });

      return result;
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
  
  const handleDrop = useCallback(async (files: FileList | File[]) => {
    if (isViewer) {
      toast.error("You don't have permission to upload files.");
      return;
    }
    
    const filesArray = Array.isArray(files) ? files : Array.from(files ?? []);
    if (filesArray.length === 0) return;
    
    // Throttling: processa massimo 2 file contemporaneamente per evitare race conditions
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
        let videoPreviewBlob: Blob | undefined;
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
            const preview = await createVideoPreviewCapture(file);
            previewUrl = preview?.dataUrl;
            videoPreviewBlob = preview?.blob;
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
            let layerPreviewUrl = previewUrl;

            if (isVideo && videoPreviewBlob) {
              try {
                const baseName = (uploadFile.name || "video").replace(/\.[^.]+$/, "");
                const previewFile = new File([videoPreviewBlob], `${baseName}-preview.jpg`, {
                  type: "image/jpeg",
                });
                const previewUpload = await uploadFileMultipart(previewFile, {
                  boardId,
                  context: "board",
                  contextId: boardId,
                  isPrivate: false,
                  autoSaveToLibrary: false,
                  concurrency: 2,
                });
                if (previewUpload.success && previewUpload.url) {
                  layerPreviewUrl = previewUpload.url;
                }
              } catch (previewUploadError) {
                console.warn("⚠️ Video preview upload failed, using local preview fallback:", previewUploadError);
              }
            }

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
            await handleMediaUploaded(mediaType, uploadResult.url, layerPreviewUrl);
            
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
  }, [boardId, createMedia, handleFileUploaded, handleMediaUploaded, isViewer]);
  
  const { isDragging } = useDragDropUpload({
    onDrop: handleDrop,
  });

  useEffect(() => {
    if (!canUpload) return;

    const isEditableElement = (element: Element | null) => {
      if (!element) return false;
      const htmlElement = element as HTMLElement;
      return (
        htmlElement.isContentEditable ||
        htmlElement.hasAttribute("contenteditable") ||
        htmlElement.tagName === "INPUT" ||
        htmlElement.tagName === "TEXTAREA"
      );
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }

      if (imageFiles.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      void handleDrop(imageFiles);
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [canUpload, handleDrop]);
  
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
