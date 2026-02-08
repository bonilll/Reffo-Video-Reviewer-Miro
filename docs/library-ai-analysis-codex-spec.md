# Library AI Analysis + Similarity Search (Codex Spec)

This document is the implementation spec for a **production-grade** system that:
- analyzes Library media (primarily images, optionally videos),
- generates multilingual (IT/EN) metadata for search,
- writes results back to Convex (`assets` + `assetAnalysisJobs`),
- supports **similarity search** via an external vector database (recommended: Qdrant),
- keeps only **compressed** versions in the Library (higher resolution than Board media).

Repo context: Vite + React + Convex + Clerk + MinIO/S3-compatible storage.

## Goals

1) Library browsing must be fast and searchable via:
   - filters/facets (type, colors, size, duration),
   - text search (title, tags, captions, OCR),
   - similarity search (image-to-image, text-to-image).
2) Multilingual UX:
   - generate **captions** and **tags** in both Italian and English.
3) Production behavior:
   - async job queue with retries and idempotency,
   - no embeddings stored in Convex (store only references),
   - safe access to MinIO objects (avoid presigned-url expiration issues).

## Non-goals (for first iteration)

- Perfect taxonomy/ontology (we start pragmatic, then iterate).
- Storing raw vectors in Convex.
- Cross-org content discovery (keep everything scoped by `userId` / `orgId`).

---

## Data Model (Convex)

### `assets` table (library catalog)

Convex schema has been extended (see `convex/schema.ts`) to support:

Core
- `title`, `type`, `mimeType`, `fileUrl`, `fileName`, `fileSize`
- `storageKey?` (required for server-side deletion and internal fetching)
- `createdAt`, `updatedAt?`
- `userId`, `orgId?`, `isPrivate?`

Variants / performance
- `variants?`: `{ original?, hires?, preview?, thumb? }` each with:
  - `url`, `storageKey?`, `width?`, `height?`, `byteSize?`, `mimeType?`
- `blurDataUrl?`: tiny placeholder (optional)

Search + multilingual
- `description?` (legacy single-language, optional)
- `captionsI18n?`: `{ it?: string; en?: string }`
- `tokens?`: legacy tokens array (optional, can keep for back-compat)
- `userTokens?`: manual user tags
- `aiTokensI18n?`: `{ it?: string[]; en?: string[] }`
- `ocrText?`
- `searchText?`: precomputed aggregate text used by Convex full-text search

Perceptual + dedup
- `sha256?` (recommended)
- `phash?`
- `dominantColors?` (hex strings)

Embeddings (similarity search)
- `embeddingProvider?` (e.g. "qdrant")
- `embeddingRef?` (point id / external id)
- `embeddingModel?`, `embeddingDim?`, `embeddingUpdatedAt?`

Analysis state
- `analysisStatus?`: "none" | "queued" | "processing" | "done" | "failed"
- `analysisError?`, `analysisUpdatedAt?`, `analysisVersion?`

Indexes/Search
- Keep existing `search_assets` on `title`
- Use new `search_assets_full` on `searchText` for real search UX
- Keep: `byUserType`, `byUserUpdatedAt`, `byUserAnalysisStatus`, `byStorageKey`

### `assetAnalysisJobs` table (queue + retries)

Existing in schema. Use it as the single source of truth for job status:
- `status`: queued | processing | done | failed | canceled
- `attempts`, `maxAttempts`
- `lockedAt`, `lockedBy` (for worker locking)
- `requestedFeatures`: { ocr, caption, tags, embedding, colors, exif }

### `assetUsages` table (optional but recommended)

Tracks where an asset is referenced (board/review) for UX and safe deletion:
- `assetId`, `userId`
- `targetType`: "board" | "review"
- `targetId`: string
- optional `boardId`, `videoId`

---

## Library Media Strategy (Compressed-Only)

Library stores only compressed images (but higher-res than Board images).

Recommended image pipeline:
- `hires`: max dimension 4096 (or 5120 if needed), quality ~0.75-0.82
- `preview`: max dimension 1024, quality ~0.6-0.75
- `thumb`: max dimension 256, quality ~0.5-0.7

Board pipeline can keep its own smaller variant (already handled elsewhere).

IMPORTANT:
- Board should never load the original heavy library media for browsing.
- UI uses `thumb`/`preview` by default, swaps to `hires` when needed (zoom/selection).

---

## Search UX (How users will find assets)

### 1) Full-text search (Convex)

Maintain `assets.searchText` as a normalized concatenation:
- title
- captionsI18n.it + captionsI18n.en
- aiTokensI18n.it + aiTokensI18n.en
- userTokens
- ocrText

Rules:
- lower-case
- collapse whitespace
- de-duplicate tokens
- cap length (e.g. 8k-16k chars) to avoid huge documents

Use `search_assets_full` for queries and filter by:
- `userId` (required)
- `type` (optional)

### 2) Similarity search (Vector DB)

Use an external vector DB (recommended Qdrant).

Store in Convex only:
- `embeddingRef`, `embeddingProvider`, `embeddingModel`, `embeddingDim`, `embeddingUpdatedAt`

Similarity query forms:
- image -> similar images (same model, cosine distance)
- text (IT/EN) -> matching images (CLIP text encoder)

Namespace/scoping:
- separate collections per `orgId` or use a single collection with payload filters:
  - `userId`, `orgId`, `type`

---

## AI Output: What to generate

Minimum production metadata per image:

1) Captions (IT + EN)
- short, factual, 1 sentence max
- avoid subjective fluff
- include key objects + context + style if clear

2) Tags (IT + EN)
- 12-40 tags per language
- include:
  - objects (chair, lamp, logo, car)
  - scene/context (kitchen, outdoor, UI, screenshot)
  - style (minimal, brutalist, vintage, 3D render)
  - materials (wood, metal, glass)
  - colors (as words, not only hex)
  - brand/logos only if confident

3) OCR
- raw extracted text (best-effort)
- optional: also add a cleaned tokenized list into tags

4) Embedding
- image embedding (for similarity)
- (optional) also store a text embedding if you decide to do hybrid search later

5) Colors
- dominantColors list (already possible client-side; AI may not be needed)

Optional but useful:
- `safety` / `nsfw` classification for moderation
- `dedup`: sha256 + phash to identify duplicates/near-duplicates

---

## Worker Architecture (Recommended)

Implement a dedicated worker service that:
- claims jobs from Convex,
- downloads media from MinIO (prefer internal credentials, not expiring presigned urls),
- runs analysis,
- writes results back to Convex and vector DB.

### Worker flow (pull model)

1) `claimNextJob(user/org scope?)`
   - query `assetAnalysisJobs` where `status="queued"`
   - atomically lock (`lockedAt`, `lockedBy`), set `status="processing"`
2) Fetch asset
   - read `assets.storageKey` and use MinIO SDK (preferred)
   - fallback: fetch `fileUrl` (only if stable)
3) Analyze
4) Upsert embedding in vector DB; receive `embeddingRef`
5) Update asset fields + set `analysisStatus="done"`
6) Update job status `done`

Retry rules:
- if failed: increment attempts, set `status="queued"` again until `maxAttempts`
- if exceeded: set `failed` + `error`

Idempotency:
- use `(assetId, analysisVersion)`; if `analysisVersion` matches and status done, skip.

### Alternative (push model)

Convex mutation triggers webhook to n8n/worker on enqueue.
Still keep locking/idempotency inside worker.

---

## Convex Functions to Implement (API surface)

This repo now exposes the following functions/endpoints (already implemented as stubs + production-safe guards):

### 1) Worker HTTP endpoints (no Clerk auth; secret-based)

These endpoints live in:
- `convex/http/libraryWorker.ts`
- routed by `convex/http.ts`

They are meant for a **server-side worker** (n8n, local GPU service, etc.) that cannot use Clerk.

Required Convex env:
- `LIBRARY_WORKER_SECRET` (shared secret; sent as `Authorization: Bearer ...`)

Endpoints (POST):
- `/api/library-worker/claim`
  - body: `{ workerId: string }`
  - response: `{ claimed: { job, asset } | null }`
- `/api/library-worker/heartbeat`
  - body: `{ jobId: string, workerId: string }`
- `/api/library-worker/complete`
  - body:
    ```
    {
      "jobId": "...",
      "workerId": "...",
      "analysisVersion": "2026-02-01",
      "resultSummary": "optional",
      "result": {
        "captionsI18n": { "it": "...", "en": "..." },
        "aiTokensI18n": { "it": ["..."], "en": ["..."] },
        "ocrText": "...",
        "dominantColors": ["#112233"],
        "phash": "...",
        "sha256": "...",
        "embedding": {
          "provider": "qdrant",
          "ref": "optional-if-you-upsert-yourself",
          "model": "openclip-xxx",
          "dim": 768,
          // optional: if provided, Convex will upsert to Qdrant itself:
          "id": "assetId-or-uuid",
          "vector": [0.1, 0.2, ...],
          "payload": { "assetId": "...", "userId": "...", "orgId": "...", "type": "image" }
        }
      }
    }
    ```
- `/api/library-worker/fail`
  - body: `{ jobId: string, workerId: string, error: string }`

Note:
- Locking + attempts are handled server-side in `convex/assetWorker.ts`.
- `assets.searchText` is recomputed server-side on completion.

### 2) Qdrant actions (server-side only)

These live in `convex/qdrant.ts` as `internalAction`s (keys never reach the client).

Required Convex env:
- `QDRANT_URL`
- `QDRANT_COLLECTION` (default: `assets_embeddings`)
- optional `QDRANT_API_KEY`

Local development:
- you can set these in `.convex.env.local` (ignored by git in this repo).

Actions:
- `internal.qdrant.upsertPoint({ id, vector, payload?, wait? })`
- `internal.qdrant.deletePoint({ id, wait? })`
- `internal.qdrant.recommendById({ id, limit?, filter? })`
- `internal.qdrant.searchByVector({ vector, limit?, filter? })`

### 3) Similarity search API (client-facing)

These live in `convex/assetsSimilarity.ts` (requires Clerk auth):
- `assetsSimilarity.recommendByAssetId({ assetId, limit?, sameType? })`
- `assetsSimilarity.searchByVector({ vector, limit?, type? })` (useful for text->image if your worker/client can generate text vectors)

### 4) Library search API (client-facing)

`convex/assets.ts` now supports:
- `assets.getUserLibrary({ searchQuery? })`
  - uses `search_assets_full` when `searchQuery` is present

---

## How the worker calls Convex

Convex HTTP Actions are served from the `.convex.site` domain.

In this repo we already use the convention:
- if you have `VITE_CONVEX_URL=https://XYZ.convex.cloud`
- the HTTP base is: `https://XYZ.convex.site`

The worker should call:
- `https://XYZ.convex.site/api/library-worker/claim` (etc.)

Example (claim):
```
curl -X POST "https://XYZ.convex.site/api/library-worker/claim" \
  -H "Authorization: Bearer $LIBRARY_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"workerId":"gpu-worker-1"}'
```

---

## Legacy section (kept for context)

Create in `convex/assets.ts` (or similar):

1) `assets:createFromUpload`
- args: { title, type, mimeType, fileName, fileSize, fileUrl, storageKey, variants?, blurDataUrl?, width?, height?, durationSeconds? ... }
- writes asset doc
- sets `updatedAt=createdAt`

2) `assets:updateDerivedMetadata`
- args: { assetId, width?, height?, aspectRatio?, dominantColors?, phash?, sha256?, variants?, blurDataUrl? }

3) `assets:updateAiMetadata`
- args: { assetId, captionsI18n, aiTokensI18n, ocrText?, embeddingProvider, embeddingRef, embeddingModel, embeddingDim, analysisVersion }
- also updates:
  - `analysisStatus="done"`, `analysisUpdatedAt=now`, `updatedAt=now`
  - recompute `searchText`

4) `assets:enqueueAnalysis`
- args: { assetId, requestedFeatures, priority? }
- creates `assetAnalysisJobs` row (queued)
- sets `assets.analysisStatus="queued"`

5) `assetAnalysisJobs:claimNext`
- args: { workerId }
- returns next queued job and locks it

6) `assetAnalysisJobs:heartbeat`
- args: { jobId, workerId }
- updates `lockedAt` to prevent job stealing

7) `assetAnalysisJobs:complete` / `assetAnalysisJobs:fail`
- updates job state

8) `assets:search`
- args: { userId, q, type? }
- use `search_assets_full` (fallback to `search_assets` if `searchText` absent)

9) `assets:similar`
- args: { assetId OR embeddingRef OR textQuery, userId/orgId filters, limit }
- calls vector DB and returns matching `assetId`s; then fetch those docs from Convex.

---

## Vector DB (Qdrant) Contract

Collection:
- name: `assets_embeddings` (or per-org: `assets_embeddings__ORGID`)

Point:
- `id`: stable string (use `assetId` or generated uuid; store as `embeddingRef`)
- `vector`: float[] (dim depends on model)
- payload:
  - `assetId`, `userId`, `orgId?`, `type`, `createdAt`, `updatedAt`

Operations:
- upsert(assetId -> vector)
- querySimilar(assetId/text -> k)
- delete(assetId) when asset is deleted (if not referenced)

Multilingual:
- prefer CLIP/OpenCLIP model whose text encoder works acceptably for IT/EN
- if needed, translate IT query to EN for better recall (but still keep original)

---

## Multilingual Rules (IT/EN)

Store both languages:
- `captionsI18n.it`, `captionsI18n.en`
- `aiTokensI18n.it`, `aiTokensI18n.en`

SearchText must include BOTH languages.

Generation options:
1) Caption in EN + translate to IT
2) Caption independently in both languages (better but slower)
3) Tags in EN + translate + add language-specific synonyms

Recommendation:
- generate a single structured representation (objects/scene/style) and then render both IT/EN strings.

---

## What the Worker Returns to Convex (JSON payload)

Worker -> Convex should produce a single object:

```
{
  "assetId": "...",
  "analysisVersion": "2026-02-01",
  "captionsI18n": { "it": "...", "en": "..." },
  "aiTokensI18n": { "it": ["..."], "en": ["..."] },
  "ocrText": "...",
  "dominantColors": ["#112233", "#aabbcc"],
  "phash": "...",
  "sha256": "...",
  "embedding": {
    "provider": "qdrant",
    "ref": "assetId-or-uuid",
    "model": "openclip-xxx",
    "dim": 768
  }
}
```

Convex will:
- patch `assets` with these fields,
- set analysis status,
- update `searchText`,
- mark job done.

---

## Safety / Permissions

- All queries/mutations must enforce `userId` (and `orgId` if enabled).
- Worker must only process jobs it is allowed to process.
- Do not expose MinIO credentials to the client.

---

## Implementation Checklist

Database (done)
- `convex/schema.ts` updated with new `assets` fields + `assetUsages` table + full-text index.

Convex (to implement)
- add the functions listed above (enqueue/claim/update/search/similar).

Worker (to implement)
- Qdrant client + MinIO client + AI pipeline.
- robust retries and idempotency.

UI (later)
- Library page shows analysis status, tags/captions, and “Find similar”.
- Expose “Save to Library” and “Remove from Library” controls from Board toolbar.
