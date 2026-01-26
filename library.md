# Library Page (Reference Library) - Project Plan

This document describes a complete, production-grade plan to implement a **user reference library** inside this repo (Vite + React + Convex + Clerk + MinIO).

Scope: create a new **Library** page reachable from the main navbar (next to Dashboard). The Library supports:
- Upload images + videos to MinIO
- Immediate local metadata extraction (client-side) where possible
- Persistent catalog + filters + search
- Masonry grid browsing
- Manual editing of tags/tokens + metadata
- AI analysis queue (integration-ready for n8n + local GPU pipeline)
- Optional similarity search (pHash now; embeddings/vector later)

Non-goals (for first iteration):
- Full board integration UI (select assets -> insert into board). Can be added later, but keep API ready.
- Full org/team sharing semantics (start with per-user; keep `orgId` optional).

---

## 0) Navigation + Routing

This app uses custom routing in `App.tsx` (not Next.js routing).

Add:
- Route: `/library`
- View name: `library`
- Nav item in `AppHeader` alongside `Dashboard` and `Profile`

Expected UX:
- Clicking "Library" navigates to `/library`
- Page uses same light-mode styling as the rest of the app

Implementation notes:
- Extend `Route` union type with `{ name: 'library' }`
- Update `parseRoute()` to recognize `/library`
- Add a new view state `library` in `view` union
- Add a new component `components/LibraryPage.tsx`
- In `AppHeader`, add a new `HeaderNavButton` "Library"

---

## 1) Data Model (Convex)

We already have `assets` and `media`. The Library should use **assets** as the canonical library table (media is board-scoped).

### 1.1 `assets` table (extend)

Current fields (already in `convex/schema.ts`):
- `userId`, `title`, `fileUrl`, `type`, `fileName`, `createdAt`, `tokens?`, `description?`, `externalLink?`, `isPrivate?`, `fileSize?`

Add (optional fields, filled progressively):
- `updatedAt: number`
- `mimeType?: string`
- `width?: number`
- `height?: number`
- `durationSeconds?: number` (for videos)
- `fps?: number` (optional, best-effort)
- `aspectRatio?: number` (derived)
- `dominantColors?: string[]` (e.g. hex list like `["#112233", "#aabbcc"]`)
- `colorFingerprint?: number[]` (optional compact numeric features)
- `phash?: string` (perceptual hash for dedup/similarity)
- `exif?: any` (small subset only; avoid huge payload)
- `ocrText?: string` (text extracted from images)
- `analysisStatus: "none" | "queued" | "processing" | "done" | "failed"`
- `analysisError?: string`
- `analysisUpdatedAt?: number`
- `analysisVersion?: string` (to re-run when pipeline changes)
- `embeddingProvider?: "local" | "openai" | "vertex" | "none"`
- `embeddingRef?: string` (pointer to vector index entry; do NOT store full vectors in Convex)
- `source: "upload" | "import" | "board"` (optional)
- `orgId?: string` (optional)

Indexes:
- `byUser` (already)
- `byType` (already)
- add: `byUserType` (`userId`, `type`)
- add: `byUserUpdatedAt` (`userId`, `updatedAt`)
- add: `byUserAnalysisStatus` (`userId`, `analysisStatus`)
- add: `searchIndex` for text search:
  - `title`, `description`, `ocrText`, `tokens` (tokens may need mirrored string field)

Design principle:
- Library browsing must work without AI: `title/fileName/type/createdAt` is enough.
- Enrichment fields are optional and backfilled asynchronously.

### 1.2 `assetAnalysisJobs` (new table)

Purpose: visible queue in UI + robust retries + auditability.

Fields:
- `assetId: Id<"assets">`
- `userId: Id<"users">`
- `status: "queued" | "processing" | "done" | "failed" | "canceled"`
- `priority?: number` (default 0)
- `attempts: number`
- `maxAttempts: number` (e.g. 3)
- `lockedAt?: number`
- `lockedBy?: string` (worker id)
- `error?: string`
- `createdAt: number`
- `updatedAt: number`
- `requestedFeatures: { ocr: boolean; caption: boolean; tags: boolean; embedding: boolean; colors: boolean; exif: boolean }`
- `resultSummary?: string` (short)

Indexes:
- `byUserCreatedAt`
- `byStatusUpdatedAt`
- `byAsset`

---

## 2) Upload Architecture (MinIO)

We already have multipart upload endpoints:
- `/api/upload/multipart/init`
- `/api/upload/multipart/sign-part`
- `/api/upload/multipart/complete`
- `/api/upload/multipart/abort`

Library uploads reuse the same flow:
1) User selects files in Library page
2) Client uploads directly to MinIO via multipart presigned URLs
3) On completion, create `assets` record with `fileUrl`, `fileName`, `fileSize`, `mimeType`, `type`
4) Immediately extract local metadata (see section 3) and `patch` the asset
5) Optionally enqueue analysis job

Supported file types (Library MVP):
- Images: `image/*` (jpeg/png/webp/gif/svg where applicable)
- Videos: `video/*` (mp4/mov/webm)

Constraints:
- Apply plan limits (free tier): max file size, max uploads/month, etc. (hook into existing plan-limit system if present)
- Upload concurrency limits (already in `UploadOverlay`; reuse approach)

---

## 3) "Free" Metadata Extraction (Before AI)

Goal: enrich catalog without any GPU/AI cost.

### 3.1 Images (client-side)

When upload completes and we have a public URL:
- Load image via `new Image()`:
  - `width`, `height`, `aspectRatio`
- Generate:
  - `dominantColors`: sample downscaled image in canvas and cluster colors (k=5..8)
  - `phash`: perceptual hash (dHash/pHash) for dedup & similarity
  - `exif`: optional lightweight parse if we add a small EXIF lib; store only safe subset

### 3.2 Videos (client-side)

- Load `<video preload="metadata">`:
  - duration (seconds)
  - width/height
- Optional:
  - generate thumbnail (1 frame at 10-20% of duration) to show in grid
  - store `thumbnailUrl` as separate object (either a derived data URL or a second upload to MinIO)

Recommendation:
- For professional UX, store a real `thumbnailUrl` in MinIO, not a huge data URL.

---

## 4) AI Enrichment (n8n + local 3090)

We treat AI as async background processing.

### 4.1 Triggers

When an asset is created or when user clicks "Analyze":
- Create `assetAnalysisJobs` row with requested features
- Set `assets.analysisStatus = "queued"`

### 4.2 Worker contract

We expose a simple webhook contract for n8n:
- Input: `{ jobId, assetId, fileUrl, mimeType, type, userId, requestedFeatures }`
- Output callback: `{ jobId, status, result: { description, tokens, ocrText, dominantColors, embeddingRef, ... }, error }`

Implementation options:
1) n8n polls Convex for queued jobs (pull model)
2) Convex calls n8n webhook on job creation (push model)

Recommended: push + retry.

### 4.3 Models (local)

Suggested local stack on 3090:
- Caption/tags: BLIP/Florence/LLaVA (quality/latency tradeoff)
- OCR: PaddleOCR or Tesseract (IT/EN)
- Embeddings: CLIP/OpenCLIP

### 4.4 Storage for vectors

Convex is not a vector DB. Keep embeddings out of Convex:
- Preferred (production): Qdrant or Weaviate with per-user namespace
- Acceptable (single server): FAISS behind a small API + persisted index snapshots

Store in Convex only:
- `embeddingRef` (id in vector store)
- `embeddingProvider`
- `analysisVersion`

Similarity MVP without embeddings:
- Use `phash` + Hamming distance for "similar" (fast, no infra)

---

## 5) Library Page UX (Professional)

### 5.1 Layout

Top bar:
- Page title: "Library"
- Search input (debounced)
- Upload button + drag-drop zone (compact)
- Filter button (opens side panel on mobile)
- "Analyze queue" button (opens queue drawer/table)

Left panel (desktop):
- Filters (collapsible sections):
  - Type: Image / Video
  - Tags (tokens) multi-select
  - Color chips (dominantColors)
  - Date range (createdAt)
  - Status: queued/processing/done/failed
  - Privacy: private/public (optional)

Main content:
- Masonry grid of cards (image/video thumbnails)
  - Hover actions: Select, Edit metadata, Analyze, Delete
  - Badge: type + analysisStatus

Right side (optional):
- Details drawer for selected asset:
  - Preview
  - Editable fields: title, tokens, description, externalLink, isPrivate
  - Read-only: size, dimensions, duration, colors
  - Buttons: save, analyze/retry, download, copy link

### 5.2 Visual style

Match the site (light mode):
- White cards, subtle borders, soft shadows
- Slate text, blue for primary actions
- Same button shapes and spacing as Dashboard/ProjectWorkspace

### 5.3 Masonry grid implementation

Use existing dependency `react-masonry-css` (already in `package.json`).

Breakpoints:
- 1 col: < 640px
- 2 col: 640-900
- 3 col: 900-1200
- 4 col: > 1200

---

## 6) Library Feature Set (MVP vs Pro)

### MVP (must ship)
- Upload images/videos to MinIO
- Create assets in Convex
- Show grid
- Search by title/filename
- Manual edit tokens + description
- Filters: type, tags, date
- Local metadata extraction: width/height/duration + dominant colors + phash
- Analysis queue UI (table) showing job status

### Pro (phase 2)
- OCR search (text inside image)
- Semantic search with embeddings
- Similarity suggestions (from phash first; embeddings later)
- Bulk actions (tag multiple, delete multiple)
- Collections/folders inside library

---

## 7) Convex API Surface

Add/extend functions:

### assets
- `assets.createFromUpload({ title?, fileUrl, fileName, mimeType, fileSize, type, orgId? }) -> assetId`
- `assets.updateMetadata({ id, title?, tokens?, description?, externalLink?, isPrivate? })`
- `assets.patchDerived({ id, width?, height?, durationSeconds?, dominantColors?, phash?, exif? })`
- `assets.delete({ id })` (also delete from MinIO if desired)
- `assets.list({ type?, query?, tags?, color?, status?, dateRange?, cursor? })`
- `assets.get({ id })`

Search strategy:
- Fast filter query -> index-based
- Text search -> Convex searchIndex (title/description/ocrText)

### analysis jobs
- `assetJobs.enqueue({ assetId, requestedFeatures, priority? })`
- `assetJobs.list({ status?, cursor? })`
- `assetJobs.cancel({ jobId })`
- `assetJobs.retry({ jobId })`

### worker callbacks
- `assetJobs.markProcessing({ jobId, lockedBy })`
- `assetJobs.complete({ jobId, result })` (patch asset + set done)
- `assetJobs.fail({ jobId, error })`

---

## 8) Library Page Components (suggested)

New files:
- `components/library/LibraryPage.tsx` (main page)
- `components/library/LibraryUploadPanel.tsx` (upload + drag drop + progress)
- `components/library/LibraryFilters.tsx` (filters sidebar)
- `components/library/LibraryGrid.tsx` (masonry grid)
- `components/library/LibraryCard.tsx` (card)
- `components/library/AssetDetailsDrawer.tsx` (edit metadata)
- `components/library/AnalysisQueueDialog.tsx` (table view of jobs)

Reuse:
- existing `lib/upload/multipart.ts`
- existing MinIO multipart Convex endpoints
- existing UI primitives under `components/ui/*` (dialog, dropdown, input, button)
- existing `sonner` toasts

---

## 9) Permissions + Multi-tenancy

MVP: per-user only:
- All `assets.*` queries/mutations must enforce `asset.userId === currentUser._id`

Optional org:
- Add `orgId` and allow shared library per org (future)

---

## 10) Reliability + Performance

Key points:
- Upload is direct-to-MinIO; Convex only signs URLs.
- Use optimistic UI: show placeholder card while uploading.
- Debounced search (250-400ms).
- Paginate assets (cursor based) to avoid loading everything.
- Cache thumbnails and use `loading="lazy"` for images.

Error handling:
- Upload: retry part upload already exists; show failed state per file.
- Analysis: job retries, show failure reason + retry button.
- Dedup: when `phash` distance small, offer “merge” suggestion (phase 2).

---

## 11) Deliverables Checklist

For implementation:
- [ ] Add `/library` route + nav item
- [ ] Convex schema updates (assets + assetAnalysisJobs)
- [ ] Convex functions for assets CRUD + derived metadata
- [ ] Library page UI + masonry grid + filters + search
- [ ] Upload flow wired to MinIO multipart endpoints
- [ ] Client-side extraction (dimensions, colors, phash; video metadata)
- [ ] Manual editing UI for tokens/description/etc
- [ ] Analysis queue table UI + enqueue/retry/cancel
- [ ] (Optional) n8n webhook endpoints + job runner contract

