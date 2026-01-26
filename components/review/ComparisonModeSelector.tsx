"use client";

import { VideoComparisonMode } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Monitor, 
  Layers, 
  SplitSquareHorizontal, 
  SplitSquareVertical,
  Plus,
  Settings,
  Sliders
} from "lucide-react";

interface ComparisonModeSelectorProps {
  currentMode: VideoComparisonMode;
  onModeChange: (mode: VideoComparisonMode) => void;
  hasComparisonVideo: boolean;
  onAddVideo: () => void;
  theme?: 'dark' | 'light';
  disabled?: boolean;
  // Overlay mode specific props
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  // Sync controls
  isSynced?: boolean;
  onSyncToggle?: () => void;
}

const modeConfig = {
  normal: {
    icon: Monitor,
    label: "Normal",
    description: "Single video view"
  },
  overlay: {
    icon: Layers,
    label: "Overlay",
    description: "Blended comparison"
  },
  'split-horizontal': {
    icon: SplitSquareHorizontal,
    label: "Split H",
    description: "Side by side"
  },
  'split-vertical': {
    icon: SplitSquareVertical,
    label: "Split V",
    description: "Top and bottom"
  }
};

export function ComparisonModeSelector({
  currentMode,
  onModeChange,
  hasComparisonVideo,
  onAddVideo,
  theme = 'light',
  disabled = false,
  opacity = 50,
  onOpacityChange,
  isSynced = true,
  onSyncToggle
}: ComparisonModeSelectorProps) {
  
  const themeClasses = {
    container: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700' 
      : 'bg-white border-gray-200',
    button: theme === 'dark' 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    activeButton: theme === 'dark' 
      ? 'bg-gray-700 text-white border-gray-600' 
      : 'bg-gray-100 text-gray-900 border-gray-300',
    text: theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
  };

  const isComparisonMode = currentMode !== 'normal';
  const canUseComparisonModes = hasComparisonVideo || currentMode === 'normal';

  return (
    <div className={`${themeClasses.container} border rounded-lg p-3 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span className="text-sm font-medium">Comparison Mode</span>
          {isComparisonMode && (
            <Badge variant="secondary" className="text-xs">
              Active
            </Badge>
          )}
        </div>
        
        {!hasComparisonVideo && isComparisonMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAddVideo}
            className="text-xs gap-1 h-6"
          >
            <Plus className="h-3 w-3" />
            Add Video
          </Button>
        )}
      </div>

      {/* Mode Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(modeConfig) as VideoComparisonMode[]).map((mode) => {
          const config = modeConfig[mode];
          const Icon = config.icon;
          const isActive = currentMode === mode;
          const isDisabled = disabled;
          
          return (
            <Button
              key={mode}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onModeChange(mode)}
              disabled={isDisabled}
              className={`flex flex-col items-center gap-1 h-auto py-2 px-2 ${
                isActive 
                  ? themeClasses.activeButton 
                  : isDisabled 
                    ? 'opacity-50 cursor-not-allowed' 
                    : themeClasses.button
              }`}
              title={config.description}
            >
              <Icon className="h-3 w-3" />
              <span className="text-xs">{config.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Advanced Controls - Show when comparison is active */}
      {hasComparisonVideo && isComparisonMode && (
        <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          {/* Opacity Control - Only for overlay mode */}
          {currentMode === 'overlay' && onOpacityChange && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Overlay Opacity</span>
                <span className="text-xs text-gray-500">{opacity}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">0%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={opacity}
                  onChange={(e) => onOpacityChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  style={{
                    background: `linear-gradient(to right, #374151 0%, #374151 ${opacity}%, #d1d5db ${opacity}%, #d1d5db 100%)`
                  }}
                />
                <span className="text-xs text-gray-500">100%</span>
              </div>
            </div>
          )}

          {/* Sync Control */}
          {onSyncToggle && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-3 w-3" />
                <span className="text-xs font-medium">Sync Videos</span>
              </div>
              <Button
                variant={isSynced ? "default" : "outline"}
                size="sm"
                onClick={onSyncToggle}
                className="text-xs h-6 px-2"
              >
                {isSynced ? "Synced" : "Independent"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status Info */}
      <div className={`text-xs ${themeClasses.text} text-center space-y-1`}>
        {!hasComparisonVideo && currentMode === 'normal' && (
          <span>Select a comparison mode to add a second video</span>
        )}
        {!hasComparisonVideo && isComparisonMode && (
          <div className="space-y-1">
            <span className="text-blue-600 font-medium">✨ {modeConfig[currentMode].label} mode selected</span>
            <div>
              <span>Click "</span>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddVideo}
                className="text-xs gap-1 h-5 px-2 mx-1 inline-flex"
              >
                <Plus className="h-2 w-2" />
                Add Video
              </Button>
              <span>" to choose a video to compare</span>
            </div>
          </div>
        )}
        {hasComparisonVideo && isComparisonMode && (
          <span className="text-green-600 font-medium">✅ Comparison active • {modeConfig[currentMode].description}</span>
        )}
        {hasComparisonVideo && currentMode === 'normal' && (
          <span className="text-amber-600">Comparison video ready • Switch mode to compare</span>
        )}
      </div>
    </div>
  );
}