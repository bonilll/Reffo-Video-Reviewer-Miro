"use client";

import React from "react";
import { 
  useResourcePermissions, 
  useSharingPermissions, 
  useDangerousPermissions,
  ResourceType, 
  Permission, 
  Role 
} from "@/hooks/use-resource-permissions";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Crown, 
  Edit, 
  Eye, 
  Share, 
  Trash, 
  Settings,
  Shield,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleBasedUIProps {
  resourceType: ResourceType;
  resourceId: string | Id<any> | null | undefined;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Role badge that shows the user's current access level
 */
export function RoleBadge({ 
  resourceType, 
  resourceId, 
  className 
}: RoleBasedUIProps) {
  const { userRole, isLoading, isShared } = useResourcePermissions(resourceType, resourceId);

  if (isLoading) {
    return <Badge variant="secondary" className={cn("animate-pulse", className)}>Loading...</Badge>;
  }

  if (!userRole) {
    return <Badge variant="destructive" className={className}>No Access</Badge>;
  }

  const roleConfig = {
    owner: { 
      label: "Owner", 
      icon: Crown, 
      variant: "default" as const,
      className: "bg-purple-100 text-purple-800 border-purple-200"
    },
    editor: { 
      label: "Editor", 
      icon: Edit, 
      variant: "secondary" as const,
      className: "bg-blue-100 text-blue-800 border-blue-200"
    },
    viewer: { 
      label: "Viewer", 
      icon: Eye, 
      variant: "outline" as const,
      className: "bg-gray-100 text-gray-800 border-gray-200"
    }
  };

  const config = roleConfig[userRole];
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant} 
      className={cn(config.className, "flex items-center gap-1", className)}
    >
      <Icon className="h-3 w-3" />
      {config.label}
      {isShared && <span className="text-xs opacity-75">(Shared)</span>}
    </Badge>
  );
}

/**
 * Toolbar that adapts based on user permissions
 */
export function PermissionAwareToolbar({ 
  resourceType, 
  resourceId,
  onShare,
  onEdit,
  onDelete,
  onSettings,
  className 
}: RoleBasedUIProps & {
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSettings?: () => void;
}) {
  const permissions = useResourcePermissions(resourceType, resourceId);
  const sharingPerms = useSharingPermissions(resourceType, resourceId);
  const dangerousPerms = useDangerousPermissions(resourceType, resourceId);

  if (permissions.isLoading) {
    return (
      <div className={cn("flex gap-2", className)}>
        <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
        <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  if (!permissions.canRead) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Edit button - for editors and owners */}
      {permissions.canWrite && onEdit && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onEdit}
          className="flex items-center gap-1"
        >
          <Edit className="h-3 w-3" />
          Edit
        </Button>
      )}

      {/* Share button - only for owners */}
      {sharingPerms.canShare && onShare && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onShare}
          className="flex items-center gap-1"
        >
          <Share className="h-3 w-3" />
          Share
        </Button>
      )}

      {/* Settings button - only for owners */}
      {permissions.isOwner && onSettings && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onSettings}
          className="flex items-center gap-1"
        >
          <Settings className="h-3 w-3" />
          Settings
        </Button>
      )}

      {/* Delete button - only for owners */}
      {dangerousPerms.canDelete && onDelete && (
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={onDelete}
          className="flex items-center gap-1"
        >
          <Trash className="h-3 w-3" />
          Delete
        </Button>
      )}
    </div>
  );
}

/**
 * Status indicator showing access level and warnings
 */
export function AccessStatusIndicator({ 
  resourceType, 
  resourceId, 
  showDetails = false,
  className 
}: RoleBasedUIProps & {
  showDetails?: boolean;
}) {
  const permissions = useResourcePermissions(resourceType, resourceId);

  if (permissions.isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-gray-500", className)}>
        <Shield className="h-4 w-4 animate-pulse" />
        Checking access...
      </div>
    );
  }

  if (permissions.isError) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-red-600", className)}>
        <AlertCircle className="h-4 w-4" />
        Access check failed
      </div>
    );
  }

  if (!permissions.canRead) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-red-600", className)}>
        <AlertCircle className="h-4 w-4" />
        No access
      </div>
    );
  }

  const getStatusColor = () => {
    if (permissions.isOwner) return "text-purple-600";
    if (permissions.isEditor) return "text-blue-600";
    if (permissions.isViewer) return "text-gray-600";
    return "text-gray-500";
  };

  const getStatusIcon = () => {
    if (permissions.isOwner) return Crown;
    if (permissions.isEditor) return Edit;
    if (permissions.isViewer) return Eye;
    return Shield;
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className={cn("flex items-center gap-2 text-sm", getStatusColor(), className)}>
      <StatusIcon className="h-4 w-4" />
      <span className="capitalize">{permissions.userRole}</span>
      {permissions.isShared && <span className="text-xs opacity-75">(Shared)</span>}
      
      {showDetails && (
        <div className="ml-2 text-xs text-gray-500">
          {permissions.canWrite ? "Can edit" : "Read only"}
        </div>
      )}
    </div>
  );
}

/**
 * Permission summary for debugging or admin interfaces
 */
export function PermissionSummary({ 
  resourceType, 
  resourceId, 
  className 
}: RoleBasedUIProps) {
  const permissions = useResourcePermissions(resourceType, resourceId);

  if (!permissions.canRead) {
    return null;
  }

  const permissionList = [
    { name: "Read", granted: permissions.canRead },
    { name: "Write", granted: permissions.canWrite },
    { name: "Share", granted: permissions.canShare },
    { name: "Delete", granted: permissions.canDelete },
    { name: "Admin", granted: permissions.canAdmin }
  ];

  return (
    <div className={cn("grid grid-cols-5 gap-2 p-3 bg-gray-50 rounded-lg text-xs", className)}>
      {permissionList.map((perm) => (
        <div 
          key={perm.name}
          className={cn(
            "flex items-center justify-center p-1 rounded",
            perm.granted 
              ? "bg-green-100 text-green-800" 
              : "bg-gray-200 text-gray-500"
          )}
        >
          {perm.name}
        </div>
      ))}
    </div>
  );
}

/**
 * Adaptive menu that shows different options based on permissions
 */
export function PermissionAwareMenu({ 
  resourceType, 
  resourceId,
  actions,
  className 
}: RoleBasedUIProps & {
  actions: Array<{
    label: string;
    permission: Permission;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
    variant?: "default" | "destructive";
  }>;
}) {
  const permissions = useResourcePermissions(resourceType, resourceId);

  if (!permissions.canRead) {
    return null;
  }

  const availableActions = actions.filter(action => 
    permissions.hasPermission(action.permission)
  );

  if (availableActions.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {availableActions.map((action, index) => {
        const Icon = action.icon;
        return (
          <Button
            key={index}
            variant={action.variant === "destructive" ? "destructive" : "ghost"}
            size="sm"
            onClick={action.onClick}
            className="justify-start"
          >
            {Icon && <Icon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        );
      })}
    </div>
  );
} 