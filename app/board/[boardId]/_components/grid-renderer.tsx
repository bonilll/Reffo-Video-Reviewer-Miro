"use client";

import { memo, useMemo } from "react";
import { Camera } from "@/types/canvas";
import { GridConfig } from "./grid-settings";

interface GridRendererProps {
  camera: Camera;
  config: GridConfig;
}

export const GridRenderer = memo(({ camera, config }: GridRendererProps) => {
  // Calcola i dati della griglia
  const gridData = useMemo(() => {
    const { x, y, scale } = camera;
    
    // Range di visibilità più ampio
    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 10.0;
    
    // Se lo zoom è fuori range, nascondi la griglia
    if (scale < MIN_ZOOM || scale > MAX_ZOOM) {
      return { visible: false };
    }
    
    // Sistema di scaling più semplice e robusto
    let gridSize = config.size;
    let scaleMultiplier = 1;
    
    // Adatta la densità della griglia in base allo zoom per evitare troppi o troppo pochi punti
    while (gridSize * scale < 10 && scale < 1) {
      // Se la griglia diventa troppo piccola (meno di 10px), raddoppia la spaziatura
      scaleMultiplier *= 2;
      gridSize = config.size * scaleMultiplier;
    }
    
    while (gridSize * scale > 150 && scale > 1) {
      // Se la griglia diventa troppo grande (più di 150px), dimezza la spaziatura
      scaleMultiplier *= 0.5;
      gridSize = config.size * scaleMultiplier;
    }
    
    // Calcola opacità dinamica basata sullo zoom per migliore visibilità
    let dynamicOpacity = config.opacity;
    
    // Aumenta l'opacità quando lo zoom è basso per mantenere visibilità
    if (scale < 0.5) {
      dynamicOpacity = Math.min(config.opacity * 1.5, 0.8);
    } else if (scale > 2) {
      dynamicOpacity = Math.max(config.opacity * 0.7, 0.1);
    }
    
    // Calcola dimensioni del viewport con margine generoso
    const margin = Math.max(window.innerWidth, window.innerHeight);
    
    // Calcola i bounds dell'area visibile in coordinate mondiali
    const worldLeft = (-x - margin) / scale;
    const worldTop = (-y - margin) / scale;
    const worldRight = (window.innerWidth - x + margin) / scale;
    const worldBottom = (window.innerHeight - y + margin) / scale;
    
    // Calcola la dimensione unitaria della griglia in coordinate mondiali
    const unitSize = gridSize;
    
    // Calcola i limiti in unità di griglia con migliore precisione
    const startGridX = Math.floor(worldLeft / unitSize);
    const endGridX = Math.ceil(worldRight / unitSize);
    const startGridY = Math.floor(worldTop / unitSize);
    const endGridY = Math.ceil(worldBottom / unitSize);
    
    // Genera i punti della griglia con coordinate esatte
    const dots: Array<{ x: number; y: number; isAccent: boolean }> = [];
    
    for (let gridX = startGridX; gridX <= endGridX; gridX++) {
      for (let gridY = startGridY; gridY <= endGridY; gridY++) {
        // Usa coordinate esatte della griglia per evitare deriva
        const worldX = gridX * unitSize;
        const worldY = gridY * unitSize;
        
        // Determina se questo è un punto di accento (ogni 5° punto)
        const isAccent = config.showAccents && 
                        (gridX % 5 === 0 && gridY % 5 === 0);
        
        dots.push({
          x: worldX,
          y: worldY,
          isAccent
        });
      }
    }
    
    // Calcola dimensioni dei punti in base allo zoom - Formula migliorata
    const baseDotSize = 1.0; // Dimensione base ridotta
    const baseAccentSize = 1.6; // Dimensione accenti ridotta
    
    // Formula più reattiva per lo zoom con range più ampio
    const zoomFactor = Math.pow(scale, 0.6); // Esponente ridotto per transizione più graduale
    const dotRadius = Math.max(0.4, Math.min(4, baseDotSize * zoomFactor));
    const accentDotRadius = Math.max(0.8, Math.min(6, baseAccentSize * zoomFactor));
    
    // Aggiusta ulteriormente per zoom estremi
    let finalDotRadius = dotRadius;
    let finalAccentRadius = accentDotRadius;
    
    if (scale < 0.5) {
      // A zoom molto bassi, aumenta leggermente per visibilità
      finalDotRadius = Math.min(finalDotRadius * 1.3, 2.5);
      finalAccentRadius = Math.min(finalAccentRadius * 1.3, 4);
    } else if (scale > 3) {
      // A zoom molto alti, riduci per evitare sovrapposizione
      finalDotRadius = Math.max(finalDotRadius * 0.8, 0.6);
      finalAccentRadius = Math.max(finalAccentRadius * 0.8, 1.2);
    }
    
    // Parametri per il pattern SVG
    const patternSize = unitSize;
    
    // Calcola l'offset corretto per allineare i pattern alla griglia
    // Trova il punto di griglia più vicino all'angolo in alto a sinistra
    const gridOriginX = Math.floor(worldLeft / unitSize) * unitSize;
    const gridOriginY = Math.floor(worldTop / unitSize) * unitSize;
    
    // Usa pattern solo se ci sono molti punti per migliorare le performance
    const usePattern = dots.length > 300;
    
    return {
      visible: true,
      dots,
      opacity: dynamicOpacity,
      dotRadius: finalDotRadius,
      accentDotRadius: finalAccentRadius,
      usePattern,
      patternSize,
      gridOriginX,
      gridOriginY,
      bounds: { worldLeft, worldTop, worldRight, worldBottom },
      debugInfo: {
        scale,
        gridSize,
        scaleMultiplier,
        unitSize,
        dotsCount: dots.length
      }
    };
  }, [camera, config]);
  
  // Se non visibile, non renderizzare
  if (!gridData.visible) {
    return null;
  }
  
  const { 
    dots, 
    opacity, 
    dotRadius, 
    accentDotRadius, 
    usePattern, 
    patternSize, 
    gridOriginX, 
    gridOriginY, 
    bounds 
  } = gridData;
  
  // Debug: log delle informazioni della griglia
  
  // Renderizza in base al tipo di griglia
  if (config.type === "lines") {
    // Calcola le linee della griglia
    const gridSize = gridData.debugInfo.gridSize;
    const startGridX = Math.floor(bounds.worldLeft / gridSize);
    const endGridX = Math.ceil(bounds.worldRight / gridSize);
    const startGridY = Math.floor(bounds.worldTop / gridSize);
    const endGridY = Math.ceil(bounds.worldBottom / gridSize);
    
    const lines = [];
    
    // Linee verticali
    for (let gridX = startGridX; gridX <= endGridX; gridX++) {
      const x = gridX * gridSize;
      const isAccentLine = config.showAccents && gridX % 5 === 0;
      lines.push({
        type: 'vertical',
        x,
        isAccent: isAccentLine
      });
    }
    
    // Linee orizzontali
    for (let gridY = startGridY; gridY <= endGridY; gridY++) {
      const y = gridY * gridSize;
      const isAccentLine = config.showAccents && gridY % 5 === 0;
      lines.push({
        type: 'horizontal',
        y,
        isAccent: isAccentLine
      });
    }
    
    // Calcola spessore delle linee in base allo zoom
    const baseStrokeWidth = 0.5;
    const accentStrokeWidth = 1.0;
    const strokeWidth = Math.max(0.3, Math.min(1.5, baseStrokeWidth * Math.sqrt(camera.scale)));
    const accentStroke = Math.max(0.5, Math.min(2.5, accentStrokeWidth * Math.sqrt(camera.scale)));
    
    return (
      <g className="grid-background" style={{ pointerEvents: "none" }}>
        {/* Rendering delle linee */}
        {lines.map((line, index) => {
          if (line.type === 'vertical') {
            return (
              <line
                key={`vline-${index}`}
                x1={line.x}
                y1={bounds.worldTop}
                x2={line.x}
                y2={bounds.worldBottom}
                stroke={config.color}
                strokeWidth={line.isAccent ? accentStroke : strokeWidth}
                opacity={line.isAccent ? Math.min(opacity * 1.4, 0.9) : opacity}
              />
            );
          } else {
            return (
              <line
                key={`hline-${index}`}
                x1={bounds.worldLeft}
                y1={line.y}
                x2={bounds.worldRight}
                y2={line.y}
                stroke={config.color}
                strokeWidth={line.isAccent ? accentStroke : strokeWidth}
                opacity={line.isAccent ? Math.min(opacity * 1.4, 0.9) : opacity}
              />
            );
          }
        })}
      </g>
    );
  }
  
  // Se ci sono troppi punti, usa un pattern SVG per migliorare le performance
  if (usePattern) {
    // Genera ID unici per evitare conflitti tra istanze multiple
    const patternId = `grid-dots-${Math.round(camera.scale * 1000)}-${Math.round(camera.x)}-${Math.round(camera.y)}`;
    const accentPatternId = `grid-accents-${Math.round(camera.scale * 1000)}-${Math.round(camera.x)}-${Math.round(camera.y)}`;
    
    return (
      <g className="grid-background" style={{ pointerEvents: "none" }}>
        <defs>
          <pattern
            id={patternId}
            x={0}
            y={0}
            width={patternSize}
            height={patternSize}
            patternUnits="userSpaceOnUse"
          >
            {/* Punto normale al centro */}
            <circle
              cx={patternSize / 2}
              cy={patternSize / 2}
              r={dotRadius}
              fill={config.color}
              opacity={opacity}
            />
          </pattern>
          
          {/* Pattern separato per i punti di accento ogni 5 unità */}
          {config.showAccents && (
            <pattern
              id={accentPatternId}
              x={0}
              y={0}
              width={patternSize * 5}
              height={patternSize * 5}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={patternSize * 2.5}
                cy={patternSize * 2.5}
                r={accentDotRadius}
                fill={config.color}
                opacity={Math.min(opacity * 1.4, 0.9)}
              />
            </pattern>
          )}
        </defs>
        
        {/* Rettangolo riempito con il pattern base - allineato alla griglia */}
        <rect
          x={gridOriginX}
          y={gridOriginY}
          width={bounds.worldRight - gridOriginX}
          height={bounds.worldBottom - gridOriginY}
          fill={`url(#${patternId})`}
        />
        
        {/* Rettangolo riempito con il pattern di accento - allineato alla griglia */}
        {config.showAccents && (
          <rect
            x={Math.floor(gridOriginX / (patternSize * 5)) * (patternSize * 5)}
            y={Math.floor(gridOriginY / (patternSize * 5)) * (patternSize * 5)}
            width={bounds.worldRight - Math.floor(gridOriginX / (patternSize * 5)) * (patternSize * 5)}
            height={bounds.worldBottom - Math.floor(gridOriginY / (patternSize * 5)) * (patternSize * 5)}
            fill={`url(#${accentPatternId})`}
          />
        )}
      </g>
    );
  }
  
  // Per pochi punti, renderizza individualmente per miglior controllo
  return (
    <g className="grid-background" style={{ pointerEvents: "none" }}>
      {/* Renderizza tutti i punti normali */}
      {dots.filter(dot => !dot.isAccent).map((dot, index) => (
        <circle
          key={`dot-${index}`}
          cx={dot.x}
          cy={dot.y}
          r={dotRadius}
          fill={config.color}
          opacity={opacity}
        />
      ))}
      
      {/* Renderizza i punti di accento (se abilitati) */}
      {config.showAccents && dots.filter(dot => dot.isAccent).map((dot, index) => (
        <circle
          key={`accent-dot-${index}`}
          cx={dot.x}
          cy={dot.y}
          r={accentDotRadius}
          fill={config.color}
          opacity={Math.min(opacity * 1.4, 0.9)}
        />
      ))}
    </g>
  );
});

GridRenderer.displayName = "GridRenderer"; 