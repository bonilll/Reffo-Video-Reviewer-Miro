"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Check, 
  X, 
  Crown,
  Star,
  Zap,
  Shield,
  Sparkles,
  ArrowUpRight,
  Users,
  Database,
  FileText,
  Download,
  BarChart3,
  Upload
} from 'lucide-react';
import { PLAN_INFO, PLAN_LIMITS } from '@/lib/stripe';
import { formatBytes } from '@/lib/utils';
import type { PlanType, BillingInterval } from '@/lib/stripe';

interface ModernPricingProps {
  currentPlan: PlanType;
  onPlanSelect: (plan: PlanType, interval: BillingInterval) => void;
  showCurrentPlanOnly?: boolean;
}

export function ModernPricing({ currentPlan, onPlanSelect, showCurrentPlanOnly = false }: ModernPricingProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  // Feature mapping for clear comparison
  const getFeatureList = (planType: PlanType) => {
    const limits = PLAN_LIMITS[planType];
    
    return [
      {
        icon: Database,
        name: 'Boards',
        value: limits.boards === -1 ? 'Unlimited' : `${limits.boards} board${limits.boards === 1 ? '' : 's'}`,
        available: true
      },
      {
        icon: FileText,
        name: 'Storage',
        value: limits.referencesStorage === -1 ? 'Unlimited' : formatBytes(limits.referencesStorage),
        available: true
      },
      {
        icon: Upload,
        name: 'File Size Limit',
        value: limits.maxFileSize === -1 ? 'Unlimited' : formatBytes(limits.maxFileSize),
        available: true
      },
      {
        icon: Users,
        name: 'Collaboration',
        value: !limits.collaboration ? 'Read-only access' : 
               limits.collaborators === -1 ? 'Unlimited' : 
               `Up to ${limits.collaborators} collaborators`,
        available: limits.collaboration || limits.collaborators === 0
      },
      {
        icon: Download,
        name: 'Export Features',
        value: limits.export ? 'Full export' : 'Basic only',
        available: limits.export
      }
    ];
  };

  const getPlanIcon = (planType: PlanType) => {
    switch (planType) {
      case 'free': return <Shield className="h-5 w-5" />;
      case 'medium': return <Star className="h-5 w-5" />;
      case 'pro': return <Zap className="h-5 w-5" />;
      case 'premium': return <Shield className="h-5 w-5" />;
      default: return <Sparkles className="h-5 w-5" />;
    }
  };

  const getPlanColor = (planType: PlanType) => {
    switch (planType) {
      case 'free': return 'gray';
      case 'medium': return 'gray';
      case 'pro': return 'gray';
      case 'premium': return 'gray';
      default: return 'gray';
    }
  };

  const calculateYearlySavings = (monthly: number, yearly: number) => {
    const monthlyCost = monthly * 12;
    const savings = monthlyCost - yearly;
    const percentage = Math.round((savings / monthlyCost) * 100);
    return { savings, percentage };
  };

  const plans = ['free', 'medium', 'pro', 'premium'] as const;

  if (showCurrentPlanOnly && currentPlan === 'free') {
    // Show upgrade options for free users
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Shield className="h-6 w-6 text-gray-600" />
          </div>
          <CardTitle className="text-xl text-gray-900">Upgrade to unlock premium features</CardTitle>
          <CardDescription className="text-gray-600">
            Choose the perfect plan for your needs and get instant access to advanced features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Label htmlFor="billing-toggle" className="text-sm font-medium text-gray-700">Monthly</Label>
            <Switch
              id="billing-toggle"
              checked={billingInterval === 'yearly'}
              onCheckedChange={(checked) => setBillingInterval(checked ? 'yearly' : 'monthly')}
            />
            <Label htmlFor="billing-toggle" className="text-sm font-medium text-gray-700">
              Yearly
              <span className="ml-1 text-xs text-gray-600 font-medium">Save up to 20%</span>
            </Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((planType) => {
              const planInfo = PLAN_INFO[planType];
              const features = getFeatureList(planType);
              const color = getPlanColor(planType);
              const yearlySavings = calculateYearlySavings(planInfo.price.monthly, planInfo.price.yearly);

              return (
                <Card 
                  key={planType}
                  className={`relative ${
                    planInfo.popular 
                      ? 'border-2 border-gray-400 bg-gray-50' 
                      : 'border border-gray-200 bg-white'
                  } ${planType === 'free' ? 'bg-gray-50' : ''}`}
                >
                  {planInfo.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-gray-800 text-white px-4 py-1">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="text-center pb-4">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                      <div className="text-gray-600">
                        {getPlanIcon(planType)}
                      </div>
                    </div>
                    
                    <CardTitle className="text-lg text-gray-900">{planInfo.name}</CardTitle>
                    <CardDescription className="text-sm text-gray-600">{planInfo.description}</CardDescription>
                    
                    <div className="mt-4">
                      <div className="text-2xl font-semibold text-gray-900">
                        €{billingInterval === 'monthly' ? planInfo.price.monthly : planInfo.price.yearly}
                      </div>
                      <div className="text-sm text-gray-500">
                        per {billingInterval === 'monthly' ? 'month' : 'year'}
                      </div>
                      {billingInterval === 'yearly' && yearlySavings.percentage > 0 && planType !== 'free' && (
                        <div className="text-xs text-gray-600 font-medium mt-1">
                          Save €{yearlySavings.savings} ({yearlySavings.percentage}%)
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {features.slice(0, 6).map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0"></div>
                          <div className="flex-1">
                            <div className="text-xs text-gray-600">
                              {feature.name}: {feature.value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {planType === 'free' ? (
                      <Button
                        variant="ghost"
                        className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                        size="sm"
                        disabled
                      >
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onPlanSelect(planType, billingInterval)}
                        variant="ghost"
                        className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                        size="sm"
                      >
                        Upgrade to {planInfo.name}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show current plan status for subscribed users
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              getPlanColor(currentPlan) === 'blue' ? 'bg-blue-100 text-blue-600' :
              getPlanColor(currentPlan) === 'purple' ? 'bg-purple-100 text-purple-600' :
              getPlanColor(currentPlan) === 'gradient' ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white' :
              'bg-gray-100 text-gray-600'
            }`}>
              {getPlanIcon(currentPlan)}
            </div>
            <div>
              <CardTitle>Your {PLAN_INFO[currentPlan].name} Plan</CardTitle>
              <CardDescription>{PLAN_INFO[currentPlan].description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            Current Plan
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3">Your Plan Features</h4>
            <div className="space-y-2">
              {getFeatureList(currentPlan).map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <feature.icon className="h-4 w-4 text-gray-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{feature.name}</div>
                    <div className="text-xs text-gray-600">{feature.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-3">Upgrade Options</h4>
            <div className="space-y-3">
              {plans.filter(plan => plan !== currentPlan).map((planType) => {
                const planInfo = PLAN_INFO[planType];
                return (
                  <Button
                    key={planType}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => onPlanSelect(planType, 'monthly')}
                  >
                    <span>{planInfo.name} - €{planInfo.price.monthly}/mo</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}