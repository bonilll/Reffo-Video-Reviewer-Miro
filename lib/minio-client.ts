// ⚠️ IMPORTANTE: NON USARE QUESTO FILE NEL FRONTEND ⚠️
// Questo modulo è stato riadattato per essere usato SOLO lato server
// Non importare questo modulo nei componenti React o nel codice client!

import { FileUploadOptions } from "@/types/upload";

/**
 * Questa funzione è un wrapper sicuro per caricare file tramite l'API serverless,
 * invece di usare l'accesso diretto a MinIO dal client (che esporrebbe le credenziali)
 */
export async function uploadToMinio(
  file: File | Blob, 
  path: string, 
  contentType: string,
  options?: FileUploadOptions
): Promise<string> {
  try {
    
    // Se l'URL contiene uno schema, rimuovilo (per evitare problemi con localhost:3000)
    if (path.includes('://')) {
      path = path.split('://')[1];
    }
    
    // Rimuovi anche eventuali hostname
    if (path.includes('localhost:3000/')) {
      path = path.replace('localhost:3000/', '');
    }
    
    // Crea FormData per l'upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", path);
    formData.append("contentType", contentType);
    
    // Aggiungi opzioni se presenti
    if (options) {
      if (options.metadata) {
        formData.append("metadata", JSON.stringify(options.metadata));
      }
      if (options.isPrivate !== undefined) {
        formData.append("isPrivate", options.isPrivate.toString());
      }
    }
    
    // Invia richiesta all'API endpoint sicuro
    const response = await fetch("/api/upload/file", {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Errore durante l'upload (${response.status})`);
    }
    
    // Estrai l'URL dal risultato
    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error("[Safe MinIO Client] Errore durante l'upload:", error);
    throw error;
  }
}

/**
 * Elimina un file tramite API (invece di accesso diretto)
 */
export async function deleteFromMinio(fileUrl: string): Promise<void> {
  try {
    
    // Invia richiesta DELETE all'API
    const response = await fetch("/api/upload/file", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fileUrl })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Errore durante l'eliminazione (${response.status})`);
    }
    
  } catch (error) {
    console.error("[Safe MinIO Client] Errore durante l'eliminazione:", error);
    throw error;
  }
} 