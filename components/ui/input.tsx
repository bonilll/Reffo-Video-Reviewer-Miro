import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onEnterPressed?: () => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onEnterPressed, onKeyDown, ...props }, ref) => {
    // Gestisce l'evento keydown per catturare la pressione del tasto Invio
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Esegue l'handler personalizzato, se presente
      if (onKeyDown) {
        onKeyDown(e);
      }
      
      // Se è stato premuto Invio e non è stato impedito il comportamento predefinito
      if (e.key === 'Enter' && !e.defaultPrevented) {
        if (onEnterPressed) {
          // Esegue la callback personalizzata
          onEnterPressed();
        } else if (e.currentTarget.form) {
          // Altrimenti, invia il form se l'input è all'interno di un form
          e.currentTarget.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    };
    
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-input focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        data-no-zoom="true"
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
