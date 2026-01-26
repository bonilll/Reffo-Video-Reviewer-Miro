"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Camera } from '@/types/canvas';

interface CameraContextType {
  camera: Camera;
  setCamera: (camera: Camera) => void;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

interface CameraProviderProps {
  children: ReactNode;
}

export const CameraProvider = ({ children }: CameraProviderProps) => {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });

  return (
    <CameraContext.Provider value={{ camera, setCamera }}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = () => {
  const context = useContext(CameraContext);
  if (context === undefined) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  return context;
}; 