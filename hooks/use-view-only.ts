import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { isViewOnlyMode } from '@/lib/view-only';

/**
 * Hook to check if the current page is in view-only mode
 * @returns {boolean} True if the page is in view-only mode
 */
export const useViewOnly = (): boolean => {
  const [isViewOnly, setIsViewOnly] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsViewOnly(isViewOnlyMode());
  }, [searchParams]);

  return isViewOnly;
}; 