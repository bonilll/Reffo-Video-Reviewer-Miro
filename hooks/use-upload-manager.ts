"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth, useUser } from "@clerk/nextjs";
import { uploadFileInChunks, ChunkUploadProgress } from "@/lib/chunked-uploader";
import { extractDominantColorFromUrl, extractTopDominantColorsFromUrl } from "@/utils/dominantColor";
import { uploadReferences, type UploadItem, type UploadedReference } from "@/lib/upload-service";
import { usePlanLimits } from "./use-plan-limits";

interface ReferenceMetadata {
  title: string;
  author?: string;
  tokens: string[];
  externalLink: string;
  additionalLinks?: string[];
  isPrivate?: boolean;
  description?: string;
  dominantColors?: string[];
}

interface ReferenceFile {
  id: string;
  file: File;
  preview: string;
  metadata: ReferenceMetadata;
}

// Estendiamo l'interfaccia per includere il progresso
interface ReferenceFileWithProgress extends ReferenceFile {
  progress?: {
    progress: number;
    status: 'pending' | 'completed' | 'error';
    error?: string;
    fileUrl?: string;
    currentChunk?: number;
    totalChunks?: number;
  };
}

interface UploadManagerState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  showUpgradePrompt: boolean;
  upgradePromptData: {
    limitType: string;
    limitValue?: string;
  };
}

interface UseUploadManagerProps {
  orgId?: string;
  userId?: string;
}

export function useUploadManager({ orgId, userId: propUserId }: UseUploadManagerProps) {
  const router = useRouter();
  const { userId: authUserId } = useAuth();
  const { user } = useUser();
  const { userPlan } = usePlanLimits();
  const userId = propUserId || authUserId;
  const [files, setFiles] = useState<ReferenceFileWithProgress[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [state, setState] = useState<UploadManagerState>({
    isUploading: false,
    progress: 0,
    error: null,
    showUpgradePrompt: false,
    upgradePromptData: {
      limitType: "",
      limitValue: "",
    },
  });
  const [uploadResults, setUploadResults] = useState<any[]>([]);

  // Aggiungi nuovi file
  const addFiles = useCallback(async (newFiles: File[]) => {
    setUploadErrors([]);
    
    const newReferenceFiles = await Promise.all(newFiles.map(async (file) => {
      const id = Math.random().toString(36).substring(2, 9);
      const preview = typeof window !== 'undefined' ? URL.createObjectURL(file) : '';
      
      // Estrai il nome del file senza estensione per il titolo predefinito
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      
      // Extract dominant colors if it's an image
      let dominantColors: string[] | undefined = undefined;
      if (file.type.startsWith('image/')) {
        try {
          // Extract top 2 most dominant colors that aren't black or white
          dominantColors = await extractTopDominantColorsFromUrl(preview);
        } catch (error) {
          console.error(`Failed to extract dominant colors for ${file.name}:`, error);
        }
      }
      
      return {
        id,
        file,
        preview,
        metadata: {
          title: fileName,
          author: undefined,
          tokens: [],
          externalLink: "",
          isPrivate: false,
          description: "",
          dominantColors
        }
      };
    }));
    
    setFiles((prevFiles) => [...prevFiles, ...newReferenceFiles]);
  }, []);

  // Rimuovi un file
  const removeFile = useCallback((id: string) => {
    setFiles((prevFiles) => {
      const fileToRemove = prevFiles.find((f) => f.id === id);
      if (fileToRemove && typeof window !== 'undefined') {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prevFiles.filter((f) => f.id !== id);
    });
  }, []);

  // Aggiorna i metadati di un file
  const updateFileMetadata = useCallback((id: string, metadata: ReferenceMetadata) => {
    setFiles((prevFiles) =>
      prevFiles.map((file) =>
        file.id === id ? { ...file, metadata } : file
      )
    );
  }, []);

  // Aggiorna il progresso di un file
  const updateFileProgress = useCallback((id: string, progress: any) => {
    setFiles((prevFiles) =>
      prevFiles.map((file) =>
        file.id === id ? { ...file, progress } : file
      )
    );
  }, []);

  // Valida i file prima del salvataggio
  const validateFiles = useCallback(() => {
    const errors: string[] = [];
    
    if (files.length === 0) {
      errors.push("No files to save");
      return errors;
    }
    
    files.forEach((file, index) => {
      if (!file.metadata.title.trim()) {
        errors.push(`File #${index + 1} has no title`);
      }
      
      // Author is now optional - no validation needed
    });
    
    return errors;
  }, [files]);

  // Salva tutti i file
  const saveFiles = useCallback(async () => {
    if (!userId) {
      toast.error("User not authenticated");
      throw new Error("User not authenticated");
    }

    // Additional debug logs

    const validationErrors = validateFiles();
    if (validationErrors.length > 0) {
      setUploadErrors(validationErrors);
      toast.error(validationErrors[0]);
      throw new Error(validationErrors[0]);
    }
    
    setState(prev => ({ 
      ...prev, 
      isUploading: true, 
      progress: 0, 
      error: null 
    }));

    try {
      // Carica i file uno alla volta usando il sistema di upload a pezzi
      const results = [];
      const errors = [];
      
      for (const file of files) {
        try {
          // Inizializza il progresso allo 0% per il file corrente
          updateFileProgress(file.id, {
            progress: 0,
            status: "pending"
          });
          
          // Controlla la dimensione del file
          if (file.file.size > 100 * 1024 * 1024) { // 100MB
            const errorMessage = `File "${file.metadata.title}" è troppo grande (${(file.file.size / (1024 * 1024)).toFixed(2)}MB). Il limite è 100MB.`;
            updateFileProgress(file.id, {
              progress: 0,
              status: "error",
              error: errorMessage
            });
            errors.push(errorMessage);
            continue;
          }
          
          // Prepara i metadati per l'upload
          const metadata = {
            title: file.metadata.title,
            author: file.metadata.author || undefined,
            externalLink: file.metadata.externalLink || "",
            tokens: file.metadata.tokens,
            orgId: orgId || "",
            isPrivate: file.metadata.isPrivate || false,
            description: file.metadata.description || "",
            dominantColors: file.metadata.dominantColors || []
          };
          
          // Debug log for metadata
          
          // Carica il file a pezzi
          const result = await uploadFileInChunks(
            file.file,
            metadata,
            (progress: ChunkUploadProgress) => {
              // Aggiorna lo stato del progresso
              updateFileProgress(file.id, {
                progress: progress.progress,
                status: "pending",
                currentChunk: progress.currentChunk,
                totalChunks: progress.totalChunks
              });
            }
          );
          
          if (!result.success) {
            // Gestisci l'errore
            updateFileProgress(file.id, {
              progress: 0,
              status: "error",
              error: result.error
            });
            
            errors.push(`Error file "${file.metadata.title}": ${result.error}`);
            console.error("Upload error:", result.error);
            continue;
          }
          
          // Aggiorna lo stato del file con il successo
          updateFileProgress(file.id, {
            progress: 100,
            status: "completed",
            fileUrl: result.fileUrl || ""
          });
          
          results.push(result);
          
        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message 
            : "Unknown error during upload";
          
          // Check if it's a storage limit error
          if (error instanceof Error) {
            if (error.message.includes("File troppo grande")) {
              showUpgradePrompt("file_too_large");
              setState(prev => ({ 
                ...prev, 
                isUploading: false, 
                error: errorMessage 
              }));
              return false;
            } else if (error.message.includes("Limite di storage raggiunto")) {
              showUpgradePrompt("storage_limit_exceeded");
              setState(prev => ({ 
                ...prev, 
                isUploading: false, 
                error: errorMessage 
              }));
              return false;
            }
          }
          
          errors.push(`Error file "${file.metadata.title}": ${errorMessage}`);
          
          // Aggiorna lo stato del file con l'errore
          updateFileProgress(file.id, {
            progress: 0,
            status: "error",
            error: errorMessage
          });
          
          console.error("Upload error:", error);
        }
      }
      
      // Aggiorna lo stato con i risultati e gli errori
      setUploadResults(results);
      
      if (errors.length > 0) {
        setUploadErrors(errors);
        if (results.length > 0) {
          // Alcuni file sono stati caricati con successo
          toast.warning(`Uploaded ${results.length} of ${files.length} files. Check errors.`);
        } else {
          // Nessun file caricato con successo
          toast.error(errors[0]);
          throw new Error(errors[0]);
        }
      } else {
        // Tutti i file sono stati caricati con successo
        toast.success(`Successfully uploaded ${results.length} files`);
      }
      
      // Manteniamo i file nello stato per mostrare il progresso completato
      // Li rimuoveremo solo quando l'utente navigherà via
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error during upload";
      if (uploadErrors.length === 0) {
        setUploadErrors([errorMessage]);
      }
      throw error;
    } finally {
      setState(prev => ({ 
        ...prev, 
        isUploading: false, 
        progress: 100 
      }));
    }
  }, [files, orgId, updateFileProgress, validateFiles, userId]);

  const showUpgradePrompt = useCallback((limitType: string, limitValue?: string) => {
    setState(prev => ({
      ...prev,
      showUpgradePrompt: true,
      upgradePromptData: {
        limitType,
        limitValue,
      },
    }));
  }, []);

  const hideUpgradePrompt = useCallback(() => {
    setState(prev => ({
      ...prev,
      showUpgradePrompt: false,
      upgradePromptData: {
        limitType: "",
        limitValue: "",
      },
    }));
  }, []);

  const uploadFiles = useCallback(async (
    files: ReferenceFile[], 
    onProgress?: (progress: number) => void,
    onComplete?: (results: UploadedReference[]) => void
  ) => {
    if (!user?.id) {
      toast.error("You must be logged in to upload files");
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isUploading: true, 
      progress: 0, 
      error: null 
    }));

    try {
      // Convert files to upload items
      const uploadItems: UploadItem[] = files.map(file => ({
        id: file.id,
        file: file.file,
        metadata: {
          title: file.metadata.title,
          author: file.metadata.author,
          externalLink: file.metadata.externalLink,
          tokens: file.metadata.tokens,
        },
      }));

      // Start upload process
      const results = await uploadReferences(uploadItems, user.id);
      
      setState(prev => ({ 
        ...prev, 
        isUploading: false, 
        progress: 100 
      }));

      toast.success(`Successfully uploaded ${results.length} file${results.length > 1 ? 's' : ''}`);
      
      if (onComplete) {
        onComplete(results);
      }

      return results;
    } catch (error) {
      console.error("Upload error:", error);
      
      setState(prev => ({ 
        ...prev, 
        isUploading: false, 
        error: error instanceof Error ? error.message : "Upload failed" 
      }));

      // Check if it's a storage limit error
      if (error instanceof Error) {
        if (error.message.includes("File troppo grande")) {
          showUpgradePrompt("file_too_large");
          return;
        } else if (error.message.includes("Limite di storage raggiunto")) {
          showUpgradePrompt("storage_limit_exceeded");
          return;
        }
      }

      // Show generic error toast for other errors
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }, [user?.id, showUpgradePrompt]);

  const resetState = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      showUpgradePrompt: false,
      upgradePromptData: {
        limitType: "",
        limitValue: "",
      },
    });
  }, []);

  return {
    files,
    uploadErrors,
    ...state,
    userPlan,
    uploadFiles,
    showUpgradePrompt,
    hideUpgradePrompt,
    resetState,
    addFiles,
    removeFile,
    updateFileMetadata,
    validateFiles,
    saveFiles
  };
}