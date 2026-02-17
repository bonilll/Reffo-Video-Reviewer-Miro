# Cookie & Legal Compliance – Reffo

## Current implementation summary

- Consent categories are managed in `contexts/ConsentContext.tsx` and persisted in local storage.
- Consent is versioned via `CONSENT_VERSION`.
- Optional analytics (Google Analytics) is loaded only after analytics consent.
- Consent history is stored in Convex (`cookieConsents`).
- Legal acceptance history (Terms/Privacy/Cookie policy) is stored in Convex (`legalAcceptances`).

## Legal documents

- Source of truth: `legal/legalContent.ts`.
- Runtime legal metadata (entity/contacts) is read from `legal/legalConfig.ts` via `VITE_LEGAL_*` variables.
- Document versions are centralized in `LEGAL_DOCUMENT_VERSIONS`.

## Signup and acceptance flow

- During sign-up mode, the UI requires:
  - acceptance of Terms/Privacy/Cookie policy;
  - age confirmation (14+).
- Acceptances are written before account creation (visitor-based) and are later linkable to authenticated users.
- Existing signed-in users are blocked by a legal gate until they accept latest versions.

## Technologies inventory

- The operational inventory is maintained in:
  - `legal/legalContent.ts` (formal policy table),
  - `legal/services.ts` (UI matrix used by cookie settings pages/modal).

## Important maintenance rules

1. If legal scope changes, bump:
   - `LEGAL_DOCUMENT_VERSIONS` in `legal/legalContent.ts`, and
   - `CONSENT_VERSION` in `contexts/ConsentContext.tsx` when cookie scope changes.
2. Keep `VITE_LEGAL_*` values aligned with real company legal data.
3. Any new optional tracker must be blocked until consent and added to both inventories.
