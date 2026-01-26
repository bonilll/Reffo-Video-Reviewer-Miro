"use client";

import { VideoComparisonMode } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Layers, 
  Link, 
  Unlink,
  Crown,
  Eye,
  RotateCw,
  X,
  Settings
} from "lucide-react";

interface ComparisonControlsProps {
  mode: VideoComparisonMode;
  opacity: number; // 0-100
  onOpacityChange: (opacity: number) => void;
  isSynced: boolean;
  onSyncToggle: () => void;
  syncMaster: 'primary' | 'comparison';
  onSyncMasterChange: (master: 'primary' | 'comparison') => void;
  splitRatio?: number; // 0-1 for split modes
  onSplitRatioChange?: (ratio: number) => void;
  onRemoveComparison: () => void;
  theme?: 'dark' | 'light';
  comparisonVideoName?: string;
}

export function ComparisonControls({
  mode,
  opacity,
  onOpacityChange,
  isSynced,
  onSyncToggle,
  syncMaster,
  onSyncMasterChange,
  splitRatio = 0.5,
  onSplitRatioChange,
  onRemoveComparison,
  theme = 'light',
  comparisonVideoName
}: ComparisonControlsProps) {

  const themeClasses = {
    container: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700 text-white' 
      : 'bg-white border-gray-200 text-gray-900',
    input: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700' 
      : 'bg-gray-100 border-gray-300',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
    },
    button: theme === 'dark' 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  };

  const isOverlayMode = mode === 'overlay';
  const isSplitMode = mode === 'split-horizontal' || mode === 'split-vertical';

  if (mode === 'normal') {
    return null; // No controls needed for normal mode
  }

  return (
    <div className={`${themeClasses.container} border rounded-lg p-4 space-y-4`}>
      {/* Header with video info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          <span className="text-sm font-medium">Comparison Controls</span>
          <Badge variant="secondary" className="text-xs">
            {mode === 'overlay' ? 'Overlay' : 'Split'}
          </Badge>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemoveComparison}
          className={`${themeClasses.button} h-7 w-7 p-0`}
          title="Remove comparison video"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Video name */}
      {comparisonVideoName && (
        <div className={`text-xs ${themeClasses.text.muted} truncate`}>
          Comparing with: <span className={themeClasses.text.secondary}>{comparisonVideoName}</span>
        </div>
      )}

      {/* Overlay Mode Controls */}
      {isOverlayMode && (
        <div className="space-y-3">
          {/* Opacity Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-sm font-medium ${themeClasses.text.primary} flex items-center gap-1`}>
                <Eye className="h-3 w-3" />
                Overlay Opacity
              </label>
              <span className={`text-xs ${themeClasses.text.muted} font-mono`}>
                {opacity}%
              </span>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={opacity}
                onChange={(e) => onOpacityChange(parseInt(e.target.value))}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${themeClasses.input}`}
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${opacity}%, #d1d5db ${opacity}%, #d1d5db 100%)`
                }}
              />
              
              {/* Opacity indicators */}
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split Mode Controls */}
      {isSplitMode && onSplitRatioChange && (
        <div className="space-y-3">
          {/* Split Ratio Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-sm font-medium ${themeClasses.text.primary}`}>
                Split Ratio
              </label>
              <span className={`text-xs ${themeClasses.text.muted} font-mono`}>
                {Math.round(splitRatio * 100)}% / {Math.round((1 - splitRatio) * 100)}%
              </span>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.1"
                value={splitRatio}
                onChange={(e) => onSplitRatioChange(parseFloat(e.target.value))}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${themeClasses.input}`}
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${splitRatio * 100}%, #f97316 ${splitRatio * 100}%, #f97316 100%)`
                }}
              />
              
              {/* Split ratio indicators */}
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Primary</span>
                <span>50/50</span>
                <span>Comparison</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Synchronization Controls */}
      <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <label className={`text-sm font-medium ${themeClasses.text.primary} flex items-center gap-1`}>
            {isSynced ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
            Sync Videos
          </label>
          
          <Button
            variant={isSynced ? "default" : "outline"}
            size="sm"
            onClick={onSyncToggle}
            className="h-7 text-xs gap-1"
          >
            {isSynced ? (
              <>
                <Link className="h-3 w-3" />
                Synced
              </>
            ) : (
              <>
                <Unlink className="h-3 w-3" />
                Independent
              </>
            )}
          </Button>
        </div>

        {/* Master Selection (only when synced) */}
        {isSynced && (
          <div className="space-y-2">
            <label className={`text-xs ${themeClasses.text.secondary} flex items-center gap-1`}>
              <Crown className="h-3 w-3" />
              Master Video
            </label>
            
            <div className="flex gap-2">
              <Button
                variant={syncMaster === 'primary' ? "default" : "outline"}
                size="sm"
                onClick={() => onSyncMasterChange('primary')}
                className="flex-1 text-xs h-7"
              >
                Primary
                {syncMaster === 'primary' && <Crown className="h-3 w-3 ml-1" />}
              </Button>
              
              <Button
                variant={syncMaster === 'comparison' ? "default" : "outline"}
                size="sm"
                onClick={() => onSyncMasterChange('comparison')}
                className="flex-1 text-xs h-7"
              >
                Comparison
                {syncMaster === 'comparison' && <Crown className="h-3 w-3 ml-1" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Status Indicator */}
      <div className={`text-xs ${themeClasses.text.muted} bg-gray-50 dark:bg-gray-800 rounded p-2 text-center`}>
        {isSynced ? (
          <span className="flex items-center justify-center gap-1">
            🔗 Videos synchronized • {syncMaster === 'primary' ? 'Primary' : 'Comparison'} leads
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1">
            ⛓️‍💥 Independent playback • Manual control
          </span>
        )}
      </div>
    </div>
  );
}