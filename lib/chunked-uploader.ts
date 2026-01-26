"use client";

/**
 * Utility per il caricamento di file a pezzi (chunked uploads)
 * Questa implementazione permette di superare i limiti di dimensione dei file
 * suddividendo i file in pezzi più piccoli e caricandoli uno alla volta.
 */

// Dimensione di ciascun chunk in bytes (4MB per migliore performance con file grandi)
const CHUNK_SIZE = 4 * 1024 * 1024;

export interface ChunkUploadProgress {
  currentChunk: number;
  totalChunks: number;
  progress: number; // 0-100
}

export interface ChunkUploadResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
  id?: string;
  assetId?: string;
}

/**
 * Ottiene l'ID dell'utente autenticato dal server
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    // Usa l'API Clerk dedicata per ottenere l'ID utente
    const response = await fetch('/api/auth/clerk-user');
    
    if (response.ok) {
      const data = await response.json();
      
      if (!data.error && data.userId) {
        console.log('Utente autenticato via Clerk API:', data.userId);
        return data.userId;
      }
    }
    
    console.warn('Nessun utente autenticato trovato, sarà usato "anonymous"');
    return null;
  } catch (error) {
    console.error('Errore durante il recupero dell\'ID utente:', error);
    return null;
  }
}

/**
 * Carica un file suddividendolo in pezzi
 */
export async function uploadFileInChunks(
  file: File,
  metadata: Record<string, any>,
  onProgress?: (progress: ChunkUploadProgress) => void
): Promise<ChunkUploadResult> {
  try {
    console.log("[CHUNKED UPLOAD] Starting upload with chunked uploader...");
    
    // Ottieni l'ID utente autenticato
    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId) {
      console.warn('[CHUNKED UPLOAD] ID utente non disponibile, l\'upload potrebbe utilizzare il percorso "anonymous"');
    } else {
      console.log(`[CHUNKED UPLOAD] Upload per utente autenticato: ${authenticatedUserId}`);
    }
    
    // Aggiungi l'ID utente autenticato ai metadati
    const enhancedMetadata: Record<string, any> = {
      ...metadata,
      userId: authenticatedUserId || 'anonymous'
    };
    
    console.log("[CHUNKED UPLOAD] Enhanced metadata:", enhancedMetadata);
    
    // Calcola il numero totale di pezzi
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // Crea l'ID univoco per questa sessione di caricamento
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    let finalResult: ChunkUploadResult | null = null;
    
    // Carica ciascun pezzo sequenzialmente
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);
      
      // Crea FormData per questo pezzo
      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("fileName", file.name);
      formData.append("contentType", file.type);
      formData.append("sessionId", sessionId);
      formData.append("chunkIndex", chunkIndex.toString());
      formData.append("totalChunks", totalChunks.toString());
      
      // Per l'ultimo pezzo, aggiungi i metadati
      if (chunkIndex === totalChunks - 1) {
        formData.append("isLastChunk", "true");
        
        // Handle autoSaveToLibrary explicitly FIRST
        const shouldSaveToLibrary = enhancedMetadata.autoSaveToLibrary !== undefined 
          ? enhancedMetadata.autoSaveToLibrary 
          : true; // Default to true if not specified
        
        formData.append("autoSaveToLibrary", shouldSaveToLibrary ? "true" : "false");
        console.log("[CHUNKED UPLOAD] Setting autoSaveToLibrary explicitly:", shouldSaveToLibrary);
        
        // Only set createAsset to true if we should save to library
        formData.append("createAsset", shouldSaveToLibrary ? "true" : "false");
        console.log("[CHUNKED UPLOAD] Setting createAsset based on autoSaveToLibrary:", shouldSaveToLibrary);
        
        // Aggiungi tutti i metadati per il file, incluso l'userId autenticato
        Object.entries(enhancedMetadata).forEach(([key, value]) => {
          if (key === 'autoSaveToLibrary') {
            // Already handled above - skip to avoid overriding
            return;
          } else if (key === 'tokens' && Array.isArray(value)) {
            // Handle tokens array specially to ensure it's properly formatted
            formData.append("tokensJson", JSON.stringify(value));
          } else if (key === 'dominantColors' && Array.isArray(value)) {
            // Handle dominantColors array specially
            formData.append("dominantColors", JSON.stringify(value));
            console.log("[CHUNKED UPLOAD] Setting dominantColors explicitly:", value);
          } else if (key === 'isPrivate') {
            // Handle isPrivate boolean specially
            formData.append("isPrivate", value ? "true" : "false");
          } else if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
          } else if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        });
        
        // Make sure we explicitly add title, externalLink, and isPrivate fields
        if (enhancedMetadata.title) {
          formData.append("title", enhancedMetadata.title.toString());
          console.log("[CHUNKED UPLOAD] Setting title explicitly:", enhancedMetadata.title);
        }
        
        if (enhancedMetadata.externalLink !== undefined) {
          formData.append("externalLink", enhancedMetadata.externalLink.toString());
          console.log("[CHUNKED UPLOAD] Setting externalLink explicitly:", enhancedMetadata.externalLink);
        }
        
        if (enhancedMetadata.isPrivate !== undefined) {
          formData.append("isPrivate", enhancedMetadata.isPrivate ? "true" : "false");
          console.log("[CHUNKED UPLOAD] Setting isPrivate explicitly:", enhancedMetadata.isPrivate);
        }
        
        // Add boardId explicitly with higher priority
        if (enhancedMetadata.projectId || enhancedMetadata.boardId) {
          const boardId = enhancedMetadata.boardId || enhancedMetadata.projectId;
          formData.append("boardId", boardId.toString());
          console.log(`[CHUNKED UPLOAD] Setting boardId explicitly: ${boardId}`);
        } else {
          formData.append("boardId", "none"); // Default value
          console.log("[CHUNKED UPLOAD] No boardId available, using default 'none'");
        }
        
        console.log("[CHUNKED UPLOAD] Final chunk flags:", {
          autoSaveToLibrary: shouldSaveToLibrary,
          createAsset: shouldSaveToLibrary,
          isLastChunk: true,
          hasTokens: Array.isArray((enhancedMetadata as any).tokens),
          tokensCount: Array.isArray((enhancedMetadata as any).tokens) ? (enhancedMetadata as any).tokens.length : 0,
          hasDominantColors: Array.isArray((enhancedMetadata as any).dominantColors),
          dominantColorsCount: Array.isArray((enhancedMetadata as any).dominantColors) ? (enhancedMetadata as any).dominantColors.length : 0,
          userId: enhancedMetadata.userId || 'missing',
          boardId: formData.get("boardId")
        });
      } else {
        formData.append("isLastChunk", "false");
      }
      
      // Aggiorna il progresso
      if (onProgress) {
        onProgress({
          currentChunk: chunkIndex + 1,
          totalChunks,
          progress: Math.round(((chunkIndex + 1) / totalChunks) * 100)
        });
      }
      
      console.log(`[CHUNKED UPLOAD] Uploading chunk ${chunkIndex + 1}/${totalChunks}`);
      
      // Carica il pezzo con timeout progressivo basato sulla dimensione del file
      const isProduction = process.env.NODE_ENV === 'production';
      
      // Calcola timeout progressivo in base alla dimensione del file
      const fileSizeMB = file.size / (1024 * 1024);
      let baseTimeout = 30000; // 30s base
      
      if (fileSizeMB > 50) {
        baseTimeout = 60000; // 60s per file > 50MB
      }
      if (fileSizeMB > 100) {
        baseTimeout = 90000; // 90s per file > 100MB
      }
      if (fileSizeMB > 200) {
        baseTimeout = 120000; // 120s per file > 200MB
      }
      
      const uploadTimeout = isProduction ? baseTimeout * 1.5 : baseTimeout; // 1.5x in produzione per maggiore sicurezza
      
      console.log(`[CHUNKED UPLOAD] Using timeout: ${uploadTimeout}ms for ${fileSizeMB.toFixed(1)}MB file (chunk ${chunkIndex + 1}/${totalChunks})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), uploadTimeout);
      
      let result: any = null;
      
      try {
        const response = await fetch("/api/upload/chunk", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          let errorMessage: string;
          let errorDetails = "";
          
          try {
            const responseText = await response.text();
            
            // Try to parse as JSON first
            try {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.error || `Errore durante l'upload (${response.status})`;
              errorDetails = errorData.details || "";
              console.error("[CHUNKED UPLOAD] Server response error details:", errorData);
            } catch (jsonError) {
              // If not JSON, handle as HTML or plain text error
              console.error("[CHUNKED UPLOAD] Response is not JSON, got:", responseText.substring(0, 200));
              
              // For 504 timeout errors, provide a more specific message
              if (response.status === 504) {
                errorMessage = `Timeout durante l'upload del chunk ${chunkIndex + 1}. Il server ha impiegato troppo tempo a rispondere. Riprova con un file più piccolo o controlla la connessione internet.`;
                errorDetails = "Gateway Timeout - il server non è riuscito a completare l'upload entro i tempi previsti";
              } else if (response.status === 502) {
                errorMessage = `Errore del server durante l'upload del chunk ${chunkIndex + 1}. Il servizio di storage potrebbe essere temporaneamente non disponibile.`;
                errorDetails = "Bad Gateway - problemi di connessione al servizio di storage";
              } else {
                errorMessage = `Errore durante l'upload (${response.status}): ${response.statusText}`;
                errorDetails = responseText.substring(0, 200);
              }
            }
          } catch (e) {
            console.error("[CHUNKED UPLOAD] Could not read response:", e);
            errorMessage = `Errore durante l'upload (${response.status}): ${response.statusText}`;
            errorDetails = "Impossibile leggere la risposta del server";
          }
          
          console.error(`[CHUNKED UPLOAD] Error uploading chunk ${chunkIndex + 1}:`, errorMessage);
          if (errorDetails) {
            console.error(`[CHUNKED UPLOAD] Error details:`, errorDetails);
          }
          
          return {
            success: false,
            error: errorMessage
          };
        }
        
        result = await response.json();
        console.log(`[CHUNKED UPLOAD] Chunk ${chunkIndex + 1} uploaded successfully, response:`, result);
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`[CHUNKED UPLOAD] Upload timeout for chunk ${chunkIndex + 1} after ${uploadTimeout}ms`);
          return {
            success: false,
            error: `Timeout durante l'upload del chunk ${chunkIndex + 1}. L'upload ha impiegato più di ${uploadTimeout/1000} secondi. Riprova con un file più piccolo o controlla la connessione internet.`
          };
        } else {
          console.error(`[CHUNKED UPLOAD] Network error for chunk ${chunkIndex + 1}:`, fetchError);
          return {
            success: false,
            error: `Errore di rete durante l'upload del chunk ${chunkIndex + 1}: ${fetchError instanceof Error ? fetchError.message : 'Errore sconosciuto'}`
          };
        }
      }
      
      // Salva il risultato dell'ultimo pezzo come risultato finale
      if (chunkIndex === totalChunks - 1) {
        finalResult = {
          success: true,
          fileUrl: result.url,
          id: result.id,
          assetId: result.assetId // Add assetId if the server created an asset directly
        };
        
        console.log("[CHUNKED UPLOAD] Final upload result:", {
          ...finalResult,
          fileUrl: finalResult.fileUrl?.substring(0, 50) + "..." // Truncate URL for readability
        });
        
        // Add additional debug info about asset ID
        if (!finalResult.assetId) {
          console.warn("[CHUNKED UPLOAD] No assetId returned in the response. This could indicate a problem with asset creation.");
        } else {
          console.log("[CHUNKED UPLOAD] Asset successfully created with ID:", finalResult.assetId);
        }
        
        // If the assetId is null but we have a fileUrl, try to check for the asset manually
        if (!finalResult.assetId && finalResult.fileUrl) {
          console.log("[CHUNKED UPLOAD] No assetId returned, checking if asset was created separately...");
          
          // Check if we should actually create an asset based on autoSaveToLibrary setting
          const shouldSaveToLibrary = enhancedMetadata.autoSaveToLibrary !== undefined 
            ? enhancedMetadata.autoSaveToLibrary 
            : true; // Default to true if not specified
          
          if (!shouldSaveToLibrary) {
            console.log("[CHUNKED UPLOAD] autoSaveToLibrary is false - skipping asset creation check");
            return finalResult; // Don't try to create assets if user doesn't want them
          }
          
          try {
            // We'll hit our debug api to check for assets with this URL
            const verifyResponse = await fetch(`/api/debug-convex?fileUrl=${encodeURIComponent(finalResult.fileUrl)}`);
            if (verifyResponse.ok) {
              const verifyResult = await verifyResponse.json();
              
              if (verifyResult.assetFound && verifyResult.assetId) {
                console.log("[CHUNKED UPLOAD] Found asset through verification:", verifyResult.assetId);
                finalResult.assetId = verifyResult.assetId;
              } else {
                // No asset found, try to create it manually
                console.log("[CHUNKED UPLOAD] No asset found. Attempting to create asset manually...");
                try {
                  const createAssetResponse = await fetch("/api/create-asset", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      fileUrl: finalResult.fileUrl,
                      fileName: file.name, // This is used by the API to set the title, it's also needed for createReference API
                      contentType: file.type,
                      userId: enhancedMetadata.userId || 'anonymous',
                      boardId: enhancedMetadata.boardId || enhancedMetadata.projectId || 'none',
                      metadata: {
                        ...enhancedMetadata,
                        title: enhancedMetadata.title || file.name.split('.')[0],
                        author: enhancedMetadata.author || undefined,
                        tokens: Array.isArray(enhancedMetadata.tokens) ? enhancedMetadata.tokens : [],
                        externalLink: enhancedMetadata.externalLink || "",
                        isPrivate: enhancedMetadata.isPrivate || false,
                        type: file.type.startsWith('image/') ? 'image' : 
                              file.type.startsWith('video/') ? 'video' : 'document'
                      }
                    }),
                  });
                  
                  if (createAssetResponse.ok) {
                    const createResult = await createAssetResponse.json();
                    if (createResult.assetId) {
                      console.log("[CHUNKED UPLOAD] Successfully created asset manually:", createResult.assetId);
                      finalResult.assetId = createResult.assetId;
                    }
                  } else {
                    console.error("[CHUNKED UPLOAD] Failed to create asset manually:", await createAssetResponse.text());
                  }
                } catch (createError) {
                  console.error("[CHUNKED UPLOAD] Error creating asset manually:", createError);
                }
              }
            }
          } catch (verifyError) {
            console.error("[CHUNKED UPLOAD] Error during asset verification:", verifyError);
          }
        }
      }
    }
    
    if (!finalResult) {
      console.error("[CHUNKED UPLOAD] No final result returned from server");
      return {
        success: false,
        error: "Errore sconosciuto durante il caricamento del file"
      };
    }
    
    return finalResult;
  } catch (error) {
    console.error("[CHUNKED UPLOAD] Error during chunked upload:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto durante il caricamento"
    };
  }
} 