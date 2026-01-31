"use client";

import { colorToCSS } from "@/lib/utils";
import type { Color } from "@/types/canvas";
import { Check } from "lucide-react";

type ColorPickerProps = {
  onChange: (color: Color) => void;
  currentColor?: Color;
};

const COLORS = [
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

export const ColorPicker = ({ onChange, currentColor }: ColorPickerProps) => {
  const isColorSelected = (color: Color) => {
    if (!currentColor) return false;
    return color.r === currentColor.r && 
           color.g === currentColor.g && 
           color.b === currentColor.b;
  };

  return (
    <div className="p-1 w-40">
      <div className="grid grid-cols-4 gap-1.5">
        {COLORS.map((color, index) => (
          <ColorButton 
            key={index}
            color={color} 
            onClick={onChange} 
            isSelected={isColorSelected(color)}
          />
        ))}
      </div>
    </div>
  );
};

type ColorButtonProps = {
  color: Color;
  onClick: (color: Color) => void;
  isSelected?: boolean;
};

const ColorButton = ({ color, onClick, isSelected }: ColorButtonProps) => {
  return (
    <button
      className={`
        relative w-8 h-8 rounded-lg transition-all duration-200 group
        ${isSelected 
          ? 'ring-2 ring-blue-500 ring-offset-1 scale-105' 
          : 'hover:scale-105'
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
              filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))'
            }}
          />
        </div>
      )}
    </button>
  );
};
