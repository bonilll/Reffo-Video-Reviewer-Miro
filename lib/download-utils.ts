import { toast } from "sonner";
import { Reference } from "@/components/library/LibraryItem";

/**
 * Verifica se il codice è in esecuzione lato client
 */
const isClient = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Download a file from the specified URL
 * @param fileUrl URL of the file to download
 * @param fileName Suggested filename for the downloaded file
 * @returns Promise that resolves when the download is completed or fails
 */
export const downloadFile = async (fileUrl: string, fileName: string): Promise<boolean> => {
  // Non effettuare il download se siamo in server-side rendering
  if (!isClient) return false;
  
  try {
    if (!fileUrl) {
      console.error("File URL is empty");
      return false;
    }
    
    console.log(`Downloading file: ${fileUrl} as ${fileName}`);
    
    try {
      // Fetch the file first
      const response = await fetch(fileUrl, { 
        mode: 'cors',
        headers: { 'Accept': 'image/*, video/*' }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }
      
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      // Create a link element
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = objectUrl;
      link.download = fileName;
      
      // Trigger download through file manager
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        document.body.removeChild(link);
      }, 100);
      
      return true;
    } catch (error) {
      console.error("Error downloading file:", error);
      return false;
    }
  } catch (error) {
    console.error("Error in downloadFile:", error);
    return false;
  }
};

/**
 * Download a reference
 * @param reference Reference object to download
 * @returns Promise that resolves when the download is completed or fails
 */
export const downloadReference = async (reference: Reference): Promise<boolean> => {
  try {
    // Extract the filename or generate one
    const fileName = reference.fileName || `${reference.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${reference.fileUrl.split('.').pop() || ''}`;
    
    // Download the file
    const success = await downloadFile(reference.fileUrl, fileName);
    
    if (success) {
      toast.success(`Downloaded ${fileName}`);
    } else {
      toast.error("Error downloading file");
    }
    
    return success;
  } catch (error) {
    console.error("Error downloading reference:", error);
    toast.error("Error downloading reference");
    return false;
  }
};

/**
 * Download multiple references in sequence
 * @param references Array of references to download
 * @param options Options for multiple download
 * @returns Promise that resolves when all downloads are completed
 */
export const downloadMultipleReferences = async (
  references: Reference[],
  options: { 
    showToasts?: boolean,  // If true, shows toast for each file
    delay?: number         // Delay in ms between consecutive downloads
  } = {}
): Promise<{ total: number, successful: number, failed: number }> => {
  const { showToasts = true, delay = 500 } = options;
  
  let successful = 0;
  let failed = 0;
  
  if (references.length === 0) {
    if (showToasts) toast.info("No files to download");
    return { total: 0, successful, failed };
  }
  
  // Filter out invalid file types
  const validReferences = references.filter(ref => isValidFileTypeForDownload(ref.type));
  
  if (validReferences.length === 0) {
    if (showToasts) toast.error("No valid files to download");
    return { total: references.length, successful: 0, failed: references.length };
  }
  
  if (validReferences.length !== references.length && showToasts) {
    toast.warning(`${references.length - validReferences.length} files cannot be downloaded (unsupported format)`);
  }
  
  // Notifica l'inizio del download multiplo
  if (showToasts && validReferences.length > 1) {
    toast.info(`Starting download of ${validReferences.length} files`);
  }
  
  for (let i = 0; i < validReferences.length; i++) {
    const reference = validReferences[i];
    try {
      // Extract the filename or generate one
      const fileName = reference.fileName || `${reference.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${reference.fileUrl.split('.').pop() || ''}`;
      
      // Download the file
      const success = await downloadFile(reference.fileUrl, fileName);
      
      if (success) {
        successful++;
        if (showToasts && validReferences.length === 1) {
          toast.success("Download completed");
        }
      } else {
        failed++;
        if (showToasts && validReferences.length === 1) {
          toast.error("Error downloading file");
        }
      }
    } catch (error) {
      console.error("Error downloading reference:", error);
      failed++;
    }
    
    // Add a delay between downloads to avoid overwhelming the browser
    if (i < validReferences.length - 1 && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Notifica completamento
  if (showToasts && validReferences.length > 1) {
    if (failed === 0) {
      toast.success(`All ${successful} files have been downloaded`);
    } else if (successful === 0) {
      toast.error(`Download failed for all ${failed} files`);
    } else {
      toast.info(`Download completed: ${successful} successful, ${failed} failed`);
    }
  }
  
  return { total: references.length, successful, failed };
};

/**
 * Verifies if the file type is valid for download (image or video)
 * @param fileType File type
 * @returns true if the type is valid
 */
export const isValidFileTypeForDownload = (fileType?: string): boolean => {
  const mediaType = fileType || "image";
  const validTypes = ['image', 'img', 'video'];
  return validTypes.includes(mediaType.toLowerCase());
}; 