"use client";

/**
 * Comprime un'immagine riducendone le dimensioni e la qualità
 * @param file File immagine da comprimere
 * @returns Promise che si risolve con il Blob compresso
 */
export const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target?.result) {
        reject(new Error("Impossibile leggere il file"));
        return;
      }
      
      // Usa il costruttore HTMLImageElement esplicitamente invece di Image
      const img = document.createElement('img');
      img.onload = () => {
        // Calcola le dimensioni di destinazione mantenendo il rapporto
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round(width * (MAX_HEIGHT / height));
            height = MAX_HEIGHT;
          }
        }
        
        // Crea un canvas per comprimere l'immagine
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Impossibile creare il contesto canvas"));
          return;
        }
        
        // Disegna l'immagine nel canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converti il canvas in Blob con qualità compressa
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Impossibile creare il blob"));
            return;
          }
          
          resolve(blob);
        }, 'image/jpeg', 0.7); // Qualità JPEG 0.7 (70%)
      };
      
      img.onerror = () => {
        reject(new Error("Impossibile caricare l'immagine"));
      };
      
      img.src = event.target.result.toString();
    };
    
    reader.onerror = () => {
      reject(new Error("Impossibile leggere il file"));
    };
    
    reader.readAsDataURL(file);
  });
}; 