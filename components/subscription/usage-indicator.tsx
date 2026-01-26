"use client";

import { useSubscription } from "@/hooks/use-subscription";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS } from "@/lib/stripe";
import { formatBytes } from "@/lib/utils";
import { Crown, Zap, AlertTriangle } from "lucide-react";

export function UsageIndicator() {
  const { subscription, usage, isLoading, createCheckoutSession } = useSubscription();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-2 bg-gray-200 rounded"></div>
            <div className="h-2 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription || !usage) return null;

  const planType = subscription.planType;
  const limits = PLAN_LIMITS[planType];

  const getUsagePercentage = (current: number, limit: number, type: "storage" | "count" = "count") => {
    if (limit === -1) return 0; // Unlimited
    
    // For storage: current is in MB, limit is in bytes, so convert limit to MB
    if (type === "storage") {
      const limitInMB = limit / (1024 * 1024);
      return Math.min((current / limitInMB) * 100, 100);
    }
    
    return Math.min((current / limit) * 100, 100);
  };

  const formatLimit = (limit: number, type: "storage" | "count") => {
    if (limit === -1) return "Unlimited";
    if (type === "storage") return formatBytes(limit);
    return limit.toString();
  };
  
  const formatUsage = (current: number, type: "storage" | "count") => {
    if (type === "storage") return formatBytes(current * 1024 * 1024); // Convert MB to bytes for display
    return current.toString();
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-blue-500";
  };

  const boardsPercentage = getUsagePercentage(usage.boardsCount, limits.boards);
  const storagePercentage = getUsagePercentage(usage.storageUsed, limits.referencesStorage, "storage");
  const todoListsPercentage = getUsagePercentage(usage.todoListsCount, limits.todoLists);
  const galleriesPercentage = getUsagePercentage(usage.privateGalleriesCount, limits.privateGalleries);

  const isNearLimit = boardsPercentage >= 80 || storagePercentage >= 80 || todoListsPercentage >= 80 || galleriesPercentage >= 80;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {planType === "free" && <Zap className="h-5 w-5 text-gray-500" />}
            {planType === "medium" && <Crown className="h-5 w-5 text-blue-500" />}
            {planType === "premium" && <Crown className="h-5 w-5 text-purple-500" />}
            Plan Usage
          </CardTitle>
          <Badge 
            variant={planType === "free" ? "secondary" : planType === "medium" ? "default" : "default"}
            className={
              planType === "free" ? "bg-gray-100 text-gray-800" :
              planType === "medium" ? "bg-blue-100 text-blue-800" :
              "bg-purple-100 text-purple-800"
            }
          >
            {planType.charAt(0).toUpperCase() + planType.slice(1)}
          </Badge>
        </div>
        {isNearLimit && planType !== "premium" && (
          <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
            <AlertTriangle className="h-4 w-4" />
            You're approaching your plan limits. Consider upgrading.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Boards Usage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Boards</span>
            <span className={getStatusColor(boardsPercentage)}>
              {usage.boardsCount} / {formatLimit(limits.boards, "count")}
            </span>
          </div>
          {limits.boards !== -1 && (
            <Progress 
              value={boardsPercentage} 
              className="h-2"
              style={{
                background: boardsPercentage >= 90 ? "#fee2e2" : 
                           boardsPercentage >= 75 ? "#fef3c7" : "#dbeafe"
              }}
            />
          )}
        </div>

        {/* Storage Usage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Storage</span>
            <span className={getStatusColor(storagePercentage)}>
              {formatUsage(usage.storageUsed, "storage")} / {formatLimit(limits.referencesStorage, "storage")}
            </span>
          </div>
          {limits.referencesStorage !== -1 && (
            <Progress 
              value={storagePercentage} 
              className="h-2"
              style={{
                background: storagePercentage >= 90 ? "#fee2e2" : 
                           storagePercentage >= 75 ? "#fef3c7" : "#dbeafe"
              }}
            />
          )}
        </div>

        {/* Todo Lists Usage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Todo Lists</span>
            <span className={getStatusColor(todoListsPercentage)}>
              {usage.todoListsCount} / {formatLimit(limits.todoLists, "count")}
            </span>
          </div>
          {limits.todoLists !== -1 && (
            <Progress 
              value={todoListsPercentage} 
              className="h-2"
              style={{
                background: todoListsPercentage >= 90 ? "#fee2e2" : 
                           todoListsPercentage >= 75 ? "#fef3c7" : "#dbeafe"
              }}
            />
          )}
        </div>

        {/* Private Galleries Usage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Private Galleries</span>
            <span className={getStatusColor(galleriesPercentage)}>
              {usage.privateGalleriesCount} / {formatLimit(limits.privateGalleries, "count")}
            </span>
          </div>
          {limits.privateGalleries !== -1 && (
            <Progress 
              value={galleriesPercentage} 
              className="h-2"
              style={{
                background: galleriesPercentage >= 90 ? "#fee2e2" : 
                           galleriesPercentage >= 75 ? "#fef3c7" : "#dbeafe"
              }}
            />
          )}
        </div>

        {/* Upgrade CTA */}
        {planType !== "premium" && isNearLimit && (
          <div className="pt-4 border-t">
            <Button 
              className="w-full" 
              onClick={() => createCheckoutSession(
                planType === "free" ? "medium" : 
                planType === "medium" ? "pro" : 
                "premium", "monthly"
              )}
            >
              Upgrade to {
                planType === "free" ? "Medium" : 
                planType === "medium" ? "Pro" : 
                "Premium"
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 