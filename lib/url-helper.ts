"use client";

/**
 * Converts a relative URL to an absolute URL with the correct origin
 * Useful for converting /dev-uploads/* paths to absolute URLs for Convex
 */
export function getAbsoluteUrl(url: string): string {
  // If it's already an absolute URL, return it as is
  if (url.startsWith('http')) {
    return url;
  }
  
  // In browser environment, use window.location to get the origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
  }
  
  // Fallback for server-side usage
  // In a production environment, you'd likely use an environment variable here
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
} 