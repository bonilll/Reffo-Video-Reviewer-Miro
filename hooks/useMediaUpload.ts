import { useCallback } from "react";
import { useMutation } from "convex/react";
import { nanoid } from "nanoid";
import { LiveObject } from "@liveblocks/client";

import { api } from "@/convex/_generated/api";
import { useMutation as useCanvasMutation } from "@/liveblocks.config";
import { 
  LayerType, 
  ImageLayer, 
  VideoLayer,
  FileLayer,
  Camera,
  Point 
} from "@/types/canvas";
import { Id } from "@/convex/_generated/dataModel";

interface UseMediaUploadOptions {
  boardId: string;
  camera?: Camera;
}

// Funzione di utilità per ottenere le dimensioni originali di un'immagine
const getImageDimensions = (url: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = () => {
      // In caso di errore, usa dimensioni di default
      resolve({
        width: 400,
        height: 300
      });
    };
    img.src = url;
  });
};

// Funzione di utilità per ottenere le dimensioni originali di un video
const getVideoDimensions = (url: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight
      });
    };
    
    video.onerror = () => {
      // In caso di errore, usa dimensioni di default
      resolve({
        width: 480,
        height: 300
      });
    };

    // Imposta attributi per caricare solo i metadati senza riprodurre il video
    video.preload = 'metadata';
    video.src = url;
    
    // Timeout di sicurezza in caso il video non carichi entro 3 secondi
    setTimeout(() => {
      if (!video.videoWidth) {
        resolve({
          width: 480,
          height: 300
        });
      }
    }, 3000);
  });
};

// Funzione per calcolare il centro della vista camera
const getCameraViewCenter = (camera?: Camera): Point => {
  
  if (!camera || typeof window === 'undefined') {
    return { x: 500, y: 300 }; // Fallback visibile
  }
  
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  
  // Converti le coordinate dello schermo in coordinate del canvas
  const canvasCenter = {
    x: (centerX - camera.x) / camera.scale,
    y: (centerY - camera.y) / camera.scale
  };
  
  return canvasCenter;
};

export const useMediaUpload = ({ boardId, camera }: UseMediaUploadOptions) => {
  
  // Funzione per aggiungere un layer di tipo media alla board DIRETTAMENTE al centro della vista
  const insertMediaLayerAtViewCenter = useCanvasMutation(
    async (
      { storage, setMyPresence }, 
      mediaType: "image" | "video", 
      mediaUrl: string,
      previewUrl?: string
    ) => {
      
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      
      // Genera un ID unico per il layer
      const layerId = nanoid();
      
      // Calcola il centro della vista PRIMA di ottenere le dimensioni
      const centerPoint = getCameraViewCenter(camera);
      
      // Ottiene le dimensioni originali del media e calcola le proporzioni
      const maxSize = 500; // Dimensione massima per limitare l'inserimento iniziale
      let width, height;
      
      if (mediaType === "image") {
        // Precarica l'immagine per ottenere le dimensioni originali
        const dimensions = await getImageDimensions(mediaUrl);
        
        // Calcola le dimensioni mantenendo le proporzioni
        if (dimensions.width > dimensions.height) {
          width = Math.min(dimensions.width, maxSize);
          height = Math.round(width * dimensions.height / dimensions.width);
        } else {
          height = Math.min(dimensions.height, maxSize);
          width = Math.round(height * dimensions.width / dimensions.height);
        }
        
        
        // Crea un oggetto ImageLayer DIRETTAMENTE posizionato al centro della vista
        const imageLayer: ImageLayer = {
          type: LayerType.Image,
          x: centerPoint.x - width / 2, // Centra orizzontalmente
          y: centerPoint.y - height / 2, // Centra verticalmente
          height,
          width,
          url: mediaUrl,
          previewUrl: previewUrl || undefined,
          title: "Immagine caricata"
        };
        
        
        // Aggiungiamo il layer alla board (images are non-frames, so they go at the end)
        liveLayerIds.push(layerId);
        liveLayers.set(layerId, new LiveObject(imageLayer));
      } else {
        // Precarica il video per ottenere le dimensioni originali
        const dimensions = await getVideoDimensions(mediaUrl);
        
        // Calcola le dimensioni mantenendo le proporzioni
        if (dimensions.width > dimensions.height) {
          width = Math.min(dimensions.width, maxSize);
          height = Math.round(width * dimensions.height / dimensions.width);
        } else {
          height = Math.min(dimensions.height, maxSize);
          width = Math.round(height * dimensions.width / dimensions.height);
        }
        
        
        // Crea un oggetto VideoLayer DIRETTAMENTE posizionato al centro della vista
        const videoLayer: VideoLayer = {
          type: LayerType.Video,
          x: centerPoint.x - width / 2, // Centra orizzontalmente
          y: centerPoint.y - height / 2, // Centra verticalmente
          height,
          width,
          url: mediaUrl,
          title: "Video caricato"
        };
        
        
        // Aggiungiamo il layer alla board (videos are non-frames, so they go at the end)
        liveLayerIds.push(layerId);
        liveLayers.set(layerId, new LiveObject(videoLayer));
      }
      
      // Selezioniamo il nuovo layer
      setMyPresence({ selection: [layerId] }, { addToHistory: true });

      return layerId;
    },
    [camera]
  );

  // Funzione per aggiungere un layer di tipo file alla board DIRETTAMENTE al centro della vista
  const insertFileLayerAtViewCenter = useCanvasMutation(
    async (
      { storage, setMyPresence }, 
      fileUrl: string,
      fileName: string,
      fileType: string,
      fileSize?: number
    ) => {
      
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      
      // Genera un ID unico per il layer
      const layerId = nanoid();
      
      // Calcola il centro della vista
      const centerPoint = getCameraViewCenter(camera);
      
      // Dimensioni standard per i file (più spazio per preview)
      const width = 240;
      const height = 160;
      
      // Crea un oggetto FileLayer DIRETTAMENTE posizionato al centro della vista
      const fileLayer: FileLayer = {
        type: LayerType.File,
        x: centerPoint.x - width / 2, // Centra orizzontalmente
        y: centerPoint.y - height / 2, // Centra verticalmente
        height,
        width,
        url: fileUrl,
        title: fileName,
        fileName: fileName,
        fileType: fileType,
        fileSize: fileSize
      };
      
      
      // Aggiungiamo il layer alla board (files are non-frames, so they go at the end)
      liveLayerIds.push(layerId);
      liveLayers.set(layerId, new LiveObject(fileLayer));
      
      // Selezioniamo il nuovo layer
      setMyPresence({ selection: [layerId] }, { addToHistory: true });

      return layerId;
    },
    [camera]
  );

  // Handler chiamato quando il componente UploadOverlay completa un upload
  const handleMediaUploaded = useCallback(async (type: "image" | "video", url: string, previewUrl?: string) => {
    try {
      
      // Aggiungi il layer DIRETTAMENTE al centro della vista
      const layerId = await insertMediaLayerAtViewCenter(type, url, previewUrl);
      
    } catch (error) {
      console.error("❌ Error uploading media:", error);
    }
  }, [insertMediaLayerAtViewCenter, camera]);

  // Handler chiamato quando viene caricato un file
  const handleFileUploaded = useCallback(async (url: string, fileName: string, fileType: string, fileSize?: number) => {
    try {
      
      // Aggiungi il layer DIRETTAMENTE al centro della vista
      const layerId = await insertFileLayerAtViewCenter(url, fileName, fileType, fileSize);
      
    } catch (error) {
      console.error("❌ Error uploading file:", error);
    }
  }, [insertFileLayerAtViewCenter, camera]);
  
  return {
    insertMediaLayer: insertMediaLayerAtViewCenter, // Alias per compatibilità
    handleMediaUploaded,
    insertMediaLayerAtViewCenter,
    insertFileLayerAtViewCenter,
    handleFileUploaded
  };
}; 
