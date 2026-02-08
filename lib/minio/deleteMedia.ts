"use client";

/**
 * Elimina un file da MinIO utilizzando l'URL completo.
 * Utilizza un HTTP action Convex per gestire autenticazione e operazioni S3
 * (funziona sia in dev che in prod, senza dipendere da route locali di Vite).
 * 
 * @param url URL completo del file da eliminare
 * @returns Promise che si risolve quando il file viene eliminato
 */
const getConvexAuthToken = async () => {
  if (typeof window === "undefined") return null;
  const clerk = (window as any).Clerk;
  const session = clerk?.session;
  if (!session?.getToken) return null;
  return await session.getToken({ template: "convex" });
};

const getApiBase = () => {
  const env = import.meta.env;
  const rawBase =
    env.VITE_CONVEX_HTTP_URL ||
    env.VITE_CONVEX_SELF_HOSTED_URL ||
    env.VITE_CONVEX_URL;
  if (!rawBase) return "";
  return rawBase.includes(".convex.cloud")
    ? rawBase.replace(".convex.cloud", ".convex.site")
    : rawBase;
};

const safeReadJson = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export const deleteMediaByUrl = async (url: string | null): Promise<boolean> => {
  try {
    if (!url) {
      return false;
    }

    // Per ora, se l'URL è un percorso di sviluppo locale, non facciamo nulla
    // Nei file locali di sviluppo, permettiamo che rimangano nella cartella pubblica
    if (url.includes('/dev-uploads/')) {
      return false;
    }

    const token = await getConvexAuthToken();
    if (!token) {
      console.warn("Missing Clerk token for delete. Skipping delete:", url);
      return false;
    }

    const base = getApiBase();
    const endpoint = base ? `${base}/api/delete-media` : "/api/delete-media";

    // Invia la richiesta di eliminazione all'HTTP action Convex
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData: any = await safeReadJson(response);
      const msg =
        (errorData && (errorData.error || errorData.details)) ||
        `HTTP ${response.status}`;
      throw new Error(msg);
    }

    return true;
  } catch (error) {
    console.error("Errore durante l'eliminazione del file:", error);
    // Log dell'URL che ha causato il problema
    if (url) console.error("URL problematico:", url);
    
    // Non propagare l'errore per evitare di bloccare altre operazioni di eliminazione
    return false;
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
      return;
    }
    
    // Elimina ogni file nell'array di URL
    const deletePromises = mediaUrls.map(url => deleteMediaByUrl(url));
    await Promise.all(deletePromises);
    
  } catch (error) {
    console.error("Errore durante l'eliminazione di tutti i file dell'utente:", error);
  }
}; 
