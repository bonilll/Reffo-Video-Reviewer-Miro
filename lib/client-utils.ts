/**
 * Utility functions to safely access browser APIs
 */

// Check if code is running in the browser
export const isBrowser = typeof window !== 'undefined';

// Safely access window
export const safeWindow = (): Window | undefined => {
  return isBrowser ? window : undefined;
};

// Safely access document
export const safeDocument = (): Document | undefined => {
  return isBrowser ? document : undefined;
};

// Safely access localStorage
export const safeLocalStorage = (): Storage | undefined => {
  try {
    return isBrowser ? window.localStorage : undefined;
  } catch (e) {
    return undefined;
  }
};

// Safely access sessionStorage
export const safeSessionStorage = (): Storage | undefined => {
  try {
    return isBrowser ? window.sessionStorage : undefined;
  } catch (e) {
    return undefined;
  }
};

// Safely add event listener to window
export const safeAddWindowEventListener = (
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void => {
  if (isBrowser) {
    window.addEventListener(event, handler, options);
  }
};

// Safely remove event listener from window
export const safeRemoveWindowEventListener = (
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): void => {
  if (isBrowser) {
    window.removeEventListener(event, handler, options);
  }
};

// Safely execute a function only in browser environment
export const executeOnClient = (fn: () => void): void => {
  if (isBrowser) {
    fn();
  }
}; 