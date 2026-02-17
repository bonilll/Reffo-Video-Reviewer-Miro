const readEnv = (key: string): string | null => {
  try {
    const value = (import.meta as any)?.env?.[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

const nonEmpty = (value: string | null | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export const LEGAL_CONFIG = {
  brandName: nonEmpty(readEnv('VITE_LEGAL_BRAND_NAME'), 'Reffo'),
  legalEntityName: nonEmpty(readEnv('VITE_LEGAL_ENTITY_NAME'), 'Reffo Studio'),
  registeredAddress: nonEmpty(
    readEnv('VITE_LEGAL_REGISTERED_ADDRESS'),
    'Italia (indirizzo completo disponibile su richiesta via email)'
  ),
  vatNumber: readEnv('VITE_LEGAL_VAT_NUMBER'),
  reaNumber: readEnv('VITE_LEGAL_REA_NUMBER'),
  legalEmail: nonEmpty(readEnv('VITE_LEGAL_EMAIL'), 'legal@reffo.studio'),
  privacyEmail: nonEmpty(readEnv('VITE_PRIVACY_EMAIL'), 'privacy@reffo.studio'),
  abuseEmail: nonEmpty(readEnv('VITE_ABUSE_EMAIL'), 'abuse@reffo.studio'),
  dsaEmail: nonEmpty(readEnv('VITE_DSA_EMAIL'), 'dsa@reffo.studio'),
  supportEmail: nonEmpty(readEnv('VITE_SUPPORT_EMAIL'), 'support@reffo.studio'),
  jurisdictionCity: nonEmpty(readEnv('VITE_LEGAL_JURISDICTION_CITY'), 'Milano'),
  website: nonEmpty(readEnv('VITE_PUBLIC_SITE_URL'), 'https://reffo.studio'),
};

export const LEGAL_DISPLAY = {
  controllerLine: `${LEGAL_CONFIG.legalEntityName}, ${LEGAL_CONFIG.registeredAddress}`,
  vatLine: LEGAL_CONFIG.vatNumber
    ? `P.IVA ${LEGAL_CONFIG.vatNumber}${LEGAL_CONFIG.reaNumber ? ` · REA ${LEGAL_CONFIG.reaNumber}` : ''}`
    : LEGAL_CONFIG.reaNumber
      ? `REA ${LEGAL_CONFIG.reaNumber}`
      : 'Dati fiscali disponibili su richiesta',
};
