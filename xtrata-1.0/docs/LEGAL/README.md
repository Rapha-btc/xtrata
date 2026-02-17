# LEGAL Signature Program

Purpose: define the off-chain signature layer that users must complete once before protected actions.

## Goals

- Require explicit legal consent before first mint or first collection deploy.
- Bind signatures to domain, network, chain ID, app version, and policy version.
- Prevent replay with nonce + expiry.
- Keep UX friction minimal: one prompt per address per policy/TOS version.
- Keep an auditable record of accepted signatures.

## Protected actions

- `public-mint`: users minting through public mint flows.
  - `src/screens/MintScreen.tsx`
  - `src/CollectionMintLivePage.tsx`
- `collection-deploy`: users deploying collection-mint contracts.
  - `src/manage/components/DeployWizardPanel.tsx`

## UX policy (default)

- Ask once per address, then remember acceptance server-side.
- Re-ask only when:
  - TOS hash changes, or
  - legal policy version changes.
- Use one signature that can cover both scopes by default:
  - scopes: `public-mint`, `collection-deploy`
- Optional strict mode (future): separate signatures per scope.

## Required protections

1. Domain binding (anti-phishing).
2. Network + chain ID binding.
3. Server-issued nonce + short expiry.
4. Clear legal statement of intent and responsibility.
5. Terms-of-service hash (exact version proof).
6. No-custody and irreversible-transaction acknowledgment.

## Document map

- `docs/LEGAL/consent-statement-v1.md`
- `docs/LEGAL/signature-message-spec.md`
- `docs/LEGAL/data-model-and-retention.md`
- `docs/LEGAL/implementation-plan.md`
- `docs/LEGAL/rollout-and-test-plan.md`
