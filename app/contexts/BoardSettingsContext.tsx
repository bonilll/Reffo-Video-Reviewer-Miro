"use client";

import { createContext, useContext, useCallback, useState, useEffect, ReactNode } from "react";
import { GridConfig } from "@/app/board/[boardId]/_components/grid-settings";
import { usePlanLimits } from "@/hooks/use-plan-limits";

interface BoardSettingsContextType {
  gridConfig: GridConfig;
  updateGridConfig: (config: GridConfig) => void;
  autoSaveToLibrary: boolean;
  updateAutoSaveToLibrary: (enabled: boolean) => void;
  canEnableAutoSave: boolean;
  showUpgradePrompt: (reason: string) => void;
}

const BoardSettingsContext = createContext<BoardSettingsContextType | undefined>(undefined);

interface BoardSettingsProviderProps {
  children: ReactNode;
  boardId: string;
  initialGridConfig?: GridConfig;
  onShowUpgradePrompt?: (limitType: string, limitValue?: string) => void;
}

export const BoardSettingsProvider = ({ 
  children, 
  boardId, 
  initialGridConfig,
  onShowUpgradePrompt
}: BoardSettingsProviderProps) => {
  // Hook per i limiti del piano
  const { canUploadFile, storageLimit } = usePlanLimits();
  
  // Funzione per caricare le impostazioni della griglia da localStorage
  const loadGridConfig = useCallback((): GridConfig => {
    if (initialGridConfig) return initialGridConfig;
    
    try {
      const saved = localStorage.getItem(`gridConfig-${boardId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Verifica che la configurazione salvata sia valida
        if (parsed && typeof parsed === 'object') {
          return {
            enabled: parsed.enabled ?? true,
            type: (parsed.type === 'dots' || parsed.type === 'lines') ? parsed.type : 'dots',
            opacity: typeof parsed.opacity === 'number' ? Math.max(0.1, Math.min(0.8, parsed.opacity)) : 0.5,
            size: typeof parsed.size === 'number' ? Math.max(10, Math.min(50, parsed.size)) : 30,
            showAccents: parsed.showAccents ?? true,
            color: typeof parsed.color === 'string' ? parsed.color : "#374151",
            backgroundColor: typeof parsed.backgroundColor === 'string' ? parsed.backgroundColor : "#f5f5f5"
          };
        }
      }
    } catch (error) {
      console.warn('Errore nel caricamento delle impostazioni griglia:', error);
    }
    
    // Configurazione di default
    return {
      enabled: true,
      type: "dots",
      opacity: 0.5,
      size: 30,
      showAccents: true,
      color: "#374151",
      backgroundColor: "#f5f5f5"
    };
  }, [boardId, initialGridConfig]);

  // Funzione per caricare l'impostazione autoSaveToLibrary
  const loadAutoSaveToLibrary = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem(`autoSaveToLibrary-${boardId}`);
      if (saved !== null) {
        const parsedValue = JSON.parse(saved);
        // Se il limite di storage è superato, forza il valore a false
        return parsedValue && canUploadFile;
      }
    } catch (error) {
      console.warn('Errore nel caricamento dell\'impostazione autoSaveToLibrary:', error);
    }
    
    // Default: disabilitato di default
    return false;
  }, [boardId, canUploadFile]);

  const [gridConfig, setGridConfig] = useState<GridConfig>(loadGridConfig);
  const [autoSaveToLibrary, setAutoSaveToLibrary] = useState<boolean>(loadAutoSaveToLibrary);

  // Funzione per salvare le impostazioni della griglia
  const saveGridConfig = useCallback((config: GridConfig) => {
    try {
      localStorage.setItem(`gridConfig-${boardId}`, JSON.stringify(config));
    } catch (error) {
      console.warn('Errore nel salvataggio delle impostazioni griglia:', error);
    }
  }, [boardId]);

  // Handler per aggiornare la configurazione della griglia
  const updateGridConfig = useCallback((newConfig: GridConfig) => {
    setGridConfig(newConfig);
    saveGridConfig(newConfig);
  }, [saveGridConfig]);

  // Funzione per mostrare il popup di upgrade
  const showUpgradePrompt = useCallback((reason: string) => {
    const storageLimitGB = (storageLimit / 1024).toFixed(1);
    onShowUpgradePrompt?.("storage_limit_exceeded", `${storageLimitGB}GB`);
  }, [onShowUpgradePrompt, storageLimit]);

  // Carica le impostazioni quando cambia il boardId o i limiti
  useEffect(() => {
    const config = loadGridConfig();
    setGridConfig(config);
    
    const autoSave = loadAutoSaveToLibrary();
    setAutoSaveToLibrary(autoSave);
  }, [boardId, loadGridConfig, loadAutoSaveToLibrary, canUploadFile]);

  const value = {
    gridConfig,
    updateGridConfig,
    autoSaveToLibrary,
    canEnableAutoSave: canUploadFile,
    showUpgradePrompt,
    updateAutoSaveToLibrary: (enabled: boolean) => {
      // Se si cerca di abilitare il salvataggio ma i limiti sono superati
      if (enabled && !canUploadFile) {
        showUpgradePrompt("storage_limit_exceeded");
        return; // Non cambiare lo stato
      }
      
      setAutoSaveToLibrary(enabled);
      try {
        localStorage.setItem(`autoSaveToLibrary-${boardId}`, JSON.stringify(enabled));
      } catch (error) {
        console.warn('Errore nel salvataggio dell\'impostazione autoSaveToLibrary:', error);
      }
    }
  };

  return (
    <BoardSettingsContext.Provider value={value}>
      {children}
    </BoardSettingsContext.Provider>
  );
};

export const useBoardSettings = () => {
  const context = useContext(BoardSettingsContext);
  if (context === undefined) {
    throw new Error('useBoardSettings must be used within a BoardSettingsProvider');
  }
  return context;
}; 