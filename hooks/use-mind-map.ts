"use client";

import { useState, useCallback } from "react";
import { useMutation, useSelf } from "@/liveblocks.config";
import { LiveObject } from "@liveblocks/client";
import { LayerType, type Point, type Color } from "@/types/canvas";

export type ConnectionSide = "top" | "right" | "bottom" | "left";

export const useMindMap = (lastUsedColor: Color, lastUsedFontSize: number = 16, lastUsedFontWeight: string = "normal") => {
  const [hoveredConnection, setHoveredConnection] = useState<{
    noteId: string;
    side: ConnectionSide;
  } | null>(null);

  const currentUser = useSelf();

  // Funzione per calcolare curve automatiche stile Figma
  const calculateAutoCurveControlPoints = useCallback((
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    sourceSide?: ConnectionSide,
    targetSide?: ConnectionSide
  ): { controlPoint1: { x: number; y: number }; controlPoint2: { x: number; y: number } } => {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Fattore di curvatura basato sulla distanza (più lontano = più curvo)
    const curveFactor = Math.min(distance * 0.4, 150); // Max 150px di curvatura
    
    let control1X = startX;
    let control1Y = startY;
    let control2X = endX;
    let control2Y = endY;
    
    // Calcola punti di controllo basati sui lati delle note
    if (sourceSide) {
      switch (sourceSide) {
        case "top":
          control1Y = startY - curveFactor;
          break;
        case "bottom":
          control1Y = startY + curveFactor;
          break;
        case "left":
          control1X = startX - curveFactor;
          break;
        case "right":
          control1X = startX + curveFactor;
          break;
      }
    } else {
      // Se non c'è lato sorgente, usa direzione generale
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        control1X = startX + (deltaX > 0 ? curveFactor : -curveFactor);
      } else {
        control1Y = startY + (deltaY > 0 ? curveFactor : -curveFactor);
      }
    }
    
    if (targetSide) {
      switch (targetSide) {
        case "top":
          control2Y = endY - curveFactor;
          break;
        case "bottom":
          control2Y = endY + curveFactor;
          break;
        case "left":
          control2X = endX - curveFactor;
          break;
        case "right":
          control2X = endX + curveFactor;
          break;
      }
    } else {
      // Se non c'è lato target, usa direzione generale
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        control2X = endX + (deltaX > 0 ? -curveFactor : curveFactor);
      } else {
        control2Y = endY + (deltaY > 0 ? -curveFactor : curveFactor);
      }
    }
    
    return {
      controlPoint1: { x: control1X, y: control1Y },
      controlPoint2: { x: control2X, y: control2Y }
    };
  }, []);

  // Calcola la posizione del punto di connessione
  const getConnectionPoint = useCallback((
    noteX: number,
    noteY: number,
    noteWidth: number,
    noteHeight: number,
    side: ConnectionSide
  ): Point => {
    switch (side) {
      case "top":
        return { x: noteX + noteWidth / 2, y: noteY };
      case "right":
        return { x: noteX + noteWidth, y: noteY + noteHeight / 2 };
      case "bottom":
        return { x: noteX + noteWidth / 2, y: noteY + noteHeight };
      case "left":
        return { x: noteX, y: noteY + noteHeight / 2 };
      default:
        return { x: noteX, y: noteY };
    }
  }, []);

  // Calcola la posizione per la nuova nota
  const calculateNewNotePosition = useCallback((
    sourceNote: { x: number; y: number; width: number; height: number },
    side: ConnectionSide
  ): Point => {
    const offset = 150; // Distanza dalla nota originale
    const noteSize = Math.max(sourceNote.width, sourceNote.height); // Dimensione quadrata

    switch (side) {
      case "top":
        return {
          x: sourceNote.x + (sourceNote.width - noteSize) / 2,
          y: sourceNote.y - offset - noteSize
        };
      case "right":
        return {
          x: sourceNote.x + sourceNote.width + offset,
          y: sourceNote.y + (sourceNote.height - noteSize) / 2
        };
      case "bottom":
        return {
          x: sourceNote.x + (sourceNote.width - noteSize) / 2,
          y: sourceNote.y + sourceNote.height + offset
        };
      case "left":
        return {
          x: sourceNote.x - offset - noteSize,
          y: sourceNote.y + (sourceNote.height - noteSize) / 2
        };
      default:
        return { x: sourceNote.x, y: sourceNote.y };
    }
  }, []);

  // Crea una nota collegata con freccia
  const createConnectedNote = useMutation(
    ({ storage }, sourceNoteId: string, side: ConnectionSide) => {
      console.log("🔗 createConnectedNote mutation started:", { sourceNoteId, side });
      
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");
      const sourceNote = liveLayers.get(sourceNoteId);
      
      if (!sourceNote || sourceNote.get("type") !== LayerType.Note) {
        console.error("❌ Source note not found or not a note:", sourceNote?.get("type"));
        return;
      }

      const sourceNoteData = sourceNote.toObject() as any;
      console.log("📝 Source note data:", sourceNoteData);
      
      // Calcola posizione per la nuova nota
      const newNotePosition = calculateNewNotePosition(sourceNoteData, side);
      console.log("📍 New note position:", newNotePosition);
      
      // Calcola la dimensione quadrata una sola volta
      const noteSize = Math.max(sourceNoteData.width, sourceNoteData.height);
      
      // Crea la nuova nota con le stesse dimensioni (quadrata se necessario)
      const newNoteId = crypto.randomUUID();
      const newNote = new LiveObject({
        type: LayerType.Note as LayerType.Note,
        x: newNotePosition.x,
        y: newNotePosition.y,
        width: noteSize,
        height: noteSize,
        fill: lastUsedColor,
        value: "",
        fontSize: sourceNoteData.fontSize || lastUsedFontSize, // Eredita dimensione testo dalla nota padre o usa l'ultima utilizzata
        fontWeight: sourceNoteData.fontWeight || lastUsedFontWeight, // Eredita peso carattere dalla nota padre o usa l'ultimo utilizzato
        lastModifiedBy: currentUser?.info?.name || "User",
        lastModifiedAt: new Date().toISOString(),
        showMetadata: sourceNoteData.showMetadata !== undefined ? sourceNoteData.showMetadata : true, // Eredita impostazione metadata dalla nota padre
        connections: {
          incoming: [], // Sarà popolato dopo la creazione della freccia
          outgoing: []
        }
      });
      
      liveLayers.set(newNoteId, newNote);
      liveLayerIds.push(newNoteId);
      console.log("✅ New note created:", newNoteId);

      // Calcola i punti di connessione precisi sui bordi delle note
      const sourceConnectionPoint = getConnectionPoint(
        sourceNoteData.x,
        sourceNoteData.y,
        sourceNoteData.width,
        sourceNoteData.height,
        side
      );

      // Calcola il lato opposto per la nota target
      const targetSide = side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";
      const targetConnectionPoint = getConnectionPoint(
        newNotePosition.x,
        newNotePosition.y,
        noteSize, // Usa la dimensione quadrata
        noteSize,
        targetSide
      );

      // Crea la freccia di collegamento con curve automatiche stile Figma
      const arrowId = crypto.randomUUID();
      
      // Usa la funzione di curve automatiche per consistenza con le frecce snappate
      const { controlPoint1, controlPoint2 } = calculateAutoCurveControlPoints(
        sourceConnectionPoint.x,
        sourceConnectionPoint.y,
        targetConnectionPoint.x,
        targetConnectionPoint.y,
        side,
        targetSide
      );
      
      // Calcola il bounding box per la freccia includendo i punti di controllo
      const allX = [sourceConnectionPoint.x, targetConnectionPoint.x, controlPoint1.x, controlPoint2.x];
      const allY = [sourceConnectionPoint.y, targetConnectionPoint.y, controlPoint1.y, controlPoint2.y];
      
      const minX = Math.min(...allX);
      const minY = Math.min(...allY);
      const maxX = Math.max(...allX);
      const maxY = Math.max(...allY);
      
      const baseWidth = Math.max(maxX - minX, 50);
      const baseHeight = Math.max(maxY - minY, 20);
      
      // Spazio extra per la freccia
      const extraSpace = 35;
      const finalX = minX - extraSpace;
      const finalY = minY - extraSpace;
      const finalWidth = baseWidth + (extraSpace * 2);
      const finalHeight = baseHeight + (extraSpace * 2);

      const arrow = new LiveObject({
        type: LayerType.Arrow as LayerType.Arrow,
        x: finalX,
        y: finalY,
        width: finalWidth,
        height: finalHeight,
        fill: { r: 107, g: 114, b: 128 }, // Grigio scuro per le frecce di connessione
        startX: sourceConnectionPoint.x,
        startY: sourceConnectionPoint.y,
        endX: targetConnectionPoint.x,
        endY: targetConnectionPoint.y,
        strokeWidth: 2,
        // Aggiunge punti di controllo per curve Bézier
        controlPoint1X: controlPoint1.x,
        controlPoint1Y: controlPoint1.y,
        controlPoint2X: controlPoint2.x,
        controlPoint2Y: controlPoint2.y,
        curved: true, // Flag per indicare che è una freccia curva
        // Metadati per connessioni Mind Map
        sourceNoteId: sourceNoteId,
        targetNoteId: newNoteId,
        sourceSide: side as "top" | "right" | "bottom" | "left",
        targetSide: targetSide as "top" | "right" | "bottom" | "left",
        isMindMapConnection: true,
      });

      liveLayers.set(arrowId, arrow);
      liveLayerIds.push(arrowId);
      console.log("✅ Arrow created:", arrowId);

      console.log("🎯 Mind map creation completed:", { newNoteId, arrowId });
      return newNoteId;
    },
    [lastUsedColor, lastUsedFontSize, lastUsedFontWeight, currentUser, calculateNewNotePosition, getConnectionPoint, calculateAutoCurveControlPoints]
  );

  return {
    hoveredConnection,
    setHoveredConnection,
    createConnectedNote,
    getConnectionPoint,
  };
}; 