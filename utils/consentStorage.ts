const VISITOR_KEY = 'reffo.visitorId';
const CONSENT_KEY = 'reffo.cookieConsent';

export type ConsentCategories = {
  necessary: boolean;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type StoredConsent = {
  consentVersion: string;
  categories: ConsentCategories;
  consentGiven: boolean;
  updatedAt: number;
};

export const CONSENT_EXPIRY_MS = 180 * 24 * 60 * 60 * 1000; // 6 months

export const defaultCategories: ConsentCategories = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(VISITOR_KEY, generated);
  return generated;
}

export function loadStoredConsent(): StoredConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed;
  } catch {
    return null;
  }
}

export function persistConsent(consent: StoredConsent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
}

export function hasValidConsent(consent: StoredConsent | null, consentVersion: string): boolean {
  if (!consent) return false;
  if (consent.consentVersion !== consentVersion) return false;
  if (Date.now() - consent.updatedAt > CONSENT_EXPIRY_MS) return false;
  return consent.consentGiven;
}
