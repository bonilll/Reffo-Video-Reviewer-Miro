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
import { colorToCSS } from "@/lib/utils";

import { ColorPicker } from "./color-picker";
import { MasonryGridDialog } from "@/components/MasonryGridDialog";
import { ReviewSessionModal } from "@/components/review/ReviewSessionModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
// Download icon already imported above

const ENABLE_REVIEW = false;

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
    // Board ID for review mode
    boardId,
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

  // Helper: export selected frame using presets from main toolbar module
  const exportPresets = [
    { label: "A4 Portrait", width: 742, height: 1050 },
    { label: "16:9", width: 1920, height: 1080 },
    { label: "4:3", width: 1440, height: 1080 },
    { label: "1:1 Square", width: 1080, height: 1080 },
    { label: "4K (16:9)", width: 3840, height: 2160 },
  ];

  // Direct export with frame native dimensions - find and render elements inside frame
  const exportFrameWithNativeDimensions = async (
    frameId: string,
    frameWidth: number,
    frameHeight: number
  ) => {
    try {
      // Recupera dati frame selezionato
      const frame = selectedFramesData.find(f => f.id === frameId);
      if (!frame) return;
      const { x: fx, y: fy } = frame;
      
      
      // Trova l'SVG del canvas
      const svgElement = document.querySelector('svg.h-\\[100vh\\].w-\\[100vw\\].select-none') as SVGElement;
      if (!svgElement) {
        console.error('SVG canvas not found');
        return;
      }

      // Crea un nuovo SVG con solo il contenuto del frame
      const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      exportSvg.setAttribute('width', frameWidth.toString());
      exportSvg.setAttribute('height', frameHeight.toString());
      exportSvg.setAttribute('viewBox', `0 0 ${frameWidth} ${frameHeight}`);
      exportSvg.style.backgroundColor = 'white';

      // Aggiungi background bianco
      const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      backgroundRect.setAttribute('x', '0');
      backgroundRect.setAttribute('y', '0');
      backgroundRect.setAttribute('width', frameWidth.toString());
      backgroundRect.setAttribute('height', frameHeight.toString());
      backgroundRect.setAttribute('fill', 'white');
      exportSvg.appendChild(backgroundRect);

      // Nuova strategia: cattura tutto quello che è visualmente dentro il frame
      const allGroups = svgElement.querySelectorAll('g[style*="transform"]');
      
      let foundElements = 0; // Dichiarazione della variabile mancante!
      
      allGroups.forEach((group, index) => {
        const style = group.getAttribute('style') || '';
        const transformMatch = style.match(/translate\(([^)]+)\)/);
        
        if (transformMatch) {
          const coords = transformMatch[1].split(',').map(v => parseFloat(v.replace('px', '').trim()));
          const [gx, gy] = coords;
          
          // Tolerance più grande per catturare elementi sui bordi
          const tolerance = 100;
          
          // Estrai anche scale se presente
          const scaleMatch = style.match(/scale\(([^)]+)\)/);
          const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
          
          // Log per debug TUTTI i gruppi per vedere meglio
          
          // Strategia più precisa: solo elementi che hanno senso visualmente
          // 1. Dentro il frame con tolerance ragionevole
          const isWithinFrame = gx >= (fx - tolerance) && gx <= (fx + frameWidth + tolerance) && 
                               gy >= (fy - tolerance) && gy <= (fy + frameHeight + tolerance);
          
          // 2. Overlap check per elementi parzialmente sovrapposti  
          const elementSize = 300; 
          const hasOverlap = !(gx > (fx + frameWidth) || (gx + elementSize) < fx || 
                              gy > (fy + frameHeight) || (gy + elementSize) < fy);
          
          // 3. Filtro coordinate: esclude elementi troppo lontani che creerebbero coordinate negative enormi
          const relativeX = gx - fx;
          const relativeY = gy - fy;
          const isReasonablyPositioned = relativeX >= -200 && relativeX <= frameWidth + 200 &&
                                        relativeY >= -200 && relativeY <= frameHeight + 200;
          
          if ((isWithinFrame || hasOverlap) && isReasonablyPositioned) {
            foundElements++;
            
            const groupClone = group.cloneNode(true) as Element;
            
            // Rimuovi solo elementi IMG realmente problematici
            const problematicElements = groupClone.querySelectorAll('img[src^="http"], image[href^="http"], image[xlink\\:href^="http"]');
            problematicElements.forEach(el => {
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('width', el.getAttribute('width') || '100');
              rect.setAttribute('height', el.getAttribute('height') || '100');
              rect.setAttribute('x', el.getAttribute('x') || '0');
              rect.setAttribute('y', el.getAttribute('y') || '0');
              rect.setAttribute('fill', '#e5e7eb');
              rect.setAttribute('stroke', '#9ca3af');
              rect.setAttribute('stroke-width', '1');
              el.parentNode?.replaceChild(rect, el);
            });
            
            // Correggi la trasformazione per posizionare relativamente al frame
            const newTransform = `translate(${gx - fx}px, ${gy - fy}px)`;
            groupClone.setAttribute('style', style.replace(/translate\([^)]+\)/, newTransform));
            
            exportSvg.appendChild(groupClone);
          }
        }
      });
      
      
      // Se non troviamo elementi, aggiungi almeno il frame stesso
      if (foundElements === 0) {
        // Cerca specificamente il frame stesso
        const frameElement = svgElement.querySelector(`g[style*="translate(${fx}px, ${fy}px)"]`);
        if (frameElement) {
          const frameClone = frameElement.cloneNode(true) as Element;
          const style = frameClone.getAttribute('style') || '';
          frameClone.setAttribute('style', style.replace(/translate\([^)]+\)/, `translate(0px, 0px)`));
          exportSvg.appendChild(frameClone);
        } else {
          // Fallback: crea un rettangolo di debug
          const debugRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          debugRect.setAttribute('x', '10');
          debugRect.setAttribute('y', '10');
          debugRect.setAttribute('width', (frameWidth - 20).toString());
          debugRect.setAttribute('height', (frameHeight - 20).toString());
          debugRect.setAttribute('fill', 'none');
          debugRect.setAttribute('stroke', '#ff0000');
          debugRect.setAttribute('stroke-width', '2');
          exportSvg.appendChild(debugRect);
          
          const debugText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          debugText.setAttribute('x', (frameWidth / 2).toString());
          debugText.setAttribute('y', (frameHeight / 2).toString());
          debugText.setAttribute('text-anchor', 'middle');
          debugText.setAttribute('font-family', 'Arial');
          debugText.setAttribute('font-size', '16');
          debugText.setAttribute('fill', '#ff0000');
          debugText.textContent = `Frame ${frameWidth}x${frameHeight}`;
          exportSvg.appendChild(debugText);
        }
      }

      // Export con html-to-image con gestione errori migliorata
      try {
        
        // Debug: stampa il contenuto SVG
        
        const { toPng } = await import('html-to-image');
        
        // Crea container temporaneo
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-10000px';
        container.style.top = '0';
        container.style.width = `${frameWidth}px`;
        container.style.height = `${frameHeight}px`;
        container.style.background = 'white';
        container.style.zIndex = '-1000';
        container.appendChild(exportSvg);
        document.body.appendChild(container);
        
        
        const dataUrl = await toPng(container, {
          width: frameWidth,
          height: frameHeight,
          backgroundColor: 'white',
          pixelRatio: 1,
          quality: 1,
          useCORS: true,
          allowTaint: false,
          skipFonts: true,
          includeQueryParams: false,
          filter: (node: any) => {
            // Escludi elementi che potrebbero causare problemi
            if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
              return false;
            }
            return true;
          }
        });
        
        document.body.removeChild(container);
        
        // Download
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `frame-${frameId}-${frameWidth}x${frameHeight}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        
      } catch (exportError) {
        console.error('HTML-to-image export failed:', exportError);
        
        // Cleanup container se esiste ancora
        const container = document.querySelector('div[style*="left: -10000px"]');
        if (container) {
          document.body.removeChild(container);
        }
        
        // Fallback: prova con Canvas API
        try {
          
          const svgString = new XMLSerializer().serializeToString(exportSvg);
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);

          const canvas = document.createElement('canvas');
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) throw new Error('Cannot get canvas context');
          
          // Background bianco
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, frameWidth, frameHeight);

          const img = new Image();
          
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              try {
                ctx.drawImage(img, 0, 0, frameWidth, frameHeight);
                
                canvas.toBlob((blob) => {
                  if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `frame-${frameId}-${frameWidth}x${frameHeight}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }
                  resolve();
                }, 'image/png', 1.0);
              } catch (e) {
                reject(e);
              }
              URL.revokeObjectURL(url);
            };
            
            img.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error('Canvas SVG load failed'));
            };
            
            img.src = url;
          });
          
        } catch (canvasError) {
          console.error('Canvas API fallback failed:', canvasError);
          throw new Error('Both export methods failed');
        }
      }

    } catch (e) {
      console.error('Failed to export frame:', e);
      alert('Export failed. Check console for details.');
    }
  };

  const exportSelectedFrameAsImage = async (
    frameId: string,
    preset: { label: string; width: number; height: number }
  ) => {
    try {
      // Recupera dati frame selezionato
      const frame = selectedFramesData.find(f => f.id === frameId);
      if (!frame) return;
      const { x: fx, y: fy, width: fw, height: fh } = frame;
      const boardCanvas = document.querySelector('.board-canvas') as HTMLElement | null;
      if (!boardCanvas) return;

      // Clona il contenuto del canvas in un container offscreen, applicando trasformazioni per isolare il frame
      const clone = boardCanvas.cloneNode(true) as HTMLElement;

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.width = `${preset.width}px`;
      container.style.height = `${preset.height}px`;
      container.style.overflow = 'hidden';
      container.style.background = 'white';
      container.style.zIndex = '-1';

      // Wrapper per le trasformazioni (centrare e scalare il frame nel preset selezionato)
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';

      // Calcola scala uniforme per far entrare il frame nel preset
      const scale = Math.min(preset.width / fw, preset.height / fh);
      const offsetX = (preset.width - fw * scale) / 2;
      const offsetY = (preset.height - fh * scale) / 2;
      // Applica: translate(offset) scale(scale) translate(-frameX, -frameY)
      (clone.style as any).transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translate(${-fx}px, ${-fy}px)`;
      (clone.style as any).transformOrigin = '0 0';
      (clone.style as any).width = boardCanvas.clientWidth + 'px';
      (clone.style as any).height = boardCanvas.clientHeight + 'px';

      wrapper.appendChild(clone);
      container.appendChild(wrapper);
      document.body.appendChild(container);

      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(container, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: 'white',
        width: preset.width,
        height: preset.height,
        style: {
          width: `${preset.width}px`,
          height: `${preset.height}px`,
        } as any,
        skipAutoScale: true,
        canvasWidth: preset.width,
        canvasHeight: preset.height,
        cacheBust: true,
      });

      // Cleanup
      document.body.removeChild(container);

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `frame-${frameId}-${preset.label.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Failed to export frame', e);
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

    // Review modal state
    const [showReviewModal, setShowReviewModal] = useState(false);

    // Get existing review sessions for selected media asset
    const selectedAssetId = singleMediaSelected ? selectedMediaData[0].id : null;
    const existingReviewSessions = useQuery(
      api.review.getReviewSessionsForAsset,
      selectedAssetId && boardId ? {
        boardId: boardId as any,
        primaryAssetId: selectedAssetId
      } : "skip"
    );

    // Quick check for accessible sessions (more reactive)
    const hasAccessibleReviewSessionsQuery = useQuery(
      api.review.hasAccessibleReviewSessions,
      selectedAssetId && boardId ? {
        boardId: boardId as any,
        primaryAssetId: selectedAssetId
      } : "skip"
    );

    // Debug query to understand what's happening
    const debugData = useQuery(
      api.review.debugReviewSessionAccess,
      selectedAssetId && boardId ? {
        boardId: boardId as any,
        primaryAssetId: selectedAssetId
      } : "skip"
    );

    // Debug log when data changes
    useEffect(() => {
      if (debugData && selectedAssetId) {
      }
    }, [debugData, selectedAssetId]);

    // Check if user can access any review sessions for this asset
    const hasAccessibleReviewSessions = hasAccessibleReviewSessionsQuery || (existingReviewSessions && existingReviewSessions.length > 0);

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
                      
                      {/* Direct PNG export with frame native dimensions - DISABLED */}
                      {/* <SelectionTooltip label="Download PNG" isVisible={shouldShowSelectionTooltip("Download PNG")}>
                        <div onMouseEnter={() => handleMouseEnter("Download PNG")} onMouseLeave={handleMouseLeave}>
                          <button 
                            className="h-9 px-3 rounded-xl border text-sm flex items-center gap-2 bg-white/60 hover:bg-white/80 transition-all duration-200"
                            onClick={async () => {
                              const frame = selectedFramesData[0];
                              await exportFrameWithNativeDimensions(frame.id, frame.width, frame.height);
                            }}
                          >
                            <Download className="w-4 h-4" /> Download
                          </button>
                        </div>
                      </SelectionTooltip> */}
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

              {/* Review mode control for images and videos */}
              {((hasMediaAssets && singleMediaSelected) || hasAccessibleReviewSessions) && boardId && (
                <SelectionTooltip label="Open in Review Mode" isVisible={shouldShowSelectionTooltip("Open in Review Mode")}>
                  <div 
                    onMouseEnter={() => handleMouseEnter("Open in Review Mode")} 
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      onClick={() => setShowReviewModal(true)}
                      title="Open in Review Mode"
                      className="w-9 h-9 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-700 font-semibold text-sm shadow-sm hover:shadow-md hover:scale-[1.03] transition-all duration-200 border border-blue-200"
                    >
                      R
                    </button>
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

        {/* Review Session Modal */}
        {ENABLE_REVIEW && showReviewModal && ((hasMediaAssets && singleMediaSelected) || hasAccessibleReviewSessions) && boardId && (
          <ReviewSessionModal
            isOpen={showReviewModal}
            onClose={() => setShowReviewModal(false)}
            boardId={boardId as any}
            primaryAsset={singleMediaSelected ? {
              id: selectedMediaData[0].id,
              type: selectedMediaData[0].type,
              url: selectedMediaData[0].url,
              name: selectedMediaData[0].name
            } : undefined}
            availableAssets={[]}
            existingSessions={existingReviewSessions || []}
          />
        )}
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
