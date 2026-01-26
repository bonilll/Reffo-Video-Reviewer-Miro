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
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={onClick}
      onMouseEnter={() => onHover?.(label)}
      onMouseLeave={() => onHoverEnd?.()}
      className={`
        relative ${sizeClasses[size]} rounded-xl flex items-center justify-center
        transition-all duration-300 ease-out group
        border border-transparent backdrop-blur-sm
        ${
        isActive 
            ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/25 border-slate-700/50 scale-105 ring-2 ring-slate-400/20" 
            : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105 active:scale-95"
        } 
        ${
          isDisabled 
            ? "opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none" 
            : "cursor-pointer"
        }
        focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
        touch-manipulation
      `}
      style={{
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Gradient overlay per depth quando attivo */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-xl pointer-events-none" />
      )}
      
      {/* Icon con micro-animazioni */}
      <Icon className={`${iconSizes[size]} relative z-10 transition-all duration-300 ${
        isActive 
          ? 'drop-shadow-sm text-white' 
          : 'group-hover:scale-110 group-hover:text-slate-700'
      }`} />
      
      {/* Indicatore di stato attivo migliorato */}
      {isActive && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-lg shadow-slate-900/50 animate-pulse" />
      )}
      
      {/* Subtle glow quando attivo */}
      {isActive && (
        <div className="absolute -inset-px bg-gradient-to-r from-slate-600/20 via-slate-500/20 to-slate-600/20 rounded-xl blur-sm -z-10" />
      )}
    </button>
  );
};
