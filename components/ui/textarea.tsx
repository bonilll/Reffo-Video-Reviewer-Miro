import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onEnterPressed?: () => void;
  submitOnEnter?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onEnterPressed, submitOnEnter = false, onKeyDown, ...props }, ref) => {
    // Gestisce l'evento keydown per catturare la pressione del tasto Invio
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Esegue l'handler personalizzato, se presente
      if (onKeyDown) {
        onKeyDown(e);
      }
      
      // Se è stato premuto Invio (senza Shift) e non è stato impedito il comportamento predefinito
      if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented && (submitOnEnter || onEnterPressed)) {
        e.preventDefault(); // Previeni il comportamento default (nuova linea)
        
        if (onEnterPressed) {
          // Esegue la callback personalizzata
          onEnterPressed();
        } else if (submitOnEnter && e.currentTarget.form) {
          // Altrimenti, invia il form se l'opzione submitOnEnter è abilitata
          e.currentTarget.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    };
    
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-input focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        data-no-zoom="true"
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea } 