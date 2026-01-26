import { useState, useEffect, useCallback } from "react";

interface UseDragDropOptions {
  onDrop?: (files: FileList) => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
}

export const useDragDropUpload = ({
  onDrop,
  onDragOver,
  onDragLeave
}: UseDragDropOptions = {}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Controlla se si tratta di un elemento interno della board
    const hasInternalData = e.dataTransfer?.types.includes('application/board-layer');
    const hasFiles = e.dataTransfer?.types.includes('Files');
    
    // Controlla se si tratta di una colonna della tabella
    const target = e.target as HTMLElement;
    const isTableColumn = target?.closest('[data-column-id]') || target?.hasAttribute('data-column-id');
    
    // Solo mostra l'overlay di upload per file esterni (non elementi interni o colonne)
    if (!hasInternalData && hasFiles && !isTableColumn && !isDragging) {
      setIsDragging(true);
      onDragOver?.();
    }
  }, [isDragging, onDragOver]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Verifica che l'evento dragLeave sia stato attivato uscendo dalla finestra
    // e non passando su un elemento figlio
    const { relatedTarget } = e;
    if (!relatedTarget || 
        (relatedTarget as Node).nodeName === 'HTML' || 
        !(document.documentElement.contains(relatedTarget as Node))) {
      setIsDragging(false);
      onDragLeave?.();
    }
  }, [onDragLeave]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Controlla se si tratta di un elemento interno della board
    const hasInternalData = e.dataTransfer?.types.includes('application/board-layer');
    const hasFiles = e.dataTransfer?.types.includes('Files');
    
    setIsDragging(false);
    
    // Solo gestisci file esterni, non elementi interni della board
    if (!hasInternalData && hasFiles) {
      const { files } = e.dataTransfer || { files: null };
      if (files && files.length > 0) {
        const filesArray = new DataTransfer();
        Array.from(files).forEach(file => filesArray.items.add(file));
        onDrop?.(filesArray.files);
      }
    }
  }, [onDrop]);

  useEffect(() => {
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  }, [handleDragOver, handleDragLeave, handleDrop]);

  return { isDragging };
}; 
