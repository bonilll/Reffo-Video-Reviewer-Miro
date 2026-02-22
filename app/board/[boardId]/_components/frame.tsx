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

  const cornerRadius = Math.max(8, Math.min(12, Math.min(width, height) * 0.06));
  const titleFontSize = Math.max(10, Math.min(12, Math.min(width, height) * 0.06));
  const titleOffsetY = -10;
  const titleLineHeight = 18;

  const hasChildren = children.length > 0;
  const baseTitle = title || "Frame";

  const titleAvailableWidth = Math.max(44, width - (autoResize ? 34 : 14));
  const approxTitleChars = Math.max(4, Math.floor(titleAvailableWidth / Math.max(6, titleFontSize * 0.56)));
  const displayTitle =
    baseTitle.length > approxTitleChars ? `${baseTitle.slice(0, Math.max(1, approxTitleChars - 1))}…` : baseTitle;

  const resolvedBorderColor = colorToCSS(borderColor);
  const resolvedBorderWidth = Math.max(1, Math.min(3, borderWidth || 1));
  const resolvedBorderDash =
    borderStyle === "dashed" ? "6 4" : borderStyle === "dotted" ? "1.5 4" : undefined;

  const frameColors = {
    background: colorToCSS(fill),
    border: resolvedBorderColor || "#dbe3ef",
    borderSoft: "rgba(148, 163, 184, 0.18)",
    title: "#0f172a",
    muted: "#64748b",
    autoBg: "rgba(59, 130, 246, 0.08)",
    autoBorder: "rgba(59, 130, 246, 0.2)",
    autoText: "#2563eb",
  };

  return (
    <g
      data-layer-id={id}
      onPointerDown={(e) => onPointerDown(e, id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, id);
      }}
      transform={`translate(${x} ${y})`}
    >
      {/* Ambient shadow */}
      <rect
        x={0}
        y={1}
        width={width}
        height={height}
        fill="rgba(15,23,42,0.035)"
        rx={cornerRadius + 1}
        ry={cornerRadius + 1}
        className="pointer-events-none"
        style={{ filter: "blur(2px)" }}
      />

      {/* Main surface */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={frameColors.background}
        stroke={frameColors.border}
        strokeOpacity={0.32}
        strokeWidth={resolvedBorderWidth}
        strokeDasharray={resolvedBorderDash}
        rx={cornerRadius}
        ry={cornerRadius}
        opacity={opacity}
        className={`${selectionColor ? "cursor-move" : "cursor-default"} transition-all duration-200 ease-out`}
        style={{
          filter: selectionColor
            ? `drop-shadow(0 0 0.5px ${selectionColor}) drop-shadow(0 8px 22px rgba(15,23,42,0.08))`
            : "drop-shadow(0 3px 12px rgba(15,23,42,0.06))",
        }}
      />

      {/* Soft inner edge */}
      <rect
        x={0.5}
        y={0.5}
        width={Math.max(0, width - 1)}
        height={Math.max(0, height - 1)}
        fill="none"
        stroke={frameColors.borderSoft}
        strokeWidth={0.75}
        rx={Math.max(0, cornerRadius - 0.5)}
        ry={Math.max(0, cornerRadius - 0.5)}
        className="pointer-events-none"
      />

      {/* Auto-resize perimeter (minimal) */}
      {autoResize && (
        <rect
          x={1.5}
          y={1.5}
          width={Math.max(0, width - 3)}
          height={Math.max(0, height - 3)}
          fill="none"
          stroke={frameColors.autoBorder}
          strokeWidth={1}
          strokeDasharray="4 6"
          rx={Math.max(0, cornerRadius - 1.5)}
          ry={Math.max(0, cornerRadius - 1.5)}
          className="pointer-events-none"
        />
      )}

      {/* Title (outside frame, lightweight) */}
      <g onClick={isEditingTitle ? undefined : handleTitleClick}>
        {isEditingTitle ? (
          <foreignObject
            x={0}
            y={titleOffsetY - titleLineHeight + 2}
            width={Math.max(48, titleAvailableWidth)}
            height={24}
            className="pointer-events-auto"
          >
            <span
              ref={titleRef}
              contentEditable
              suppressContentEditableWarning
              className="inline-block bg-white/95 px-2.5 py-1 rounded-md text-sm font-medium outline-none border border-blue-300 shadow-sm w-full ring-2 ring-blue-100"
              style={{
                color: frameColors.title,
                fontSize: `${titleFontSize}px`,
                lineHeight: `${titleLineHeight - 4}px`,
                fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleSave}
            />
          </foreignObject>
        ) : (
          <text
            className="select-none cursor-pointer hover:opacity-75 transition-all duration-200"
            x={0}
            y={titleOffsetY}
            fontSize={titleFontSize}
            fontWeight="500"
            fill={selectionColor ? frameColors.title : frameColors.muted}
            dominantBaseline="auto"
            style={{
              fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: "0",
            }}
          >
            {displayTitle}
          </text>
        )}
      </g>

      {/* Auto-resize subtle label (outside frame, optional) */}
      {autoResize && width >= 96 && (
        <g className="pointer-events-none">
          <rect
            x={Math.max(52, width - 34)}
            y={titleOffsetY - titleLineHeight + 4}
            width={34}
            height={16}
            fill={frameColors.autoBg}
            stroke={frameColors.autoBorder}
            strokeWidth={0.75}
            rx={8}
            ry={8}
          />
          <text
            x={Math.max(52, width - 34) + 17}
            y={titleOffsetY - 1}
            fontSize={9.5}
            fontWeight="600"
            fill={frameColors.autoText}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif" }}
          >
            Auto
          </text>
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
        <g className="pointer-events-none" opacity={0.38}>
          <rect
            x={12}
            y={12}
            width={Math.max(0, width - 24)}
            height={Math.max(0, height - 24)}
            fill="none"
            stroke="rgba(148, 163, 184, 0.22)"
            strokeWidth={1}
            strokeDasharray="4 6"
            rx={Math.max(4, cornerRadius - 4)}
            ry={Math.max(4, cornerRadius - 4)}
          />
        </g>
      )}
    </g>
  );
});

Frame.displayName = "Frame"; 
