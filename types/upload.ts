/**
 * Opzioni per il caricamento dei file
 */
export interface FileUploadOptions {
  /**
   * Metadati aggiuntivi da memorizzare con il file
   */
  metadata?: Record<string, any>;
  
  /**
   * Se il file deve essere privato (accessibile solo con un token)
   * Default: false (pubblico)
   */
  isPrivate?: boolean;
} 