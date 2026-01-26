import { colorToCSS } from "@/lib/utils";
import { ArrowLayer } from "@/types/canvas";

interface ArrowProps {
  id: string;
  layer: ArrowLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
}

export const Arrow = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
}: ArrowProps) => {
  const { 
    x, y, width, height, fill, startX, startY, endX, endY, strokeWidth = 2,
    controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, curved = false
  } = layer;

  // Calcola le coordinate relative alla posizione del layer
  const relativeStartX = startX - x;
  const relativeStartY = startY - y;
  const relativeEndX = endX - x;
  const relativeEndY = endY - y;

  // Calcola i punti di controllo relativi se esistono
  const relativeControlPoint1X = controlPoint1X ? controlPoint1X - x : relativeStartX;
  const relativeControlPoint1Y = controlPoint1Y ? controlPoint1Y - y : relativeStartY;
  const relativeControlPoint2X = controlPoint2X ? controlPoint2X - x : relativeEndX;
  const relativeControlPoint2Y = controlPoint2Y ? controlPoint2Y - y : relativeEndY;

  // Calcola l'angolo della freccia (per curve, usa la direzione finale)
  let angle;
  if (curved && controlPoint2X && controlPoint2Y) {
    // Per curve, calcola l'angolo basato sulla direzione del punto di controllo finale
    angle = Math.atan2(relativeEndY - relativeControlPoint2Y, relativeEndX - relativeControlPoint2X);
  } else {
    angle = Math.atan2(relativeEndY - relativeStartY, relativeEndX - relativeStartX);
  }
  
  // Calcola la lunghezza effettiva della freccia
  const arrowLength = curved 
    ? Math.sqrt(Math.pow(relativeEndX - relativeControlPoint2X, 2) + Math.pow(relativeEndY - relativeControlPoint2Y, 2))
    : Math.sqrt(Math.pow(relativeEndX - relativeStartX, 2) + Math.pow(relativeEndY - relativeStartY, 2));
  
  // Dimensioni della testa della freccia
  const arrowHeadLength = Math.min(Math.max(arrowLength * 0.2, 8), 25);
  
  // Calcola i punti della testa della freccia
  const arrowHead1X = relativeEndX - arrowHeadLength * Math.cos(angle - Math.PI / 6);
  const arrowHead1Y = relativeEndY - arrowHeadLength * Math.sin(angle - Math.PI / 6);
  const arrowHead2X = relativeEndX - arrowHeadLength * Math.cos(angle + Math.PI / 6);
  const arrowHead2Y = relativeEndY - arrowHeadLength * Math.sin(angle + Math.PI / 6);

  return (
    <foreignObject
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
      <svg
        className="h-full w-full"
        style={{
          overflow: 'visible'
        }}
      >
        {/* Linea principale - lineare o curva */}
        {curved && controlPoint1X && controlPoint1Y && controlPoint2X && controlPoint2Y ? (
          <path
            d={`M ${relativeStartX} ${relativeStartY} C ${relativeControlPoint1X} ${relativeControlPoint1Y}, ${relativeControlPoint2X} ${relativeControlPoint2Y}, ${relativeEndX} ${relativeEndY}`}
            stroke={colorToCSS(fill)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <line
            x1={relativeStartX}
            y1={relativeStartY}
            x2={relativeEndX}
            y2={relativeEndY}
            stroke={colorToCSS(fill)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        
        {/* Testa della freccia */}
        <polygon
          points={`${relativeEndX},${relativeEndY} ${arrowHead1X},${arrowHead1Y} ${arrowHead2X},${arrowHead2Y}`}
          fill={colorToCSS(fill)}
          stroke={colorToCSS(fill)}
          strokeWidth={strokeWidth / 2}
          strokeLinejoin="round"
        />
      </svg>
    </foreignObject>
  );
}; 