"use client";

import { memo, useState, useRef, useEffect } from "react";
import { FrameLayer } from "@/types/canvas";
import { colorToCSS } from "@/lib/utils";
import { useMutation } from "@/liveblocks.config";

interface FrameProps {
  id: string;
  layer: FrameLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  selectionColor?: string;
}

export const Frame = memo(({ id, layer, onPointerDown, onContextMenu, selectionColor }: FrameProps) => {
  const {
    x,
    y,
    width,
    height,
    fill,
    title,
    borderColor,
    borderWidth,
    borderStyle,
    opacity = 1,
    children = [],
    autoResize = false,
  } = layer;

  // State per editing del titolo
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(title || "Frame");
  const titleRef = useRef<HTMLSpanElement>(null);

  // Mutation per aggiornare il titolo del frame
  const updateFrameTitle = useMutation(
    ({ storage }, frameId: string, newTitle: string) => {
      const liveLayers = storage.get("layers");
      const frame = liveLayers.get(frameId);
      if (frame) {
        frame.update({ title: newTitle.trim() || "Frame" });
      }
    },
    []
  );

  // Gestione click sul titolo
  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
  };

  // Gestione salvataggio titolo
  const handleTitleSave = () => {
    if (titleRef.current) {
      const finalTitle = titleRef.current.textContent?.trim() || "Frame";
      updateFrameTitle(id, finalTitle);
    }
    setIsEditingTitle(false);
  };

  // Gestione tasti
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleRef.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditingTitle(false);
      if (titleRef.current) {
        titleRef.current.textContent = title || "Frame";
      }
    }
  };

  // Auto-focus quando si entra in modalità editing
  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.textContent = title || "Frame";
      titleRef.current.focus();
      
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditingTitle, title]);

  // Calcola l'altezza del header
  const headerHeight = Math.max(32, Math.min(40, height * 0.12));
  const titleFontSize = Math.max(11, Math.min(14, headerHeight * 0.35));
  
  // Determina se il frame ha contenuti
  const hasChildren = children.length > 0;
  const childrenCount = children.length;

  // Colori moderni e professionali
  const frameColors = {
    background: colorToCSS(fill),
    border: hasChildren ? '#e2e8f0' : '#f1f5f9',
    headerBg: 'rgba(248, 250, 252, 0.95)',
    headerBorder: 'rgba(203, 213, 225, 0.4)',
    title: '#475569',
    count: '#94a3b8',
    autoResizeAccent: '#3b82f6',
    shadow: selectionColor || 'rgba(0, 0, 0, 0.04)'
  };

  return (
    <g
      onPointerDown={(e) => onPointerDown(e, id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, id);
      }}
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      {/* Shadow/Elevation layer */}
      <rect
        x={1}
        y={2}
        width={width}
        height={height}
        fill="rgba(0, 0, 0, 0.03)"
        rx={10}
        ry={10}
        className="pointer-events-none"
        style={{
          filter: 'blur(1px)'
        }}
      />

      {/* Main frame background */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={frameColors.background}
        stroke={frameColors.border}
        strokeWidth={hasChildren ? 1.5 : 1}
        rx={8}
        ry={8}
        opacity={opacity}
        className={`${selectionColor ? 'cursor-move' : 'cursor-default'} transition-all duration-300 ease-out`}
        style={{
          filter: selectionColor ? 
            `drop-shadow(0 0 16px ${selectionColor}30) drop-shadow(0 4px 20px rgba(0,0,0,0.08))` : 
            'drop-shadow(0 1px 3px rgba(0,0,0,0.05)) drop-shadow(0 4px 12px rgba(0,0,0,0.04))'
        }}
      />

      {/* Inner highlight for depth */}
      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        fill="none"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={0.5}
        rx={7.5}
        ry={7.5}
        className="pointer-events-none"
      />

      {/* Header background with gradient */}
      <defs>
        <linearGradient id={`headerGradient-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(248, 250, 252, 0.98)" />
          <stop offset="100%" stopColor="rgba(241, 245, 249, 0.92)" />
        </linearGradient>
      </defs>
      
      <rect
        x={0}
        y={0}
        width={width}
        height={headerHeight}
        fill={`url(#headerGradient-${id})`}
        rx={8}
        ry={8}
        className="pointer-events-none"
        style={{
          clipPath: `inset(0 0 ${height - headerHeight}px 0 round 8px)`
        }}
      />

      {/* Header bottom border */}
      <line
        x1={8}
        x2={width - 8}
        y1={headerHeight - 0.5}
        y2={headerHeight - 0.5}
        stroke={frameColors.headerBorder}
        strokeWidth={1}
        className="pointer-events-none"
      />

      {/* Auto-resize indicator border */}
      {autoResize && (
        <>
          <rect
            x={1.5}
            y={1.5}
            width={width - 3}
            height={height - 3}
            fill="none"
            stroke={frameColors.autoResizeAccent}
            strokeWidth={1.5}
            strokeDasharray="4,6"
            rx={6.5}
            ry={6.5}
            opacity={0.6}
            className="pointer-events-none"
            style={{
              animation: `dashSlide 3s linear infinite, pulse 2s ease-in-out infinite alternate`
            }}
          />
          
          {/* Auto-resize corner indicator */}
          <g className="pointer-events-none">
            <circle
              cx={width - 12}
              cy={12}
              r={5}
              fill={frameColors.autoResizeAccent}
              opacity={0.9}
            />
            <text
              x={width - 12}
              y={12}
              fontSize={7}
              fontWeight="700"
              fill="white"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif" }}
            >
              ⚡
            </text>
          </g>
        </>
      )}

      {/* Title section */}
      <g onClick={isEditingTitle ? undefined : handleTitleClick}>
        {isEditingTitle ? (
          <foreignObject
            x={12}
            y={(headerHeight - 20) / 2}
            width={width - 100}
            height={20}
            className="pointer-events-auto"
          >
            <span
              ref={titleRef}
              contentEditable
              suppressContentEditableWarning
              className="inline-block bg-white px-3 py-1.5 rounded-lg text-sm font-medium outline-none border border-blue-300 shadow-sm w-full ring-2 ring-blue-100"
              style={{
                color: frameColors.title,
                fontSize: `${titleFontSize}px`,
                lineHeight: '16px',
                fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleSave}
            />
          </foreignObject>
        ) : (
          <text
            className="select-none cursor-pointer hover:opacity-75 transition-all duration-200"
            x={12}
            y={headerHeight / 2}
            fontSize={titleFontSize}
            fontWeight="600"
            fill={frameColors.title}
            dominantBaseline="middle"
            style={{
              fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: '-0.01em'
            }}
          >
            {title || "Frame"}
          </text>
        )}
      </g>

      {/* Content count badge */}
      {hasChildren && (
        <g className="pointer-events-none">
          <rect
            x={width - 52}
            y={(headerHeight - 16) / 2}
            width={32}
            height={16}
            fill="rgba(59, 130, 246, 0.1)"
            stroke="rgba(59, 130, 246, 0.2)"
            strokeWidth={0.5}
            rx={8}
            ry={8}
          />
          <text
            x={width - 36}
            y={headerHeight / 2}
            fontSize={titleFontSize - 1}
            fontWeight="600"
            fill={frameColors.autoResizeAccent}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: "'SF Pro Display', system-ui, sans-serif",
            }}
          >
            {childrenCount}
          </text>
        </g>
      )}

      {/* Status indicator for auto-resize in title */}
      {autoResize && (
        <g className="pointer-events-none">
          <circle
            cx={width - 20}
            cy={headerHeight / 2}
            r={2.5}
            fill={frameColors.autoResizeAccent}
            opacity={0.8}
          />
        </g>
      )}

      {/* Selection highlight */}
      {selectionColor && (
        <>
          <rect
            x={-2}
            y={-2}
            width={width + 4}
            height={height + 4}
            fill="none"
            stroke={selectionColor}
            strokeWidth={2.5}
            rx={10}
            ry={10}
            className="pointer-events-none"
            opacity={0.8}
          />
          <rect
            x={-1}
            y={-1}
            width={width + 2}
            height={height + 2}
            fill="none"
            stroke="white"
            strokeWidth={1}
            rx={9}
            ry={9}
            className="pointer-events-none"
            opacity={0.6}
          />
        </>
      )}

      {/* Empty frame subtle indicator */}
      {!hasChildren && !autoResize && (
        <g className="pointer-events-none" opacity={0.3}>
          <circle
            cx={width / 2}
            cy={height / 2 + headerHeight / 2}
            r={1.5}
            fill={frameColors.count}
          />
          <circle
            cx={width / 2 - 8}
            cy={height / 2 + headerHeight / 2}
            r={1}
            fill={frameColors.count}
          />
          <circle
            cx={width / 2 + 8}
            cy={height / 2 + headerHeight / 2}
            r={1}
            fill={frameColors.count}
          />
        </g>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes dashSlide {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 20; }
        }
        
        @keyframes pulse {
          0% { opacity: 0.4; }
          100% { opacity: 0.8; }
        }
        
        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.3)); }
          50% { filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.5)); }
        }
      `}</style>
    </g>
  );
});

Frame.displayName = "Frame"; 