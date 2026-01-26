"use client";

import { useState } from "react";
import { PlanInfo, PlanCard } from "./plan-card";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Definizione dei piani di abbonamento
export const SUBSCRIPTION_PLANS: PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for getting started with basic features",
    price: {
      monthly: 0,
      yearly: 0,
    },
    features: [
      { text: "1GB Storage", available: true },
      { text: "Create up to 3 boards", available: true },
      { text: "Basic asset library", available: true },
      { text: "Limited upload size (5MB)", available: true },
      { text: "Community support", available: true },
      { text: "Advanced export options", available: false },
      { text: "Collaboration features", available: false },
    ],
    buttonText: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Enhanced features for professional work",
    price: {
      monthly: 9.99,
      yearly: 99.99,
    },
    features: [
      { text: "10GB Storage", available: true },
      { text: "Unlimited boards", available: true },
      { text: "Full asset library", available: true },
      { text: "Increased upload size (50MB)", available: true },
      { text: "Community support", available: true },
      { text: "Advanced export options", available: true },
      { text: "Collaboration features", available: false },
    ],
    popular: true,
    buttonText: "Upgrade to Pro",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Maximum capabilities for teams",
    price: {
      monthly: 29.99,
      yearly: 299.99,
    },
    features: [
      { text: "100GB Storage", available: true },
      { text: "Unlimited boards", available: true },
      { text: "Full asset library", available: true },
      { text: "Max upload size (500MB)", available: true },
      { text: "Community support", available: true },
      { text: "Advanced export options", available: true },
      { text: "Collaboration features", available: true },
    ],
    buttonText: "Upgrade to Enterprise",
  },
];

interface PlansDisplayProps {
  currentPlan?: string;
  onSelectPlan: (planId: string) => void;
  loading?: boolean;
}

export function PlansDisplay({
  currentPlan = "free",
  onSelectPlan,
  loading = false,
}: PlansDisplayProps) {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="space-y-6">
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-2 rounded-lg border p-2">
          <div
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium",
              billingInterval === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            )}
            onClick={() => setBillingInterval("monthly")}
            role="button"
            tabIndex={0}
          >
            Monthly
          </div>
          <div className="flex items-center space-x-1.5">
            <Switch
              checked={billingInterval === "yearly"}
              onCheckedChange={(checked) =>
                setBillingInterval(checked ? "yearly" : "monthly")
              }
            />
            <Label
              className={cn(
                "text-sm font-medium",
                billingInterval === "yearly"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Yearly <span className="ml-1 text-xs text-green-600">(Save up to 20%)</span>
            </Label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlan={currentPlan}
            interval={billingInterval}
            onSelect={onSelectPlan}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
} 