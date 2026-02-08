import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useToast } from "@/components/ui/use-toast";

export function useResetDatabase() {
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();
  
  // Prova con la versione completa prima
  let resetDatabaseMutation;
  try {
    // @ts-ignore - Prova a usare l'API generata prima
    resetDatabaseMutation = useMutation(api.admin.resetDatabase);
  } catch (e) {
    console.warn("Error loading resetDatabase from API:", e);
    
    // Fallback: prova ad utilizzare il path diretto
    try {
      // @ts-ignore - Dinamicamente accedi alla funzione resetDatabase
      resetDatabaseMutation = useMutation("admin:resetDatabase");
    } catch (e) {
      console.error("Reset database function not available via direct path:", e);
    }
  }
  
  // Prova con la versione semplificata come fallback
  let simpleResetMutation;
  try {
    // @ts-ignore - Usa la versione semplificata
    simpleResetMutation = useMutation(api.admin.resetDb);
  } catch (e) {
    console.warn("Error loading simple resetDb:", e);
  }

  const resetConvexDatabase = async (): Promise<boolean> => {
    
    // Prova prima la versione completa
    if (resetDatabaseMutation) {
      try {
        setIsResetting(true);
        const result = await resetDatabaseMutation();
        
        toast({
          title: "Database reset completato",
          description: `Reset completo eseguito con successo. Dettagli: ${JSON.stringify(result.details)}`,
          variant: "default",
        });
        
        return true;
      } catch (error) {
        console.error("Error with full reset:", error);
        // Continua con il tentativo di reset semplice
      }
    }
    
    // Se la versione completa fallisce, prova con quella semplice
    if (simpleResetMutation) {
      try {
        setIsResetting(true);
        const result = await simpleResetMutation();
        
        toast({
          title: "Test di reset completato",
          description: `Funzione di test eseguita con successo. Risultato: ${JSON.stringify(result)}`,
          variant: "default",
        });
        
        return true;
      } catch (error) {
        console.error("Error with simple reset:", error);
      }
    }
    
    // Se entrambi falliscono, mostra un errore
    if (!resetDatabaseMutation && !simpleResetMutation) {
      toast({
        title: "Reset function not available",
        description: "Nessuna funzione di reset del database è disponibile. Verifica che sia configurata correttamente in Convex.",
        variant: "destructive",
      });
      setIsResetting(false);
      return false;
    }
    
    setIsResetting(false);
    return false;
  };

  return {
    resetConvexDatabase,
    isResetting,
    // Esponi lo stato delle mutation per debugging
    resetMutationAvailable: !!resetDatabaseMutation,
    simpleResetAvailable: !!simpleResetMutation
  };
} 