"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ModernPricing } from './modern-pricing';
import { 
  Calendar, 
  CreditCard, 
  Star, 
  ExternalLink,
  Crown,
  Zap,
  Settings,
  Shield,
  ChevronRight,
  DollarSign,
  FileText,
  AlertCircle
} from 'lucide-react';
import type { Doc } from '@/convex/_generated/dataModel';
import { PLAN_INFO } from '@/lib/stripe';
import type { PlanType, BillingInterval } from '@/lib/stripe';

interface ModernSubscriptionDashboardProps {
  subscription: Doc<'subscriptions'> | null;
  planType: PlanType;
  onPlanChange: (plan: 'medium' | 'pro' | 'premium', interval: BillingInterval, scheduled?: boolean) => void;
  onCancelSubscription: () => void;
}

export function ModernSubscriptionDashboard({ 
  subscription, 
  planType, 
  onPlanChange, 
  onCancelSubscription 
}: ModernSubscriptionDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const getPlanIcon = (plan: string) => {
    switch (plan) {
      case 'premium':
        return <Shield className="h-4 w-4 text-gray-600" />;
      case 'pro':
        return <Zap className="h-4 w-4 text-gray-600" />;
      case 'medium':
        return <Star className="h-4 w-4 text-gray-600" />;
      default:
        return <Star className="h-4 w-4 text-gray-600" />;
    }
  };

  const currentPlanInfo = PLAN_INFO[planType || "free"];
  const currentPlanPrice = {
    free: '€0',
    medium: subscription?.billingInterval === 'yearly' ? '€29.99/year' : '€3/month',
    pro: subscription?.billingInterval === 'yearly' ? '€59.99/year' : '€5.99/month',
    premium: subscription?.billingInterval === 'yearly' ? '€99/year' : '€9.99/month'
  }[planType || "free"];

  // For free users, show the modern pricing component
  if (planType === 'free' || !planType) {
    return (
      <div className="space-y-6">
        <ModernPricing 
          currentPlan={planType || 'free'} 
          onPlanSelect={(plan, interval) => {
            if (plan !== 'free') {
              onPlanChange(plan, interval, true);
            }
          }}
          showCurrentPlanOnly={true}
        />
      </div>
    );
  }

  // For paid users, show refined subscription dashboard
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-100">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Subscription & Billing</h2>
              <p className="text-sm text-gray-500">Manage your plan and billing preferences</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200"
            onClick={() => window.open('/api/billing/portal', '_blank')}
          >
            <Settings className="h-4 w-4 mr-1.5" />
            Manage
          </Button>
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Current Plan Info */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-gray-200">
                {getPlanIcon(planType)}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">Current Plan: {currentPlanInfo.name}</h3>
                <p className="text-xs text-gray-500">{currentPlanInfo.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{currentPlanPrice}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Next Billing</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {subscription?.currentPeriodEnd 
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('it-IT', {
                        day: 'numeric',
                        month: 'short'
                      })
                    : '--'
                  }
                </p>
              </div>
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{currentPlanPrice}</p>
              </div>
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">Active</p>
              </div>
              <Shield className="h-5 w-5 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Card className="border border-gray-200">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          <CardHeader className="pb-0 border-b border-gray-100">
            <TabsList className="grid w-full grid-cols-3 bg-gray-50 p-1 rounded-md h-9">
              <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white">
                <Shield className="h-3 w-3" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="billing" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white">
                <FileText className="h-3 w-3" />
                Billing
              </TabsTrigger>
              <TabsTrigger value="plans" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white">
                <Crown className="h-3 w-3" />
                Change Plan
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-5">
            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-5 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Plan Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900">Plan Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Plan</span>
                      <span className="text-sm font-medium text-gray-900">{currentPlanInfo.name}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Billing</span>
                      <span className="text-sm font-medium text-gray-900 capitalize">{subscription?.billingInterval || 'monthly'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-600">Amount</span>
                      <span className="text-sm font-medium text-gray-900">{currentPlanPrice}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900">Quick Actions</h3>
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-gray-700 hover:bg-gray-50 border border-gray-200 h-10"
                      onClick={() => window.open('/api/billing/portal', '_blank')}
                    >
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        <span className="text-sm">Billing Portal</span>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-gray-700 hover:bg-gray-50 border border-gray-200 h-10"
                      onClick={() => setActiveTab('plans')}
                    >
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                        <span className="text-sm">Change Plan</span>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-gray-700 hover:bg-gray-50 border border-gray-200 h-10"
                      onClick={() => setActiveTab('billing')}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="text-sm">View Invoices</span>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-6 mt-0">
              <div className="text-center py-12">
                <CreditCard className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Payment History</h3>
                <p className="text-sm text-gray-500 mb-6">Your transaction history will appear here</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={() => window.open('/api/billing/portal', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Billing Portal
                </Button>
              </div>
            </TabsContent>

            {/* Plans Tab */}
            <TabsContent value="plans" className="space-y-6 mt-0">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Change Your Plan</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Switch to a different plan or billing cycle. Changes take effect at the end of your current billing period.
                </p>
                
                {/* Custom Plan Comparison */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Free Plan */}
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="text-center mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Free</h4>
                        <p className="text-xs text-gray-500">Perfect for getting started</p>
                        <div className="text-lg font-semibold text-gray-900 mt-2">€0</div>
                        <div className="text-xs text-gray-500">per month</div>
                      </div>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">1 board</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">500MB storage</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">100MB file limit</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Read-only collaboration</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Basic export only</span>
                        </li>
                      </ul>
                    </div>

                    {/* Starter Plan */}
                    <div className={`border rounded-lg p-4 ${planType === 'medium' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="text-center mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Starter</h4>
                        <p className="text-xs text-gray-500">Perfect for individual creators</p>
                        <div className="text-lg font-semibold text-gray-900 mt-2">€3</div>
                        <div className="text-xs text-gray-500">per month</div>
                      </div>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">3 boards</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">15GB storage</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">200MB file limit</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Up to 3 collaborators</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Basic export only</span>
                        </li>
                      </ul>
                      {planType !== 'medium' && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="w-full mt-3 text-gray-700 border border-gray-200 hover:bg-gray-50" 
                          onClick={() => onPlanChange('medium', 'monthly', true)}
                        >
                          Upgrade
                        </Button>
                      )}
                    </div>

                    {/* Pro Plan */}
                    <div className={`border rounded-lg p-4 ${planType === 'pro' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="text-center mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Pro</h4>
                        <p className="text-xs text-gray-500">Advanced features</p>
                        <div className="text-lg font-semibold text-gray-900 mt-2">€5.99</div>
                        <div className="text-xs text-gray-500">per month</div>
                      </div>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">15 boards</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">50GB storage</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">200MB file limit</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Up to 10 collaborators</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Full advanced export</span>
                        </li>
                      </ul>
                      {planType !== 'pro' && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="w-full mt-3 text-gray-700 border border-gray-200 hover:bg-gray-50" 
                          onClick={() => onPlanChange('pro', 'monthly', true)}
                        >
                          Upgrade
                        </Button>
                      )}
                    </div>

                    {/* Premium Plan */}
                    <div className={`border rounded-lg p-4 ${planType === 'premium' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="text-center mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Premium</h4>
                        <p className="text-xs text-gray-500">Complete flexibility</p>
                        <div className="text-lg font-semibold text-gray-900 mt-2">€9.99</div>
                        <div className="text-xs text-gray-500">per month</div>
                      </div>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Unlimited boards</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">200GB storage</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">500MB file limit</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Unlimited collaboration</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="text-gray-600">Full advanced export</span>
                        </li>
                      </ul>
                      {planType !== 'premium' && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="w-full mt-3 text-gray-700 border border-gray-200 hover:bg-gray-50" 
                          onClick={() => onPlanChange('premium', 'monthly', true)}
                        >
                          Upgrade
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cancellation */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Cancel Subscription</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Cancel your subscription. You'll continue to have access until the end of your billing period.
                </p>
                
                <Alert className="border-gray-200 bg-white mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm text-gray-700">
                    This action cannot be undone. You'll lose access to premium features at the end of your billing period.
                  </AlertDescription>
                </Alert>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelSubscription}
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
                >
                  Cancel My Subscription
                </Button>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
      </div>
    </div>
  );
} 