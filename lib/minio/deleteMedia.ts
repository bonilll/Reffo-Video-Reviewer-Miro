"use client";

/**
 * Elimina un file da MinIO utilizzando l'URL completo.
 * Utilizza un'API serverless per gestire l'autenticazione e le operazioni S3.
 * 
 * @param url URL completo del file da eliminare
 * @returns Promise che si risolve quando il file viene eliminato
 */
export const deleteMediaByUrl = async (url: string | null): Promise<void> => {
  try {
    if (!url) {
      console.log("URL non fornito o media che non deve essere eliminato");
      return;
    }

    // Per ora, se l'URL è un percorso di sviluppo locale, non facciamo nulla
    // Nei file locali di sviluppo, permettiamo che rimangano nella cartella pubblica
    if (url.includes('/dev-uploads/')) {
      console.log("URL di sviluppo locale, non è necessario eliminare:", url);
      return;
    }

    // Invia la richiesta di eliminazione all'API
    const response = await fetch('/api/delete-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Errore durante l\'eliminazione del file');
    }

    console.log(`File eliminato con successo: ${url}`);
  } catch (error) {
    console.error("Errore durante l'eliminazione del file:", error);
    // Log dell'URL che ha causato il problema
    if (url) console.error("URL problematico:", url);
    
    // Non propagare l'errore per evitare di bloccare altre operazioni di eliminazione
  }
};

/**
 * Elimina tutti i file associati a una specifica lavagna.
 * 
 * @param boardId ID della lavagna
 * @param mediaUrls Array di URL dei media da eliminare
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteBoardMedia = async (boardId: string, mediaUrls: string[]): Promise<void> => {
  try {
    // Elimina ogni file nell'array di URL
    const deletePromises = mediaUrls.map(url => deleteMediaByUrl(url));
    await Promise.all(deletePromises);
    
    console.log(`Tutti i file della lavagna ${boardId} sono stati eliminati con successo`);
  } catch (error) {
    console.error(`Errore durante l'eliminazione dei file della lavagna ${boardId}:`, error);
  }
};

/**
 * Elimina tutti i media dell'utente.
 * 
 * @param mediaUrls Array di URL dei media da eliminare
 * @returns Promise che si risolve quando tutti i file sono stati eliminati
 */
export const deleteAllUserMedia = async (mediaUrls: string[]): Promise<void> => {
  try {
    if (!mediaUrls || mediaUrls.length === 0) {
      console.log("Nessun file da eliminare");
      return;
    }
    
    // Elimina ogni file nell'array di URL
    const deletePromises = mediaUrls.map(url => deleteMediaByUrl(url));
    await Promise.all(deletePromises);
    
    console.log(`Tutti i file dell'utente sono stati eliminati con successo (${mediaUrls.length} file)`);
  } catch (error) {
    console.error("Errore durante l'eliminazione di tutti i file dell'utente:", error);
  }
}; 