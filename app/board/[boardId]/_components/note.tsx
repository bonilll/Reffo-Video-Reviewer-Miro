import { Libre_Franklin } from "next/font/google";
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";
import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, User } from "lucide-react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import { cn, colorToCSS, getContrastingTextColor } from "@/lib/utils";
import { useMutation, useSelf } from "@/liveblocks.config";
import type { NoteLayer } from "@/types/canvas";


const font = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Colori predefiniti per le sticky notes (stile FigJam)
const STICKY_COLORS = [
  { name: "Yellow", value: { r: 255, g: 235, b: 59 } }, // Material Yellow
  { name: "Pink", value: { r: 255, g: 182, b: 193 } }, // Light Pink
  { name: "Blue", value: { r: 144, g: 202, b: 249 } }, // Light Blue
  { name: "Green", value: { r: 165, g: 214, b: 167 } }, // Light Green
  { name: "Orange", value: { r: 255, g: 183, b: 77 } }, // Light Orange
  { name: "Purple", value: { r: 206, g: 147, b: 216 } }, // Light Purple
  { name: "Red", value: { r: 239, g: 154, b: 154 } }, // Light Red
  { name: "Teal", value: { r: 128, g: 203, b: 196 } }, // Light Teal
];

// Dimensioni base per le note (sempre quadrate)
const BASE_SIZE = 200;
const MIN_SIZE = 150;
const MAX_SIZE = 800; // Limite massimo per evitare note troppo grandi

// Funzione per pulire il testo da stili HTML
const cleanTextContent = (html: string): string => {
  if (!html) return '';
  
  // Rimuove tutti i tag HTML e mantiene solo il testo
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Estrae solo il testo senza formattazione
  let textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // Pulisce solo gli elementi problematici mantenendo spazi e a capo
  textContent = textContent
    .replace(/\u00A0/g, ' ') // Sostituisce spazi non-breaking con spazi normali
    .replace(/\r\n/g, '\n')  // Normalizza line endings Windows
    .replace(/\r/g, '\n')    // Normalizza line endings Mac
    .replace(/\t/g, ' ');    // Sostituisce tab con spazi
  
  return textContent;
};

// Calcolo semplificato della dimensione necessaria per il contenuto
const calculateRequiredSize = (text: string, currentSize: number, fontSize: number = 16): number => {
  if (!text || text.trim().length === 0) return BASE_SIZE;
  
  const padding = 32;
  const footerHeight = 40;
  const lineHeight = fontSize * 1.4;
  const avgCharWidth = fontSize * 0.6;
  
  // Calcolo semplificato: conta caratteri e righe
  const lines = text.split('\n');
  const totalChars = text.length;
  
  // Stima larghezza necessaria
  const estimatedWidth = Math.sqrt(totalChars * avgCharWidth * lineHeight);
  const requiredSize = Math.max(estimatedWidth + padding + footerHeight, MIN_SIZE);
  
  // Arrotonda a multipli di 20 per ridurre micro-aggiustamenti
  return Math.min(Math.ceil(requiredSize / 20) * 20, MAX_SIZE);
};

interface NoteProps {
  id: string;
  layer: NoteLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
  isSelected?: boolean;
  lastUsedColor?: { r: number; g: number; b: number };
}

export const Note = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
  isSelected = false,
  lastUsedColor = { r: 255, g: 235, b: 59 },
}: NoteProps) => {
  const { 
    x, y, width, height, fill, value, 
    fontSize = 16, fontWeight = "normal", 
    textAlign = "center", fontStyle = "normal", textDecoration = "none",
    fontFamily = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial",
    lastModifiedBy, lastModifiedAt, showMetadata = true 
  } = layer;
  
  // Stati per l'editing
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(value || "");
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  
  // Ref per il debouncing ottimizzato
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Utente corrente
  const currentUser = useSelf();
  const author = currentUser?.info?.name || "User";
  
  // Mutation unificata per aggiornare la nota
  const updateNote = useMutation(({ storage }, newValue: string, newSize?: number) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(id);
    if (layer) {
      const updateData: any = { 
        value: newValue,
        lastModifiedBy: currentUser?.info?.name || "User",
        lastModifiedAt: new Date().toISOString()
      };
      
      if (newSize && newSize !== width) {
        updateData.width = newSize;
        updateData.height = newSize;
      }
      
      layer.update(updateData);
    }
  }, [id, width, currentUser]);
  
  // Mutation per solo resize
  const resizeNote = useMutation(({ storage }, newSize: number) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(id);
    if (layer) {
      layer.update({ width: newSize, height: newSize });
    }
  }, [id]);
  
  // Mutation per aggiornare le proprietà della nota
  const updateNoteProperties = useMutation(({ storage }, updates: Partial<NoteLayer>) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(id);
    if (layer) {
      layer.update(updates);
    }
  }, [id]);
  
  // Colore della nota
  const backgroundColor = fill ? colorToCSS(fill) : colorToCSS(STICKY_COLORS[0].value);
  const textColor = getContrastingTextColor(fill);
  const shadowColor = `${backgroundColor}40`; // 25% opacity
  
  // Font size ora viene dal layer stesso (fontSize prop)
  
  // Ref per l'elemento contenteditable
  const contentEditableRef = useRef<HTMLDivElement>(null);
  
  // Funzioni per gestire la posizione del cursore
  const saveCursorPosition = useCallback(() => {
    if (!contentEditableRef.current) return null;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    return {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer, 
      endOffset: range.endOffset
    };
  }, []);
  
  const restoreCursorPosition = useCallback((position: any) => {
    if (!position || !contentEditableRef.current) return;
    
    try {
      const selection = window.getSelection();
      if (!selection) return;
      
      const range = document.createRange();
      range.setStart(position.startContainer, position.startOffset);
      range.setEnd(position.endContainer, position.endOffset);
      
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      // Se non riusciamo a ripristinare, non facciamo nulla
      console.warn('Could not restore cursor position:', error);
    }
  }, []);
  
  // Funzione per aggiornare il contenuto preservando il cursore
  const updateContentElement = useCallback((newContent: string, preserveCursor: boolean = false) => {
    if (!contentEditableRef.current || contentEditableRef.current.innerHTML === newContent) return;
    
    let cursorPosition = null;
    if (preserveCursor && isEditing) {
      cursorPosition = saveCursorPosition();
    }
    
    contentEditableRef.current.innerHTML = newContent;
    
    if (cursorPosition && isEditing) {
      // Ripristina il cursore dopo un breve delay
      setTimeout(() => restoreCursorPosition(cursorPosition), 0);
    }
  }, [isEditing, saveCursorPosition, restoreCursorPosition]);
  
  // Salvataggio ottimizzato per preservare il cursore
  const handleSave = (newContent: string, immediate: boolean = false) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    const performSave = () => {
      // Aggiorna lo stato interno solo se diverso
      if (content !== newContent) {
        setContent(newContent);
      }
      // Salva nel database
      updateNote(newContent);
    };
    
    if (immediate) {
      performSave();
    } else {
      saveTimeoutRef.current = setTimeout(performSave, 500);
    }
  };
  
  // Gestione input ottimizzata per preservare il cursore
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const htmlContent = e.currentTarget.innerHTML || '';
    const textContent = e.currentTarget.textContent || '';
    
    // IMPORTANTE: Non chiamare setContent qui per evitare loop di aggiornamenti
    // Il contenuto viene aggiornato solo al salvataggio
    
    // Salva il contenuto con debouncing
    handleSave(htmlContent, false);
    
    // Auto-resize debounced
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      const currentSize = Math.min(width, height);
      const optimalSize = calculateRequiredSize(textContent, currentSize, fontSize);
      
      if (Math.abs(optimalSize - currentSize) >= 30) {
        resizeNote(optimalSize);
      }
    }, 1000);
  };
  
  // Gestione del paste per mantenere solo testo
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    // Ottieni il testo senza formattazione
    const pastedText = e.clipboardData.getData('text/plain');
    
    // Inserisci il testo al cursore
    document.execCommand('insertText', false, pastedText);
  };
  
  // Salvataggio quando si esce dall'editing
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && (
      relatedTarget.closest('.selection-tools') || 
      relatedTarget.closest('.toolbar') ||
      relatedTarget.closest('[data-radix-popper-content-wrapper]')
    )) {
      return;
    }
    
    setIsEditing(false);
    
    // Ottieni il contenuto attuale dall'elemento
    const currentContent = e.currentTarget.innerHTML || '';
    const textContent = e.currentTarget.textContent || '';
    
    // Salva il contenuto finale
    handleSave(currentContent, true);
    
    // Applica resize finale se necessario
    const currentSize = Math.min(width, height);
    const optimalSize = calculateRequiredSize(textContent, currentSize, fontSize);
    
    if (Math.abs(optimalSize - currentSize) >= 30) {
      updateNote(currentContent, optimalSize);
    }
  };
  
  // Gestione semplificata dei tasti
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      setIsEditing(false);
      // Ripristina il contenuto originale
      const originalContent = value || "";
      setContent(originalContent);
      updateContentElement(originalContent, false);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // Ctrl/Cmd+Enter per uscire dall'editing
      const currentContent = e.currentTarget.innerHTML || '';
      setIsEditing(false);
      handleSave(currentContent, true);
    }
  };
  
  // Rimosso handleKeyPress - non più necessario
  
  // Gestione click sulla nota (non su testo)
  const handleNotePointerDown = (e: React.PointerEvent) => {
    // Se sono in modalità editing, mantieni sempre la selezione
    if (isEditing) {
      e.stopPropagation();
      // Assicurati che la nota rimanga selezionata anche durante l'editing
      if (!isSelected) {
        onPointerDown(e, id);
      }
      return;
    }
    
    // Altrimenti permetti il normale comportamento di drag/selezione
    onPointerDown(e, id);
  };
  
  // Gestione click sul contenuto editabile
  const handleContentPointerDown = (e: React.PointerEvent) => {
    if (isEditing) {
      // In modalità editing, blocca sempre la propagazione per permettere selezione testo
      e.stopPropagation();
    }
    // Se non è in editing, lascia che l'evento si propaghi per la selezione normale
  };

  // Gestione eventi di selezione del testo per mantenere la nota selezionata
  const handleTextSelection = useCallback((e: Event) => {
    if (isEditing && isSelected) {
      // Blocca la propagazione degli eventi di selezione
      e.stopPropagation();
    }
  }, [isEditing, isSelected]);

  // Aggiungi event listeners per gli eventi di selezione
  useEffect(() => {
    if (isEditing && contentEditableRef.current) {
      const element = contentEditableRef.current;
      
      // Eventi che potrebbero causare la deselezione della nota
      const events = ['selectstart', 'mousedown', 'mouseup', 'mousemove'];
      
      events.forEach(eventType => {
        element.addEventListener(eventType, handleTextSelection, { capture: true });
      });
      
      return () => {
        events.forEach(eventType => {
          element.removeEventListener(eventType, handleTextSelection, { capture: true });
        });
      };
    }
  }, [isEditing, handleTextSelection]);
  
  // Gestione del doppio click per editing
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Doppio click - entra in modalità editing
    setIsEditing(true);
    // Focus sull'elemento dopo un piccolo delay
    setTimeout(() => {
      if (contentEditableRef.current) {
        contentEditableRef.current.focus();
      }
    }, 10);
  };

  // Formattazione che preserva la posizione del cursore
  const applyFormatting = useCallback((command: string, value?: string) => {
    if (!isEditing || !contentEditableRef.current) return;
    
    contentEditableRef.current.focus();
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range && !range.collapsed) {
        // Salva la posizione prima della formattazione
        const cursorPosition = saveCursorPosition();
        
        // Applica la formattazione
        document.execCommand(command, false, value);
        
        // Ottieni il nuovo contenuto e salvalo
        const newContent = contentEditableRef.current.innerHTML;
        handleSave(newContent, false);
        
        // Ripristina il cursore se necessario
        if (cursorPosition) {
          setTimeout(() => restoreCursorPosition(cursorPosition), 0);
        }
      }
    }
  }, [isEditing, handleSave, saveCursorPosition, restoreCursorPosition]);

  // Sistema di formattazione semplificato - evita window global
  useEffect(() => {
    if (isEditing) {
      (window as any).applyNoteFormatting = applyFormatting;
    }
    
    return () => {
      if ((window as any).applyNoteFormatting === applyFormatting) {
        delete (window as any).applyNoteFormatting;
      }
    };
  }, [isEditing, applyFormatting]);
  
  // Cleanup dei timeout quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  // Effetto per sincronizzare il contenuto quando cambia il valore del layer
  useEffect(() => {
    if (!isEditing && value !== content) {
      const newContent = value || "";
      setContent(newContent);
      updateContentElement(newContent, false);
    }
  }, [value, isEditing, content, updateContentElement]);
  
  // Effetto per aggiornare l'elemento solo quando non in editing
  useEffect(() => {
    if (!isEditing) {
      updateContentElement(content, false);
    }
    // IMPORTANTE: Non aggiornare durante isEditing per evitare salto cursore
  }, [content, isEditing, updateContentElement]);
  
  // Effetto per gestire l'entrata in modalità editing
  useEffect(() => {
    if (isEditing && contentEditableRef.current) {
      // Imposta il contenuto solo all'entrata in editing
      const currentContent = content || value || "";
      if (contentEditableRef.current.innerHTML !== currentContent) {
        contentEditableRef.current.innerHTML = currentContent;
      }
      
      // Focus e posiziona cursore alla fine
      contentEditableRef.current.focus();
      
      // Posiziona il cursore alla fine solo all'inizio dell'editing
      setTimeout(() => {
        if (contentEditableRef.current) {
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(contentEditableRef.current);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 0);
    }
  }, [isEditing]); // Rimosso content dalle dependencies per evitare loop
  
  // Timestamp per il footer - usa lastModifiedAt se disponibile
  const displayDate = lastModifiedAt ? new Date(lastModifiedAt) : new Date();
  const timeString = format(displayDate, "HH:mm", { locale: enUS });
  const dateString = format(displayDate, "dd/MM", { locale: enUS });
  
  // Autore da visualizzare
  const displayAuthor = lastModifiedBy || "User";

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      onPointerDown={handleNotePointerDown}
      style={{
        outline: selectionColor ? `2px solid ${selectionColor}` : "none",
        outlineOffset: "2px",
      }}
    >
      <div
        className={cn(
          "h-full w-full flex flex-col relative cursor-pointer",
          font.className,
          isEditing && "cursor-text"
        )}
        style={{
          backgroundColor,
          color: textColor,
          borderRadius: "8px", // Bordi arrotondati per aspetto più friendly
          padding: "16px",
          border: `1px solid rgba(0, 0, 0, 0.08)`,
          transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.2s ease-out',
          overflow: 'hidden',
          boxShadow: isSelected 
            ? '0 8px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)'
            : '0 4px 15px rgba(0, 0, 0, 0.1)',
        }}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Indicatore di editing discreto */}
        {isEditing && (
          <div className="absolute top-2 left-2 w-2 h-2 bg-blue-500 rounded-full opacity-60" />
        )}
        
        {/* Contenuto principale */}
        <div className="flex-1 mb-3 note-content-no-scroll">
          <div
            ref={contentEditableRef}
            contentEditable={isEditing}
            spellCheck={false}
            onInput={handleInput}
            onPaste={handlePaste}
            onBlur={handleBlur}
          onKeyDown={handleKeyDown}
            onPointerDown={handleContentPointerDown}
          className={cn(
              "w-full h-full outline-none resize-none leading-relaxed",
              "break-words note-content-editable",
              !isEditing && "cursor-pointer select-none",
              isEditing && "cursor-text"
          )}
          style={{
              fontSize: `${fontSize}px`,
              fontWeight: fontWeight,
              textAlign: textAlign,
              fontStyle: fontStyle,
              textDecoration: textDecoration,
              minHeight: "60px",
              userSelect: isEditing ? "text" : "none",
              WebkitUserSelect: isEditing ? "text" : "none",
              MozUserSelect: isEditing ? "text" : "none",
              msUserSelect: isEditing ? "text" : "none",
              // Usa la fontFamily dal layer o fallback di sistema
              fontFamily: fontFamily,
              color: 'inherit',
              backgroundColor: 'transparent',
              // CSS specifico per gestire spazi e line breaks
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              wordWrap: 'break-word',
              // Assicura che gli spazi siano visibili
              display: 'block',
              width: '100%',
              height: '100%',
              // Proprietà aggiuntive per contenteditable
              minWidth: '0',
              overflow: 'hidden',
              overflowWrap: 'break-word',
              // Assicura che il contenuto sia editabile correttamente - permetti HTML per formattazione
              WebkitUserModify: isEditing ? 'read-write' : 'read-only',
            }}
          />
        </div>
        
        {/* Footer con autore e timestamp - più compatto */}
        {showMetadata && !isEditing && (
          <div 
            className="border-t pt-1 mt-auto flex-shrink-0"
            style={{
              borderColor: `${textColor}15`,
              fontSize: "9px",
              opacity: 0.6
            }}
          >
            <div className="flex items-center justify-between">
              <span className="truncate max-w-[80px]">{displayAuthor}</span>
              <span>{timeString}</span>
            </div>
          </div>
        )}
      </div>
      

    </foreignObject>
  );
};
