"use client";

import { ref, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

/**
 * Elimina un file da Firebase Storage utilizzando l'URL completo.
 * @param url URL completo del file da eliminare (https://storage.googleapis.com/bucket/path)
 * @returns Promise che si risolve quando il file viene eliminato
 */
export const deleteMediaByUrl = async (url: string | null): Promise<void> => {
  try {
    if (!url) {
      return;
    }

    // Verifica il formato dell'URL
    const urlObj = new URL(url);
    let path;

    // Gestione di diversi formati di URL di Firebase Storage
    if (url.includes('firebasestorage.googleapis.com')) {
      // Formato standard Firebase Storage 
      // https://firebasestorage.googleapis.com/v0/b/bucket-name/o/path%2Fto%2Ffile?alt=media&token=...
      
      if (urlObj.pathname.includes('/o/')) {
        // Estrai il percorso dal formato /v0/b/bucket-name/o/path
        path = urlObj.pathname.split('/o/')[1];
        
        // Rimuovi eventuali parametri di query
        if (path.includes('?')) {
          path = path.split('?')[0];
        }
      } else {
        // Tenta di estrarre dal path completo
        const matches = url.match(/\/o\/([^?]+)/);
        path = matches ? matches[1] : null;
      }
    } else if (url.includes('googleapis.com/storage/v1')) {
      // Formato alternativo: https://www.googleapis.com/storage/v1/b/bucket-name/o/path
      const parts = urlObj.pathname.split('/o/');
      path = parts.length > 1 ? parts[1] : null;
    } else if (url.includes('storage.googleapis.com')) {
      // Formato Cloud Storage: https://storage.googleapis.com/bucket-name/path
      // In questo caso il percorso è l'intero pathname dopo il nome del bucket
      const pathParts = urlObj.pathname.split('/');
      pathParts.shift(); // Rimuovi la stringa vuota iniziale
      
      if (pathParts.length > 1) {
        // Ignora il bucket e usa il resto come percorso
        pathParts.shift(); // Rimuovi il nome del bucket
        path = pathParts.join('/');
      }
    } else {
      console.warn(`Formato URL non riconosciuto: ${url}`);
      return;
    }
    
    if (!path) {
      console.warn(`Impossibile estrarre il percorso dall'URL: ${url}`);
      return;
    }
    
    // Decodifica il path (potrebbe contenere caratteri speciali codificati)
    const decodedPath = decodeURIComponent(path);
    
    // Crea un riferimento allo storage
    const fileRef = ref(storage, decodedPath);
    
    // Elimina il file
    await deleteObject(fileRef);
  } catch (error) {
    // Gestisci gli errori in modo più specifico
    if (error instanceof Error) {
      if (error.message.includes('Object does not exist') || 
          error.message.includes('Not Found')) {
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
 * Elimina tutti i file associati a una specifica lavagna da Firebase Storage.
 * @param boardId ID della lavagna
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteBoardMedia = async (boardId: string, mediaUrls: string[]): Promise<void> => {
  try {
    // Elimina ogni file nell'array di URL
    const deletePromises = mediaUrls.map(url => deleteMediaByUrl(url));
    await Promise.all(deletePromises);
    
  } catch (error) {
    console.error(`Errore durante l'eliminazione dei file della lavagna ${boardId}:`, error);
    throw error;
  }
};

/**
 * Elimina tutti i media dell'utente da Firebase Storage.
 * @param mediaUrls Array di URL dei media da eliminare
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteAllUserMedia = async (mediaUrls: string[]): Promise<void> => {
  try {
    if (!mediaUrls || mediaUrls.length === 0) {
      return;
    }
    
    // Elimina ogni file nell'array di URL
    const deletePromises = mediaUrls.map(url => deleteMediaByUrl(url));
    await Promise.all(deletePromises);
    
  } catch (error) {
    console.error("Errore durante l'eliminazione di tutti i file dell'utente:", error);
    throw error;
  }
}; 