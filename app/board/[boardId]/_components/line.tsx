import { colorToCSS } from "@/lib/utils";
import { LineLayer } from "@/types/canvas";

interface LineProps {
  id: string;
  layer: LineLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
}

export const Line = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
}: LineProps) => {
  const { x, y, width, height, fill, startX, startY, endX, endY, strokeWidth = 2 } = layer;

  // Calcola le coordinate relative alla posizione del layer
  const relativeStartX = startX - x;
  const relativeStartY = startY - y;
  const relativeEndX = endX - x;
  const relativeEndY = endY - y;

  return (
    <foreignObject
      data-layer-id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      onPointerDown={(e) => onPointerDown(e, id)}
      style={{
        outline: selectionColor ? `2px solid ${selectionColor}` : "none",
        outlineOffset: "2px",
      }}
      className={layer.shadow === false ? undefined : "drop-shadow-md"}
    >
      <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full">
        <svg
          className="h-full w-full"
          style={{
            overflow: 'visible'
          }}
        >
          <line
            x1={relativeStartX}
            y1={relativeStartY}
            x2={relativeEndX}
            y2={relativeEndY}
            stroke={colorToCSS(fill)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </foreignObject>
  );
}; 
