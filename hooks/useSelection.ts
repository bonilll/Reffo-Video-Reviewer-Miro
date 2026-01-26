"use client";

import { useMutation, useStorage, useSelf } from "@/liveblocks.config";
import { LayerType } from "@/types/canvas";
import { LayerInfo, PositionUpdate, calculateBoundingBox } from "@/utils/alignment";

// Estendo l'interfaccia PositionUpdate per includere opzionalmente width e height
export interface ExtendedPositionUpdate extends PositionUpdate {
  width?: number;
  height?: number;
}

export const useSelection = () => {
  // Ottieni la selezione corrente dell'utente
  const selection = useSelf((me) => me.presence.selection);
  
  // Ottieni tutti i layer dalla storage
  const layers = useStorage((root) => root.layers);
  
  // Converti i layer selezionati in formato LayerInfo
  const selectedLayers: LayerInfo[] = selection.map((id) => {
    const layer = layers.get(id);
    if (!layer) return null;
    
    return {
      id,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      type: layer.type as LayerType
    };
  }).filter(Boolean) as LayerInfo[];
  
  // Calcola il bounding box della selezione
  const boundingBox = calculateBoundingBox(selectedLayers);
  
  // Mutation per aggiornare le posizioni e dimensioni dei layer
  const updateLayerPositions = useMutation((
    { storage }, 
    updates: ExtendedPositionUpdate[]
  ) => {
    const liveLayers = storage.get("layers");
    
    updates.forEach((update) => {
      const layer = liveLayers.get(update.id);
      if (layer) {
        const updateData: any = {
          x: update.x,
          y: update.y
        };
        
        // Aggiungi width e height se presenti nell'aggiornamento
        if (update.width !== undefined) {
          updateData.width = update.width;
        }
        
        if (update.height !== undefined) {
          updateData.height = update.height;
        }
        
        layer.update(updateData);
      }
    });
  }, []);
  
  return {
    selection,
    selectedLayers,
    hasMultipleSelection: selectedLayers.length > 1,
    boundingBox,
    updateLayerPositions
  };
}; 