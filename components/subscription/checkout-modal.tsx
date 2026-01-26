"use client";

import { useState } from "react";
import { PlanInfo } from "./plan-card";
import type { BillingInterval, PlanType } from "@/lib/stripe";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Calendar, User } from "lucide-react";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanInfo;
  interval: BillingInterval;
  onConfirm: (tier: PlanType, interval: BillingInterval) => Promise<boolean>;
}

export function CheckoutModal({
  isOpen,
  onClose,
  plan,
  interval,
  onConfirm,
}: CheckoutModalProps) {
  const [step, setStep] = useState<"billing" | "payment" | "review">("billing");
  const [loading, setLoading] = useState(false);
  
  // Form data
  const [billingInfo, setBillingInfo] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  
  const [paymentInfo, setPaymentInfo] = useState({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
  });
  
  const price = interval === "monthly" ? plan.price.monthly : plan.price.yearly;
  
  // Handlers
  const handleBillingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };
  
  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("review");
  };
  
  const handleConfirmation = async () => {
    try {
      setLoading(true);
      const result = await onConfirm(plan.id as PlanType, interval);
      if (result) {
        onClose();
      }
    } catch (error) {
      console.error("Error during checkout:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleClose = () => {
    if (!loading) {
      setStep("billing");
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade to {plan.name}</DialogTitle>
          <DialogDescription>
            {interval === "monthly" 
              ? `$${price}/month` 
              : `$${price}/year (save ${Math.round(((plan.price.monthly * 12 - plan.price.yearly) / (plan.price.monthly * 12)) * 100)}%)`
            }
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={step} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="billing" disabled={loading}>Billing Info</TabsTrigger>
            <TabsTrigger value="payment" disabled={step === "billing" || loading}>Payment</TabsTrigger>
            <TabsTrigger value="review" disabled={step !== "review" || loading}>Review</TabsTrigger>
          </TabsList>
          
          <TabsContent value="billing" className="space-y-4 py-4">
            <form onSubmit={handleBillingSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name"
                    value={billingInfo.name}
                    onChange={(e) => setBillingInfo({...billingInfo, name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email"
                    type="email"
                    value={billingInfo.email}
                    onChange={(e) => setBillingInfo({...billingInfo, email: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input 
                  id="address"
                  value={billingInfo.address}
                  onChange={(e) => setBillingInfo({...billingInfo, address: e.target.value})}
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input 
                    id="city"
                    value={billingInfo.city}
                    onChange={(e) => setBillingInfo({...billingInfo, city: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input 
                    id="state"
                    value={billingInfo.state}
                    onChange={(e) => setBillingInfo({...billingInfo, state: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input 
                    id="postalCode"
                    value={billingInfo.postalCode}
                    onChange={(e) => setBillingInfo({...billingInfo, postalCode: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input 
                    id="country"
                    value={billingInfo.country}
                    onChange={(e) => setBillingInfo({...billingInfo, country: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit">Continue to Payment</Button>
              </DialogFooter>
            </form>
          </TabsContent>
          
          <TabsContent value="payment" className="space-y-4 py-4">
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <div className="relative">
                  <Input 
                    id="cardNumber"
                    placeholder="1234 5678 9012 3456"
                    value={paymentInfo.cardNumber}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardNumber: e.target.value})}
                    required
                  />
                  <CreditCard className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cardHolder">Card Holder Name</Label>
                <div className="relative">
                  <Input 
                    id="cardHolder"
                    placeholder="John Doe"
                    value={paymentInfo.cardHolder}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardHolder: e.target.value})}
                    required
                  />
                  <User className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <div className="relative">
                    <Input 
                      id="expiryDate"
                      placeholder="MM/YY"
                      value={paymentInfo.expiryDate}
                      onChange={(e) => setPaymentInfo({...paymentInfo, expiryDate: e.target.value})}
                      required
                    />
                    <Calendar className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input 
                    id="cvv"
                    placeholder="123"
                    value={paymentInfo.cvv}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cvv: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("billing")}>Back</Button>
                <Button type="submit">Review Order</Button>
              </DialogFooter>
            </form>
          </TabsContent>
          
          <TabsContent value="review" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <h3 className="font-medium mb-2">Plan Details</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Plan:</div>
                  <div>{plan.name}</div>
                  
                  <div className="text-muted-foreground">Billing:</div>
                  <div>{interval === "monthly" ? "Monthly" : "Yearly"}</div>
                  
                  <div className="text-muted-foreground">Amount:</div>
                  <div>${price}/{interval}</div>
                </div>
              </div>
              
              <div className="rounded-md border p-4">
                <h3 className="font-medium mb-2">Billing Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Name:</div>
                  <div>{billingInfo.name}</div>
                  
                  <div className="text-muted-foreground">Email:</div>
                  <div>{billingInfo.email}</div>
                  
                  <div className="text-muted-foreground">Address:</div>
                  <div>{billingInfo.address}</div>
                  
                  <div className="text-muted-foreground">City:</div>
                  <div>{billingInfo.city}</div>
                  
                  <div className="text-muted-foreground">State/Province:</div>
                  <div>{billingInfo.state}</div>
                  
                  <div className="text-muted-foreground">Postal Code:</div>
                  <div>{billingInfo.postalCode}</div>
                  
                  <div className="text-muted-foreground">Country:</div>
                  <div>{billingInfo.country}</div>
                </div>
              </div>
              
              <div className="rounded-md border p-4">
                <h3 className="font-medium mb-2">Payment Method</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Card Number:</div>
                  <div>**** **** **** {paymentInfo.cardNumber.slice(-4)}</div>
                  
                  <div className="text-muted-foreground">Card Holder:</div>
                  <div>{paymentInfo.cardHolder}</div>
                  
                  <div className="text-muted-foreground">Expiry Date:</div>
                  <div>{paymentInfo.expiryDate}</div>
                </div>
              </div>
              
              <div className="rounded-md bg-primary/5 p-4 border border-primary/20">
                <h3 className="font-bold mb-2">Total: ${price}/{interval}</h3>
                <p className="text-sm text-muted-foreground">
                  By clicking "Confirm Payment", you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("payment")} disabled={loading}>
                Back
              </Button>
              <Button 
                onClick={handleConfirmation} 
                disabled={loading}
                className="min-w-[140px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Payment'
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
} 