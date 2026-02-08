"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Home, Shield, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceType } from "@/hooks/use-resource-permissions";
import { useSecureNavigation } from "@/hooks/use-secure-navigation";
import { cn } from "@/lib/utils";

interface ErrorPageProps {
  title?: string;
  message?: string;
  suggestion?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  className?: string;
}

/**
 * Generic error page component
 */
export function ErrorPage({
  title = "Something went wrong",
  message = "An unexpected error occurred.",
  suggestion = "Please try again or contact support if the problem persists.",
  showBackButton = true,
  showHomeButton = true,
  className
}: ErrorPageProps) {
  const navigation = useSecureNavigation();

  return (
    <div className={cn("flex items-center justify-center min-h-screen bg-gray-50 p-4", className)}>
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600 mb-4">{message}</p>
          <p className="text-sm text-gray-500 mb-6">{suggestion}</p>
          
          <div className="flex gap-3 justify-center">
            {showBackButton && (
              <Button
                variant="outline"
                onClick={() => navigation.goBack()}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
            )}
            
            {showHomeButton && (
              <Button
                onClick={() => navigation.goHome()}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Workspaces
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 404 Not Found page
 */
export function NotFoundPage({ 
  resourceType,
  resourceId 
}: { 
  resourceType?: ResourceType;
  resourceId?: string;
}) {
  const navigation = useSecureNavigation();

  const getResourceLabel = (type: ResourceType) => {
    const labels = {
      board: "Board",
      todo: "Todo List",
      calendar: "Calendar",
      collection: "Collection"
    };
    return labels[type];
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {resourceType ? `${getResourceLabel(resourceType)} Not Found` : "Page Not Found"}
          </h1>
          
          <p className="text-gray-600 mb-4">
            {resourceType && resourceId ? (
              `The ${getResourceLabel(resourceType).toLowerCase()} you're looking for doesn't exist or has been deleted.`
            ) : (
              "The page you're looking for doesn't exist."
            )}
          </p>
          
          <p className="text-sm text-gray-500 mb-6">
            It may have been moved, deleted, or you may not have permission to access it.
          </p>
          
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => navigation.goBack()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            
            <Button
              onClick={() => navigation.goHome()}
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              Workspaces
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Access Denied page
 */
export function AccessDeniedPage({ 
  resourceType,
  resourceId,
  userRole,
  requiredPermission,
  reason
}: { 
  resourceType?: ResourceType;
  resourceId?: string;
  userRole?: string;
  requiredPermission?: string;
  reason?: string;
}) {
  const navigation = useSecureNavigation();

  const getResourceLabel = (type: ResourceType) => {
    const labels = {
      board: "board",
      todo: "todo list",
      calendar: "calendar",
      collection: "collection"
    };
    return labels[type];
  };

  const getSuggestion = () => {
    if (userRole === "viewer" && (requiredPermission === "write" || requiredPermission === "edit")) {
      return "You have view-only access. Contact the owner to request edit permissions.";
    }
    
    if (userRole && (requiredPermission === "share" || requiredPermission === "delete")) {
      return "Only the owner can perform this action.";
    }
    
    if (!userRole) {
      return "You don't have access to this resource. It may be private or you may need to be invited.";
    }
    
    return "Contact the resource owner if you believe you should have access.";
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Shield className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          
          <p className="text-gray-600 mb-4">
            {resourceType ? (
              `You don't have permission to access this ${getResourceLabel(resourceType)}.`
            ) : (
              "You don't have permission to access this resource."
            )}
          </p>
          
          {userRole && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                Current access level: <span className="font-medium">{userRole}</span>
              </p>
              {requiredPermission && (
                <p className="text-sm text-gray-600">
                  Required permission: <span className="font-medium">{requiredPermission}</span>
                </p>
              )}
            </div>
          )}
          
          <p className="text-sm text-gray-500 mb-6">
            {reason || getSuggestion()}
          </p>
          
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => navigation.goBack()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            
            <Button
              onClick={() => navigation.goHome()}
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              Workspaces
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Authentication Required page
 */
export function AuthRequiredPage({ 
  redirectUrl,
  message 
}: { 
  redirectUrl?: string;
  message?: string;
}) {
  const router = useRouter();

  const handleSignIn = () => {
    const signInUrl = redirectUrl 
      ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
      : "/sign-in";
    router.push(signInUrl);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Lock className="h-16 w-16 text-blue-500 mx-auto mb-4" />
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h1>
          
          <p className="text-gray-600 mb-6">
            {message || "You need to sign in to access this page."}
          </p>
          
          <Button
            onClick={handleSignIn}
            className="w-full mb-4"
          >
            Sign In
          </Button>
          
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="w-full"
          >
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Invalid URL page for malformed resource IDs
 */
export function InvalidUrlPage({ 
  reason = "Invalid URL format"
}: { 
  reason?: string;
}) {
  const navigation = useSecureNavigation();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid URL</h1>
          
          <p className="text-gray-600 mb-4">
            The URL you're trying to access is not valid.
          </p>
          
          <p className="text-sm text-gray-500 mb-6">
            Reason: {reason}
          </p>
          
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => navigation.goBack()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            
            <Button
              onClick={() => navigation.goHome()}
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              Workspaces
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading page for permission checks
 */
export function PermissionCheckingPage({ 
  resourceType 
}: { 
  resourceType?: ResourceType;
}) {
  const getResourceLabel = (type: ResourceType) => {
    const labels = {
      board: "board",
      todo: "todo list",
      calendar: "calendar",
      collection: "collection"
    };
    return labels[type];
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <Shield className="h-8 w-8 text-blue-600 animate-pulse" />
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Checking Access Permissions
        </h2>
        
        <p className="text-gray-600">
          {resourceType ? (
            `Verifying your access to this ${getResourceLabel(resourceType)}...`
          ) : (
            "Verifying your access permissions..."
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Comprehensive error boundary for URL protection
 */
interface URLProtectionBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface URLProtectionBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class URLProtectionBoundary extends React.Component<
  URLProtectionBoundaryProps,
  URLProtectionBoundaryState
> {
  constructor(props: URLProtectionBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): URLProtectionBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("URL Protection Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorPage
          title="Access Error"
          message="An error occurred while checking your access permissions."
          suggestion="Please try refreshing the page or contact support if the problem persists."
        />
      );
    }

    return this.props.children;
  }
} 
