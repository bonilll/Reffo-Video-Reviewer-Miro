"use client";

import { useState, useEffect } from "react";

export const useOrigin = () => {
  const [origin, setOrigin] = useState("");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);
  
  return origin;
}; 