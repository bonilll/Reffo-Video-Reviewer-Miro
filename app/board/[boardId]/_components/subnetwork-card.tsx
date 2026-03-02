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
      className="overflow-hidden"
      onPointerDown={(event) => onPointerDown(event, id)}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="h-full w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="flex h-full flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <div className="grid h-5 w-5 grid-cols-2 grid-rows-2 gap-0.5">
                <span className="rounded-sm bg-slate-400" />
                <span className="rounded-sm bg-slate-500" />
                <span className="rounded-sm bg-slate-500" />
                <span className="rounded-sm bg-slate-400" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subnetwork AI
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">{resolvedTitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isViewer}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (!isViewer) onOpen?.(layer.subnetworkId);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              Outputs
            </button>
          </div>
        </div>
      </div>
    </foreignObject>
  );
};
