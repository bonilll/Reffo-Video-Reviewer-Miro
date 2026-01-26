import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export type ResourceType = "board";
export type Permission = "read" | "write" | "share" | "delete" | "admin";
export type Role = "viewer" | "editor" | "owner";

interface UseResourcePermissionsResult {
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  userRole: Role | null;
  isOwner: boolean;
  isEditor: boolean;
  isViewer: boolean;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  resourceExists: boolean;
  isShared: boolean;
  projectId?: string | null;
}

export function useResourcePermissions(
  resourceType: ResourceType,
  resourceId: string | Id<any> | null | undefined,
  options?: { enabled?: boolean }
): UseResourcePermissionsResult {
  const enabled = options?.enabled !== false && !!resourceId && resourceType === "board";

  const boardPermissions = useQuery(
    api.boards.getBoardPermissions,
    enabled
      ? {
          boardId: resourceId as Id<"boards">,
        }
      : "skip"
  );

  return useMemo(() => {
    if (!enabled) {
      const hasPermission = () => false;
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        isOwner: false,
        isEditor: false,
        isViewer: false,
        isLoading: false,
        isError: false,
        error: null,
        hasPermission,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
        resourceExists: false,
        isShared: false,
        projectId: null,
      };
    }

    if (boardPermissions === undefined) {
      const hasPermission = () => false;
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        isOwner: false,
        isEditor: false,
        isViewer: false,
        isLoading: true,
        isError: false,
        error: null,
        hasPermission,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
        resourceExists: false,
        isShared: false,
        projectId: null,
      };
    }

    const role = (boardPermissions.userRole as Role) ?? null;
    const hasPermission = (permission: Permission) => {
      if (!boardPermissions.resourceExists) return false;
      switch (permission) {
        case "read":
          return boardPermissions.canRead;
        case "write":
          return boardPermissions.canWrite;
        case "share":
          return boardPermissions.canShare;
        case "delete":
          return boardPermissions.canDelete;
        case "admin":
          return boardPermissions.canAdmin;
        default:
          return false;
      }
    };

    return {
      canRead: boardPermissions.canRead,
      canWrite: boardPermissions.canWrite,
      canShare: boardPermissions.canShare,
      canDelete: boardPermissions.canDelete,
      canAdmin: boardPermissions.canAdmin,
      userRole: role,
      isOwner: role === "owner",
      isEditor: role === "editor",
      isViewer: role === "viewer",
      isLoading: false,
      isError: !boardPermissions.resourceExists && !boardPermissions.canRead,
      error: !boardPermissions.resourceExists ? "Board not found" : !boardPermissions.canRead ? "Access denied" : null,
      hasPermission,
      hasAnyPermission: (permissions) => permissions.some(hasPermission),
      hasAllPermissions: (permissions) => permissions.every(hasPermission),
      resourceExists: boardPermissions.resourceExists,
      isShared: role !== "owner" && role !== null,
      projectId: (boardPermissions as any).projectId ?? null,
    };
  }, [boardPermissions, enabled]);
}
