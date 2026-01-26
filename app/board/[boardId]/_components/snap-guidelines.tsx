"use client";

import React from "react";
import { SnapLine, calculateGuidelineOpacity } from "@/lib/snap-utils";
import type { Camera } from "@/types/canvas";

interface SnapGuidelinesProps {
  snapLines: SnapLine[];
  camera: Camera;
  currentLayerX?: number;
  currentLayerY?: number;
  currentLayerWidth?: number;
  currentLayerHeight?: number;
}

/**
 * Renderizza le linee guida visive durante il drag di layer
 * Le linee appaiono con opacità basata sulla distanza dal layer
 */
export const SnapGuidelines = React.memo(({ 
  snapLines, 
  camera, 
  currentLayerX, 
  currentLayerY, 
  currentLayerWidth, 
  currentLayerHeight 
}: SnapGuidelinesProps) => {
  if (!snapLines || snapLines.length === 0) {
    return null;
  }

  return (
    <g className="snap-guidelines">
      {snapLines.map((snapLine, index) => {
        const key = `${snapLine.source}-${snapLine.edge}-${index}`;
        
        // Calcola opacità dinamica se abbiamo informazioni sul layer corrente
        let opacity = 0.8; // Default opacity
        if (currentLayerX !== undefined && currentLayerY !== undefined && 
            currentLayerWidth !== undefined && currentLayerHeight !== undefined) {
          opacity = calculateGuidelineOpacity(
            snapLine, 
            currentLayerX, 
            currentLayerY, 
            currentLayerWidth, 
            currentLayerHeight
          );
        }
        
        if (snapLine.type === 'vertical') {
          // Linea verticale che attraversa tutto il viewport
          const x = snapLine.value;
          const y1 = -camera.y / camera.scale;
          const y2 = (-camera.y + window.innerHeight) / camera.scale;
          
          return (
            <line
              key={key}
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke="#3b82f6"
              strokeWidth={1 / camera.scale}
              strokeDasharray={`${4 / camera.scale} ${2 / camera.scale}`}
              opacity={opacity}
              style={{
                pointerEvents: 'none',
                vectorEffect: 'non-scaling-stroke',
                transition: 'opacity 0.1s ease-out'
              }}
            />
          );
        } else {
          // Linea orizzontale che attraversa tutto il viewport
          const y = snapLine.value;
          const x1 = -camera.x / camera.scale;
          const x2 = (-camera.x + window.innerWidth) / camera.scale;
          
          return (
            <line
              key={key}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="#3b82f6"
              strokeWidth={1 / camera.scale}
              strokeDasharray={`${4 / camera.scale} ${2 / camera.scale}`}
              opacity={opacity}
              style={{
                pointerEvents: 'none',
                vectorEffect: 'non-scaling-stroke',
                transition: 'opacity 0.1s ease-out'
              }}
            />
          );
        }
      })}
    </g>
  );
});

SnapGuidelines.displayName = "SnapGuidelines";