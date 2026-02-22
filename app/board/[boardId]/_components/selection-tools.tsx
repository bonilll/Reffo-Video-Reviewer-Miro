"use client";

import { 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignEndVertical,
  ChevronDown,
  Type,
  Bold,
  Italic,
  LayoutGrid,
  ChevronUp,
  Plus,
  Minus,
  AlignJustify,
  Underline,
  Strikethrough,
  AlignCenter,
  RefreshCw,
  Maximize2,
  RotateCcw,
  User,
  Play,
  Download,
  FileText,
  Image,
  Video,
  File as FileIcon,
  Layers,
  Box,
  Copy,
  BookmarkPlus,
  BookmarkCheck
} from "lucide-react";
import { memo, useState, useEffect, useRef } from "react";
import React from "react";
import { toast } from "sonner";

import { useDeleteLayers } from "@/hooks/use-delete-layers";
import { useLayerOrdering } from "@/hooks/use-layer-ordering";
import { useSelectionBounds } from "@/hooks/use-selection-bounds";
import { useMutation, useSelf, useStorage } from "@/liveblocks.config";
import { useQuery, useMutation as useConvexMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CanvasMode, LayerType } from "@/types/canvas";
import type { Camera, Color } from "@/types/canvas";
import { useSelection } from "@/hooks/useSelection";
import { 
  alignLeft, 
  alignCenter, 
  alignRight, 
  alignTop, 
  alignMiddle, 
  alignBottom,
  distributeHorizontally,
  distributeVertically
} from "@/utils/alignment";
import { colorToCSS, findLayersInFrame } from "@/lib/utils";

import { ColorPicker } from "./color-picker";
import { MasonryGridDialog } from "@/components/MasonryGridDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
// Download icon already imported above

type SelectionToolsProps = {
  camera: Camera;
  setLastUsedColor: (color: Color) => void;
  onShowColorPicker?: (show: boolean) => void;
  onActionHover?: (label: string) => void;
  onActionHoverEnd?: () => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  pencilStrokeWidth?: number;
  setPencilStrokeWidth?: (width: number) => void;
  canvasState?: any;
  lastUsedColor?: Color;
  // Note text formatting functions
  setLastUsedFontSize?: (fontSize: number) => void;
  setLastUsedFontWeight?: (fontWeight: string) => void;
  // Frame control functions
  onToggleFrameAutoResize?: (frameId: string) => void;
  onManualFrameResize?: (frameId: string) => void;
  // Mobile support
  isTouchDevice?: boolean;
  // Board ID for review mode
  boardId?: string;
  // Render inside the main toolbar container
  embedded?: boolean;
};

const CONTROL_BUTTON_COMPACT_CLASSES =
  "flex items-center gap-1.5 h-8 px-2.5 min-w-0 text-xs bg-white/90 text-slate-700 hover:bg-white hover:text-slate-900 rounded-xl border border-slate-200/80 transition-all duration-200 shadow-sm hover:shadow-sm";
const CONTROL_VALUE_BADGE_CLASSES =
  "inline-flex items-center rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-600";
const CONTROL_DROPDOWN_BASE =
  "absolute min-w-full bg-white/98 backdrop-blur-xl border border-slate-200/80 shadow-xl shadow-slate-200/40 rounded-2xl z-50 overflow-hidden";
const CONTROL_DROPDOWN_MENU =
  "bg-white/98 backdrop-blur-xl border border-slate-200/80 shadow-xl shadow-slate-200/40 rounded-2xl min-w-[var(--radix-popper-anchor-width)] w-[var(--radix-popper-anchor-width)]";
const CONTROL_MENU_ITEM =
  "w-full min-w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-all duration-200 cursor-pointer hover:bg-slate-100/80 text-slate-700 hover:text-slate-900 hover:shadow-sm";
const CONTROL_MENU_ITEM_ACTIVE =
  "bg-blue-600/10 text-blue-700 font-semibold border border-blue-200 shadow-sm";

const VIEWPORT_MARGIN = 10;
const MIN_DROPDOWN_SPACE = 130;

const useAdaptiveDropdownPlacement = (isOpen: boolean) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [placementClass, setPlacementClass] = useState("bottom-full mb-2 left-0");
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;

    const updatePlacement = () => {
      const triggerEl = triggerRef.current;
      const dropdownEl = dropdownRef.current;
      if (!triggerEl || !dropdownEl || typeof window === "undefined") return;

      const triggerRect = triggerEl.getBoundingClientRect();
      const dropdownRect = dropdownEl.getBoundingClientRect();

      const spaceAbove = Math.max(0, triggerRect.top - VIEWPORT_MARGIN);
      const spaceBelow = Math.max(0, window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN);
      const dropdownHeight = dropdownRect.height || 260;

      const shouldOpenDown =
        (spaceBelow >= dropdownHeight && spaceBelow >= spaceAbove) ||
        (spaceBelow >= MIN_DROPDOWN_SPACE && spaceBelow > spaceAbove);
      const verticalClass = shouldOpenDown ? "top-full mt-2" : "bottom-full mb-2";
      const maxVerticalSpace = shouldOpenDown ? spaceBelow : spaceAbove;
      setMaxHeight(Math.max(MIN_DROPDOWN_SPACE, Math.floor(maxVerticalSpace - 6)));

      const spaceRight = Math.max(0, window.innerWidth - triggerRect.left - VIEWPORT_MARGIN);
      const spaceLeft = Math.max(0, triggerRect.right - VIEWPORT_MARGIN);
      const dropdownWidth = Math.max(dropdownRect.width, triggerRect.width);
      const horizontalClass =
        (spaceRight >= dropdownWidth && spaceRight >= spaceLeft) || spaceRight >= MIN_DROPDOWN_SPACE
          ? "left-0"
          : "right-0";

      setPlacementClass(`${verticalClass} ${horizontalClass}`);
    };

    const scheduleUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePlacement);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [isOpen]);

  return {
    triggerRef,
    dropdownRef,
    placementClass,
    dropdownStyle: maxHeight ? ({ maxHeight: `${maxHeight}px` } as React.CSSProperties) : undefined,
  };
};

// Numeric input component with increment/decrement arrows and manual input
const NumericInput = memo(({ 
  value, 
  onChange, 
  min = 1, 
  max = 100, 
  step = 1, 
  unit = "", 
  placeholder = "",
  icon: Icon,
  className = ""
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  icon?: any;
  className?: string;
}) => {
  const [inputValue, setInputValue] = useState(value.toString());
  const [isEditing, setIsEditing] = useState(false);

  // Update input when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(value.toString());
    }
  }, [value, isEditing]);

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const numValue = parseInt(inputValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(clampedValue);
      setInputValue(clampedValue.toString());
    } else {
      setInputValue(value.toString());
    }
  };

  const handleInputFocus = () => {
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  return (
    <div className={`flex items-center h-9 bg-white/90 hover:bg-white rounded-xl border border-slate-200/80 transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] ${className}`}>
      {Icon && <Icon className="w-4 h-4 text-slate-500 ml-3 flex-shrink-0" />}
      
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 px-2 py-2 text-sm font-medium text-slate-700 bg-transparent border-0 outline-none min-w-12 text-center"
      />
      
      {unit && <span className="text-xs text-slate-500 mr-2 flex-shrink-0">{unit}</span>}
      
      <div className="flex flex-col border-l border-slate-200/60 ml-1">
        <button
          onClick={handleIncrement}
          type="button"
          className="px-2.5 py-1 hover:bg-slate-100/60 transition-colors duration-150 rounded-tr-xl active:bg-slate-200/60"
          title={`Increase by ${step}`}
        >
          <ChevronUp className="w-3 h-3 text-slate-500" />
        </button>
        <button
          onClick={handleDecrement}
          type="button"
          className="px-2.5 py-1 hover:bg-slate-100/60 transition-colors duration-150 rounded-br-xl active:bg-slate-200/60"
          title={`Decrease by ${step}`}
        >
          <ChevronDown className="w-3 h-3 text-slate-500" />
        </button>
      </div>
    </div>
  );
});

// Pencil stroke width selector for pencil tool
const PencilStrokeWidthSelector = memo(({ 
  strokeWidth, 
  onStrokeWidthChange 
}: { 
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  const strokeOptions = [
    { value: 8, label: "8px - Fine" },
    { value: 12, label: "12px - Normal" },
    { value: 16, label: "16px - Medium" },
    { value: 24, label: "24px - Thick" },
    { value: 32, label: "32px - Extra Thick" },
    { value: 48, label: "48px - Heavy" }
  ];

  const isPresetValue = strokeOptions.some(option => option.value === strokeWidth);

  if (isCustom) {
    return (
      <div className="flex items-center gap-1">
        <NumericInput
          value={strokeWidth}
          onChange={onStrokeWidthChange}
          min={4}
          max={80}
          step={2}
          unit="px"
          placeholder="16"
          className="min-w-24"
        />
        <button
          onClick={() => setIsCustom(false)}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200/70 bg-white/90 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors"
          title="Switch to presets"
        >
          ⋯
        </button>
      </div>
    );
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[92px] justify-between`}
        title="Stroke width"
      >
        <div className="flex items-center gap-1.5">
          <div 
            className="rounded bg-slate-700"
            style={{ width: `${Math.max(8, Math.min(strokeWidth / 2, 14))}px`, height: `${Math.min(strokeWidth / 4, 6)}px` }}
          />
          <span className={CONTROL_VALUE_BADGE_CLASSES}>
            {isPresetValue ? strokeWidth : `${strokeWidth}`}
          </span>
        </div>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-48 max-w-xs p-3`}
            style={dropdownStyle}
          >
            <div className="py-1">
              {strokeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onStrokeWidthChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`${CONTROL_MENU_ITEM} ${
                    strokeWidth === option.value ? CONTROL_MENU_ITEM_ACTIVE : ""
                  }`}
                >
                  <div 
                    className="w-5 bg-current rounded flex-shrink-0"
                    style={{ height: `${Math.min(option.value / 4, 6)}px` }}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
              <div className="border-t border-slate-100/80 my-1" />
              <button
                onClick={() => {
                  setIsCustom(true);
                  setIsOpen(false);
                }}
                className={CONTROL_MENU_ITEM}
              >
                <Type className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Custom size...</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Stroke width selector with dropdown and custom input
const StrokeWidthSelector = memo(({ selectedLayerIds }: { selectedLayerIds: string[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  const currentStrokeWidth = useStorage((root) => {
    const strokeWidths = selectedLayerIds
      .map(id => root.layers.get(id))
      .filter(layer => layer && (layer.type === "arrow" || layer.type === "line"))
      .map(layer => (layer as any).strokeWidth || 2);
    
    return strokeWidths.length > 0 && strokeWidths.every(w => w === strokeWidths[0]) 
      ? strokeWidths[0] 
      : 2;
  });

  const updateStrokeWidth = useMutation(
    ({ storage }, newWidth: number) => {
      const liveLayers = storage.get("layers");
      selectedLayerIds.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get("type") === "arrow" || layer.get("type") === "line")) {
          layer.update({ strokeWidth: newWidth });
        }
      });
    },
    [selectedLayerIds]
  );

  const strokeOptions = [
    { value: 1, label: "1px - Thin" },
    { value: 2, label: "2px - Normal" },
    { value: 3, label: "3px - Medium" },
    { value: 4, label: "4px - Bold" },
    { value: 6, label: "6px - Extra Bold" },
    { value: 8, label: "8px - Heavy" }
  ];

  const isPresetValue = strokeOptions.some(option => option.value === currentStrokeWidth);

  if (isCustom) {
    return (
      <div className="flex items-center gap-1">
        <NumericInput
          value={currentStrokeWidth}
          onChange={updateStrokeWidth}
          min={1}
          max={80}
          step={1}
          unit="px"
          placeholder="2"
          className="min-w-24"
        />
        <button
          onClick={() => setIsCustom(false)}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200/70 bg-white/90 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors"
          title="Switch to presets"
        >
          ⋯
        </button>
      </div>
    );
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[92px] justify-between`}
        title="Stroke width"
      >
        <span className="flex items-center gap-1.5">
          <Minus className="w-4 h-4 text-slate-500" />
          <span className={CONTROL_VALUE_BADGE_CLASSES}>
            {isPresetValue ? strokeOptions.find(opt => opt.value === currentStrokeWidth)?.value : currentStrokeWidth}px
          </span>
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-48 max-w-xs p-3`}
            style={dropdownStyle}
          >
            <div className="py-1">
              {strokeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateStrokeWidth(option.value);
                    setIsOpen(false);
                  }}
                  className={`${CONTROL_MENU_ITEM} ${
                    currentStrokeWidth === option.value ? CONTROL_MENU_ITEM_ACTIVE : ""
                  }`}
                >
                  <div 
                    className="w-5 h-1 bg-current rounded flex-shrink-0"
                    style={{ height: `${Math.min(option.value, 4)}px` }}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
              <div className="border-t border-slate-100/80 my-1" />
              <button
                onClick={() => {
                  setIsCustom(true);
                  setIsOpen(false);
                }}
                className={CONTROL_MENU_ITEM}
              >
                <Type className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Custom size...</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Font size selector with dropdown and custom input
const FontSizeSelector = memo(({ selectedLayerIds, onDropdownChange, setLastUsedFontSize }: { 
  selectedLayerIds: string[];
  onDropdownChange?: (open: boolean, dropdownId: string) => void;
  setLastUsedFontSize?: (fontSize: number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  // Notify parent about dropdown state changes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (onDropdownChange) {
      onDropdownChange(open, "font-size");
    }
  };

  const currentFontSize = useStorage((root) => {
    const fontSizes = selectedLayerIds
      .map(id => root.layers.get(id))
      .filter(layer => layer && (layer.type === LayerType.Text || layer.type === LayerType.Note))
      .map(layer => (layer as any).fontSize || 16);
    
    return fontSizes.length > 0 && fontSizes.every(size => size === fontSizes[0]) 
      ? fontSizes[0] 
      : 16;
  });

  const updateFontSize = useMutation(
    ({ storage }, newSize: number) => {
      const liveLayers = storage.get("layers");
      selectedLayerIds.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get("type") === LayerType.Text || layer.get("type") === LayerType.Note)) {
          layer.update({ fontSize: newSize });
        }
      });
      // Aggiorna lastUsedFontSize per le note future
      if (setLastUsedFontSize) {
        setLastUsedFontSize(newSize);
      }
    },
    [selectedLayerIds, setLastUsedFontSize]
  );

  const fontSizes = [
    { value: 12, label: "Small" },
    { value: 14, label: "Body" },
    { value: 16, label: "Regular" },
    { value: 18, label: "Large" },
    { value: 20, label: "Subtitle" },
    { value: 24, label: "Heading" },
    { value: 32, label: "Title" },
    { value: 48, label: "Display" }
  ];

  const isPresetValue = fontSizes.some(size => size.value === currentFontSize);

  if (isCustom) {
    return (
      <div className="flex items-center gap-1">
        <NumericInput
          value={currentFontSize}
          onChange={updateFontSize}
          min={8}
          max={288}
          step={1}
          unit="px"
          placeholder="16"
          icon={Type}
          className="min-w-28"
        />
        <button
          onClick={() => setIsCustom(false)}
          className="px-2 py-2.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          title="Switch to presets"
        >
          ⋯
        </button>
      </div>
    );
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => handleOpenChange(!isOpen)}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[84px] justify-between`}
        title="Font size"
      >
        <span className="flex items-center gap-1.5">
          <Type className="w-4 h-4 text-slate-500" />
          <span className={CONTROL_VALUE_BADGE_CLASSES}>
            {isPresetValue ? fontSizes.find(size => size.value === currentFontSize)?.value : currentFontSize}px
          </span>
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => handleOpenChange(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-52 max-w-xs p-3`}
            style={dropdownStyle}
          >
            <div className="max-h-60 overflow-y-auto overscroll-contain scrollbar-hidden pr-1">
              <div className="py-1">
                {fontSizes.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => {
                      updateFontSize(size.value);
                      handleOpenChange(false);
                    }}
                    className={`${CONTROL_MENU_ITEM} ${
                      currentFontSize === size.value ? CONTROL_MENU_ITEM_ACTIVE : ""
                    }`}
                  >
                    <span className="text-xs text-slate-400 min-w-6 flex-shrink-0 font-mono">{size.value}</span>
                    <span className="truncate">{size.label}</span>
                  </button>
                ))}
                <div className="border-t border-slate-100/80 my-1" />
                <button
                  onClick={() => {
                    setIsCustom(true);
                    handleOpenChange(false);
                  }}
                  className={CONTROL_MENU_ITEM}
                >
                  <Type className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Custom size...</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Font weight dropdown for text elements
const FontWeightDropdown = memo(({ selectedLayerIds, onDropdownChange, setLastUsedFontWeight }: { 
  selectedLayerIds: string[];
  onDropdownChange?: (open: boolean, dropdownId: string) => void;
  setLastUsedFontWeight?: (fontWeight: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  // Notify parent about dropdown state changes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (onDropdownChange) {
      onDropdownChange(open, "font-weight");
    }
  };
  
  const currentFontWeight = useStorage((root) => {
    const fontWeights = selectedLayerIds
      .map(id => root.layers.get(id))
      .filter(layer => layer && (layer.type === LayerType.Text || layer.type === LayerType.Note))
      .map(layer => (layer as any).fontWeight || "normal");
    
    return fontWeights.length > 0 && fontWeights.every(weight => weight === fontWeights[0]) 
      ? fontWeights[0] 
      : "normal";
  });

  const updateFontWeight = useMutation(
    ({ storage }, newWeight: string) => {
      // Controlla se c'è una nota in editing e usa la formattazione del testo selezionato
      if ((window as any).applyNoteFormatting) {
        // Se c'è una nota in editing, applica la formattazione al testo selezionato
        (window as any).applyNoteFormatting(newWeight === "bold" ? "bold" : "removeFormat");
        return;
      }
      
      // Altrimenti, applica la formattazione all'intera nota/testo
      const liveLayers = storage.get("layers");
      selectedLayerIds.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get("type") === LayerType.Text || layer.get("type") === LayerType.Note)) {
          layer.update({ fontWeight: newWeight });
        }
      });
      // Aggiorna lastUsedFontWeight per le note future
      if (setLastUsedFontWeight) {
        setLastUsedFontWeight(newWeight);
      }
    },
    [selectedLayerIds, setLastUsedFontWeight]
  );

  const fontWeights = [
    { value: "normal", label: "Regular", icon: Type },
    { value: "bold", label: "Bold", icon: Bold }
  ];

  return (
    <div ref={triggerRef} className="relative">
      <button
        onMouseDown={(e) => {
          if (typeof window !== "undefined" && (window as any).applyNoteFormatting) {
            e.preventDefault();
          }
        }}
        onClick={() => handleOpenChange(!isOpen)}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[78px] justify-between ${currentFontWeight === "bold" ? "font-bold" : ""}`}
        title="Font weight"
      >
        <span className="flex items-center gap-1.5">
          <Bold className="w-4 h-4 text-slate-500" />
          <span className={CONTROL_VALUE_BADGE_CLASSES}>
            {currentFontWeight === "bold" ? "700" : "400"}
          </span>
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => handleOpenChange(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-36 max-w-xs p-3`}
            style={dropdownStyle}
          >
            <div className="py-1">
              {fontWeights.map((weight) => (
                <button
                  key={weight.value}
                  onMouseDown={(e) => {
                    if (typeof window !== "undefined" && (window as any).applyNoteFormatting) {
                      e.preventDefault();
                    }
                  }}
                  onClick={() => {
                    updateFontWeight(weight.value);
                    handleOpenChange(false);
                  }}
                  className={`${CONTROL_MENU_ITEM} ${
                    currentFontWeight === weight.value ? CONTROL_MENU_ITEM_ACTIVE : ""
                  } ${weight.value === "bold" ? "font-bold" : ""}`}
                >
                  <weight.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{weight.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Text alignment button
const TextAlignmentButton = memo(({ selectedLayerIds, alignment, icon: IconComponent }: { 
  selectedLayerIds: string[];
  alignment: "left" | "center" | "right" | "justify";
  icon: any;
}) => {
  const currentAlignment = useStorage((root) => {
    const alignments = selectedLayerIds
      .map(id => root.layers.get(id))
      .filter(layer => layer && (layer.type === LayerType.Text || layer.type === LayerType.Note))
      .map(layer => (layer as any).textAlign || "left");
    
    return alignments.length > 0 && alignments.every(align => align === alignments[0]) 
      ? alignments[0] 
      : "left";
  });
  
  const updateAlignment = useMutation(
    ({ storage }, newAlignment: "left" | "center" | "right" | "justify") => {
      const liveLayers = storage.get("layers");
      selectedLayerIds.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get("type") === LayerType.Text || layer.get("type") === LayerType.Note)) {
          layer.update({ textAlign: newAlignment });
        }
      });
    },
    [selectedLayerIds]
  );

  const isActive = currentAlignment === alignment;

  return (
    <button
      onClick={() => updateAlignment(alignment)}
      className={`p-2.5 rounded-xl transition-all duration-200 ${
        isActive
          ? "bg-blue-600/10 text-blue-700 border border-blue-200 shadow-sm"
          : "bg-white/90 hover:bg-slate-100 text-slate-600 border border-slate-200/80"
      }`}
      title={`Align ${alignment}`}
    >
      <IconComponent className="w-4 h-4" />
    </button>
  );
});

// Text style button
const TextStyleButton = memo(({ selectedLayerIds, styleType, icon: IconComponent }: { 
  selectedLayerIds: string[];
  styleType: "italic" | "underline" | "strikethrough";
  icon: any;
}) => {
  const currentStyle = useStorage((root) => {
    const styles = selectedLayerIds
      .map(id => root.layers.get(id))
      .filter(layer => layer && (layer.type === LayerType.Text || layer.type === LayerType.Note))
      .map(layer => {
        if (styleType === "italic") return (layer as any).fontStyle || "normal";
        if (styleType === "underline") return (layer as any).textDecoration === "underline";
        if (styleType === "strikethrough") return (layer as any).textDecoration === "line-through";
        return false;
      });
    
    if (styleType === "italic") {
      return styles.length > 0 && styles.every(style => style === styles[0]) ? styles[0] : "normal";
    } else {
      return styles.length > 0 && styles.every(style => style === styles[0]) ? styles[0] : false;
    }
  });
  
  const updateStyle = useMutation(
    ({ storage }) => {
      if ((window as any).applyNoteFormatting) {
        const command =
          styleType === "italic"
            ? "italic"
            : styleType === "underline"
              ? "underline"
              : "strikeThrough";
        (window as any).applyNoteFormatting(command);
        return;
      }

      const liveLayers = storage.get("layers");
      selectedLayerIds.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get("type") === LayerType.Text || layer.get("type") === LayerType.Note)) {
          if (styleType === "italic") {
            const newStyle = currentStyle === "italic" ? "normal" : "italic";
            layer.update({ fontStyle: newStyle });
          } else if (styleType === "underline") {
            const newDecoration = currentStyle ? "none" : "underline";
            layer.update({ textDecoration: newDecoration });
          } else if (styleType === "strikethrough") {
            const newDecoration = currentStyle ? "none" : "line-through";
            layer.update({ textDecoration: newDecoration });
          }
        }
      });
    },
    [selectedLayerIds, styleType, currentStyle]
  );

  const isActive = styleType === "italic" ? currentStyle === "italic" : currentStyle === true;

  return (
    <button
      onMouseDown={(e) => {
        if (typeof window !== "undefined" && (window as any).applyNoteFormatting) {
          e.preventDefault();
        }
      }}
      onClick={updateStyle}
      className={`p-2.5 rounded-xl transition-all duration-200 ${
        isActive
          ? "bg-blue-600/10 text-blue-700 border border-blue-200 shadow-sm"
          : "bg-white/90 hover:bg-slate-100 text-slate-600 border border-slate-200/80"
      }`}
      title={styleType.charAt(0).toUpperCase() + styleType.slice(1)}
    >
      <IconComponent className="w-4 h-4" />
    </button>
  );
});

// Compact color picker
const CompactColorPicker = memo(({ 
  onColorChange, 
  currentColor,
  isVisible,
  onToggle,
  onStateChange
}: { 
  onColorChange: (color: Color) => void;
  currentColor?: Color;
  isVisible: boolean;
  onToggle: () => void;
  onStateChange?: (isOpen: boolean) => void;
}) => {
  const handleToggle = () => {
    const newState = !isVisible;
    onToggle();
    if (onStateChange) {
      onStateChange(newState);
    }
  };

  const handleColorChange = (color: Color) => {
    onColorChange(color);
    onToggle(); // Close the popup after color selection
    if (onStateChange) {
      onStateChange(false);
    }
  };
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isVisible);

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={handleToggle}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ease-out border border-slate-200/70 bg-white/90 hover:bg-white hover:border-slate-200 hover:scale-[1.03] active:scale-95 shadow-sm"
        style={{ 
          backgroundColor: currentColor ? colorToCSS(currentColor) : '#3b82f6' 
        }}
        title="Change color"
      />
      
      {isVisible && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleToggle} />
          <div 
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} p-3`}
            style={dropdownStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <ColorPicker onChange={handleColorChange} currentColor={currentColor} />
          </div>
        </>
      )}
    </div>
  );
});

// Action button component
const ActionButton = memo(({ 
  icon: Icon, 
  onClick, 
  onMouseEnter, 
  onMouseLeave, 
  title,
  variant = 'default',
  size = 'sm'
}: {
  icon: any;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title: string;
  variant?: 'default' | 'danger' | 'outline';
  size?: 'xs' | 'sm' | 'md';
}) => {
  const sizeClasses = size === 'xs' ? "w-7 h-7" : "w-9 h-9";
  const iconSizeClasses = size === 'xs' ? "w-3 h-3" : size === 'md' ? "w-5 h-5" : "w-4 h-4";
  const variantClasses = variant === 'danger' 
    ? "text-rose-600 hover:bg-rose-50/80 hover:text-rose-700 hover:shadow-md hover:shadow-rose-500/10" 
    : variant === 'outline'
    ? "text-slate-600 hover:bg-slate-50/80 hover:text-slate-700 border-slate-200/80 hover:shadow-md hover:shadow-black/5"
    : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-md hover:shadow-black/5";

  const backgroundClasses = variant === 'outline' 
    ? "bg-white/80 border-slate-200/80" 
    : "bg-white/90 border-slate-200/70 hover:border-slate-200";

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${sizeClasses} rounded-xl flex items-center justify-center transition-all duration-200 ease-out border hover:scale-[1.03] active:scale-95 ${backgroundClasses} ${variantClasses}`}
      title={title}
    >
      <Icon className={iconSizeClasses} />
    </button>
  );
});

// Text Controls Dropdown - Compact design combining alignment and styles
const TextControlsDropdown = memo(({ selectedLayerIds, onDropdownChange }: { 
  selectedLayerIds: string[];
  onDropdownChange?: (open: boolean, dropdownId: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  // Notify parent about dropdown state changes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (onDropdownChange) {
      onDropdownChange(open, "text-controls");
    }
  };
  
  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => handleOpenChange(!isOpen)}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[72px] justify-between`}
        title="Text formatting"
      >
        <span className="flex items-center gap-1.5">
          <Type className="w-4 h-4 text-slate-500" />
          <AlignCenter className="w-3.5 h-3.5 text-slate-500" />
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => handleOpenChange(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-64 p-3`}
            style={dropdownStyle}
          >
            <div className="py-1">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100/80">
                Text Alignment
              </div>
              <div className="px-2 py-2 flex items-center gap-1">
                <TextAlignmentButton selectedLayerIds={selectedLayerIds} alignment="left" icon={AlignLeft} />
                <TextAlignmentButton selectedLayerIds={selectedLayerIds} alignment="center" icon={AlignCenter} />
                <TextAlignmentButton selectedLayerIds={selectedLayerIds} alignment="right" icon={AlignRight} />
                <TextAlignmentButton selectedLayerIds={selectedLayerIds} alignment="justify" icon={AlignJustify} />
              </div>
              
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-t border-slate-100/80">
                Text Style
              </div>
              <div className="px-2 py-2 flex items-center gap-1">
                <TextStyleButton selectedLayerIds={selectedLayerIds} styleType="italic" icon={Italic} />
                <TextStyleButton selectedLayerIds={selectedLayerIds} styleType="underline" icon={Underline} />
                <TextStyleButton selectedLayerIds={selectedLayerIds} styleType="strikethrough" icon={Strikethrough} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Compact Alignment dropdown - simplified version
const CompactAlignmentDropdown = memo(({ selectedLayers, updateLayerPositions, onActionHover, onActionHoverEnd, onDropdownChange }: { 
  selectedLayers: any[];
  updateLayerPositions: (updates: any) => void;
  onActionHover?: (label: string) => void;
  onActionHoverEnd?: () => void;
  onDropdownChange?: (open: boolean, dropdownId: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { triggerRef, dropdownRef, placementClass, dropdownStyle } = useAdaptiveDropdownPlacement(isOpen);
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onDropdownChange?.(open, "alignment");
  };
  
  const alignmentOptions = [
    { icon: AlignLeft, label: "Align Left", action: () => updateLayerPositions(alignLeft(selectedLayers)) },
    { icon: AlignCenterHorizontal, label: "Align Center", action: () => updateLayerPositions(alignCenter(selectedLayers)) },
    { icon: AlignRight, label: "Align Right", action: () => updateLayerPositions(alignRight(selectedLayers)) },
    { icon: AlignStartVertical, label: "Align Top", action: () => updateLayerPositions(alignTop(selectedLayers)) },
    { icon: AlignCenterVertical, label: "Align Middle", action: () => updateLayerPositions(alignMiddle(selectedLayers)) },
    { icon: AlignEndVertical, label: "Align Bottom", action: () => updateLayerPositions(alignBottom(selectedLayers)) },
  ];

  const distributionOptions = selectedLayers.length >= 3 ? [
    { icon: AlignHorizontalDistributeCenter, label: "Distribute Horizontally", action: () => updateLayerPositions(distributeHorizontally(selectedLayers)) },
    { icon: AlignVerticalDistributeCenter, label: "Distribute Vertically", action: () => updateLayerPositions(distributeVertically(selectedLayers)) },
  ] : [];

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => handleOpenChange(!isOpen)}
        onMouseEnter={() => onActionHover?.("Alignment & Distribution")}
        onMouseLeave={onActionHoverEnd}
        className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[82px] justify-between`}
        title="Alignment & Distribution"
      >
        <span className="flex items-center gap-1.5">
          <LayoutGrid className="w-4 h-4 text-slate-500" />
          <span className={CONTROL_VALUE_BADGE_CLASSES}>{selectedLayers.length}</span>
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => handleOpenChange(false)} />
          <div
            ref={dropdownRef}
            className={`${CONTROL_DROPDOWN_BASE} ${placementClass} min-w-52 max-w-sm p-3`}
            style={dropdownStyle}
          >
            <div className="py-1">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100/80">
                Alignment
              </div>
              {alignmentOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => {
                    option.action();
                    handleOpenChange(false);
                  }}
                  className={CONTROL_MENU_ITEM}
                >
                  <option.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
              {distributionOptions.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-t border-slate-100/80">
                    Distribution
                  </div>
                  {distributionOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        option.action();
                        handleOpenChange(false);
                      }}
                      className={CONTROL_MENU_ITEM}
                    >
                      <option.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Frame Control Components
const FrameAutoResizeToggle = memo(({ 
  frameId, 
  isAutoResize, 
  onToggle 
}: { 
  frameId: string;
  isAutoResize: boolean;
  onToggle: (frameId: string) => void;
}) => {
  return (
    <button
      onClick={() => onToggle(frameId)}
      className={`
        flex items-center gap-2 h-9 px-3 rounded-xl transition-all duration-200 ease-out
        border border-slate-200/70 hover:border-slate-200 hover:scale-[1.02] active:scale-95
        ${isAutoResize 
          ? 'bg-blue-600/10 text-blue-700 hover:bg-blue-600/15 border-blue-200/80 shadow-sm' 
          : 'bg-white/90 text-slate-600 hover:bg-white hover:text-slate-900 shadow-sm hover:shadow-md'
        }
      `}
      title={isAutoResize ? "Disable auto-resize" : "Enable auto-resize"}
    >
      <RefreshCw className={`w-4 h-4 ${isAutoResize ? 'text-blue-600' : 'text-slate-500'}`} />
      <span className="text-sm font-medium">
        {isAutoResize ? "Auto-resize ON" : "Auto-resize OFF"}
      </span>
    </button>
  );
});

const FrameResizeToFitButton = memo(({ 
  frameId, 
  onResize 
}: { 
  frameId: string;
  onResize: (frameId: string) => void;
}) => {
  return (
    <button
      onClick={() => onResize(frameId)}
      className="
        flex items-center gap-2 h-9 px-3 rounded-xl transition-all duration-200 ease-out
        bg-white/90 text-slate-600 hover:bg-white hover:text-slate-900
        border border-slate-200/70 hover:border-slate-200
        shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95
      "
      title="Resize frame to fit content"
    >
      <Maximize2 className="w-4 h-4" />
      <span className="text-sm font-medium">Resize to fit</span>
    </button>
  );
});

// Download Options Dropdown
const DownloadOptionsDropdown = memo(({ 
  selectedDownloadableData,
  selection,
  onDownloadFiles,
  onExportJSON,
  onDropdownChange 
}: { 
  selectedDownloadableData: Array<{ id: string; type: "file" | "image" | "video"; url: string; fileName: string; fileType: string; title: string; }>;
  selection: string[];
  onDownloadFiles: () => void;
  onExportJSON: () => void;
  onDropdownChange?: (open: boolean, dropdownId: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onDropdownChange?.(open, "download-options");
  };

  const hasFiles = selectedDownloadableData.some(item => item.type === "file");
  const hasImages = selectedDownloadableData.some(item => item.type === "image");
  const hasVideos = selectedDownloadableData.some(item => item.type === "video");
  const hasMultipleTypes = [hasFiles, hasImages, hasVideos].filter(Boolean).length > 1;

  const getMainIcon = () => {
    if (hasMultipleTypes) return Download;
    if (hasFiles) return FileIcon;
    if (hasImages) return Image;
    if (hasVideos) return Video;
    return Download;
  };

  const getMainLabel = () => {
    const count = selectedDownloadableData.length;
    if (hasMultipleTypes) return `Download ${count} items`;
    if (hasFiles) return count === 1 ? "Download file" : `Download ${count} files`;
    if (hasImages) return count === 1 ? "Download image" : `Download ${count} images`;
    if (hasVideos) return count === 1 ? "Download video" : `Download ${count} videos`;
    return "Download";
  };

  const MainIcon = getMainIcon();
  const mainLabel = getMainLabel();

  // If only one type and one item, use compact icon-only button
  if (!hasMultipleTypes && selectedDownloadableData.length === 1) {
    return (
      <button
        onClick={onDownloadFiles}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ease-out border border-slate-200/70 bg-white/90 hover:bg-white hover:border-slate-200 hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow-md text-slate-600 hover:text-slate-900"
        title={mainLabel}
      >
        <Download className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="relative">
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ease-out border border-slate-200/70 bg-white/90 hover:bg-white hover:border-slate-200 hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow-md text-slate-600 hover:text-slate-900 relative group"
            title="Download options"
          >
            <Download className="w-4 h-4" />
            <ChevronDown className="w-2 h-2 absolute -bottom-0.5 -right-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="center" 
          className="w-64 bg-white/98 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/40 z-50 overflow-visible"
          sideOffset={8}
        >
          <div className="py-2">
            {/* Download files/assets */}
            <DropdownMenuItem
              onClick={() => {
                onDownloadFiles();
                handleOpenChange(false);
              }}
              className="flex items-center gap-3 rounded-lg mx-2 px-3 py-3 transition-all duration-200 cursor-pointer hover:bg-blue-50/80 text-slate-700 hover:text-blue-900 hover:shadow-sm"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Download className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{mainLabel}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {hasFiles && `${selectedDownloadableData.filter(i => i.type === "file").length} files`}
                  {hasFiles && (hasImages || hasVideos) && ", "}
                  {hasImages && `${selectedDownloadableData.filter(i => i.type === "image").length} images`}
                  {hasImages && hasVideos && ", "}
                  {hasVideos && `${selectedDownloadableData.filter(i => i.type === "video").length} videos`}
                </div>
              </div>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-2 mx-2" />

            {/* Export as JSON */}
            <DropdownMenuItem
              onClick={() => {
                onExportJSON();
                handleOpenChange(false);
              }}
              className="flex items-center gap-3 rounded-lg mx-2 px-3 py-3 transition-all duration-200 cursor-pointer hover:bg-green-50/80 text-slate-700 hover:text-green-900 hover:shadow-sm"
            >
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <FileText className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">Export as JSON</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Save selection data to file
                </div>
              </div>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

FrameAutoResizeToggle.displayName = "FrameAutoResizeToggle";
FrameResizeToFitButton.displayName = "FrameResizeToFitButton";
TextControlsDropdown.displayName = "TextControlsDropdown";
CompactAlignmentDropdown.displayName = "CompactAlignmentDropdown";
DownloadOptionsDropdown.displayName = "DownloadOptionsDropdown";

// Selection tooltip component - appears above each tool individually
const SelectionTooltip = ({ children }: { 
  children: React.ReactNode; 
  label: string; 
  isVisible: boolean; 
}) => {
  return <>{children}</>;
};

export const SelectionTools = memo(
  ({ 
    camera, 
    setLastUsedColor, 
    onShowColorPicker,
    onActionHover,
    onActionHoverEnd,
    containerRef,
    pencilStrokeWidth,
    setPencilStrokeWidth,
    canvasState,
    lastUsedColor,
    // Note text formatting functions
    setLastUsedFontSize,
    setLastUsedFontWeight,
    // Frame control functions
    onToggleFrameAutoResize,
    onManualFrameResize,
    // Mobile support
    isTouchDevice,
    embedded = false
  }: SelectionToolsProps) => {
    const selection = useSelf((me) => me.presence.selection);
    const { bringToFront, sendToBack } = useLayerOrdering();
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [hoveredSelection, setHoveredSelection] = useState<string>("");
    // Stato per tracciare dropdown aperti
    const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
    const { hasMultipleSelection, selectedLayers, updateLayerPositions } = useSelection();
    const createLibraryAsset = useConvexMutation(api.assets.createFromBoardMedia);
    const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
    const [isExportingFrameId, setIsExportingFrameId] = useState<string | null>(null);

    // Check if pencil is active
    const isPencilActive = canvasState && canvasState.mode === CanvasMode.Pencil;
    const hasEditingNote = typeof window !== "undefined" && typeof (window as any).applyNoteFormatting === "function";

    // Get current color of selected layers OR lastUsedColor when pencil is active
    const currentColor = useStorage((root) => {
      if (selection.length === 0) {
        // If pencil is active but no elements selected, show lastUsedColor  
        return isPencilActive ? lastUsedColor : undefined; // Let it use the default color
      }
      
      const colors = selection
        .map(id => root.layers.get(id))
        .filter(layer => layer && layer.hasOwnProperty("fill"))
        .map(layer => (layer as any).fill);
      
      return colors.length > 0 && colors.every(c => 
        c.r === colors[0].r && c.g === colors[0].g && c.b === colors[0].b
      ) ? colors[0] : undefined;
    });

    // Check element types
    const hasArrowsOrLines = useStorage((root) => {
      return selection.some(id => {
        const layer = root.layers.get(id);
        return layer && (layer.type === "arrow" || layer.type === "line");
      });
    });

    const hasTextElements = useStorage((root) => {
      // Controlla se ci sono elementi di testo selezionati
      const hasSelectedText = selection.some(id => {
        const layer = root.layers.get(id);
        return layer && (layer.type === "text" || layer.type === "note");
      });
      
      // Controlla anche se c'è una nota in editing (anche se non selezionata)
      const hasEditingNote = (window as any).applyNoteFormatting !== undefined;
      
      return hasSelectedText || hasEditingNote;
    });

    // Font family selector (component scope)
    const FONT_FAMILIES = [
      { label: 'Inter', value: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial" },
      { label: 'Roboto', value: "Roboto, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial" },
      { label: 'Georgia', value: "Georgia, 'Times New Roman', Times, serif" },
      { label: 'Mono', value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" },
    ];
    const normalizeFontKey = (value?: string) =>
      (value ? value.split(",")[0].replace(/['"]/g, "").trim().toLowerCase() : "");

    const setFontFamily = useMutation(({ storage }, fontFamily: string) => {
      const liveLayers = storage.get('layers');
      selection.forEach(id => {
        const layer = liveLayers.get(id);
        if (layer && (layer.get('type') === LayerType.Text || layer.get('type') === LayerType.Note)) {
          layer.update({ fontFamily });
        }
      });
    }, [selection]);

    const currentFontFamily = useStorage((root) => {
      const families = selection
        .map(id => root.layers.get(id))
        .filter(layer => layer && (layer.type === LayerType.Text || layer.type === LayerType.Note))
        .map(layer => (layer as any).fontFamily as string | undefined)
        .filter(Boolean);

      return families.length > 0 && families.every(family => family === families[0])
        ? (families[0] as string)
        : undefined;
    });
    const currentFontKey = normalizeFontKey(currentFontFamily);
    const currentFontLabel =
      FONT_FAMILIES.find((ff) => normalizeFontKey(ff.value) === currentFontKey)?.label ||
      (currentFontFamily ? currentFontFamily.split(",")[0].replace(/['"]/g, "") : "Mixed");
    const currentFontShortLabel =
      currentFontLabel.length > 8 ? `${currentFontLabel.slice(0, 8)}…` : currentFontLabel;

  const sanitizeFileNamePart = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "frame";

  const escapeCssSelectorValue = (value: string) => {
    if (typeof window !== "undefined" && (window as any).CSS?.escape) {
      return (window as any).CSS.escape(value);
    }
    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  };

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: number | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const removeFrameSelectionArtifacts = (frameClone: Element) => {
    const rects = Array.from(frameClone.querySelectorAll("rect"));
    rects.forEach((rect) => {
      const x = Number.parseFloat(rect.getAttribute("x") ?? "");
      const y = Number.parseFloat(rect.getAttribute("y") ?? "");
      const fill = (rect.getAttribute("fill") ?? "").trim().toLowerCase();
      const strokeWidth = Number.parseFloat(
        rect.getAttribute("stroke-width") ?? rect.getAttribute("strokeWidth") ?? ""
      );

      const isFrameSelectionRect =
        fill === "none" &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        ((Math.abs(x + 2) < 0.01 && Math.abs(y + 2) < 0.01 && Math.abs(strokeWidth - 2.5) < 0.01) ||
          (Math.abs(x + 1) < 0.01 && Math.abs(y + 1) < 0.01 && Math.abs(strokeWidth - 1) < 0.01));

      if (isFrameSelectionRect) {
        rect.remove();
      }
    });
  };

  const stripSelectionUiFromLayerClone = (
    rootClone: Element,
    layerIdsInRoot: string[],
    selectedLayerIds: Set<string>
  ) => {
    const selectedIdsInRoot = layerIdsInRoot.filter((id) => selectedLayerIds.has(id));
    if (selectedIdsInRoot.length === 0) return;

    const outlineLayerTypes = new Set<LayerType>([
      LayerType.Image,
      LayerType.Video,
      LayerType.File,
      LayerType.Text,
      LayerType.Note,
      LayerType.Table,
      LayerType.TodoWidget,
      LayerType.Arrow,
      LayerType.Line,
    ]);
    const strokeSelectionLayerTypes = new Set<LayerType>([
      LayerType.Rectangle,
      LayerType.Ellipse,
      LayerType.Path,
    ]);

    for (const selectedId of selectedIdsInRoot) {
      const meta = frameExportLayerIndex.layers[selectedId];
      if (!meta) continue;

      const selector = `[data-layer-id="${escapeCssSelectorValue(selectedId)}"]`;
      const taggedNodes = [
        ...(rootClone.matches(selector) ? [rootClone] : []),
        ...Array.from(rootClone.querySelectorAll(selector)),
      ] as Element[];

      if (outlineLayerTypes.has(meta.type)) {
        taggedNodes.forEach((node) => {
          const styleTarget = node as HTMLElement;
          styleTarget.style.outline = "none";
          styleTarget.style.outlineOffset = "";
        });
      }

      if (strokeSelectionLayerTypes.has(meta.type)) {
        taggedNodes.forEach((node) => {
          const tag = node.tagName.toLowerCase();
          if (tag === "rect" || tag === "ellipse" || tag === "path") {
            node.setAttribute("stroke", "transparent");
            node.setAttribute("stroke-opacity", "0");
          }
        });
      }

      if (meta.type === LayerType.Frame) {
        removeFrameSelectionArtifacts(rootClone);
      }
    }
  };

  const sanitizeMediaForExport = (rootClone: Element) => {
    // html-to-image can hang/fail on <video> inside foreignObject; use poster/placeholder instead.
    rootClone.querySelectorAll("video").forEach((videoNode) => {
      const poster = videoNode.getAttribute("poster");
      const replacement = document.createElement("img");
      replacement.setAttribute("alt", "Video preview");
      replacement.setAttribute(
        "style",
        (videoNode.getAttribute("style") || "") + ";width:100%;height:100%;object-fit:cover;"
      );
      replacement.setAttribute("class", videoNode.getAttribute("class") || "");
      if (poster) {
        replacement.setAttribute("src", poster);
      } else {
        replacement.setAttribute(
          "src",
          "data:image/svg+xml;utf8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#e2e8f0"/><circle cx="160" cy="90" r="24" fill="#0f172a"/><polygon points="153,78 153,102 174,90" fill="#fff"/></svg>`
            )
        );
      }
      videoNode.parentNode?.replaceChild(replacement, videoNode);
    });

    // Embedded players (e.g. YouTube iframe previews) taint canvas or fail in html-to-image.
    rootClone.querySelectorAll("iframe").forEach((iframeNode) => {
      const replacement = document.createElement("div");
      replacement.setAttribute("role", "img");
      replacement.setAttribute("aria-label", "Embedded preview");
      replacement.setAttribute(
        "style",
        [
          iframeNode.getAttribute("style") || "",
          "width:100%;height:100%;display:flex;align-items:center;justify-content:center;",
          "background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;",
          "font:600 13px/1.2 Arial,sans-serif;text-align:center;border-radius:12px;",
          "padding:12px;box-sizing:border-box;",
        ].join(";")
      );
      replacement.setAttribute("class", iframeNode.getAttribute("class") || "");
      replacement.textContent = "Embedded media preview";
      iframeNode.parentNode?.replaceChild(replacement, iframeNode);
    });
  };

  const createExportImagePlaceholder = (label: string) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
        <rect width="100%" height="100%" fill="#f1f5f9"/>
        <rect x="8" y="8" width="304" height="164" rx="10" ry="10" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
          fill="#64748b" font-family="Arial, sans-serif" font-size="14" font-weight="600">${label}</text>
      </svg>`
    );

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Unable to read blob"));
      reader.readAsDataURL(blob);
    });

  const fetchExportAssetBlob = async (assetUrl: string) => {
    const fetchDirect = async () => {
      const response = await fetch(assetUrl, {
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "image/*,*/*",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.blob();
    };

    try {
      return await withTimeout(fetchDirect(), 12000, "Export asset fetch");
    } catch (directError) {
      // Fallback to server proxy if available (same strategy already used by file downloads).
      try {
        const proxyResponse = await withTimeout(
          fetch("/api/download-proxy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: assetUrl,
              fileName: "frame-export-asset",
            }),
          }),
          15000,
          "Export asset proxy fetch"
        );

        if (!proxyResponse.ok) {
          throw new Error(`Proxy HTTP ${proxyResponse.status}`);
        }

        return await proxyResponse.blob();
      } catch (proxyError) {
        throw new Error(
          `Asset fetch failed (${assetUrl.slice(0, 120)}): ${String(
            (proxyError as Error)?.message || (directError as Error)?.message || "unknown error"
          )}`
        );
      }
    }
  };

  const inlineExternalAssetsForExport = async (rootClone: Element) => {
    const urlCache = new Map<string, Promise<{ url: string; isPlaceholder: boolean }>>();
    let inlinedCount = 0;
    let placeholderCount = 0;

    const getNormalizedAssetUrl = (value: string | null | undefined) => {
      const raw = (value || "").trim();
      if (!raw) return null;
      if (raw.startsWith("data:")) return raw;
      try {
        return new URL(raw, window.location.href).href;
      } catch {
        return raw;
      }
    };

    const getInlinedUrl = (assetUrl: string, label: string) => {
      if (assetUrl.startsWith("data:")) {
        return Promise.resolve({ url: assetUrl, isPlaceholder: false });
      }

      const cached = urlCache.get(assetUrl);
      if (cached) return cached;

      const promise = (async () => {
        try {
          const blob = await fetchExportAssetBlob(assetUrl);
          if (!blob || blob.size === 0) {
            throw new Error("empty blob");
          }
          const dataUrl = await blobToDataUrl(blob);
          if (!dataUrl.startsWith("data:")) {
            throw new Error("invalid data URL");
          }
          return { url: dataUrl, isPlaceholder: false };
        } catch (error) {
          console.warn("[Frame Export] Failed to inline asset, using placeholder", {
            assetUrl,
            label,
            error,
          });
          return { url: createExportImagePlaceholder(label), isPlaceholder: true };
        }
      })();

      urlCache.set(assetUrl, promise);
      return promise;
    };

    const htmlImages = Array.from(rootClone.querySelectorAll("img"));
    for (const imgNode of htmlImages) {
      const currentSrc = getNormalizedAssetUrl(imgNode.getAttribute("src"));
      if (!currentSrc) continue;
      const inlinedSrc = await getInlinedUrl(currentSrc, "Image");
      if (!inlinedSrc?.url) continue;
      imgNode.setAttribute("src", inlinedSrc.url);
      imgNode.removeAttribute("srcset");
      imgNode.removeAttribute("crossorigin");
      if (inlinedSrc.isPlaceholder) {
        placeholderCount += 1;
      } else {
        inlinedCount += 1;
      }
    }

    const svgImages = Array.from(rootClone.querySelectorAll("image"));
    for (const svgImageNode of svgImages) {
      const rawHref =
        svgImageNode.getAttribute("href") ||
        svgImageNode.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        svgImageNode.getAttribute("xlink:href");
      const normalizedHref = getNormalizedAssetUrl(rawHref);
      if (!normalizedHref) continue;

      const inlinedHref = await getInlinedUrl(normalizedHref, "Media");
      if (!inlinedHref?.url) continue;

      svgImageNode.setAttribute("href", inlinedHref.url);
      svgImageNode.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", inlinedHref.url);
      if (inlinedHref.isPlaceholder) {
        placeholderCount += 1;
      } else {
        inlinedCount += 1;
      }
    }

    return { inlinedCount, placeholderCount };
  };

  const isLikelyBlankPngBlob = async (blob: Blob, width: number, height: number) => {
    if (blob.size === 0) return true;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await withTimeout(
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Unable to decode exported PNG"));
          image.src = objectUrl;
        }),
        8000,
        "PNG decode validation"
      );

      const sampleCanvas = document.createElement("canvas");
      const sampleW = Math.max(1, Math.min(64, width));
      const sampleH = Math.max(1, Math.min(64, height));
      sampleCanvas.width = sampleW;
      sampleCanvas.height = sampleH;
      const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;

      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

      let meaningfulPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 8) continue;

        // Treat near-white fully-opaque pixels as background.
        const isNearWhite = r > 248 && g > 248 && b > 248;
        if (!isNearWhite) {
          meaningfulPixels += 1;
          if (meaningfulPixels >= 4) return false;
        }
      }

      return true;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const exportFrameWithNativeDimensions = async (frameId: string) => {
    if (isExportingFrameId) return;

    let offscreenContainer: HTMLDivElement | null = null;
    try {
      const frame = selectedFramesData.find((f) => f.id === frameId);
      if (!frame) {
        toast.error("Frame non trovato.");
        return;
      }

      if (!frameExportLayerIndex || !frameExportLayerIndex.layers) {
        toast.error("Dati board non ancora pronti. Riprova tra un istante.");
        return;
      }

      const frameMeta = frameExportLayerIndex.layers[frameId];
      if (!frameMeta) {
        toast.error("Dati del frame non disponibili.");
        return;
      }

      const boardCanvas = document.querySelector(".board-canvas") as HTMLElement | null;
      const directChildSvg = boardCanvas
        ? Array.from(boardCanvas.children).find(
            (child) => child instanceof Element && child.tagName.toLowerCase() === "svg"
          )
        : null;
      const svgElement = directChildSvg as SVGSVGElement | null;

      if (!boardCanvas || !svgElement) {
        console.error("[Frame Export] Board SVG not found", {
          boardCanvasFound: Boolean(boardCanvas),
          childTags: boardCanvas ? Array.from(boardCanvas.children).map((c) => (c as Element).tagName) : [],
        });
        toast.error("Canvas board non trovato.");
        return;
      }

      const worldGroup = Array.from(svgElement.children).find(
        (child) => child instanceof Element && child.tagName.toLowerCase() === "g"
      ) as SVGGElement | undefined;

      if (!worldGroup) {
        console.error("[Frame Export] Invalid SVG structure: world group missing");
        toast.error("Struttura SVG non valida.");
        return;
      }

      const outputWidth = Math.max(1, Math.round(frame.width));
      const outputHeight = Math.max(1, Math.round(frame.height));
      const frameX = frame.x;
      const frameY = frame.y;

      const layerIdsToExport = new Set<string>();
      const visitedFrames = new Set<string>();

      const collectFrameTree = (currentFrameId: string) => {
        if (visitedFrames.has(currentFrameId)) return;
        visitedFrames.add(currentFrameId);

        const meta = frameExportLayerIndex.layers[currentFrameId];
        if (!meta) return;

        layerIdsToExport.add(currentFrameId);

        const children = Array.isArray(meta.children) ? meta.children : [];
        for (const childId of children) {
          layerIdsToExport.add(childId);
          const childMeta = frameExportLayerIndex.layers[childId];
          if (childMeta?.type === LayerType.Frame) {
            collectFrameTree(childId);
          }
        }
      };

      collectFrameTree(frameId);

      // Fallback geometrico: include elementi sovrapposti al frame anche se la gerarchia `children`
      // non è aggiornata (può succedere durante alcune operazioni live).
      const geometryMap = new Map<string, any>();
      Object.entries(frameExportLayerIndex.layers).forEach(([id, meta]) => {
        geometryMap.set(id, meta);
      });
      for (const layerId of findLayersInFrame(frameId, geometryMap as any, frameExportLayerIndex.layerIds)) {
        layerIdsToExport.add(layerId);
      }
      layerIdsToExport.add(frameId);

      const selectedLayerIds = new Set(selection);

      const collectLayerIdsFromSubtree = (root: Element) => {
        const ids = new Set<string>();
        const rootId = root.getAttribute("data-layer-id");
        if (rootId) ids.add(rootId);
        root.querySelectorAll("[data-layer-id]").forEach((node) => {
          const id = node.getAttribute("data-layer-id");
          if (id) ids.add(id);
        });
        return Array.from(ids);
      };

      const sourceLayerRoots: Array<{ index: number; root: Element; layerIds: string[] }> = [];
      Array.from(worldGroup.children).forEach((childNode, index) => {
        if (!(childNode instanceof Element)) return;
        const subtreeLayerIds = collectLayerIdsFromSubtree(childNode).filter((id) =>
          layerIdsToExport.has(id)
        );
        if (subtreeLayerIds.length === 0) return;
        sourceLayerRoots.push({ index, root: childNode, layerIds: subtreeLayerIds });
      });

      if (sourceLayerRoots.length === 0) {
        console.error("[Frame Export] No layer roots found", {
          frameId,
          layerIdsToExport: Array.from(layerIdsToExport),
          worldChildrenCount: worldGroup.children.length,
        });
        toast.error("Nessun elemento del frame trovato per l'export.");
        return;
      }

      // Se c'è un elemento editabile attivo dentro la board, chiudiamo l'editing per evitare caret/input nell'export.
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.closest(".board-canvas") && typeof activeElement.blur === "function") {
        activeElement.blur();
        await waitForNextFrame();
      }

      setIsExportingFrameId(frameId);
      const exportSvg = svgElement.cloneNode(true) as SVGSVGElement;
      exportSvg.setAttribute("width", String(outputWidth));
      exportSvg.setAttribute("height", String(outputHeight));
      exportSvg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
      exportSvg.style.background = "white";

      const exportWorldGroup = Array.from(exportSvg.children).find(
        (child) => child instanceof Element && child.tagName.toLowerCase() === "g"
      ) as SVGGElement | undefined;

      if (!exportWorldGroup) {
        toast.error("Struttura SVG export non valida.");
        return;
      }

      const exportWorldChildren = Array.from(exportWorldGroup.children);

      for (let childIndex = exportWorldChildren.length - 1; childIndex >= 0; childIndex -= 1) {
        const exportChild = exportWorldChildren[childIndex];
        if (!(exportChild instanceof Element)) continue;

        const exportChildLayerIds = collectLayerIdsFromSubtree(exportChild).filter((id) =>
          layerIdsToExport.has(id)
        );

        if (exportChildLayerIds.length === 0) {
          exportChild.remove();
          continue;
        }

        exportChild.querySelectorAll("[contenteditable]").forEach((node) =>
          node.removeAttribute("contenteditable")
        );
        stripSelectionUiFromLayerClone(exportChild, exportChildLayerIds, selectedLayerIds);
        sanitizeMediaForExport(exportChild);
      }

      exportWorldGroup.setAttribute("transform", `translate(${-frameX} ${-frameY})`);
      exportSvg.removeAttribute("class");
      exportSvg.style.width = `${outputWidth}px`;
      exportSvg.style.height = `${outputHeight}px`;
      exportSvg.style.maxWidth = "none";
      exportSvg.style.maxHeight = "none";
      exportSvg.style.display = "block";
      exportSvg.style.background = "white";
      exportSvg.setAttribute("preserveAspectRatio", "none");

      const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      backgroundRect.setAttribute("x", "0");
      backgroundRect.setAttribute("y", "0");
      backgroundRect.setAttribute("width", String(frame.width));
      backgroundRect.setAttribute("height", String(frame.height));
      backgroundRect.setAttribute("fill", "white");
      exportSvg.insertBefore(backgroundRect, exportSvg.firstChild);

      const assetInliningStats = await inlineExternalAssetsForExport(exportSvg);
      if (assetInliningStats.inlinedCount > 0 || assetInliningStats.placeholderCount > 0) {
        console.info("[Frame Export] Asset inlining completed", {
          frameId,
          ...assetInliningStats,
        });
      }

      offscreenContainer = document.createElement("div");
      offscreenContainer.style.position = "fixed";
      offscreenContainer.style.left = "0";
      offscreenContainer.style.top = "0";
      offscreenContainer.style.width = `${outputWidth}px`;
      offscreenContainer.style.height = `${outputHeight}px`;
      offscreenContainer.style.background = "#ffffff";
      offscreenContainer.style.overflow = "hidden";
      offscreenContainer.style.pointerEvents = "none";
      offscreenContainer.style.zIndex = "-1";
      offscreenContainer.style.contain = "layout paint style";
      offscreenContainer.appendChild(exportSvg);
      document.body.appendChild(offscreenContainer);

      await waitForNextFrame();
      await waitForNextFrame();

      const fileBase =
        sanitizeFileNamePart(frameMeta.title || frame.title || "frame") ||
        `frame-${frameId.slice(-6)}`;
      const fileName = `${fileBase}-${outputWidth}x${outputHeight}.png`;

      const isSafariLike = (() => {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
      })();

      const scheduleObjectUrlRevoke = (url: string) => {
        window.setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // noop
          }
        }, 30000);
      };

      const triggerDownloadUrl = (url: string) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = "noopener noreferrer";
        anchor.style.position = "fixed";
        anchor.style.left = "-10000px";
        anchor.style.top = "0";
        anchor.style.opacity = "0";
        anchor.style.pointerEvents = "none";
        document.body.appendChild(anchor);

        let clickError: unknown = null;
        try {
          if (typeof anchor.click === "function") {
            anchor.click();
          } else {
            anchor.dispatchEvent(
              new MouseEvent("click", { view: window, bubbles: true, cancelable: true })
            );
          }
        } catch (error) {
          clickError = error;
        } finally {
          window.setTimeout(() => {
            if (anchor.parentNode) {
              anchor.parentNode.removeChild(anchor);
            }
          }, 1000);
        }

        // Safari (especially mobile) may ignore programmatic downloads; open the image as fallback.
        if (isSafariLike) {
          window.setTimeout(() => {
            try {
              window.open(url, "_blank", "noopener,noreferrer");
            } catch {
              // noop
            }
          }, 50);
        }

        if (clickError) {
          throw clickError;
        }
      };

      const triggerBlobDownload = (blob: Blob) => {
        const nav = navigator as any;
        if (typeof nav?.msSaveOrOpenBlob === "function") {
          nav.msSaveOrOpenBlob(blob, fileName);
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        triggerDownloadUrl(blobUrl);
        scheduleObjectUrlRevoke(blobUrl);
      };

      try {
        const { toBlob } = await import("html-to-image");
        const pngBlob = await withTimeout(
          toBlob(offscreenContainer, {
            width: outputWidth,
            height: outputHeight,
            canvasWidth: outputWidth,
            canvasHeight: outputHeight,
            pixelRatio: 1,
            backgroundColor: "#ffffff",
            useCORS: true,
            skipFonts: true,
            cacheBust: false,
            includeQueryParams: true,
            skipAutoScale: true,
            style: {
              width: `${outputWidth}px`,
              height: `${outputHeight}px`,
            } as any,
            filter: (node: HTMLElement) => {
              const tag = node.tagName?.toLowerCase?.();
              if (tag === "script") return false;
              return true;
            },
          }),
          12000,
          "Frame PNG export"
        );

        if (!pngBlob) {
          throw new Error("html-to-image returned empty blob");
        }

        if (layerIdsToExport.size > 1) {
          const isBlank = await isLikelyBlankPngBlob(pngBlob, outputWidth, outputHeight);
          if (isBlank) {
            console.warn("[Frame Export] Blank PNG detected after html-to-image", {
              frameId,
              outputWidth,
              outputHeight,
              exportedLayerCount: layerIdsToExport.size,
            });
            throw new Error("html-to-image produced a blank PNG");
          }
        }

        triggerBlobDownload(pngBlob);
      } catch (htmlToImageError) {
        // Fallback conservativo: serializza l'SVG e rasterizza via Canvas.
        // Può fallire con alcune foreignObject/CORS, ma copre diversi casi browser-specific.
        console.warn("[Frame Export] html-to-image failed, trying SVG fallback", htmlToImageError);

        const svgString = new XMLSerializer().serializeToString(exportSvg);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);

        try {
          const img = new window.Image();
          const canvas = document.createElement("canvas");
          canvas.width = outputWidth;
          canvas.height = outputHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");

          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              try {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, outputWidth, outputHeight);
                ctx.drawImage(img, 0, 0, outputWidth, outputHeight);
                resolve();
              } catch (error) {
                reject(error);
              }
            };
            img.onerror = () => reject(new Error("SVG rasterization failed"));
            img.src = svgUrl;
          });

          const pngBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png", 1)
          );
          if (!pngBlob) throw new Error("PNG blob generation failed");

          if (layerIdsToExport.size > 1) {
            const isBlank = await isLikelyBlankPngBlob(pngBlob, outputWidth, outputHeight);
            if (isBlank) {
              console.warn("[Frame Export] Blank PNG detected after SVG fallback", {
                frameId,
                outputWidth,
                outputHeight,
                exportedLayerCount: layerIdsToExport.size,
              });
              throw new Error("SVG fallback produced a blank PNG");
            }
          }

          triggerBlobDownload(pngBlob);
        } finally {
          URL.revokeObjectURL(svgUrl);
        }
      }

      toast.success(`PNG esportato (${outputWidth}x${outputHeight})`);
    } catch (error) {
      console.error("[Frame Export] Failed to export frame PNG", {
        frameId,
        error,
      });
      toast.error("Export PNG del frame non riuscito.");
    } finally {
      if (offscreenContainer?.parentNode) {
        offscreenContainer.parentNode.removeChild(offscreenContainer);
      }
      setIsExportingFrameId(null);
    }
  };

    // Verifica se ci sono shape/media con shadow disattivabile
    const canToggleShadow = useStorage((root) => {
      return selection.some(id => {
        const layer = root.layers.get(id);
        if (!layer) return false;
        const type = layer.type;
        return type === "rectangle" || type === "ellipse" || type === "arrow" || type === "line" || type === "image" || type === "video" || type === "file";
      });
    });
    const shadowState = useStorage((root) => {
      const supported = selection
        .map((id) => root.layers.get(id))
        .filter((layer) => {
          if (!layer) return false;
          const type = layer.type;
          return (
            type === "rectangle" ||
            type === "ellipse" ||
            type === "arrow" ||
            type === "line" ||
            type === "image" ||
            type === "video" ||
            type === "file"
          );
        });
      if (supported.length === 0) return "off" as const;
      const states = supported.map((layer) => ((layer as any).shadow === false ? false : true));
      const allOn = states.every(Boolean);
      const allOff = states.every((value) => !value);
      if (allOn) return "on" as const;
      if (allOff) return "off" as const;
      return "mixed" as const;
    });

    // Check if any notes are selected and get note data
    const selectedNotesData = useStorage((root) => {
      const notes = selection
        .map(id => {
          const layer = root.layers.get(id);
          return layer && layer.type === LayerType.Note ? { 
            id, 
            showMetadata: (layer as any).showMetadata !== false, // default true
            lastModifiedBy: (layer as any).lastModifiedBy || "User",
            lastModifiedAt: (layer as any).lastModifiedAt,
            type: layer.type
          } : null;
        })
        .filter(Boolean) as Array<{ id: string; showMetadata: boolean; lastModifiedBy: string; lastModifiedAt?: string; [key: string]: any }>;
      
      return notes;
    });
    
    const hasNotes = selectedNotesData.length > 0;
    const singleNoteSelected = selectedNotesData.length === 1;

    // Check if any frames are selected and get frame data
    const selectedFramesData = useStorage((root) => {
      const frames = selection
        .map(id => {
          const layer = root.layers.get(id);
          return layer && layer.type === "frame" ? { 
            id, 
            autoResize: (layer as any).autoResize || false,
            type: layer.type,
            title: (layer as any).title || "Frame",
            clipping: (layer as any).clipping !== false,
            children: Array.isArray((layer as any).children) ? [...(layer as any).children] : [],
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height
          } : null;
        })
        .filter(Boolean) as Array<{ id: string; autoResize: boolean; [key: string]: any }>;
      
      return frames;
    });
    
    const hasFrames = selectedFramesData.length > 0;
    const singleFrameSelected = selectedFramesData.length === 1;

    const frameExportLayerIndex = useStorage((root) => {
      const layerIds = Array.from(root.layerIds as any as Iterable<string>) as string[];
      const layers: Record<string, {
        type: LayerType;
        x: number;
        y: number;
        width: number;
        height: number;
        title?: string;
        children?: string[];
      }> = {};

      root.layers.forEach((liveLayer: any, id: string) => {
        layers[id] = {
          type: liveLayer.type as LayerType,
          x: typeof liveLayer.x === "number" ? liveLayer.x : 0,
          y: typeof liveLayer.y === "number" ? liveLayer.y : 0,
          width: typeof liveLayer.width === "number" ? liveLayer.width : 0,
          height: typeof liveLayer.height === "number" ? liveLayer.height : 0,
          title: typeof liveLayer.title === "string" ? liveLayer.title : undefined,
          children:
            liveLayer.type === LayerType.Frame && Array.isArray(liveLayer.children)
              ? [...liveLayer.children]
              : undefined,
        };
      });

      return { layerIds, layers };
    });

    // Check if any images or videos are selected and get their data
    const selectedMediaData = useStorage((root) => {
      const media = selection
        .map(id => {
          const layer = root.layers.get(id);
          if (layer && (layer.type === "image" || layer.type === "video")) {
            return { 
              id, 
              type: layer.type as "image" | "video",
              url: (layer as any).url || "",
              name: `${layer.type === "image" ? "Immagine" : "Video"} ${id.slice(-4)}`,
              x: layer.x,
              y: layer.y,
              width: layer.width,
              height: layer.height
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{ id: string; type: "image" | "video"; url: string; name: string; [key: string]: any }>;
      
      return media;
    });
    
    const hasMediaAssets = selectedMediaData.length > 0;
    const singleMediaSelected = selectedMediaData.length === 1;

    // Check if any downloadable assets are selected (files, images, videos) and get their data
    const selectedDownloadableData = useStorage((root) => {
      const downloadables = selection
        .map(id => {
          const layer = root.layers.get(id);
          if (layer && (layer.type === "file" || layer.type === "image" || layer.type === "video")) {
            if (layer.type === "file") {
              if ((layer as any).isLinkPreview || (layer as any).fileType === "link") {
                return null;
              }
              return { 
                id, 
                type: "file" as const,
                url: (layer as any).url || "",
                fileName: (layer as any).fileName || `File_${id.slice(-4)}.${(layer as any).fileType || "bin"}`,
                fileType: (layer as any).fileType || "file",
                title: (layer as any).title || (layer as any).fileName || `File ${id.slice(-4)}`,
                fileSize: (layer as any).fileSize,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height
              };
            } else if (layer.type === "image") {
              const url = (layer as any).url || "";
              const fileExtension = url.split('.').pop()?.toLowerCase() || "jpg";
              return {
                id,
                type: "image" as const,
                url,
                fileName: `Image_${id.slice(-4)}.${fileExtension}`,
                fileType: fileExtension,
                title: (layer as any).title || `Image ${id.slice(-4)}`,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height
              };
            } else if (layer.type === "video") {
              const url = (layer as any).url || "";
              const fileExtension = url.split('.').pop()?.toLowerCase() || "mp4";
              return {
                id,
                type: "video" as const,
                url,
                fileName: `Video_${id.slice(-4)}.${fileExtension}`,
                fileType: fileExtension,
                title: (layer as any).title || `Video ${id.slice(-4)}`,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height
              };
            }
          }
          return null;
        })
        .filter(Boolean) as Array<{ id: string; type: "file" | "image" | "video"; url: string; fileName: string; fileType: string; title: string; fileSize?: number; [key: string]: any }>;
      
      return downloadables;
    });
    
    const hasDownloadableAssets = selectedDownloadableData.length > 0;
    const singleDownloadableSelected = selectedDownloadableData.length === 1;
    const selectedDownloadableUrls = Array.from(
      new Set(
        selectedDownloadableData
          .map((item) => item.url)
          .filter((url) => Boolean(url))
      )
    );
    const savedLibraryUrls = useQuery(
      api.assets.getByFileUrls,
      selectedDownloadableUrls.length > 0 ? { fileUrls: selectedDownloadableUrls } : "skip"
    );
    const savedLibraryUrlSet = new Set(savedLibraryUrls ?? []);
    const allSelectedSaved =
      selectedDownloadableUrls.length > 0 &&
      selectedDownloadableUrls.every((url) => savedLibraryUrlSet.has(url));
    const unsavedCount = selectedDownloadableUrls.filter((url) => !savedLibraryUrlSet.has(url)).length;

    const handleSaveToLibrary = async () => {
      if (isSavingToLibrary || selectedDownloadableData.length === 0 || allSelectedSaved) return;
      setIsSavingToLibrary(true);
      try {
        let saved = 0;
        for (const item of selectedDownloadableData) {
          if (!item.url) continue;
          await createLibraryAsset({
            fileUrl: item.url,
            fileName: item.fileName || item.title || `Asset_${item.id.slice(-4)}`,
            type: item.type,
            title: item.title,
            fileSize: item.fileSize,
            source: "board",
          });
          saved += 1;
        }
        if (saved > 0) {
          toast.success(`${saved} item${saved > 1 ? "s" : ""} saved to library`);
        }
      } catch (error) {
        console.error("❌ Error saving to library:", error);
        toast.error("Error saving to library");
      } finally {
        setIsSavingToLibrary(false);
      }
    };

    // Legacy support - keep existing selectedFileData for backward compatibility
    const selectedFileData = selectedDownloadableData.filter(item => item.type === "file");
    const hasFileAssets = selectedFileData.length > 0;
    const singleFileSelected = selectedFileData.length === 1;

    const setFill = useMutation(
      ({ storage }, fill: Color) => {
        const liveLayers = storage.get("layers");
        setLastUsedColor(fill);

        selection.forEach((id) => {
          const layer = liveLayers.get(id);
          if (layer && layer.toObject().hasOwnProperty("fill")) {
            (layer as any).set("fill", fill);
          }
        });
      },
      [selection, setLastUsedColor],
    );

    // Toggle metadata visibility for notes
    const toggleNoteMetadata = useMutation(
      ({ storage }, noteId: string) => {
        const liveLayers = storage.get("layers");
        const layer = liveLayers.get(noteId);
        if (layer && layer.get("type") === "note") {
          const currentShowMetadata = (layer as any).get("showMetadata");
          (layer as any).set("showMetadata", !currentShowMetadata);
        }
      },
      [],
    );

    // Toggle shadow per elementi selezionati
    const toggleShadow = useMutation(({ storage }) => {
      const liveLayers = storage.get("layers");
      // Determina stato corrente: se tutti hanno shadow === false allora accendi, altrimenti spegni
      const states = selection.map(id => {
        const layer = liveLayers.get(id);
        return layer ? ((layer as any).get("shadow") === false ? false : true) : true;
      });
      const willEnable = states.every(s => s === false);
      selection.forEach(id => {
        const layer = liveLayers.get(id);
        if (!layer) return;
        // Applica solo a tipi supportati
        const type = (layer as any).get("type");
        if (["rectangle","ellipse","arrow","line","image","video","file"].includes(type as any)) {
          (layer as any).set("shadow", willEnable);
        }
      });
    }, [selection]);

    // Enhanced download function that forces download instead of opening in browser
    const downloadFile = async (fileUrl: string, fileName: string) => {
      // Validate URL
      if (!fileUrl || fileUrl.trim() === '') {
        console.error(`[Download] Invalid URL for ${fileName}: empty or null`);
        alert(`Unable to download ${fileName}: Invalid file URL`);
        return;
      }

      try {

        // Method 1: Try fetch with blob (best for CORS-enabled files)
        try {
          const response = await fetch(fileUrl, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
              'Accept': '*/*',
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Validate blob
          if (!blob || blob.size === 0) {
            throw new Error('Empty file received');
          }
          
          // Force download with blob URL
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.style.display = 'none';
          
          // Force download behavior
          a.setAttribute('download', fileName);
          a.setAttribute('target', '_self');
          
          document.body.appendChild(a);
          a.click();
          
          // Cleanup
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            if (document.body.contains(a)) {
              document.body.removeChild(a);
            }
          }, 100);
          
          return;
        } catch (fetchError) {
          console.warn(`[Download] Fetch method failed for ${fileName}:`, fetchError);
        }

        // Method 2: Skip iframe method (unreliable) and go directly to proxy

        // Method 3: Server-side proxy download (if available)
        try {
          const proxyResponse = await fetch('/api/download-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: fileUrl,
              fileName: fileName
            })
          });

          if (proxyResponse.ok) {
            const blob = await proxyResponse.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
              window.URL.revokeObjectURL(url);
              if (document.body.contains(a)) {
                document.body.removeChild(a);
              }
            }, 100);
            
            return;
          }
        } catch (proxyError) {
          console.warn(`[Download] Proxy method not available:`, proxyError);
        }

        // Method 4: Direct link with forced download headers
        try {
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = fileName;
          a.style.display = 'none';
          
          // Add additional attributes to force download
          a.setAttribute('download', fileName);
          a.setAttribute('target', '_self');
          a.setAttribute('rel', 'noopener');
          
          document.body.appendChild(a);
          
          // Try to trigger download
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          
          a.dispatchEvent(clickEvent);
          
          setTimeout(() => {
            if (document.body.contains(a)) {
              document.body.removeChild(a);
            }
          }, 100);
          
          return;
        } catch (directError) {
          console.warn(`[Download] Direct method failed for ${fileName}:`, directError);
        }

        // Last resort: Inform user and provide manual download option
        throw new Error('All download methods failed');

      } catch (error) {
        console.error(`[Download] All download methods failed for ${fileName}:`, error);
        
        // Show user-friendly error with manual download option
        const userResponse = confirm(
          `Unable to automatically download "${fileName}". ` +
          `This might be due to browser security restrictions or CORS policies.\n\n` +
          `Would you like to try opening the file in a new tab so you can download it manually?`
        );
        
        if (userResponse) {
          // Open in new tab as last resort, but with download hint in URL if possible  
          const downloadUrl = fileUrl.includes('?') 
            ? `${fileUrl}&download=1&filename=${encodeURIComponent(fileName)}`
            : `${fileUrl}?download=1&filename=${encodeURIComponent(fileName)}`;
            
          window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        }
      }
    };

    // Export selected layers as JSON
    const exportLayersAsJSON = useStorage((root) => {
      return () => {};
    });

    const deleteLayers = useDeleteLayers();
    const selectionBounds = useSelectionBounds();

    // Tooltip handlers
    const handleMouseEnter = (label: string) => {
      setHoveredSelection(label);
      if (onActionHover) onActionHover(label);
    };
    
    const handleMouseLeave = () => {
      setHoveredSelection("");
      if (onActionHoverEnd) onActionHoverEnd();
    };
    
    // Helper functions per gestire dropdown aperti
    const addOpenDropdown = (dropdownId: string) => {
      setOpenDropdowns(prev => new Set([...prev, dropdownId]));
    };
    
    const removeOpenDropdown = (dropdownId: string) => {
      setOpenDropdowns(prev => {
        const newSet = new Set(prev);
        newSet.delete(dropdownId);
        return newSet;
      });
    };
    
    // Funzione per verificare se mostrare tooltip (non mostrare se dropdown correlato è aperto)
    const shouldShowSelectionTooltip = (tooltipId: string, dropdownId?: string) => {
      // Special case for color picker - check both old state and new tracking system
      if (tooltipId === "Change color" && (showColorPicker || openDropdowns.has("color-picker"))) {
        return false;
      }
      
      if (dropdownId && openDropdowns.has(dropdownId)) {
        return false;
      }
      return hoveredSelection === tooltipId;
    };
    
    // Color picker toggle
    const toggleColorPicker = () => {
      const newState = !showColorPicker;
      setShowColorPicker(newState);
      if (onShowColorPicker) onShowColorPicker(newState);
    };

    // Close color picker when selection changes (but not when pencil is active)
    useEffect(() => {
      if (selection.length === 0 && !isPencilActive) {
        setShowColorPicker(false);
        if (onShowColorPicker) onShowColorPicker(false);
      }
    }, [selection.length, onShowColorPicker, isPencilActive]);

    // Show SelectionTools if there are selected elements OR if pencil is active
    if ((!selectionBounds || selection.length === 0) && !isPencilActive && !hasEditingNote) return null;
    
    return (
      <div className="selection-tools relative z-30" data-note-formatting-ui="true">
        {/* Contenitore principale - moderno, leggero e allineato alla toolbar */}
        <div
          className={
            embedded
              ? "relative overflow-visible px-1 py-1"
              : "border border-slate-200/80 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-200/40 px-2.5 py-1.5 mb-3 relative overflow-visible"
          }
        >
          <div className="flex items-center gap-x-1.5 gap-y-1.5 relative z-10 flex-wrap overflow-visible">{/* Overflow visible on flex container too */}
                          {/* Style controls group - compact layout */}
            <div className="flex items-center gap-x-1.5">
              {/* Color control - show if elements are selected OR pencil is active */}
              {((selectionBounds && selection.length > 0) || isPencilActive || hasEditingNote) && (
                <SelectionTooltip label="Change color" isVisible={shouldShowSelectionTooltip("Change color")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter("Change color")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <CompactColorPicker
                      onColorChange={setFill}
                      currentColor={currentColor}
                      isVisible={showColorPicker}
                      onToggle={toggleColorPicker}
                      onStateChange={(isOpen) => {
                        if (isOpen) {
                          addOpenDropdown("color-picker");
                        } else {
                          removeOpenDropdown("color-picker");
                        }
                      }}
                    />
                  </div>
                </SelectionTooltip>
              )}

              {/* Shadow toggle */}
              {canToggleShadow && (
                <SelectionTooltip label="Shadow" isVisible={shouldShowSelectionTooltip("Shadow")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter("Shadow")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      onClick={toggleShadow}
                      className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[80px]`}
                      title="Toggle shadow"
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-slate-500" />
                        <span className={CONTROL_VALUE_BADGE_CLASSES}>
                          {shadowState === "mixed" ? "--" : shadowState === "on" ? "On" : "Off"}
                        </span>
                      </span>
                    </button>
                  </div>
                </SelectionTooltip>
              )}
          
              {/* Pencil stroke width control - show when pencil is active */}
              {isPencilActive && pencilStrokeWidth !== undefined && setPencilStrokeWidth && (
                <SelectionTooltip label="Pencil stroke width" isVisible={shouldShowSelectionTooltip("Pencil stroke width")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter("Pencil stroke width")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <PencilStrokeWidthSelector
                      strokeWidth={pencilStrokeWidth}
                      onStrokeWidthChange={setPencilStrokeWidth}
                    />
                  </div>
                </SelectionTooltip>
              )}
            
              {/* Text controls - more compact layout */}
              {hasTextElements && (
                <div className="flex items-center gap-x-2">
                  {/* Font family */}
                  <SelectionTooltip label="Font" isVisible={shouldShowSelectionTooltip("Font", "font-family") }>
                    <div onMouseEnter={() => handleMouseEnter("Font")} onMouseLeave={handleMouseLeave}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[112px] justify-between`}>
                            <span className="flex items-center gap-1.5">
                              <Type className="w-4 h-4 text-slate-500" />
                              <span
                                className={CONTROL_VALUE_BADGE_CLASSES}
                                style={{ fontFamily: currentFontFamily || undefined }}
                              >
                                {currentFontShortLabel}
                              </span>
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-500" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className={`${CONTROL_DROPDOWN_MENU} w-44 p-3`} align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                          {FONT_FAMILIES.map(ff => (
                            <DropdownMenuItem
                              key={ff.label}
                              onClick={() => setFontFamily(ff.value)}
                              className={`${CONTROL_MENU_ITEM} ${
                                normalizeFontKey(ff.value) === currentFontKey ? CONTROL_MENU_ITEM_ACTIVE : ""
                              }`}
                            >
                              <span style={{ fontFamily: ff.value }}>{ff.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SelectionTooltip>
                  <SelectionTooltip label="Font size" isVisible={shouldShowSelectionTooltip("Font size", "font-size")}>
                    <div 
                      onMouseEnter={() => handleMouseEnter("Font size")} 
                      onMouseLeave={handleMouseLeave}
                    >
                      <FontSizeSelector 
                        selectedLayerIds={selection} 
                        setLastUsedFontSize={setLastUsedFontSize}
                        onDropdownChange={(open, dropdownId) => {
                          if (open) {
                            addOpenDropdown(dropdownId);
                          } else {
                            removeOpenDropdown(dropdownId);
                          }
                        }} 
                      />
                    </div>
                  </SelectionTooltip>
                  
                  <SelectionTooltip label="Font weight" isVisible={shouldShowSelectionTooltip("Font weight", "font-weight")}>
                    <div 
                      onMouseEnter={() => handleMouseEnter("Font weight")} 
                      onMouseLeave={handleMouseLeave}
                    >
                      <FontWeightDropdown 
                        selectedLayerIds={selection}
                        setLastUsedFontWeight={setLastUsedFontWeight}
                        onDropdownChange={(open, dropdownId) => {
                          if (open) {
                            addOpenDropdown(dropdownId);
                          } else {
                            removeOpenDropdown(dropdownId);
                          }
                        }}
                      />
                    </div>
                  </SelectionTooltip>
                  
                  {/* Text Alignment & Style Dropdown - NEW COMPACT DESIGN */}
                  <SelectionTooltip label="Text formatting" isVisible={shouldShowSelectionTooltip("Text formatting", "text-controls")}>
                    <div 
                      onMouseEnter={() => handleMouseEnter("Text formatting")} 
                      onMouseLeave={handleMouseLeave}
                    >
                      <TextControlsDropdown 
                        selectedLayerIds={selection}
                        onDropdownChange={(open, dropdownId) => {
                          if (open) {
                            addOpenDropdown(dropdownId);
                          } else {
                            removeOpenDropdown(dropdownId);
                          }
                        }}
                      />
                    </div>
                  </SelectionTooltip>
                </div>
              )}

              {/* Stroke width for arrows/lines */}
              {hasArrowsOrLines && (
                <SelectionTooltip label="Stroke width" isVisible={shouldShowSelectionTooltip("Stroke width")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter("Stroke width")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <StrokeWidthSelector selectedLayerIds={selection} />
                  </div>
                </SelectionTooltip>
              )}

              {/* Frame controls - compact layout */}
              {hasFrames && onToggleFrameAutoResize && onManualFrameResize && (
                <div className="flex items-center gap-x-2">
                  {singleFrameSelected && (
                    <div className="flex items-center gap-x-2">
                      <SelectionTooltip label="Toggle auto-resize" isVisible={shouldShowSelectionTooltip("Toggle auto-resize")}>
                        <div 
                          onMouseEnter={() => handleMouseEnter("Toggle auto-resize")} 
                          onMouseLeave={handleMouseLeave}
                        >
                          <FrameAutoResizeToggle
                            frameId={selectedFramesData[0].id}
                            isAutoResize={selectedFramesData[0].autoResize || false}
                            onToggle={onToggleFrameAutoResize}
                          />
                        </div>
                      </SelectionTooltip>
                      
                      <SelectionTooltip label="Download PNG" isVisible={shouldShowSelectionTooltip("Download PNG")}>
                        <div onMouseEnter={() => handleMouseEnter("Download PNG")} onMouseLeave={handleMouseLeave}>
                          <button
                            type="button"
                            disabled={isExportingFrameId === selectedFramesData[0].id}
                            className={`
                              flex items-center gap-2 h-9 px-3 rounded-xl transition-all duration-200 ease-out
                              border border-slate-200/70 hover:border-slate-200
                              bg-white/90 text-slate-600 hover:bg-white hover:text-slate-900
                              shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95
                              disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
                            `}
                            title="Download frame as PNG"
                            onClick={async () => {
                              await exportFrameWithNativeDimensions(selectedFramesData[0].id);
                            }}
                          >
                            {isExportingFrameId === selectedFramesData[0].id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            <span className="text-sm font-medium">
                              {isExportingFrameId === selectedFramesData[0].id ? "Exporting..." : "Download PNG"}
                            </span>
                          </button>
                        </div>
                      </SelectionTooltip>
                    </div>
                  )}
                </div>
              )}

              {/* Note metadata controls */}
              {hasNotes && (
                <SelectionTooltip label={singleNoteSelected && selectedNotesData[0].showMetadata ? "Hide author info" : "Show author info"} 
                  isVisible={shouldShowSelectionTooltip(singleNoteSelected && selectedNotesData[0].showMetadata ? "Hide author info" : "Show author info")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter(singleNoteSelected && selectedNotesData[0].showMetadata ? "Hide author info" : "Show author info")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <ActionButton
                      icon={User}
                      onClick={() => {
                        if (singleNoteSelected) {
                          toggleNoteMetadata(selectedNotesData[0].id);
                        }
                      }}
                      title={singleNoteSelected && selectedNotesData[0].showMetadata ? "Hide author info" : "Show author info"}
                      size="sm"
                      variant={singleNoteSelected && selectedNotesData[0].showMetadata ? "default" : "outline"}
                    />
                  </div>
                </SelectionTooltip>
              )}

              {/* Download button for all downloadable assets (files, images, videos) - JSON export removed */}
              {hasDownloadableAssets && (
                <SelectionTooltip 
                  label={singleDownloadableSelected ? "Download" : "Download options"} 
                  isVisible={shouldShowSelectionTooltip(singleDownloadableSelected ? "Download" : "Download options", "download-options")}
                >
                  <div 
                    onMouseEnter={() => handleMouseEnter(singleDownloadableSelected ? "Download" : "Download options")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <DownloadOptionsDropdown
                      selectedDownloadableData={selectedDownloadableData}
                      selection={selection}
                      onDownloadFiles={async () => {
                        const totalFiles = selectedDownloadableData.length;
                        const downloadPromises = selectedDownloadableData.map((asset, index) => new Promise((resolve) => {
                          setTimeout(async () => {
                            try {
                              await downloadFile(asset.url, asset.fileName);
                              resolve(true);
                            } catch (error) {
                              resolve(false);
                            }
                          }, index * 100);
                        }));
                        await Promise.all(downloadPromises);
                      }}
                      onExportJSON={() => { /* disabled */ }}
                      onDropdownChange={(open, dropdownId) => {
                        if (open) {
                          addOpenDropdown(dropdownId);
                        } else {
                          removeOpenDropdown(dropdownId);
                        }
                      }}
                    />
                  </div>
                </SelectionTooltip>
              )}

              {hasDownloadableAssets && (
                <SelectionTooltip label="Save to library" isVisible={shouldShowSelectionTooltip("Save to library")}>
                  <div
                    onMouseEnter={() => handleMouseEnter("Save to library")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      onClick={handleSaveToLibrary}
                      className={`${CONTROL_BUTTON_COMPACT_CLASSES} min-w-[84px] ${
                        allSelectedSaved
                          ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-900 hover:text-white"
                          : ""
                      }`}
                      disabled={isSavingToLibrary || allSelectedSaved}
                      aria-pressed={allSelectedSaved}
                      title={allSelectedSaved ? "Already in library" : "Save to library"}
                    >
                      <span className="flex items-center gap-1.5">
                        {allSelectedSaved ? (
                          <BookmarkCheck className="w-4 h-4 text-white" />
                        ) : (
                          <BookmarkPlus className="w-4 h-4 text-slate-500" />
                        )}
                        <span className={`${CONTROL_VALUE_BADGE_CLASSES} ${allSelectedSaved ? "bg-white/20 text-white" : ""}`}>
                          {allSelectedSaved ? "OK" : unsavedCount}
                        </span>
                      </span>
                      {isSavingToLibrary ? (
                        <RefreshCw className={`w-3.5 h-3.5 animate-spin ${allSelectedSaved ? "text-white/80" : "text-slate-400"}`} />
                      ) : null}
                    </button>
                  </div>
                </SelectionTooltip>
              )}
            </div>
            
            {/* Only show the rest of the controls if there are actually selected elements */}
            {(selectionBounds && selection.length > 0) && (
              <>
                {/* Separatore moderno con gradient matching toolbar */}
                <div className="w-px h-7 bg-gradient-to-b from-transparent via-slate-200/80 to-transparent mx-2" />

                {/* Layer order controls group */}
                <div className="flex items-center gap-x-1">
                  <SelectionTooltip label="Bring to front" isVisible={shouldShowSelectionTooltip("Bring to front")}>
                    <ActionButton
                      icon={ArrowUp}
                      onClick={bringToFront}
                      onMouseEnter={() => handleMouseEnter("Bring to front")}
                      onMouseLeave={handleMouseLeave}
                      title="Bring to front"
                      size="sm"
                    />
                  </SelectionTooltip>
                  
                  <SelectionTooltip label="Send to back" isVisible={shouldShowSelectionTooltip("Send to back")}>
                    <ActionButton
                      icon={ArrowDown}
                      onClick={sendToBack}
                      onMouseEnter={() => handleMouseEnter("Send to back")}
                      onMouseLeave={handleMouseLeave}
                      title="Send to back"
                      size="sm"
                    />
                  </SelectionTooltip>
                </div>

                {/* Alignment controls for multiple selection */}
                {hasMultipleSelection && (
                  <>
                    {/* Separatore moderno con gradient matching toolbar */}
                    <div className="w-px h-7 bg-gradient-to-b from-transparent via-slate-200/80 to-transparent mx-2" />
                    
                    {/* Compact Alignment dropdown */}
                    <SelectionTooltip label="Alignment & Distribution" isVisible={shouldShowSelectionTooltip("Alignment & Distribution", "alignment")}>
                      <div 
                        onMouseEnter={() => handleMouseEnter("Alignment & Distribution")} 
                        onMouseLeave={handleMouseLeave}
                      >
                        <CompactAlignmentDropdown
                          selectedLayers={selectedLayers}
                          updateLayerPositions={updateLayerPositions}
                          onActionHover={onActionHover}
                          onActionHoverEnd={onActionHoverEnd}
                          onDropdownChange={(open, dropdownId) => {
                            if (open) {
                              addOpenDropdown(dropdownId);
                            } else {
                              removeOpenDropdown(dropdownId);
                            }
                          }}
                        />
                      </div>
                    </SelectionTooltip>
                    
                    {/* Auto grid for 3+ elements */}
                    {selectedLayers.length >= 3 && (
                      <SelectionTooltip label="Auto grid" isVisible={shouldShowSelectionTooltip("Auto grid")}>
                        <div 
                          onMouseEnter={() => handleMouseEnter("Auto grid")} 
                          onMouseLeave={handleMouseLeave}
                        >
                          <MasonryGridDialog />
                        </div>
                      </SelectionTooltip>
                    )}
                  </>
                )}

                {/* Separatore moderno con gradient matching toolbar */}
                <div className="w-px h-7 bg-gradient-to-b from-transparent via-slate-200/80 to-transparent mx-2" />

                {/* Delete action */}
                <SelectionTooltip label="Delete" isVisible={shouldShowSelectionTooltip("Delete")}>
                  <ActionButton
                    icon={Trash2}
                    onClick={deleteLayers}
                    onMouseEnter={() => handleMouseEnter("Delete")}
                    onMouseLeave={handleMouseLeave}
                    title="Delete"
                    variant="danger"
                    size="sm"
                  />
                </SelectionTooltip>
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
);

SelectionTools.displayName = "SelectionTools"; 
SelectionTooltip.displayName = "SelectionTooltip";
PencilStrokeWidthSelector.displayName = "PencilStrokeWidthSelector";
StrokeWidthSelector.displayName = "StrokeWidthSelector";
FontSizeSelector.displayName = "FontSizeSelector";
FontWeightDropdown.displayName = "FontWeightDropdown";
CompactColorPicker.displayName = "CompactColorPicker";
ActionButton.displayName = "ActionButton";
TextControlsDropdown.displayName = "TextControlsDropdown";
CompactAlignmentDropdown.displayName = "CompactAlignmentDropdown";
NumericInput.displayName = "NumericInput";
TextAlignmentButton.displayName = "TextAlignmentButton";
TextStyleButton.displayName = "TextStyleButton"; 
