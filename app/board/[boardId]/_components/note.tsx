import { Libre_Franklin } from "next/font/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import { cn, colorToCSS, getContrastingTextColor } from "@/lib/utils";
import { useMutation, useSelf } from "@/liveblocks.config";
import type { NoteLayer } from "@/types/canvas";
import { isIOSSafari } from "@/utils/platform";

const font = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const DEFAULT_FILL = { r: 255, g: 235, b: 59 };

const BASE_SIZE = 220;
const MIN_SIZE = 160;
const MAX_SIZE = 900;
const SIZE_STEP = 4;

const NOTE_RADIUS = 22;
const NOTE_PADDING = 16;
const NOTE_CONTENT_MIN_HEIGHT = 72;
const NOTE_FOOTER_HEIGHT = 26;
const NOTE_SHADOW_PAD_X = 26;
const NOTE_SHADOW_PAD_TOP = 22;
const NOTE_SHADOW_PAD_BOTTOM = 40;

const SAVE_DEBOUNCE_MS = 260;
const RESIZE_DEBOUNCE_MS = 140;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snapSize = (value: number) => Math.ceil(value / SIZE_STEP) * SIZE_STEP;
const mixChannel = (from: number, to: number, amount: number) =>
  Math.round(from + (to - from) * amount);
const mixColor = (
  color: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  amount: number,
) => ({
  r: mixChannel(color.r, target.r, amount),
  g: mixChannel(color.g, target.g, amount),
  b: mixChannel(color.b, target.b, amount),
});

const sanitizePlainText = (text: string) =>
  text
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ");

const stripHtml = (html: string) => {
  if (!html) return "";
  if (typeof document === "undefined") {
    return sanitizePlainText(html.replace(/<[^>]+>/g, " "));
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return sanitizePlainText(tempDiv.textContent || tempDiv.innerText || "");
};

const wrapTextToLines = (text: string, maxCharsPerLine: number, maxLines: number): string[] => {
  const rows: string[] = [];
  const safeText = text || "";
  const paragraphs = safeText.split("\n");

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      rows.push("");
    } else {
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length <= maxCharsPerLine) {
          line = candidate;
          continue;
        }

        if (line) rows.push(line);

        if (word.length > maxCharsPerLine) {
          rows.push(word.slice(0, maxCharsPerLine));
          line = word.slice(maxCharsPerLine);
        } else {
          line = word;
        }
      }

      if (line) rows.push(line);
    }

    if (rows.length >= maxLines) break;
  }

  if (rows.length > maxLines) {
    return rows.slice(0, maxLines);
  }

  return rows;
};

let measurementNode: HTMLDivElement | null = null;

const getMeasurementNode = () => {
  if (typeof document === "undefined") return null;

  if (!measurementNode) {
    measurementNode = document.createElement("div");
    measurementNode.setAttribute("data-note-measure-node", "true");
    measurementNode.style.position = "fixed";
    measurementNode.style.left = "-99999px";
    measurementNode.style.top = "-99999px";
    measurementNode.style.visibility = "hidden";
    measurementNode.style.pointerEvents = "none";
    measurementNode.style.zIndex = "-1";
    measurementNode.style.whiteSpace = "pre-wrap";
    measurementNode.style.wordBreak = "break-word";
    measurementNode.style.overflowWrap = "break-word";
    document.body.appendChild(measurementNode);
  }

  return measurementNode;
};

const measureSquareSize = ({
  html,
  fontSize,
  fontWeight,
  fontStyle,
  fontFamily,
  textAlign,
  showMetadata,
  minSize,
  maxSize,
}: {
  html: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  fontFamily: string;
  textAlign: "left" | "center" | "right" | "justify";
  showMetadata: boolean;
  minSize: number;
  maxSize: number;
}) => {
  const node = getMeasurementNode();
  if (!node) return BASE_SIZE;

  const contentHtml = html && html.trim().length > 0 ? html : "<span>&nbsp;</span>";
  const footerSpace = showMetadata ? NOTE_FOOTER_HEIGHT : 0;

  const fits = (side: number) => {
    const contentWidth = Math.max(40, side - NOTE_PADDING * 2);
    const availableHeight = Math.max(
      NOTE_CONTENT_MIN_HEIGHT,
      side - NOTE_PADDING * 2 - footerSpace,
    );

    node.style.width = `${contentWidth}px`;
    node.style.fontSize = `${fontSize}px`;
    node.style.fontWeight = fontWeight;
    node.style.fontStyle = fontStyle;
    node.style.fontFamily = fontFamily;
    node.style.textAlign = textAlign;
    node.style.lineHeight = "1.38";
    node.innerHTML = contentHtml;

    const neededHeight = Math.ceil(node.scrollHeight);
    return neededHeight <= availableHeight;
  };

  let low = minSize;
  let high = maxSize;
  let best = maxSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return snapSize(clamp(best, minSize, maxSize));
};

interface NoteProps {
  id: string;
  layer: NoteLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
  isSelected?: boolean;
  lastUsedColor?: { r: number; g: number; b: number };
  mobileSafeRendering?: boolean;
}

export const Note = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
  isSelected = false,
  mobileSafeRendering = false,
}: NoteProps) => {
  const {
    x,
    y,
    width,
    height,
    fill,
    value,
    fontSize = 16,
    fontWeight = "normal",
    textAlign = "center",
    fontStyle = "normal",
    textDecoration = "none",
    fontFamily = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial",
    lastModifiedBy,
    lastModifiedAt,
    showMetadata = true,
  } = layer;

  const currentUser = useSelf();

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(value || "");
  const [isHovered, setIsHovered] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const hasInitializedEditingRef = useRef(false);

  const iosSafari = isIOSSafari();
  const showSelectionOutline = !!selectionColor && !(iosSafari && isSelected);

  const effectiveFill = fill || DEFAULT_FILL;
  const textColor = getContrastingTextColor(effectiveFill);
  const noteFaceColor = colorToCSS(mixColor(effectiveFill, { r: 255, g: 255, b: 255 }, 0.08));
  const noteTextColor = textColor === "black" ? "rgba(50, 42, 24, 0.92)" : "rgba(248, 250, 252, 0.92)";
  const metaTextColor = textColor === "black" ? "rgba(70, 58, 34, 0.7)" : "rgba(226, 232, 240, 0.84)";

  const displayDate = lastModifiedAt ? new Date(lastModifiedAt) : new Date();
  const displayAuthor = lastModifiedBy || currentUser?.presence?.profile?.name || currentUser?.info?.name || "User";
  const dateLabel = format(displayDate, "dd/MM HH:mm", { locale: enUS });
  const metadataLabel = `Edited by ${displayAuthor} - ${dateLabel}`;
  const noteShadow = isSelected
    ? "0 22px 34px -18px rgba(15, 23, 42, 0.42), 0 14px 22px -16px rgba(15, 23, 42, 0.34), 0 5px 10px -7px rgba(15, 23, 42, 0.24)"
    : isHovered
      ? "0 18px 28px -18px rgba(15, 23, 42, 0.36), 0 10px 18px -14px rgba(15, 23, 42, 0.3), 0 4px 8px -6px rgba(15, 23, 42, 0.2)"
      : "0 14px 24px -18px rgba(15, 23, 42, 0.32), 0 8px 14px -12px rgba(15, 23, 42, 0.26), 0 3px 6px -5px rgba(15, 23, 42, 0.18)";
  const noteSelectionRing = showSelectionOutline ? `0 0 0 2px ${selectionColor}` : "";
  const noteBoxShadow = noteSelectionRing ? `${noteSelectionRing}, ${noteShadow}` : noteShadow;

  const persistNote = useMutation(
    ({ storage }, htmlValue: string, squareSize?: number) => {
      const liveLayers = storage.get("layers");
      const noteLayer = liveLayers.get(id);
      if (!noteLayer) return;

      const updateData: Partial<NoteLayer> & { value: string; lastModifiedAt: string; lastModifiedBy: string } = {
        value: htmlValue,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy:
          currentUser?.presence?.profile?.name || currentUser?.info?.name || "User",
      };

      if (typeof squareSize === "number") {
        updateData.width = squareSize;
        updateData.height = squareSize;
      }

      noteLayer.update(updateData);
    },
    [id, currentUser],
  );

  const resizeNote = useMutation(
    ({ storage }, squareSize: number) => {
      const liveLayers = storage.get("layers");
      const noteLayer = liveLayers.get(id);
      if (!noteLayer) return;
      noteLayer.update({ width: squareSize, height: squareSize });
    },
    [id],
  );

  const calculateTargetSize = useCallback(
    (htmlValue: string) => {
      return measureSquareSize({
        html: htmlValue,
        fontSize,
        fontWeight,
        fontStyle,
        fontFamily,
        textAlign,
        showMetadata,
        minSize: MIN_SIZE,
        maxSize: MAX_SIZE,
      });
    },
    [fontSize, fontWeight, fontStyle, fontFamily, textAlign, showMetadata],
  );

  const scheduleResize = useCallback(
    (htmlValue: string, immediate = false) => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      const runResize = () => {
        const targetSize = calculateTargetSize(htmlValue);
        if (Math.abs(targetSize - width) > 2 || Math.abs(targetSize - height) > 2) {
          resizeNote(targetSize);
        }
      };

      if (immediate) {
        runResize();
      } else {
        resizeTimeoutRef.current = setTimeout(runResize, RESIZE_DEBOUNCE_MS);
      }
    },
    [calculateTargetSize, width, height, resizeNote],
  );

  const scheduleSave = useCallback(
    (htmlValue: string, immediate = false, includeResize = false) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const runSave = () => {
        const nextSize = includeResize ? calculateTargetSize(htmlValue) : undefined;
        persistNote(htmlValue, nextSize);
      };

      if (immediate) {
        runSave();
      } else {
        saveTimeoutRef.current = setTimeout(runSave, SAVE_DEBOUNCE_MS);
      }
    },
    [persistNote, calculateTargetSize],
  );

  const keepLayerSelectionWhileEditing = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditing) return;
      e.stopPropagation();
      if (!isSelected) {
        onPointerDown(e, id);
      }
    },
    [isEditing, isSelected, onPointerDown, id],
  );

  const handleNotePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isEditing) {
        keepLayerSelectionWhileEditing(e);
        return;
      }
      onPointerDown(e, id);
    },
    [isEditing, keepLayerSelectionWhileEditing, onPointerDown, id],
  );

  const handleEditorPointerEvent = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isEditing) {
        e.stopPropagation();
      }
    },
    [isEditing],
  );

  const captureEditorSelection = useCallback(() => {
    if (!isEditing || !contentEditableRef.current || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const editor = contentEditableRef.current;

    if (editor.contains(range.commonAncestorContainer)) {
      savedSelectionRangeRef.current = range.cloneRange();
    }
  }, [isEditing]);

  const restoreEditorSelection = useCallback(() => {
    if (!contentEditableRef.current || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();

    const savedRange = savedSelectionRangeRef.current;
    if (savedRange && contentEditableRef.current.contains(savedRange.commonAncestorContainer)) {
      selection.addRange(savedRange);
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(contentEditableRef.current);
    range.collapse(false);
    selection.addRange(range);
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const nextHtml = e.currentTarget.innerHTML || "";
      setContent(nextHtml);
      scheduleSave(nextHtml, false);
      scheduleResize(nextHtml, false);
      requestAnimationFrame(() => {
        captureEditorSelection();
      });
    },
    [scheduleSave, scheduleResize, captureEditorSelection],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedText = sanitizePlainText(e.clipboardData.getData("text/plain"));
    document.execCommand("insertText", false, pastedText);
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (
        relatedTarget &&
        (relatedTarget.closest(".selection-tools") ||
          relatedTarget.closest(".toolbar") ||
          relatedTarget.closest("[data-note-formatting-ui='true']") ||
          relatedTarget.closest("[data-radix-popper-content-wrapper]"))
      ) {
        captureEditorSelection();
        requestAnimationFrame(() => {
          contentEditableRef.current?.focus({ preventScroll: true });
          restoreEditorSelection();
        });
        return;
      }

      const finalHtml = e.currentTarget.innerHTML || "";
      setContent(finalHtml);
      setIsEditing(false);
      scheduleSave(finalHtml, true, true);
    },
    [scheduleSave, captureEditorSelection, restoreEditorSelection],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        const previous = value || "";
        setContent(previous);
        setIsEditing(false);
        if (contentEditableRef.current) {
          contentEditableRef.current.innerHTML = previous;
        }
        return;
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        const finalHtml = (e.currentTarget as HTMLDivElement).innerHTML || "";
        setContent(finalHtml);
        setIsEditing(false);
        scheduleSave(finalHtml, true, true);
      }
    },
    [value, scheduleSave],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isSelected) {
        onPointerDown((e as unknown) as React.PointerEvent, id);
      }
      setIsEditing(true);
    },
    [isSelected, onPointerDown, id],
  );

  const applyFormatting = useCallback(
    (command: string, commandValue?: string) => {
      if (!isEditing || !contentEditableRef.current) return;

      contentEditableRef.current.focus({ preventScroll: true });
      restoreEditorSelection();

      if (command === "removeFormat") {
        // keep behavior scoped to bold toggle coming from toolbar
        try {
          if (document.queryCommandState("bold")) {
            document.execCommand("bold");
          }
        } catch (_error) {
          document.execCommand("removeFormat");
        }
      } else {
        document.execCommand(command, false, commandValue);
      }

      const nextHtml = contentEditableRef.current.innerHTML || "";
      setContent(nextHtml);
      scheduleSave(nextHtml, false);
      scheduleResize(nextHtml, false);
      requestAnimationFrame(() => {
        captureEditorSelection();
      });
    },
    [isEditing, scheduleSave, scheduleResize, captureEditorSelection, restoreEditorSelection],
  );

  useEffect(() => {
    if (isEditing) {
      (window as any).applyNoteFormatting = applyFormatting;
      return () => {
        if ((window as any).applyNoteFormatting === applyFormatting) {
          delete (window as any).applyNoteFormatting;
        }
      };
    }

    if ((window as any).applyNoteFormatting === applyFormatting) {
      delete (window as any).applyNoteFormatting;
    }
  }, [isEditing, applyFormatting]);

  useEffect(() => {
    if (!isEditing && value !== content) {
      setContent(value || "");
    }
  }, [value, content, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      scheduleResize(content || value || "", true);
    }
  }, [
    isEditing,
    content,
    value,
    scheduleResize,
    fontSize,
    fontWeight,
    fontStyle,
    fontFamily,
    textAlign,
    showMetadata,
  ]);

  useEffect(() => {
    if (!isEditing || !contentEditableRef.current) {
      hasInitializedEditingRef.current = false;
      return;
    }

    const editor = contentEditableRef.current;
    if (editor.innerHTML !== content) {
      editor.innerHTML = content;
    }

    if (hasInitializedEditingRef.current) return;
    hasInitializedEditingRef.current = true;

    editor.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      restoreEditorSelection();
    });
  }, [isEditing, content, restoreEditorSelection]);

  useEffect(() => {
    if (!isEditing || typeof document === "undefined") return;

    const handleSelectionChange = () => {
      captureEditorSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [isEditing, captureEditorSelection]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  const plainDisplayText = useMemo(() => stripHtml(content || value || ""), [content, value]);

  const lineHeight = fontSize * 1.35;
  const contentWidth = Math.max(40, width - NOTE_PADDING * 2);
  const contentHeight = Math.max(
    NOTE_CONTENT_MIN_HEIGHT,
    height - NOTE_PADDING * 2 - (showMetadata && !isEditing ? NOTE_FOOTER_HEIGHT : 0),
  );
  const maxCharsPerLine = Math.max(8, Math.floor(contentWidth / Math.max(6, fontSize * 0.58)));
  const maxLines = Math.max(1, Math.floor(contentHeight / lineHeight));
  const textLines = useMemo(
    () => wrapTextToLines(plainDisplayText, maxCharsPerLine, maxLines),
    [plainDisplayText, maxCharsPerLine, maxLines],
  );

  if (mobileSafeRendering) {
    const textAnchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
    const textX =
      textAlign === "center"
        ? width / 2
        : textAlign === "right"
          ? width - NOTE_PADDING
          : NOTE_PADDING;

    return (
      <g
        data-layer-id={id}
        transform={`translate(${x} ${y})`}
        onPointerDown={handleNotePointerDown}
        style={{ cursor: "pointer" }}
      >
        <rect
          data-layer-id={id}
          x={0}
          y={0}
          width={width}
          height={height}
          rx={NOTE_RADIUS}
          ry={NOTE_RADIUS}
          fill={noteFaceColor}
          style={{
            filter:
              "drop-shadow(0 18px 18px rgba(15, 23, 42, 0.16)) drop-shadow(0 6px 8px rgba(15, 23, 42, 0.14))",
          }}
        />

        {showSelectionOutline && (
          <rect
            data-layer-id={id}
            x={1}
            y={1}
            width={Math.max(0, width - 2)}
            height={Math.max(0, height - 2)}
            rx={NOTE_RADIUS}
            ry={NOTE_RADIUS}
            fill="none"
            stroke={selectionColor}
            strokeWidth={2}
          />
        )}

        <text
          data-layer-id={id}
          x={textX}
          y={NOTE_PADDING + fontSize}
          fill={noteTextColor}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
          textDecoration={textDecoration}
          textAnchor={textAnchor}
          style={{ pointerEvents: "none", userSelect: "none", fontFamily }}
        >
          {textLines.map((line, index) => (
            <tspan key={`${id}-mobile-line-${index}`} x={textX} dy={index === 0 ? 0 : lineHeight}>
              {line || " "}
            </tspan>
          ))}
        </text>

        {showMetadata && !isEditing && (
          <g data-layer-id={id}>
            <circle
              data-layer-id={id}
              cx={width - 16}
              cy={height - 16}
              r={9}
              fill={textColor === "black" ? "rgba(255,255,255,0.4)" : "rgba(15,23,42,0.28)"}
            />
            <text
              data-layer-id={id}
              x={width - 16}
              y={height - 12.5}
              fill={metaTextColor}
              fontSize={10}
              fontWeight={600}
              textAnchor="middle"
              style={{ pointerEvents: "none", userSelect: "none", fontFamily }}
            >
              i
            </text>
            <title>{metadataLabel}</title>
          </g>
        )}
      </g>
    );
  }

  return (
    <foreignObject
      data-layer-id={id}
      x={x - NOTE_SHADOW_PAD_X}
      y={y - NOTE_SHADOW_PAD_TOP}
      width={width + NOTE_SHADOW_PAD_X * 2}
      height={height + NOTE_SHADOW_PAD_TOP + NOTE_SHADOW_PAD_BOTTOM}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="relative h-full w-full"
      >
        <div
          className={cn("absolute", font.className, isEditing ? "cursor-text" : "cursor-pointer")}
          style={{
            left: NOTE_SHADOW_PAD_X,
            top: NOTE_SHADOW_PAD_TOP,
            width,
            height,
            borderRadius: NOTE_RADIUS,
            background: noteFaceColor,
            color: noteTextColor,
            border: "none",
            overflow: "hidden",
            boxShadow: noteBoxShadow,
            transition: iosSafari ? "none" : "box-shadow 160ms ease-out, transform 160ms ease-out",
            transform: isSelected && !isEditing ? "translateY(-1px)" : "translateY(0)",
          }}
          onPointerDown={handleNotePointerDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onDoubleClick={handleDoubleClick}
        >
          <div
            className="flex h-full flex-col"
            style={{
              padding: NOTE_PADDING,
              paddingBottom: showMetadata && !isEditing ? NOTE_PADDING + NOTE_FOOTER_HEIGHT : NOTE_PADDING,
              gap: 6,
            }}
          >
            <div className="flex-1 overflow-hidden">
              <div
                ref={contentEditableRef}
                data-note-editor="true"
                contentEditable={isEditing}
                suppressContentEditableWarning
                spellCheck={false}
                onInput={handleInput}
                onPaste={handlePaste}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onPointerDown={handleEditorPointerEvent}
                onPointerUp={handleEditorPointerEvent}
                onPointerMove={handleEditorPointerEvent}
                onMouseUp={captureEditorSelection}
                onKeyUp={captureEditorSelection}
                onSelect={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                    captureEditorSelection();
                  }
                }}
                dangerouslySetInnerHTML={
                  !isEditing
                    ? { __html: content || "<span></span>" }
                    : undefined
                }
                className={cn(
                  "h-full w-full outline-none",
                  "break-words",
                  isEditing ? "select-text" : "select-none",
                )}
                style={{
                  minHeight: NOTE_CONTENT_MIN_HEIGHT,
                  width: "100%",
                  height: "100%",
                  fontSize,
                  fontWeight,
                  textAlign,
                  fontStyle,
                  textDecoration,
                  fontFamily,
                  lineHeight: 1.38,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  padding: "2px 1px",
                  userSelect: isEditing ? "text" : "none",
                  WebkitUserSelect: isEditing ? "text" : "none",
                }}
              />
            </div>

            {showMetadata && !isEditing && (
              <div
                className="group absolute bottom-2 right-2"
                style={{
                  zIndex: 2,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full border"
                  style={{
                    color: metaTextColor,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: textColor === "black" ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.3)",
                    borderColor: "transparent",
                  }}
                >
                  i
                </div>

                <div
                  className={cn(
                    "pointer-events-none absolute bottom-7 right-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 opacity-0 shadow-md transition-opacity duration-150",
                    "group-hover:opacity-100",
                  )}
                  style={{
                    color: "#334155",
                    fontSize: 11,
                    lineHeight: 1.3,
                    background: "rgba(255,255,255,0.92)",
                    borderColor: "rgba(148,163,184,0.18)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{displayAuthor}</div>
                  <div style={{ opacity: 0.82 }}>{dateLabel}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </foreignObject>
  );
};
