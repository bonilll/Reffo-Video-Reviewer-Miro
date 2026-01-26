import { useEffect, useState } from 'react';

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const breakpointValues = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState(false);

  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      setIsBelowBreakpoint(width < breakpointValues[breakpoint]);
    };

    // Initial check
    checkBreakpoint();

    // Add event listener for window resize
    window.addEventListener('resize', checkBreakpoint);

    // Clean up event listener
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, [breakpoint]);

  return isBelowBreakpoint;
} 