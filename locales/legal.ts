export type SupportedLocale = 'en' | 'it';

export const LEGAL_COPY: Record<SupportedLocale, {
  cookieBanner: {
    title: string;
    description: string;
    acceptAll: string;
    rejectAll: string;
    customize: string;
  };
  cookieModal: {
    title: string;
    description: string;
    save: string;
    acceptAll: string;
    rejectAll: string;
    necessaryTitle: string;
    necessarySummary: string;
    preferencesTitle: string;
    preferencesSummary: string;
    analyticsTitle: string;
    analyticsSummary: string;
    marketingTitle: string;
    marketingSummary: string;
    servicesLabel: string;
  };
  footer: {
    cookieSettings: string;
    privacy: string;
    terms: string;
    cookies: string;
  };
}> = {
  en: {
    cookieBanner: {
      title: 'We respect your privacy',
      description:
        'We use cookies to keep the platform secure, remember your preferences, and, with your consent, analyse traffic and deliver personalized experiences.',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Manage preferences',
    },
    cookieModal: {
      title: 'Cookie preferences',
      description:
        'Choose the categories you want to enable. You can update your choice at any time from the “Cookie settings” link.',
      save: 'Save selection',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      necessaryTitle: 'Strictly necessary',
      necessarySummary:
        'Required for the core features of Reffo Review (authentication, uploads, security). These cookies are always active.',
      preferencesTitle: 'Preferences',
      preferencesSummary:
        'Used to remember interface settings, such as language, theme, and preferred review layouts.',
      analyticsTitle: 'Analytics',
      analyticsSummary:
        'Allow us to measure usage, improve performance, and understand how teams collaborate (aggregated statistics).',
      marketingTitle: 'Marketing / Profiling',
      marketingSummary:
        'Enable integrations with communication and advertising tools to offer relevant content about Reffo.',
      servicesLabel: 'Included services',
    },
    footer: {
      cookieSettings: 'Cookie settings',
      privacy: 'Privacy Policy',
      terms: 'Terms of Use',
      cookies: 'Cookie Policy',
    },
  },
  it: {
    cookieBanner: {
      title: 'Rispettiamo la tua privacy',
      description:
        'Utilizziamo cookie per garantire sicurezza e funzionalità essenziali, ricordare le tue preferenze e, previo consenso, analizzare il traffico e proporti contenuti personalizzati.',
      acceptAll: 'Accetta tutto',
      rejectAll: 'Rifiuta tutto',
      customize: 'Gestisci preferenze',
    },
    cookieModal: {
      title: 'Preferenze cookie',
      description:
        'Seleziona le categorie che desideri abilitare. Puoi modificare la scelta in qualunque momento dal link “Impostazioni cookie”.',
      save: 'Salva selezione',
      acceptAll: 'Accetta tutto',
      rejectAll: 'Rifiuta tutto',
      necessaryTitle: 'Strettamente necessari',
      necessarySummary:
        "Indispensabili per le funzioni principali di Reffo Review (autenticazione, caricamenti, sicurezza). Sono sempre attivi.",
      preferencesTitle: 'Preferenze',
      preferencesSummary:
        'Memorizzano lingua, tema e layout preferiti per offrirti un’esperienza coerente.',
      analyticsTitle: 'Statistiche',
      analyticsSummary:
        'Ci aiutano a comprendere come viene utilizzata la piattaforma e a migliorarne le prestazioni (dati aggregati).',
      marketingTitle: 'Marketing / profilazione',
      marketingSummary:
        'Consentono integrazioni con strumenti di comunicazione e promozione per proporti contenuti rilevanti su Reffo.',
      servicesLabel: 'Servizi inclusi',
    },
    footer: {
      cookieSettings: 'Impostazioni cookie',
      privacy: 'Informativa Privacy',
      terms: "Termini d'uso",
      cookies: 'Cookie policy',
    },
  },
};

export const detectLocale = (): SupportedLocale => {
  // 1) Runtime override from localStorage (set by LanguageSwitcher)
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('reffo:legal_locale');
      if (stored === 'en' || stored === 'it') return stored as SupportedLocale;
    }
  } catch {}
  // 2) Allow forcing locale via env (e.g., VITE_LEGAL_LOCALE=en)
  try {
    const forced = (import.meta as any)?.env?.VITE_LEGAL_LOCALE as string | undefined;
    if (forced === 'en' || forced === 'it') return forced as SupportedLocale;
  } catch {}
  // 3) Default to English
  return 'en';
};
