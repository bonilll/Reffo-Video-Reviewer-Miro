"use client";

import { AlertTriangle, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/use-subscription";
import { PLAN_INFO } from "@/lib/stripe";
import type { PlanType } from "@/lib/stripe";

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: PlanType;
  limitType: string;
  limitValue?: string;
}

export function UpgradePrompt({
  isOpen,
  onClose,
  currentPlan,
  limitType,
  limitValue,
}: UpgradePromptProps) {
  // BETA_MODE: Set to false to restore premium functionality
  const BETA_MODE = true;
  const { createCheckoutSession } = useSubscription();

  const getRecommendedPlan = (): PlanType => {
    if (currentPlan === "free") return "medium";
    if (currentPlan === "medium") return "pro";
    if (currentPlan === "pro") return "premium";
    return "premium";
  };

  const recommendedPlan = getRecommendedPlan();
  const planInfo = PLAN_INFO[recommendedPlan];

  const handleUpgrade = async (billingInterval: "monthly" | "yearly") => {
    await createCheckoutSession(recommendedPlan, billingInterval);
    onClose();
  };

  const getLimitMessage = () => {
    switch (limitType) {
      case "boards":
        return `You've reached your limit of ${limitValue} board${limitValue === "1" ? "" : "s"}.`;
      case "storage":
        return `You've reached your storage limit of ${limitValue}.`;
      case "fileSize":
        return `This file exceeds your maximum file size limit of ${limitValue}.`;
      case "todoLists":
        return `You've reached your limit of ${limitValue} todo list${limitValue === "1" ? "" : "s"}.`;
      case "privateGalleries":
        return `You've reached your limit of ${limitValue} private galler${limitValue === "1" ? "y" : "ies"}.`;
      case "collaboration":
        return "Collaboration is not available on your current plan.";
      case "export":
        return "Export functionality is not available on your current plan.";
      case "storage_limit_exceeded":
        return "You've reached your storage limit. Upgrade to get more storage space for your references.";
      case "file_too_large":
        return `This file is too large for your current plan. Upgrade to increase your file size limits.`;
      default:
        return "You've reached a limit on your current plan.";
    }
  };

  // BETA_MODE_MESSAGE: Show beta testing message instead of upgrade prompt
  if (BETA_MODE) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-full">
                <AlertTriangle className="h-5 w-5 text-blue-600" />
              </div>
              <DialogTitle>Feature Limited During Beta</DialogTitle>
            </div>
            <DialogDescription className="text-left">
              This feature is currently limited while the platform is in beta testing. 
              All premium features will be available once we complete our beta phase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-blue-900">
                🚀 Beta Testing Phase
              </h4>
              <p className="text-sm text-blue-800">
                We're currently in beta testing to ensure the best possible experience. 
                Thank you for helping us improve the platform!
              </p>
            </div>

            <Button
              onClick={onClose}
              className="w-full"
              variant="default"
            >
              Got it, thanks!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-full">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <DialogTitle>Upgrade Required</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            {getLimitMessage()} Upgrade to {planInfo.name} to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan Comparison */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              {recommendedPlan === "medium" && <Crown className="h-4 w-4 text-blue-500" />}
              {recommendedPlan === "pro" && <Zap className="h-4 w-4 text-purple-500" />}
              {recommendedPlan === "premium" && <Crown className="h-4 w-4 text-purple-500" />}
              {planInfo.name} Plan Benefits
            </h4>
            <ul className="text-sm space-y-1 text-gray-600">
              {recommendedPlan === "medium" && (
                <>
                  <li>• 3 boards</li>
                  <li>• 15GB storage</li>
                  <li>• 200MB file limit</li>
                  <li>• Up to 3 collaborators per board</li>
                  <li>• Basic export only</li>
                </>
              )}
              {recommendedPlan === "pro" && (
                <>
                  <li>• 15 boards</li>
                  <li>• 50GB storage</li>
                  <li>• 200MB file limit</li>
                  <li>• Up to 10 collaborators per board</li>
                  <li>• Full advanced export</li>
                </>
              )}
              {recommendedPlan === "premium" && (
                <>
                  <li>• Unlimited boards</li>
                  <li>• 200GB storage (expandable)</li>
                  <li>• 500MB file limit</li>
                  <li>• Unlimited collaboration</li>
                  <li>• Full advanced export</li>
                  <li>• API access</li>
                </>
              )}
            </ul>
          </div>

          {/* Pricing Options */}
          <div className="space-y-3">
            <Button
              onClick={() => handleUpgrade("monthly")}
              className="w-full"
              size="lg"
            >
              Upgrade to {planInfo.name} - €{planInfo.price.monthly}/month
            </Button>
            
            <Button
              onClick={() => handleUpgrade("yearly")}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <div className="flex items-center justify-between w-full">
                <span>Upgrade to {planInfo.name} - €{planInfo.price.yearly}/year</span>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  Save {Math.round(((planInfo.price.monthly * 12 - planInfo.price.yearly) / (planInfo.price.monthly * 12)) * 100)}%
                </span>
              </div>
            </Button>
          </div>

          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full"
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 