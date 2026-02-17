import { SupportedLocale } from '../locales/legal';
import { LEGAL_CONFIG, LEGAL_DISPLAY } from './legalConfig';

export type LegalSection = {
  heading: string;
  body: string[];
};

export type LegalTableRow = {
  name: string;
  provider: string;
  purpose: string;
  category: string;
  duration: string;
  type: string;
};

export type LegalDocument = {
  title: string;
  version: string;
  updatedAt: string;
  sections: LegalSection[];
  tables?: Array<{ heading: string; rows: LegalTableRow[] }>;
};

type LegalDocs = Record<SupportedLocale, LegalDocument>;

export const LEGAL_DOCUMENT_VERSIONS = {
  privacy_policy: '2026-02-17.2',
  cookie_policy: '2026-02-17.2',
  terms_of_use: '2026-02-17.2',
} as const;

const itUpdatedAt = '17/02/2026';
const enUpdatedAt = '2026-02-17';

const sharedCookieRowsEn: LegalTableRow[] = [
  {
    name: 'reffo.cookieConsent (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Stores consent categories, consent version, and latest update timestamp.',
    category: 'Strictly necessary',
    duration: '180 days from last choice',
    type: 'First-party localStorage',
  },
  {
    name: 'reffo.visitorId (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Pseudonymous visitor identifier used to keep consent preference continuity before login.',
    category: 'Strictly necessary',
    duration: 'Persistent until manual deletion',
    type: 'First-party localStorage',
  },
  {
    name: '__session / __client / __client_uat (or equivalent Clerk cookies)',
    provider: 'Clerk, Inc.',
    purpose: 'Authentication session, security checks, and account continuity.',
    category: 'Strictly necessary',
    duration: 'Session and short-lived persistent cookies (provider-managed)',
    type: 'Third-party / first-party (depending on deployment)',
  },
  {
    name: 'reffo:theme, reffo:legal_locale, dashboard/project workspace preference keys (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Saves interface preferences such as theme, language, and view options.',
    category: 'Preferences',
    duration: 'Persistent until manual deletion',
    type: 'First-party localStorage',
  },
  {
    name: '_ga',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Distinguishes users in aggregated analytics reports.',
    category: 'Analytics',
    duration: '2 years',
    type: 'Third-party analytics cookie',
  },
  {
    name: '_gid',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Distinguishes users for short-term analytics aggregation.',
    category: 'Analytics',
    duration: '24 hours',
    type: 'Third-party analytics cookie',
  },
  {
    name: '_gat (where used by Google Analytics)',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Rate-limits request volume.',
    category: 'Analytics',
    duration: '1 minute',
    type: 'Third-party analytics cookie',
  },
];

const sharedCookieRowsIt: LegalTableRow[] = [
  {
    name: 'reffo.cookieConsent (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Memorizza categorie di consenso, versione del consenso e timestamp dell’ultima scelta.',
    category: 'Strettamente necessario',
    duration: '180 giorni dall’ultima scelta',
    type: 'LocalStorage di prima parte',
  },
  {
    name: 'reffo.visitorId (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Identificativo pseudonimo visitatore per mantenere continuità del consenso prima del login.',
    category: 'Strettamente necessario',
    duration: 'Persistente fino a cancellazione manuale',
    type: 'LocalStorage di prima parte',
  },
  {
    name: '__session / __client / __client_uat (o cookie Clerk equivalenti)',
    provider: 'Clerk, Inc.',
    purpose: 'Sessione di autenticazione, controlli di sicurezza e continuità account.',
    category: 'Strettamente necessario',
    duration: 'Sessione e cookie persistenti di breve durata (gestiti dal fornitore)',
    type: 'Terza parte / prima parte (in base al deployment)',
  },
  {
    name: 'reffo:theme, reffo:legal_locale, chiavi preferenze dashboard/workspace (localStorage)',
    provider: LEGAL_CONFIG.brandName,
    purpose: 'Salva preferenze interfaccia come tema, lingua e modalità di visualizzazione.',
    category: 'Preferenze',
    duration: 'Persistente fino a cancellazione manuale',
    type: 'LocalStorage di prima parte',
  },
  {
    name: '_ga',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Distingue gli utenti nei report statistici aggregati.',
    category: 'Statistiche',
    duration: '2 anni',
    type: 'Cookie analytics di terza parte',
  },
  {
    name: '_gid',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Distingue gli utenti per analisi aggregate di breve periodo.',
    category: 'Statistiche',
    duration: '24 ore',
    type: 'Cookie analytics di terza parte',
  },
  {
    name: '_gat (se utilizzato da Google Analytics)',
    provider: 'Google LLC (Google Analytics)',
    purpose: 'Limita la frequenza delle richieste.',
    category: 'Statistiche',
    duration: '1 minuto',
    type: 'Cookie analytics di terza parte',
  },
];

export const PRIVACY_POLICY: LegalDocs = {
  en: {
    title: 'Privacy Policy',
    version: LEGAL_DOCUMENT_VERSIONS.privacy_policy,
    updatedAt: enUpdatedAt,
    sections: [
      {
        heading: '1. Controller and contacts',
        body: [
          `${LEGAL_CONFIG.brandName} is provided by ${LEGAL_DISPLAY.controllerLine}.`,
          `${LEGAL_DISPLAY.vatLine}.`,
          `Privacy contact: ${LEGAL_CONFIG.privacyEmail}. General legal contact: ${LEGAL_CONFIG.legalEmail}. DSA/content notice contact: ${LEGAL_CONFIG.dsaEmail}.`,
        ],
      },
      {
        heading: '2. Scope and roles',
        body: [
          'This notice applies to website visitors, registered users, invited collaborators, and recipients of shared links.',
          `For service operation and account management, ${LEGAL_CONFIG.brandName} acts as data controller.`,
          'Workspace owners and users remain responsible for ensuring they have a valid legal basis for personal data included in files, comments, invites, and other content they upload.',
        ],
      },
      {
        heading: '3. Data we process',
        body: [
          'Account and identity data: email, authentication identifiers, profile name/avatar, role and account metadata.',
          'Collaboration data: projects, boards, media files, review comments, annotations, mentions, share links/tokens, and audit trail events.',
          'Technical and security data: timestamps, device/browser metadata, application logs, and anti-abuse signals (including IP-related technical data where necessary).',
          'Compliance data: cookie choices, legal acceptance logs (document, version, timestamp), and records needed to handle legal notices.',
        ],
      },
      {
        heading: '4. Purposes and legal bases (GDPR art. 6)',
        body: [
          'Contract performance (art. 6(1)(b)): account access, workspace collaboration, media upload/review, sharing, and core support.',
          'Legitimate interests (art. 6(1)(f)): platform security, fraud/abuse prevention, diagnostics, moderation operations, and service improvement.',
          'Compliance with legal obligations (art. 6(1)(c)): mandatory retention, responses to competent authorities, and legal defense.',
          'Consent (art. 6(1)(a)): optional analytics and optional non-essential preference technologies.',
        ],
      },
      {
        heading: '5. Data sources and visibility settings',
        body: [
          'Most data is provided directly by users and workspace administrators (account forms, uploads, comments, invitations, settings).',
          'Some data is generated automatically by service usage (logs, usage diagnostics, security telemetry) or provided by identity providers during sign-in.',
          'Shared links and public collaboration areas may intentionally expose names, avatars, comments, and uploaded content to anyone with the link or access to that area.',
        ],
      },
      {
        heading: '6. Recipients and processors',
        body: [
          'Data may be processed by infrastructure and SaaS providers used to deliver the service (for example authentication, hosting/storage, realtime collaboration, analytics, messaging, and customer support tooling).',
          'Providers act as processors/sub-processors under contractual safeguards and are limited to service-delivery purposes.',
          'Data may also be disclosed where required by law, lawful authority request, or to protect rights, security, and integrity of users and the platform.',
        ],
      },
      {
        heading: '7. International transfers',
        body: [
          'Where personal data is transferred outside the EEA, transfers rely on adequacy decisions or appropriate safeguards (for example Standard Contractual Clauses), plus supplementary measures where required.',
          'Transfer details can be requested at the privacy contact address above.',
        ],
      },
      {
        heading: '8. Retention periods',
        body: [
          'Account/workspace data is retained for the account lifetime and then removed, deleted, or anonymized according to operational and legal requirements.',
          'Security and technical logs are generally retained for up to 12 months, unless longer retention is necessary for incident handling or legal defense.',
          'Consent and legal-acceptance logs are retained for evidentiary/accountability purposes while legal obligations persist.',
        ],
      },
      {
        heading: '9. Security and incident response',
        body: [
          'We apply technical and organizational safeguards proportionate to risk, including authentication controls, encrypted transport (HTTPS), role-based permissions, and auditability of critical operations.',
          'No system can guarantee absolute security. If you suspect unauthorized access, contact support/legal as soon as possible.',
        ],
      },
      {
        heading: '10. Public content reporting and moderation',
        body: [
          `If you identify allegedly illegal content or policy violations, send a notice to ${LEGAL_CONFIG.abuseEmail} or ${LEGAL_CONFIG.dsaEmail} including link/location, reasons, and supporting context.`,
          'To protect users and comply with law, we may review reported content and related technical evidence, restrict visibility, suspend access, and preserve records where necessary.',
        ],
      },
      {
        heading: '11. Automated processing and AI-assisted features',
        body: [
          'Certain operations may use automated analysis for security, abuse detection, deduplication, or similarity/recommendation workflows within the product.',
          'We do not intentionally use solely automated decisions that produce legal or similarly significant effects on users.',
        ],
      },
      {
        heading: '12. Data subject rights',
        body: [
          'You may request access, rectification, erasure, restriction, portability, objection, and consent withdrawal where applicable.',
          `Requests: ${LEGAL_CONFIG.privacyEmail}.`,
          'You may lodge a complaint with your local Supervisory Authority (for Italy: Garante per la Protezione dei Dati Personali).',
        ],
      },
      {
        heading: '13. Children and minimum age',
        body: [
          'The service is not intended for children under the minimum digital consent age applicable in the user’s country.',
          'For users in Italy, independent consent to information-society services requires age 14 or above.',
        ],
      },
      {
        heading: '14. Updates',
        body: [
          'We may update this notice for regulatory, technical, or product changes. Material updates are notified in-app or by email when required.',
        ],
      },
    ],
  },
  it: {
    title: 'Informativa Privacy',
    version: LEGAL_DOCUMENT_VERSIONS.privacy_policy,
    updatedAt: itUpdatedAt,
    sections: [
      {
        heading: '1. Titolare e contatti',
        body: [
          `Il servizio ${LEGAL_CONFIG.brandName} è fornito da ${LEGAL_DISPLAY.controllerLine}.`,
          `${LEGAL_DISPLAY.vatLine}.`,
          `Contatto privacy: ${LEGAL_CONFIG.privacyEmail}. Contatto legale generale: ${LEGAL_CONFIG.legalEmail}. Contatto DSA/segnalazioni contenuti: ${LEGAL_CONFIG.dsaEmail}.`,
        ],
      },
      {
        heading: '2. Ambito e ruoli',
        body: [
          'La presente informativa si applica a visitatori del sito, utenti registrati, collaboratori invitati e destinatari di link condivisi.',
          `Per l’operatività del servizio e la gestione account, ${LEGAL_CONFIG.brandName} agisce come titolare del trattamento.`,
          'I titolari dei workspace e gli utenti restano responsabili di avere una base giuridica valida per i dati personali inseriti in file, commenti, inviti e contenuti caricati.',
        ],
      },
      {
        heading: '3. Dati trattati',
        body: [
          'Dati account e identita: email, identificativi autenticazione, nome/avatar profilo, ruolo e metadati account.',
          'Dati di collaborazione: progetti, board, file media, commenti review, annotazioni, mention, link/token di condivisione, eventi di audit.',
          'Dati tecnici e sicurezza: timestamp, metadati dispositivo/browser, log applicativi e segnali anti-abuso (inclusi dati tecnici collegati all’IP quando necessario).',
          'Dati compliance: scelte cookie, log di accettazione documenti legali (documento, versione, timestamp) e registrazioni necessarie per gestire segnalazioni legali.',
        ],
      },
      {
        heading: '4. Finalita e basi giuridiche (art. 6 GDPR)',
        body: [
          'Esecuzione contrattuale (art. 6, par. 1, lett. b): accesso account, collaborazione workspace, upload/review media, condivisione e supporto di base.',
          'Legittimo interesse (art. 6, par. 1, lett. f): sicurezza piattaforma, prevenzione frodi/abusi, diagnostica, moderazione e miglioramento del servizio.',
          'Obbligo legale (art. 6, par. 1, lett. c): adempimenti normativi, conservazioni obbligatorie, risposte ad autorita competenti e difesa legale.',
          'Consenso (art. 6, par. 1, lett. a): analytics opzionali e tecnologie di preferenza non essenziali.',
        ],
      },
      {
        heading: '5. Origine dei dati e impostazioni di visibilita',
        body: [
          'La maggior parte dei dati e fornita direttamente da utenti e amministratori workspace (form account, upload, commenti, inviti, impostazioni).',
          'Altri dati sono generati automaticamente durante l’uso del servizio (log, diagnostica, telemetria di sicurezza) o forniti dai provider di identita durante il login.',
          'Link condivisi e aree collaborative pubbliche possono rendere intenzionalmente visibili nomi, avatar, commenti e contenuti a chi possiede il link o accesso all’area.',
        ],
      },
      {
        heading: '6. Destinatari e responsabili',
        body: [
          'I dati possono essere trattati da fornitori infrastrutturali e SaaS necessari all’erogazione del servizio (ad esempio autenticazione, hosting/storage, collaborazione realtime, analytics, messaggistica e supporto).',
          'I fornitori operano come responsabili/sub-responsabili in base a contratti con limiti di finalita.',
          'I dati possono essere comunicati anche quando richiesto dalla legge, da autorita competenti o per tutelare diritti, sicurezza e integrita di utenti e piattaforma.',
        ],
      },
      {
        heading: '7. Trasferimenti extra SEE',
        body: [
          'Quando avvengono trasferimenti fuori SEE, sono utilizzate decisioni di adeguatezza o garanzie adeguate (es. Clausole Contrattuali Standard) con eventuali misure supplementari.',
          'Dettagli sui trasferimenti sono disponibili su richiesta all’indirizzo privacy.',
        ],
      },
      {
        heading: '8. Tempi di conservazione',
        body: [
          'I dati account/workspace sono conservati per la durata dell’account e successivamente cancellati, eliminati o anonimizzati secondo esigenze operative e legali.',
          'Log tecnici/sicurezza: in via generale fino a 12 mesi, salvo ulteriore conservazione necessaria per gestione incidenti o difesa legale.',
          'Log di consenso/accettazioni legali: conservati per finalita probatorie/accountability finche persistono obblighi di legge.',
        ],
      },
      {
        heading: '9. Sicurezza e gestione incidenti',
        body: [
          'Adottiamo misure tecniche e organizzative adeguate al rischio, inclusi controlli di autenticazione, trasporto cifrato (HTTPS), permessi basati su ruolo e tracciabilita delle operazioni critiche.',
          'Nessun sistema e totalmente sicuro. In caso di sospetto accesso non autorizzato, contatta subito supporto/contatti legali.',
        ],
      },
      {
        heading: '10. Segnalazioni contenuti e moderazione',
        body: [
          `Se rilevi contenuti presumibilmente illeciti o violazioni policy, invia segnalazione a ${LEGAL_CONFIG.abuseEmail} o ${LEGAL_CONFIG.dsaEmail} con link/posizione, motivazione e contesto.`,
          'Per proteggere utenti e rispettare la legge, possiamo valutare contenuti segnalati e relative evidenze tecniche, limitarne la visibilita, sospendere accessi e conservare tracce quando necessario.',
        ],
      },
      {
        heading: '11. Processi automatizzati e funzionalita assistite da AI',
        body: [
          'Alcune operazioni possono usare analisi automatizzate per sicurezza, rilevazione abusi, deduplicazione o funzioni di similarita/raccomandazione interne al prodotto.',
          'Non utilizziamo intenzionalmente decisioni unicamente automatizzate che producano effetti giuridici o analogamente significativi sugli utenti.',
        ],
      },
      {
        heading: '12. Diritti dell’interessato',
        body: [
          'Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione, portabilita, opposizione e revoca del consenso quando applicabile.',
          `Richieste: ${LEGAL_CONFIG.privacyEmail}.`,
          'Resta ferma la facolta di reclamo all’Autorita Garante per la Protezione dei Dati Personali.',
        ],
      },
      {
        heading: '13. Minori e requisito di eta',
        body: [
          'Il servizio non e destinato a utenti sotto l’eta minima di consenso digitale prevista dalla normativa applicabile.',
          'Per utenti in Italia, il consenso autonomo ai servizi della societa dell’informazione richiede almeno 14 anni.',
        ],
      },
      {
        heading: '14. Aggiornamenti',
        body: [
          'Questa informativa può essere aggiornata per esigenze normative, tecniche o di prodotto. Le modifiche rilevanti saranno comunicate in-app o via email quando previsto.',
        ],
      },
    ],
  },
};

export const COOKIE_POLICY: LegalDocs = {
  en: {
    title: 'Cookie Policy',
    version: LEGAL_DOCUMENT_VERSIONS.cookie_policy,
    updatedAt: enUpdatedAt,
    sections: [
      {
        heading: '1. Legal framework',
        body: [
          'This policy is provided under GDPR, the ePrivacy framework (including Article 5(3) of Directive 2002/58/EC), and applicable national rules.',
          'For users in Italy, cookie handling is aligned with the Garante guidelines of 10 June 2021 and subsequent updates.',
        ],
      },
      {
        heading: '2. Scope and technologies',
        body: [
          'This policy covers cookies, localStorage/sessionStorage, and similar client-side identifiers used by the web app.',
          'Strictly necessary technologies are always active. Optional categories are activated only after valid consent where required.',
        ],
      },
      {
        heading: '3. Categories',
        body: [
          'Strictly necessary: login, session security, consent persistence, and core technical operation.',
          'Preferences: remember optional interface choices (theme, language, view settings).',
          'Analytics: usage measurement via Google Analytics, only after opt-in.',
          'Marketing/profiling cookies are currently not enabled by default in this product.',
        ],
      },
      {
        heading: '4. Consent management (first layer and settings panel)',
        body: [
          'The first-layer banner provides equivalent actions to accept all, reject all, or manage preferences in detail.',
          'Optional categories are not activated before user choice. No pre-ticked consent for optional categories is used.',
          'You can grant, deny, or revise optional categories through the “Cookie settings” control available from footer/legal pages.',
        ],
      },
      {
        heading: '5. Consent logging and renewal',
        body: [
          'Consent choices are versioned and logged with timestamp and technical identifiers needed to prove accountability.',
          'If policy scope changes materially (for example, new optional categories/providers), we may request renewed consent.',
        ],
      },
      {
        heading: '6. Browser controls',
        body: [
          'You can delete or block cookies via browser settings. Blocking strictly necessary technologies can prevent login and core features.',
        ],
      },
      {
        heading: '7. Third-party services',
        body: [
          'Analytics is provided by Google (gtag.js). It is loaded only after analytics consent in this web app implementation.',
          'Authentication/session technologies are provided by Clerk for secure sign-in and account continuity.',
        ],
      },
      {
        heading: '8. Updates and contacts',
        body: [
          `For questions on cookies and tracking technologies, contact ${LEGAL_CONFIG.privacyEmail}.`,
          'This policy may be updated to reflect legal or technical changes. The latest version is always available in the legal pages.',
        ],
      },
    ],
    tables: [
      {
        heading: 'Identifier inventory',
        rows: sharedCookieRowsEn,
      },
    ],
  },
  it: {
    title: 'Cookie Policy',
    version: LEGAL_DOCUMENT_VERSIONS.cookie_policy,
    updatedAt: itUpdatedAt,
    sections: [
      {
        heading: '1. Quadro normativo',
        body: [
          'Questa Cookie Policy e resa ai sensi del GDPR, della disciplina ePrivacy (incluso art. 5, par. 3, Direttiva 2002/58/CE) e della normativa nazionale applicabile.',
          'Per gli utenti in Italia, la gestione cookie e allineata alle Linee guida cookie e altri strumenti di tracciamento del Garante (10 giugno 2021) e successive evoluzioni.',
        ],
      },
      {
        heading: '2. Ambito e tecnologie',
        body: [
          'Questa informativa copre cookie, localStorage/sessionStorage e identificatori analoghi usati dalla web app.',
          'Le tecnologie strettamente necessarie sono sempre attive. Le categorie opzionali sono attivate solo dopo consenso valido quando richiesto.',
        ],
      },
      {
        heading: '3. Categorie',
        body: [
          'Strettamente necessari: login, sicurezza sessione, persistenza consenso e funzionamento tecnico di base.',
          'Preferenze: memorizzano scelte facoltative di interfaccia (tema, lingua, viste).',
          'Statistiche: misurazione utilizzo tramite Google Analytics, solo dopo opt-in.',
          'Cookie marketing/profilazione al momento non sono attivati di default in questo prodotto.',
        ],
      },
      {
        heading: '4. Gestione del consenso (banner e pannello preferenze)',
        body: [
          'Il banner di primo livello presenta azioni equivalenti per accettare tutto, rifiutare tutto o gestire in dettaglio le preferenze.',
          'Le categorie opzionali non vengono attivate prima della scelta utente. Non sono usate caselle preselezionate per i consensi opzionali.',
          'Puoi concedere, negare o modificare il consenso dal controllo “Impostazioni cookie” disponibile in footer/pagine legali.',
        ],
      },
      {
        heading: '5. Registrazione e rinnovo del consenso',
        body: [
          'Le scelte di consenso sono versionate e registrate con timestamp e identificatori tecnici necessari per finalita di accountability.',
          'In caso di modifiche sostanziali (ad esempio nuove categorie opzionali/nuovi fornitori) puo essere richiesto un nuovo consenso.',
        ],
      },
      {
        heading: '6. Impostazioni browser',
        body: [
          'Puoi eliminare o bloccare i cookie dalle impostazioni browser. Il blocco delle tecnologie strettamente necessarie può impedire login e funzioni principali.',
        ],
      },
      {
        heading: '7. Servizi di terze parti',
        body: [
          'Le statistiche sono fornite da Google (gtag.js) e vengono caricate solo dopo consenso analytics nella presente implementazione.',
          'Le tecnologie di autenticazione/sessione sono fornite da Clerk per consentire login sicuro e continuità account.',
        ],
      },
      {
        heading: '8. Aggiornamenti e contatti',
        body: [
          `Per domande su cookie e tecnologie di tracciamento puoi contattare ${LEGAL_CONFIG.privacyEmail}.`,
          'La presente informativa puo essere aggiornata per modifiche normative o tecniche. La versione piu recente e sempre disponibile nelle pagine legali.',
        ],
      },
    ],
    tables: [
      {
        heading: 'Inventario identificatori',
        rows: sharedCookieRowsIt,
      },
    ],
  },
};

export const TERMS_OF_USE: LegalDocs = {
  en: {
    title: 'Terms of Use',
    version: LEGAL_DOCUMENT_VERSIONS.terms_of_use,
    updatedAt: enUpdatedAt,
    sections: [
      {
        heading: '1. Provider information',
        body: [
          `${LEGAL_CONFIG.brandName} is operated by ${LEGAL_DISPLAY.controllerLine}.`,
          `${LEGAL_DISPLAY.vatLine}.`,
          `Legal contact: ${LEGAL_CONFIG.legalEmail}. Support: ${LEGAL_CONFIG.supportEmail}.`,
        ],
      },
      {
        heading: '2. Scope of service and contractual framework',
        body: [
          `${LEGAL_CONFIG.brandName} is a web platform for collaborative review of videos/media, comments, boards, and shared workspaces.`,
          'These Terms apply to registered users, invited collaborators, and users accessing shared/public areas of the platform.',
          'Privacy Policy and Cookie Policy are integral parts of this framework. If a separate signed contract exists, that contract prevails for conflicting clauses.',
        ],
      },
      {
        heading: '3. Eligibility, accounts, and workspace administration',
        body: [
          'You must provide truthful registration data and keep your credentials confidential.',
          'Accounts are personal and may not be shared or transferred without authorization.',
          'Workspace owners/admins are responsible for invitations, permission settings, and internal authorization policies for their teams.',
          'You are responsible for activities performed through your account unless caused by proven platform fault.',
          'You confirm that you meet the minimum legal age required to use the service in your jurisdiction.',
        ],
      },
      {
        heading: '4. User content, permissions, and feedback',
        body: [
          'You retain ownership of uploaded content.',
          'You grant the provider a non-exclusive license to host, process, and display content solely for service operation, security, and backup.',
          'You must hold all rights required for uploaded materials and collaboration invites.',
          'If you send product feedback or suggestions, you grant a worldwide, royalty-free license to use that feedback to improve the service.',
        ],
      },
      {
        heading: '5. Acceptable use and prohibited activities',
        body: [
          'No illegal content, malware, copyright infringement, unlawful personal-data disclosure, harassment, hate content, or fraud.',
          'No attempts to bypass access controls, disrupt infrastructure, or access third-party workspaces without authorization.',
          'No automated abuse, bulk scraping, or high-frequency requests that impair platform stability or other users.',
          'No impersonation, deceptive behavior, or misuse of shared links/tokens.',
        ],
      },
      {
        heading: '6. Public mural, shared links, notice-and-action, and moderation',
        body: [
          'Public mural and shared-link features may expose content to users with the link or area access; use them carefully and only for content you are authorized to share.',
          `To report allegedly illegal content or policy violations, contact ${LEGAL_CONFIG.abuseEmail} or ${LEGAL_CONFIG.dsaEmail} with sufficient details (URL/location, reason, supporting evidence).`,
          'Where required by law and platform policies, the provider may remove/limit content, disable sharing links, suspend users, and preserve evidence for investigations.',
        ],
      },
      {
        heading: '7. Intellectual property and infringement notices',
        body: [
          'You must respect copyrights, trademarks, database rights, and other intellectual property rights.',
          `Rights holders may submit infringement notices to ${LEGAL_CONFIG.abuseEmail} or ${LEGAL_CONFIG.dsaEmail} including sufficient identification of the protected work, the allegedly infringing material, and contact details.`,
          'Repeated or serious infringements may result in content removal and account suspension/termination.',
        ],
      },
      {
        heading: '8. Third-party services and integrations',
        body: [
          'Some features rely on third-party providers (authentication, storage, realtime collaboration, analytics, communications).',
          'Your use of third-party integrations may also be subject to those providers’ terms and privacy notices.',
          'Availability or terms of those integrations may change; this may affect specific features.',
        ],
      },
      {
        heading: '9. Service availability, changes, and beta features',
        body: [
          'The service is provided on an as-available basis and may be unavailable for maintenance, security actions, or third-party outages.',
          'We may update, modify, or discontinue features when reasonably necessary for legal, security, or product reasons.',
          'Any beta/experimental feature may be changed or removed without prior notice and may have limited reliability.',
        ],
      },
      {
        heading: '10. Suspension, termination, and account deletion',
        body: [
          'We may suspend or terminate access in case of serious breach, abuse, security risks, or legal obligations.',
          'You may stop using the service at any time and request account deletion through the app/profile controls.',
          'After termination/deletion, some records may be retained when required for legal compliance, fraud prevention, or defense of rights.',
        ],
      },
      {
        heading: '11. Warranties and liability',
        body: [
          'The service is provided "as is" and "as available" to the maximum extent permitted by law.',
          'To the maximum extent permitted by law, indirect damages, consequential damages, and loss of profits are excluded.',
          'Nothing excludes liability where exclusion is prohibited by mandatory law (including intent and gross negligence where applicable).',
        ],
      },
      {
        heading: '12. User indemnification',
        body: [
          'You agree to indemnify and hold harmless the provider from third-party claims arising from your unlawful content, misuse of the service, or violation of these Terms.',
          'This indemnity does not apply where claims are caused by the provider’s own unlawful conduct.',
        ],
      },
      {
        heading: '13. Governing law, jurisdiction, and consumer rights',
        body: [
          `These Terms are governed by Italian law. Competent court: ${LEGAL_CONFIG.jurisdictionCity}, without prejudice to mandatory consumer protections where applicable.`,
        ],
      },
      {
        heading: '14. Updates',
        body: [
          'We may update these Terms for legal, technical, or product reasons. Material updates may require renewed acceptance.',
        ],
      },
    ],
  },
  it: {
    title: "Termini d'uso",
    version: LEGAL_DOCUMENT_VERSIONS.terms_of_use,
    updatedAt: itUpdatedAt,
    sections: [
      {
        heading: '1. Informazioni sul prestatore',
        body: [
          `${LEGAL_CONFIG.brandName} è gestito da ${LEGAL_DISPLAY.controllerLine}.`,
          `${LEGAL_DISPLAY.vatLine}.`,
          `Contatto legale: ${LEGAL_CONFIG.legalEmail}. Supporto: ${LEGAL_CONFIG.supportEmail}.`,
        ],
      },
      {
        heading: '2. Oggetto del servizio e quadro contrattuale',
        body: [
          `${LEGAL_CONFIG.brandName} è una piattaforma web per review collaborativa di video/media, commenti, board e workspace condivisi.`,
          'I presenti Termini si applicano a utenti registrati, collaboratori invitati e soggetti che accedono ad aree/link condivisi o pubblici.',
          'Privacy Policy e Cookie Policy sono parte integrante del quadro contrattuale. In presenza di contratto separato firmato, quest’ultimo prevale sulle clausole confliggenti.',
        ],
      },
      {
        heading: '3. Requisiti, account e amministrazione workspace',
        body: [
          'Devi fornire dati di registrazione veritieri e custodire con diligenza le credenziali.',
          'L’account e personale e non puo essere ceduto o condiviso senza autorizzazione.',
          'I proprietari/amministratori workspace sono responsabili di inviti, impostazioni permessi e policy interne di autorizzazione del team.',
          'Sei responsabile delle attività effettuate tramite il tuo account, salvo prova di malfunzionamento imputabile alla piattaforma.',
          'Confermi di rispettare l’età minima legale per l’utilizzo del servizio nella tua giurisdizione.',
        ],
      },
      {
        heading: '4. Contenuti utente, permessi e feedback',
        body: [
          'Mantieni la titolarità dei contenuti caricati.',
          'Concedi al gestore una licenza non esclusiva per ospitare, elaborare e mostrare i contenuti esclusivamente per erogazione, sicurezza e backup del servizio.',
          'Dichiari di avere i diritti necessari sui materiali caricati e sugli inviti/collaborazioni inviati.',
          'Se invii suggerimenti o feedback di prodotto, concedi una licenza mondiale e gratuita per usarli al fine di migliorare il servizio.',
        ],
      },
      {
        heading: '5. Uso consentito e attivita vietate',
        body: [
          'Sono vietati contenuti illeciti, malware, violazioni copyright, diffusione illecita di dati personali, molestie, hate content e frodi.',
          'È vietato aggirare i controlli di accesso, compromettere l’infrastruttura o accedere a workspace altrui senza autorizzazione.',
          'E vietato l’uso automatizzato abusivo (scraping massivo, richieste ad alta frequenza, flooding, attacchi) che comprometta stabilita o sicurezza.',
          'E vietata impersonificazione, condotta ingannevole e uso improprio di link/token condivisi.',
        ],
      },
      {
        heading: '6. Public mural, link condivisi, segnalazioni e moderazione',
        body: [
          'Public mural e link condivisi possono rendere i contenuti visibili a chi possiede il link o accesso all’area; usali solo per materiali che sei autorizzato a condividere.',
          `Per segnalare contenuti presumibilmente illeciti o violazioni policy contatta ${LEGAL_CONFIG.abuseEmail} o ${LEGAL_CONFIG.dsaEmail}, indicando URL/posizione, motivazione e prove disponibili.`,
          'Quando richiesto da legge o policy, il gestore puo rimuovere/limitare contenuti, disabilitare link di condivisione, sospendere utenti e conservare evidenze per accertamenti.',
        ],
      },
      {
        heading: '7. Proprieta intellettuale e segnalazioni violazione',
        body: [
          'Devi rispettare copyright, marchi, diritti su banche dati e altri diritti di proprieta intellettuale.',
          `I titolari dei diritti possono inviare segnalazioni a ${LEGAL_CONFIG.abuseEmail} o ${LEGAL_CONFIG.dsaEmail}, identificando opera tutelata, materiale contestato e recapiti del segnalante.`,
          'Violazioni ripetute o gravi possono comportare rimozione contenuti e sospensione/cessazione account.',
        ],
      },
      {
        heading: '8. Servizi di terze parti e integrazioni',
        body: [
          'Alcune funzionalità dipendono da fornitori terzi (autenticazione, storage, realtime collaboration, analytics, comunicazioni).',
          'L’uso di integrazioni terze puo essere soggetto anche ai termini e alle informative privacy dei relativi fornitori.',
          'Disponibilità e termini di tali integrazioni possono variare e incidere sulle funzionalità correlate.',
        ],
      },
      {
        heading: '9. Disponibilita servizio, modifiche e funzionalita beta',
        body: [
          'Il servizio e fornito nei limiti di disponibilita e puo risultare temporaneamente indisponibile per manutenzione, interventi di sicurezza o disservizi terzi.',
          'Possiamo aggiornare, modificare o dismettere funzionalita quando ragionevolmente necessario per motivi legali, di sicurezza o evoluzione prodotto.',
          'Le funzionalita beta/sperimentali possono essere modificate o rimosse senza preavviso e avere affidabilita limitata.',
        ],
      },
      {
        heading: '10. Sospensione, cessazione e cancellazione account',
        body: [
          'Possiamo sospendere o cessare l’accesso in caso di violazioni gravi, abusi, rischi di sicurezza o obblighi normativi.',
          'Puoi interrompere l’uso in qualsiasi momento e richiedere cancellazione account dalle funzioni profilo dell’app.',
          'Dopo cessazione/cancellazione, alcune registrazioni possono essere mantenute se necessario per obblighi legali, prevenzione frodi o tutela dei diritti.',
        ],
      },
      {
        heading: '11. Garanzie e limitazione di responsabilita',
        body: [
          'Il servizio e fornito "cosi com’e" e "come disponibile", nei limiti massimi consentiti dalla legge.',
          'Nella misura massima consentita, sono esclusi danni indiretti, consequenziali e lucro cessante.',
          'Resta impregiudicata ogni responsabilità non escludibile per legge inderogabile (inclusi dolo e colpa grave ove applicabile).',
        ],
      },
      {
        heading: '12. Manleva dell’utente',
        body: [
          'L’utente si impegna a manlevare e tenere indenne il gestore da pretese di terzi derivanti da contenuti illeciti, uso improprio del servizio o violazione dei presenti Termini.',
          'La presente manleva non si applica quando la pretesa dipende da condotta illecita imputabile al gestore.',
        ],
      },
      {
        heading: '13. Legge applicabile, foro e diritti consumatore',
        body: [
          `I presenti Termini sono regolati dalla legge italiana. Foro competente: ${LEGAL_CONFIG.jurisdictionCity}, salvo tutele inderogabili del consumatore ove applicabili.`,
        ],
      },
      {
        heading: '14. Modifiche',
        body: [
          'I presenti Termini possono essere aggiornati per motivi normativi, tecnici o di prodotto. In caso di modifiche sostanziali può essere richiesta nuova accettazione.',
        ],
      },
    ],
  },
};
