"use client";

import React, { CSSProperties, ReactNode, forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from "@/lib/utils";

export interface ContainerProps {
  children: ReactNode;
  columns?: number;
  id?: string;
  items?: string[];
  label?: string;
  style?: React.CSSProperties;
  horizontal?: boolean;
  containerId?: string;
  shadow?: boolean;
  hover?: boolean;
  handleProps?: React.HTMLAttributes<any>;
  scrollable?: boolean;
  placeholder?: boolean;
  unstyled?: boolean;
  onClick?: ((id: string) => void) | (() => void);
  onRemove?(): void;
  className?: string;
}

export const Container = forwardRef<HTMLDivElement | HTMLButtonElement, ContainerProps>(
  (
    {
      children,
      columns = 1,
      id,
      items,
      label,
      style,
      horizontal,
      containerId,
      shadow,
      hover,
      handleProps,
      onClick,
      onRemove,
      placeholder,
      scrollable,
      unstyled,
      className,
      ...props
    },
    ref
  ) => {
    const isItemContainer = !!items;

    // Se è cliccabile, renderizza come button
    if (onClick && typeof onClick === 'function') {
      return (
        <button
          {...props}
          // @ts-ignore - questo è sicuro perché stiamo usando un button qui
          ref={ref}
          style={{
            ...style,
            "--columns": columns,
          } as React.CSSProperties}
          className={cn(
            "flex flex-col overflow-hidden box-border appearance-none outline-none min-w-[350px] m-2.5 rounded-md min-h-[200px] transition-colors duration-300 bg-card border border-border",
            horizontal && "w-full",
            hover && "bg-muted/70",
            placeholder && "justify-center items-center cursor-pointer text-muted-foreground bg-transparent border-dashed border-muted-foreground/20 hover:border-muted-foreground/40",
            scrollable && "overflow-y-auto",
            shadow && "shadow-md",
            unstyled && "!bg-transparent !border-none overflow-visible",
            className
          )}
          onClick={() => id && typeof onClick === 'function' && onClick(id)}
          tabIndex={0}
        >
          {label ? (
            <div className="flex p-3 pl-5 pr-2 items-center justify-between bg-background border-b border-border rounded-t-md">
              <span className="text-sm font-semibold">{label}</span>
              <div className="flex">
                {onRemove && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                    className="p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <svg viewBox="0 0 20 20" width="12">
                      <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
                    </svg>
                  </button>
                )}
                {handleProps && (
                  <button 
                    {...handleProps}
                    className="p-1 rounded-full cursor-grab text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <svg viewBox="0 0 20 20" width="12">
                      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {placeholder ? children : (
            <ul className={cn(
              "grid gap-2.5 p-5 m-0 list-none", 
              horizontal ? "grid-flow-col" : `grid-cols-[repeat(var(--columns,1),1fr)]`
            )}>
              {children}
            </ul>
          )}
        </button>
      );
    }
    
    // Altrimenti, renderizza come div
    return (
      <div
        {...props}
        // @ts-ignore - questo è sicuro perché stiamo usando un div qui
        ref={ref}
        style={{
          ...style,
          "--columns": columns,
        } as React.CSSProperties}
        className={cn(
          "flex flex-col overflow-hidden box-border appearance-none outline-none min-w-[350px] m-2.5 rounded-md min-h-[200px] transition-colors duration-300 bg-card border border-border",
          horizontal && "w-full",
          hover && "bg-muted/70",
          placeholder && "justify-center items-center cursor-pointer text-muted-foreground bg-transparent border-dashed border-muted-foreground/20 hover:border-muted-foreground/40",
          scrollable && "overflow-y-auto",
          shadow && "shadow-md",
          unstyled && "!bg-transparent !border-none overflow-visible",
          className,
          `
            ${shadow ? 'shadow-md' : ''}
            ${
              isItemContainer
                ? 'bg-white dark:bg-gray-800 rounded-md p-4 mb-4'
                : ''
            }
            ${horizontal ? 'flex flex-row' : ''}
          `
        )}
        onClick={() => id && typeof onClick === 'function' && onClick(id)}
      >
        {label ? (
          <div className={cn(
            "mb-2 font-medium text-gray-700 dark:text-gray-300",
            handleProps && "flex p-3 pl-5 pr-2 items-center justify-between bg-background border-b border-border rounded-t-md"
          )}>
            <span className={handleProps ? "text-sm font-semibold" : ""}>{label}</span>
            {handleProps && (
              <div className="flex">
                {onRemove && (
                  <button 
                    onClick={onRemove}
                    className="p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <svg viewBox="0 0 20 20" width="12">
                      <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
                    </svg>
                  </button>
                )}
                {handleProps && (
                  <button 
                    {...handleProps}
                    className="p-1 rounded-full cursor-grab text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <svg viewBox="0 0 20 20" width="12">
                      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
        {placeholder ? children : (
          <ul className={cn(
            "grid gap-2.5 p-5 m-0 list-none", 
            horizontal ? "grid-flow-col" : `grid-cols-[repeat(var(--columns,1),1fr)]`
          )}>
            {children}
          </ul>
        )}
      </div>
    );
  }
);

Container.displayName = 'Container';

export const DroppableContainer = ({
  id,
  items,
  children,
  ...props
}: ContainerProps) => {
  const {
    active,
    attributes,
    isDragging,
    listeners,
    over,
    setNodeRef,
    transition,
    transform,
  } = useSortable({
    id,
    data: {
      type: 'container',
      children: items,
    },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Container
      ref={setNodeRef}
      style={style}
      id={id}
      items={items}
      containerId={id}
      hover={isDragging}
      handleProps={{
        ...attributes,
        ...listeners,
      }}
      {...props}
    >
      {children}
    </Container>
  );
}; 