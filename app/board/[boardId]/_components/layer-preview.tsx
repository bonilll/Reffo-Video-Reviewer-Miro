"use client";

import React, { memo, useState, useCallback, useEffect } from "react";

import { colorToCSS } from "@/lib/utils";
import { useStorage, useSelf, useMutation } from "@/liveblocks.config";
import { isIOSSafari } from "@/utils/platform";
import {
  LayerType, 
  RectangleLayer, 
  EllipseLayer,
  TextLayer,
  NoteLayer,
  PathLayer,
  ImageLayer, 
  VideoLayer,
  FileLayer,
  ArrowLayer,
  LineLayer,
  FrameLayer,
  TodoWidgetLayer,
  TableLayer,
  Layer,
  CanvasState,
  CanvasMode,
  Camera,
  Point
} from "@/types/canvas";

import { Ellipse } from "./eliipse";
import { Note } from "./note";
import { Rectangle } from "./rectangle";
import { Text } from "./text";
import { Path } from "./path";
import { Arrow } from "./arrow";
import { Line } from "./line";
import { Frame } from "./frame";
import { TodoWidget } from "./todo-widget";
import { Table } from "./table";
import { File } from "./file";
import { VideoPlayer } from "./VideoPlayer";
import { LayerContextMenu } from "@/components/review/LayerContextMenu";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MediaDrawingOverlay } from "./media-drawing-overlay";

type LayerPreviewProps = {
  id: string;
  onLayerPointerDown: (e: React.PointerEvent, layerId: string) => void;
  onLayerContextMenu?: (e: React.MouseEvent, layerId: string) => void;
  selectionColor?: string;
  lastUsedColor?: { r: number; g: number; b: number };
  camera?: Camera;
  cameraRef?: React.MutableRefObject<Camera>;
  lodBucket?: "low" | "mid" | "high";
  canvasState: CanvasState;
  boardId?: Id<"boards">;
  backgroundColor?: string; // Colore di sfondo per calcolare contrasto
  // Drawing functions for media overlay
  onDrawingStart?: (point: Point, pressure: number) => void;
  onDrawingContinue?: (point: Point, e: React.PointerEvent) => void;
  onDrawingEnd?: () => void;
  // For handling drawing mode (shapes)
  onDrawingModeStart?: (point: Point) => void;
  onDrawingModeMove?: (point: Point) => void;
  onDrawingModeEnd?: (point: Point) => void;
  onCommentClick?: (point: Point) => void;
};

	export const LayerPreview = memo(
	  ({ id, onLayerPointerDown, onLayerContextMenu, selectionColor, lastUsedColor, camera, cameraRef, lodBucket = "high", canvasState, boardId, backgroundColor = "#f5f5f5", onDrawingStart, onDrawingContinue, onDrawingEnd, onDrawingModeStart, onDrawingModeMove, onDrawingModeEnd, onCommentClick }: LayerPreviewProps) => {
	    const layer = useStorage((root) => root.layers.get(id));
	    const selection = useSelf((me) => me.presence.selection);
	    const [isDraggingOverTable, setIsDraggingOverTable] = useState(false);
	    const [isDragActive, setIsDragActive] = useState(false);
	    const [dragStarted, setDragStarted] = useState(false);
	    const [imageHiResReady, setImageHiResReady] = useState(false);
	    const iosSafari = isIOSSafari();
	    
	    // Determina se questo layer è selezionato
	    const isSelected = selection.includes(id);

    // Query sessioni di review per l'asset corrente (sempre chiamata per rispettare le regole degli hook)
    const reviewSessions = useQuery(
      api.review.getReviewSessionsForAsset,
      boardId ? { boardId: boardId as any, primaryAssetId: id } : "skip"
    );

    const isReviewed = Array.isArray(reviewSessions) && reviewSessions.length > 0;

    // Mutation per aggiornare le proprietà del layer
    const updateLayerProps = useMutation(
      ({ storage }, layerId: string, updates: Partial<any>) => {
        const liveLayers = storage.get("layers");
        const layer = liveLayers.get(layerId);
        if (!layer) return;
        
        // Aggiorna le proprietà del layer
        Object.entries(updates).forEach(([key, value]) => {
          layer.set(key as any, value);
        });
      },
      []
    );

    const handlePropsChange = (updates: Partial<any>) => {
      updateLayerProps(id, updates);
    };

    const handleFocus = () => {
      // Per il TodoWidget, simuliamo un click al centro del widget per evitare il salto di posizione
      if (layer && layer.type === LayerType.TodoWidget) {
        const todoLayer = layer as TodoWidgetLayer;
        const centerX = todoLayer.x + todoLayer.width / 2;
        const centerY = todoLayer.y + todoLayer.height / 2;
        
        // Convertiamo le coordinate del canvas in coordinate dello schermo
        const currentCamera = cameraRef?.current ?? camera ?? { x: 0, y: 0, scale: 1 };
        const screenX = centerX * currentCamera.scale + currentCamera.x;
        const screenY = centerY * currentCamera.scale + currentCamera.y;
        
        // Crea un evento fittizio con coordinate corrette
        const fakeEvent = {
          stopPropagation: () => {},
          preventDefault: () => {},
          clientX: screenX,
          clientY: screenY
        } as React.PointerEvent;
        onLayerPointerDown(fakeEvent, id);
      } else {
        // Per altri tipi di layer, usa l'approccio originale
        const fakeEvent = {
          stopPropagation: () => {},
          preventDefault: () => {},
          clientX: 0,
          clientY: 0
        } as React.PointerEvent;
        onLayerPointerDown(fakeEvent, id);
      }
    };

    useEffect(() => {
      if (!layer || layer.type !== LayerType.Image) return;
      setImageHiResReady(false);
    }, [layer?.type, (layer as any)?.url, lodBucket]);

    // Funzione per rilevare se si sta trascinando sopra una tabella
    const checkIfOverTable = useCallback((clientX: number, clientY: number) => {
      // Trova l'elemento trascinato per renderlo temporaneamente trasparente
      const draggedElement = document.querySelector(`[id="${id}"]`);
      let originalPointerEvents = '';
      
      if (draggedElement) {
        originalPointerEvents = (draggedElement as HTMLElement).style.pointerEvents;
        (draggedElement as HTMLElement).style.pointerEvents = 'none';
      }
      
      // Ora possiamo rilevare correttamente l'elemento sotto
      const elementBelow = document.elementFromPoint(clientX, clientY);
      
      // Ripristina il pointer-events originale
      if (draggedElement) {
        (draggedElement as HTMLElement).style.pointerEvents = originalPointerEvents;
      }
      
      const tableElement = elementBelow?.closest('[data-table-container]');
      const imageColumnElement = elementBelow?.closest('[data-column-type="image"]');
      
      return !!(tableElement && imageColumnElement);
    }, [id]);

    // Sistema unificato di drag che inizia sempre con movimento normale
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      // IMPORTANTE: Non interferire se siamo in modalità Drawing o Inserting
      // Questi modi sono per disegnare nuove forme e non devono essere interrotti
      if (canvasState.mode === CanvasMode.Drawing || canvasState.mode === CanvasMode.Inserting) {
        // Passa direttamente al canvas senza interferenze
        onLayerPointerDown(e, id);
        return;
      }
      
      // Inizia sempre con il movimento normale
      onLayerPointerDown(e, id);
      setDragStarted(true);
      
      // Aggiungi listener per monitorare il movimento durante il drag
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const isOverTable = checkIfOverTable(moveEvent.clientX, moveEvent.clientY);
        
        if (isOverTable && !isDraggingOverTable) {
          // Siamo passati sopra una tabella - attiva la modalità drag & drop
          setIsDraggingOverTable(true);
          setIsDragActive(true);
          
          // Trova la cella specifica sotto il cursore (con elemento trascinato temporaneamente trasparente)
          const draggedElement = document.querySelector(`[id="${id}"]`);
          let originalPointerEvents = '';
          
          if (draggedElement) {
            originalPointerEvents = (draggedElement as HTMLElement).style.pointerEvents;
            (draggedElement as HTMLElement).style.pointerEvents = 'none';
          }
          
          const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          
          if (draggedElement) {
            (draggedElement as HTMLElement).style.pointerEvents = originalPointerEvents;
          }
          
          const cellElement = elementBelow?.closest('[data-column-type="image"]');
          
          if (cellElement) {
            // Rimuovi highlight precedenti
            const previousHighlighted = document.querySelectorAll('[data-column-type="image"].bg-blue-100');
            previousHighlighted.forEach(cell => {
              cell.classList.remove('bg-blue-100', 'border-blue-300');
              const overlay = cell.querySelector('.drop-overlay');
              if (overlay) {
                overlay.remove();
              }
            });
            
            // Aggiungi highlight alla cella corrente
            cellElement.classList.add('bg-blue-100', 'border-blue-300');
            
            // Aggiungi overlay di drop
            const existingOverlay = cellElement.querySelector('.drop-overlay');
            if (!existingOverlay) {
              const overlay = document.createElement('div');
              overlay.className = 'drop-overlay absolute inset-0 bg-blue-100/80 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none z-50';
              overlay.innerHTML = `
                <div class="text-blue-600 text-xs font-medium flex items-center gap-1 bg-white/90 px-2 py-1 rounded shadow-sm">
                  <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Rilascia qui
                </div>
              `;
              cellElement.appendChild(overlay);
            }
          }
          
        } else if (!isOverTable && isDraggingOverTable) {
          // Siamo usciti dalla tabella - torna al movimento normale
          setIsDraggingOverTable(false);
          setIsDragActive(false);
          
          // Rimuovi tutti gli highlight e overlay
          const highlightedCells = document.querySelectorAll('[data-column-type="image"].bg-blue-100');
          highlightedCells.forEach(cell => {
            cell.classList.remove('bg-blue-100', 'border-blue-300');
            const overlay = cell.querySelector('.drop-overlay');
            if (overlay) {
              overlay.remove();
            }
          });
        } else if (isOverTable && isDraggingOverTable) {
          // Siamo già sopra una tabella, aggiorna l'highlight della cella
          const draggedElement = document.querySelector(`[id="${id}"]`);
          let originalPointerEvents = '';
          
          if (draggedElement) {
            originalPointerEvents = (draggedElement as HTMLElement).style.pointerEvents;
            (draggedElement as HTMLElement).style.pointerEvents = 'none';
          }
          
          const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          
          if (draggedElement) {
            (draggedElement as HTMLElement).style.pointerEvents = originalPointerEvents;
          }
          
          const cellElement = elementBelow?.closest('[data-column-type="image"]');
          
          // Rimuovi highlight precedenti
          const previousHighlighted = document.querySelectorAll('[data-column-type="image"].bg-blue-100');
          previousHighlighted.forEach(cell => {
            if (cell !== cellElement) {
              cell.classList.remove('bg-blue-100', 'border-blue-300');
              const overlay = cell.querySelector('.drop-overlay');
              if (overlay) {
                overlay.remove();
              }
            }
          });
          
          // Aggiungi highlight alla cella corrente se diversa
          if (cellElement && !cellElement.classList.contains('bg-blue-100')) {
            cellElement.classList.add('bg-blue-100', 'border-blue-300');
            
            const existingOverlay = cellElement.querySelector('.drop-overlay');
            if (!existingOverlay) {
              const overlay = document.createElement('div');
              overlay.className = 'drop-overlay absolute inset-0 bg-blue-100/80 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none z-50';
              overlay.innerHTML = `
                <div class="text-blue-600 text-xs font-medium flex items-center gap-1 bg-white/90 px-2 py-1 rounded shadow-sm">
                  <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Rilascia qui
                </div>
              `;
              cellElement.appendChild(overlay);
            }
          }
        }
      };
      
      const handlePointerUp = (upEvent: PointerEvent) => {
        // Fai sempre il rilevamento al momento del drop, non basarti solo sullo stato
        const isCurrentlyOverTable = checkIfOverTable(upEvent.clientX, upEvent.clientY);
        
        // Se siamo sopra una tabella al momento del rilascio (rilevamento in tempo reale), esegui il drop
        if (isCurrentlyOverTable) {
          // Usa il sistema di rilevamento migliorato
          const draggedElement = document.querySelector(`[id="${id}"]`);
          let originalPointerEvents = '';
          
          if (draggedElement) {
            originalPointerEvents = (draggedElement as HTMLElement).style.pointerEvents;
            (draggedElement as HTMLElement).style.pointerEvents = 'none';
          }
          
          const elementBelow = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          
          if (draggedElement) {
            (draggedElement as HTMLElement).style.pointerEvents = originalPointerEvents;
          }
          
          const cellElement = elementBelow?.closest('[data-column-type="image"]');
          
          if (cellElement) {
            // Trova i dati della cella
            const columnId = cellElement.getAttribute('data-column-id');
            const rowElement = cellElement.closest('[data-row-id]');
            const rowId = rowElement?.getAttribute('data-row-id');
            
            if (columnId && rowId) {
              // Crea i dati del layer
              const dragData = {
                id: id,
                type: layer?.type === LayerType.Image ? 'image' : 'video',
                url: (layer as any)?.url,
                title: (layer as any)?.title
              };
              
              // Crea un evento personalizzato per la tabella
              const dropEvent = new CustomEvent('boardElementDrop', {
                detail: {
                  layerData: dragData,
                  rowId: rowId,
                  columnId: columnId
                }
              });
              
              // Dispatch l'evento sulla tabella
              const tableElement = cellElement.closest('[data-table-container]');
              if (tableElement) {
                tableElement.dispatchEvent(dropEvent);
              }
            }
          }
        }
        
        // Cleanup
        setDragStarted(false);
        setIsDraggingOverTable(false);
        setIsDragActive(false);
        
        // Rimuovi tutti gli highlight e overlay
        const highlightedCells = document.querySelectorAll('[data-column-type="image"].bg-blue-100');
        highlightedCells.forEach(cell => {
          cell.classList.remove('bg-blue-100', 'border-blue-300');
          const overlay = cell.querySelector('.drop-overlay');
          if (overlay) {
            overlay.remove();
          }
        });
        
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };
      
      // Aggiungi listener temporanei
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      
    }, [onLayerPointerDown, id, checkIfOverTable, isDraggingOverTable, layer, canvasState]);

    // Funzioni di callback per compatibilità (ora non più utilizzate direttamente)
    const handleDragStart = useCallback((e: React.DragEvent, layerData: any) => {
      setIsDragActive(true);
      const dragData = {
        id: id,
        type: layerData.type === LayerType.Image ? 'image' : 'video',
        url: layerData.url,
        title: layerData.title
      };
      e.dataTransfer.setData('application/board-layer', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', '');
    }, [id]);

    const handleDrag = useCallback((e: React.DragEvent) => {
      const isOverTable = checkIfOverTable(e.clientX, e.clientY);
      setIsDraggingOverTable(isOverTable);
    }, [checkIfOverTable]);

    const handleDragEnd = useCallback(() => {
      setIsDraggingOverTable(false);
      setIsDragActive(false);
    }, []);

    if (!layer) return null;

    switch (layer.type) {
      case LayerType.Path:
        return (
          <Path
            key={id}
            points={(layer as PathLayer).points}
            onPointerDown={(e) => onLayerPointerDown(e, id)}
            x={(layer as PathLayer).x}
            y={(layer as PathLayer).y}
            fill={layer.fill ? colorToCSS(layer.fill) : "#000"}
            stroke={selectionColor}
            strokeWidth={(layer as PathLayer).strokeWidth}
          />
        );
      case LayerType.Text:
        return (
          <Text
            id={id}
            layer={layer as TextLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
            backgroundColorHint={backgroundColor}
          />
        );
      case LayerType.Note:
        return (
          <Note
            id={id}
            layer={layer as NoteLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
            isSelected={isSelected}
            lastUsedColor={lastUsedColor}
          />
        );
      case LayerType.Rectangle:
        return (
          <Rectangle
            id={id}
            layer={layer as RectangleLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
          />
        );
      case LayerType.Ellipse:
        return (
          <Ellipse
            id={id}
            layer={layer as EllipseLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
          />
        );
      case LayerType.Image:
        const imageLayer = layer as ImageLayer;
        const useImageLOD = lodBucket !== "high";

	        return (
		          <foreignObject
		            id={id}
		            data-layer-id={id}
		            x={imageLayer.x}
		            y={imageLayer.y}
		            width={imageLayer.width}
		            height={imageLayer.height}
	            style={{ 
	              outline: (selectionColor && !(iosSafari && isSelected)) ? `2px solid ${selectionColor}` : "none",
	            }}
	            className={(imageLayer as any).shadow === false ? "overflow-hidden" : "shadow-md overflow-hidden"}
	            onPointerDown={handlePointerDown}
	          >
            <div xmlns="http://www.w3.org/1999/xhtml"
              className="relative w-full h-full"
              draggable={false}
            >
              {useImageLOD ? (
                imageLayer.previewUrl ? (
                  <img
                    src={imageLayer.previewUrl}
                    alt="Image preview"
                    className="w-full h-full object-cover origin-center"
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100/80 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Image
                  </div>
                )
              ) : (
                <div className="relative w-full h-full">
                  {imageLayer.previewUrl ? (
                    <img
                      src={imageLayer.previewUrl}
                      alt="Image preview"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="absolute inset-0 w-full h-full bg-slate-100/80" />
                  )}
                  <img 
                    src={imageLayer.url} 
                    alt="Image content"
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-out"
                    style={{ opacity: imageHiResReady ? 1 : 0 }}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setImageHiResReady(true)}
                  />
                </div>
              )}
              
              {/* Media Drawing Overlay */}
              <MediaDrawingOverlay
                canvasState={canvasState}
                layerId={id}
                onPointerDown={onLayerPointerDown}
                onDrawingStart={onDrawingStart}
                onDrawingContinue={onDrawingContinue}
                onDrawingEnd={onDrawingEnd}
                onDrawingModeStart={onDrawingModeStart}
                onDrawingModeMove={onDrawingModeMove}
                onDrawingModeEnd={onDrawingModeEnd}
                onCommentClick={onCommentClick}
                cameraRef={cameraRef}
              />
              
              {!useImageLOD && isReviewed && (
                <div 
                  className="absolute top-2 right-2 bg-white text-black text-[9px] font-semibold px-2.5 py-1 rounded-full shadow-sm border border-gray-200 flex items-center gap-1 animate-pulse-glow cursor-pointer hover:shadow-md transition-shadow"
                  style={{
                    animation: 'pulse-glow 2s ease-in-out infinite'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (reviewSessions && reviewSessions.length > 0) {
                      const latestSession = reviewSessions[0];
                      window.location.href = `/review/${latestSession._id}`;
                    }
                  }}
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Review
                </div>
              )}
            </div>
          </foreignObject>
        );
      case LayerType.Video:
        const videoLayer = layer as VideoLayer;
        const useVideoLOD = lodBucket !== "high";

	        return (
		          <foreignObject
		            id={id}
		            data-layer-id={id}
		            x={videoLayer.x}
		            y={videoLayer.y}
		            width={videoLayer.width}
		            height={videoLayer.height}
	            style={{ 
	              outline: (selectionColor && !(iosSafari && isSelected)) ? `2px solid ${selectionColor}` : "none",
	            }}
	            className={(videoLayer as any).shadow === false ? "overflow-hidden" : "shadow-md overflow-hidden"}
	            onPointerDown={(e) => {
              // Gestione speciale per i controlli video
              const target = e.target as HTMLElement;
              if (target.tagName === 'VIDEO') {
                const rect = target.getBoundingClientRect();
                const controlsHeight = 40;
                
                if (e.clientY > rect.bottom - controlsHeight) {
                  e.stopPropagation();
                  return;
                }
              }
              
              // Usa il sistema unificato per tutti gli altri casi
              handlePointerDown(e);
            }}
          >
            <div xmlns="http://www.w3.org/1999/xhtml"
              className="relative w-full h-full"
              draggable={false}
            >
              <div className="relative w-full h-full">
                {/* Custom player */}
                {useVideoLOD ? (
                  <div className="w-full h-full bg-slate-100/80 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Video
                  </div>
                ) : (
                  <VideoPlayer
                    src={videoLayer.url}
                    fit="cover"
                    autoPlay={false}
                    muted={true}
                    preload={isSelected ? "metadata" : "none"}
                  />
                )}
                
                {/* Media Drawing Overlay */}
                <MediaDrawingOverlay
                  canvasState={canvasState}
                  layerId={id}
                  onPointerDown={onLayerPointerDown}
                  onDrawingStart={onDrawingStart}
                  onDrawingContinue={onDrawingContinue}
                  onDrawingEnd={onDrawingEnd}
                  onDrawingModeStart={onDrawingModeStart}
                  onDrawingModeMove={onDrawingModeMove}
                  onDrawingModeEnd={onDrawingModeEnd}
                  onCommentClick={onCommentClick}
                cameraRef={cameraRef}
              />
                
                {!useVideoLOD && isReviewed && (
                  <div 
                    className="absolute top-2 right-2 bg-white text-black text-[9px] font-semibold px-2.5 py-1 rounded-full shadow-sm border border-gray-200 flex items-center gap-1 animate-pulse-glow cursor-pointer hover:shadow-md transition-shadow"
                    style={{
                      animation: 'pulse-glow 2s ease-in-out infinite'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (reviewSessions && reviewSessions.length > 0) {
                        const latestSession = reviewSessions[0];
                        window.location.href = `/review/${latestSession._id}`;
                      }
                    }}
                  >
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Review
                  </div>
                )}
              </div>
            </div>
          </foreignObject>
        );
      case LayerType.File:
	        return (
		          <foreignObject
		            id={id}
		            data-layer-id={id}
		            x={(layer as FileLayer).x}
		            y={(layer as FileLayer).y}
		            width={(layer as FileLayer).width}
		            height={(layer as FileLayer).height}
	            style={{ 
	              outline: (selectionColor && !(iosSafari && isSelected)) ? `2px solid ${selectionColor}` : "none",
	            }}
	          >
            <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full">
              <File
                id={id}
                layer={layer as FileLayer}
                onPointerDown={onLayerPointerDown}
                selectionColor={selectionColor}
              />
            </div>
          </foreignObject>
        );
      case LayerType.Arrow:
        return (
          <Arrow
            id={id}
            layer={layer as ArrowLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
          />
        );
      case LayerType.Line:
        return (
          <Line
            id={id}
            layer={layer as LineLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
          />
        );
      case LayerType.Frame:
        return (
          <Frame
            id={id}
            layer={layer as FrameLayer}
            onPointerDown={onLayerPointerDown}
            onContextMenu={onLayerContextMenu}
            selectionColor={selectionColor}
          />
        );
      case LayerType.TodoWidget:
        const todoWidgetLayer = layer as TodoWidgetLayer;
	        return (
		          <foreignObject
		            id={id}
		            data-layer-id={id}
		            x={todoWidgetLayer.x}
		            y={todoWidgetLayer.y}
		            width={todoWidgetLayer.width}
		            height={todoWidgetLayer.height}
	            style={{ 
	              outline: (selectionColor && !(iosSafari && isSelected)) ? `2px solid ${selectionColor}` : "none",
	            }}
	            className="overflow-hidden"
	            onPointerDown={(e) => {
	              // Gestisci il trascinamento direttamente sul foreignObject
	              onLayerPointerDown(e, id);
	            }}
	          >
            <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full">
              <TodoWidget
                layer={todoWidgetLayer}
                onPropsChange={handlePropsChange}
                isSelected={isSelected}
                onFocus={handleFocus}
                camera={camera || { x: 0, y: 0, scale: 1 }}
              />
            </div>
          </foreignObject>
        );
      case LayerType.Table:
        return (
          <Table
            id={id}
            layer={layer as TableLayer}
            onPointerDown={onLayerPointerDown}
            selectionColor={selectionColor}
            isSelected={isSelected}
          />
        );
      default:
        console.warn("Unknown layer type");
        return null;
    }
  },
);

// CSS Animation for review badge glow
const reviewBadgeStyle = `
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(59, 130, 246, 0.3), 0 0 10px rgba(59, 130, 246, 0.2), 0 0 15px rgba(59, 130, 246, 0.1);
    }
    50% {
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.6), 0 0 20px rgba(59, 130, 246, 0.4), 0 0 30px rgba(59, 130, 246, 0.2);
    }
  }
`;

// Inject CSS animation style
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = reviewBadgeStyle;
  if (!document.head.querySelector('[data-review-badge-style]')) {
    styleSheet.setAttribute('data-review-badge-style', 'true');
    document.head.appendChild(styleSheet);
  }
}

LayerPreview.displayName = "LayerPreview";
