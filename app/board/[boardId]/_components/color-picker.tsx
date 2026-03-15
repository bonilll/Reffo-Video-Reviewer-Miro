"use client";

import { colorToCSS } from "@/lib/utils";
import type { Color } from "@/types/canvas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Check, Pipette, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

type ColorPickerProps = {
  onChange: (color: Color) => void;
  currentColor?: Color;
  boardId?: string;
  onPickerActiveChange?: (active: boolean) => void;
};

const COLOR_STORAGE_KEY = "reffo.board.custom-colors";

const COLORS: Color[] = [
  // Row 1 - vibrant accents
  { r: 76, g: 109, b: 255 },  // Electric Blue
  { r: 34, g: 211, b: 202 },  // Fresh Teal
  { r: 255, g: 107, b: 107 }, // Coral
  { r: 255, g: 193, b: 72 },  // Amber

  // Row 2 - soft moderns
  { r: 183, g: 148, b: 255 }, // Violet
  { r: 125, g: 193, b: 255 }, // Sky
  { r: 255, g: 167, b: 120 }, // Peach
  { r: 169, g: 232, b: 114 }, // Lime

  // Row 3 - neutral anchors
  { r: 17, g: 24, b: 39 },    // Charcoal
  { r: 51, g: 65, b: 85 },    // Slate
  { r: 100, g: 116, b: 139 }, // Steel
  { r: 148, g: 163, b: 184 }, // Mist

  // Row 4 - light neutrals
  { r: 203, g: 213, b: 225 }, // Light
  { r: 226, g: 232, b: 240 }, // Cloud
  { r: 241, g: 245, b: 249 }, // Fog
  { r: 255, g: 255, b: 255 }, // White
];

type EyeDropperResult = {
  sRGBHex: string;
};

type EyeDropperLike = {
  open: () => Promise<EyeDropperResult>;
};

const clampColorChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const normalizeColor = (color: Color): Color => ({
  r: clampColorChannel(color.r),
  g: clampColorChannel(color.g),
  b: clampColorChannel(color.b),
});

const colorsEqual = (a: Color, b: Color) =>
  a.r === b.r && a.g === b.g && a.b === b.b;

const colorToHex = (color: Color) => colorToCSS(color).toLowerCase();

const hexToColor = (hex: string): Color | null => {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

const parseStoredColors = (rawValue: string | null): Color[] => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") return null;
        const r = Number((candidate as { r?: unknown }).r);
        const g = Number((candidate as { g?: unknown }).g);
        const b = Number((candidate as { b?: unknown }).b);
        if (![r, g, b].every(Number.isFinite)) return null;
        return normalizeColor({ r, g, b });
      })
      .filter((color): color is Color => color !== null);
  } catch {
    return [];
  }
};

const prependUniqueColor = (colors: Color[], candidate: Color) => [
  candidate,
  ...colors.filter((color) => !colorsEqual(color, candidate)),
];

const replaceColorInPalette = (colors: Color[], previousColor: Color, nextColor: Color) => {
  let replaced = false;
  const updated = colors.map((color) => {
    if (!replaced && colorsEqual(color, previousColor)) {
      replaced = true;
      return nextColor;
    }
    return color;
  });

  const deduped: Color[] = [];
  for (const color of updated) {
    if (!deduped.some((entry) => colorsEqual(entry, color))) {
      deduped.push(color);
    }
  }

  return replaced ? deduped : prependUniqueColor(deduped, nextColor);
};

const colorToHsl = (color: Color) => {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToColor = (h: number, s: number, l: number): Color => {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return normalizeColor({
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  });
};

const parseCssColor = (value: string | null | undefined): Color | null => {
  if (typeof document === "undefined" || !value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Marker color to detect invalid assignments (browser keeps previous value).
  ctx.fillStyle = "rgb(1, 2, 3)";
  try {
    ctx.fillStyle = trimmed;
  } catch {
    return null;
  }
  const normalized = String(ctx.fillStyle).trim().toLowerCase();
  if (normalized === "rgb(1, 2, 3)" && trimmed.toLowerCase() !== "rgb(1, 2, 3)") {
    return null;
  }

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return null;

  return { r, g, b };
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const samplePixelFromImage = async (
  image: HTMLImageElement,
  clientX: number,
  clientY: number
): Promise<Color | null> => {
  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const xRatio = Math.max(0, Math.min(0.999999, (clientX - rect.left) / rect.width));
  const yRatio = Math.max(0, Math.min(0.999999, (clientY - rect.top) / rect.height));
  const sourceWidth = image.naturalWidth || Math.round(rect.width);
  const sourceHeight = image.naturalHeight || Math.round(rect.height);
  const sx = Math.floor(xRatio * sourceWidth);
  const sy = Math.floor(yRatio * sourceHeight);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return { r, g, b };
  } catch {
    const source = image.currentSrc || image.src;
    if (!source) return null;

    try {
      const response = await fetch(source, { mode: "cors" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        const bx = Math.floor(xRatio * bitmap.width);
        const by = Math.floor(yRatio * bitmap.height);
        ctx.clearRect(0, 0, 1, 1);
        ctx.drawImage(bitmap, bx, by, 1, 1, 0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a === 0) return null;
        return { r, g, b };
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }
};

const samplePixelFromVideo = (
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): Color | null => {
  const rect = video.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  const xRatio = Math.max(0, Math.min(0.999999, (clientX - rect.left) / rect.width));
  const yRatio = Math.max(0, Math.min(0.999999, (clientY - rect.top) / rect.height));
  const sx = Math.floor(xRatio * video.videoWidth);
  const sy = Math.floor(yRatio * video.videoHeight);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return { r, g, b };
  } catch {
    return null;
  }
};

const isFullscreenTransparentBackdrop = (element: Element) => {
  if (typeof window === "undefined" || !(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.position !== "fixed") return false;

  const rect = element.getBoundingClientRect();
  const coversViewport =
    rect.left <= 1 &&
    rect.top <= 1 &&
    rect.width >= window.innerWidth - 2 &&
    rect.height >= window.innerHeight - 2;
  if (!coversViewport) return false;

  const backgroundColor = parseCssColor(style.backgroundColor);
  return backgroundColor === null;
};

const sampleColorFromElement = async (
  element: Element,
  clientX: number,
  clientY: number
): Promise<Color | null> => {
  let cursor: Element | null = element;
  let depth = 0;

  while (cursor && depth < 6) {
    if (cursor instanceof HTMLImageElement) {
      const sampled = await samplePixelFromImage(cursor, clientX, clientY);
      if (sampled) return sampled;
    }
    if (cursor instanceof HTMLVideoElement) {
      const sampled = samplePixelFromVideo(cursor, clientX, clientY);
      if (sampled) return sampled;
    }

    const attributeCandidates = [
      cursor.getAttribute("fill"),
      cursor.getAttribute("stroke"),
      cursor.getAttribute("stop-color"),
    ];
    for (const candidate of attributeCandidates) {
      const parsed = parseCssColor(candidate);
      if (parsed) return parsed;
    }

    const computed = window.getComputedStyle(cursor as Element);
    const computedCandidates = [
      computed.fill,
      computed.stroke,
      computed.backgroundColor,
      computed.color,
      computed.borderTopColor,
      computed.borderRightColor,
      computed.borderBottomColor,
      computed.borderLeftColor,
    ];
    for (const candidate of computedCandidates) {
      const parsed = parseCssColor(candidate);
      if (parsed) return parsed;
    }

    if (cursor === document.body || cursor === document.documentElement) break;
    cursor = cursor.parentElement;
    depth += 1;
  }

  return null;
};

export const ColorPicker = ({
  onChange,
  currentColor,
  boardId,
  onPickerActiveChange,
}: ColorPickerProps) => {
  const typedBoardId = boardId as Id<"boards"> | undefined;
  const hasBoardPersistence = Boolean(typedBoardId);
  const boardCustomColors = useQuery(
    api.board.getCustomColors,
    typedBoardId ? { id: typedBoardId } : "skip"
  );
  const saveBoardCustomColor = useMutation(api.board.addCustomColor);
  const removeBoardCustomColor = useMutation(api.board.removeCustomColor);
  const updateBoardCustomColor = useMutation(api.board.updateCustomColor);

  const pickerRootRef = useRef<HTMLDivElement>(null);
  const fallbackCleanupRef = useRef<(() => void) | null>(null);
  const fallbackUnlockTimeoutRef = useRef<number | null>(null);
  const [customColors, setCustomColors] = useState<Color[]>([]);
  const [selectedCustomColor, setSelectedCustomColor] = useState<Color | null>(null);
  const [editorColor, setEditorColor] = useState<Color>(() =>
    normalizeColor(currentColor ?? COLORS[0])
  );
  const [hexInput, setHexInput] = useState(() => colorToHex(normalizeColor(currentColor ?? COLORS[0])));
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    if (hasBoardPersistence) return;
    if (typeof window === "undefined") return;
    setCustomColors(parseStoredColors(window.localStorage.getItem(COLOR_STORAGE_KEY)));
  }, [hasBoardPersistence]);

  useEffect(() => {
    if (!hasBoardPersistence) return;
    if (!Array.isArray(boardCustomColors)) return;
    setCustomColors(boardCustomColors.map((color) => normalizeColor(color)));
  }, [boardCustomColors, hasBoardPersistence]);

  useEffect(() => {
    if (hasBoardPersistence) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(customColors));
  }, [customColors, hasBoardPersistence]);

  useEffect(() => {
    if (!currentColor) return;
    const normalized = normalizeColor(currentColor);
    setEditorColor(normalized);
    setHexInput(colorToHex(normalized));
  }, [currentColor]);

  useEffect(() => {
    if (!selectedCustomColor) return;
    const stillExists = customColors.some((entry) => colorsEqual(entry, selectedCustomColor));
    if (!stillExists) {
      setSelectedCustomColor(null);
    }
  }, [customColors, selectedCustomColor]);

  const isColorSelected = useCallback(
    (color: Color) => (currentColor ? colorsEqual(color, currentColor) : false),
    [currentColor]
  );

  const stopFallbackListener = useCallback(() => {
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
  }, []);

  const schedulePickerUnlock = useCallback((delayMs = 120) => {
    if (typeof window === "undefined") {
      onPickerActiveChange?.(false);
      return;
    }
    if (fallbackUnlockTimeoutRef.current !== null) {
      window.clearTimeout(fallbackUnlockTimeoutRef.current);
    }
    fallbackUnlockTimeoutRef.current = window.setTimeout(() => {
      onPickerActiveChange?.(false);
      fallbackUnlockTimeoutRef.current = null;
    }, delayMs);
  }, [onPickerActiveChange]);

  useEffect(
    () => () => {
      stopFallbackListener();
      if (fallbackUnlockTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(fallbackUnlockTimeoutRef.current);
        fallbackUnlockTimeoutRef.current = null;
      }
      onPickerActiveChange?.(false);
    },
    [onPickerActiveChange, stopFallbackListener]
  );

  const addCustomColor = useCallback((color: Color) => {
    const normalized = normalizeColor(color);
    setCustomColors((prev) => prependUniqueColor(prev, normalized));

    if (hasBoardPersistence && typedBoardId) {
      void saveBoardCustomColor({ id: typedBoardId, color: normalized })
        .then((nextPalette) => {
          if (!Array.isArray(nextPalette)) return;
          setCustomColors(nextPalette.map((entry) => normalizeColor(entry)));
        })
        .catch(() => {
          setPickerError("Impossibile salvare il colore sulla board.");
        });
      return;
    }

    if (typeof window === "undefined") return;

    const storedColors = parseStoredColors(window.localStorage.getItem(COLOR_STORAGE_KEY));
    const nextColors = prependUniqueColor(storedColors, normalized);
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(nextColors));
    setCustomColors(nextColors);
  }, [hasBoardPersistence, saveBoardCustomColor, typedBoardId]);

  const updateCustomColor = useCallback((previousColor: Color, nextColor: Color) => {
    const previous = normalizeColor(previousColor);
    const next = normalizeColor(nextColor);

    setCustomColors((prev) => replaceColorInPalette(prev, previous, next));

    if (hasBoardPersistence && typedBoardId) {
      void updateBoardCustomColor({ id: typedBoardId, previousColor: previous, nextColor: next })
        .then((nextPalette) => {
          if (!Array.isArray(nextPalette)) return;
          setCustomColors(nextPalette.map((entry) => normalizeColor(entry)));
        })
        .catch(() => {
          setPickerError("Impossibile aggiornare il colore custom sulla board.");
        });
      return;
    }

    if (typeof window === "undefined") return;
    const storedColors = parseStoredColors(window.localStorage.getItem(COLOR_STORAGE_KEY));
    const nextColors = replaceColorInPalette(storedColors, previous, next);
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(nextColors));
    setCustomColors(nextColors);
  }, [hasBoardPersistence, typedBoardId, updateBoardCustomColor]);

  const removeCustomColor = useCallback((color: Color) => {
    const normalized = normalizeColor(color);
    setCustomColors((prev) => prev.filter((entry) => !colorsEqual(entry, normalized)));

    if (hasBoardPersistence && typedBoardId) {
      void removeBoardCustomColor({ id: typedBoardId, color: normalized })
        .then((nextPalette) => {
          if (!Array.isArray(nextPalette)) return;
          setCustomColors(nextPalette.map((entry) => normalizeColor(entry)));
        })
        .catch(() => {
          setPickerError("Impossibile rimuovere il colore dalla board.");
        });
      return;
    }

    if (typeof window === "undefined") return;
    const storedColors = parseStoredColors(window.localStorage.getItem(COLOR_STORAGE_KEY));
    const nextColors = storedColors.filter((entry) => !colorsEqual(entry, normalized));
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(nextColors));
    setCustomColors(nextColors);
  }, [hasBoardPersistence, removeBoardCustomColor, typedBoardId]);

  useEffect(() => {
    if (!selectedCustomColor) return;
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      const colorToRemove = selectedCustomColor;
      setSelectedCustomColor(null);
      removeCustomColor(colorToRemove);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [removeCustomColor, selectedCustomColor]);

  const applyColor = useCallback((color: Color) => {
    const normalized = normalizeColor(color);
    setEditorColor(normalized);
    setHexInput(colorToHex(normalized));
    onChange(normalized);
  }, [onChange]);

  const applyEditorColorChange = useCallback((color: Color) => {
    const normalized = normalizeColor(color);
    setPickerError(null);

    if (selectedCustomColor) {
      if (!colorsEqual(selectedCustomColor, normalized)) {
        updateCustomColor(selectedCustomColor, normalized);
      }
      setSelectedCustomColor(normalized);
    }

    applyColor(normalized);
  }, [applyColor, selectedCustomColor, updateCustomColor]);

  const handleDefaultColorClick = useCallback((color: Color) => {
    setPickerError(null);
    setSelectedCustomColor(null);
    applyColor(color);
  }, [applyColor]);

  const handleCustomColorClick = useCallback((color: Color) => {
    const normalized = normalizeColor(color);
    setPickerError(null);
    setSelectedCustomColor(normalized);
    applyColor(normalized);
  }, [applyColor]);

  const handleAddCustomColor = useCallback(() => {
    const normalized = normalizeColor(editorColor);
    setPickerError(null);
    addCustomColor(normalized);
    setSelectedCustomColor(normalized);
    applyColor(normalized);
  }, [addCustomColor, applyColor, editorColor]);

  const handleHexInputChange = useCallback((rawValue: string) => {
    const prefixed = rawValue.startsWith("#") ? rawValue : `#${rawValue}`;
    const sanitized = `#${prefixed.slice(1).replace(/[^0-9a-fA-F]/g, "").slice(0, 6)}`;
    const normalizedHex = sanitized.toLowerCase();
    setHexInput(normalizedHex);
    setPickerError(null);
    const parsed = hexToColor(normalizedHex);
    if (!parsed) return;
    applyEditorColorChange(parsed);
  }, [applyEditorColorChange]);

  const hslColor = colorToHsl(editorColor);

  const handleRgbChannelChange = useCallback(
    (channel: "r" | "g" | "b", numeric: number) => {
      const next = {
        ...editorColor,
        [channel]: clampColorChannel(numeric),
      } as Color;
      applyEditorColorChange(next);
    },
    [applyEditorColorChange, editorColor]
  );

  const handleHslChannelChange = useCallback(
    (channel: "h" | "s" | "l", numeric: number) => {
      const nextH = channel === "h" ? Math.max(0, Math.min(360, numeric)) : hslColor.h;
      const nextS = channel === "s" ? Math.max(0, Math.min(100, numeric)) : hslColor.s;
      const nextL = channel === "l" ? Math.max(0, Math.min(100, numeric)) : hslColor.l;
      applyEditorColorChange(hslToColor(nextH, nextS, nextL));
    },
    [applyEditorColorChange, hslColor.h, hslColor.l, hslColor.s]
  );

  const handleEyeDropperPick = useCallback(async () => {
    if (typeof window === "undefined") return;
    stopFallbackListener();
    onPickerActiveChange?.(true);

    const EyeDropperCtor = (
      window as Window & { EyeDropper?: new () => EyeDropperLike }
    ).EyeDropper;

    if (!EyeDropperCtor) {
      setPickerError("Eyedropper non supportato: clicca un punto della board (Esc per annullare).");
      setIsPickingColor(true);

      const handlePointerDown = async (event: PointerEvent) => {
        const targetNode = event.target as Node | null;
        if (targetNode && pickerRootRef.current?.contains(targetNode)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const stack = document.elementsFromPoint(event.clientX, event.clientY).filter((element) => {
          if (pickerRootRef.current?.contains(element)) return false;
          if (element === document.body || element === document.documentElement) return false;
          if (isFullscreenTransparentBackdrop(element)) return false;
          return true;
        });

        let picked: Color | null = null;
        for (const candidate of stack) {
          picked = await sampleColorFromElement(candidate, event.clientX, event.clientY);
          if (picked) break;
        }

        if (picked) {
          setPickerError(null);
          applyEditorColorChange(picked);
        } else {
          setPickerError("Nessun colore rilevato su questo punto. Riprova.");
        }

        setIsPickingColor(false);
        stopFallbackListener();
        schedulePickerUnlock();
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        setPickerError(null);
        setIsPickingColor(false);
        stopFallbackListener();
        schedulePickerUnlock();
      };

      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("keydown", handleKeyDown, true);
      fallbackCleanupRef.current = () => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
        document.removeEventListener("keydown", handleKeyDown, true);
      };
      return;
    }

    setPickerError(null);
    setIsPickingColor(true);
    try {
      const eyeDropper = new EyeDropperCtor();
      const result = await eyeDropper.open();
      const pickedColor = hexToColor(result.sRGBHex);
      if (!pickedColor) {
        setPickerError("Colore non valido rilevato.");
        return;
      }
      applyEditorColorChange(pickedColor);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        setPickerError("Impossibile campionare il colore. Riprova.");
      }
    } finally {
      setIsPickingColor(false);
      schedulePickerUnlock();
    }
  }, [applyEditorColorChange, onPickerActiveChange, schedulePickerUnlock, stopFallbackListener]);

  return (
    <div ref={pickerRootRef} className="p-1.5 w-56 space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {COLORS.map((color, index) => (
          <ColorButton
            key={`default-${index}`}
            color={color}
            onClick={handleDefaultColorClick}
            isSelected={isColorSelected(color)}
          />
        ))}
      </div>

      <div className="h-px bg-slate-200/80" />

      <div className="grid grid-cols-4 gap-1.5 min-h-8">
        {customColors.map((color, index) => (
          <ColorButton
            key={`custom-${index}-${color.r}-${color.g}-${color.b}`}
            color={color}
            onClick={handleCustomColorClick}
            isSelected={isColorSelected(color)}
          />
        ))}
        <button
          type="button"
          onClick={handleAddCustomColor}
          className="relative w-8 h-8 rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors inline-flex items-center justify-center"
          title="Aggiungi colore custom"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2">
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="flex justify-center">
            <div
              className="h-8 min-h-8 w-8 min-w-8 shrink-0 aspect-square rounded-md border border-slate-300"
              style={{ backgroundColor: colorToCSS(editorColor) }}
              title="Colore corrente"
            />
          </div>
          <input
            type="text"
            inputMode="text"
            value={hexInput}
            onChange={(event) => handleHexInputChange(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center text-[10px] font-mono uppercase tracking-wide text-slate-600 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
            placeholder="#000000"
            title="HEX"
          />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleEyeDropperPick}
              disabled={isPickingColor}
              className="h-8 min-h-8 w-8 min-w-8 shrink-0 aspect-square p-0 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              title="Campiona colore dalla board"
            >
              <Pipette className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <ChannelInput
            label="R"
            value={editorColor.r}
            min={0}
            max={255}
            onCommit={(value) => handleRgbChannelChange("r", value)}
          />
          <ChannelInput
            label="G"
            value={editorColor.g}
            min={0}
            max={255}
            onCommit={(value) => handleRgbChannelChange("g", value)}
          />
          <ChannelInput
            label="B"
            value={editorColor.b}
            min={0}
            max={255}
            onCommit={(value) => handleRgbChannelChange("b", value)}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <ChannelInput
            label="H"
            value={hslColor.h}
            min={0}
            max={360}
            onCommit={(value) => handleHslChannelChange("h", value)}
          />
          <ChannelInput
            label="S"
            value={hslColor.s}
            min={0}
            max={100}
            onCommit={(value) => handleHslChannelChange("s", value)}
          />
          <ChannelInput
            label="L"
            value={hslColor.l}
            min={0}
            max={100}
            onCommit={(value) => handleHslChannelChange("l", value)}
          />
        </div>
        {pickerError && (
          <p className="mt-2 text-[10px] text-rose-600 leading-tight">{pickerError}</p>
        )}
      </div>
    </div>
  );
};

type ColorButtonProps = {
  color: Color;
  onClick: (color: Color) => void;
  isSelected?: boolean;
};

type ChannelInputProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
};

const ChannelInput = ({ label, value, min, max, onCommit }: ChannelInputProps) => {
  const [draftValue, setDraftValue] = useState(() => String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraftValue(String(value));
  }, [isFocused, value]);

  const commitValue = useCallback(() => {
    const raw = draftValue.trim();
    if (raw === "") {
      setDraftValue(String(value));
      return;
    }

    const numeric = Number.parseInt(raw, 10);
    if (Number.isNaN(numeric)) {
      setDraftValue(String(value));
      return;
    }

    const clamped = Math.max(min, Math.min(max, numeric));
    if (clamped !== value) {
      onCommit(clamped);
    }
    setDraftValue(String(clamped));
  }, [draftValue, max, min, onCommit, value]);

  return (
    <label className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 h-7">
      <span className="text-[10px] font-semibold text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draftValue}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          commitValue();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        onChange={(event) => {
          const sanitized = event.target.value.replace(/[^0-9]/g, "");
          setDraftValue(sanitized);
        }}
        className="w-full bg-transparent text-[10px] font-mono text-slate-700 outline-none"
      />
    </label>
  );
};

const ColorButton = ({ color, onClick, isSelected }: ColorButtonProps) => {
  return (
    <div className="relative">
      <button
        type="button"
        className={`
          relative w-8 h-8 rounded-lg transition-all duration-200
          ${isSelected
            ? "ring-2 ring-blue-500 ring-offset-1 scale-105"
            : "hover:scale-105"
          }
        `}
        onClick={() => onClick(color)}
        title={`R:${color.r}, G:${color.g}, B:${color.b}`}
      >
        <div
          className="absolute inset-0 rounded-lg border border-gray-200/60"
          style={{ background: colorToCSS(color) }}
        />
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Check
              className="w-3 h-3 text-white"
              style={{
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
              }}
            />
          </div>
        )}
      </button>
    </div>
  );
};
