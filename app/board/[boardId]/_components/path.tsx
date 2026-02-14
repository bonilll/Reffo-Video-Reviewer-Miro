import { getSvgPathFromStroke } from "@/lib/utils";
import getStroke from "perfect-freehand";
import React from "react";

type PathProps = {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points: number[][];
  fill: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  stroke?: string;
  strokeWidth?: number;
  isSelected?: boolean;
};

export const Path = ({
  id,
  x,
  y,
  width,
  height,
  points,
  fill,
  onPointerDown,
  stroke,
  strokeWidth = 16,
  isSelected = false,
}: PathProps) => {
  const shouldRenderSelectionHitArea =
    isSelected &&
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0 &&
    !!onPointerDown;

  return (
    <g transform={`translate(${x} ${y})`}>
      {shouldRenderSelectionHitArea && (
        <rect
          data-layer-id={id}
          x={0}
          y={0}
          width={Math.max(width!, 1)}
          height={Math.max(height!, 1)}
          fill="rgba(0, 0, 0, 0.001)"
          stroke="none"
          pointerEvents="all"
          onPointerDown={onPointerDown}
        />
      )}
      <path
        data-layer-id={id}
        className="drop-shadow-md"
        onPointerDown={onPointerDown}
        d={getSvgPathFromStroke(
          getStroke(points, {
            size: strokeWidth,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
          }),
        )}
        x={0}
        y={0}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    </g>
  );
};
