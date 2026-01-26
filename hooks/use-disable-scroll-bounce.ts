import { useEffect } from "react";

export const useDisableScrollBounce = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    // Add classes to disable scroll bounce
    document.body.classList.add("overflow-hidden", "overscroll-none");
    
    // Cleanup function
    return () => {
      if (typeof document === 'undefined') return;
      document.body.classList.remove("overflow-hidden", "overscroll-none");
    };
  }, []);
};
