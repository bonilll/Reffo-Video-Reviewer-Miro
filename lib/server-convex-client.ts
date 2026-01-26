import { ConvexHttpClient } from "convex/browser";

/**
 * Creates a Convex client for server-side use in API routes and server components
 */
export function createServerClient() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not defined");
  }
  
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
} 