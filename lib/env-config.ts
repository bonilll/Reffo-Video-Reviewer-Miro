/**
 * Configuration utility to handle environment variables between local and production
 * It automatically detects if we're running in development or production
 */

interface EnvConfig {
  convexUrl: string;
  clerkPublishableKey: string;
  liveblocksPublicKey: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

/**
 * Check if we're running on localhost/development environment
 */
export const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') {
    // For server-side rendering
    return process.env.NODE_ENV === 'development';
  }
  
  // For client-side
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.')
  );
};

/**
 * Get the appropriate environment variables based on the environment
 */
export const getEnvConfig = (): EnvConfig => {
  // In production, we'll always use the production env variables
  // In development, we'll use the local ones

  if (isLocalhost()) {
    // Development/Local environment
    return {
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL || '',
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
      liveblocksPublicKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY || '',
      minioEndpoint: process.env.MINIO_ENDPOINT || '',
      minioAccessKey: process.env.MINIO_ACCESS_KEY || '',
      minioSecretKey: process.env.MINIO_SECRET_KEY || '',
      firebaseConfig: {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
      }
    };
  } else {
    // Production environment - uses Vercel env variables
    return {
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL || '',
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
      liveblocksPublicKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY || '',
      minioEndpoint: process.env.MINIO_ENDPOINT || '',
      minioAccessKey: process.env.MINIO_ACCESS_KEY || '',
      minioSecretKey: process.env.MINIO_SECRET_KEY || '',
      firebaseConfig: {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
      }
    };
  }
};

// Default export for easier imports
export default getEnvConfig; 