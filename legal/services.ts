import { SupportedLocale } from '../locales/legal';

export type ServiceItem = {
  name: string;
  provider: string;
  purpose: string;
};

export type ServicesByCategory = {
  necessary: ServiceItem[];
  preferences: ServiceItem[];
  analytics: ServiceItem[];
  marketing: ServiceItem[];
};

// Draft list. Replace placeholders with actual vendors and purposes.
export const getServicesByCategory = (locale: SupportedLocale): ServicesByCategory => {
  const t = (en: string, it: string) => (locale === 'it' ? it : en);
  return {
    necessary: [
      {
        name: 'Authentication cookies',
        provider: 'Clerk',
        purpose: t('Keep your session active and secure', 'Mantengono la sessione attiva e sicura'),
      },
      {
        name: 'Realtime / API session',
        provider: 'Convex',
        purpose: t('Enable realtime data and API communication', 'Abilitano dati in tempo reale e comunicazione API'),
      },
      {
        name: 'Uploads / Storage',
        provider: 'MinIO / S3 compatible',
        purpose: t('Handle secure upload/download of media assets', 'Gestiscono caricamento/scaricamento sicuro dei file'),
      },
    ],
    preferences: [
      {
        name: 'UI theme',
        provider: 'Reffo Review',
        purpose: t('Remember your light/dark choice', 'Ricorda la scelta di tema chiaro/scuro'),
      },
      {
        name: 'Language',
        provider: 'Reffo Review',
        purpose: t('Remember preferred language', 'Ricorda la lingua preferita'),
      },
    ],
    analytics: [
      {
        name: 'Google Analytics (gtag.js)',
        provider: 'Google LLC',
        purpose: t('Aggregated usage statistics (loaded only after consent)', 'Statistiche di utilizzo aggregate (caricato solo dopo il consenso)'),
      },
    ],
    marketing: [],
  };
};
