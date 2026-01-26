"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useResourcePermissions, ResourceType, Permission } from "@/hooks/use-resource-permissions";
import { Id } from "@/convex/_generated/dataModel";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ActionablePermissionError } from "./PermissionError";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  resourceType?: ResourceType;
  resourceId?: string | Id<any> | null;
  requiredPermission?: Permission;
  showLoading?: boolean;
  showError?: boolean;
  onAccessDenied?: (reason: string) => void;
  onResourceNotFound?: () => void;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  unauthorizedComponent?: React.ReactNode;
}

export function RouteGuard({
  children,
  requireAuth = true,
  redirectTo = "/sign-in",
  resourceType,
  resourceId,
  requiredPermission,
  showLoading = true,
  showError = true,
  onAccessDenied,
  onResourceNotFound,
  loadingComponent,
  errorComponent,
  unauthorizedComponent,
}: RouteGuardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, isLoaded: authLoaded } = useAuth();

  const [showAccessRequestModal, setShowAccessRequestModal] = useState(false);
  const [showContactOwnerModal, setShowContactOwnerModal] = useState(false);

  const requestBoardAccess = useMutation(api.boards.requestBoardAccess);
  const contactBoardOwner = useMutation(api.boards.contactBoardOwner);

  const resourcePermissions = useResourcePermissions(
    resourceType as ResourceType,
    resourceId,
    {
      enabled: !!resourceType && !!resourceId && authLoaded,
    }
  );

  useEffect(() => {
    if (authLoaded && requireAuth && !userId) {
      const currentUrl = window.location.pathname + window.location.search;
      const redirectUrl = `${redirectTo}?redirect_url=${encodeURIComponent(currentUrl)}`;
      router.push(redirectUrl);
    }
  }, [authLoaded, requireAuth, userId, router, redirectTo]);

  useEffect(() => {
    if (resourceType && resourceId && !resourcePermissions.isLoading && !resourcePermissions.resourceExists) {
      if (onResourceNotFound) {
        onResourceNotFound();
      } else {
        router.push("/404");
      }
    }
  }, [resourceType, resourceId, resourcePermissions.isLoading, resourcePermissions.resourceExists, onResourceNotFound, router]);

  useEffect(() => {
    if (resourceType && resourceId && !resourcePermissions.isLoading) {
      if (requiredPermission && !resourcePermissions.hasPermission(requiredPermission)) {
        onAccessDenied?.("Access denied");
      }
    }
  }, [resourceType, resourceId, resourcePermissions, requiredPermission, onAccessDenied]);

  const handleRequestAccess = async (role: string, message: string) => {
    if (!resourceId) return;
    try {
      await requestBoardAccess({
        boardId: resourceId as Id<"boards">,
        requestedRole: role as "viewer" | "editor",
        message: message || undefined,
      });
      toast.success("Access request sent! The owner will be notified.");
    } catch (error) {
      console.error("Failed to request access:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send request");
    }
  };

  const handleContactOwner = async (message: string) => {
    if (!resourceId) return;
    try {
      await contactBoardOwner({
        boardId: resourceId as Id<"boards">,
        message: message,
      });
      toast.success("Message sent! The owner will be notified.");
    } catch (error) {
      console.error("Failed to contact owner:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    }
  };

  if (!authLoaded) {
    return showLoading ? (loadingComponent ?? <LoadingSpinner />) : null;
  }

  if (requireAuth && !userId) {
    return unauthorizedComponent ?? null;
  }

  if (resourceType && resourceId && requiredPermission) {
    if (resourcePermissions.isLoading) {
      return showLoading ? (loadingComponent ?? <LoadingSpinner />) : null;
    }

    if (!resourcePermissions.hasPermission(requiredPermission)) {
      if (!showError) return null;
      return (
        errorComponent ?? (
          <ActionablePermissionError
            resourceType="board"
            onRequestAccess={(role, message) => handleRequestAccess(role, message)}
            onContactOwner={(message) => handleContactOwner(message)}
            showAccessRequestModal={showAccessRequestModal}
            showContactOwnerModal={showContactOwnerModal}
            setShowAccessRequestModal={setShowAccessRequestModal}
            setShowContactOwnerModal={setShowContactOwnerModal}
          />
        )
      );
    }
  }

  return <>{children}</>;
}
