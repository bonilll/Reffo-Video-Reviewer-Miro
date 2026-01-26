"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ReviewDeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  itemType: "annotation" | "comment" | "annotations" | "comments";
  itemCount: number;
}

export function ReviewDeleteConfirmation({
  open,
  onOpenChange,
  onConfirm,
  itemType,
  itemCount
}: ReviewDeleteConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter key to confirm
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleConfirm();
      }
      
      // Escape key to cancel
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error during deletion:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate appropriate text based on item type and count
  const getTitle = () => {
    if (itemCount === 1) {
      return `Delete ${itemType === "annotation" ? "Annotation" : "Comment"}?`;
    }
    return `Delete ${itemCount} ${itemType === "annotations" ? "Annotations" : "Comments"}?`;
  };

  const getDescription = () => {
    if (itemCount === 1) {
      return `Are you sure you want to delete this ${itemType === "annotation" ? "annotation" : "comment"}? This action cannot be undone.`;
    }
    return `Are you sure you want to delete these ${itemCount} ${itemType === "annotations" ? "annotations" : "comments"}? This action cannot be undone.`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {getTitle()}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600">
            {getDescription()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 mt-4">
          <AlertDialogCancel 
            disabled={isDeleting}
            className="h-9 text-sm"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white h-9 text-sm flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 