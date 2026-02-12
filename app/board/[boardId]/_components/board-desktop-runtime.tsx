"use client";

import { Canvas, type CanvasProps } from "./canvas";

export const BoardDesktopRuntime = (props: CanvasProps) => {
  return <Canvas {...props} runtimeMode="desktop" />;
};
