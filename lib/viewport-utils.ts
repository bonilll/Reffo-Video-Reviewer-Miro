/**
 * Mobile viewport utilities for handling browser chrome/UI elements
 */

/**
 * Updates CSS variable for viewport height to handle mobile browser address bar
 * This should be called on page load and on orientation change
 */
export const updateViewportHeight = (): void => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
};

/**
 * Handles iOS Safari 100vh issue by updating viewport variables dynamically
 * Call this function in your app layout/root component
 */
export const initMobileViewport = (): (() => void) => {
  // Initial calculation
  updateViewportHeight();

  // Add event listeners
  window.addEventListener('resize', updateViewportHeight);
  window.addEventListener('orientationchange', updateViewportHeight);
  
  // Handle iOS Safari address bar hiding/showing
  let lastScrollTop = 0;
  
  const handleScroll = () => {
    const st = window.scrollY || document.documentElement.scrollTop;
    
    // Detect scroll direction
    if (st > lastScrollTop && st > 50) {
      // Scrolling down - try to hide address bar
      document.documentElement.classList.add('hide-address-bar');
    } else if (st < lastScrollTop) {
      // Scrolling up - address bar might show
      document.documentElement.classList.remove('hide-address-bar');
    }
    
    lastScrollTop = st <= 0 ? 0 : st;
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('resize', updateViewportHeight);
    window.removeEventListener('orientationchange', updateViewportHeight);
    window.removeEventListener('scroll', handleScroll);
  };
}; 