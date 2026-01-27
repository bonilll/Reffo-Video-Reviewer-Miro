export interface InitResponse {
  uploadId: string;
  key: string;
  bucket: string;
  endpoint: string;
  partSize: number;
  meta: {
    boardId: string | null;
    isPrivate: boolean;
    autoSaveToLibrary: boolean;
    context?: "review" | "board" | "library" | null;
    contextId?: string | null;
  };
}

export interface CompletePart { partNumber: number; eTag: string }

const getConvexAuthToken = async () => {
  if (typeof window === "undefined") return null;
  const clerk = (window as any).Clerk;
  const session = clerk?.session;
  if (!session?.getToken) return null;
  return await session.getToken({ template: "convex" });
};

const getApiBase = () => {
  const env = import.meta.env;
  if (typeof window !== "undefined" && env.VITE_UPLOAD_PROXY === "1") {
    return window.location.origin;
  }
  const rawBase =
    env.VITE_CONVEX_HTTP_URL ||
    env.VITE_CONVEX_SELF_HOSTED_URL ||
    env.VITE_CONVEX_URL;
  if (!rawBase) return "";
  return rawBase.includes(".convex.cloud")
    ? rawBase.replace(".convex.cloud", ".convex.site")
    : rawBase;
};

const fetchMultipart = async (path: string, body: unknown) => {
  const token = await getConvexAuthToken();
  if (!token) {
    throw new Error("Missing Clerk token for upload. Check CLERK_JWT_TEMPLATE=convex and Clerk configuration.");
  }
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await res.text();
    const statusLine = `${path} failed (${res.status})`;
    throw new Error(message ? `${statusLine}: ${message}` : statusLine);
  }
  return res.json();
};

export async function initMultipart(params: {
  fileName: string;
  contentType: string;
  fileSize: number;
  boardId?: string;
  isPrivate?: boolean;
  autoSaveToLibrary?: boolean;
  context?: "review" | "board" | "library";
  contextId?: string;
}): Promise<InitResponse> {
  return fetchMultipart("/api/upload/multipart/init", params);
}

export async function signPart(params: { key: string; uploadId: string; partNumber: number; contentType: string }): Promise<{ url: string }> {
  return fetchMultipart("/api/upload/multipart/sign-part", params);
}

export async function completeMultipart(params: {
  key: string;
  uploadId: string;
  parts: CompletePart[];
  contentType: string;
  fileName: string;
  fileSize: number;
  boardId?: string;
  isPrivate?: boolean;
  autoSaveToLibrary?: boolean;
  context?: "review" | "board" | "library";
  contextId?: string;
}): Promise<{ success: boolean; url: string; assetId?: string; imageId?: string }> {
  return fetchMultipart("/api/upload/multipart/complete", params);
}

export async function abortMultipart(params: { key: string; uploadId: string }) {
  return fetchMultipart("/api/upload/multipart/abort", params);
}

async function uploadPartWithRetry(
  url: string,
  blob: Blob,
  contentType: string,
  partNumber: number,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': contentType,
        },
      });

      if (!uploadRes.ok) {
        throw new Error(`HTTP ${uploadRes.status}`);
      }

      // Estrai l'ETag dalla risposta
      const eTag = uploadRes.headers.get('ETag')?.replaceAll('"', '');
      if (!eTag) {
        throw new Error('missing ETag');
      }

      return eTag;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Part ${partNumber} upload failed (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        // Attendi con backoff esponenziale prima di riprovare
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Part ${partNumber} failed after ${maxRetries} attempts: ${lastError?.message || 'unknown error'}`);
}

export async function uploadFileMultipart(
  file: File,
  opts: {
    boardId?: string;
    isPrivate?: boolean;
    autoSaveToLibrary?: boolean;
    context?: "review" | "board" | "library";
    contextId?: string;
    onProgress?: (p: number) => void;
    concurrency?: number;
  } = {}
) {
  const contentType = file.type || "application/octet-stream";
  const init = await initMultipart({
    fileName: file.name,
    contentType,
    fileSize: file.size,
    boardId: opts.boardId,
    isPrivate: opts.isPrivate,
    autoSaveToLibrary: opts.autoSaveToLibrary,
    context: opts.context,
    contextId: opts.contextId,
  });
  const partSize = init.partSize;
  const totalParts = Math.ceil(file.size / partSize);
  const parts: CompletePart[] = [];
  
  // Numero di parti da caricare in parallelo (3-5 è ottimale per la maggior parte dei casi)
  const concurrency = opts.concurrency || Math.min(5, Math.max(3, Math.ceil(totalParts / 10)));

  try {
    let uploadedBytes = 0;
    
    console.log(`📤 Starting multipart upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${totalParts} parts, ${concurrency} concurrent)`);
    
    // Upload parti in parallelo con controllo della concorrenza
    const uploadQueue: Promise<void>[] = [];
    let completed = 0;
    
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      const currentPartNumber = partNumber;

      // Crea promise per upload della parte
      const uploadPromise = (async () => {
        // Usa upload diretto a S3/MinIO tramite presigned URL
        // Questo bypassa Next.js ed evita il limite di 4.5MB
        const { url } = await signPart({ key: init.key, uploadId: init.uploadId, partNumber: currentPartNumber, contentType });
        
        const eTag = await uploadPartWithRetry(url, blob, contentType, currentPartNumber);
        parts.push({ partNumber: currentPartNumber, eTag });

        uploadedBytes += blob.size;
        completed++;
        const progress = Math.round((uploadedBytes / file.size) * 100);
        opts.onProgress?.(progress);
        
        if (completed % 10 === 0 || completed === totalParts) {
          console.log(`📊 Upload progress: ${completed}/${totalParts} parts (${progress}%)`);
        }
      })();

      uploadQueue.push(uploadPromise);

      // Limita la concorrenza: attendi quando raggiungiamo il limite
      if (uploadQueue.length >= concurrency || partNumber === totalParts) {
        await Promise.all(uploadQueue);
        uploadQueue.length = 0; // Svuota la coda
      }
    }

    // Attendi eventuali upload rimanenti
    if (uploadQueue.length > 0) {
      await Promise.all(uploadQueue);
    }

    // Ordina le parti per numero (importante per S3)
    parts.sort((a, b) => a.partNumber - b.partNumber);

    console.log(`✅ All parts uploaded successfully, completing multipart upload...`);
    const completedResult = await completeMultipart({
      key: init.key,
      uploadId: init.uploadId,
      parts,
      contentType,
      fileName: file.name,
      fileSize: file.size,
      boardId: opts.boardId,
      isPrivate: opts.isPrivate,
      autoSaveToLibrary: opts.autoSaveToLibrary,
      context: opts.context,
      contextId: opts.contextId,
    });
    console.log(`🎉 Upload completed: ${completedResult.url}`);
    return completedResult;
  } catch (e) {
    console.error(`❌ Upload failed, aborting multipart upload:`, e);
    try { await abortMultipart({ key: init.key, uploadId: init.uploadId }); } catch {}
    throw e;
  }
}
