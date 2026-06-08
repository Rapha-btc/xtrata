# Xtrata Documentation Index

Purpose: gather the current Xtrata reference material in one place so homepage
documentation links can be chosen and grouped deliberately.

Public link note: the docs index itself is published from `main-staging`:
`https://github.com/stxtrata/xtrata/blob/main-staging/xtrata-1.0/docs/documentation-index.md`.
Most existing public doc links still use
`https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/`. If the
public docs branch changes, use the paths below as the stable source list and
update the URL prefix.

## Recommended Homepage Links

These are the strongest direct-link candidates for a public homepage.

| Audience | Link target | Why |
| --- | --- | --- |
| First-time users | [`docs/xtrata-quickstart.md`](xtrata-quickstart.md) | Fast app walkthrough for inscribing a file. |
| Builders, indexers, marketplaces | [`docs/xtrata-inscription-handbook.md`](xtrata-inscription-handbook.md) | Main integration guide for reading, reconstructing, and displaying Xtrata inscriptions. |
| Collection migration partners | [`docs/xtrata-backup-migration-service.md`](xtrata-backup-migration-service.md) | Service blueprint for moving IPFS-backed collections into SIP-009 contracts with Xtrata backup pointers. |
| Marketplaces, collection teams, archivists | [`docs/standards/xtrata-collection-manifest-standard.md`](standards/xtrata-collection-manifest-standard.md) | Collection-level manifest standard for item mapping, provenance, reconstruction, marketplace display, rights, validation, and preservation. |
| SDK users | [`docs/sdk/README.md`](sdk/README.md) | SDK entry point with package boundaries, active quickstarts, and release posture. |
| SDK users | [`docs/sdk/quickstart-first-30-minutes.md`](sdk/quickstart-first-30-minutes.md) | Beginner SDK onboarding path. |
| SDK users | [`docs/sdk/api-overview.md`](sdk/api-overview.md) | Fastest way to choose the right SDK API surface. |
| Artists and collection teams | [`docs/artist-guides/README.md`](artist-guides/README.md) | Artist guide index for collection launch workflows. |
| Artists and collection teams | [`docs/artist-guides/collection-launch-guide.md`](artist-guides/collection-launch-guide.md) | Main collection launch guide. |
| Contract integrators | [`docs/contract-inventory.md`](contract-inventory.md) | Function-level contract inventory across first-party contracts. |
| Contract integrators | [`docs/xtrata-v2.1.0/api-reference.md`](xtrata-v2.1.0/api-reference.md) | Current core contract API reference. |
| AI agents and automation builders | [`docs/ai-skills/README.md`](ai-skills/README.md) | AI training package index. |
| AI agents and automation builders | [`XTRATA_AGENT_SKILL.md`](../XTRATA_AGENT_SKILL.md) | Full autonomous-agent reference for Xtrata workflows. |
| Example app builders | [`examples/README.md`](../examples/README.md) | SDK example app index. |

## Current SDKs

The repo currently contains two workspace SDK packages.

| Package | Path | Notes |
| --- | --- | --- |
| `@xtrata/sdk` | [`packages/xtrata-sdk/README.md`](../packages/xtrata-sdk/README.md) | Protocol-first SDK with config, network, client, mint, collection, market, deploy, simple, safe, workflow, type, and error exports. Current workspace version: `0.1.0`. |
| `@xtrata/reconstruction` | [`packages/xtrata-reconstruction/README.md`](../packages/xtrata-reconstruction/README.md) | Deterministic chunk assembly, hash verification, dependency graph, and reconstruction helpers. Current workspace version: `0.1.0`. |

SDK package source directories:

- [`packages/xtrata-sdk`](../packages/xtrata-sdk)
- [`packages/xtrata-reconstruction`](../packages/xtrata-reconstruction)

SDK release and validation scripts are defined in the root [`package.json`](../package.json)
under `sdk:*`, with helper scripts in [`scripts/sdk`](../scripts/sdk).

## SDK Documentation

Active SDK docs:

| Path | Role |
| --- | --- |
| [`docs/sdk/README.md`](sdk/README.md) | SDK start point, package map, and release commands. |
| [`docs/sdk/api-overview.md`](sdk/api-overview.md) | API surface chooser for `simple`, `workflows`, `mint`, `safe`, `deploy`, `collections`, and `market`. |
| [`docs/sdk/quickstart-first-30-minutes.md`](sdk/quickstart-first-30-minutes.md) | Beginner onboarding. |
| [`docs/sdk/quickstart-simple-mode.md`](sdk/quickstart-simple-mode.md) | Lowest-friction integration path. |
| [`docs/sdk/quickstart-read-only.md`](sdk/quickstart-read-only.md) | Read-only client setup and usage. |
| [`docs/sdk/quickstart-mint.md`](sdk/quickstart-mint.md) | Core mint SDK usage. |
| [`docs/sdk/quickstart-collection-mint.md`](sdk/quickstart-collection-mint.md) | Collection mint SDK usage. |
| [`docs/sdk/quickstart-safe-transactions.md`](sdk/quickstart-safe-transactions.md) | Safe transaction helpers, spend caps, and guided flow state. |
| [`docs/sdk/quickstart-workflows.md`](sdk/quickstart-workflows.md) | Write transaction workflow plans for mint and market flows. |
| [`docs/sdk/compatibility-matrix.md`](sdk/compatibility-matrix.md) | Protocol/template support and SDK readiness status. |
| [`docs/sdk/troubleshooting.md`](sdk/troubleshooting.md) | Integration troubleshooting. |
| [`docs/sdk/migration-guide.md`](sdk/migration-guide.md) | SDK migration notes. |
| [`docs/sdk/test-gates.md`](sdk/test-gates.md) | Required tests and release quality gates. |
| [`docs/sdk/changelog.md`](sdk/changelog.md) | Generated SDK delivery history. |
| [`docs/sdk/release-notes-template.md`](sdk/release-notes-template.md) | Template for SDK release notes. |

Historical SDK planning docs:

- [`docs/sdk/archive/README.md`](sdk/archive/README.md)
- [`docs/sdk/archive/implementation-plan.md`](sdk/archive/implementation-plan.md)
- [`docs/sdk/archive/roadmap.md`](sdk/archive/roadmap.md)
- [`docs/sdk/archive/js-package-plan.md`](sdk/archive/js-package-plan.md)
- [`docs/sdk/archive/reconstruction-library-plan.md`](sdk/archive/reconstruction-library-plan.md)
- [`docs/sdk/archive/example-repos-plan.md`](sdk/archive/example-repos-plan.md)

## SDK Examples

| Path | Role |
| --- | --- |
| [`examples/README.md`](../examples/README.md) | Example app index. |
| [`examples/xtrata-example-marketplace/README.md`](../examples/xtrata-example-marketplace/README.md) | Minimal marketplace shell using public SDK exports and workflow-based buy plans. |
| [`examples/xtrata-example-campaign-engine/README.md`](../examples/xtrata-example-campaign-engine/README.md) | Campaign/drop UX starter using collection snapshots, workflow plans, and safety caps. |

## Core Protocol And App Docs

| Path | Role |
| --- | --- |
| [`docs/README.md`](README.md) | Broad repo/product overview. |
| [`docs/app-reference.md`](app-reference.md) | Internal code map and SDK-first operating rules. |
| [`docs/xtrata-wallet-integration-guide.md`](xtrata-wallet-integration-guide.md) | Shared wallet integration guide for hosted apps and embedded runtimes. |
| [`docs/assumptions.md`](assumptions.md) | Network and session assumptions. |
| [`docs/xtrata-quickstart.md`](xtrata-quickstart.md) | End-user quickstart for first inscription. |
| [`docs/xtrata-inscription-handbook.md`](xtrata-inscription-handbook.md) | Primary technical guide for inscription data, reads, reconstruction, and display. |
| [`docs/xtrata-backup-migration-service.md`](xtrata-backup-migration-service.md) | Backup migration service spec for IPFS-backed collections. |
| [`docs/recursive-inscriptions.md`](recursive-inscriptions.md) | Recursive inscription model, dependency rules, and examples. |
| [`docs/contract-inventory.md`](contract-inventory.md) | Contract source/function inventory. |
| [`docs/product-contract-ui-reference.md`](product-contract-ui-reference.md) | Product role map for core, market, commerce, vault, and collection-sale contracts. |
| [`docs/xtrata-v3-migration-reference.md`](xtrata-v3-migration-reference.md) | v3 migration design reference. |
| [`docs/testnet-v3.2.1-rehearsal.md`](testnet-v3.2.1-rehearsal.md) | v3.2.1 testnet deployment and rehearsal runbook. |
| [`docs/mainnet-v3.2.1-handover.md`](mainnet-v3.2.1-handover.md) | Controlled mainnet v3.2.1 handover runbook. |
| [`docs/mainnet-v3.2.1-automation-spec.md`](mainnet-v3.2.1-automation-spec.md) | Automation spec for the mainnet handover script. |
| [`docs/release-notes-xtrata-v1.1.0.md`](release-notes-xtrata-v1.1.0.md) | v1.1.0 release notes. |

## Standards Docs

Standards docs define reusable integration surfaces for Xtrata collections,
marketplaces, indexers, wallets, preservation projects, and future protocol
tooling.

| Path | Role |
| --- | --- |
| [`docs/standards/README.md`](standards/README.md) | Standards folder index and intended-use notes. |
| [`docs/standards/xtrata-collection-manifest-standard.md`](standards/xtrata-collection-manifest-standard.md) | Draft standard for Xtrata Collection Manifests, including schema, tiers, sequential collection mapping, resolver relationships, use cases, validation rules, and security guidance. |
| [`docs/standards/xtrata-manifest-validation.md`](standards/xtrata-manifest-validation.md) | Validator guidance for schema checks, item map validation, Xtrata reconstruction checks, signatures, amendments, error codes, and validation reports. |
| [`schemas/xtrata-collection-manifest.schema.json`](../schemas/xtrata-collection-manifest.schema.json) | Draft JSON Schema for Xtrata Collection Manifests. |
| [`docs/standards/xtrata-manifest-templates/README.md`](standards/xtrata-manifest-templates/README.md) | Active modular manifest template package entry point for collections, namespaces, data vaults, runtimes, finance, identity, governance, rights and agents. |
| [`docs/standards/xtrata-manifest-templates/00-manifest-index.json`](standards/xtrata-manifest-templates/00-manifest-index.json) | Machine-readable index of root templates, specialist folders and shared template standards. |
| [`docs/standards/xtrata-manifest-templates/collections/minimal-marketplace-manifest.json`](standards/xtrata-manifest-templates/collections/minimal-marketplace-manifest.json) | Collection template for a simple Xtrata-native art marketplace launch. |
| [`docs/standards/xtrata-manifest-templates/collections/preservation-migration-manifest.json`](standards/xtrata-manifest-templates/collections/preservation-migration-manifest.json) | Collection template for sequential preservation and migration. |
| [`docs/standards/xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json`](standards/xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json) | Collection template for audiovisual preservation with audio and generation context. |
| [`docs/standards/xtrata-manifest-templates/collections/full-composable-manifest.json`](standards/xtrata-manifest-templates/collections/full-composable-manifest.json) | Collection template for Audionals, BVST-style modules, runtime dependencies and resolver-backed item mapping. |

## Current Core Contract Docs

The current core contract documentation set lives under
[`docs/xtrata-v2.1.0`](xtrata-v2.1.0/README.md).

| Path | Role |
| --- | --- |
| [`docs/xtrata-v2.1.0/README.md`](xtrata-v2.1.0/README.md) | v2.1.0 doc set index. |
| [`docs/xtrata-v2.1.0/overview.md`](xtrata-v2.1.0/overview.md) | Purpose, invariants, and carry-over from v1.1.1. |
| [`docs/xtrata-v2.1.0/changes-from-v1.1.1.md`](xtrata-v2.1.0/changes-from-v1.1.1.md) | Focused compatibility diff. |
| [`docs/xtrata-v2.1.0/api-reference.md`](xtrata-v2.1.0/api-reference.md) | Public and read-only API reference. |
| [`docs/xtrata-v2.1.0/migration-guide.md`](xtrata-v2.1.0/migration-guide.md) | ID continuity and optional v1 to v2 migration flow. |
| [`docs/xtrata-v2.1.0/admin-runbook.md`](xtrata-v2.1.0/admin-runbook.md) | Deployment and operations checklist. |
| [`docs/xtrata-v2.1.0/integration-guide.md`](xtrata-v2.1.0/integration-guide.md) | Client and indexer integration guidance. |
| [`docs/xtrata-v2.1.0/small-file-single-tx-helper.md`](xtrata-v2.1.0/small-file-single-tx-helper.md) | Optional helper for small single-transaction minting. |
| [`docs/xtrata-v2.1.0/release-notes.md`](xtrata-v2.1.0/release-notes.md) | v2.1.0 release notes. |
| [`docs/xtrata-v2.1.0/one-pager.md`](xtrata-v2.1.0/one-pager.md) | Compact v2.1.0 positioning/reference. |

## Artist And Collection Docs

| Path | Role |
| --- | --- |
| [`docs/artist-guides/README.md`](artist-guides/README.md) | Artist and collection-team guide index. |
| [`docs/artist-guides/collection-portal-access.md`](artist-guides/collection-portal-access.md) | Access path for the collection manager portal. |
| [`docs/artist-guides/collection-launch-guide.md`](artist-guides/collection-launch-guide.md) | Collection launch walkthrough. |
| [`docs/artist-guides/collection-template-deploy-guide.md`](artist-guides/collection-template-deploy-guide.md) | Collection template deployment guide. |
| [`docs/artist-guides/collection-mint-setup-flow-blueprint.md`](artist-guides/collection-mint-setup-flow-blueprint.md) | Setup flow blueprint for collection mints. |
| [`docs/standards/xtrata-collection-manifest-standard.md`](standards/xtrata-collection-manifest-standard.md) | Collection manifest standard for marketplace-facing item maps, provenance, rights, reconstruction, and preservation context. |

## AI Agent Training Docs

| Path | Role |
| --- | --- |
| [`docs/ai-skills/README.md`](ai-skills/README.md) | AI skills package index and suggested training order. |
| [`docs/ai-skills/skill-inscribe.md`](ai-skills/skill-inscribe.md) | Single-item inscription skill. |
| [`docs/ai-skills/skill-batch-mint.md`](ai-skills/skill-batch-mint.md) | Coordinated batch mint skill. |
| [`docs/ai-skills/aibtc-agent-training.md`](ai-skills/aibtc-agent-training.md) | Track-specific guide for aibtc MCP agents. |
| [`docs/ai-skills/generic-agent-training.md`](ai-skills/generic-agent-training.md) | Track-specific guide for non-aibtc agents and frameworks. |
| [`XTRATA_AGENT_SKILL.md`](../XTRATA_AGENT_SKILL.md) | Full self-contained agent training reference. |

Companion example scripts:

- [`scripts/xtrata-mint-example.js`](../scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](../scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](../scripts/xtrata-query-example.js)

## Contract Version Notes

Contract TODO/version notes live under
[`docs/contract-todos`](contract-todos/README.md). Start with:

- [`docs/contract-todos/README.md`](contract-todos/README.md)
- [`docs/contract-todos/xtrata-v2.1.0.md`](contract-todos/xtrata-v2.1.0.md)
- [`docs/contract-todos/xtrata-v2.1.1.md`](contract-todos/xtrata-v2.1.1.md)
- [`docs/contract-todos/xtrata-v3-fee-spec.md`](contract-todos/xtrata-v3-fee-spec.md)
- [`docs/contract-todos/xtrata-collection-mint-v1.4.md`](contract-todos/xtrata-collection-mint-v1.4.md)
- [`docs/contract-todos/xtrata-market-ecosystem.md`](contract-todos/xtrata-market-ecosystem.md)
- [`docs/contract-todos/xtrata-market-stx-v1.0.md`](contract-todos/xtrata-market-stx-v1.0.md)
- [`docs/contract-todos/xtrata-market-usdc-v1.0.md`](contract-todos/xtrata-market-usdc-v1.0.md)
- [`docs/contract-todos/xtrata-market-sbtc-v1.0.md`](contract-todos/xtrata-market-sbtc-v1.0.md)
- [`docs/contract-todos/xtrata-commerce.md`](contract-todos/xtrata-commerce.md)
- [`docs/contract-todos/xtrata-vault.md`](contract-todos/xtrata-vault.md)

The folder also includes notes for legacy core, small-mint, collection-mint,
preinscribed sale, SIP-010 trait, and arcade score contract lines.

## Legal Consent Docs

| Path | Role |
| --- | --- |
| [`docs/LEGAL/README.md`](LEGAL/README.md) | Legal signature program index. |
| [`docs/LEGAL/consent-statement-v1.md`](LEGAL/consent-statement-v1.md) | Canonical consent statement. |
| [`docs/LEGAL/signature-message-spec.md`](LEGAL/signature-message-spec.md) | Signed message and anti-replay/domain-binding fields. |
| [`docs/LEGAL/data-model-and-retention.md`](LEGAL/data-model-and-retention.md) | Signature record schema and retention rules. |
| [`docs/LEGAL/implementation-plan.md`](LEGAL/implementation-plan.md) | API and frontend integration plan. |
| [`docs/LEGAL/rollout-and-test-plan.md`](LEGAL/rollout-and-test-plan.md) | Rollout and verification gates. |

## Recursive Apps And On-Chain Media Docs

| Path | Role |
| --- | --- |
| [`recursive-apps/xtrata-cartridge-arcade/README.md`](../recursive-apps/xtrata-cartridge-arcade/README.md) | Cartridge arcade project index. |
| [`recursive-apps/xtrata-cartridge-arcade/docs/01-architecture.md`](../recursive-apps/xtrata-cartridge-arcade/docs/01-architecture.md) | Arcade module interfaces and runtime contracts. |
| [`recursive-apps/xtrata-cartridge-arcade/docs/02-build-and-inscribe.md`](../recursive-apps/xtrata-cartridge-arcade/docs/02-build-and-inscribe.md) | Arcade build and inscription workflow. |
| [`recursive-apps/xtrata-cartridge-arcade/docs/03-expansion-guide.md`](../recursive-apps/xtrata-cartridge-arcade/docs/03-expansion-guide.md) | Adding new cartridges. |
| [`recursive-apps/xtrata-cartridge-arcade/docs/04-verification-and-troubleshooting.md`](../recursive-apps/xtrata-cartridge-arcade/docs/04-verification-and-troubleshooting.md) | Arcade verification and troubleshooting. |
| [`recursive-apps/xtrata-cartridge-arcade/docs/05-id-worksheet.md`](../recursive-apps/xtrata-cartridge-arcade/docs/05-id-worksheet.md) | ID worksheet for inscription planning. |
| [`recursive-apps/memo-message-board/README.md`](../recursive-apps/memo-message-board/README.md) | Memo message board recursive app notes. |
| [`recursive-apps/21-arcade/AGENTS.md`](../recursive-apps/21-arcade/AGENTS.md) | Arcade runtime/versioning working rules. |

The `recursive-apps/21-arcade/game*_*/README.md` files are per-game workspace
references. They are probably too granular for homepage links unless the arcade
gets its own documentation page.

## Protocol Primitive And Research Docs

| Path | Role |
| --- | --- |
| [`protocol-primitives/README.md`](../protocol-primitives/README.md) | Protocol primitives index. |
| [`protocol-primitives/numerical-anchors/README.md`](../protocol-primitives/numerical-anchors/README.md) | Numerical anchors primitive. |
| [`protocol-primitives/math-symbols/README.md`](../protocol-primitives/math-symbols/README.md) | Math symbols primitive. |
| [`protocol-primitives/token-logic/README.md`](../protocol-primitives/token-logic/README.md) | Token logic primitive. |
| [`protocol-primitives/identity/README.md`](../protocol-primitives/identity/README.md) | Identity primitive. |
| [`protocol-primitives/reserved-slots/README.md`](../protocol-primitives/reserved-slots/README.md) | Reserved slots primitive. |
| [`protocol-primitives/fun-experiments/README.md`](../protocol-primitives/fun-experiments/README.md) | Experimental primitives. |
| [`ledger-native-systems/README.md`](../ledger-native-systems/README.md) | Ledger-native systems research index. |

These are useful as deeper research references, not first-pass homepage docs.

## Internal Planning And Operations Docs

These are mostly internal, but they may be useful for contributors or partner
review.

| Path | Role |
| --- | --- |
| [`OPTIMISATION/README.md`](../OPTIMISATION/README.md) | Optimisation planning and delivery hub. |
| [`Refactor-Plans/README.md`](../Refactor-Plans/README.md) | Refactor planning index. |
| [`Refactor-Plans/REFRACTOR-PLANS-SUMMARY.md`](../Refactor-Plans/REFRACTOR-PLANS-SUMMARY.md) | Refactor plan summary. |
| [`Launch-Campaign/README.md`](../Launch-Campaign/README.md) | Launch campaign planning index. |
| [`Launch-Campaign/hackathons/README.md`](../Launch-Campaign/hackathons/README.md) | Hackathon campaign index. |
| [`Dora-Hacks/plan.md`](../Dora-Hacks/plan.md) | DoraHacks planning. |
| [`Dora-Hacks/x402-mvp.md`](../Dora-Hacks/x402-mvp.md) | x402 MVP planning. |
| [`LetafricaBuild/README.md`](../LetafricaBuild/README.md) | Let Africa Build partnership material index. |
| [`docs/let-africa-build-partnership-proposal.md`](let-africa-build-partnership-proposal.md) | Partnership proposal reference. |
| [`public/homepage-wireframe/README.md`](../public/homepage-wireframe/README.md) | Homepage wireframe notes. |
| [`TODO.md`](../TODO.md) | General task notes. |

## Suggested Homepage Grouping

For a compact homepage documentation section, group links as:

1. Start using Xtrata
   - `docs/xtrata-quickstart.md`
   - `docs/xtrata-inscription-handbook.md`
   - `docs/recursive-inscriptions.md`
2. Build with the SDK
   - `docs/sdk/README.md`
   - `docs/sdk/quickstart-first-30-minutes.md`
   - `docs/sdk/api-overview.md`
   - `examples/README.md`
3. Launch a collection
   - `docs/artist-guides/README.md`
   - `docs/artist-guides/collection-launch-guide.md`
   - `docs/artist-guides/collection-template-deploy-guide.md`
   - `docs/standards/xtrata-collection-manifest-standard.md`
4. Integrate contracts
   - `docs/contract-inventory.md`
   - `docs/xtrata-v2.1.0/api-reference.md`
   - `docs/product-contract-ui-reference.md`
5. Train agents
   - `docs/ai-skills/README.md`
   - `XTRATA_AGENT_SKILL.md`
