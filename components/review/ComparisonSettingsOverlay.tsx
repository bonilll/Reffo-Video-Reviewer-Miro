"use client";

import { useState } from "react";
import { VideoComparisonMode } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Monitor, 
  Layers, 
  SplitSquareHorizontal, 
  SplitSquareVertical,
  Plus,
  Settings,
  Sliders,
  X,
  Trash2,
  Video
} from "lucide-react";

interface ComparisonSettingsOverlayProps {
  // Mode and video props
  currentMode: VideoComparisonMode;
  onModeChange: (mode: VideoComparisonMode) => void;
  hasComparisonVideo: boolean;
  onAddVideo: () => void;
  onRemoveComparison?: () => void;
  comparisonVideoName?: string;
  
  // Split mode handler - opens dedicated comparison page
  onSplitModeSelect?: (mode: 'split-horizontal' | 'split-vertical' | 'overlay') => void;
  
  // Control props
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  isSynced?: boolean;
  onSyncToggle?: () => void;
  syncMaster?: 'primary' | 'comparison';
  onSyncMasterChange?: (master: 'primary' | 'comparison') => void;
  splitRatio?: number;
  onSplitRatioChange?: (ratio: number) => void;
  
  // UI props
  theme?: 'dark' | 'light';
  disabled?: boolean;
  
  // Modal control - when used from toolbar
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideButton?: boolean; // Hide the trigger button when controlled externally
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

// Extracted Compare Button for toolbar use
export function CompareButton({
  currentMode,
  hasComparisonVideo,
  disabled = false,
  onClick
}: {
  currentMode: VideoComparisonMode;
  hasComparisonVideo: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  // Get status for trigger button
  const getStatusInfo = () => {
    if (currentMode === 'normal') {
      return { text: "Normal", color: "bg-gray-500" };
    }
    if (!hasComparisonVideo) {
      return { text: "Setup", color: "bg-yellow-500" };
    }
    return { text: "Active", color: "bg-green-500" };
  };

  const status = getStatusInfo();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-9 h-9 rounded-xl flex items-center justify-center relative
        transition-all duration-300 ease-out
        border border-transparent backdrop-blur-sm
        ${
          disabled
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:border-slate-200/60 hover:shadow-lg hover:shadow-black/5 hover:scale-105"
        }
        focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2
      `}
      title="Video Comparison"
    >
      <SplitSquareHorizontal className="h-4 w-4" />
      {/* Status indicator */}
      <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${status.color} shadow-sm`} />
    </button>
  );
}

export function ComparisonSettingsOverlay({
  currentMode,
  onModeChange,
  hasComparisonVideo,
  onAddVideo,
  onRemoveComparison,
  comparisonVideoName,
  onSplitModeSelect,
  opacity = 50,
  onOpacityChange,
  isSynced = true,
  onSyncToggle,
  syncMaster = 'primary',
  onSyncMasterChange,
  splitRatio = 0.5,
  onSplitRatioChange,
  theme = 'light',
  disabled = false,
  isOpen: controlledIsOpen,
  onOpenChange,
  hideButton = false
}: ComparisonSettingsOverlayProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = onOpenChange || setInternalIsOpen;
  
  const isComparisonMode = currentMode !== 'normal';
  const canUseComparisonModes = hasComparisonVideo || currentMode === 'normal';

  const themeClasses = {
    button: theme === 'dark' 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    activeButton: theme === 'dark' 
      ? 'bg-gray-700 text-white border-gray-600' 
      : 'bg-gray-100 text-gray-900 border-gray-300'
  };

  // Get status for trigger button
  const getStatusInfo = () => {
    if (currentMode === 'normal') {
      return { text: "Normal", color: "bg-gray-500" };
    }
    if (!hasComparisonVideo) {
      return { text: "Setup", color: "bg-yellow-500" };
    }
    return { text: "Active", color: "bg-green-500" };
  };

  const status = getStatusInfo();

  return (
    <>
      {/* Modern Trigger Button - Only show if not hidden */}
      {!hideButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          className="flex items-center gap-3 h-9 px-4 bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 shadow-sm transition-all duration-200"
        >
          <Settings className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Compare</span>
          <div className={`w-2 h-2 rounded-full ${status.color} shadow-sm`} />
        </Button>
      )}

      {/* Settings Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[70vw] max-w-[70vw] sm:max-w-[70vw] md:max-w-[70vw] lg:max-w-[70vw] xl:max-w-[70vw] h-[90vh] bg-white border-0 shadow-2xl rounded-xl">
          <DialogHeader className="border-b border-gray-100 pb-4">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
              Video Comparison Settings
            </DialogTitle>
          </DialogHeader>

          <div className="py-6">
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Mode Selection */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <h3 className="text-base font-semibold text-gray-900">Comparison Mode</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                {(Object.keys(modeConfig) as VideoComparisonMode[]).map((mode) => {
                  const config = modeConfig[mode];
                  const Icon = config.icon;
                  const isActive = currentMode === mode;
                  
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        if ((mode === 'split-horizontal' || mode === 'split-vertical' || mode === 'overlay') && onSplitModeSelect) {
                          onSplitModeSelect(mode);
                        } else {
                          onModeChange(mode);
                        }
                      }}
                      disabled={disabled}
                      title={config.description}
                      className={`
                        relative group flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                        ${isActive 
                          ? 'border-blue-500 bg-blue-50 shadow-lg scale-105' 
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:scale-102'
                        }
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <div className={`
                        w-12 h-12 rounded-lg flex items-center justify-center transition-colors duration-200
                        ${isActive ? 'bg-blue-100' : 'bg-gray-100 group-hover:bg-gray-200'}
                      `}>
                        <Icon className={`h-6 w-6 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                      </div>
                      <div className="text-center">
                        <span className={`text-sm font-medium ${isActive ? 'text-blue-900' : 'text-gray-700'}`}>
                          {config.label}
                        </span>
                        <p className={`text-xs mt-1 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                          {config.description}
                        </p>
                      </div>
                      {isActive && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                  })}
                  </div>
                </div>
              </div>

              {/* Right Column - Video Management */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <h3 className="text-base font-semibold text-gray-900">Comparison Video</h3>
                  </div>
              
              {!hasComparisonVideo ? (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-gray-200 rounded-full flex items-center justify-center">
                      <Plus className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 font-medium mb-1">
                        {isComparisonMode 
                          ? "Ready to add comparison video" 
                          : "Choose a comparison mode first"
                        }
                      </p>
                      <p className="text-sm text-gray-500">
                        Select a video from your board or upload a new one
                      </p>
                    </div>
                    <Button
                      onClick={onAddVideo}
                      disabled={!isComparisonMode}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 disabled:bg-gray-300"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Comparison Video
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Video className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <span className="text-gray-900 font-medium block">
                          {comparisonVideoName || "Comparison Video"}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                            Active
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAddVideo}
                        className="h-8 w-8 p-0 hover:bg-green-100"
                        title="Change video"
                      >
                        <Settings className="h-4 w-4 text-green-600" />
                      </Button>
                      {onRemoveComparison && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onRemoveComparison}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Remove comparison"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
                </div>
              </div>
            </div>

            {/* Advanced Controls - Show when comparison is active - Full Width */}
            {hasComparisonVideo && isComparisonMode && (
              <div className="pt-8 border-t border-gray-200">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Sync Controls */}
                  {onSyncToggle && (
                    <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                          <Sliders className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-900 block">Video Synchronization</span>
                          <span className="text-xs text-gray-500">Control playback timing</span>
                        </div>
                      </div>
                      <Button
                        onClick={onSyncToggle}
                        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                          isSynced 
                            ? "bg-purple-600 hover:bg-purple-700 text-white" 
                            : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                        }`}
                      >
                        {isSynced ? "Synced" : "Independent"}
                      </Button>
                    </div>
                    
                    {/* Master Selection - Only when synced */}
                    {isSynced && onSyncMasterChange && (
                      <div className="ml-13 pl-4 border-l-2 border-purple-100">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 font-medium">Master video:</span>
                          <div className="flex bg-gray-100 rounded-lg overflow-hidden">
                            <button
                              onClick={() => onSyncMasterChange('primary')}
                              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                                syncMaster === 'primary'
                                  ? 'bg-purple-600 text-white'
                                  : 'text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              Primary
                            </button>
                            <button
                              onClick={() => onSyncMasterChange('comparison')}
                              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                                syncMaster === 'comparison'
                                  ? 'bg-purple-600 text-white'
                                  : 'text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              Compare
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    </div>
                  )}

                  {/* Overlay Opacity - Only for overlay mode */}
                  {currentMode === 'overlay' && onOpacityChange && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                        <Layers className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900">Overlay Opacity</span>
                          <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">{opacity}%</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-medium">0%</span>
                          <div className="flex-1 relative">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={opacity}
                              onChange={(e) => onOpacityChange(parseInt(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500"
                              style={{
                                background: `linear-gradient(to right, #f97316 0%, #f97316 ${opacity}%, #e5e7eb ${opacity}%, #e5e7eb 100%)`
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 font-medium">100%</span>
                        </div>
                      </div>
                    </div>
                    </div>
                  )}

                  {/* Split Ratio - Only for split modes */}
                  {(currentMode === 'split-horizontal' || currentMode === 'split-vertical') && onSplitRatioChange && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                        {currentMode === 'split-horizontal' ? (
                          <SplitSquareHorizontal className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <SplitSquareVertical className="h-5 w-5 text-indigo-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900">Split Ratio</span>
                          <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">
                            {Math.round(splitRatio * 100)}% / {Math.round((1 - splitRatio) * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-medium">Primary</span>
                          <div className="flex-1 relative">
                            <input
                              type="range"
                              min="0.1"
                              max="0.9"
                              step="0.1"
                              value={splitRatio}
                              onChange={(e) => onSplitRatioChange(parseFloat(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              style={{
                                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${splitRatio * 100}%, #e5e7eb ${splitRatio * 100}%, #e5e7eb 100%)`
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 font-medium">Compare</span>
                        </div>
                      </div>
                    </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status Info */}
            <div className="pt-6 border-t border-gray-200">
              <div className="text-center">
                {!hasComparisonVideo && currentMode === 'normal' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <span className="text-sm text-gray-600 font-medium">Select a comparison mode to get started</span>
                  </div>
                )}
                {!hasComparisonVideo && isComparisonMode && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-blue-700 font-medium">
                      ✨ {modeConfig[currentMode].label} mode ready • Add video to compare
                    </span>
                  </div>
                )}
                {hasComparisonVideo && isComparisonMode && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-700 font-medium">
                      ✅ Comparison active • {modeConfig[currentMode].description}
                    </span>
                  </div>
                )}
                {hasComparisonVideo && currentMode === 'normal' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-lg">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                    <span className="text-sm text-amber-700 font-medium">
                      Comparison video ready • Switch mode to compare
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}