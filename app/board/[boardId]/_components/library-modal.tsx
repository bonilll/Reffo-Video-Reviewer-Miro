"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, CheckSquare, Square, Filter } from "lucide-react";
import { Library } from "@/components/library/library";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { nanoid } from "nanoid";
import { useStorage, useMutation as useLibeblocksMutation } from "@/liveblocks.config";
import { LiveObject } from "@liveblocks/client";
import { toast } from "sonner";
import { LayerType, ImageLayer, VideoLayer, FileLayer } from "@/types/canvas";
import { useCamera } from "@/app/contexts/CameraContext";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface LibraryModalProps {
  boardId: Id<"boards"> | string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryModal = ({
  boardId,
  userId,
  isOpen,
  onClose
}: LibraryModalProps) => {
  const [selectedItems, setSelectedItems] = useState<Id<"assets">[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const { camera } = useCamera();

  // Mutation for registering library imports
  const registerLibraryImport = useMutation(api.media.registerLibraryImport);

  // State for filtered data from Library component
  const [filteredData, setFilteredData] = useState<{
    filteredReferences: any[];
    filters: any;
    hasActiveFilters: boolean;
    onFilterOpen: () => void;
  } | null>(null);

  // Get all references directly here
  const allReferences = useQuery(api.assets.getUserLibrary, { 
    userId, 
    orgId: undefined 
  }) || [];

  // Calculate available references for import using useMemo
  const availableReferences = useMemo(() => {
    return allReferences.filter(ref => selectedItems.includes(ref._id));
  }, [allReferences, selectedItems]);

  // Reset selection when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedItems([]);
    }
  }, [isOpen]);

  // Funzione per calcolare il centro della vista camera
  const getCameraViewCenter = useCallback(() => {
    
    if (typeof window === 'undefined' || !camera) {
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
  }, [camera]);

  // Helper functions for getting media dimensions
  const getImageDimensions = (url: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        // Fallback dimensions if image fails to load
        resolve({ width: 400, height: 300 });
      };
      img.src = url;
    });
  };

  const getVideoDimensions = (url: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => {
        // Fallback dimensions if video fails to load
        resolve({ width: 640, height:480 });
      };
      video.src = url;
    });
  };

  // Liveblocks mutations for adding elements to canvas
  const insertImageLayer = useLibeblocksMutation(async ({ storage, setMyPresence }, imageUrl: string, title: string) => {
    
    const liveLayers = storage.get("layers");
    const liveLayerIds = storage.get("layerIds");
    
    // Calcola il centro della vista PRIMA di ottenere le dimensioni
    const centerPoint = getCameraViewCenter();
    
    // Precarica l'immagine per ottenere le dimensioni originali
    const dimensions = await getImageDimensions(imageUrl);
    
    const maxSize = 500; // Dimensione massima per l'inserimento iniziale
    
    // Calcola le dimensioni mantenendo le proporzioni
    let width: number, height: number;
    if (dimensions.width > dimensions.height) {
      width = Math.min(dimensions.width, maxSize);
      height = Math.round(width * dimensions.height / dimensions.width);
    } else {
      height = Math.min(dimensions.height, maxSize);
      width = Math.round(height * dimensions.width / dimensions.height);
    }
    
    
    const layerId = nanoid();
    const layer = new LiveObject({
      type: LayerType.Image,
      x: centerPoint.x - width / 2, // Centra orizzontalmente
      y: centerPoint.y - height / 2, // Centra verticalmente
      width,
      height,
      url: imageUrl,
      title: title,
      fill: { r: 0, g: 0, b: 0 },
      value: ""
    } as ImageLayer);


    // Insert the layer using proper layering rules (images are non-frames, so they go at the end)
    liveLayerIds.push(layerId);
    liveLayers.set(layerId, layer);

    // Select the newly added layer
    setMyPresence({ selection: [layerId] }, { addToHistory: true });
    
    return layerId;
  }, [getCameraViewCenter]);

  const insertVideoLayer = useLibeblocksMutation(async ({ storage, setMyPresence }, videoUrl: string, title: string) => {
    
    const liveLayers = storage.get("layers");
    const liveLayerIds = storage.get("layerIds");
    
    // Calcola il centro della vista PRIMA di ottenere le dimensioni
    const centerPoint = getCameraViewCenter();
    
    // Precarica il video per ottenere le dimensioni originali
    const dimensions = await getVideoDimensions(videoUrl);
    
    const maxSize = 500; // Dimensione massima per l'inserimento iniziale
    
    // Calcola le dimensioni mantenendo le proporzioni
    let width: number, height: number;
    if (dimensions.width > dimensions.height) {
      width = Math.min(dimensions.width, maxSize);
      height = Math.round(width * dimensions.height / dimensions.width);
    } else {
      height = Math.min(dimensions.height, maxSize);
      width = Math.round(height * dimensions.width / dimensions.height);
    }
    
    
    const layerId = nanoid();
    const layer = new LiveObject({
      type: LayerType.Video,
      x: centerPoint.x - width / 2, // Centra orizzontalmente
      y: centerPoint.y - height / 2, // Centra verticalmente
      width: width || 320,
      height: height || 240,
      url: videoUrl,
      title: title,
      fill: { r: 0, g: 0, b: 0 },
      value: ""
    } as VideoLayer);


    // Insert the layer using proper layering rules (videos are non-frames, so they go at the end)
    liveLayerIds.push(layerId);
    liveLayers.set(layerId, layer);

    // Select the newly added layer
    setMyPresence({ selection: [layerId] }, { addToHistory: true });
    
    return layerId;
  }, [getCameraViewCenter]);

  const insertFileLayer = useLibeblocksMutation(async ({ storage, setMyPresence }, fileUrl: string, fileName: string, fileType: string, fileSize?: number) => {
    
    const liveLayers = storage.get("layers");
    const liveLayerIds = storage.get("layerIds");
    
    // Calcola il centro della vista
    const centerPoint = getCameraViewCenter();
    
    // Dimensioni standard per i file
    const width = 200;
    const height = 120;
    
    const layerId = nanoid();
    const layer = new LiveObject({
      type: LayerType.File,
      x: centerPoint.x - width / 2, // Centra orizzontalmente
      y: centerPoint.y - height / 2, // Centra verticalmente
      width,
      height,
      url: fileUrl,
      title: fileName,
      fileName: fileName,
      fileType: fileType,
      fileSize: fileSize
    } as FileLayer);


    // Insert the layer using proper layering rules (files are non-frames, so they go at the end)
    liveLayerIds.push(layerId);
    liveLayers.set(layerId, layer);

    // Select the newly added layer
    setMyPresence({ selection: [layerId] }, { addToHistory: true });
    
    return layerId;
  }, [getCameraViewCenter]);

  // Handle import of selected items
  const handleImport = useCallback(async () => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one item to import");
      return;
    }

    if (availableReferences.length === 0) {
      toast.error("Reference data not available");
      return;
    }

    setIsImporting(true);
    
    try {
      let importedCount = 0;
      
      // Import each available reference (these are already filtered by selection)
      for (const reference of availableReferences) {
        try {
          const ref = reference as any; // Temporary cast to access properties
          
          // Register the library import in the database first
          await registerLibraryImport({
              boardId: boardId as Id<"boards">,
            url: ref.fileUrl,
            type: ref.type,
            name: ref.title || ref.fileName || (ref.type === 'image' ? 'Image' : 'Video')
          });
          
          
          let layerId: string | undefined;
          if (ref.type === 'image') {
            layerId = await insertImageLayer(ref.fileUrl, ref.title || ref.fileName || 'Image');
          } else if (ref.type === 'video') {
            layerId = await insertVideoLayer(ref.fileUrl, ref.title || ref.fileName || 'Video');
          } else if (ref.type === 'file') {
            layerId = await insertFileLayer(ref.fileUrl, ref.fileName || ref.title || 'File', ref.fileType || 'file', ref.fileSize);
          }
          
          if (layerId) {
            importedCount++;
          } else {
            console.warn(`⚠️ Could not create layer for library media: ${ref.fileUrl}`);
          }
          
        } catch (importError) {
          console.error("❌ Error importing individual reference:", importError);
          toast.error(`Error importing ${reference.title || reference.fileName}`);
          }
        }
      
      if (importedCount > 0) {
        toast.success(`${importedCount} item(s) imported successfully and centered.`);
        // Chiudi automaticamente solo se almeno un elemento è stato importato con successo
        setTimeout(() => onClose(), 1500); // Aspetta 1.5 secondi per permettere all'utente di vedere il messaggio
      } else if (selectedItems.length > 0) {
        toast.error("No items could be imported. Check console for details.");
      }
      
    } catch (error) {
      console.error("❌ Error during batch import process:", error);
      toast.error("An unexpected error occurred during import.");
    } finally {
      setIsImporting(false);
      // Non chiudere qui - la chiusura avviene solo in caso di successo
    }
  }, [selectedItems, availableReferences, registerLibraryImport, insertImageLayer, insertVideoLayer, insertFileLayer, boardId, camera, onClose]);

  // Handle Select All
  const handleSelectAll = () => {
    // Use filtered references if available, otherwise use all references
    const referencesToSelect = filteredData?.filteredReferences || allReferences;
    const allReferenceIds = referencesToSelect.map(ref => ref._id);
    setSelectedItems(allReferenceIds);
  };

  // Handle Deselect All
  const handleDeselectAll = () => {
    setSelectedItems([]);
  };

  // Stabilize the callback to avoid infinite re-renders
  const handleFilteredDataChange = useCallback((data: {
    filteredReferences: any[];
    filters: any;
    hasActiveFilters: boolean;
    onFilterOpen: () => void;
  } | null) => {
    setFilteredData(data);
  }, []);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <DialogPrimitive.Content 
          className="w-screen h-screen max-w-none max-h-none p-0 m-0 rounded-none border-none fixed inset-0 z-50 overflow-hidden"
          style={{
            transform: 'none',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            width: '100vw',
            height: '100vh',
            maxWidth: 'none',
            maxHeight: 'none',
            margin: '0',
            padding: '0'
          }}
        >
          <div className="flex flex-col h-full w-full bg-gradient-to-br from-gray-50 to-white overflow-hidden">
            {/* Header */}
            <div className="library-modal-header flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-6 py-4 bg-white/95 backdrop-blur-sm border-b border-gray-200/60 shadow-sm flex-shrink-0 gap-4 md:gap-0">
              {/* Left section - Title and description */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                  <Download className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 md:flex-none">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Import from Library
                  </h2>
                  <p className="text-sm text-gray-500">
                    Select references to add to your board
                  </p>
                </div>
                
                {/* Close button - mobile only */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="md:hidden ml-auto text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-xl p-2 transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Middle section - Filters and selection (responsive) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                {/* Filter and Selection buttons container */}
                <div className="library-modal-buttons flex items-center gap-2 w-full sm:w-auto">
                  {/* Filter button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => filteredData?.onFilterOpen()}
                    className="library-modal-button flex items-center gap-2 px-3 py-2 rounded-lg border-gray-300 hover:bg-gray-50 text-gray-700 flex-1 sm:flex-none"
                  >
                    <Filter className="h-4 w-4" />
                    <span className="text-sm">Filter</span>
                    {filteredData?.hasActiveFilters && (
                      <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                    )}
                  </Button>
                  
                  {/* Select All button */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSelectAll}
                    className="library-modal-button flex items-center gap-2 px-3 py-2 rounded-lg border-gray-300 hover:bg-gray-50 text-gray-700 flex-1 sm:flex-none"
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span className="text-sm hidden sm:inline">Select All</span>
                    <span className="text-sm sm:hidden">All</span>
                  </Button>
                  
                  {/* Deselect All button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="library-modal-button flex items-center gap-2 px-3 py-2 rounded-lg border-gray-300 hover:bg-gray-50 text-gray-700 flex-1 sm:flex-none"
                  >
                    <Square className="h-4 w-4" />
                    <span className="text-sm hidden sm:inline">Deselect All</span>
                    <span className="text-sm sm:hidden">None</span>
                  </Button>
                </div>
                
                {/* Selection counter */}
                {selectedItems.length > 0 && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
                      <span className="text-xs font-medium text-white">
                        {selectedItems.length}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
                    </span>
                  </div>
                )}
              </div>
              
              {/* Right section - Import and close buttons */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                {selectedItems.length > 0 && (
                  <Button 
                    onClick={handleImport} 
                    disabled={isImporting}
                    className="library-modal-import-btn bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 md:px-6 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md flex-1 md:flex-none"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                        <span className="hidden sm:inline">Importing...</span>
                        <span className="sm:hidden">...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Import {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''}</span>
                        <span className="sm:hidden">Import ({selectedItems.length})</span>
                      </>
                    )}
                  </Button>
                )}
                
                {/* Close button - desktop only */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="hidden md:flex text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-xl p-2.5 transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {/* Library Content */}
            <div className="flex-1 overflow-hidden w-full bg-white/30">
              <LibraryImportWrapper
              userId={userId}
                selectedItems={selectedItems}
                onSelectionChange={setSelectedItems}
                onFilteredDataChange={handleFilteredDataChange}
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

// Wrapper component to handle the library in import mode
interface LibraryImportWrapperProps {
  userId: string;
  selectedItems: Id<"assets">[];
  onSelectionChange: (items: Id<"assets">[]) => void;
  onFilteredDataChange: (data: {
    filteredReferences: any[];
    filters: any;
    hasActiveFilters: boolean;
    onFilterOpen: () => void;
  } | null) => void;
}

const LibraryImportWrapper = ({ userId, selectedItems, onSelectionChange, onFilteredDataChange }: LibraryImportWrapperProps) => {
  return (
    <div className="h-full w-full">
      <Library 
        userId={userId}
        isImportMode={true}
        selectedItems={selectedItems}
        onSelectionChange={onSelectionChange}
        onFilteredDataChange={onFilteredDataChange}
            />
          </div>
  );
}; 
