"use client";

import { useEffect, useMemo, useState } from "react";

import { type CanvasProps } from "./canvas";
import { BoardDesktopRuntime } from "./board-desktop-runtime";
import { BoardMobileRuntime } from "./board-mobile-runtime";
import { isMobileBoardV2Enabled } from "@/lib/feature-flags";

const detectMobileClient = () => {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const hasTouch = navigator.maxTouchPoints > 0;
  const smallViewport = window.innerWidth <= 1024;
  return (coarsePointer || hasTouch) && smallViewport;
};

export const BoardRuntimeSwitch = (props: CanvasProps) => {
  const mobileBoardV2Enabled = useMemo(() => isMobileBoardV2Enabled(), []);
  const [isMobileClient, setIsMobileClient] = useState(false);

  useEffect(() => {
    const update = () => setIsMobileClient(detectMobileClient());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const useMobileRuntime = mobileBoardV2Enabled && isMobileClient;

  if (useMobileRuntime) {
    return <BoardMobileRuntime {...props} />;
  }

  return <BoardDesktopRuntime {...props} />;
};
