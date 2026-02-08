"use client";

import { v4 as uuidv4 } from "uuid";
import { MediaUploadResult } from "@/types/media";

/**
 * Carica un file su MinIO tramite l'API chunk upload
 * 
 * @param file Il file da caricare
 * @param boardId L'ID della board a cui il file è associato
 * @param onProgress Callback per monitorare lo stato di avanzamento
 * @returns Informazioni sul file caricato
 */
export const uploadMedia = async (
  file: File,
  boardId: string,
  onProgress?: (progress: number) => void
): Promise<MediaUploadResult> => {
  // Verifica che il file sia un'immagine o un video
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Solo immagini e video sono supportati");
  }

  // Determina il tipo di media
  const type: string = file.type.startsWith("image/") ? "image" : "video";
  
  // Crea un ID di sessione univoco per il caricamento
  const sessionId = uuidv4();
  
  // Suddividi il file in chunk (1MB per chunk)
  const chunkSize = 1024 * 1024; // 1MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  let lastProgressUpdate = 0;
  
  // Carica ogni chunk sequenzialmente
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    
    // Calcola il progresso attuale
    const currentProgress = (chunkIndex / totalChunks) * 100;
    
    // Aggiorna il progresso solo se è cambiato significativamente
    if (currentProgress - lastProgressUpdate >= 5 && onProgress) {
      onProgress(currentProgress);
      lastProgressUpdate = currentProgress;
    }
    
    // Crea un FormData con i metadati del chunk
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("fileName", file.name);
    formData.append("contentType", file.type);
    formData.append("sessionId", sessionId);
    formData.append("chunkIndex", chunkIndex.toString());
    formData.append("totalChunks", totalChunks.toString());
    formData.append("boardId", boardId);
    formData.append("isLastChunk", (chunkIndex === totalChunks - 1).toString());
    
    // Invia il chunk all'API con timeout progressivo
    const fileSizeMB = file.size / (1024 * 1024);
    let timeout = 30000; // 30s base
    if (fileSizeMB > 50) timeout = 60000;   // 60s per file > 50MB
    if (fileSizeMB > 100) timeout = 90000;  // 90s per file > 100MB
    if (fileSizeMB > 200) timeout = 120000; // 120s per file > 200MB
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    let response;
    try {
      response = await fetch("/api/upload/chunk", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Timeout durante l'upload del chunk ${chunkIndex + 1}. L'upload ha impiegato più di ${timeout/1000} secondi.`);
      }
      throw new Error(`Errore di rete durante l'upload del chunk ${chunkIndex + 1}: ${fetchError.message}`);
    }
    
    if (!response.ok) {
      let errorMessage = "Errore durante il caricamento del chunk";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        if (response.status === 504) {
          errorMessage = `Timeout durante l'upload del chunk ${chunkIndex + 1}. Il server ha impiegato troppo tempo a rispondere.`;
        }
      } catch (e) {
        if (response.status === 504) {
          errorMessage = `Timeout durante l'upload del chunk ${chunkIndex + 1}. Il server ha impiegato troppo tempo a rispondere.`;
        }
      }
      throw new Error(errorMessage);
    }
    
    // Se è l'ultimo chunk, ottieni i dati del file completo
    if (chunkIndex === totalChunks - 1) {
      const data = await response.json();
      
      // Segnala il completamento
      if (onProgress) onProgress(100);
      
      // Restituisci i dati del file caricato
      return {
        url: data.url,
        name: file.name,
        mimeType: file.type,
        type,
        size: file.size,
        boardId
      };
    }
  }
  
  // In caso di errore, lancia un'eccezione
  throw new Error("Errore durante il caricamento del file");
}; 