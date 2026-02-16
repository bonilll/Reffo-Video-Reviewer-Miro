import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail } from "lucide-react";

import { PublicMuralBoard } from "./PublicMuralBoard";

type FooterCopy = {
  privacy: string;
  cookies: string;
  terms: string;
};

type AuthLandingProps = {
  logoSrc: string;
  googleLogoSrc: string;
  onGoogleSignIn: () => void;
  renderEmailAuthSection: () => React.ReactNode;
  footerCopy: FooterCopy;
  onNavigate: (path: string) => void;
  languageSwitcher?: React.ReactNode;
};

const PANEL_MARGIN = 16;
const PANEL_FOOTER_CLEARANCE = 110;

const clampPanelPosition = (
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number
) => {
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - panelWidth - PANEL_MARGIN);
  const maxY = Math.max(
    PANEL_MARGIN,
    window.innerHeight - panelHeight - PANEL_FOOTER_CLEARANCE
  );
  return {
    x: Math.min(Math.max(x, PANEL_MARGIN), maxX),
    y: Math.min(Math.max(y, PANEL_MARGIN), maxY),
  };
};

export function AuthLanding({
  logoSrc,
  googleLogoSrc,
  onGoogleSignIn,
  renderEmailAuthSection,
  footerCopy,
  onNavigate,
}: AuthLandingProps) {
  const legalLabels = useMemo(
    () => ({
      privacy: footerCopy.privacy || "Privacy Policy",
      cookies: footerCopy.cookies || "Cookie Policy",
      terms: footerCopy.terms || "Terms of Use",
    }),
    [footerCopy],
  );
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    panelWidth: number;
    panelHeight: number;
  }>({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    panelWidth: 0,
    panelHeight: 0,
  });
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);

  const recenterOrClampPanel = useCallback(() => {
    const panelEl = panelRef.current;
    if (!panelEl || typeof window === "undefined") return;
    const rect = panelEl.getBoundingClientRect();
    setPanelPosition((prev) => {
      const base = prev ?? {
        x: (window.innerWidth - rect.width) / 2,
        y: (window.innerHeight - rect.height) / 2,
      };
      return clampPanelPosition(base.x, base.y, rect.width, rect.height);
    });
  }, []);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const panelEl = panelRef.current;
    if (!panelEl || typeof window === "undefined") return;

    const rect = panelEl.getBoundingClientRect();
    const current = panelPosition ?? { x: rect.left, y: rect.top };

    dragStateRef.current = {
      isDragging: true,
      offsetX: event.clientX - current.x,
      offsetY: event.clientY - current.y,
      panelWidth: rect.width,
      panelHeight: rect.height,
    };
    setPanelPosition(current);
    event.preventDefault();
  }, [panelPosition]);

  useEffect(() => {
    recenterOrClampPanel();
    window.addEventListener("resize", recenterOrClampPanel);
    return () => window.removeEventListener("resize", recenterOrClampPanel);
  }, [recenterOrClampPanel]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.isDragging || typeof window === "undefined") return;
      const nextX = event.clientX - dragStateRef.current.offsetX;
      const nextY = event.clientY - dragStateRef.current.offsetY;
      const clamped = clampPanelPosition(
        nextX,
        nextY,
        dragStateRef.current.panelWidth,
        dragStateRef.current.panelHeight
      );
      setPanelPosition(clamped);
    };

    const stopDragging = () => {
      dragStateRef.current.isDragging = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f6fa] text-slate-900">
      <div className="public-mural-home absolute inset-0">
        <PublicMuralBoard />
      </div>

      <div className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.62),rgba(255,255,255,0.06)_40%,rgba(255,255,255,0.32)_100%)]" />

      <div className="pointer-events-none absolute left-1/2 top-4 z-50 hidden w-[min(44rem,calc(100vw-24rem))] -translate-x-1/2 md:block">
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-2 text-center text-sm font-medium text-slate-700 shadow-xl shadow-slate-200/40 backdrop-blur-md">
          The Mural is an open public board where anyone can share favorite design pieces, post freely, and build ideas together in real time.
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-50">
        <aside
          ref={panelRef}
          style={
            panelPosition
              ? { left: `${panelPosition.x}px`, top: `${panelPosition.y}px` }
              : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
          }
          className="pointer-events-auto absolute w-[min(92vw,28rem)] rounded-3xl border border-slate-300 bg-white/95 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur"
        >
          <div
            onPointerDown={handleDragStart}
            className="mb-4 flex cursor-grab touch-none select-none justify-center py-1 active:cursor-grabbing"
            aria-label="Drag login panel"
          >
            <span className="h-1.5 w-14 rounded-full bg-slate-300/80" />
          </div>
          <div className="mb-4 text-center">
            <div className="mx-auto mb-2 flex items-center justify-center gap-2">
              <img src={logoSrc} alt="Reffo" className="h-8 w-auto" />
              <h1 className="text-2xl font-semibold text-slate-900">Reffo</h1>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onGoogleSignIn}
              className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-slate-900 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <img src={googleLogoSrc} alt="Google" className="h-5 w-5" />
              Continue with Google
            </button>
            {renderEmailAuthSection()}
          </div>
        </aside>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 z-50 border-t border-slate-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Reffo logo" className="h-7 w-auto" />
            <div className="text-base font-semibold tracking-tight text-slate-900">reffo.studio</div>
          </div>

          <nav
            aria-label="Legal links"
            className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-600"
          >
            <button onClick={() => onNavigate("/privacy")} className="transition hover:text-slate-900">
              {legalLabels.privacy}
            </button>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <button onClick={() => onNavigate("/cookie-policy")} className="transition hover:text-slate-900">
              {legalLabels.cookies}
            </button>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <button onClick={() => onNavigate("/terms")} className="transition hover:text-slate-900">
              {legalLabels.terms}
            </button>
          </nav>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Mail className="h-4 w-4" />
            Contact
          </button>
        </div>
      </footer>
    </div>
  );
}
