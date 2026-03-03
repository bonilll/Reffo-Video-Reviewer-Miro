"use client";

import React from "react";

import { SubnetworkCardLayer } from "@/types/canvas";

type SubnetworkCardProps = {
  id: string;
  layer: SubnetworkCardLayer;
  onPointerDown: (e: React.PointerEvent, layerId: string) => void;
  selectionColor?: string;
  isViewer?: boolean;
  displayTitle?: string;
  onOpen?: (subnetworkId: string) => void;
  onOutputs?: (subnetworkId: string) => void;
};

export const SubnetworkCard = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
  isViewer = false,
  displayTitle,
  onOpen,
  onOutputs,
}: SubnetworkCardProps) => {
  const resolvedTitle = (displayTitle || layer.title || "Subnetwork AI").trim() || "Subnetwork AI";
  const isOpenDisabled = isViewer;

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.head.querySelector("[data-subnetwork-card-style]")) return;

    const styleSheet = document.createElement("style");
    styleSheet.setAttribute("data-subnetwork-card-style", "true");
    styleSheet.textContent = `
      @keyframes reffoSubnetworkGlowShift {
        0% { background-position: 0% 50%; opacity: 0.36; }
        50% { background-position: 100% 50%; opacity: 0.56; }
        100% { background-position: 0% 50%; opacity: 0.36; }
      }

      @keyframes reffoSubnetworkShadowPulse {
        0% {
          box-shadow:
            0 8px 18px -14px rgba(15, 23, 42, 0.42),
            0 0 0 1px rgba(148, 163, 184, 0.22);
        }
        50% {
          box-shadow:
            0 12px 24px -16px rgba(15, 23, 42, 0.5),
            0 0 14px -7px rgba(56, 189, 248, 0.52),
            0 0 18px -9px rgba(192, 132, 252, 0.42),
            0 0 0 1px rgba(148, 163, 184, 0.28);
        }
        100% {
          box-shadow:
            0 8px 18px -14px rgba(15, 23, 42, 0.42),
            0 0 0 1px rgba(148, 163, 184, 0.22);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }, []);

  return (
    <foreignObject
      id={id}
      data-layer-id={id}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      style={{
        outline: selectionColor ? `2px solid ${selectionColor}` : "none",
      }}
      className="overflow-visible"
      onPointerDown={(event) => onPointerDown(event, id)}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="relative h-full w-full"
      >
        <div
          className="pointer-events-none absolute inset-[-6px] rounded-[20px] blur-lg"
          style={{
            background:
              "linear-gradient(120deg, rgba(34,211,238,0.9), rgba(74,222,128,0.78), rgba(244,114,182,0.86), rgba(129,140,248,0.88), rgba(34,211,238,0.9))",
            backgroundSize: "220% 220%",
            animation: "reffoSubnetworkGlowShift 7s ease-in-out infinite",
          }}
        />

        <div
          className="relative flex h-full flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3 backdrop-blur-sm"
          style={{
            animation: "reffoSubnetworkShadowPulse 5.5s ease-in-out infinite",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400/20 via-violet-400/15 to-emerald-400/20" />
              <div className="relative grid h-5 w-5 grid-cols-2 grid-rows-2 gap-0.5">
                <span className="rounded-sm bg-slate-500" />
                <span className="rounded-sm bg-slate-600" />
                <span className="rounded-sm bg-slate-600" />
                <span className="rounded-sm bg-slate-500" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Subnetwork AI
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">{resolvedTitle}</p>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isOpenDisabled}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (!isOpenDisabled) onOpen?.(layer.subnetworkId);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOutputs?.(layer.subnetworkId);
              }}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Outputs
            </button>
          </div>
        </div>
      </div>
    </foreignObject>
  );
};
