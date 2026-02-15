"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Library } from "lucide-react";
import { ToolButton } from "./tool-button";
import { LibraryModal } from "./library-modal";
import { api } from "@/convex/_generated/api";

interface LibraryButtonProps {
  boardId: string;
  onActionHover?: (label: string) => void;
  onActionHoverEnd?: () => void;
  size?: "sm" | "md" | "lg";
  imageOnly?: boolean;
}

export const LibraryButton = ({
  boardId,
  onActionHover,
  onActionHoverEnd,
  size = "md",
  imageOnly = true,
}: LibraryButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const me = useQuery(api.users.current, {});

  return (
    <>
      <ToolButton
        label="Library"
        icon={Library}
        size={size}
        onClick={() => setIsOpen(true)}
        onHover={() => onActionHover?.("Library")}
        onHoverEnd={onActionHoverEnd}
      />

      <LibraryModal
        boardId={boardId}
        userId={me?._id ? String(me._id) : ""}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        allowedTypes={imageOnly ? ["image"] : ["image", "video", "file"]}
      />
    </>
  );
};
