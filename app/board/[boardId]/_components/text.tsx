import React, { useRef, useState, useEffect, useCallback } from "react";
import { useMutation, useStorage } from "@/liveblocks.config";
import { cn, colorToCSS } from "@/lib/utils";
import type { TextLayer } from "@/types/canvas";

// Configurazione per il testo
const TEXT_CONFIG = {
  minWidth: 120,
  minHeight: 36,
  defaultWidth: 200,
  defaultHeight: 40,
  padding: 12,
  fontSize: {
    min: 8,
    max: 288,
    default: 16
  }
} as const;

// Funzione per pulire il testo da stili HTML mantenendo solo il contenuto
const cleanTextContent = (html: string): string => {
  if (!html) return '';
  
  // Rimuove tutti i tag HTML e mantiene solo il testo
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Estrae solo il testo senza formattazione
  let textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // Pulisce elementi problematici mantenendo spazi e a capo
  textContent = textContent
    .replace(/\u00A0/g, ' ') // Sostituisce spazi non-breaking con spazi normali
    .replace(/\r\n/g, '\n')  // Normalizza line endings Windows
    .replace(/\r/g, '\n')    // Normalizza line endings Mac
    .replace(/\t/g, ' ');    // Sostituisce tab con spazi
  
  return textContent;
};

// Calcolo della dimensione necessaria per il contenuto
const calculateRequiredSize = (text: string, fontSize: number, fontWeight: string): { width: number; height: number } => {
  if (!text || text.trim().length === 0) {
    return { width: TEXT_CONFIG.minWidth, height: TEXT_CONFIG.minHeight };
  }
  
  const padding = TEXT_CONFIG.padding * 2;
  
  // Calcolo approssimativo basato sui caratteri e dimensione font
  let avgCharWidth = fontSize * 0.6;
  if (fontWeight === "bold") {
    avgCharWidth *= 1.15;
  }
  
  const lineHeight = fontSize * 1.2;
  
  // Calcola la larghezza necessaria
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));
  const requiredWidth = Math.max(maxLineLength * avgCharWidth + padding, TEXT_CONFIG.minWidth);
  
  // Calcola l'altezza necessaria
  const numberOfLines = lines.length;
  const requiredHeight = Math.max(numberOfLines * lineHeight + padding, TEXT_CONFIG.minHeight);
  
  // Limita la larghezza massima per evitare testi troppo larghi
  const finalWidth = Math.min(requiredWidth, 800);
  
  return { width: finalWidth, height: requiredHeight };
};

interface TextProps {
  id: string;
  layer: TextLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
  backgroundColorHint?: string; // Hint per calcolare il colore contrario
}

export const Text: React.FC<TextProps> = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
  backgroundColorHint = "#f5f5f5", // Default grigio chiaro
}) => {
  // Stati per l'editing - PRIMA di tutto per evitare errori di dichiarazione
  const [isEditing, setIsEditing] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [textValue, setTextValue] = useState(""); // Stato per il valore del textarea
  
  // Usa useStorage per monitorare i cambiamenti delle proprietà del layer
  const layerData = useStorage((root) => {
    const layer = root.layers.get(id);
    return layer?.type === "text" ? layer as TextLayer : null;
  });
  
  // SEMPRE usa i dati più aggiornati dal storage, fallback sui props solo se necessario
  const currentLayer = layerData || layer;
  
  // Estrai le proprietà assicurandoti di non usare mai i valori di default se esiste un valore reale
  const x = currentLayer.x;
  const y = currentLayer.y;
  const width = currentLayer.width;
  const height = currentLayer.height;
  const fill = currentLayer.fill;
  const value = currentLayer.value;
  const fontSize = currentLayer.fontSize || TEXT_CONFIG.fontSize.default;
  const fontWeight = currentLayer.fontWeight || "normal";
  const textAlign = currentLayer.textAlign || "left";
  const fontFamily = currentLayer.fontFamily || "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial";
  const fontStyle = currentLayer.fontStyle || "normal";
  const textDecoration = currentLayer.textDecoration || "none";
  const verticalAlign = currentLayer.verticalAlign || "top";
  const letterSpacing = currentLayer.letterSpacing || 0;
  const lineHeight = currentLayer.lineHeight || 1.2;
  const textTransform = currentLayer.textTransform || "none";
  const textShadow = currentLayer.textShadow || false;
  
  // Funzione per calcolare il colore contrario al background per il fallback
  const getContrastingTextColor = (backgroundColor: string): string => {
    let r = 0, g = 0, b = 0;
    
    if (backgroundColor.startsWith('#')) {
      const hex = backgroundColor.slice(1);
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      }
    }
    
    // Calcola luminosità
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    
    // Se background scuro, usa testo chiaro; se background chiaro, usa testo scuro
    return luminance < 128 ? "#f8fafc" : "#1e293b";
  };
  
  // Colore del testo: usa fill del layer se presente, altrimenti calcola contrario del background
  const textColor = fill ? colorToCSS(fill) : getContrastingTextColor(backgroundColorHint);
  
  // Refs
  const textRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const initialValueRef = useRef<string | null>(null);
  
  // Inizializzazione quando entra in editing
  useEffect(() => {
    if (isEditing && !initialDimensionsRef.current) {
      // Prima volta che entra in editing - salva stato iniziale
      setTextValue(value || "");
      initialDimensionsRef.current = { width, height };
      initialValueRef.current = value || "";
    } else if (!isEditing) {
      // Reset when exiting editing
      initialDimensionsRef.current = null;
      initialValueRef.current = null;
    }
  }, [isEditing]); // Solo quando cambia isEditing
  
  // Sincronizza con modifiche esterne solo quando non in editing
  useEffect(() => {
    if (!isEditing && value !== textValue) {
      setTextValue(value || "");
    }
  }, [value, isEditing, textValue]);
  
  // Mutations
  const updateTextLayer = useMutation(({ storage }, updates: Partial<TextLayer>) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(id);
    if (layer) {
      layer.update(updates);
    }
  }, [id]);

  // Salvataggio ottimizzato con debouncing
  const debouncedSave = useCallback((newText: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      let newWidth = width;
      let newHeight = height;
      
      // Preserva dimensioni manuali se esistenti
      if (initialDimensionsRef.current) {
        newWidth = initialDimensionsRef.current.width;
        newHeight = initialDimensionsRef.current.height;
      } else {
        // Ricalcola automaticamente per nuovi testi
        const currentFontSize = currentLayer.fontSize || TEXT_CONFIG.fontSize.default;
        const currentFontWeight = currentLayer.fontWeight || "normal";
        const calculated = calculateRequiredSize(newText, currentFontSize, currentFontWeight);
        newWidth = calculated.width;
        newHeight = calculated.height;
      }
      
      updateTextLayer({
        value: newText,
        width: newWidth,
        height: newHeight
      });
    }, 300);
  }, [currentLayer, updateTextLayer, width, height]);

  // Gestione input ottimizzata
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextValue(newText);
    debouncedSave(newText);
  };

  // Gestione paste ottimizzata
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Il textarea gestisce automaticamente il paste, aggiorniamo solo il salvataggio
    setTimeout(() => {
      if (textRef.current) {
        const newText = textRef.current.value;
        setTextValue(newText);
        debouncedSave(newText);
      }
    }, 0);
  };

  // Gestione tasti semplificata
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setIsEditing(false);
      // Ripristina al valore originale
      const originalValue = initialValueRef.current || value || "";
      setTextValue(originalValue);
      return;
    }
    
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      handleBlur();
      return;
    }

    // Shortcuts di formattazione (ora non interferiscono con il cursore)
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      e.stopPropagation();
      const newWeight = fontWeight === 'bold' ? 'normal' : 'bold';
      updateTextLayer({ fontWeight: newWeight });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      e.stopPropagation();
      const newSize = Math.min(fontSize + 2, TEXT_CONFIG.fontSize.max);
      updateTextLayer({ fontSize: newSize });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      e.stopPropagation();
      const newSize = Math.max(fontSize - 2, TEXT_CONFIG.fontSize.min);
      updateTextLayer({ fontSize: newSize });
      return;
    }
  };

  // Uscita dall'editing ottimizzata
  const handleBlur = () => {
    setIsEditing(false);
    
    // Ottieni il valore attuale dal textarea se disponibile
    const finalText = textRef.current?.value || textValue;
    
    // Cancella eventuali salvataggi pendenti
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Calcola dimensioni
    let newWidth = width;
    let newHeight = height;
    
    if (initialDimensionsRef.current) {
      // Preserva dimensioni manuali
      newWidth = initialDimensionsRef.current.width;
      newHeight = initialDimensionsRef.current.height;
    } else {
      // Calcola automaticamente
      const currentFontSize = currentLayer.fontSize || TEXT_CONFIG.fontSize.default;
      const currentFontWeight = currentLayer.fontWeight || "normal";
      const calculated = calculateRequiredSize(finalText, currentFontSize, currentFontWeight);
      newWidth = calculated.width;
      newHeight = calculated.height;
    }
    
    // Salva immediatamente
    updateTextLayer({
      value: finalText,
      width: newWidth,
      height: newHeight
    });
  };

  // Gestione click per editing
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const now = Date.now();
    const timeDiff = now - lastClickTime;
    
    if (timeDiff < 300 && !isEditing) {
      // Doppio click: entra in modalità editing
      setIsEditing(true); // Non aggiornare textValue qui, sarà fatto dall'effetto
    }
    
    setLastClickTime(now);
  };

  // Gestione pointer events
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) {
      e.stopPropagation();
      return;
    }
    onPointerDown(e, id);
  };

  // Auto-start editing per nuovi testi (una volta sola)
  useEffect(() => {
    if (!value || value === "Testo") {
      setTimeout(() => {
        setTextValue(value || "Testo");
        setIsEditing(true);
      }, 100);
    }
  }, []); // Esegue solo al mount

  // Gestione focus e selezione quando entra in editing
  useEffect(() => {
    if (isEditing && textRef.current) {
      const textarea = textRef.current;
      
      // Focus immediato senza timeout
      textarea.focus();
      
      // Seleziona tutto se è testo di default
      if (value === "Testo" || !value) {
        textarea.select();
      } else {
        // Posiziona il cursore alla fine
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }
    }
  }, [isEditing]); // Solo quando cambia isEditing
  
  // Aggiornamento stili in tempo reale durante editing (preserva cursore)
  useEffect(() => {
    if (isEditing && textRef.current) {
      const textarea = textRef.current;
      
      // Salva posizione cursore
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      
      // Aggiorna solo gli stili necessari senza ricreare l'elemento
      textarea.style.fontSize = `${fontSize}px`;
      textarea.style.fontWeight = fontWeight;
      textarea.style.fontStyle = fontStyle;
      textarea.style.textDecoration = textDecoration;
      textarea.style.textAlign = textAlign;
      textarea.style.lineHeight = lineHeight.toString();
      textarea.style.letterSpacing = `${letterSpacing}px`;
      textarea.style.textTransform = textTransform;
      textarea.style.textShadow = textShadow ? "1px 1px 2px rgba(0,0,0,0.3)" : "none";
      textarea.style.color = textColor;
      
      // Ripristina posizione cursore
      textarea.setSelectionRange(selectionStart, selectionEnd);
    }
  }, [isEditing, fontSize, fontWeight, fontStyle, textDecoration, textAlign, letterSpacing, lineHeight, textTransform, textShadow, fill]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <foreignObject
      data-layer-id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      style={{
        outline: isEditing 
          ? "2px solid #3b82f6" 
          : selectionColor 
            ? `1px solid ${selectionColor}` 
            : "none",
        outlineOffset: isEditing ? "2px" : "0px",
        borderRadius: isEditing ? "4px" : "0px"
      }}
    >
      <div xmlns="http://www.w3.org/1999/xhtml"
        className={cn(
          "w-full h-full flex",
          verticalAlign === "top" ? "items-start" : 
          verticalAlign === "middle" ? "items-center" : 
          "items-end",
          textAlign === "left" ? "justify-start" :
          textAlign === "center" ? "justify-center" :
          textAlign === "right" ? "justify-end" :
          "justify-start",
          isEditing ? "cursor-text" : "cursor-pointer"
        )}
        onClick={handleClick}
      >
        {isEditing ? (
          <textarea
            key="text-editing" // Key stabile per preservare l'elemento
            ref={textRef}
            className="w-full h-full outline-none resize-none bg-transparent border-none"
            style={{
              fontSize: `${fontSize}px !important`,
              fontWeight,
              fontStyle,
              textDecoration,
              color: textColor,
              padding: `${TEXT_CONFIG.padding}px`,
              textAlign: textAlign as any,
              lineHeight: lineHeight,
              letterSpacing: `${letterSpacing}px`,
              textTransform: textTransform as any,
              textShadow: textShadow ? "1px 1px 2px rgba(0,0,0,0.3)" : "none",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              fontFamily,
              minHeight: "100%",
              boxSizing: "border-box",
              display: "block",
              width: "100%",
              height: "100%"
            }}
            value={textValue}
            onChange={handleInput}
            onBlur={handleBlur}
          onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            autoFocus
            spellCheck={false}
          />
        ) : (
          <div
            className="w-full h-full whitespace-pre-wrap break-words"
          style={{
              fontSize: `${fontSize}px`,
              fontWeight,
              fontStyle,
              textDecoration,
              color: textColor,
              padding: `${TEXT_CONFIG.padding}px`,
              textAlign: textAlign as any,
              lineHeight: lineHeight,
              letterSpacing: `${letterSpacing}px`,
              textTransform: textTransform as any,
              textShadow: textShadow ? "1px 1px 2px rgba(0,0,0,0.3)" : "none",
              userSelect: "none",
              wordBreak: "break-word",
            overflowWrap: "break-word",
              fontFamily,
              minHeight: "100%",
              display: "flex",
              alignItems: verticalAlign === "top" ? "flex-start" : 
                        verticalAlign === "middle" ? "center" : 
                        "flex-end",
              justifyContent: textAlign === "left" ? "flex-start" :
                             textAlign === "center" ? "center" :
                             textAlign === "right" ? "flex-end" :
                             "flex-start"
            }}
          >
            {value || "Testo"}
          </div>
        )}
      </div>
    </foreignObject>
  );
};
