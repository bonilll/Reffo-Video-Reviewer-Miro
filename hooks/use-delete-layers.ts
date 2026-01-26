import { useSelf, useMutation } from "@/liveblocks.config";
import { LayerType } from "@/types/canvas";
import { deleteMediaByUrl } from "@/lib/minio/deleteMedia";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export const useDeleteLayers = () => {
  const selection = useSelf((me) => me.presence.selection);
  // Aggiunta della mutazione Convex per eliminare i media dal database
  const deleteMediaByUrlMutation = useConvexMutation(api.media.deleteByUrl);

  return useMutation(
    async ({ storage, setMyPresence }) => {
      const liveLayers = storage.get("layers");
      const liveLayerIds = storage.get("layerIds");

      // Array per memorizzare le promesse di eliminazione
      const deletePromises: Promise<void>[] = [];

      for (const id of selection) {
        // Ottieni il layer prima di eliminarlo per accedere alle sue proprietà
        const liveLayer = liveLayers.get(id);
        
        // Se il layer esiste, convertirlo in un oggetto standard
        if (liveLayer) {
          const layer = liveLayer.toObject();
          
          // Se il layer è di tipo immagine o video, elimina il file corrispondente da Firebase Storage
          if (layer && (layer.type === LayerType.Image || layer.type === LayerType.Video) && layer.url) {
            try {
              // Crea una funzione asincrona per eliminare il media nel database e poi il file
              const deleteProcess = async () => {
                try {
                  // Verifichiamo se esiste già un record per questo media e se è dalla libreria
                  // Per ora eliminiamo sempre il media, ma in futuro potremmo modificare questo comportamento
                  // Direttamente nella funzione deleteByUrl lato server

                  // Prima elimina il record dal database Convex
                  const urlToDelete = await deleteMediaByUrlMutation({ url: layer.url });
                  
                  // Se l'URL è null, significa che era un media importato dalla libreria e non deve essere eliminato da Firebase
                  if (urlToDelete) {
                    // Poi elimina il file da Firebase Storage
                    await deleteMediaByUrl(urlToDelete);
                    console.log(`Media eliminato da Firebase: ${layer.url}`);
                  } else {
                    console.log(`Media importato dalla libreria, non eliminato da Firebase: ${layer.url}`);
                  }
                } catch (error) {
                  console.error(`Errore nell'elaborazione del media ${layer.url}:`, error);
                  // Cattura l'errore qui per non bloccare la cancellazione del layer
                }
              };
              
              // Avvia il processo di eliminazione e aggiungi la promessa all'array
              deletePromises.push(deleteProcess());
            } catch (error) {
              console.error("Errore durante la preparazione dell'elaborazione:", error);
            }
          }
        }

        // Elimina il layer dalla struttura dati
        liveLayers.delete(id);

        const index = liveLayerIds.indexOf(id);
        if (index !== -1) {
          liveLayerIds.delete(index);
        }
      }

      // Aggiorna la presenza dell'utente (rimuovi la selezione)
      setMyPresence({ selection: [] }, { addToHistory: true });
      
      // Esegui tutte le operazioni di eliminazione in background
      Promise.all(deletePromises)
        .then(() => console.log("Tutti i file associati ai layer sono stati elaborati con successo"))
        .catch(error => console.error("Errori durante l'elaborazione dei file:", error));
    },
    [selection, deleteMediaByUrlMutation],
  );
};
