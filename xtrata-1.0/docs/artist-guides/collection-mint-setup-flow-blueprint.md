# Collection Mint Setup Flow Blueprint

Status: draft for `collection-mint-setup-flow` branch  
Audience: product/design/engineering working on `/manage` artist portal

## 1) Goal

Design a fully guided, non-technical launch journey where an artist can complete a collection setup in strict order, with clear pass/fail signals, and no hidden prerequisite steps.

Success target:

1. Every checklist item is ordered and linked to one panel.
2. A step can be marked complete only from real system state, not a manual checkbox.
3. Later steps stay locked until prior required steps are complete.
4. Launch includes explicit "Unpause contract" as the final go-live action.

## 2) Current State Audit (Relevant Modules)

Current modules and what they already provide:

1. `src/manage/CollectionManagerApp.tsx`
   - Has guided buttons ("Start here"), but no true checklist status engine or step locking.
2. `src/manage/components/DeployWizardPanel.tsx`
   - Strong validation, draft creation, deployment review modal, and safety checks.
   - Standard mint deploy is blocked until Step 2 pricing lock exists.
3. `src/manage/components/AssetStagingPanel.tsx`
   - Upload readiness checks, staged asset grid, and "Lock staged assets for deploy".
4. `src/manage/components/PublishOpsPanel.tsx`
   - Publish readiness and publish action.
   - Does not enforce "contract unpaused" as go-live prerequisite.
5. `src/manage/components/CollectionSettingsPanel.tsx`
   - Contains `set-paused` and full contract actions, but only in advanced section.
6. `functions/collections/[collectionId]/readiness.ts`
   - Returns deploy/upload readiness and lock reasons.
7. `functions/collections/[collectionId]/publish.ts`
   - Enforces deploy readiness and active assets check before publish.

Key UX gap to fix:

1. The displayed order suggests "Deploy first, upload second", but standard mint deploy is intentionally blocked until uploads are staged and locked. This creates user confusion and broken mental model.

## 3) Proposed Guided Checklist (Canonical Order)

This order should become the single source of truth for guided mode:

1. Connect and confirm wallet access
2. Create drop draft (name, symbol, supply, mint type, recipients)
3. Upload artwork
4. Lock staged assets for deploy (standard mint only)
5. Deploy contract
6. Configure contract launch settings
7. Prepare live page details (cover + description)
8. Publish collection in backend
9. Unpause contract (go live)
10. Monitor live launch (reservations + health checks)

Notes:

1. For `pre-inscribed`, Step 4 is auto-complete/skip with reason: "Not required for pre-inscribed flow."
2. Step 9 is mandatory for standard mint launch clarity and should be explicit in guided mode.

## 4) Traffic-Light Checklist Model

Use a single status model for every step:

1. `locked` (gray): prerequisite steps incomplete
2. `todo` (amber): available but not complete
3. `in-progress` (amber): user actively working in this step
4. `blocked` (red): action attempted but failed checks
5. `done` (green): verified complete from source-of-truth signals

Checklist behavior:

1. Top sticky checklist remains visible while scrolling.
2. Clicking a checklist row jumps to its panel.
3. Only one "active step" panel is expanded by default in guided mode.
4. Locked steps show exact reason ("Finish Step X first").
5. Completion is automatic from data, not user-toggled checkmarks.

## 5) Completion Signals Per Step

`Step 1: Connect and confirm wallet access`

1. Complete when wallet is connected and allowlist gate passes.
2. Source: `ArtistManagerGate` + `ManageWalletContext`.

`Step 2: Create drop draft`

1. Complete when collection draft exists with `id`, basic metadata, and artist address.
2. Source: `DeployWizardPanel` draft creation + `/collections` response.

`Step 3: Upload artwork`

1. Complete when active staged asset count > 0 (for standard mint).
2. Source: `/collections/:id/assets` filtered states (`draft` not expired/sold-out).

`Step 4: Lock staged assets for deploy (standard only)`

1. Complete when `deployPricingLock` exists in collection metadata.
2. Source: `AssetStagingPanel` + collection metadata.

`Step 5: Deploy contract`

1. Complete when deploy readiness confirms on-chain deployment:
   - `deployTxStatus === success` OR contract source lookup confirmed.
2. Source: `/collections/:id/readiness` and deploy metadata.

`Step 6: Configure contract launch settings`

1. Complete when required launch config checks pass:
   - mint price set and valid
   - recipients/splits set
   - supply/limits set
   - paused = `true` before publish
2. Source: guided subset of `CollectionSettingsPanel` + on-chain summary refresh.

`Step 7: Prepare live page details`

1. Complete when cover source valid and description saved.
2. Source: collection metadata `collectionPage.coverImage` and description fields.

`Step 8: Publish collection in backend`

1. Complete when collection `state === published`.
2. Source: `/collections/:id/publish` + collection record refresh.

`Step 9: Unpause contract (go live)`

1. Complete when on-chain `paused === false` after publish.
2. Source: contract summary read (`is-paused`) from settings actions.

`Step 10: Monitor live launch`

1. Complete as informational (non-blocking), but shown as final operational checklist with reservation health actions.
2. Source: `PublishOpsPanel` reservation tools + optional diagnostics.

## 6) Guided Mode Product Rules

1. Guided mode is default; advanced mode remains available.
2. Guided mode hides raw mutable-action complexity until "Advanced" is opened.
3. Guided mode exposes plain-language sub-forms for required actions only.
4. Every step has:
   - "Why this matters"
   - "What to do now"
   - "Done when..."
   - Primary CTA
   - Clear failure message if blocked

## 7) File-Level Implementation Plan

Create checklist orchestration first, then panel integration.

1. `src/manage/lib/journey.ts` (new)
   - Define step ids, statuses, unlock logic, and completion evaluators.
2. `src/manage/lib/__tests__/journey.test.ts` (new)
   - Unit tests for step-state derivation, lock ordering, skip logic.
3. `src/manage/CollectionManagerApp.tsx`
   - Replace simple jump buttons with status-aware checklist rail.
   - Enforce one active guided step and lock messaging.
4. `src/manage/components/DeployWizardPanel.tsx`
   - Keep existing safety checks; emit structured completion events for draft/deploy.
5. `src/manage/components/AssetStagingPanel.tsx`
   - Emit staged-count and pricing-lock completion events.
6. `src/manage/components/CollectionSettingsPanel.tsx`
   - Add guided quick actions for required launch settings including explicit pause/unpause actions.
7. `src/manage/components/PublishOpsPanel.tsx`
   - Split "Publish" and "Go Live (Unpause)" messaging into distinct checklist-linked milestones.
8. `src/styles/app.css`
   - Add checklist status visuals while preserving layout stability (no horizontal shifts).

## 8) Copy Direction (Non-Technical)

Use language that a non-technical creator can follow:

1. Say "Drop" and "Collection" consistently.
2. Prefer "Turn live on" over protocol-heavy language in primary labels.
3. Keep advanced terms in tooltips, not primary flow text.
4. Every blocker message must include the next exact action.

Examples:

1. "Finish Step 4 first: lock staged assets for deploy."
2. "This drop is published, but minting is still paused. Complete Step 9 to go live."

## 9) Acceptance Criteria

1. Artists can complete launch with guided mode only (without opening advanced mode).
2. Checklist order matches actual technical prerequisites.
3. No step can be marked done if source-of-truth conditions are false.
4. Publish is not treated as full go-live until unpause completes.
5. Guided flow works for both `standard` and `pre-inscribed` with conditional step handling.
6. Layout remains stable (no horizontal shift, sticky checklist behaves on desktop/mobile).

## 10) Test Plan

1. Unit: `journey.ts` step-state derivation and lock transitions.
2. Component: guided checklist status rendering and panel locking behavior.
3. Regression:
   - standard flow: draft -> upload -> lock -> deploy -> publish -> unpause
   - pre-inscribed flow: draft -> deploy -> publish -> unpause (lock step skipped)
4. Manual UX script: first-time artist walkthrough with no prior context.

## 11) Rollout Sequence

1. Phase 1: checklist engine + status UI only (no contract action changes)
2. Phase 2: guided step completion hooks in existing panels
3. Phase 3: guided quick actions for required contract settings + unpause milestone
4. Phase 4: copy polish and child-level usability pass

