import { Id } from "@/convex/_generated/dataModel";

/**
 * Helper per la generazione di URL per risorse di storage
 */
export const getStorageUrl = (
  id: string | Id<any>,
  type: 'image' | 'video' | 'file' = 'image'
): string => {
  // Preferiamo usare l'URL di storage diretto se disponibile nel processo.env
  if (process.env.NEXT_PUBLIC_STORAGE_URL) {
    return `${process.env.NEXT_PUBLIC_STORAGE_URL}/files/${id}`;
  }
  
  // Usiamo l'API storage locale come fallback
  return `/api/storage/${id}`;
};

/**
 * Helper per determinare se un URL si riferisce a un'immagine
 */
export const isImageUrl = (url: string): boolean => {
  if (!url) return false;
  
  // Check per estensioni comuni di immagini 
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

/**
 * Helper per determinare se un URL si riferisce a un video
 */
export const isVideoUrl = (url: string): boolean => {
  if (!url) return false;
  
  // Check per estensioni comuni di video
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.wmv', '.flv'];
  return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

/**
 * Helper per creare un'immagine di placeholder generica
 */
export const getPlaceholderImageUrl = (
  seed: string | number,
  type: 'image' | 'video' = 'image'
): string => {
  const seedStr = String(seed).replace(/\D/g, '') || '0';
  const seedNum = parseInt(seedStr.slice(0, 6)) % 1000;

  if (type === 'video') {
    return `https://placehold.co/80x80/6366f1/fff?text=Video`;
  }
  
  return `https://picsum.photos/seed/${seedNum}/80`;
}; 