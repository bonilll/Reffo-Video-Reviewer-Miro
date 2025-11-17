# Cookie & Legal Compliance – Reffo Review

> Technical implementation notes. Replace placeholders (company info, vendors, cookie names) and obtain a lawyer’s approval before production use.

## Architecture summary

- **Consent categories**: `necessary`, `preferences`, `analytics`, `marketing` (see `utils/consentStorage.ts`). Only strictly necessary cookies run before opt‑in.
- **Frontend manager**: `ConsentProvider` (`contexts/ConsentContext.tsx`) exposes `hasConsent(category)`, banner controls, and preference modal. The provider persists consent locally (localStorage) and syncs with Convex.
- **Storage**:
  - Local: `reffo.visitorId` (pseudonymous id) and `reffo.cookieConsent` with categories + `consentVersion`.
  - Backend: `cookieConsents` table logs every change with timestamp, visitor/user id, locale, user agent. `legalAcceptances` keeps versioned acceptances for Privacy, Cookie, Terms.
- **Versioning**: `CONSENT_VERSION` constant lives in `ConsentContext`. Bump it whenever banners/policies change => forces banner to reappear. Legal docs expose their own `version` and `updatedAt` in `legal/legalContent.ts`.
- **Legal documents**: Draft English/Italian copies in `legal/legalContent.ts`, rendered via `components/legal/*.tsx`. They include placeholders (`[COMPANY_NAME]`, `[CONTACT_EMAIL]`, etc.) and a TODO note requiring legal review.
- **UI access**: Banner appears on first visit. Modal accessible via persistent floating button + footer links + legal pages. Links to Privacy / Terms / Cookie policy are available before login and inside the authenticated UI.

## Adding or updating consented services

1. Identify the category (preferences / analytics / marketing).
2. Update `CookiePreferencesModal` descriptions if needed.
3. List the service under the corresponding table in `legal/legalContent.ts` (Cookie Policy) with:
   - Cookie/script name
   - Provider
   - Purpose
   - Category
   - Duration
   - First/third party
4. Ensure the script/component that loads the service checks `useConsent().hasConsent('category')` **before** executing. Example:
   ```ts
   const { hasConsent } = useConsent();
   useEffect(() => {
     if (!hasConsent('analytics')) return;
     // init analytics SDK here
   }, [hasConsent]);
   ```
5. If a new cookie/purpose changes scope, bump `CONSENT_VERSION` and the document versions to force re-consent.

## Logging Terms / Privacy acceptance

- Call `api.compliance.acceptLegalDocument` when a user ticks “I accept Terms/Privacy” (e.g. during onboarding). Provide `documentType` (`'terms_of_use'`, `'privacy_policy'`, `'cookie_policy'`) and `documentVersion` (match `legal/legalContent.ts`). Optionally pass IP/User-Agent (remember GDPR minimization).
- Fetch current acceptances via `api.compliance.getLegalAcceptances` (supplies merged user/visitor records).

## Editing legal copy & translations

- Banner/modal/footers strings: `locales/legal.ts` (EN/IT). Add languages as needed.
- Policy content: `legal/legalContent.ts`. Replace placeholders with real controller info, vendors, cookie names, legal references.
- Components rendering documents: `components/legal/*.tsx`.
- Always add a TODO comment when lawyers must review changes.

## Asking consent again

- Increase `CONSENT_VERSION` and update policy versions when:
  - Introducing new cookies/vendors that change purpose.
  - Modifying legal basis or wording significantly.
- Communicate to users (email/in-app) before forcing re-consent.

## Data minimization & GDPR reminders

- `cookieConsents` stores only needed metadata (visitorId, optional IP/UA if provided). Pass IP only if you have a lawful basis.
- Avoid logging full content of comments/files in consent records.
- Keep raw consent logs for auditing but delete older entries per retention schedule defined by legal.

## TODO / Manual steps

- [ ] Replace placeholders `[COMPANY_NAME]`, `[REGISTERED_ADDRESS]`, `[VAT_NUMBER]`, `[CONTACT_EMAIL]`, `[CITY]`.
- [ ] Populate Cookie Policy table with real cookie names, providers, durations.
- [ ] Configure real analytics/marketing scripts to respect `hasConsent`.
- [ ] Review translations and supply professional localization if needed.
- [ ] Legal counsel must validate every document before publishing.
