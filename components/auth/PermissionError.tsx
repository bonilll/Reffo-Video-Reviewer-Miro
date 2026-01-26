"use client";

import React from "react";
import { AlertTriangle, Lock, Eye, Edit, Share, Trash } from "lucide-react";
import { ResourceType, Permission, Role } from "@/hooks/use-resource-permissions";
import { cn } from "@/lib/utils";

interface PermissionErrorProps {
  error: string;
  resourceType: ResourceType;
  userRole?: Role | null;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
  suggestion?: string;
  className?: string;
  variant?: "default" | "subtle" | "card";
}

const permissionIcons = {
  read: Eye,
  write: Edit,
  share: Share,
  delete: Trash,
  admin: Lock
};

const resourceTypeLabels = {
  board: "board",
  todo: "todo list",
  calendar: "calendar",
  collection: "collection"
};

const roleLabels = {
  viewer: "Viewer",
  editor: "Editor", 
  owner: "Owner"
};

export function PermissionError({
  error,
  resourceType,
  userRole,
  requiredPermission,
  requiredPermissions,
  suggestion,
  className,
  variant = "default"
}: PermissionErrorProps) {
  const getPermissionIcon = (permission: Permission) => {
    const Icon = permissionIcons[permission];
    return Icon ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4" />;
  };

  const getVariantClasses = () => {
    switch (variant) {
      case "subtle":
        return "text-sm text-gray-600 p-2 bg-gray-50 rounded border-l-4 border-gray-300";
      case "card":
        return "p-4 bg-white border border-gray-200 rounded-lg shadow-sm";
      default:
        return "flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg";
    }
  };

  const getErrorMessage = () => {
    if (requiredPermission) {
      return `This action requires ${requiredPermission} permission on this ${resourceTypeLabels[resourceType]}.`;
    }
    
    if (requiredPermissions && requiredPermissions.length > 0) {
      const permissionList = requiredPermissions.join(", ");
      return `This action requires one of these permissions: ${permissionList}.`;
    }
    
    return error;
  };

  const getSuggestion = () => {
    if (suggestion) return suggestion;
    
    if (userRole === "viewer") {
      return "You have view-only access. Contact the owner to request edit permissions.";
    }
    
    if (userRole === "editor" && (requiredPermission === "share" || requiredPermission === "delete")) {
      return "Only the owner can perform this action.";
    }
    
    if (!userRole) {
      return "You don't have access to this resource. It may be private or you may need to be invited.";
    }
    
    return "Contact the resource owner if you believe you should have access.";
  };

  if (variant === "subtle") {
    return (
      <div className={cn(getVariantClasses(), className)}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-gray-500" />
          <span>{getErrorMessage()}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(getVariantClasses(), className)}>
      <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-medium text-yellow-800">Access Restricted</h3>
        <p className="text-yellow-700 text-sm mt-1">{getErrorMessage()}</p>
        
        {userRole && (
          <div className="mt-2 text-xs text-yellow-600">
            Your current role: <span className="font-medium">{roleLabels[userRole]}</span>
          </div>
        )}
        
        {requiredPermission && (
          <div className="mt-2 flex items-center gap-2 text-xs text-yellow-600">
            {getPermissionIcon(requiredPermission)}
            Required permission: <span className="font-medium">{requiredPermission}</span>
          </div>
        )}
        
        <p className="text-yellow-600 text-xs mt-3">{getSuggestion()}</p>
      </div>
    </div>
  );
}

/**
 * Lightweight permission error for inline usage
 */
export function InlinePermissionError({ 
  message = "Access denied",
  className 
}: { 
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-gray-500", className)}>
      <Lock className="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Permission error with action buttons
 */
export function ActionablePermissionError({
  error,
  resourceType,
  userRole,
  onRequestAccess,
  onContactOwner,
  className
}: PermissionErrorProps & {
  onRequestAccess?: () => void;
  onContactOwner?: () => void;
}) {
  return (
    <div className={cn("p-6 bg-white border border-gray-200 rounded-lg shadow-sm text-center", className)}>
      <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Access Required</h3>
      <p className="text-gray-600 mb-4">
        You don't have permission to access this {resourceTypeLabels[resourceType]}.
      </p>
      
      {userRole && (
        <p className="text-sm text-gray-500 mb-4">
          Current access level: <span className="font-medium">{roleLabels[userRole]}</span>
        </p>
      )}
      
      <div className="flex gap-3 justify-center">
        {onRequestAccess && (
          <button 
            onClick={onRequestAccess}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Request Access
          </button>
        )}
        {onContactOwner && (
          <button 
            onClick={onContactOwner}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
          >
            Contact Owner
          </button>
        )}
      </div>
    </div>
  );
} 