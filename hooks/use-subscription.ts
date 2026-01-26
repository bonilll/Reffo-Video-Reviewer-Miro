"use client";

export function useSubscription() {
  return {
    subscription: null,
    usage: null,
    isLoading: false,
    createCheckoutSession: async () => {},
    createPortalSession: async () => {},
  };
}
