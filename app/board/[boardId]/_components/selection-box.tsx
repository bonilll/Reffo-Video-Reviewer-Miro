"use client";

import { memo, useEffect, useState } from "react";

import { useSelectionBounds } from "@/hooks/use-selection-bounds";
import { useSelf, useStorage } from "@/liveblocks.config";
import { LayerType, Side, CanvasMode, type XYWH, type Camera } from "@/types/canvas";
import { useSelection } from "@/hooks/useSelection";

interface SelectionBoxProps {
  onResizeHandlePointerDown: (corner: Side, initialBounds: XYWH, e: React.PointerEvent) => void;
  onArrowLinePointPointerDown?: (isStartPoint: boolean, layerId: string) => void;
  canvasState: CanvasMode;
  scaleX?: number;
  scaleY?: number;
  camera: Camera;
}

const BASE_HANDLE_WIDTH = 8;
const MIN_HANDLE_WIDTH = 4;
const MAX_HANDLE_WIDTH = 100;

export const SelectionBox = memo(
  ({ onResizeHandlePointerDown, onArrowLinePointPointerDown, canvasState, scaleX = 1, scaleY = 1, camera }: SelectionBoxProps) => {
    const selection = useSelf((me) => me.presence.selection);
    const selectionCount = selection.length;
    
    const { selectedLayers, hasMultipleSelection } = useSelection();
    const [isShiftKeyPressed, setIsShiftKeyPressed] = useState(false);
    
    // Verifica se è in corso un ridimensionamento di gruppo
    const isGroupResizing = canvasState === CanvasMode.GroupResizing;
    
    // Stato per tenere traccia delle scale correnti durante il resize di gruppo
    const [groupScaleX, setGroupScaleX] = useState(1);
    const [groupScaleY, setGroupScaleY] = useState(1);

    // Calcola le scale per il gruppo durante il resize
    useEffect(() => {
      if (isGroupResizing && canvasState === CanvasMode.GroupResizing) {
        // Le scale verranno aggiornate dalla funzione di resize
        // Per ora manteniamo i valori passati come props
        setGroupScaleX(scaleX);
        setGroupScaleY(scaleY);
      } else {
        setGroupScaleX(1);
        setGroupScaleY(1);
      }
    }, [isGroupResizing, canvasState, scaleX, scaleY]);

    // Calcola la percentuale di scala
    const scalePercentX = Math.round(scaleX * 100);
    const scalePercentY = Math.round(scaleY * 100);
    const scalePercent = isShiftKeyPressed || scalePercentX === scalePercentY 
      ? `${scalePercentX}%` 
      : `${scalePercentX}% × ${scalePercentY}%`;

    // Implemento una formula più precisa per garantire una transizione coerente tra valori di zoom
    // Utilizziamo punti di riferimento precisi:
    // - Scala 2 (200%): handle di ~5px
    // - Scala 1 (100%): handle di 8px (BASE_HANDLE_WIDTH)
    // - Scala 0.5 (50%): handle di ~20px
    // - Scala 0.1 (10%): handle di ~50px
    // - Scala 0.05 (5%): handle di ~80px
    // - Scala 0.01 (1%): handle di ~100px
    
    let handleSize: number;
    
    if (camera.scale >= 1) {
      // Per zoom maggiori o uguali al 100%
      // Formula: BASE_WIDTH * (1/scale)^0.6 per una diminuzione graduale
      handleSize = BASE_HANDLE_WIDTH * Math.pow(1/camera.scale, 0.6);
    } else if (camera.scale >= 0.1) {
      // Per zoom tra 10% e 100%
      // Utilizziamo una formula lineare su scala logaritmica per questo intervallo
      // Formula: BASE_WIDTH * (1/scale)^1.1 
      handleSize = BASE_HANDLE_WIDTH * Math.pow(1/camera.scale, 1.1);
    } else {
      // Per zoom inferiori al 10%
      // Formula più aggressiva: BASE_WIDTH * (1/scale)^0.8 * 2
      // Il moltiplicatore 2 aumenta la dimensione per zoom molto bassi
      handleSize = BASE_HANDLE_WIDTH * Math.pow(1/camera.scale, 0.8) * 2;
    }
    
    // Applichiamo i limiti min/max
    handleSize = Math.min(MAX_HANDLE_WIDTH, Math.max(MIN_HANDLE_WIDTH, handleSize));
    
    // Verifica se c'è esattamente un layer selezionato
    const soleLayerId = selectionCount === 1 ? selection[0] : null;
    
    // Verifica se l'elemento selezionato è una freccia o linea
    const isArrowOrLine = useStorage((root) => {
      if (soleLayerId) {
        const layer = root.layers.get(soleLayerId);
        return layer?.type === LayerType.Arrow || layer?.type === LayerType.Line;
      }
      return false;
    });

    // Ottieni i dati specifici della freccia/linea
    const arrowLineData = useStorage((root) => {
      if (soleLayerId && isArrowOrLine) {
        const layer = root.layers.get(soleLayerId);
        if (layer && (layer.type === LayerType.Arrow || layer.type === LayerType.Line)) {
          return {
            startX: (layer as any).startX,
            startY: (layer as any).startY,
            endX: (layer as any).endX,
            endY: (layer as any).endY,
            type: layer.type
          };
        }
      }
      return null;
    });
    
    // Determina se mostrare gli handle
    // 1. Per un singolo elemento, eccetto Path
    // 2. Per più elementi di tipo resizable (eccetto Path)
    const isShowingHandles = useStorage((root) => {
      // Caso 1: singolo elemento non Path
      if (soleLayerId) {
        return root.layers.get(soleLayerId)?.type !== LayerType.Path;
      }
      
      // Caso 2: selezione multipla di layer resizable
      if (selectionCount > 1) {
        // Conta quanti elementi selezionati sono resizable (tutti eccetto Path)
        const resizableLayers = selectedLayers.filter(layer => 
          layer.type !== LayerType.Path
        );
        
        // Mostra gli handle se ci sono almeno due layer resizable
        return resizableLayers.length >= 2;
      }
      
      return false;
    });
    
    // Gestione tasto Shift per mantenere le proporzioni
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
          setIsShiftKeyPressed(true);
        }
      };
      
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
          setIsShiftKeyPressed(false);
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, []);

    const bounds = useSelectionBounds();

    if (!bounds) {
      return null;
    }

    // Garantiamo che bounds sia del tipo XYWH con un cast di sicurezza
    const typedBounds: XYWH = {
      x: typeof bounds === 'object' && 'x' in bounds ? (bounds as any).x : 0,
      y: typeof bounds === 'object' && 'y' in bounds ? (bounds as any).y : 0,
      width: typeof bounds === 'object' && 'width' in bounds ? (bounds as any).width : 0,
      height: typeof bounds === 'object' && 'height' in bounds ? (bounds as any).height : 0
    };

    return (
      <>
        <rect
          className="fill-transparent stroke-blue-500 stroke-1 pointer-events-none"
          style={{
            transform: `translate(${typedBounds.x}px, ${typedBounds.y}px)`,
          }}
          x={0}
          y={0}
          width={typedBounds.width}
          height={typedBounds.height}
        />
        {isShowingHandles && !isArrowOrLine && (
          <>
            {isShiftKeyPressed && (
              <rect
                className="fill-blue-500/10 stroke-blue-500 stroke-1 pointer-events-none"
                style={{
                  transform: `translate(${typedBounds.x}px, ${typedBounds.y}px)`,
                }}
                x={0}
                y={0}
                width={typedBounds.width}
                height={typedBounds.height}
              />
            )}
            
            {/* Tooltip di scala durante il ridimensionamento (sia gruppo che singolo) */}
            {(isGroupResizing || (canvasState === CanvasMode.Resizing && isShiftKeyPressed)) && (
              <g>
                <rect
                  className="fill-white stroke-1 stroke-blue-500 shadow-md"
                  x={typedBounds.x + typedBounds.width / 2 - 40}
                  y={typedBounds.y - 36}
                  width={80}
                  height={28}
                  rx={4}
                />
                <text
                  className="text-xs fill-blue-800 font-semibold"
                  x={typedBounds.x + typedBounds.width / 2}
                  y={typedBounds.y - 20}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {isShiftKeyPressed ? scalePercent : `${scalePercentX}% × ${scalePercentY}%`}
                </text>
              </g>
            )}
            
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "nwse-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2}px,
                  ${typedBounds.y - handleSize / 2}px
                )
              `,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Top + Side.Left, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "ns-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x + typedBounds.width / 2 - handleSize / 2}px, 
                  ${typedBounds.y - handleSize / 2}px
                )
              `,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Top, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "nesw-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2 + typedBounds.width}px,
                  ${typedBounds.y - handleSize / 2}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Top + Side.Right, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "ew-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2 + typedBounds.width}px, 
                  ${typedBounds.y + typedBounds.height / 2 - handleSize / 2}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Right, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "nwse-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2 + typedBounds.width}px, 
                  ${typedBounds.y - handleSize / 2 + typedBounds.height}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Bottom + Side.Right, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "ns-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x + typedBounds.width / 2 - handleSize / 2}px,
                  ${typedBounds.y - handleSize / 2 + typedBounds.height}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Bottom, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "nesw-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2}px,
                  ${typedBounds.y - handleSize / 2 + typedBounds.height}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Bottom + Side.Left, typedBounds, e);
              }}
            />
            <rect
              className="fill-white stroke-1 stroke-blue-500"
              x={0}
              y={0}
              style={{
                cursor: "ew-resize",
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: `
                translate(
                  ${typedBounds.x - handleSize / 2}px,
                  ${typedBounds.y + typedBounds.height / 2 - handleSize / 2}px
                )`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandlePointerDown(Side.Left, typedBounds, e);
              }}
            />
          </>
        )}
        
        {/* Handle personalizzati per frecce e linee */}
        {isArrowOrLine && arrowLineData && onArrowLinePointPointerDown && (
          <>
            {/* Handle punto di inizio */}
            <circle
              className="fill-white stroke-2 stroke-blue-500"
              cx={arrowLineData.startX}
              cy={arrowLineData.startY}
              r={handleSize / 2}
              style={{
                cursor: "move",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onArrowLinePointPointerDown(true, soleLayerId!);
              }}
            />
            
            {/* Handle punto di fine */}
            <circle
              className="fill-white stroke-2 stroke-blue-500"
              cx={arrowLineData.endX}
              cy={arrowLineData.endY}
              r={handleSize / 2}
              style={{
                cursor: "move",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onArrowLinePointPointerDown(false, soleLayerId!);
              }}
            />
            
            {/* Evidenziazione visiva per frecce */}
            {arrowLineData.type === LayerType.Arrow && (
              <circle
                className="fill-blue-500"
                cx={arrowLineData.endX}
                cy={arrowLineData.endY}
                r={handleSize / 4}
                style={{ pointerEvents: "none" }}
              />
            )}
          </>
        )}
      </>
    );
  },
);

SelectionBox.displayName = "SelectionBox";
