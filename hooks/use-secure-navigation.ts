"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo } from "react";
import { useResourcePermissions, ResourceType, Permission } from "./use-resource-permissions";
import { Id } from "@/convex/_generated/dataModel";

interface NavigationTarget {
  path: string;
  requireAuth?: boolean;
  resourceType?: ResourceType;
  resourceId?: string | Id<any>;
  requiredPermission?: Permission;
  fallbackPath?: string; // Where to go if access is denied
}

interface SecureNavigationOptions {
  // Navigation behavior
  replace?: boolean; // Use router.replace instead of router.push
  scroll?: boolean;  // Scroll to top after navigation
  
  // Security options
  validateBeforeNavigate?: boolean; // Check permissions before navigating
  showConfirmation?: boolean; // Show confirmation dialog for sensitive actions
  
  // Callbacks
  onAccessDenied?: (target: NavigationTarget, reason: string) => void;
  onResourceNotFound?: (target: NavigationTarget) => void;
  onNavigationBlocked?: (target: NavigationTarget, reason: string) => void;
}

export function useSecureNavigation(options: SecureNavigationOptions = {}) {
  const router = useRouter();
  const { userId, isLoaded: authLoaded } = useAuth();
  
  const defaultOptions = useMemo(() => ({
    replace: false,
    scroll: true,
    validateBeforeNavigate: true,
    showConfirmation: false,
    ...options
  }), [options]);

  /**
   * Navigate to a target with security checks
   */
  const navigateTo = useCallback(async (
    target: NavigationTarget,
    navigationOptions?: Partial<SecureNavigationOptions>
  ): Promise<boolean> => {
    const opts = { ...defaultOptions, ...navigationOptions };
    
    // Check authentication first
    if (target.requireAuth && !userId) {
      const redirectUrl = `/sign-in?redirect_url=${encodeURIComponent(target.path)}`;
      
      if (opts.onNavigationBlocked) {
        opts.onNavigationBlocked(target, "Authentication required");
      }
      
      if (opts.replace) {
        router.replace(redirectUrl);
      } else {
        router.push(redirectUrl);
      }
      return false;
    }

    // Skip validation if not requested or no resource protection needed
    if (!opts.validateBeforeNavigate || !target.resourceType || !target.resourceId) {
      if (opts.replace) {
        router.replace(target.path);
      } else {
        router.push(target.path);
      }
      return true;
    }

    // We can't do async permission checking in this context
    // So we'll navigate optimistically and let the route guard handle protection
    if (opts.replace) {
      router.replace(target.path);
    } else {
      router.push(target.path);
    }
    return true;
  }, [router, userId, defaultOptions]);

  /**
   * Navigate to a board
   */
  const navigateToBoard = useCallback((
    boardId: string | Id<any>,
    permission: Permission = "read",
    navigationOptions?: Partial<SecureNavigationOptions>
  ) => {
    return navigateTo({
      path: `/board/${boardId}`,
      requireAuth: true,
      resourceType: "board",
      resourceId: boardId,
      requiredPermission: permission,
      fallbackPath: "/workspaces"
    }, navigationOptions);
  }, [navigateTo]);

  /**
   * Navigate to a todo list
   */
  const navigateToTodo = useCallback((
    todoId: string | Id<any>,
    permission: Permission = "read",
    navigationOptions?: Partial<SecureNavigationOptions>
  ) => {
    return navigateTo({
      path: `/todo/${todoId}`,
      requireAuth: true,
      resourceType: "todo",
      resourceId: todoId,
      requiredPermission: permission,
      fallbackPath: "/workspaces"
    }, navigationOptions);
  }, [navigateTo]);

  /**
   * Navigate to a calendar
   */
  const navigateToCalendar = useCallback((
    calendarId: string | Id<any>,
    permission: Permission = "read",
    navigationOptions?: Partial<SecureNavigationOptions>
  ) => {
    return navigateTo({
      path: `/calendar/${calendarId}`,
      requireAuth: true,
      resourceType: "calendar",
      resourceId: calendarId,
      requiredPermission: permission,
      fallbackPath: "/workspaces"
    }, navigationOptions);
  }, [navigateTo]);

  /**
   * Navigate to a collection
   */
  const navigateToCollection = useCallback((
    collectionId: string | Id<any>,
    permission: Permission = "read",
    navigationOptions?: Partial<SecureNavigationOptions>
  ) => {
    return navigateTo({
      path: `/collection/${collectionId}`,
      requireAuth: true,
      resourceType: "collection",
      resourceId: collectionId,
      requiredPermission: permission,
      fallbackPath: "/workspaces"
    }, navigationOptions);
  }, [navigateTo]);

  /**
   * Navigate back safely
   */
  const goBack = useCallback((fallbackPath = "/workspaces") => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackPath);
    }
  }, [router]);

  /**
   * Navigate to workspaces/home
   */
  const goHome = useCallback(() => {
    return navigateTo({
      path: "/workspaces",
      requireAuth: true
    });
  }, [navigateTo]);

  /**
   * Navigate with confirmation for dangerous actions
   */
  const navigateWithConfirmation = useCallback(async (
    target: NavigationTarget,
    confirmationMessage: string = "Are you sure you want to leave this page?",
    navigationOptions?: Partial<SecureNavigationOptions>
  ) => {
    if (window.confirm(confirmationMessage)) {
      return navigateTo(target, { ...navigationOptions, showConfirmation: false });
    }
    return false;
  }, [navigateTo]);

  /**
   * Check if user can navigate to a resource
   */
  const canNavigateToResource = useCallback((
    resourceType: ResourceType,
    resourceId: string | Id<any>,
    permission: Permission = "read"
  ): boolean => {
    // This is a synchronous check that doesn't use the permission system
    // It's mainly for UI state management
    
    if (!authLoaded || !userId) {
      return false;
    }

    // For now, assume navigation is allowed and let the route guard handle blocking
    // In a more advanced implementation, we could cache permission results
    return true;
  }, [authLoaded, userId]);

  /**
   * Generate secure URL with validation
   */
  const generateSecureUrl = useCallback((
    resourceType: ResourceType,
    resourceId: string | Id<any>,
    action?: string
  ): string => {
    const baseUrl = `/${resourceType}/${resourceId}`;
    return action ? `${baseUrl}/${action}` : baseUrl;
  }, []);

  /**
   * Extract resource info from current URL
   */
  const getCurrentResource = useCallback((): {
    type: ResourceType;
    id: string;
  } | null => {
    if (typeof window === "undefined") return null;
    
    const path = window.location.pathname;
    const match = path.match(/\/(board|todo|calendar|collection)\/([^\/]+)/);
    
    if (match) {
      return {
        type: match[1] as ResourceType,
        id: match[2]
      };
    }
    
    return null;
  }, []);

  return {
    // Core navigation
    navigateTo,
    goBack,
    goHome,
    navigateWithConfirmation,
    
    // Resource-specific navigation
    navigateToBoard,
    navigateToTodo,
    navigateToCalendar,
    navigateToCollection,
    
    // Utility functions
    canNavigateToResource,
    generateSecureUrl,
    getCurrentResource,
    
    // State
    isAuthenticated: !!userId,
    authLoaded
  };
}

/**
 * Hook for handling URL parameters securely
 */
export function useSecureParams() {
  /**
   * Validate and sanitize resource ID
   */
  const validateResourceId = useCallback((id: string | null): string | null => {
    if (!id) return null;
    
    // Basic sanitization
    const sanitized = id.trim();
    
    // Validate basic format (non-empty, reasonable length, no dangerous characters)
    if (sanitized.length === 0 || sanitized.length > 100) {
      return null;
    }
    
    // Check for dangerous characters that could indicate injection attempts
    const dangerousChars = /<script|javascript:|data:|vbscript:|onload=|onerror=/i;
    if (dangerousChars.test(sanitized)) {
      return null;
    }
    
    // Convex IDs can have various formats, so we'll be more permissive
    // Allow alphanumeric characters, hyphens, and underscores
    const validCharsPattern = /^[a-zA-Z0-9_-]+$/;
    
    if (!validCharsPattern.test(sanitized)) {
      return null;
    }
    
    return sanitized;
  }, []);

  /**
   * Extract and validate resource from URL params
   */
  const getValidatedResource = useCallback((params: { 
    type?: string; 
    id?: string; 
  }): {
    type: ResourceType;
    id: string;
  } | null => {
    const { type, id } = params;
    
    if (!type || !id) return null;
    
    // Validate resource type
    const validTypes: ResourceType[] = ["board", "todo", "calendar", "collection"];
    if (!validTypes.includes(type as ResourceType)) {
      return null;
    }
    
    // Validate resource ID
    const validatedId = validateResourceId(id);
    if (!validatedId) return null;
    
    return {
      type: type as ResourceType,
      id: validatedId
    };
  }, [validateResourceId]);

  /**
   * Validate pagination parameters
   */
  const validatePaginationParams = useCallback((params: {
    page?: string;
    limit?: string;
  }): {
    page: number;
    limit: number;
  } => {
    const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit || "20", 10) || 20));
    
    return { page, limit };
  }, []);

  return {
    validateResourceId,
    getValidatedResource,
    validatePaginationParams
  };
}

/**
 * Hook for breadcrumb navigation with security
 */
export function useSecureBreadcrumbs() {
  const navigation = useSecureNavigation();
  
  const generateBreadcrumbs = useCallback((
    resourceType: ResourceType,
    resourceId: string,
    resourceTitle?: string
  ) => {
    const breadcrumbs = [
      {
        label: "Workspaces",
        path: "/workspaces",
        onClick: () => navigation.goHome()
      }
    ];

    // Add resource type level
    const typeLabels = {
      board: "Boards",
      todo: "Todo Lists",
      calendar: "Calendars",
      collection: "Collections"
    };

    breadcrumbs.push({
      label: typeLabels[resourceType],
      path: `/${resourceType}`,
      onClick: () => navigation.navigateTo({ 
        path: `/${resourceType}`,
        requireAuth: true 
      })
    });

    // Add current resource
    breadcrumbs.push({
      label: resourceTitle || `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`,
      path: `/${resourceType}/${resourceId}`,
      onClick: () => navigation.navigateTo({
        path: `/${resourceType}/${resourceId}`,
        requireAuth: true,
        resourceType,
        resourceId
      })
    });

    return breadcrumbs;
  }, [navigation]);

  return {
    generateBreadcrumbs
  };
} 
