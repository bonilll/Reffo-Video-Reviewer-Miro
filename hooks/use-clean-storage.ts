import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { deleteAllUserMedia } from "@/lib/minio/deleteMedia";

export const useCleanStorage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const deleteUserMedia = useMutation(api.media.deleteAllUserMedia);
  
  const cleanUserStorage = async () => {
    try {
      setIsLoading(true);
      toast.loading("Pulizia dello storage in corso...");
      
      // 1. Elimina tutti i media dell'utente da Convex e ottieni gli URL
      const mediaUrls = await deleteUserMedia();
      
      // 2. Elimina i file da Firebase Storage
      if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
        await deleteAllUserMedia(mediaUrls as string[]);
        toast.dismiss();
        toast.success(`Pulizia completata! ${mediaUrls.length} file eliminati.`);
      } else {
        toast.dismiss();
        toast.success("Nessun file da eliminare.");
      }
      
      return true;
    } catch (error) {
      console.error("Errore durante la pulizia dello storage:", error);
      toast.dismiss();
      toast.error("Si è verificato un errore durante la pulizia dello storage.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  return {
    cleanUserStorage,
    isLoading
  };
}; 