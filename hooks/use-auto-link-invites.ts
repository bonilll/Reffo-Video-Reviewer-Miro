"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Hook to automatically link pending project invites when user logs in
 */
export const useAutoLinkInvites = () => {
  const { userId, isLoaded } = useAuth();
  const linkInvites = useMutation(api.projects.linkPendingInvites);

  useEffect(() => {
    // Only run when auth is loaded and user is authenticated
    if (!isLoaded || !userId) {
      return;
    }

    // Check if we've already run this for this session
    const sessionKey = `invites_linked_${userId}`;
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }

    // Link pending invites
    linkInvites()
      .then((linkedCount) => {
        if (linkedCount && linkedCount > 0) {
        }
        // Mark as completed for this session
        sessionStorage.setItem(sessionKey, "true");
      })
      .catch((error) => {
        console.error("Error linking pending invites:", error);
      });
  }, [userId, isLoaded, linkInvites]);
};