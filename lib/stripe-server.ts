import Stripe from 'stripe';

// Initialize Stripe server-side
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set - using test configuration');
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-05-28.basil',
      typescript: true,
    })
  : null;

// Stripe Price IDs with fallback values for testing
export const STRIPE_PRICE_IDS = {
  medium: {
    monthly: process.env.STRIPE_MEDIUM_MONTHLY_PRICE_ID || 'price_test_medium_monthly',
    yearly: process.env.STRIPE_MEDIUM_YEARLY_PRICE_ID || 'price_test_medium_yearly',
  },
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_test_pro_monthly',
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_test_pro_yearly',
  },
  premium: {
    monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_test_premium_monthly',
    yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || 'price_test_premium_yearly',
  },
} as const;

// Helper functions for server-side use
export function getPriceId(planType: 'medium' | 'pro' | 'premium', interval: 'monthly' | 'yearly') {
  const priceId = STRIPE_PRICE_IDS[planType][interval];
  return priceId;
}

// Create test products function for development
export async function createTestProducts() {
  if (!stripe) {
    throw new Error('Stripe not initialized');
  }

  try {
    // Create Medium Plan
    const mediumProduct = await stripe.products.create({
      name: 'Reffo Medium',
      description: 'Perfect for individual creators',
    });

    const mediumMonthly = await stripe.prices.create({
      product: mediumProduct.id,
      unit_amount: 300, // €3.00
      currency: 'eur',
      recurring: { interval: 'month' },
    });

    const mediumYearly = await stripe.prices.create({
      product: mediumProduct.id,
      unit_amount: 2999, // €29.99
      currency: 'eur',
      recurring: { interval: 'year' },
    });

    // Create Pro Plan
    const proProduct = await stripe.products.create({
      name: 'Reffo Pro',
      description: 'Advanced features for professionals',
    });

    const proMonthly = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 599, // €5.99
      currency: 'eur',
      recurring: { interval: 'month' },
    });

    const proYearly = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 5999, // €59.99
      currency: 'eur',
      recurring: { interval: 'year' },
    });

    // Create Premium Plan
    const premiumProduct = await stripe.products.create({
      name: 'Reffo Premium',
      description: 'Everything you need, unlimited',
    });

    const premiumMonthly = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: 999, // €9.99
      currency: 'eur',
      recurring: { interval: 'month' },
    });

    const premiumYearly = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: 9900, // €99.00
      currency: 'eur',
      recurring: { interval: 'year' },
    });

    return {
      medium: {
        monthly: mediumMonthly.id,
        yearly: mediumYearly.id,
      },
      pro: {
        monthly: proMonthly.id,
        yearly: proYearly.id,
      },
      premium: {
        monthly: premiumMonthly.id,
        yearly: premiumYearly.id,
      },
    };
  } catch (error) {
    console.error('Error creating test products:', error);
    throw error;
  }
}

// Webhook events we care about
export const STRIPE_WEBHOOK_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'checkout.session.completed',
] as const;
