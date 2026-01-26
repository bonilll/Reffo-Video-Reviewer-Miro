"use client";

import React from "react";
import type { TodoWidgetLayer } from "@/types/canvas";

interface TodoWidgetProps {
  layer: TodoWidgetLayer;
  onPropsChange: (props: Partial<TodoWidgetLayer>) => void;
  isSelected: boolean;
  onFocus: () => void;
  camera?: { x: number; y: number; scale: number };
}

export const TodoWidget = ({ layer }: TodoWidgetProps) => {
  return (
    <div className="h-full w-full rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-800">Todo</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Soon</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        Widget temporarily disabled during migration.
      </div>
    </div>
  );
};
