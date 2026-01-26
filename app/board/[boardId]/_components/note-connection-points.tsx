"use client";

import { memo } from "react";
import { Plus } from "lucide-react";
import { useMindMap, type ConnectionSide } from "@/hooks/use-mind-map";
import { useStorage, useSelf } from "@/liveblocks.config";
import { LayerType } from "@/types/canvas";

interface NoteConnectionPointsProps {
  lastUsedColor: { r: number; g: number; b: number };
  lastUsedFontSize: number;
  lastUsedFontWeight: string;
}

export const NoteConnectionPoints = memo(({ lastUsedColor, lastUsedFontSize, lastUsedFontWeight }: NoteConnectionPointsProps) => {
  const { hoveredConnection, setHoveredConnection, createConnectedNote } = useMindMap(lastUsedColor, lastUsedFontSize, lastUsedFontWeight);
  const selection = useSelf((me) => me.presence.selection);

  // Ottieni tutte le note selezionate con posizioni aggiornate in tempo reale
  const selectedNotes = useStorage((root) => {
    const notes = selection
      .map(id => {
        const layer = root.layers.get(id);
        if (layer && layer.type === LayerType.Note) {
          return {
            id,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            isEditing: false, // TODO: Come determinare se è in editing?
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        isEditing: boolean;
      }>;
    
    return notes;
  });

  // Gestisce la creazione di note collegate
  const handleConnectionClick = (noteId: string, side: ConnectionSide, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("🎯 handleConnectionClick called:", { noteId, side });
    
    try {
      const result = createConnectedNote(noteId, side);
      console.log("✅ createConnectedNote result:", result);
    } catch (error) {
      console.error("❌ Error in createConnectedNote:", error);
    }
  };

  // Calcola la posizione del punto di connessione
  const getConnectionPoint = (
    noteX: number,
    noteY: number,
    noteWidth: number,
    noteHeight: number,
    side: ConnectionSide
  ) => {
    const offset = 35; // Maggiore distanza dalla nota
    switch (side) {
      case "top":
        return { x: noteX + noteWidth / 2, y: noteY - offset };
      case "right":
        return { x: noteX + noteWidth + offset, y: noteY + noteHeight / 2 };
      case "bottom":
        return { x: noteX + noteWidth / 2, y: noteY + noteHeight + offset };
      case "left":
        return { x: noteX - offset, y: noteY + noteHeight / 2 };
      default:
        return { x: noteX, y: noteY };
    }
  };

  return (
    <>
      {selectedNotes.map((note) => {
        if (note.isEditing) return null; // Non mostrare durante editing

        const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];
        
        return sides.map((side) => {
          const point = getConnectionPoint(note.x, note.y, note.width, note.height, side);
          const isHovered = hoveredConnection?.noteId === note.id && hoveredConnection?.side === side;
          
          return (
            <g key={`${note.id}-${side}`}>
              {/* Area di click invisibile più grande */}
              <circle
                cx={point.x}
                cy={point.y}
                r={20}
                fill="transparent"
                style={{
                  cursor: "pointer",
                  pointerEvents: "all",
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  setHoveredConnection({ noteId: note.id, side });
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  setHoveredConnection(null);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log("🔗 Connection area mouse down:", { noteId: note.id, side });
                  handleConnectionClick(note.id, side, e as any);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log("🔗 Connection area clicked:", { noteId: note.id, side });
                  handleConnectionClick(note.id, side, e);
                }}
              />
              
              {/* Anello esterno per effetto moderno */}
              <circle
                cx={point.x}
                cy={point.y}
                r={16}
                fill="none"
                stroke={isHovered ? "#374151" : "#6b7280"}
                strokeWidth={1}
                opacity={isHovered ? 0.8 : 0.4}
                style={{
                  pointerEvents: "none",
                }}
              />
              
              {/* Cerchio principale */}
              <circle
                cx={point.x}
                cy={point.y}
                r={12}
                fill={isHovered ? "#1f2937" : "#374151"}
                stroke={isHovered ? "#9ca3af" : "#6b7280"}
                strokeWidth={1.5}
                style={{
                  filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))",
                  pointerEvents: "none",
                }}
              />
              
              {/* Icona Plus */}
              <foreignObject
                x={point.x - 7}
                y={point.y - 7}
                width={14}
                height={14}
                style={{ pointerEvents: "none" }}
              >
                <div className="flex items-center justify-center w-full h-full">
                  <Plus 
                    className={`w-3.5 h-3.5 ${
                      isHovered ? "text-gray-200" : "text-gray-400"
                    }`} 
                  />
                </div>
              </foreignObject>
            </g>
          );
        });
      })}
    </>
  );
});

NoteConnectionPoints.displayName = "NoteConnectionPoints"; 