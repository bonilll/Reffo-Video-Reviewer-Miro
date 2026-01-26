"use client";

import React from "react";
import { useResourcePermissions, ResourceType, Permission } from "@/hooks/use-resource-permissions";
import { Id } from "@/convex/_generated/dataModel";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PermissionError } from "./PermissionError";

interface PermissionGateProps {
  // Resource identification
  resourceType: ResourceType;
  resourceId: string | Id<any> | null | undefined;
  
  // Permission requirements
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean; // true = all permissions required, false = any permission required
  
  // Content
  children: React.ReactNode;
  fallback?: React.ReactNode; // What to show when permission is denied
  loadingComponent?: React.ReactNode; // What to show while loading
  errorComponent?: React.ReactNode; // What to show on error
  
  // Behavior
  hideOnNoAccess?: boolean; // If true, renders nothing instead of fallback
  showLoadingSpinner?: boolean; // Whether to show loading spinner
  
  // Advanced options
  enabled?: boolean; // Whether to run permission check
  onAccessDenied?: () => void; // Callback when access is denied
  onError?: (error: string) => void; // Callback on error
}

/**
 * PermissionGate - Conditionally renders content based on user permissions
 * 
 * @example
 * // Show content only to owners
 * <PermissionGate resourceType="board" resourceId={boardId} permission="delete">
 *   <DeleteButton />
 * </PermissionGate>
 * 
 * @example
 * // Show content to editors or owners
 * <PermissionGate 
 *   resourceType="todo" 
 *   resourceId={todoId} 
 *   permissions={["write", "admin"]}
 *   requireAll={false}
 * >
 *   <EditForm />
 * </PermissionGate>
 */
export function PermissionGate({
  resourceType,
  resourceId,
  permission,
  permissions,
  requireAll = false,
  children,
  fallback,
  loadingComponent,
  errorComponent,
  hideOnNoAccess = false,
  showLoadingSpinner = true,
  enabled = true,
  onAccessDenied,
  onError
}: PermissionGateProps) {
  const permissionCheck = useResourcePermissions(resourceType, resourceId, {
    enabled
  });

  // Handle loading state
  if (permissionCheck.isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    
    if (showLoadingSpinner) {
      return <LoadingSpinner className="h-4 w-4" />;
    }
    
    return null;
  }

  // Handle error state
  if (permissionCheck.isError) {
    if (onError) {
      onError(permissionCheck.error || "Permission check failed");
    }
    
    if (errorComponent) {
      return <>{errorComponent}</>;
    }
    
    return (
      <PermissionError 
        error={permissionCheck.error || "Permission check failed"}
        resourceType={resourceType}
        suggestion="Please check if you have access to this resource."
      />
    );
  }

  // Check permissions
  let hasRequiredPermissions = false;

  if (permission) {
    hasRequiredPermissions = permissionCheck.hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    if (requireAll) {
      hasRequiredPermissions = permissionCheck.hasAllPermissions(permissions);
    } else {
      hasRequiredPermissions = permissionCheck.hasAnyPermission(permissions);
    }
  } else {
    // If no specific permissions required, check if user has any access
    hasRequiredPermissions = permissionCheck.canRead;
  }

  // Handle access denied
  if (!hasRequiredPermissions) {
    if (onAccessDenied) {
      onAccessDenied();
    }
    
    if (hideOnNoAccess) {
      return null;
    }
    
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <PermissionError 
        error="Access denied"
        resourceType={resourceType}
        userRole={permissionCheck.userRole}
        requiredPermission={permission}
        requiredPermissions={permissions}
        suggestion="You don't have sufficient permissions to view this content."
      />
    );
  }

  // Render children if all checks pass
  return <>{children}</>;
}

/**
 * Quick access components for common permission patterns
 */

// Only owners can see this content
export function OwnerOnly({ 
  resourceType, 
  resourceId, 
  children, 
  fallback,
  hideOnNoAccess = true 
}: {
  resourceType: ResourceType;
  resourceId: string | Id<any> | null | undefined;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideOnNoAccess?: boolean;
}) {
  return (
    <PermissionGate 
      resourceType={resourceType}
      resourceId={resourceId}
      permissions={["delete", "share", "admin"]}
      requireAll={false}
      hideOnNoAccess={hideOnNoAccess}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

// Editors and owners can see this content
export function EditorAndOwner({ 
  resourceType, 
  resourceId, 
  children, 
  fallback,
  hideOnNoAccess = true 
}: {
  resourceType: ResourceType;
  resourceId: string | Id<any> | null | undefined;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideOnNoAccess?: boolean;
}) {
  return (
    <PermissionGate 
      resourceType={resourceType}
      resourceId={resourceId}
      permission="write"
      hideOnNoAccess={hideOnNoAccess}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

// Anyone with read access can see this content
export function ViewerAndAbove({ 
  resourceType, 
  resourceId, 
  children, 
  fallback,
  hideOnNoAccess = false 
}: {
  resourceType: ResourceType;
  resourceId: string | Id<any> | null | undefined;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideOnNoAccess?: boolean;
}) {
  return (
    <PermissionGate 
      resourceType={resourceType}
      resourceId={resourceId}
      permission="read"
      hideOnNoAccess={hideOnNoAccess}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
} 