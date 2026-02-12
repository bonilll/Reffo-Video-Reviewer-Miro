# Mobile Board Structural Refactor Plan

## Scope
- Target: full mobile board usability on iPhone Safari and iPhone Chrome.
- Constraint: preserve desktop behavior and performance.
- Strategy: separate runtime paths for desktop and mobile while keeping one shared data model.

## Goals
- Stable camera navigation on mobile (pan/zoom always consistent).
- Correct selection and drag alignment (layer visuals and selection overlays match).
- No accidental selection-net during camera gestures.
- Feature parity for agreed tools on mobile.
- Zero regressions on desktop workflows.

## Non-goals (Phase 1)
- Visual redesign of desktop board UI.
- Changes to backend storage schema.
- New board features unrelated to mobile stability.

## Delivery Model
- Use incremental rollout behind `MOBILE_BOARD_V2` feature flag.
- Ship in milestones with strict acceptance gates.
- Keep a rollback path at each milestone.

## Phase Plan

### Phase 0 - Baseline and Freeze
Status: in progress

Tasks
- Capture current interaction map from `app/board/[boardId]/_components/canvas.tsx`.
- Enumerate all mobile-critical components and event entry points.
- Define current known failures and reproduction scripts.
- Freeze unstable touch experiments not in the plan.

Deliverables
- Baseline bug list with reproducible steps.
- Current architecture map (input, camera, selection, rendering).
- Initial risk register.

Exit criteria
- Known failures reproducible on-demand on iPhone Safari and iPhone Chrome.

### Phase 1 - Runtime Split (Desktop vs Mobile)
Tasks
- Introduce runtime orchestrators:
  - `BoardDesktopRuntime`
  - `BoardMobileRuntime`
- Keep shared model/services:
  - storage access
  - history/undo-redo
  - layer math and utilities
- Wire feature flag `MOBILE_BOARD_V2` to select runtime by device.

Deliverables
- Runtime boundary diagram.
- First compile-ready runtime split with no behavior change.

Exit criteria
- Desktop regression tests green.
- Mobile still works in temporary navigation-only mode.

### Phase 2 - Mobile Input Engine (Single Source of Truth)
Tasks
- Implement a mobile interaction state machine:
  - `idle`
  - `camera_pan`
  - `camera_pinch`
  - `layer_select`
  - `layer_drag`
  - `layer_resize`
  - `selection_net`
- Remove mixed/competing gesture paths.
- Ensure gesture arbitration rules are explicit and deterministic.

Deliverables
- `mobile-input-engine` module.
- Event trace logs for debugging arbitration transitions.

Exit criteria
- No accidental transition from camera gesture to selection-net.
- Stable drag start/end across layer types on iOS Safari.

### Phase 3 - Rendering Coherency
Tasks
- Enforce one camera transform pipeline used by:
  - layer rendering
  - hit testing
  - selection overlays
- Audit and reduce fragile `foreignObject` interactions for mobile-critical layers.
- Normalize selection visuals to avoid WebKit compositing glitches.

Deliverables
- Coherency tests (camera vs overlay alignment).
- Updated mobile-safe rendering adapters for note/text/media where needed.

Exit criteria
- No visible drift between selected object and selection box while zooming/panning.

### Phase 4 - Tool Re-enable and Parity
Tasks
- Re-enable tools progressively on mobile:
  1) Select/drag
  2) Resize
  3) Note/Text edit
  4) Pencil/shapes
  5) Media interactions
  6) Table/frame advanced actions
- Add tool-level guardrails for ambiguous gestures.

Deliverables
- Tool parity checklist with pass/fail evidence.

Exit criteria
- Each tool passes mobile acceptance before next tool set is enabled.

### Phase 5 - Hardening and Regression
Tasks
- Test matrix execution:
  - iPhone Safari
  - iPhone Chrome
  - iPad Safari
  - Android Chrome
  - Desktop Chrome/Safari
- Stress tests:
  - long sessions
  - heavy boards
  - rotation/background-resume
- Performance checks for pan/zoom and drag responsiveness.

Deliverables
- QA report and fixed defects.
- Release candidate behind feature flag.

Exit criteria
- Critical defects = 0
- High defects = 0
- Desktop regressions = 0

### Phase 6 - Controlled Rollout
Tasks
- Enable `MOBILE_BOARD_V2` for limited audience.
- Monitor telemetry and error logs.
- Ramp to full rollout in steps with rollback checkpoint each step.

Deliverables
- Rollout log.
- Final postmortem and stabilization notes.

Exit criteria
- Stable metrics for agreed observation window.

## Risk Register

### R1 - Desktop regressions from shared code changes
Impact: high
Mitigation
- Runtime split first.
- Keep desktop runtime behavior unchanged.
- Run desktop checks at every milestone.

### R2 - iOS Safari compositing issues with `foreignObject`
Impact: high
Mitigation
- Reduce direct dependency on fragile styling states.
- Use mobile-safe selection rendering paths.
- Validate on physical iPhone, not only simulator.

### R3 - Gesture conflicts (pan vs select vs drag)
Impact: high
Mitigation
- State machine arbitration with explicit priorities.
- One active interaction mode at a time.
- Add debug tracing for transitions.

### R4 - Scope explosion (too many tools at once)
Impact: medium
Mitigation
- Progressive re-enable by tool category.
- Gate each category with acceptance checks.

## Test Matrix (minimum)
- Camera pan single finger on empty canvas.
- Pinch zoom with center drift and no selection side effects.
- Tap select and drag for note, text, image, shape, path.
- Selection overlay alignment under zoom-in and zoom-out.
- Resize handles behavior and commit.
- Undo/redo integrity after drag/resize/edit.
- No desktop regressions on board core flows.

## Working Rules
- No direct large edits in monolithic `canvas.tsx` without runtime extraction.
- No new parallel input paths after Phase 2 starts.
- Every phase ends with build verification and a short validation note.

## Immediate Next Steps (Execution Start)
1. Complete baseline artifact from current code and known bugs.
2. Define runtime interfaces and create skeleton files.
3. Introduce `MOBILE_BOARD_V2` flag and wire runtime switch.
