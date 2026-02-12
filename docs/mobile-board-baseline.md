# Mobile Board Baseline (Phase 0)

## Date
- 2026-02-12

## Current Mobile Status
- Temporary safety mode active: mobile gestures focused on camera navigation stability.
- Editing interactions on touch are intentionally restricted until runtime split is complete.

## Known Repro Issues (before structural refactor)
- Camera gesture and selection gesture conflicts on iPhone Safari.
- Pinch/pan could trigger selection-net unexpectedly.
- Selection box and selected object could drift under zoom/pan transitions.
- In some flows, layer visuals appeared out of sync with camera updates.

## Primary Technical Hotspots
- Monolithic orchestration:
  - `app/board/[boardId]/_components/canvas.tsx`
- Layer dispatch and per-type rendering:
  - `app/board/[boardId]/_components/layer-preview.tsx`
- Mobile gesture helper:
  - `hooks/use-mobile-gestures.ts`
- Selection overlay:
  - `app/board/[boardId]/_components/selection-box.tsx`
- ForeignObject-based components involved in Safari fragility:
  - `app/board/[boardId]/_components/note.tsx`
  - `app/board/[boardId]/_components/text.tsx`
  - media/table-related layer wrappers in `layer-preview.tsx`

## Interaction Entry Points (as-is)
- Canvas pointer flow: `onPointerDown`, `onPointerMove`, `onPointerUp`.
- Layer pointer flow: `onLayerPointerDown`.
- Global touch listeners mapped to gesture handlers.

## Baseline Acceptance Targets for Refactor
- Mobile camera pan/zoom stable and deterministic.
- No gesture ambiguity between camera and selection.
- Layer and selection overlay remain perfectly aligned at all zoom levels.
- Desktop behavior unchanged.

## Phase 0 Completion Criteria
- Baseline and plan documents created.
- Hotspots and risk areas identified.
- Ready to begin Phase 1 runtime split with feature flag.
