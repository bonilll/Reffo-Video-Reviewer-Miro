import { SupportedLocale } from '../locales/legal';

export type ServiceItem = {
  name: string;
  provider: string;
  purpose: string;
  identifiers: string;
  duration: string;
};

export type ServicesByCategory = {
  necessary: ServiceItem[];
  preferences: ServiceItem[];
  analytics: ServiceItem[];
  marketing: ServiceItem[];
};

export const getServicesByCategory = (locale: SupportedLocale): ServicesByCategory => {
  const t = (en: string, it: string) => (locale === 'it' ? it : en);

  return {
    necessary: [
      {
        name: 'Consent manager',
        provider: 'Reffo',
        purpose: t(
          'Stores and applies your cookie choices.',
          'Memorizza e applica le tue scelte cookie.'
        ),
        identifiers: 'reffo.cookieConsent, reffo.visitorId',
        duration: t('180 days / persistent localStorage', '180 giorni / localStorage persistente'),
      },
      {
        name: 'Authentication session',
        provider: 'Clerk',
        purpose: t(
          'Manages secure login and authenticated sessions.',
          'Gestisce login sicuro e sessione autenticata.'
        ),
        identifiers: '__session, __client, __client_uat (or equivalent)',
        duration: t('Session + short-lived persistent cookies', 'Sessione + cookie persistenti di breve durata'),
      },
    ],
    preferences: [
      {
        name: 'UI preferences',
        provider: 'Reffo',
        purpose: t(
          'Stores theme, language, and workspace view settings.',
          'Salva tema, lingua e impostazioni di visualizzazione workspace.'
        ),
        identifiers: 'reffo:theme, reffo:legal_locale, dashboard/project preference keys',
        duration: t('Persistent until manual deletion', 'Persistente fino a cancellazione manuale'),
      },
    ],
    analytics: [
      {
        name: 'Google Analytics (gtag.js)',
        provider: 'Google LLC',
        purpose: t(
          'Aggregated usage statistics (loaded only after analytics consent).',
          'Statistiche di utilizzo aggregate (caricate solo dopo consenso analytics).'
        ),
        identifiers: '_ga, _gid, _gat',
        duration: t('_ga: 2 years, _gid: 24h, _gat: 1 minute', '_ga: 2 anni, _gid: 24h, _gat: 1 minuto'),
      },
    ],
    marketing: [],
  };
};
