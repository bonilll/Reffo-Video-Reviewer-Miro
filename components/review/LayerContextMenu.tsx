"use client";

import { Layer } from "@/types/canvas";
import { 
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator
} from "@/components/ui/context-menu";
import { Copy, Trash2, Edit } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface LayerContextMenuProps {
  children: React.ReactNode;
  layer: Layer;
  boardId: Id<"boards">;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}

export function LayerContextMenu({
  children,
  layer: _layer,
  boardId: _boardId,
  onDelete,
  onDuplicate,
  onEdit
}: LayerContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onEdit && (
          <ContextMenuItem
            onClick={onEdit}
            className="flex items-center gap-2"
          >
            <Edit className="h-4 w-4" />
            <span>Modifica</span>
          </ContextMenuItem>
        )}
        
        {onDuplicate && (
          <ContextMenuItem
            onClick={onDuplicate}
            className="flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            <span>Duplica</span>
          </ContextMenuItem>
        )}
        
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={onDelete}
              className="flex items-center gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              <span>Elimina</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
