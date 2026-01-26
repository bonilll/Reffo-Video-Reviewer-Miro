"use client";

import { useState, useEffect, useRef, useMemo } from 'react';

interface UseVirtualScrollingProps {
  items: any[];
  itemHeight: number;
  containerHeight: number;
  buffer?: number;
}

export function useVirtualScrolling({
  items,
  itemHeight,
  containerHeight,
  buffer = 5
}: UseVirtualScrollingProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length, buffer]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((item, index) => ({
      item,
      index: visibleRange.startIndex + index,
      top: (visibleRange.startIndex + index) * itemHeight
    }));
  }, [items, visibleRange, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // IntersectionObserver para detectar quando os itens ficam visíveis
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Trigger load for visible items
            const target = entry.target as HTMLElement;
            target.dataset.loaded = 'true';
          }
        });
      },
      {
        root: scrollElementRef.current,
        rootMargin: '200px',
        threshold: 0.1
      }
    );

    return () => observer.disconnect();
  }, []);

  return {
    scrollElementRef,
    visibleItems,
    totalHeight,
    handleScroll,
    visibleRange
  };
} 