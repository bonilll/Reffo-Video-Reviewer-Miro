"use client";

import React from "react";
import { DragOverlay as DndDragOverlay } from "@dnd-kit/core";
import { Container } from "./Container";
import { Item } from "./Item";
import { cn } from "@/lib/utils";

export interface DragOverlayProps {
  activeId: string | null;
  activeItem: any;
  containerId: string | null;
  containerItems: Record<string, any[]>;
  containerStyle?: React.CSSProperties;
  className?: string;
}

export function DragOverlay({
  activeId,
  activeItem,
  containerId,
  containerItems,
  containerStyle,
  className,
}: DragOverlayProps) {
  if (!activeId) {
    return null;
  }

  const isContainer = activeId && containerId === activeId;

  return (
    <DndDragOverlay>
      {isContainer ? (
        <Container
          id={activeId}
          label={activeItem?.title}
          style={containerStyle}
          shadow
          containerId={activeId}
          className={cn("z-[999]", className)}
          horizontal={false}
        >
          {containerItems[activeId]?.map((item) => (
            <Item
              key={item.id}
              id={item.id}
              containerId={activeId}
              value={item.title}
              handle={false}
              dragOverlay={false}
            />
          ))}
        </Container>
      ) : (
        <Item
          value={activeItem?.title}
          id={activeId}
          containerId={containerId || ""}
          dragOverlay
        />
      )}
    </DndDragOverlay>
  );
} 