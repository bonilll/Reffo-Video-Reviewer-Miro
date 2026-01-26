"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, ArrowRight, X, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { PLAN_INFO } from "@/lib/stripe-client";

interface UpgradeBlockProps {
  feature: "boards" | "storage" | "collaboration" | "export" | "todoLists";
  isOpen?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  className?: string;
}

const featureConfig = {
  boards: {
    icon: Crown,
    title: "Board Limit Reached",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  storage: {
    icon: Lock,
    title: "Storage Limit Reached", 
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  collaboration: {
    icon: Zap,
    title: "Collaboration Unavailable",
    color: "text-blue-600", 
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  export: {
    icon: ArrowRight,
    title: "Export Unavailable",
    color: "text-purple-600",
    bgColor: "bg-purple-50", 
    borderColor: "border-purple-200",
  },
  todoLists: {
    icon: Crown,
    title: "Todo Lists Limit Reached",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
};

export function UpgradeBlock({ 
  feature, 
  isOpen = false, 
  onClose, 
  children, 
  className = "" 
}: UpgradeBlockProps) {
  // BETA_MODE: Set to false to restore premium functionality
  const BETA_MODE = true;
  const router = useRouter();
  const { userPlan, getUpgradeMessage } = usePlanLimits();
  const [isVisible, setIsVisible] = useState(isOpen);
  
  const config = featureConfig[feature];
  const Icon = config.icon;
  const message = getUpgradeMessage(feature);
  
  // Get recommended plan based on feature
  const getRecommendedPlan = () => {
    switch (feature) {
      case "boards":
        return userPlan === "free" ? "medium" : "pro";
      case "storage":
        return userPlan === "free" ? "medium" : userPlan === "medium" ? "pro" : "premium";
      case "collaboration":
        return "medium";
      case "export":
        return "pro";
      case "todoLists":
        return userPlan === "free" ? "medium" : "pro";
      default:
        return "pro";
    }
  };
  
  const recommendedPlan = getRecommendedPlan();
  const planInfo = PLAN_INFO[recommendedPlan as keyof typeof PLAN_INFO];
  
  const handleUpgrade = () => {
    router.push("/pricing");
  };
  
  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };
  
  if (!isVisible && isOpen) return null;
  
  // BETA_MODE_MESSAGE: Show beta testing message for wrapper children
  if (children) {
    // Render as wrapper with children disabled
    return (
      <div className={`relative ${className}`}>
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="bg-blue-50 border-blue-200 border-2 shadow-lg max-w-sm mx-4">
            <CardContent className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
                <Icon className="w-6 h-6 text-blue-600" />
              </div>
              
              <h3 className="font-semibold text-lg mb-2 text-blue-900">
                {BETA_MODE ? "Feature Limited During Beta" : config.title}
              </h3>
              <p className="text-sm text-blue-800 mb-4">
                {BETA_MODE 
                  ? "The number of components is currently limited while the platform is in beta testing. All features will be available once we complete our beta phase."
                  : message
                }
              </p>
              
              <div className="space-y-3">
                {BETA_MODE ? (
                  <Button onClick={handleClose} className="w-full" variant="default">
                    Got it, thanks!
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleUpgrade} className="w-full">
                      <Crown className="w-4 h-4 mr-2" />
                      Upgrade to {planInfo.name}
                    </Button>
                    
                    {onClose && (
                      <Button variant="ghost" size="sm" onClick={handleClose} className="w-full">
                        Maybe Later
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  // BETA_MODE_MESSAGE: Show beta testing message for standalone block
  if (BETA_MODE) {
    return (
      <Card className="bg-blue-50 border-blue-200 border-2">
        <CardContent className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Feature Limited During Beta</h3>
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                Beta Testing
              </Badge>
            </div>
          </div>
          
          <p className="text-sm text-blue-800 mb-4">
            The number of components is currently limited while the platform is in beta testing. 
            All features will be available once we complete our beta phase.
          </p>
          
          <div className="flex space-x-2">
            <Button onClick={handleClose} className="flex-1" variant="default">
              Got it, thanks!
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render as standalone block
  return (
    <Card className={`${config.bgColor} ${config.borderColor} border-2 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${config.bgColor}`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <h3 className="font-semibold">{config.title}</h3>
            <Badge variant="outline" className={`${config.color} border-current`}>
              {userPlan === "free" ? "Free Plan" : userPlan === "medium" ? "Starter Plan" : userPlan === "pro" ? "Pro Plan" : "Premium Plan"}
            </Badge>
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        
        <div className="flex space-x-2">
          <Button onClick={handleUpgrade} className="flex-1">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade Now
          </Button>
          <Button variant="outline" onClick={() => router.push("/pricing")}>
            View Plans
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 