"use client";

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ModernPricing } from './modern-pricing';
import { 
  Calendar, 
  CreditCard, 
  Star, 
  Download, 
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Crown,
  ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import type { Doc } from '@/convex/_generated/dataModel';

interface SubscriptionStatusProps {
  subscription: Doc<'subscriptions'> | null;
  planType: 'free' | 'medium' | 'pro' | 'premium';
  onPlanChange: (plan: 'medium' | 'pro' | 'premium', interval: 'monthly' | 'yearly', scheduled?: boolean) => void;
  onCancelSubscription: () => void;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  invoice_url?: string;
  invoice_pdf?: string;
}

export function SubscriptionStatus({ 
  subscription, 
  planType, 
  onPlanChange, 
  onCancelSubscription 
}: SubscriptionStatusProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  useEffect(() => {
    if (planType !== 'free') {
      loadPaymentHistory();
    }
  }, [planType]);

  const loadPaymentHistory = async () => {
    setLoadingTransactions(true);
    try {
      const response = await fetch('/api/billing/history');
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error loading payment history:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoadingTransactions(false);
    }
  };

  const downloadInvoice = async (transactionId: string, invoiceUrl?: string) => {
    if (!invoiceUrl) {
      toast.error('Invoice not available for this transaction');
      return;
    }

    setDownloadingInvoice(transactionId);
    try {
      const response = await fetch(`/api/billing/invoice/${transactionId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reffo-invoice-${transactionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Invoice downloaded successfully');
      } else {
        throw new Error('Failed to download invoice');
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to download invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'canceled':
        return 'bg-red-100 text-red-700';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-700';
      case 'trialing':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPlanIcon = (plan: string) => {
    switch (plan) {
      case 'premium':
        return <Crown className="h-5 w-5 text-purple-600" />;
      case 'medium':
        return <Star className="h-5 w-5 text-blue-600" />;
      default:
        return <Star className="h-5 w-5 text-gray-600" />;
    }
  };

  const currentPlanName = {
    free: 'Free',
    medium: 'Medium',
    premium: 'Premium'
  }[planType];

  const currentPlanPrice = {
    free: '€0',
    medium: subscription?.billingInterval === 'yearly' ? '€29.99/year' : '€3/month',
    premium: subscription?.billingInterval === 'yearly' ? '€99/year' : '€9.99/month'
  }[planType];

  return (
    <div className="space-y-6">
      {planType === 'free' ? (
        <ModernPricing 
          currentPlan={planType} 
          onPlanSelect={onPlanChange}
          showCurrentPlanOnly={true}
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getPlanIcon(planType)}
                <div>
                  <CardTitle>Current Subscription</CardTitle>
                  <CardDescription>Manage your plan and billing</CardDescription>
                </div>
              </div>
              <Badge className={`px-3 py-1 ${
                planType === 'premium' ? 'bg-purple-100 text-purple-700' :
                planType === 'pro' ? 'bg-purple-100 text-purple-700' :
                planType === 'medium' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {currentPlanName}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <Calendar className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-900">Next Billing</p>
                  <p className="text-xs text-gray-600">
                    {subscription?.currentPeriodEnd 
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })
                      : 'Not available'
                    }
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <CreditCard className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-900">Amount</p>
                  <p className="text-xs text-gray-600">{currentPlanPrice}</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <Star className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-900">Status</p>
                  <Badge className={`text-xs mt-1 ${getStatusColor(subscription?.status || 'active')}`}>
                    {subscription?.cancelAtPeriodEnd 
                      ? 'Cancels at period end' 
                      : subscription?.status || 'Active'
                    }
                  </Badge>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <ExternalLink className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-900">Billing Portal</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open('/api/billing/portal', '_blank')}
                    className="text-xs mt-1"
                  >
                    Manage <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-gray-900 mb-4">Plan Management</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-3">
                    <h5 className="font-medium text-gray-700">Change Plan</h5>
                    <div className="space-y-2">
                      {planType !== 'medium' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onPlanChange('medium', subscription?.billingInterval || 'monthly', true)}
                          className="w-full"
                        >
                          Switch to Medium
                        </Button>
                      )}
                      {planType !== 'premium' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onPlanChange('premium', subscription?.billingInterval || 'monthly', true)}
                          className="w-full"
                        >
                          Switch to Premium
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h5 className="font-medium text-gray-700">Billing Cycle</h5>
                    <div className="space-y-2">
                      {subscription?.billingInterval !== 'yearly' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onPlanChange(planType as 'medium' | 'premium', 'yearly', true)}
                          className="w-full text-green-600 border-green-300 hover:bg-green-50"
                        >
                          Switch to Yearly (Save 17%)
                        </Button>
                      )}
                      {subscription?.billingInterval !== 'monthly' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onPlanChange(planType as 'medium' | 'premium', 'monthly', true)}
                          className="w-full"
                        >
                          Switch to Monthly
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h5 className="font-medium text-gray-700">Actions</h5>
                    <div className="space-y-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={onCancelSubscription}
                        className="w-full text-red-600 border-red-300 hover:bg-red-50"
                      >
                        Cancel Subscription
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </CardContent>
      </Card>
      )}

      {planType !== 'free' && (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>View all your transactions and download invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTransactions ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No transactions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(transaction.status)}
                      <div>
                        <p className="font-medium text-gray-900">{transaction.description}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(transaction.date).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatAmount(transaction.amount, transaction.currency)}
                        </p>
                        <Badge className={`text-xs ${
                          transaction.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                          transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {transaction.status}
                        </Badge>
                      </div>
                      {transaction.invoice_pdf && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadInvoice(transaction.id, transaction.invoice_pdf)}
                          disabled={downloadingInvoice === transaction.id}
                        >
                          {downloadingInvoice === transaction.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
