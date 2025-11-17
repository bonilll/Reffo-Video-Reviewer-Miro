import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { LEGAL_COPY, SupportedLocale, detectLocale } from '../locales/legal';
import {
  ConsentCategories,
  StoredConsent,
  defaultCategories,
  getVisitorId,
  hasValidConsent,
  loadStoredConsent,
  persistConsent,
} from '../utils/consentStorage';

export const CONSENT_VERSION = '2025-02-01'; // TODO legal review before changing

export type ConsentContextValue = {
  locale: SupportedLocale;
  text: typeof LEGAL_COPY[SupportedLocale];
  categories: ConsentCategories;
  consentGiven: boolean;
  bannerVisible: boolean;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (next: ConsentCategories) => void;
  hasConsent: (category: keyof ConsentCategories) => boolean;
  visitorId: string | null;
  setLocale: (next: SupportedLocale) => void;
};

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

export const ConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [consent, setConsent] = useState<StoredConsent | null>(() => loadStoredConsent());
  const [bannerVisible, setBannerVisible] = useState<boolean>(() => !hasValidConsent(loadStoredConsent(), CONSENT_VERSION));
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const upsertConsent = useMutation(api.compliance.upsertConsent);

  useEffect(() => {
    setLocale(detectLocale());
    setVisitorId(getVisitorId());
  }, []);

  // Backend sync is performed by a nested component wrapped in an error boundary,
  // so a missing backend function won't crash the whole app.

  const persistAndSync = async (categories: ConsentCategories, consentGiven: boolean) => {
    const payload: StoredConsent = {
      consentVersion: CONSENT_VERSION,
      categories,
      consentGiven,
      updatedAt: Date.now(),
    };
    setConsent(payload);
    persistConsent(payload);
    if (visitorId) {
      try {
        await upsertConsent({
          visitorId,
          consentVersion: CONSENT_VERSION,
          categories,
          consentGiven,
          locale,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        });
      } catch (err) {
        console.error('Failed to sync cookie consent', err);
      }
    }
  };

  const acceptAll = () => {
    const categories: ConsentCategories = {
      necessary: true,
      preferences: true,
      analytics: true,
      // Owner requested to remove marketing/profiling; keep false and unused
      marketing: false,
    };
    void persistAndSync(categories, true);
    setBannerVisible(false);
    setPreferencesOpen(false);
  };

  const rejectAll = () => {
    const categories: ConsentCategories = { ...defaultCategories };
    void persistAndSync(categories, false);
    setBannerVisible(false);
    setPreferencesOpen(false);
  };

  const savePreferences = (next: ConsentCategories) => {
    const categories: ConsentCategories = {
      necessary: true,
      preferences: next.preferences,
      analytics: next.analytics,
      marketing: false,
    };
    const consentGiven = categories.preferences || categories.analytics;
    void persistAndSync(categories, consentGiven);
    setBannerVisible(false);
    setPreferencesOpen(false);
  };

  const hasConsent = (category: keyof ConsentCategories) => {
    if (category === 'necessary') return true;
    return Boolean(consent?.categories?.[category]);
  };

  const text = LEGAL_COPY[locale];

  const contextValue: ConsentContextValue = useMemo(
    () => ({
      locale,
      text,
      categories: consent?.categories ?? defaultCategories,
      consentGiven: hasValidConsent(consent, CONSENT_VERSION),
      bannerVisible,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptAll,
      rejectAll,
      savePreferences,
      hasConsent,
      visitorId,
      setLocale: (next) => {
        try { window.localStorage.setItem('reffo:legal_locale', next); } catch {}
        setLocale(next);
      },
    }),
    [locale, text, consent, bannerVisible, preferencesOpen, visitorId],
  );

  const enableBackend =
    typeof import.meta !== 'undefined' &&
    Boolean(((import.meta as any).env?.VITE_ENABLE_COMPLIANCE_BACKEND || '').toString() === '1');

  return (
    <ConsentContext.Provider value={contextValue}>
      {children}
      {/* Safe backend sync guarded by error boundary and only when visitorId exists */}
      {visitorId && enableBackend && (
        <ConsentErrorBoundary>
          <ConsentSync
            visitorId={visitorId}
            onSync={(payload) => {
              setConsent(payload);
              persistConsent(payload);
              setBannerVisible(!hasValidConsent(payload, CONSENT_VERSION));
            }}
          />
        </ConsentErrorBoundary>
      )}
    </ConsentContext.Provider>
  );
};

// Safe fetcher that syncs remote consent to local state. Wrapped by an error boundary higher up.
export const ConsentSync: React.FC<{ visitorId: string; onSync: (payload: StoredConsent) => void }>
  = ({ visitorId, onSync }) => {
  const remote = useQuery(api.compliance.getConsent, { visitorId });
  useEffect(() => {
    if (!remote) return;
    const next: StoredConsent = {
      consentVersion: remote.consentVersion,
      categories: remote.categories,
      consentGiven: remote.consentGiven,
      updatedAt: remote.updatedAt,
    };
    onSync(next);
  }, [remote, onSync]);
  return null;
};

class ConsentErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.warn('Consent sync suppressed error', err); }
  render() { return this.state.hasError ? null : this.props.children; }
}

export const useConsent = () => {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider');
  return ctx;
};
