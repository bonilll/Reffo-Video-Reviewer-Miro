"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function useAccountManagement() {
  const { user, isLoaded } = useUser();
  const userId = user?.id;
  
  // State for MinIO backups
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  // Fetch backups from MinIO API
  useEffect(() => {
    if (!userId || !isLoaded) return;
    
    const fetchBackups = async () => {
      setBackupsLoading(true);
      try {
        const response = await fetch('/api/backup/auto-backup');
        if (response.ok) {
          const data = await response.json();
          setBackups(data.backups || []);
        }
      } catch (error) {
        console.error('Error fetching backups:', error);
      } finally {
        setBackupsLoading(false);
      }
    };

    fetchBackups();
  }, [userId, isLoaded]);

  // Get account deletion status
  const deletionStatus = useQuery(
    api.account.getAccountDeletionStatus,
    userId && isLoaded ? { userId } : "skip"
  );

  // Mutations
  const exportDataMutation = useMutation(api.account.exportUserData);
  const createBackupMutation = useMutation(api.account.createAccountBackup);
  const requestDeletionMutation = useMutation(api.account.requestAccountDeletion);
  const cancelDeletionMutation = useMutation(api.account.cancelAccountDeletion);

  // Export user data
  const exportUserData = async () => {
    if (!userId) {
      toast.error("You must be authenticated to export data");
      return null;
    }

    try {
      const data = await exportDataMutation({ userId });
      
      // Create downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reffo-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully");
      return data;
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.error("Failed to export data");
      return null;
    }
  };

  // Create account backup using MinIO API
  const createBackup = async (name?: string) => {
    if (!userId) {
      toast.error("You must be authenticated to create backup");
      return null;
    }

    try {
      const response = await fetch('/api/backup/auto-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Failed to create backup');
      }
      
      const result = await response.json();
      toast.success("Backup created and saved to MinIO successfully");
      
      // Refresh backups list
      const refreshResponse = await fetch('/api/backup/auto-backup');
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setBackups(data.backups || []);
      }
      
      return result.backup;
    } catch (error) {
      console.error("Error creating backup:", error);
      toast.error("Failed to create backup");
      return null;
    }
  };

  // Request account deletion
  const requestAccountDeletion = async (reason?: string) => {
    if (!userId) {
      toast.error("You must be authenticated to delete account");
      return null;
    }

    try {
      const result = await requestDeletionMutation({ userId, reason });
      toast.success(result.message);
      return result;
    } catch (error) {
      console.error("Error requesting account deletion:", error);
      toast.error("Failed to request account deletion");
      return null;
    }
  };

  // Cancel account deletion
  const cancelAccountDeletion = async () => {
    if (!userId) {
      toast.error("You must be authenticated to cancel deletion");
      return null;
    }

    try {
      const result = await cancelDeletionMutation({ userId });
      toast.success(result.message);
      return result;
    } catch (error) {
      console.error("Error cancelling account deletion:", error);
      toast.error("Failed to cancel account deletion");
      return null;
    }
  };

  return {
    // Data
    backups,
    deletionStatus,
    isLoading: !isLoaded || backupsLoading,
    
    // Actions
    exportUserData,
    createBackup,
    requestAccountDeletion,
    cancelAccountDeletion,
  };
} 