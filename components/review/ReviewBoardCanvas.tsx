"use client";

import { ReviewAnnotation } from "@/types/canvas";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ReviewBoardStorage, convertAnnotationToLayer, convertLayerToAnnotation } from "./ReviewBoardAdapter";
import { SelectionBox } from "@/app/board/[boardId]/_components/selection-box";
import { LayerPreview } from "@/app/board/[boardId]/_components/layer-preview";

interface ReviewBoardCanvasProps {
  annotations: ReviewAnnotation[];
  selectedAnnotationIds: string[];
  onAnnotationSelect: (annotationIds: string[]) => void;
  onAnnotationMove: (annotationIds: string[], deltaX: number, deltaY: number) => void;
  onAnnotationResize?: (annotationId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  theme?: 'dark' | 'light';
  canvasRect?: DOMRect;
  canvasNativeWidth?: number;
  canvasNativeHeight?: number;
  scale?: number;
}

// Canvas modes per compatibilità board
enum CanvasMode {
  None = "None",
  Pressing = "Pressing", 
  SelectionNet = "SelectionNet",
  Translating = "Translating",
  Resizing = "Resizing",
}

// Mock camera and canvas state per compatibilità board
const mockCamera = { x: 0, y: 0, scale: 1 };

export function ReviewBoardCanvas({
  annotations,
  selectedAnnotationIds,
  onAnnotationSelect,
  onAnnotationMove,
  onAnnotationResize,
  theme = 'light',
  canvasRect,
  canvasNativeWidth = 800,
  canvasNativeHeight = 600,
  scale = 1
}: ReviewBoardCanvasProps) {
  
  // Crea storage mock dalle annotations
  const storage = useMemo(() => new ReviewBoardStorage(annotations), [annotations]);
  
  // Stati per simulare il sistema board
  const [localSelection, setLocalSelection] = useState<string[]>([]);
  const [layerIdsToColorSelection, setLayerIdsToColorSelection] = useState<Record<string, string>>({});
  const [canvasState, setCanvasState] = useState<{
    mode: CanvasMode;
    current?: { x: number; y: number };
  }>({ mode: CanvasMode.None });
  const [isDragging, setIsDragging] = useState(false);
  
  // Ref per ottenere coordinate canvas quando non fornite
  const canvasRef = useRef<HTMLDivElement>(null);
  const [internalCanvasRect, setInternalCanvasRect] = useState<DOMRect | null>(null);
  
  // Aggiorna bounds canvas interno
  useEffect(() => {
    if (canvasRef.current && !canvasRect) {
      const updateBounds = () => {
        if (canvasRef.current) {
          setInternalCanvasRect(canvasRef.current.getBoundingClientRect());
        }
      };
      
      updateBounds();
      window.addEventListener('resize', updateBounds);
      window.addEventListener('scroll', updateBounds);
      
      return () => {
        window.removeEventListener('resize', updateBounds);
        window.removeEventListener('scroll', updateBounds);
      };
    }
  }, [canvasRect]);
  
  // Usa canvasRect fornito o interno
  const activeCanvasRect = canvasRect || internalCanvasRect;
  
  // Sincronizza selezione locale con props esterne
  useEffect(() => {
    const layerIds = selectedAnnotationIds.map(id => `layer_${id}`);
    setLocalSelection(layerIds);
    
    // Crea color mapping per layer selezionati
    const colorMap: Record<string, string> = {};
    layerIds.forEach(id => {
      colorMap[id] = '#3b82f6'; // Blue selection color
    });
    setLayerIdsToColorSelection(colorMap);
  }, [selectedAnnotationIds]);

  // Mock hooks per compatibilità board
  const useSelfMock = () => ({
    presence: { selection: localSelection }
  });

  const useStorageMock = (selector: any) => {
    const [, forceUpdate] = useState({});
    
    useEffect(() => {
      const unsubscribe = storage.onChange(() => forceUpdate({}));
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }, []);
    
    return selector({ layers: storage.get("layers") });
  };

  const useSelectionBounds = () => {
    if (localSelection.length === 0) return null;
    
    const layers = storage.get("layers") as any;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    localSelection.forEach(layerId => {
      const layer = layers?.get(layerId);
      if (layer) {
        const layerData = layer.toObject();
        minX = Math.min(minX, layerData.x);
        minY = Math.min(minY, layerData.y);
        maxX = Math.max(maxX, layerData.x + layerData.width);
        maxY = Math.max(maxY, layerData.y + layerData.height);
      }
    });
    
    if (minX === Infinity) return null;
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  // Converti coordinate pointer in canvas coordinates
  const pointerEventToCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
    if (!activeCanvasRect) return { x: e.clientX, y: e.clientY };
    
    return {
      x: e.clientX - activeCanvasRect.left,
      y: e.clientY - activeCanvasRect.top,
    };
  }, [activeCanvasRect]);

  // Handler per selezione layer
  const onLayerPointerDown = useCallback((e: React.PointerEvent, layerId: string) => {
    e.stopPropagation();
    
    const annotationId = layerId.replace('layer_', '');
    const point = pointerEventToCanvasPoint(e);
    
    if (e.shiftKey) {
      // Multi-selezione
      const currentIds = selectedAnnotationIds.includes(annotationId)
        ? selectedAnnotationIds.filter(id => id !== annotationId)
        : [...selectedAnnotationIds, annotationId];
      onAnnotationSelect(currentIds);
    } else {
      // Selezione singola se non è già selezionato
      if (!selectedAnnotationIds.includes(annotationId)) {
        onAnnotationSelect([annotationId]);
      }
      
      // Inizia il drag
      setCanvasState({ mode: CanvasMode.Translating, current: point });
      setIsDragging(true);
    }
  }, [selectedAnnotationIds, onAnnotationSelect, pointerEventToCanvasPoint]);

  // Handler per il movimento via mutations (simulato)
  const useMutationMock = (fn: any, deps: any[]) => {
    return useCallback((...args: any[]) => {
      // Simula le mutations delle board chiamando direttamente la funzione
      const mockStorage = {
        get: (key: string) => storage.get(key),
      };
      const mockSelf = {
        presence: { selection: localSelection }
      };
      
      return fn({ storage: mockStorage, self: mockSelf }, ...args.slice(1));
    }, [fn, localSelection, ...deps]);
  };

  // Simula translateSelectedLayers delle board per movimento real-time
  const translateSelectedLayers = useCallback((point: { x: number; y: number }) => {
    if (canvasState.mode !== CanvasMode.Translating || !canvasState.current) {
      return;
    }

    // Calcola offset dall'ultima posizione
    const offset = {
      x: point.x - canvasState.current.x,
      y: point.y - canvasState.current.y,
    };

    // Aggiorna direttamente le posizioni dei layer nel storage
    const layers = storage.get("layers") as any;
    
    localSelection.forEach((layerId: string) => {
      const layer = layers?.get(layerId);
      if (layer) {
        const currentData = layer.toObject();
        
        // Aggiorna posizioni real-time
        layer.update({
          x: currentData.x + offset.x,
          y: currentData.y + offset.y,
        });
        
        // Per arrow/line, aggiorna anche start/end points
        if (currentData.type === "Arrow" && currentData.startX !== undefined) {
          layer.update({
            startX: currentData.startX + offset.x,
            startY: currentData.startY + offset.y,
            endX: currentData.endX + offset.x,
            endY: currentData.endY + offset.y,
          });
        }
      }
    });

  }, [canvasState, localSelection, storage]);

  // Handler per pointer move durante drag
  const onPointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    
    if (!isDragging) return;

    const current = pointerEventToCanvasPoint(e);
    
    if (canvasState.mode === CanvasMode.Translating) {
      translateSelectedLayers(current);
    }
  }, [isDragging, canvasState.mode, translateSelectedLayers, pointerEventToCanvasPoint]);

  // Handler per pointer up (fine drag)
  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const current = pointerEventToCanvasPoint(e);
    
    // Calcola il delta totale del movimento
    if (canvasState.current && localSelection.length > 0) {
      const totalDelta = {
        x: current.x - canvasState.current.x,
        y: current.y - canvasState.current.y,
      };

      // Converti le coordinate se necessario per l'API
      const scaledDelta = {
        x: totalDelta.x / (scale || 1),
        y: totalDelta.y / (scale || 1),
      };

      
      // Chiama l'API con il delta finale
      const annotationIds = localSelection.map(id => id.replace('layer_', ''));
      onAnnotationMove(annotationIds, scaledDelta.x, scaledDelta.y);
    }

    // Reset stato
    setCanvasState({ mode: CanvasMode.None });
    setIsDragging(false);
    
  }, [isDragging, canvasState.current, localSelection, scale, onAnnotationMove, pointerEventToCanvasPoint]);

  // Handler per resize
  const onResizeHandlePointerDown = useCallback((corner: any, initialBounds: any, e: React.PointerEvent) => {
    // TODO: Implementa resize usando il sistema board
  }, []);

  // Handler per pointer down sul canvas (area selection)
  const onCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (isDragging) return;
    
    const point = pointerEventToCanvasPoint(e);
    
    // Se non si clicca su un layer, deseleziona tutto
    if (!e.shiftKey) {
      onAnnotationSelect([]);
      setCanvasState({ mode: CanvasMode.SelectionNet, current: point });
    }
  }, [isDragging, pointerEventToCanvasPoint, onAnnotationSelect]);

  // Event listeners globali per drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      
      
      return () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };
    }
  }, [isDragging, onPointerMove, onPointerUp]);

  // Ottieni layer IDs per rendering
  const layerIds = (storage.get("layerIds") as string[]) || [];
  const selectionBounds = useSelectionBounds();

  return (
    <div 
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto" 
      style={{ zIndex: 15 }}
      onPointerDown={onCanvasPointerDown}
    >
      {/* SVG Canvas */}
      <svg 
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <g>
          {/* Render tutti i layer */}
          {layerIds.map((layerId: string) => (
            <LayerPreview
              key={layerId}
              id={layerId}
              onLayerPointerDown={onLayerPointerDown}
              onLayerContextMenu={() => {}} // Placeholder
              selectionColor={layerIdsToColorSelection[layerId] || '#3b82f6'}
              lastUsedColor={{ r: 59, g: 130, b: 246 }}
              camera={mockCamera}
              canvasState={canvasState as any}
              boardId={"review-board" as any} // Mock board ID
            />
          ))}
          
          {/* Selection Box */}
          {selectionBounds && localSelection.length > 0 && (
            <SelectionBox
              onResizeHandlePointerDown={onResizeHandlePointerDown}
              onArrowLinePointPointerDown={() => {}} // Placeholder
              canvasState={canvasState as any}
              camera={mockCamera}
            />
          )}
        </g>
      </svg>
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 right-4 bg-black/80 text-white p-2 rounded text-xs">
          <div>🎯 Review Board Canvas</div>
          <div>Layers: {layerIds.length}</div>
          <div>Selected: {localSelection.length}</div>
          <div>Bounds: {selectionBounds ? `${Math.round(selectionBounds.width)}x${Math.round(selectionBounds.height)}` : 'none'}</div>
          <div className={`${isDragging ? 'text-green-400' : 'text-gray-400'}`}>
            🚀 Drag: {isDragging ? 'ACTIVE' : 'idle'}
          </div>
          <div className={`${canvasState.mode !== CanvasMode.None ? 'text-yellow-400' : 'text-gray-400'}`}>
            🎨 Mode: {canvasState.mode}
          </div>
          {canvasState.current && (
            <div className="text-blue-400">
              📍 Point: {Math.round(canvasState.current.x)}, {Math.round(canvasState.current.y)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Provider per mock dei context delle board
export function ReviewBoardProvider({ children }: { children: React.ReactNode }) {
  return (
    <div data-review-board-provider>
      {children}
    </div>
  );
} 