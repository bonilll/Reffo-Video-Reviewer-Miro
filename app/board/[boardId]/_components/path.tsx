import { getSvgPathFromStroke } from "@/lib/utils";
import getStroke from "perfect-freehand";
import React from "react";

type PathProps = {
  id?: string;
  x: number;
  y: number;
  points: number[][];
  fill: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  stroke?: string;
  strokeWidth?: number;
};

export const Path = ({
  id,
  x,
  y,
  points,
  fill,
  onPointerDown,
  stroke,
  strokeWidth = 16,
}: PathProps) => {
  return (
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
      transform={`translate(${x} ${y})`}
      x={0}
      y={0}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
    />
  );
};
