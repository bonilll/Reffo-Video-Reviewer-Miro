"use client";

import { CheckSquare } from "lucide-react";

interface TodoButtonProps {
  boardId?: string;
  size?: "sm" | "md" | "lg";
  onCreateWidget?: () => void;
  onHover?: (label: string) => void;
  onHoverEnd?: () => void;
}

export const TodoButton = ({
  size = "md",
  onCreateWidget,
  onHover,
  onHoverEnd,
}: TodoButtonProps) => {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-10 w-10",
  };

  const iconSizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <button
      type="button"
      data-no-board-gestures="true"
      onClick={() => onCreateWidget?.()}
      onMouseEnter={() => onHover?.("Todo")}
      onMouseLeave={onHoverEnd}
      className={`relative ${sizeClasses[size]} rounded-xl border border-transparent bg-white/80 text-slate-600 backdrop-blur-sm transition-all duration-200 ease-out hover:scale-[1.04] hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2`}
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label="Create todo widget"
    >
      <CheckSquare className={`${iconSizeClasses[size]} mx-auto transition-all duration-200`} />
    </button>
  );
};

export default TodoButton;
