"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PlanFeature {
  text: string;
  available: boolean;
}

export interface PlanInfo {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
  };
  features: PlanFeature[];
  popular?: boolean;
  buttonText?: string;
}

interface PlanCardProps {
  plan: PlanInfo;
  currentPlan?: string;
  interval: "monthly" | "yearly";
  onSelect: (planId: string) => void;
  loading?: boolean;
}

export function PlanCard({
  plan,
  currentPlan,
  interval,
  onSelect,
  loading = false,
}: PlanCardProps) {
  const isCurrentPlan = currentPlan === plan.id;
  const price = interval === "monthly" ? plan.price.monthly : plan.price.yearly;
  const discount = Math.round(
    ((plan.price.monthly * 12 - plan.price.yearly) / (plan.price.monthly * 12)) * 100
  );

  return (
    <div
      className={cn(
        "relative rounded-2xl border p-6 shadow-sm",
        plan.popular
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card",
        isCurrentPlan && "ring-2 ring-primary"
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-0 right-0 flex justify-center">
          <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            Popular Choice
          </div>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute -top-3 right-4 rounded-full bg-green-500 px-3 py-1 text-xs font-medium text-white">
          Current Plan
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-end">
          <span className="text-4xl font-bold">${price}</span>
          <span className="text-sm text-muted-foreground">/{interval}</span>
        </div>
        {interval === "yearly" && (
          <div className="mt-1 text-xs text-green-600">
            Save {discount}% with annual billing
          </div>
        )}
      </div>

      <div className="mb-6 space-y-2">
        {plan.features.map((feature, index) => (
          <div key={index} className="flex items-center">
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                feature.available ? "text-green-500" : "text-muted-foreground/30"
              )}
            />
            <span
              className={cn(
                "text-sm",
                feature.available ? "text-foreground" : "text-muted-foreground/50 line-through"
              )}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      <Button
        onClick={() => onSelect(plan.id)}
        className="w-full"
        disabled={isCurrentPlan || loading}
        variant={plan.popular ? "default" : "outline"}
      >
        {isCurrentPlan
          ? "Current Plan"
          : loading
          ? "Processing..."
          : plan.buttonText || "Select Plan"}
      </Button>
    </div>
  );
} 