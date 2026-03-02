# Piano Security-First + Subnetwork AI (Google BYOK)

## Sommario
Implementazione in ordine obbligatorio: prima sicurezza BYOK completa, poi runtime nodale e UX subnetwork.
Output finale del piano: `docs/ai-subnetwork-security-first-implementation-plan.md` (contenuto qui sotto pronto da portare 1:1 nel file).
Obiettivo MVP: board con card “Subnetwork AI”, editor nodale collaborativo, run manuale nodo/workflow, output versionati su MinIO originali, cost panel a 3 indicatori, provider iniziale Google (Nano Banana Pro + Veo3), policy viewer/editor già definita.

## Scope e criteri di successo
1. Sicurezza BYOK è “go/no-go”: nessuna chiamata provider dal client; key mai in chiaro in DB/log; step-up obbligatorio su add/delete/test key; reveal key disabilitato.
2. Subnetwork AI separata dalla board ma legata al board context via route dedicata.
3. Workflow DAG con esecuzione parallela dei nodi indipendenti.
4. Concurrency rule: un nodo può avere una sola run attiva alla volta.
5. Versioning infinito output nodo; storage originale su MinIO senza compressione.
6. Permessi: `owner/editor` accedono e lanciano run; `viewer` vede solo board esterna e output prodotti.
7. Cost visibility: stima run corrente, spesa totale subnetwork, spesa mensile totale utente.

## Architettura target (alto livello)
1. Frontend SPA (App router custom in `App.tsx`) gestisce nuova route subnetwork e UI nodale.
2. Convex gestisce dominio (subnetwork/nodes/edges/runs/versioni/output/costi/audit).
3. Worker AI esterno (pull model, come library worker) esegue chiamate Google e polling async.
4. Key Vault Gateway server-side gestisce step-up + cifratura KMS + operazioni key; client non vede mai segreti.
5. MinIO conserva output originali con path dedicato utente/subnetwork/nodo/run/versione.

## Modifiche API/interfacce/types (decision complete)

### Nuove tabelle Convex (`convex/schema.ts`)
1. `aiProviderKeys`: key persistenti cifrate BYOK.
2. `aiProviderKeySessions`: key session-only con TTL.
3. `aiSubnetworks`: metadati subnetwork collegate a board.
4. `aiNodes`: nodi del grafo con tipo/config/posizione.
5. `aiEdges`: connessioni source/target port.
6. `aiWorkflowRuns`: run di tipo `node` o `workflow`.
7. `aiNodeRuns`: esecuzioni per nodo dentro un workflow run.
8. `aiNodeOutputs`: versioni output per nodo.
9. `aiCostLedger`: ledger costi stimati/reali.
10. `aiSecurityEvents`: audit trail sicurezza.
11. `aiUsageAlerts`: eventi di anomalia e auto-pausa key.

### Nuovi moduli Convex (public/internal)
1. `convex/aiKeys.ts`: list metadata key, resolve active key mode, status pause/resume.
2. `convex/aiSubnetworks.ts`: create/list/get/update/delete subnetwork.
3. `convex/aiGraph.ts`: CRUD nodi/edge + validazione DAG.
4. `convex/aiRuns.ts`: launch node/workflow, orchestrazione dipendenze, lock nodo.
5. `convex/aiOutputs.ts`: list versioni nodo, mark output, fetch per board drawer.
6. `convex/aiCosts.ts`: stime + aggregazioni 3 indicatori.
7. `convex/http/aiWorker.ts`: claim/heartbeat/complete/fail node-run.
8. `convex/internal/aiOrchestrator.ts`: unlock downstream, finalize workflow state.

### Nuovi endpoint server-side (gateway sicurezza key)
1. `POST /api/keys/google/session`: salva key session-only (TTL default 8h).
2. `POST /api/keys/google/persistent`: salva key persistente cifrata.
3. `POST /api/keys/google/test`: test key su endpoint lightweight Google.
4. `GET /api/keys/google/list`: metadata key (no secret).
5. `DELETE /api/keys/google/:keyId`: delete logico.
6. `POST /api/keys/google/pause` e `POST /api/keys/google/resume`.
7. `POST /api/security/step-up/validate`: validazione step-up e rilascio proof token breve.

### Route/UI SPA
1. Estendere `Route` union in `App.tsx` con `{ name: 'subnetwork'; boardId: string; subnetworkId: string }`.
2. Estendere `parseRoute` con regex `^/board/([^/?#]+)/subnetwork/([^/?#]+)`.
3. Nuova view `components/subnetwork/SubnetworkPage.tsx`.
4. Board integration: nuova card layer “Subnetwork AI” nel canvas con due bottoni `Open` e `Outputs`.

### Types frontend (`types/canvas.ts` + nuovi tipi)
1. Aggiungere `LayerType.SubnetworkCard`.
2. Definire `SubnetworkCardLayer` con `subnetworkId`, `title`, `icon`, `layout`.
3. Definire DTO nodi: `PromptNode`, `ImageRefNode`, `NanoBananaNode`, `Veo3Node`.
4. Definire `NodeRunStatus`, `WorkflowRunStatus`, `CostSummary`.

## Policy sicurezza (fissate)
1. Doppia modalità key: default session-only; persistente esplicita.
2. Key usage: chi lancia run usa la propria key.
3. KMS: GCP KMS con envelope encryption.
4. Key reveal: mai più visibile dopo salvataggio.
5. Step-up auth: obbligatoria su add/delete/test key.
6. Incident response: auto-pausa key + alert su anomalia.
7. Viewer non entra in subnetwork.

## Fase 0 — Sicurezza BYOK (priorità assoluta)

### Step 0.1 Threat model e regole hard
1. Definire minacce coperte: exfiltrazione DB, log leakage, session hijack, run abuse, cost abuse.
2. Definire invarianti hard: no client-provider calls; no plaintext at-rest; no secrets in logs; no bypass step-up.
3. Definire blast radius: una key compromessa impatta solo il suo utente.

### Step 0.2 Cifratura e gestione key
1. Implementare envelope encryption con GCP KMS.
2. Salvare solo: `ciphertext`, `wrappedDek`, `kmsKeyVersion`, `fingerprint`, `last4`, `status`, metadati.
3. Decrypt solo just-in-time in memoria volatile durante run/test; zero persist del plaintext.
4. Aggiungere rotazione key cifrate e procedura rewrap (no decrypt in massa lato client).

### Step 0.3 Step-up auth enforcement
1. Implementare proof token breve (validità 5 minuti, single-use, action-scoped).
2. Gateway key endpoints richiedono proof per `add/delete/test`.
3. Convex write path per key accetta solo payload firmato gateway; no mutazioni client dirette.
4. Scarto richieste senza proof o con proof riusato/scaduto.

### Step 0.4 Key lifecycle
1. Add key session-only: record in `aiProviderKeySessions`, TTL 8h default, cleanup scheduler ogni 15 minuti.
2. Add key persistente: record in `aiProviderKeys`.
3. Delete key: soft-delete + revoca immediata da risoluzione run.
4. Pause/resume key manuale.
5. Auto-pause su anomalia costi/error rate.

### Step 0.5 Audit, logging e redaction
1. Redaction middleware centralizzato su API key routes + worker logs.
2. `aiSecurityEvents` per add/test/delete/pause/resume/failed-step-up.
3. Salvare IP, user-agent, userId, action, risultato, timestamp.
4. Policy log: retention minima 90 giorni; no secret payload.

### Step 0.6 Guardrail costi e abuso
1. Limite hard per run configurabile per utente.
2. Limite hard giornaliero e mensile per utente.
3. Rate limit add/test key e launch run.
4. Trigger anomalia: spike > soglia relativa su rolling window 1h.
5. Auto-pause key + notifica UI/inbox.

### Step 0.7 UI profilo API keys
1. Estendere `components/ProfileSettings.tsx` nella sezione `Connections`.
2. Funzioni: add session key, add persistent key, test, pause/resume, delete.
3. Visualizzazione solo metadata: provider, label, stato, last4, lastTestAt, mode, lastUsedAt.
4. Nessun reveal full key.
5. Banner sicurezza con stato step-up e policy.

## Fase 1 — Dominio Subnetwork + routing

### Step 1.1 Modello subnetwork
1. `aiSubnetworks` collegata a `boardId`.
2. Creazione via board menu `Tab`/`right-click`.
3. Board può avere subnetworks illimitate.

### Step 1.2 Routing SPA
1. Aggiornare `App.tsx` per route `/board/:boardId/subnetwork/:subnetworkId`.
2. Nuova view `SubnetworkPage`.
3. Breadcrumb e ritorno board preservando camera/context.

### Step 1.3 ACL
1. Guard su subnetwork route: richiedere `canWrite` board.
2. `viewer` blocco accesso subnetwork.
3. Query output accessibile in lettura ai viewer per board esterna.

## Fase 2 — Board integration (card + output drawer)

### Step 2.1 Inserimento card dalla board
1. Abilitare menu contestuale board (attualmente `onContextMenu` fa solo preventDefault).
2. Inserire “Create Subnetwork AI” da click destro e da scorciatoia `Tab`.
3. Inserire nuovo layer `SubnetworkCardLayer` nel canvas.

### Step 2.2 UI card
1. Layout come richiesto: simbolo network in box quadrato + 2 bottoni sotto.
2. Bottone sinistro `Open`.
3. Bottone destro `Outputs`.
4. Viewer: `Open` disabilitato/nascosto; `Outputs` in read-only.

### Step 2.3 Output drawer board
1. Drawer con asset prodotti dalla subnetwork.
2. Supporto drag-and-drop in board per editor.
3. Viewer vede preview e metadata ma non inserisce layer.

## Fase 3 — Editor Subnetwork collaborativo

### Step 3.1 Realtime collaboration
1. Liveblocks room separata per subnetwork (`subnetwork:{id}`).
2. Cursori/presence attivi.
3. Salvataggio persistente grafo su Convex (nodi/edge), non solo storage volatile.

### Step 3.2 Nodi MVP
1. `Prompt`: testo output.
2. `Image Reference`: input immagini reference.
3. `Nano Banana Pro`: input prompt + reference + config modello (risoluzione/parametri supportati).
4. `Veo3`: input prompt oppure prompt + start/end frame + config durata/risoluzione.
5. Sidebar destra con ricerca/import nodi e pannello parametri input/output.

### Step 3.3 Validazione grafo
1. Bloccare cicli.
2. Validare compatibilità porte input/output.
3. Validare limiti prompt/media prima del run (messaggi chiari).

## Fase 4 — Runtime engine e orchestrazione run

### Step 4.1 Avvio run manuale
1. Run nodo singolo: bottone `Run` sul nodo.
2. Run workflow: bottone `Run Flow` globale.
3. Pre-flight: key attiva presente per launcher, budget disponibile, nodo non busy.

### Step 4.2 Parallelismo e lock
1. Workflow esegue nodi topologicamente.
2. Nodi senza dipendenze reciproche eseguibili in parallelo.
3. Lock per nodo: una sola run attiva per nodo.
4. Se lock presente: launch rifiutato con errore esplicito.

### Step 4.3 Worker AI
1. Pull model endpoint `claim`.
2. Worker esegue chiamata Google, polling job async quando necessario.
3. Upload output originale su MinIO path `ai_outputs/{userId}/{boardId}/{subnetworkId}/{nodeId}/{runId}/{version}/...`.
4. `complete/fail` endpoint aggiorna `aiNodeRuns`, log errori e sblocca downstream.

### Step 4.4 Error logs e diagnosi
1. Ogni fail salva `provider_error_code`, `provider_error_message`, `validation_error`, `request_id`.
2. UI nodo mostra log consultabile.
3. Distinzione chiara errori setup (prompt lungo, input invalido, asset grande) vs provider.

## Fase 5 — Versioning output nodo

### Step 5.1 Versioni infinite
1. Ogni run success crea nuova versione output.
2. `aiNodeOutputs.version` incrementale per nodo.
3. Nessuna compressione/trasformazione output originale.

### Step 5.2 Gallery nodo
1. Vista griglia e fullscreen.
2. Navigazione versioni cronologica.
3. Mark output preferito/pinned per uso rapido.

## Fase 6 — Cost panel (3 indicatori)

### Step 6.1 Cost estimate runtime
1. Indicatore A: costo stimato run selezionato.
2. Indicatore B: costo totale speso nella subnetwork corrente.
3. Indicatore C: costo mensile totale utente su tutte le subnetworks.
4. In `Run Flow`, stima include tutti i nodi computazionali pronti al run.

### Step 6.2 Data model costi
1. `aiCostLedger` per ogni node-run con `estimatedUsd` e `actualUsd`.
2. Se provider non ritorna costo reale, fallback a stima.
3. Aggregazioni Convex query per subnetwork e mensile utente.

### Step 6.3 Profile cost view
1. Nuovo blocco in `ProfileSettings` con totale mensile e trend base.
2. Stato alert/cutoff budget visibile all’utente.

## Fase 7 — Caso test reale MVP
1. `Prompt` + `Image Reference` -> `Nano Banana Pro` (immagini generate).
2. Output immagini Nano Banana usati come start/end frame in `Veo3`.
3. Run manuale per nodo e run workflow completo.
4. Verifica output versioning + drag-and-drop in board esterna.

## Piano test e scenari di accettazione

### Sicurezza
1. Nessun endpoint client può ottenere plaintext key.
2. Dump DB mostra solo ciphertext e metadata.
3. Log scan automatico non trova pattern API key.
4. Operazioni key senza step-up vengono rifiutate.
5. Proof step-up riusata/scaduta viene rifiutata.
6. Auto-pause scatta su anomalia e blocca run successivi.

### Permessi
1. Viewer non apre subnetwork route.
2. Editor/owner possono aprire, editare, run.
3. Viewer può vedere output drawer board, ma senza drag insert.

### Runtime
1. Run nodo singolo funziona con key session-only.
2. Workflow parallelo esegue nodi indipendenti in parallelo.
3. Nodo busy blocca seconda run simultanea.
4. Errore provider lascia log leggibile e stato coerente.
5. Dipendenze downstream partono solo dopo success upstream.

### Output e costi
1. Ogni run crea versione nuova nodo.
2. Output scaricabile in originale.
3. Tre indicatori costi aggiornati coerentemente.
4. Totale mensile in Profile coincide con ledger.

## Rollout e monitoraggio
1. Feature flags: `VITE_AI_SUBNETWORK_ENABLED`, `AI_KEYS_GATEWAY_ENABLED`, `AI_RUNNER_ENABLED`.
2. Canary interno su 1 progetto test.
3. Beta privata con Google-only.
4. Dashboard operativa: run success rate, fail reason distribution, median runtime, key pause events, cost drift.
5. Incident playbook: revoca key, pause forzata, audit export.

## Assunzioni e default fissati
1. Provider iniziale unico: Google.
2. Nodi MVP iniziali: Prompt, Image Reference, Nano Banana Pro, Veo3.
3. Run solo manuali.
4. Routing subnetwork: `/board/:boardId/subnetwork/:subnetworkId`.
5. Board con subnetworks illimitate.
6. Version retention infinita.
7. Output su MinIO senza compressione.
8. Key default mode session-only, persistente opt-in.
9. Key mai rivelata dopo salvataggio.
10. Step-up obbligatoria per add/delete/test key.
11. Policy key usage: run usa la key di chi lancia.
12. Incident response: auto-pausa key + alert.
13. Review integration diretta rinviata a fase 2.
