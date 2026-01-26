"use client";

import { Library } from "lucide-react";

interface LibraryButtonProps {
  boardId: string;
  onActionHover?: (label: string) => void;
  onActionHoverEnd?: () => void;
  size?: "sm" | "md" | "lg";
}

export const LibraryButton = ({
  boardId,
  onActionHover,
  onActionHoverEnd,
  size = "md"
}: LibraryButtonProps) => {
  void boardId;
  void onActionHover;
  void onActionHoverEnd;
  void size;

  return null;
}; 
