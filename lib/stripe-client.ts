// Stripe client is temporarily disabled during migration.
export const stripePromise = null;

// Re-export types and constants that don't require Stripe instance
export type PlanType = 'free' | 'medium' | 'pro' | 'premium';
export type BillingInterval = 'monthly' | 'yearly';

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    boards: 1,
    referencesStorage: 5 * 1024 * 1024 * 1024, // 5GB in bytes - BETA_MODE_INCREASED from 500MB
    maxFileSize: 100 * 1024 * 1024, // 100MB in bytes
    todoLists: 2,
    privateGalleries: 0,
    collaboration: false,
    collaborators: 0, // Read-only access
    export: false,
    watermark: true,
  },
  medium: {
    boards: 3,
    referencesStorage: 15 * 1024 * 1024 * 1024, // 15GB in bytes
    maxFileSize: 200 * 1024 * 1024, // 200MB in bytes
    todoLists: 6,
    privateGalleries: 3,
    collaboration: true,
    collaborators: 3, // Up to 3 collaborators per board
    export: false, // Basic only
    watermark: false,
  },
  pro: {
    boards: 15,
    referencesStorage: 50 * 1024 * 1024 * 1024, // 50GB in bytes
    maxFileSize: 200 * 1024 * 1024, // 200MB in bytes
    todoLists: 20,
    privateGalleries: 10,
    collaboration: true,
    collaborators: 10, // Up to 10 collaborators per board
    export: true, // Full advanced export
    watermark: false,
    backup: true,
    analytics: false,
    api_access: false,
  },
  premium: {
    boards: -1, // Unlimited
    referencesStorage: 200 * 1024 * 1024 * 1024, // 200GB in bytes (expandable upon request)
    maxFileSize: 500 * 1024 * 1024, // 500MB in bytes
    todoLists: -1, // Unlimited
    privateGalleries: -1, // Unlimited
    collaboration: true,
    collaborators: -1, // Unlimited
    export: true, // Full advanced export
    watermark: false,
    backup: true,
    analytics: true,
    api_access: true,
  },
} as const;

// Plan information for UI
export const PLAN_INFO = {
  free: {
    name: 'Free',
    description: 'Perfect for getting started',
    price: { monthly: 0, yearly: 0 },
    popular: false,
  },
  medium: {
    name: 'Starter',
    description: 'Perfect for individual creators and students',
    price: { monthly: 3, yearly: 29.99 },
    popular: false,
  },
  pro: {
    name: 'Pro',
    description: 'Advanced features for professionals',
    price: { monthly: 5.99, yearly: 59.99 },
    popular: true,
  },
  premium: {
    name: 'Premium',
    description: 'Everything you need, unlimited',
    price: { monthly: 9.99, yearly: 99 },
    popular: false,
  },
} as const;

// Helper functions
export function getPlanLimits(planType: PlanType) {
  return PLAN_LIMITS[planType];
}

export function hasFeatureAccess(userPlan: PlanType, feature: keyof typeof PLAN_LIMITS.premium) {
  const limits = PLAN_LIMITS[userPlan];
  return limits[feature] === true || limits[feature] === -1;
}

export function canExceedLimit(userPlan: PlanType, limitType: keyof typeof PLAN_LIMITS.premium, currentValue: number) {
  const limit = PLAN_LIMITS[userPlan][limitType];
  if (limit === -1) return true; // Unlimited
  if (typeof limit === 'number' && limit > 0) {
    return currentValue < limit;
  }
  return false;
} 
