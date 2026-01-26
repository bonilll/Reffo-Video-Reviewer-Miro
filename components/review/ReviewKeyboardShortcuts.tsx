"use client";

import { useEffect, useCallback } from "react";
import { ReviewCanvasState } from "@/types/canvas";

interface ReviewKeyboardShortcutsProps {
  canvasState: ReviewCanvasState;
  onCanvasStateChange: (state: ReviewCanvasState) => void;
  selectedAnnotationIds: string[];
  selectedCommentIds?: string[];
  onAnnotationSelect: (annotationIds: string[]) => void;
  onCommentSelect?: (commentIds: string[]) => void;
  onAnnotationDelete: (annotationIds: string[]) => void;
  onCommentDelete?: (commentIds: string[]) => void;
  onAnnotationDuplicate: (annotationIds: string[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  disabled?: boolean;
}

export function ReviewKeyboardShortcuts({
  canvasState,
  onCanvasStateChange,
  selectedAnnotationIds,
  selectedCommentIds = [],
  onAnnotationSelect,
  onCommentSelect,
  onAnnotationDelete,
  onCommentDelete,
  onAnnotationDuplicate,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onSelectAll,
  onDeselectAll,
  disabled = false
}: ReviewKeyboardShortcutsProps) {

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return;
    
    // Ignore shortcuts when typing in inputs
    if (e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement || 
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.contentEditable === 'true') {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    const isShift = e.shiftKey;
    const isAlt = e.altKey;

    // Prevent default for our shortcuts
    const preventDefault = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    // SELECTION & EDITING SHORTCUTS
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const hasSelectedAnnotations = selectedAnnotationIds.length > 0;
      const hasSelectedComments = selectedCommentIds.length > 0;
      
      if (hasSelectedAnnotations || hasSelectedComments) {
        preventDefault();
        
        // Delete annotations if any are selected
        if (hasSelectedAnnotations) {
          onAnnotationDelete(selectedAnnotationIds);
        }
        
        // Delete comments if any are selected
        if (hasSelectedComments && onCommentDelete) {
          onCommentDelete(selectedCommentIds);
        }
      }
      return;
    }

    if (ctrlOrCmd && e.key === 'a') {
      preventDefault();
      onSelectAll?.();
      return;
    }

    if (e.key === 'Escape') {
      preventDefault();
      onDeselectAll?.();
      return;
    }

    // COPY & PASTE
    if (ctrlOrCmd && e.key === 'c') {
      if (selectedAnnotationIds.length > 0) {
        preventDefault();
        onCopy?.();
      }
      return;
    }

    if (ctrlOrCmd && e.key === 'v') {
      preventDefault();
      onPaste?.();
      return;
    }

    if (ctrlOrCmd && e.key === 'd') {
      if (selectedAnnotationIds.length > 0) {
        preventDefault();
        onAnnotationDuplicate(selectedAnnotationIds);
      }
      return;
    }

    // UNDO & REDO
    if (ctrlOrCmd && e.key === 'z') {
      preventDefault();
      if (isShift) {
        onRedo?.();
      } else {
        onUndo?.();
      }
      return;
    }

    if (ctrlOrCmd && e.key === 'y') {
      preventDefault();
      onRedo?.();
      return;
    }

    // TOOL SHORTCUTS
    if (!ctrlOrCmd && !isShift && !isAlt) {
      switch (e.key) {
        case 'v':
        case 'V':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "select" });
          break;
        case 'p':
        case 'P':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "freehand" });
          break;
        case 'r':
        case 'R':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "rectangle" });
          break;
        case 'o':
        case 'O':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "circle" });
          break;
        case 'l':
        case 'L':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "arrow" });
          break;

        case 'e':
        case 'E':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "eraser" });
          break;
        case 'c':
        case 'C':
          preventDefault();
          onCanvasStateChange({ ...canvasState, tool: "comment" });
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          preventDefault();
          const strokeWidths = [1, 2, 3, 5, 8];
          const index = parseInt(e.key) - 1;
          if (index >= 0 && index < strokeWidths.length) {
            onCanvasStateChange({ ...canvasState, strokeWidth: strokeWidths[index] });
          }
          break;
        case '[':
          preventDefault();
          onCanvasStateChange({ 
            ...canvasState, 
            strokeWidth: Math.max(1, canvasState.strokeWidth - 1) 
          });
          break;
        case ']':
          preventDefault();
          onCanvasStateChange({ 
            ...canvasState, 
            strokeWidth: Math.min(12, canvasState.strokeWidth + 1) 
          });
          break;
      }
    }

    // COLOR SHORTCUTS (1-9 keys with Alt)
    if (isAlt && !ctrlOrCmd && !isShift) {
      const colors = [
        "#ef4444", // red - Alt+1
        "#f97316", // orange - Alt+2
        "#eab308", // yellow - Alt+3
        "#22c55e", // green - Alt+4
        "#3b82f6", // blue - Alt+5
        "#8b5cf6", // purple - Alt+6
        "#ec4899", // pink - Alt+7
        "#6b7280", // gray - Alt+8
        "#000000"  // black - Alt+9
      ];

      const colorIndex = parseInt(e.key) - 1;
      if (colorIndex >= 0 && colorIndex < colors.length) {
        preventDefault();
        onCanvasStateChange({ ...canvasState, color: colors[colorIndex] });
      }
    }

  }, [
    disabled,
    canvasState,
    onCanvasStateChange,
    selectedAnnotationIds,
    selectedCommentIds,
    onAnnotationSelect,
    onCommentSelect,
    onAnnotationDelete,
    onCommentDelete,
    onAnnotationDuplicate,
    onUndo,
    onRedo,
    onCopy,
    onPaste,
    onSelectAll,
    onDeselectAll
  ]);

  useEffect(() => {
    if (disabled) return;

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown, disabled]);

  return null; // This component only handles events
}

// Hook per facilitare l'uso
export function useReviewKeyboardShortcuts(props: ReviewKeyboardShortcutsProps) {
  return <ReviewKeyboardShortcuts {...props} />;
} 