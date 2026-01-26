"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexHttpClient } from "convex/browser";

// Client React per l'uso nei componenti React
export const convexReactClient = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);

// Funzione per creare un client Convex per l'uso nelle server actions
export function createClient() {
  return new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL!
  );
} 