
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import './index.css';
import { ConsentProvider } from './contexts/ConsentContext';
import { CookieBanner } from './components/legal/CookieBanner';
import { CookiePreferencesModal } from './components/legal/CookiePreferencesModal';
import { CookieSettingsTrigger } from './components/legal/CookieSettingsTrigger';
import { GoogleAnalytics } from './components/analytics/GoogleAnalytics';

// Prefer self-hosted Convex URL if provided; fallback to legacy VITE_CONVEX_URL
const convexUrl =
  (import.meta as any)?.env?.VITE_CONVEX_SELF_HOSTED_URL ||
  (import.meta as any)?.env?.VITE_CONVEX_URL;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_SELF_HOSTED_URL or VITE_CONVEX_URL environment variable');
}

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

const convex = new ConvexReactClient(convexUrl);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ConsentProvider>
          <App />
          <CookieBanner />
          <CookiePreferencesModal />
          <CookieSettingsTrigger />
          <GoogleAnalytics />
        </ConsentProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </React.StrictMode>
);
