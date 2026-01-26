// Questo file contiene funzioni per l'upload su MinIO e il salvataggio su Convex

import { createClient } from '@/lib/convex-client';
import { api } from '@/convex/_generated/api';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUserId, isAuthenticated } from '@/lib/auth-helper';

// Crea un'istanza del client Convex
const convex = createClient();

export interface FileMetadata {
  title: string;
  author: string;
  externalLink: string;
  tokens: string[];
}

export interface UploadItem {
  file: File;
  metadata: FileMetadata;
  id: string;
}

export interface UploadedReference {
  id: string;
  name: string;
  url: string;
  tokens: string[];
  author: string;
  externalLink?: string;
  type: "image" | "video";
  uploadedAt: number;
}

// Upload su MinIO tramite API sicura
export async function uploadFileToStorage(file: File, userId: string): Promise<string> {
  const fileId = uuidv4();
  const fileName = file.name.replace(/\s+/g, '-').toLowerCase(); // Normalizza il nome file
  
  try {
    // Verifica che l'utente sia autenticato
    const isUserAuthenticated = await isAuthenticated();
    if (!isUserAuthenticated) {
      throw new Error('Utente non autenticato. Impossibile caricare il file.');
    }
    
    // Ottieni l'ID utente autenticato dal server
    const authenticatedUserId = await getCurrentUserId();
    if (!authenticatedUserId) {
      throw new Error('ID utente non disponibile. Impossibile caricare il file.');
    }
    
    console.log(`[Upload] Inizializzazione upload per utente ${authenticatedUserId}, file: ${fileName} (${file.size} bytes, ${file.type})`);
    
    // Use the upload/file endpoint which has storage limit checks
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', `uploads/${authenticatedUserId}/${fileName}`);
    formData.append('contentType', file.type);
    formData.append('isPrivate', 'false');
    
    console.log(`[Upload] Uploading file via /api/upload/file endpoint`);
    const response = await fetch('/api/upload/file', {
      method: 'POST',
      body: formData,
    });
    
    // Log della risposta HTTP per diagnostica
    console.log(`[Upload] Risposta API upload: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorMessage = `Errore API (${response.status}): ${response.statusText}`;
      try {
        const errorData = await response.json();
        
        // Handle specific storage limit errors
        if (response.status === 413 && errorData.reason === "file_too_large") {
          throw new Error(`File troppo grande: ${errorData.details}`);
        } else if (response.status === 507 && errorData.reason === "storage_limit_exceeded") {
          throw new Error(`Limite di storage raggiunto: ${errorData.details}`);
        } else {
          errorMessage = `Errore API (${response.status}): ${errorData.error || response.statusText}`;
          if (errorData.details) {
            errorMessage += ` - Dettagli: ${errorData.details}`;
          }
        }
        
        console.error("[Upload] Dettagli errore API:", errorData);
      } catch (e) {
        // If the error is already a string message from above, re-throw it
        if (e instanceof Error && (e.message.includes("File troppo grande") || e.message.includes("Limite di storage"))) {
          throw e;
        }
        console.error("[Upload] Impossibile leggere i dettagli dell'errore:", e);
      }
      throw new Error(errorMessage);
    }
    
    const responseData = await response.json();
    
    if (!responseData.success || !responseData.url) {
      console.error("[Upload] Dati mancanti nella risposta API:", responseData);
      throw new Error("Risposta API incompleta: URL del file mancante");
    }
    
    const fileUrl = responseData.url;
    
    console.log(`[Upload] File caricato con successo: ${fileUrl}`);
    
    // Verifica che l'URL sia accessibile
    try {
      const checkResponse = await fetch(fileUrl, { method: 'HEAD' });
      if (checkResponse.ok) {
        console.log('[Upload] Verifica URL riuscita:', fileUrl);
      } else {
        console.warn('[Upload] URL caricato ma non accessibile:', fileUrl, checkResponse.status);
      }
    } catch (error) {
      console.warn('[Upload] Impossibile verificare l\'URL del file (ma l\'upload potrebbe essere riuscito):', error);
    }
    
    return fileUrl;
  } catch (error) {
    console.error('[Upload] Errore durante l\'upload:', error);
    throw error;
  }
}

// Salvataggio reale dei metadati su Convex
export async function saveReferenceMetadata(reference: UploadedReference, userId: string): Promise<string> {
  try {
    console.log('[Convex Save] Preparing to save reference to Convex:', reference);
    console.log('[Convex Save] User ID passed to function:', userId);
    
    // Ottieni l'ID utente autenticato
    const authenticatedUserId = await getCurrentUserId();
    console.log('[Convex Save] Authenticated user ID from getCurrentUserId():', authenticatedUserId);
    
    if (!authenticatedUserId) {
      console.error('[Convex Save] No authenticated user ID available!');
      throw new Error('ID utente non disponibile. Impossibile salvare i metadati.');
    }

    // Verifica che l'URL includa l'ID utente per MinIO
    let fileUrl = reference.url;
    if (fileUrl && fileUrl.includes('s3.reffo.studio') && !fileUrl.includes(authenticatedUserId)) {
      console.warn('[Convex Save] URL non contiene ID utente, potrebbe non essere accessibile', {
        url: fileUrl,
        userId: authenticatedUserId
      });
      
      // In alcuni casi potrebbe essere necessario ricostruire l'URL
      // Questo è un controllo di sicurezza, non dovrebbe mai accadere con le modifiche apportate
    }
    
    // Utilizza la funzione create di Convex
    const convexParams = {
      userId: authenticatedUserId, // Usa sempre l'ID ottenuto dal server
      title: reference.name,
      author: reference.author,
      externalLink: reference.externalLink,
      tokens: reference.tokens,
      fileUrl: fileUrl,
      type: reference.type,
      fileName: fileUrl.split('/').pop() || 'file'
    };
    
    console.log('[Convex Save] Calling Convex mutation with params:', convexParams);
    
    try {
      console.log('[Convex Save] Sending mutation to Convex API createReference...');
      const assetId = await convex.mutation(api.assets.create, convexParams);
      
      console.log('[Convex Save] Reference saved successfully, ID:', assetId);
      return assetId;
    } catch (error) {
      console.error('[Convex Save] ERROR during Convex mutation:', error);
      console.error('[Convex Save] Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  } catch (error) {
    console.error('[Convex] Errore durante il salvataggio della reference:', error);
    throw error;
  }
}

// Funzione principale per gestire l'upload e il salvataggio di più file
export async function uploadReferences(uploadItems: UploadItem[], userId: string): Promise<UploadedReference[]> {
  try {
    console.log('[UPLOAD PROCESS START] ------------------------------------------');
    console.log('[UPLOAD PROCESS] Starting upload process for', uploadItems.length, 'files');
    
    // Verifica che l'utente sia autenticato
    const isUserAuthenticated = await isAuthenticated();
    console.log('[UPLOAD PROCESS] User authenticated:', isUserAuthenticated);
    
    if (!isUserAuthenticated) {
      console.error('[UPLOAD PROCESS] Upload failed: User not authenticated');
      throw new Error('Utente non autenticato. Impossibile caricare i file.');
    }
    
    // Ottieni l'ID utente reale dal server
    const authenticatedUserId = await getCurrentUserId();
    console.log('[UPLOAD PROCESS] Got user ID from server:', authenticatedUserId);
    
    if (!authenticatedUserId) {
      console.error('[UPLOAD PROCESS] Upload failed: No user ID available');
      throw new Error('ID utente non disponibile. Impossibile caricare i file.');
    }
    
    // Check if the provided userId matches the authenticated one
    if (userId !== authenticatedUserId) {
      console.warn(`[UPLOAD PROCESS] Warning: Provided userId (${userId}) doesn't match authenticated userId (${authenticatedUserId}). Using authenticated ID.`);
    }
    
    // Always use the server-authenticated user ID for security
    const finalUserId = authenticatedUserId;
    
    console.log('[UPLOAD PROCESS] Using final userId:', finalUserId);
    console.log('[UPLOAD PROCESS] Sample file data:', uploadItems.map(item => ({
      id: item.id,
      name: item.file.name,
      size: item.file.size,
      type: item.file.type,
      metadataTitle: item.metadata.title
    })));
    
    // Carichiamo tutti i file in parallelo
    const uploadPromises = uploadItems.map(async (item, index) => {
      console.log(`[UPLOAD PROCESS] Starting upload for file ${index + 1}/${uploadItems.length}: ${item.file.name}`);
      
      try {
        const fileUrl = await uploadFileToStorage(item.file, finalUserId);
        console.log(`[UPLOAD PROCESS] File ${index + 1} uploaded successfully, got URL:`, fileUrl);
        
        // Creiamo l'oggetto reference
        const reference: UploadedReference = {
          id: item.id,
          name: item.metadata.title || item.file.name,
          url: fileUrl,
          tokens: item.metadata.tokens,
          author: item.metadata.author,
          externalLink: item.metadata.externalLink || undefined,
          type: item.file.type.startsWith('image/') ? 'image' : 'video',
          uploadedAt: Date.now(),
        };
        
        console.log(`[UPLOAD PROCESS] Created reference object for file ${index + 1}:`, reference);
        
        // Salviamo i metadati
        console.log(`[UPLOAD PROCESS] Saving metadata for file ${index + 1} to Convex...`);
        const referenceId = await saveReferenceMetadata(reference, finalUserId);
        console.log(`[UPLOAD PROCESS] Metadata saved for file ${index + 1} with ID:`, referenceId);
        
        return reference;
      } catch (error) {
        console.error(`[UPLOAD PROCESS] ERROR processing file ${index + 1}:`, error);
        throw error;
      }
    });
    
    // Attendiamo il completamento di tutti gli upload
    console.log('[UPLOAD PROCESS] Waiting for all file uploads to complete...');
    const uploadedReferences = await Promise.all(uploadPromises);
    console.log('[UPLOAD PROCESS] All files uploaded successfully:', uploadedReferences.length);
    console.log('[UPLOAD PROCESS END] ------------------------------------------');
    
    return uploadedReferences;
  } catch (error) {
    console.error('[UPLOAD PROCESS] FATAL ERROR during upload:', error);
    throw error;
  }
} 