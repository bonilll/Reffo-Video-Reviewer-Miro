"use client";

import React, { CSSProperties, forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from "@/lib/utils";

export interface ItemProps {
  id: string;
  containerId: string;
  index?: number;
  handle?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  wrapperStyle?: CSSProperties;
  value: React.ReactNode;
  dragging?: boolean;
  sorting?: boolean;
  transition?: string;
  transform?: any;
  fadeIn?: boolean;
  dragOverlay?: boolean;
  color?: string;
  className?: string;
  onClick?(): void;
  children?: React.ReactNode;
}

export const Item = forwardRef<HTMLLIElement, ItemProps>(
  (
    {
      id,
      containerId,
      index,
      handle,
      disabled,
      style,
      wrapperStyle,
      value,
      dragging,
      sorting,
      transition,
      transform,
      fadeIn,
      dragOverlay,
      color,
      className,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <li
        className={cn(
          "box-border relative p-4 list-none rounded-md border border-border shadow-sm bg-card text-card-foreground touch-manipulation",
          fadeIn && "animate-fadeIn",
          dragging && "opacity-30",
          dragOverlay && "cursor-grabbing shadow-md opacity-100 z-50",
          disabled && "cursor-not-allowed opacity-30",
          className
        )}
        ref={ref}
        style={
          {
            ...style,
            transition,
            '--translate-x': transform ? `${Math.round(transform.x)}px` : undefined,
            '--translate-y': transform ? `${Math.round(transform.y)}px` : undefined,
            '--scale-x': transform?.scaleX ?? 1,
            '--scale-y': transform?.scaleY ?? 1,
            '--index': index,
            '--color': color,
            transform: CSS.Transform.toString({
              scaleX: 1,
              scaleY: 1,
              x: transform?.x ?? 0,
              y: transform?.y ?? 0,
            }),
          } as React.CSSProperties
        }
        onClick={onClick}
        {...props}
      >
        <div
          className={cn(
            "flex gap-3 items-center"
          )}
          style={wrapperStyle}
        >
          {handle ? (
            <span className="flex cursor-grab text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
              </svg>
            </span>
          ) : null}
          <span className="flex-1 text-sm">{value}</span>
        </div>
      </li>
    );
  }
);

Item.displayName = 'Item';

export const SortableItem = ({
  disabled,
  id,
  containerId,
  index,
  handle,
  onClick,
  ...props
}: ItemProps) => {
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    over,
    transform,
    transition,
  } = useSortable({
    id,
    data: {
      containerId,
    },
    disabled,
  });

  return (
    <Item
      ref={setNodeRef}
      id={id}
      containerId={containerId}
      dragging={isDragging}
      sorting={isSorting}
      handle={handle}
      index={index}
      disabled={disabled}
      transform={transform}
      transition={transition}
      {...props}
      {...attributes}
      {...(handle ? {} : listeners)}
      onClick={onClick}
      wrapperStyle={handle ? { cursor: 'auto' } : undefined}
    >
      {handle && (
        <span className="handle" ref={setActivatorNodeRef} {...listeners}>
          <svg viewBox="0 0 20 20" width="12">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
          </svg>
        </span>
      )}
    </Item>
  );
}; 