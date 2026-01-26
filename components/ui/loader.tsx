"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Lottie from "lottie-react";

type LoaderProps = {
  className?: string;
  containerClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  fullScreen?: boolean;
};

/**
 * Componente riutilizzabile che mostra un'animazione di caricamento Lottie
 * Ottimizzato per funzionare con Vercel deployment
 */
export const Loader = ({
  className,
  containerClassName,
  size = "md",
  fullScreen = false,
}: LoaderProps) => {
  const [animationData, setAnimationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    
    // Solo una volta montato il componente, carica l'animazione
    if (typeof window !== "undefined") {
      setIsLoading(true);
      
      fetch('/animations/Loader.json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to load animation file');
          }
          return response.json();
        })
        .then(data => {
          setAnimationData(data);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('Error loading animation:', error);
          setHasError(true);
          setIsLoading(false);
        });
    }
  }, []);
  
  // Determina la dimensione in base alla prop size
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16", 
    xl: "w-24 h-24",
  };
  
  // Dimensioni per il fallback spinner - used only as last resort
  const spinnerSizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12", 
    xl: "w-16 h-16",
  };
  
  // If still loading or not mounted, return nothing to avoid spinner display
  if (!isMounted || (isLoading && !hasError)) {
    return null;
  }
  
  // Only show fallback spinner if animation loading resulted in an error
  if (hasError) {
    return (
      <div className={cn(
        "flex items-center justify-center opacity-0 animate-fade-in",
        fullScreen && "fixed inset-0 bg-white/80 backdrop-blur-sm z-50",
        containerClassName
      )}>
        <Loader2 className={cn(
          "animate-spin text-primary/70",
          spinnerSizeClasses[size],
          className
        )} />
      </div>
    );
  }

  // Container che mostra l'animazione
  return (
    <div className={cn(
      "flex items-center justify-center opacity-0 animate-fade-in transition-opacity duration-300",
      fullScreen && "fixed inset-0 bg-white/80 backdrop-blur-sm z-50",
      containerClassName
    )}>
      {animationData ? (
        <div className={cn(
          sizeClasses[size],
          className
        )}>
          <Lottie
            animationData={animationData}
            loop={true}
            autoplay={true}
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{
              preserveAspectRatio: 'xMidYMid slice'
            }}
          />
        </div>
      ) : null}
    </div>
  );
}; 
