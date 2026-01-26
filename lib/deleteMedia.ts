"use client";

import { deleteFromMinio } from "./minio-client";

/**
 * Elimina un file da MinIO utilizzando l'URL completo.
 * @param url URL completo del file da eliminare
 * @returns Promise che si risolve quando il file viene eliminato
 */
export const deleteMediaByUrl = async (url: string | null): Promise<void> => {
  try {
    if (!url) {
      console.log("URL non fornito o media importato dalla libreria che non deve essere eliminato");
      return;
    }

    // Elimina il file da MinIO
    await deleteFromMinio(url);
    console.log(`File eliminato con successo: ${url}`);
  } catch (error) {
    // Gestisci gli errori in modo più specifico
    if (error instanceof Error) {
      if (error.message.includes('Object does not exist') || 
          error.message.includes('Not Found') ||
          error.message.includes('NoSuchKey')) {
        console.warn("Il file non esiste più o è già stato eliminato");
        return; // Non propagare l'errore se il file è già stato eliminato
      }
    }
    
    console.error("Errore durante l'eliminazione del file:", error);
    // Log dell'URL che ha causato il problema
    console.error("URL problematico:", url);
    
    // Non propagare l'errore per evitare di bloccare altre operazioni di eliminazione
    // throw error;
  }
};

/**
 * Elimina tutti i file associati a una specifica lavagna da MinIO.
 * @param boardId ID della lavagna
 * @param urls Array di URL dei file da eliminare
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteBoardMedia = async (boardId: string, urls: string[]): Promise<void> => {
  try {
    // Filtra gli URL validi
    const validUrls = urls.filter(url => url && url.trim() !== "");
    
    if (validUrls.length === 0) {
      console.log(`Nessun file da eliminare per la lavagna ${boardId}`);
      return;
    }
    
    console.log(`Eliminazione di ${validUrls.length} file per la lavagna ${boardId}`);
    
    // Elimina tutti i file in parallelo
    await Promise.all(validUrls.map(url => deleteMediaByUrl(url)));
    
    console.log(`Tutti i file della lavagna ${boardId} sono stati eliminati con successo`);
  } catch (error) {
    console.error(`Errore durante l'eliminazione dei file della lavagna ${boardId}:`, error);
    // Non propagare l'errore per evitare di bloccare altre operazioni
  }
};

/**
 * Elimina tutti i media dell'utente da MinIO.
 * @param userId ID dell'utente
 * @param urls Array di URL dei file da eliminare
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteUserMedia = async (userId: string, urls: string[]): Promise<void> => {
  try {
    // Filtra gli URL validi
    const validUrls = urls.filter(url => url && url.trim() !== "");
    
    if (validUrls.length === 0) {
      console.log(`Nessun file da eliminare per l'utente ${userId}`);
      return;
    }
    
    console.log(`Eliminazione di ${validUrls.length} file per l'utente ${userId}`);
    
    // Elimina tutti i file in parallelo
    await Promise.all(validUrls.map(url => deleteMediaByUrl(url)));
    
    console.log(`Tutti i file dell'utente ${userId} sono stati eliminati con successo`);
  } catch (error) {
    console.error(`Errore durante l'eliminazione dei file dell'utente ${userId}:`, error);
    // Non propagare l'errore per evitare di bloccare altre operazioni
  }
}; 