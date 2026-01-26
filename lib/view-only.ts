/**
 * Utility functions for handling view-only mode
 */

/**
 * Checks if the current URL has the viewOnly parameter set to true
 */
export const isViewOnlyMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const url = new URL(window.location.href);
  return url.searchParams.get('viewOnly') === 'true';
};

/**
 * Gets the current URL with the viewOnly parameter added or removed
 * @param viewOnly Whether to add or remove the viewOnly parameter
 */
export const getUrlWithViewOnlyParam = (viewOnly: boolean): string => {
  if (typeof window === 'undefined') return '';
  
  const url = new URL(window.location.href);
  
  if (viewOnly) {
    url.searchParams.set('viewOnly', 'true');
  } else {
    url.searchParams.delete('viewOnly');
  }
  
  return url.toString();
}; 