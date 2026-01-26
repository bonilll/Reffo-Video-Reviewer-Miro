"use client";

import { useEffect } from "react";

/**
 * Disabilita i gesti di navigazione del browser (come lo swipe per tornare indietro su Safari)
 * Questo è utile per impedire che i gesti di navigazione interferiscano con il pannello della lavagna
 */
export const usePreventNavigationGestures = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    // Salva lo stile precedente
    const prevOverscrollBehavior = document.body.style.overscrollBehavior;
    
    // Imposta overscrollBehavior a none per impedire i gesti di navigazione
    document.body.style.overscrollBehavior = "none";
    
    // Ripristina lo stile originale quando il componente viene smontato
    return () => {
      if (typeof document === 'undefined') return;
      document.body.style.overscrollBehavior = prevOverscrollBehavior;
    };
  }, []);
}; 