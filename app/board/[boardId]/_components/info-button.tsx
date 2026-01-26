"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";

export const InfoButton = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="info-button-container">
      <div className="relative">
        <button
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white/90 hover:bg-white border border-gray-200/60 transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl backdrop-blur-sm"
          title="Keyboard shortcuts and commands"
        >
          <Info className="w-5 h-5 text-gray-600" />
        </button>
        
        {isHovered && (
          <div className="absolute bottom-full right-0 mb-4 z-50 animate-in fade-in-0 slide-in-from-bottom-4 duration-200 ease-out">
            <div className="w-80 bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-xl p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200/60">
                  <Info className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Keyboard Shortcuts & Commands</h3>
                </div>
                
                {/* Navigation */}
                <div>
                  <h4 className="font-medium text-gray-800 text-xs mb-2">Navigation</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Pan canvas</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Space + Drag</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Zoom in/out</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + Scroll</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Fit to screen</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">H or Ctrl + 1</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Reset to center</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + 0</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Zoom in</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + +</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Zoom out</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + -</kbd>
                    </div>
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <h4 className="font-medium text-gray-800 text-xs mb-2">Tools</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Select tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">V</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Text tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">T</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Note tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">N</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Pencil tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">P</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Rectangle</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">R</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Circle</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">O</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Line tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">L</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Frame tool</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">F</kbd>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <h4 className="font-medium text-gray-800 text-xs mb-2">Actions</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Undo</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + Z</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Redo</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + Y</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Delete selected</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Delete</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Select all</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + A</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Duplicate</span>
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Ctrl + D</kbd>
                    </div>
                  </div>
                </div>

                {/* Mouse Actions */}
                <div>
                  <h4 className="font-medium text-gray-800 text-xs mb-2">Mouse Actions</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Multi-select</span>
                      <span className="text-xs text-gray-500">Shift + Click</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Edit note text</span>
                      <span className="text-xs text-gray-500">Double Click</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Drag to select</span>
                      <span className="text-xs text-gray-500">Click + Drag</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Arrow pointing down to button */}
              <div className="absolute -bottom-2 right-6">
                <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-white/95" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 translate-y-px w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-transparent border-t-gray-200/60" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 