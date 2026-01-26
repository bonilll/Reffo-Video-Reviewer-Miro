"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ProfileImageContextType {
  refreshKey: number;
  triggerRefresh: () => void;
}

const ProfileImageContext = createContext<ProfileImageContextType | undefined>(undefined);

export function ProfileImageProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(Date.now());
  
  const triggerRefresh = useCallback(() => {
    setRefreshKey(Date.now());
  }, []);
  
  return (
    <ProfileImageContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </ProfileImageContext.Provider>
  );
}

export function useProfileImageRefresh() {
  const context = useContext(ProfileImageContext);
  if (context === undefined) {
    throw new Error('useProfileImageRefresh must be used within a ProfileImageProvider');
  }
  return context;
} 