import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { MediaUploadResult } from "@/types/media";

// Configurazione Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export const uploadMedia = async (
  file: File,
  boardId: string,
  onProgress?: (progress: number) => void
): Promise<MediaUploadResult> => {
  // Verifica che il file sia un'immagine o un video
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Solo immagini e video sono supportati");
  }

  // Determina il tipo di media (ora usando stringa invece di enum)
  const type: string = file.type.startsWith("image/") ? "image" : "video";

  // Crea il riferimento al file in Firebase Storage
  const storagePath = `boards/${boardId}/${file.name}`;
  const storageRef = ref(storage, storagePath);

  // Esegui l'upload
  const uploadTask = uploadBytesResumable(storageRef, file);

  // Gestisci gli aggiornamenti dello stato di upload
  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        reject(error);
      },
      async () => {
        // Upload completato, ottieni l'URL pubblico
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        
        // Restituisci l'oggetto MediaUploadResult
        resolve({
          url,
          name: file.name,
          mimeType: file.type,
          type,
          size: file.size,
          boardId
        });
      }
    );
  });
}; 