import { useQuery } from "convex/react";
import { useUser, useOrganization } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

export const useStorageUsage = () => {
  const { user } = useUser();
  const { organization } = useOrganization();
  const userId = user?.id;
  const orgId = organization?.id;

  const storageData = useQuery(api.assets.getUserStorageUsage, 
    userId ? { userId, orgId } : "skip"
  );

  // Formatta le dimensioni in KB, MB o GB
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Formattazioni utili per l'interfaccia
  const formattedData = storageData ? {
    ...storageData,
    formattedUsed: formatSize(storageData.totalBytes),
    formattedTotal: formatSize(storageData.maxStorageBytes)
  } : null;

  return {
    isLoading: userId && storageData === undefined,
    storageData: formattedData,
  };
}; 