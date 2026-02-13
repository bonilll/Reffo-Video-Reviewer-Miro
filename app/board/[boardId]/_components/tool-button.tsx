"use client";

import type { LucideIcon } from "lucide-react";

type ToolButtonProps = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  onHover?: (label: string) => void;
  onHoverEnd?: () => void;
  size?: "sm" | "md" | "lg";
};

export const ToolButton = ({
  label,
  icon: Icon,
  onClick,
  isActive,
  isDisabled,
  onHover,
  onHoverEnd,
  size = "md"
}: ToolButtonProps) => {
  
  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9", 
    lg: "w-10 h-10"
  };
  
  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  return (
    <button
      data-no-board-gestures="true"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={onClick}
      onMouseEnter={() => onHover?.(label)}
      onMouseLeave={() => onHoverEnd?.()}
      className={`
        relative ${sizeClasses[size]} rounded-xl flex items-center justify-center
        transition-all duration-200 ease-out group
        border border-transparent bg-white/80 backdrop-blur-sm
        ${
        isActive 
            ? "bg-blue-600/10 text-blue-700 border-blue-200 shadow-sm scale-[1.04] ring-1 ring-blue-200/60" 
            : "text-slate-600 hover:bg-white hover:text-slate-900 hover:border-slate-200 hover:shadow-sm hover:scale-[1.04] active:scale-95"
        } 
        ${
          isDisabled 
            ? "opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none" 
            : "cursor-pointer"
        }
        focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2
        touch-manipulation
      `}
      style={{
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Icon con micro-animazioni */}
      <Icon className={`${iconSizes[size]} relative z-10 transition-all duration-300 ${
        isActive 
          ? 'drop-shadow-sm text-blue-700' 
          : 'group-hover:scale-110 group-hover:text-slate-800'
      }`} />
      
      {/* Indicatore di stato attivo migliorato */}
      {isActive && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full shadow-sm shadow-blue-500/40 animate-pulse" />
      )}
    </button>
  );
};
