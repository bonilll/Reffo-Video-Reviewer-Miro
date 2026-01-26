"use client";

import React, { createContext, useContext } from 'react';
import { api } from '@/convex/_generated/api';

// Create a context to provide access to Convex API
interface ApiContextType {
  query: {
    todoLists: {
      getLists: (args: { archived: boolean }) => Promise<any[]>;
    }
  }
}

const ApiContext = createContext<ApiContextType | null>(null);

export const ApiProvider = ({ children }: { children: React.ReactNode }) => {
  // Implementazione semplificata che utilizza direttamente fetch invece di useQuery
  const apiValue = {
    query: {
      todoLists: {
        getLists: async (args: { archived: boolean }): Promise<any[]> => {
          // Implementazione dummy che restituisce un array vuoto
          // In una implementazione reale, questo dovrebbe fare una chiamata API
          return [];
        }
      }
    }
  };

  return (
    <ApiContext.Provider value={apiValue}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
}; 