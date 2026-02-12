"use client";

import { Canvas, type CanvasProps } from "./canvas";

export const BoardMobileRuntime = (props: CanvasProps) => {
  return <Canvas {...props} runtimeMode="mobile" />;
};
