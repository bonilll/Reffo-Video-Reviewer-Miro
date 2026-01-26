"use client";

import { colorToCSS } from "@/lib/utils";
import type { Color } from "@/types/canvas";
import { Check } from "lucide-react";

type ColorPickerProps = {
  onChange: (color: Color) => void;
  currentColor?: Color;
};

const COLORS = [
  // Prima riga - colori primari
  { r: 243, g: 82, b: 35 },   // Rosso
  { r: 255, g: 198, b: 0 },   // Giallo
  { r: 68, g: 202, b: 99 },   // Verde
  { r: 39, g: 142, b: 237 },  // Blu
  
  // Seconda riga - colori pastello
  { r: 255, g: 163, b: 177 }, // Rosa
  { r: 255, g: 236, b: 153 }, // Giallo chiaro
  { r: 154, g: 240, b: 184 }, // Verde chiaro
  { r: 155, g: 105, b: 245 }, // Viola
  
  // Terza riga - Toni di grigio
  { r: 0, g: 0, b: 0 },       // Nero
  { r: 55, g: 65, b: 81 },    // Grigio molto scuro (gray-700)
  { r: 107, g: 114, b: 128 }, // Grigio scuro (gray-500)
  { r: 156, g: 163, b: 175 }, // Grigio medio (gray-400)
  
  // Quarta riga - Toni di grigio chiari
  { r: 209, g: 213, b: 219 }, // Grigio chiaro (gray-300)
  { r: 229, g: 231, b: 235 }, // Grigio molto chiaro (gray-200)
  { r: 243, g: 244, b: 246 }, // Grigio chiarissimo (gray-100)
  { r: 255, g: 255, b: 255 }, // Bianco
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
