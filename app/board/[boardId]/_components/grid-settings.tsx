"use client";

import { useState } from "react";
import { Grid } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

export interface GridConfig {
  enabled: boolean;
  type: "dots" | "lines";
  opacity: number;
  size: number;
  showAccents: boolean;
  color: string;
  backgroundColor: string;
}

interface GridSettingsProps {
  config: GridConfig;
  onConfigChange: (config: GridConfig) => void;
}

export const GridSettings = ({ config, onConfigChange }: GridSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Funzione per calcolare automaticamente il colore della griglia basato sul background
  const getAutoGridColor = (backgroundColor: string): string => {
    switch (backgroundColor) {
      case "#000000": // Nero -> griglia grigio chiaro
        return "#d1d5db"; // gray-300
      case "#ffffff": // Bianco -> griglia grigio scuro
        return "#374151"; // gray-700
      case "#f5f5f5": // Grigio morbido -> griglia grigio scuro
        return "#374151"; // gray-700
      default:
        return "#9ca3af"; // gray-400 come fallback
    }
  };

  const updateConfig = (updates: Partial<GridConfig>) => {
    // Se viene cambiato il backgroundColor, aggiorna automaticamente anche il colore della griglia
    if (updates.backgroundColor) {
      updates.color = getAutoGridColor(updates.backgroundColor);
    }
    onConfigChange({ ...config, ...updates });
  };

  // Opzioni per il colore di sfondo della board
  const backgroundOptions = [
    { value: "#f5f5f5", label: "Soft Gray", color: "#f5f5f5" },
    { value: "#ffffff", label: "White", color: "#ffffff" },
    { value: "#000000", label: "Black", color: "#000000" },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={`
            relative w-10 h-10 rounded-xl flex items-center justify-center
            transition-all duration-200 ease-out border border-transparent
            ${config.enabled 
              ? "bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-200 shadow-sm scale-105" 
              : "bg-transparent text-gray-400 hover:bg-gray-100/80 hover:text-gray-600 hover:border-gray-200/60 active:scale-95"
            }
            focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2
            touch-manipulation cursor-pointer
          `}
          style={{
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Grid className={`h-5 w-5 ${config.enabled ? 'drop-shadow-sm' : ''}`} />
          
          {/* Indicatore di stato attivo */}
          {config.enabled && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full shadow-sm" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur-xl border border-gray-200/60 shadow-xl rounded-2xl p-0 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent" align="start">
        <div className="p-5 space-y-4">
          {/* Header più compatto */}
          <div className="flex items-center space-x-3 pb-3 border-b border-gray-100">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <Grid className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm">Grid & Background</h4>
              <p className="text-xs text-gray-500">Customize workspace appearance</p>
            </div>
          </div>

          {/* Enable/Disable Grid più compatto */}
          <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-lg border border-gray-100">
            <div>
              <Label htmlFor="grid-enabled" className="text-sm font-semibold text-gray-900">
                Show Grid
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">Display alignment grid</p>
            </div>
            <Switch
              id="grid-enabled"
              checked={config.enabled}
              onCheckedChange={(enabled) => updateConfig({ enabled })}
            />
          </div>

          {config.enabled && (
            <div className="space-y-3">
              {/* Grid Type più compatto */}
              <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                <Label className="text-sm font-semibold text-gray-900 mb-2 block">Grid Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateConfig({ type: "dots" })}
                    className={`p-2 rounded-md border-2 transition-all duration-200 text-center ${
                      config.type === "dots"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <div className="text-xs font-medium">Dots</div>
                    <div className="text-xs text-gray-500 mt-0.5">Point grid</div>
                  </button>
                  <button
                    onClick={() => updateConfig({ type: "lines" })}
                    className={`p-2 rounded-md border-2 transition-all duration-200 text-center ${
                      config.type === "lines"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <div className="text-xs font-medium">Lines</div>
                    <div className="text-xs text-gray-500 mt-0.5">Line grid</div>
                  </button>
                </div>
              </div>

              {/* Grid Size più compatto */}
              <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-900">Grid Size</Label>
                  <div className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
                    {config.size}px
                  </div>
                </div>
                <Slider
                  value={[config.size]}
                  onValueChange={([size]) => updateConfig({ size })}
                  min={10}
                  max={50}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Fine</span>
                  <span>Coarse</span>
                </div>
              </div>

              {/* Opacity più compatto */}
              <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-900">Opacity</Label>
                  <div className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
                    {Math.round(config.opacity * 100)}%
                  </div>
                </div>
                <Slider
                  value={[config.opacity]}
                  onValueChange={([opacity]) => updateConfig({ opacity })}
                  min={0.1}
                  max={0.8}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Subtle</span>
                  <span>Visible</span>
                </div>
              </div>

              {/* Background Color più compatto */}
              <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                <Label className="text-sm font-semibold text-gray-900 mb-2 block">Background Color</Label>
                <div className="grid grid-cols-3 gap-2">
                  {backgroundOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`relative group w-full h-10 rounded-lg border-2 transition-all duration-200 flex items-center justify-center overflow-hidden ${
                        config.backgroundColor === option.value
                          ? "border-blue-500 scale-105 shadow-lg ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-300 hover:scale-102"
                      }`}
                      style={{ backgroundColor: option.color }}
                      onClick={() => updateConfig({ backgroundColor: option.value })}
                      title={option.label}
                    >
                      {/* Checkmark per opzione selezionata */}
                      {config.backgroundColor === option.value && (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          option.value === "#000000" ? "bg-white" : "bg-gray-900"
                        }`}>
                          <svg className={`w-2.5 h-2.5 ${
                            option.value === "#000000" ? "text-gray-900" : "text-white"
                          }`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Label al hover */}
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="bg-gray-900 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                          {option.label}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Show Accent Points più compatto */}
              <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show-accents" className="text-sm font-semibold text-gray-900">
                      Accent {config.type === "dots" ? "Points" : "Lines"}
                    </Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Highlight every 5th {config.type === "dots" ? "point" : "line"}
                    </p>
                  </div>
                  <Switch
                    id="show-accents"
                    checked={config.showAccents}
                    onCheckedChange={(showAccents) => updateConfig({ showAccents })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer più compatto */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center text-xs text-gray-500">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></div>
              Grid adapts automatically to zoom level
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}; 