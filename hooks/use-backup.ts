import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser, useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";

export const useBackup = () => {
  const { user } = useUser();
  const { organization } = useOrganization();
  const userId = user?.id;
  const orgId = organization?.id;
  
  const [isLoading, setIsLoading] = useState(false);
  const [backupResult, setBackupResult] = useState<any>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  
  // Recupera i dati per il backup
  const backupData = useQuery(
    api.backup.generateBackup, 
    userId ? { userId, orgId } : "skip"
  );
  
  // Mutation per ripristinare un backup
  const restore = useMutation(api.backup.restoreBackup);
  
  // Funzione per generare e scaricare il backup
  const generateAndDownloadBackup = async () => {
    try {
      if (!userId) {
        toast.error("Devi essere autenticato per generare un backup");
        return;
      }
      
      setIsLoading(true);
      
      // Usa i dati già ottenuti dalla query
      if (!backupData) {
        toast.error("Impossibile generare il backup in questo momento");
        return;
      }
      
      // Crea un blob JSON
      const jsonData = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      // Crea un link per il download
      const a = document.createElement("a");
      a.href = url;
      a.download = `reffo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Pulisci
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Backup scaricato con successo");
      setBackupResult({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("Errore durante la generazione del backup:", error);
      toast.error("Si è verificato un errore durante la generazione del backup");
      setBackupResult({ success: false, error });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Funzione per ripristinare da un file di backup
  const restoreFromFile = async (file: File) => {
    try {
      if (!userId) {
        toast.error("Devi essere autenticato per ripristinare un backup");
        return;
      }
      
      setIsLoading(true);
      
      // Leggi il file JSON
      const reader = new FileReader();
      
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error("Impossibile leggere il file"));
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
      
      // Converti la stringa in oggetto
      const backupData = JSON.parse(fileData);
      
      // Verifica che il backup sia valido
      if (!backupData || !backupData.schema_version || !backupData.data) {
        throw new Error("Formato del backup non valido");
      }
      
      // Richiama la mutation per ripristinare il backup
      const result = await restore({ 
        backupData, 
        userId, 
        orgId 
      });
      
      toast.success("Backup ripristinato con successo");
      setRestoreResult({ success: true, result });
      return result;
    } catch (error) {
      console.error("Errore durante il ripristino del backup:", error);
      toast.error("Si è verificato un errore durante il ripristino del backup");
      setRestoreResult({ success: false, error });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Saves data to a file and triggers download
   */
  const downloadAsFile = (data: string, filename: string) => {
    if (typeof document === 'undefined') return;
    
    try {
      // Create blob and URL
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      
      // Append to body, click and clean up
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Error creating backup file:', err);
    }
  };
  
  return {
    generateAndDownloadBackup,
    restoreFromFile,
    isLoading,
    backupData,
    backupResult,
    restoreResult
  };
}; 