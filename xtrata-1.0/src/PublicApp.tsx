import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import {
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  uintCV,
  type ClarityValue
} from '@stacks/transactions';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import CollectionCoverImage from './components/CollectionCoverImage';
import { getContractId } from './lib/contract/config';
import { resolveCollectionMintPaymentModel } from './lib/collection-mint/payment-model';
import {
  isDisplayedCollectionMintFree,
  resolveCollectionMintPricingMetadata,
  resolveDisplayedCollectionMintPrice,
  type CollectionMintPricingMetadata
} from './lib/collection-mint/pricing-metadata';
import { resolveCollectionMintPriceTone } from './lib/collection-mint/price-tone';
import { resolveCollectionContractLink } from './lib/collections/contract-link';
import {
  getCollectionPageDisplayOrder,
  sortPublicCollectionCards
} from './lib/collections/public-order';
import { useBnsAddress } from './lib/bns/hooks';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getApiBaseUrls } from './lib/network/config';
import { formatMicroStxWithUsd } from './lib/pricing/format';
import { useUsdPriceBook } from './lib/pricing/hooks';
import { getNetworkFromAddress, getNetworkMismatch } from './lib/network/guard';
import { getStacksExplorerContractUrl } from './lib/network/explorer';
import { toStacksNetwork } from './lib/network/stacks';
import type { NetworkType } from './lib/network/types';
import { isRateLimitError, isReadOnlyNetworkError } from './lib/contract/read-only';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import AddressLabel from './components/AddressLabel';
import WalletTopBar from './components/WalletTopBar';
import MintScreen from './screens/MintScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';
import WalletLookupScreen from './screens/WalletLookupScreen';
import PublicCommerceScreen from './screens/PublicCommerceScreen';
import PublicMarketScreen from './screens/PublicMarketScreen';

const walletSessionStore = createWalletSessionStore();

const SECTION_KEYS = [
  'wallet-lookup',
  'wallet-session',
  'active-contract',
  'docs',
  'mint',
  'market',
  'commerce',
  'collection-viewer',
  'live-collections'
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const LIVE_MINT_REFRESH_INTERVAL_MS = 3 * 60_000;
const LIVE_MINT_ERROR_BACKOFF_MS = 5 * 60_000;
const LIVE_MINT_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;

const toSectionKeyFromHash = (hash: string): SectionKey | null => {
  const normalized = hash.replace(/^#/, '').trim();
  if (!normalized) {
    return null;
  }
  return SECTION_KEYS.includes(normalized as SectionKey)
    ? (normalized as SectionKey)
    : null;
};

const buildCollapsedState = (collapsed: boolean) =>
  SECTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = collapsed;
      return acc;
    },
    {} as Record<SectionKey, boolean>
  );

type DocSection = {
  id: string;
  title: string;
  tag: string;
  description: string;
  content?: string;
  external?: boolean;
  href?: string;
};

type InHouseDocSection = DocSection & {
  content: string;
  external?: false;
};

type PublicLiveCollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  artist_address: string | null;
  state: string;
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

type PublicCollectionContractTarget = {
  address: string;
  contractName: string;
  network: NetworkType;
};

type PublicLiveMintStatus = {
  paused: boolean | null;
  finalized: boolean | null;
  mintPrice: bigint | null;
  activePhaseId: bigint | null;
  activePhaseMintPrice: bigint | null;
  effectiveMintPrice: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  remaining: bigint | null;
  refreshedAt: number;
};

type PublicLiveCollectionCard = {
  id: string;
  slug: string;
  name: string;
  artistAddress: string;
  displayOrder: number | null;
  symbol: string;
  description: string;
  livePath: string;
  coverImage: Record<string, unknown> | null;
  fallbackCoreContractId: string | null;
  fallbackSupply: bigint | null;
  contractId: string | null;
  contractTarget: PublicCollectionContractTarget | null;
  templateVersion: string;
  pricing: CollectionMintPricingMetadata;
};

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'overview',
    title: 'Getting started',
    tag: 'Start here',
    description: 'A full onboarding path from first wallet connection to your first verified inscription.',
    content: `## Getting started end-to-end
Xtrata is designed so you can move from zero setup to a fully sealed, viewable inscription in one session.

### Before you begin
- Connect a wallet and confirm the network matches the active contract.
- Prepare a file that is ready for permanent on-chain storage.
- Decide if this mint is a personal piece, a collection release, or a partner batch.

### First-time walkthrough
- Step 1: Open Wallet, connect, and confirm your address and network.
- Step 2: Open Viewer and scan existing inscriptions to understand output format.
- Step 3: Open Mint, select your file, and review mime type and size.
- Step 4: Run Begin to register content intent.
- Step 5: Upload all batch chunks until progress reaches completion.
- Step 6: Seal to finalize hash and publish the inscription ID.
- Step 7: Return to Viewer and confirm content renders from on-chain data.

### What a successful mint looks like
- You receive a transaction for Begin, one or more batch transactions, and a final Seal transaction.
- Viewer resolves metadata and displays media without fallback mismatch.
- The inscription appears in collection mode and wallet mode.`
  },
  {
    id: 'inscriptions',
    title: 'How inscriptions work',
    tag: 'Protocol',
    description: 'What is committed on-chain, how chunking is verified, and how rendering is determined.',
    content: `## On-chain inscription model
An inscription is not only metadata. The actual content bytes are committed in chunked form and finalized with a deterministic hash.

### Core fields and what they mean
- Creator: wallet that finalized the inscription flow.
- Mime type: rendering hint for grid and preview components.
- Total size: expected byte size of the final assembled payload.
- Total chunks: expected chunk count used for completeness checks.
- Final hash: integrity commitment over ordered chunk data.

### Lifecycle integrity
- Begin establishes the expected content shape.
- Batch uploads fill chunk indexes with deterministic order.
- Seal verifies completion and locks the final record.

### Why this design is resilient
- Chunking keeps write operations bounded and reliable.
- Hash finalization gives deterministic content verification.
- Rendering can switch between thumbnail, cached preview, and full content while preserving identity.

### Practical implications for creators
- Mime type accuracy improves downstream viewer behavior.
- Consistent pre-processing (compression, export settings) reduces upload risk.
- A sealed inscription can be validated independently from off-chain hosting.`
  },
  {
    id: 'ids',
    title: 'IDs and continuity across versions',
    tag: 'Migration',
    description: 'How token identity remains continuous across versions and what migration does not change.',
    content: `## Continuous identity across versions
Xtrata preserves a single collection identity over contract generations. IDs keep historical meaning instead of restarting per version.

### Compatibility guarantees
- Existing v1 IDs remain valid and discoverable.
- v2 mints continue from the next available index.
- Wallet ownership and market visibility can be reasoned about without remapping IDs.

### Operational effects in app flows
- Viewer can render legacy and current ranges under one browsing model.
- Listing resolution can include both current and legacy contract sources.
- Activity timelines remain understandable because token numbers are stable.

### What migration changes
- Access to newer tooling and flows.
- Potentially improved upload/view behaviors.

### What migration does not change
- The historical existence of the original inscription ID.
- The provenance sequence that already occurred.
- The need to verify escrow and ownership state before market actions.

### Migration planning tips
- Test a small subset first.
- Validate viewer parity (thumbnail + full preview).
- Re-check market status after transfers or relisting.`
  },
  {
    id: 'minting-modes',
    title: 'Minting modes',
    tag: 'Minting',
    description: 'Direct mint, batch collection workflows, and partner contract-driven modes in detail.',
    content: `## Minting mode selection guide
Xtrata supports multiple mint paths so creators, teams, and partner collections can use the same base protocol with different operational workflows.

### Direct mint
- Best for individual artists and collectors.
- Uses Begin, Batch, Seal per inscription.
- Highest control over each piece and metadata decision.

### Batch mint workflow
- Best for multi-asset drops and production publishing.
- Groups repeated steps to reduce repetitive operator actions.
- Improves consistency for large release sessions.

### Partner collection contracts
- External collection logic can enforce pricing, allowlists, and split rules.
- Mint output still lands in Xtrata-compatible inscription flows.
- Operator controls can remain compact while preserving protocol safety.

### Choosing the right mode
- Use direct mint when quality control per item is the priority.
- Use batch mint when throughput and consistency are the priority.
- Use partner collection contracts when distribution rules must be encoded.

### Release checklist regardless of mode
- Validate network and contract targeting.
- Pre-calculate expected fees and batch count.
- Define recovery steps for interrupted sessions.
- Confirm final Viewer rendering for multiple sample assets.`
  },
  {
    id: 'artist-collection-launch',
    title: 'Artist collection launch guide',
    tag: 'Artists',
    description: 'Plain-language guide to choose between collection mint and pre-inscribed sale, then launch safely.',
    content: `## Artist collection launch guide
This section is a plain-language reference for artists and collection teams.

### Two collection sale formats
- **Collection mint**: buyers mint new inscriptions during your sale.
- **Pre-inscribed sale**: you pre-inscribe first, then buyers purchase token IDs from escrow inventory.

### When to use collection mint
- You want a live mint event.
- You want buyers to mint directly at purchase time.
- You want flexible launch rules (price, limits, phases, allowlist, splits).

### When to use pre-inscribed sale
- You want full quality control before launch.
- You want no buyer-side file upload during checkout.
- You want fixed inventory drops where buyers purchase existing IDs.

### Contracts and modules
- Core NFT contract: \`xtrata-v2-1-0\`
- Collection mint contract template: \`xtrata-collection-mint-v1.4\`
- Pre-inscribed sale contract template: \`xtrata-preinscribed-collection-sale-v1.0\`
- Admin module: Collection mint admin
- Admin module: Pre-inscribed sale admin
- Buyer flow: Mint / collection mint flows
- Buyer flow: Pre-inscribed sale buyer flow

### Setup checklist before launch
- Confirm wallet network and contract network match.
- Confirm contract IDs are correct.
- Set recipients and verify split total = \`10000\` bps.
- Set price, allowlist mode, and per-wallet limits.
- Set pause state and sale window carefully.
- Run a small test launch before the full drop.

### File handling model
- Collection mint: buyers typically upload files during mint; the app chunks and writes on-chain.
- Pre-inscribed sale: no buyer upload during sale; assets are already inscribed and sold by token ID.

### Safety habits
- Keep one admin wallet dedicated to launch operations.
- Record all launch tx IDs for audit and troubleshooting.
- If anything looks wrong, pause first, then verify settings and inventory.

For the full artist documentation, see \`docs/artist-guides/collection-launch-guide.md\`.`
  },
  {
    id: 'sdk-tooling',
    title: 'SDK in artist + manage portal',
    tag: 'SDK',
    description:
      'How the manage portal and allowlist connect to production-ready SDK tooling for third-party builders.',
    content: `## SDK integration model
Xtrata's creator portal is the no-code control layer. The SDK is the reusable build layer for third-party apps.

### What this means in practice
- Artists can launch and manage drops in \`/manage\` without touching raw contract code.
- Builders can use SDK clients and workflows to power their own marketplaces, game loops, and launch pages.
- Both paths run on the same protocol and contract rules.

### Who this section is for
- Artists: understand what the portal does for you and what stays configurable.
- Builders: understand how to integrate protocol reads/writes into your own app.
- Operators: understand allowlist boundaries and controlled rollout flow.
- Collectors and curious users: understand what is open now vs partner-gated.

### Allowlist and access boundaries
- Allowlist is for artist-management actions in \`/manage\` (deploy, publish, and contract-level controls).
- SDK read integrations are open to any builder.
- Production write flows should use deterministic workflow planners with deny-mode post-condition defaults.

### Recommended SDK path
- Start with \`@xtrata/sdk/simple\` for low-friction reads.
- Add \`@xtrata/sdk/workflows\` for mint/list/buy/cancel transaction planning.
- Use advanced modules only for custom orchestration or custom deployment tooling.

### Why this matters for ecosystem growth
- First-party pages remain a reference implementation.
- Third parties can launch branded UX while still settling against Xtrata contracts.
- Protocol improvements land once and benefit every integrated app.

### Partner access (invite to apply)
- Partner access is currently curated while the rollout stays high-quality and supportable.
- If you are building a marketplace, game, launchpad, or creator tool on top of Xtrata, you are encouraged to apply.
- Include:
  - your product/use-case summary
  - target launch timeline
  - the wallet addresses you want allowlisted for \`/manage\`
  - the contract flow you plan to use (collection mint, pre-inscribed sale, market, or mixed)
- Apply via the official channels in External references (\`@XtrataLayers\` on X and GitHub).

### Practical links
- SDK start point: \`docs/sdk/README.md\`
- Beginner path: \`docs/sdk/quickstart-simple-mode.md\`
- Artist launch context: \`docs/artist-guides/collection-launch-guide.md\``
  },
  {
    id: 'ai-agent-training',
    title: 'AI agent training package',
    tag: 'AI',
    description:
      'Where to train aibtc agents and generic AI agents to execute Xtrata workflows safely and reproducibly.',
    content: `## AI agent training package
Xtrata now ships a dedicated AI training package so autonomous agents can learn contract-correct mint, transfer, and query flows.

### Core package artifact
- Canonical skill file: \`XTRATA_AGENT_SKILL.md\`
- Companion scripts:
  - \`scripts/xtrata-mint-example.js\`
  - \`scripts/xtrata-transfer-example.js\`
  - \`scripts/xtrata-query-example.js\`

### Training tracks
- **aibtc track**:
  - Doc: \`docs/ai-skills/aibtc-agent-training.md\`
  - Focus: MCP wallet tools, signing via MCP, autonomous run loops, and recovery strategy.
- **Generic AI track**:
  - Doc: \`docs/ai-skills/generic-agent-training.md\`
  - Focus: library-driven agents (direct key or wallet adapter), typed transaction construction, and safe orchestration.

### Docs index
- Package index: \`docs/ai-skills/README.md\`

### Recommended rollout posture
- Train on testnet first with small files.
- Enforce post-conditions and deny mode for all fee-paying writes.
- Validate with read-only checks after each state transition.
- Keep retries bounded and use fallback endpoints under rate limits.`
  },
  {
    id: 'market',
    title: 'Market listings and escrow',
    tag: 'Market',
    description: 'Listing lifecycle, escrow validation, and safe buy/cancel behavior.',
    content: `## Listing lifecycle in practice
Listings rely on escrow transfer so buyers can trust settlement rules at purchase time.

### State model
- Escrowed: owner is market contract and listing is actionable.
- Stale: listing record exists but token owner changed.
- Unknown: temporary resolution gap while data catches up.

### Seller workflow
- Create listing from a wallet-owned token.
- Confirm listing appears as escrowed before sharing.
- Cancel immediately if listing becomes stale after side transfers.

### Buyer workflow
- Verify escrowed status and listing price.
- Use buy action with post-condition protection.
- Re-check ownership in viewer after purchase confirmation.

### Why escrow checks matter
- Prevents purchasing against invalid ownership state.
- Reduces stale listing confusion in high-activity collections.
- Keeps market UI aligned with on-chain truth.

### Practical hygiene
- Refresh active listings before major actions.
- Prefer card-level quick actions tied to resolved listing data.
- Treat stale status as a signal to cancel/relist, not as a temporary visual bug.`
  },
  {
    id: 'standards',
    title: 'Standards and protocols',
    tag: 'Standards',
    description: 'How SIP standards and recursive design patterns are used across mint, viewer, and market flows.',
    content: `## Protocol standards used in Xtrata
Xtrata aligns with established Stacks standards to keep wallet/indexer interoperability predictable.

### SIP-009 in operations
- Defines ownership and transfer semantics for NFTs.
- Market escrow and cancel logic depend on consistent SIP-009 ownership reads.
- Wallet tools use SIP-009 assumptions to validate list/cancel/transfer readiness.

### SIP-016 in discovery
- Defines token URI behavior and metadata structure expectations.
- Viewer and external indexers use token URI as a compatible metadata entry point.
- Fallback behavior is safer when SIP-016 fields are consistent.

### Recursive inscription patterns
- An inscription can reference other on-chain content for composability.
- Useful for modular art, dynamic assembly, or shared media components.
- Viewer dependency checks keep recursive rendering safer and more transparent.

### Interop best practices
- Keep mime type and URI metadata internally consistent.
- Avoid introducing non-standard schema changes without compatibility layers.
- Validate behavior in at least one external wallet/indexer path before release.`
  },
  {
    id: 'fees',
    title: 'Fees and costs',
    tag: 'Fees',
    description: 'Fee composition, estimation strategy, and practical ways to reduce failed-cost surprises.',
    content: `## Fee model breakdown
Mint costs come from protocol operation count plus base chain mining fees.

### Components that affect total spend
- Begin transaction cost.
- Number of batch upload calls required by file size/chunking.
- Seal transaction and seal fee unit multipliers.
- Chain mining conditions at submit time.

### Estimation mindset
- Treat the total as operation cost plus variable network cost.
- Larger files increase batch count, which increases execution and submission overhead.
- Session interruptions can increase retries, so conservative fee planning matters.

### Reducing avoidable cost
- Compress and optimize assets before mint.
- Prefer stable network periods for large drop sessions.
- Validate one sample file first, then scale.

### Team release practice
- Define a per-file budget band ahead of launch.
- Track actual vs expected cost for first few mints.
- Adjust chunking/file prep policy before full release.`
  },
  {
    id: 'admin',
    title: 'Admin & safety',
    tag: 'Operators',
    description: 'Admin controls, change management, and operational safeguards for production use.',
    content: `## Admin responsibilities
Admin operations should preserve availability, integrity, and predictable user behavior.

### Typical admin actions
- Pause or resume minting under known conditions.
- Update fee units under explicit policy.
- Manage allowlists for partner and collection contract paths.

### Change management discipline
- Announce maintenance windows before impactful changes.
- Apply one class of change at a time.
- Verify network/contract targeting before every privileged transaction.

### Safety practices
- Pause before migrations or emergency interventions.
- Keep allowlists minimal and auditable.
- Validate post-change behavior in viewer, market, and mint modules.

### Incident readiness
- Maintain a rollback-oriented response plan.
- Record tx IDs and timestamps for every admin change.
- Communicate user-facing impact quickly and explicitly.`
  },
  {
    id: 'viewer',
    title: 'Viewer and caching',
    tag: 'Viewer',
    description: 'Detailed loading pipeline, cache layers, and UX constraints that keep media-first viewing reliable.',
    content: `## Viewer architecture
The viewer is designed to stay responsive while resolving full on-chain media.

### Grid and preview are linked
- The grid loads token summaries and lightweight media first.
- The preview resolves richer content for the selected token.
- Listing state is merged from market activity and targeted read-only checks.

### Cache-first behavior
- IndexedDB stores thumbnails and resolved content.
- React Query prevents unnecessary refetches.
- Recent pages are remembered to warm cache when returning to the viewer.

### UX safeguards
- Square grid constraints are preserved across breakpoints.
- Preview keeps the selected art visible while metadata/tools scroll separately.
- Network retries stay bounded to avoid aggressive polling.

### Performance behavior you should expect
- First visit to a page may show staged loading while metadata and content resolve.
- Revisits should be significantly faster when cache entries are warm.
- Large files can display thumbnail first and full data once resolved.

### Operational tuning principles
- Prefer cache-first lookup before triggering fresh reads.
- Reuse resolved content between grid and preview when possible.
- Keep page-level prefetching bounded to avoid request storms.`,
  },
  {
    id: 'wallet-network',
    title: 'Wallet and network guardrails',
    tag: 'Wallet',
    description: 'Detailed wallet flow, address resolution rules, and transaction-safety guards.',
    content: `## Wallet session model
Wallet state is persisted and restored to reduce reconnect friction.

### Network guard behavior
- Contract/network mismatches are surfaced before transaction calls.
- Market and NFT contracts must match expected network.
- Actions are disabled when mismatch or missing prerequisites are detected.

### Wallet lookup and viewing
- You can view holdings by connected wallet or looked-up address/name.
- BNS lookup resolves names to addresses before wallet-mode filtering.
- Viewer mode and wallet mode share listing-aware rendering logic.

### Safe transaction posture
- Buy/cancel/list actions apply post-conditions where relevant.
- Seller-only cancel and owner-only list validations are enforced in UI before wallet prompt.

### Session and UX expectations
- Connected wallet identity and lookup identity can differ by design.
- Wallet mode should clearly signal which address is currently being viewed.
- Actions should remain blocked until all guards pass.

### Recommended operator behavior
- Resolve network mismatch before debugging transaction errors.
- Confirm selected contract context before signing.
- Use wallet tools for listing and transfer workflows to reduce cross-module ambiguity.`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting and diagnostics',
    tag: 'Support',
    description: 'Expanded runbook for diagnosing mint, viewer, and market problems quickly and safely.',
    content: `## Quick checks
If something looks wrong, start with these checks in order.

### 1) Confirm network alignment
- Wallet network must match active contract network.
- Market contract network must match the active NFT contract.

### 2) Confirm listing state
- If a listing is stale, owner is no longer the market contract.
- Use active listings + selected listing detail to verify escrow status.

### 3) Confirm content path
- Thumbnail can load before full media.
- Large content may appear after staged chunk resolution.
- Cached pages should load faster after first visit.

### 4) Retry safely
- Refresh active listings/market activity.
- Re-open wallet prompt only after status confirms prerequisites.
- If a tx fails post-condition, no protected asset transfer occurs.

### Minting-specific checks
- Confirm Begin succeeded before retrying batch uploads.
- Validate expected chunk count against file size assumptions.
- If Seal fails, inspect whether all chunks are actually present.

### Viewer-specific checks
- Distinguish thumbnail success from full media success.
- Confirm selected token metadata includes expected mime type.
- Re-open the same token after cache warmup to isolate transient load issues.

### Market-specific checks
- Verify seller address matches connected wallet for cancel flow.
- Verify listing owner is market contract before buy flow.
- Treat stale listings as state issues, not UI rendering issues.

### Escalation path
- Capture tx IDs, listing IDs, token IDs, and wallet/network context.
- Reproduce with one minimal token example.
- Escalate with exact reproduction steps and observed vs expected behavior.`,
  },
  {
    id: 'ai-skills-docs',
    title: 'AI skills docs',
    tag: 'Agents',
    description: 'Open the AI skills training package index (aibtc + generic tracks).',
    external: true,
    href: 'https://github.com/stxtrata/xtrata/tree/OPTIMISATIONS/xtrata-1.0/docs/ai-skills'
  },
  {
    id: 'ai-skills-aibtc',
    title: 'AIBTC training guide',
    tag: 'AIBTC',
    description: 'Track-specific training and execution guidance for aibtc MCP agents.',
    external: true,
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/aibtc-agent-training.md'
  },
  {
    id: 'ai-skills-generic',
    title: 'Generic AI training guide',
    tag: 'Agents',
    description: 'Track-specific training guidance for non-aibtc AI agents and frameworks.',
    external: true,
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/generic-agent-training.md'
  },
  {
    id: 'github',
    title: 'GitHub repository',
    tag: 'Source',
    description: 'View the full codebase and documentation on GitHub.',
    external: true,
    href: 'https://github.com/stxtrata/xtrata'
  },
  {
    id: 'x',
    title: 'X / Twitter',
    tag: 'Social',
    description: 'Follow updates from @XtrataLayers on X.',
    external: true,
    href: 'https://x.com/XtrataLayers'
  }
];

type DocSummary = {
  lead: string;
  points: string[];
};

const DOC_SUMMARIES: Record<string, DocSummary> = {
  overview: {
    lead: 'Connect your wallet, mint in three clear steps, and verify your result in Viewer.',
    points: [
      'Begin Inscription.',
      'Mint flow always runs in order: Begin -> upload batches -> Seal.',
      'After sealing, check both collection and wallet views.'
    ]
  },
  inscriptions: {
    lead: 'Your file bytes are written on-chain in chunks, then locked with a final hash.',
    points: [
      'Begin sets expectations, batches upload data, and Seal finalizes.',
      'The final hash makes content verification deterministic.',
      'Correct mime types improve rendering across grid and preview.'
    ]
  },
  ids: {
    lead: 'Continuous Token IDs across versions.',
    points: [
      'Legacy IDs stay valid and discoverable.',
      'New mints continue from the next available index.',
      'Verify ownership/listing state after migration-related transfers.'
    ]
  },
  'minting-modes': {
    lead: 'Choose minting mode by your goal: control, throughput, or rule-heavy distribution.',
    points: [
      'Direct mint is best for individual pieces.',
      'Batch workflows are best for larger drops.',
      'Partner contracts for creating custom collections.'
    ]
  },
  'artist-collection-launch': {
    lead: 'Artists can launch with either live minting or pre-inscribed inventory sales.',
    points: [
      'Collection mint lets buyers mint during checkout.',
      'Pre-inscribed sale lets buyers purchase pre-made token IDs.',
      'Before launch, verify network, contract IDs, splits (10000 bps), and pause state.'
    ]
  },
  'sdk-tooling': {
    lead: 'Manage is the guided control layer, while SDK packages power third-party apps and integrations.',
    points: [
      'Public reads are open; allowlist gates deploy/publish actions in /manage.',
      'SDK read integrations are open to third-party builders.',
      'Partner teams are invited to apply for curated allowlist access via official channels.'
    ]
  },
  'ai-agent-training': {
    lead: 'Use the dedicated AI training package to teach agents deterministic Xtrata workflows.',
    points: [
      'Package includes a canonical skill file and runnable mint/transfer/query scripts.',
      'aibtc and generic-agent tracks are documented separately.',
      'Train on testnet first, then enforce post-conditions and bounded retries on mainnet.'
    ]
  },
  market: {
    lead: 'Safe market actions depend on escrow status, not just visible listing cards.',
    points: [
      'Escrowed listings are actionable; stale listings should be canceled/relisted.',
      'Sellers should confirm escrow before sharing listing links.',
      'Buyers should re-check ownership after purchase confirmation.'
    ]
  },
  standards: {
    lead: 'Xtrata follows core Stacks standards so wallet/indexer behavior stays predictable.',
    points: [
      'SIP-009 governs NFT ownership and transfer semantics.',
      'SIP-016 supports token URI and metadata discovery paths.',
      'Recursive patterns support composable on-chain media experiences.'
    ]
  },
  fees: {
    lead: 'Mint cost combines contract operation fees and changing network mining fees.',
    points: [
      'File size drives chunk count, batch count, and total spend.',
      'Run a small sample mint first to validate your assumptions.',
      'Asset optimization and calmer network periods reduce cost surprises.'
    ]
  },
  admin: {
    lead: 'Admin operations prioritise safety, traceability, and predictable user impact.',
    points: [
      'Pause for emergency interventions.',
      'Apply one class of change at a time and verify targeting.',
      'Record tx IDs and timestamps for all privileged updates.'
    ]
  },
  viewer: {
    lead: 'Viewer is designed for fast browsing: cached grid first, richer preview on demand.',
    points: [
      'Grid and preview should resolve the same token content identity.',
      'IndexedDB plus React Query reduce refetching and improve revisit speed.',
      'Square media framing is preserved while metadata/actions sit outside it.'
    ]
  },
  'wallet-network': {
    lead: 'Wallet/network guardrails block risky actions before signing prompts appear.',
    points: [
      'Session state persists, but mismatches are surfaced before transactions.',
      'Wallet and looked-up address/BNS views can differ by design.',
      'List/cancel/buy actions enforce owner/seller checks in UI.'
    ]
  },
  troubleshooting: {
    lead: 'Diagnose issues in order: network, listing state, content path, then safe retry.',
    points: [
      'Capture tx IDs, token/listing IDs, wallet, and network context first.',
      'Differentiate thumbnail success from full-media success.',
      'Reproduce with one minimal token example before escalating.'
    ]
  }
};

const isInHouseDocSection = (doc: DocSection): doc is InHouseDocSection =>
  !doc.external && typeof doc.content === 'string';

const IN_HOUSE_DOC_SECTIONS = DOC_SECTIONS.filter(isInHouseDocSection);

const getDocSummary = (doc: DocSection): DocSummary =>
  DOC_SUMMARIES[doc.id] ?? { lead: doc.description, points: [] };

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const toMultilineText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

const isCollectionVisibleOnPublicPage = (metadata: unknown) => {
  const metadataRecord = toRecord(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  return toBoolean(collectionPage?.showOnPublicPage) === true;
};

const toBigIntOrNull = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed && typeof parsed === 'object' && 'value' in (parsed as Record<string, unknown>)) {
    return toBigIntOrNull((parsed as { value?: unknown }).value);
  }
  return toBigIntOrNull(parsed);
};

const unwrapReadOnly = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    const parsed = cvToValue(value.value) as unknown;
    throw new Error(String(parsed ?? 'Read-only call failed.'));
  }
  return value;
};

const formatBigintLabel = (value: bigint | null) =>
  value === null ? 'Unknown' : value.toString();

const MICROSTX_PER_STX = 1_000_000n;

const formatMicroStxLabel = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const whole = value / MICROSTX_PER_STX;
  const fraction = value % MICROSTX_PER_STX;
  return `${whole.toString()}.${fraction.toString().padStart(6, '0')} STX`;
};

const isPublicMintSoldOut = (status: PublicLiveMintStatus | null) => {
  if (!status) {
    return false;
  }
  if (status.remaining !== null && status.remaining <= 0n) {
    return true;
  }
  if (status.finalized === true) {
    return true;
  }
  if (
    status.maxSupply !== null &&
    status.mintedCount !== null &&
    status.mintedCount >= status.maxSupply
  ) {
    return true;
  }
  return false;
};

const buildMintStateLabel = (status: PublicLiveMintStatus | null) => {
  if (!status) {
    return 'Published';
  }
  if (status.finalized) {
    return 'Finalized';
  }
  if (status.remaining !== null && status.remaining <= 0n) {
    return 'Sold out';
  }
  if (
    status.maxSupply !== null &&
    status.mintedCount !== null &&
    status.mintedCount >= status.maxSupply
  ) {
    return 'Sold out';
  }
  if (status.paused) {
    return 'Paused';
  }
  return 'Live';
};

const resolvePublicCollectionContractTarget = (
  collection: PublicLiveCollectionRecord
): PublicCollectionContractTarget | null => {
  const metadata = toRecord(collection.metadata);
  const resolved = resolveCollectionContractLink({
    collectionId: toText(collection.id),
    collectionSlug: toText(collection.slug),
    contractAddress: toText(collection.contract_address),
    metadata
  });
  if (!resolved) {
    return null;
  }
  return {
    address: resolved.address,
    contractName: resolved.contractName,
    network: getNetworkFromAddress(resolved.address) ?? 'mainnet'
  };
};

const resolvePublicDisplayedMintPrice = (
  collection: PublicLiveCollectionCard,
  status: PublicLiveMintStatus | null
) => {
  const onChainPrice = status?.effectiveMintPrice ?? null;
  if (!status) {
    return null;
  }
  if (status.activePhaseMintPrice !== null) {
    return onChainPrice;
  }
  const paymentModel = resolveCollectionMintPaymentModel(collection.templateVersion);
  return resolveDisplayedCollectionMintPrice({
    activePhaseMintPriceMicroStx: status.activePhaseMintPrice,
    onChainMintPriceMicroStx: onChainPrice,
    paymentModel,
    pricing: collection.pricing,
    statusMintPriceMicroStx: status.mintPrice
  });
};

const isPublicCollectionFreeMint = (
  collection: PublicLiveCollectionCard,
  status: PublicLiveMintStatus | null
) => {
  if (!status) {
    return false;
  }
  return isDisplayedCollectionMintFree({
    activePhaseMintPriceMicroStx: status.activePhaseMintPrice,
    paymentModel: resolveCollectionMintPaymentModel(collection.templateVersion),
    pricing: collection.pricing,
    statusMintPriceMicroStx: status.mintPrice
  });
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  if (!error) {
    return 'Unknown error';
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const shouldTryReadOnlyFallback = (error: unknown) =>
  isRateLimitError(error) || isReadOnlyNetworkError(error);

const toMintStatusErrorMessage = (error: unknown) => {
  if (isRateLimitError(error)) {
    return `Upstream API rate-limited this request. Mint status refresh is paused and will retry in about ${Math.round(
      LIVE_MINT_RATE_LIMIT_BACKOFF_MS / 60_000
    )} minutes.`;
  }
  return getErrorMessage(error);
};

const loadPublicMintStatus = async (
  contract: PublicCollectionContractTarget
): Promise<PublicLiveMintStatus> => {
  const apiBaseUrls = getApiBaseUrls(contract.network);
  const senderAddress = contract.address;
  const readOnly = async (functionName: string, functionArgs: ClarityValue[] = []) => {
    let lastError: unknown = null;
    for (let index = 0; index < apiBaseUrls.length; index += 1) {
      const apiBaseUrl = apiBaseUrls[index];
      try {
        const response = await callReadOnlyFunction({
          contractAddress: contract.address,
          contractName: contract.contractName,
          functionName,
          functionArgs,
          senderAddress,
          network: toStacksNetwork(contract.network, apiBaseUrl)
        });
        return unwrapReadOnly(response);
      } catch (error) {
        lastError = error;
        const hasFallback = index < apiBaseUrls.length - 1;
        if (hasFallback && shouldTryReadOnlyFallback(error)) {
          continue;
        }
        break;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(getErrorMessage(lastError));
  };
  const [pausedCv, finalizedCv, mintPriceCv, activePhaseCv, maxSupplyCv, mintedCountCv, reservedCountCv] = await Promise.all([
    readOnly('is-paused'),
    readOnly('get-finalized'),
    readOnly('get-mint-price'),
    readOnly('get-active-phase'),
    readOnly('get-max-supply'),
    readOnly('get-minted-count'),
    readOnly('get-reserved-count')
  ]);

  const paused = toBoolean(cvToValue(pausedCv)) ?? null;
  const finalized = toBoolean(cvToValue(finalizedCv)) ?? null;
  const mintPrice = parseUintCv(mintPriceCv);
  const activePhaseId = parseUintCv(activePhaseCv);
  let activePhaseMintPrice: bigint | null = null;
  if (activePhaseId !== null && activePhaseId > 0n) {
    const phaseValue = await readOnly('get-phase', [uintCV(activePhaseId)]);
    if (phaseValue.type === ClarityType.OptionalSome) {
      const tuple = phaseValue.value;
      if (tuple.type === ClarityType.Tuple) {
        const phasePriceCv = tuple.data['mint-price'];
        if (phasePriceCv) {
          activePhaseMintPrice = parseUintCv(phasePriceCv);
        }
      }
    }
  }
  const maxSupply = parseUintCv(maxSupplyCv);
  const mintedCount = parseUintCv(mintedCountCv);
  const reservedCount = parseUintCv(reservedCountCv);
  const effectiveMintPrice = activePhaseMintPrice ?? mintPrice;
  const remaining =
    maxSupply === null || mintedCount === null || reservedCount === null
      ? null
      : maxSupply <= mintedCount + reservedCount
        ? 0n
        : maxSupply - mintedCount - reservedCount;

  return {
    paused,
    finalized,
    mintPrice,
    activePhaseId,
    activePhaseMintPrice,
    effectiveMintPrice,
    maxSupply,
    mintedCount,
    reservedCount,
    remaining,
    refreshedAt: Date.now()
  };
};

const parsePublicCollectionsResponse = async (response: Response) => {
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Collections response is not JSON: ${text.slice(0, 120)}`);
    }
  }
  if (!response.ok) {
    const message =
      toText(toRecord(payload)?.error) || `Failed to load collections (${response.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error('Collections response is not an array.');
  }
  return payload as PublicLiveCollectionRecord[];
};

type DocDetailToggleCopy = {
  open: string;
  close: string;
};

type DocModuleJump = {
  section: SectionKey;
  label: string;
};

const DOC_DETAIL_TOGGLE_COPY: Record<string, DocDetailToggleCopy> = {
  overview: {
    open: 'See the full walkthrough',
    close: 'Back to quick start'
  },
  inscriptions: {
    open: 'How the protocol works',
    close: 'Back to plain-language view'
  },
  ids: {
    open: 'Show migration details',
    close: 'Back to continuity basics'
  },
  'minting-modes': {
    open: 'Compare minting modes in detail',
    close: 'Back to mode summary'
  },
  'artist-collection-launch': {
    open: 'Open full launch guide',
    close: 'Back to launch essentials'
  },
  'sdk-tooling': {
    open: 'Explore SDK integration details',
    close: 'Back to SDK overview'
  },
  'ai-agent-training': {
    open: 'Open AI training package details',
    close: 'Back to AI training summary'
  },
  market: {
    open: 'Show listing and escrow mechanics',
    close: 'Back to market basics'
  },
  standards: {
    open: 'See standards and interop details',
    close: 'Back to standards overview'
  },
  fees: {
    open: 'Break down fee model',
    close: 'Back to fee highlights'
  },
  admin: {
    open: 'Show admin runbook',
    close: 'Back to safety essentials'
  },
  viewer: {
    open: 'Open viewer architecture details',
    close: 'Back to viewer summary'
  },
  'wallet-network': {
    open: 'See wallet/network safeguards',
    close: 'Back to guardrails summary'
  },
  troubleshooting: {
    open: 'Open full troubleshooting runbook',
    close: 'Back to quick checks'
  }
};

const DEFAULT_DOC_TOGGLE_COPY: DocDetailToggleCopy = {
  open: 'Go deeper on this topic',
  close: 'Back to summary'
};

const getDocDetailToggleCopy = (doc: DocSection | null): DocDetailToggleCopy => {
  if (!doc) {
    return DEFAULT_DOC_TOGGLE_COPY;
  }
  return DOC_DETAIL_TOGGLE_COPY[doc.id] ?? DEFAULT_DOC_TOGGLE_COPY;
};

const DOC_MODULE_JUMPS: Record<string, DocModuleJump> = {
  overview: { section: 'mint', label: 'Start in Mint' },
  inscriptions: { section: 'mint', label: 'Open Mint flow' },
  ids: { section: 'collection-viewer', label: 'Look at Viewer' },
  'minting-modes': { section: 'mint', label: 'Go to Mint' },
  'artist-collection-launch': { section: 'mint', label: 'Open mint tools' },
  'sdk-tooling': { section: 'wallet-session', label: 'Open wallet setup' },
  'ai-agent-training': { section: 'wallet-session', label: 'Open wallet setup' },
  market: { section: 'market', label: 'Open Market' },
  standards: { section: 'collection-viewer', label: 'Open Viewer' },
  fees: { section: 'mint', label: 'See fees in Mint' },
  admin: { section: 'active-contract', label: 'Open contract panel' },
  viewer: { section: 'collection-viewer', label: 'Look at Viewer' },
  'wallet-network': { section: 'wallet-session', label: 'Open Wallet panel' },
  troubleshooting: { section: 'wallet-lookup', label: 'Open Wallet lookup' }
};

const getDocModuleJump = (doc: DocSection | null): DocModuleJump | null => {
  if (!doc) {
    return null;
  }
  return DOC_MODULE_JUMPS[doc.id] ?? null;
};

const CREATIVE_STORY = {
  title: 'Xtrata is a graph-based, immutable execution reference layer.',
  foundation: [
    'Xtrata is infrastructure for on-chain state that must remain verifiable over time.',
    'It anchors modules, dependencies, and history as an append-only recursive graph instead of isolated mutable records.',
    'Apps can evolve quickly while inheriting stable, inspectable source-of-truth references.'
  ],
  guarantees: [
    'Append-only lineage: new states extend history instead of rewriting it.',
    'Deterministic reconstruction: the same references resolve to the same outcome.',
    'Composable references: systems can reuse shared primitives across apps.',
    'Forkable state: teams can branch systems without losing provenance.'
  ],
  enablesNow: [
    'Provenance-first media and asset systems with verifiable lineage.',
    'Shared game modules with auditable score and event trails.',
    'Versioned app manifests and dependency registries that can be reconstructed deterministically.',
    'Governance and policy records with append-only amendment history.',
    'Cross-app reusable primitives where references remain canonical over time.'
  ],
  enablesNext: [
    'Shared execution conventions across many independent apps.',
    'Richer agent and AI memory lineage anchored to immutable reference graphs.',
    'Large modular ecosystems where apps safely fork, remix, and recombine state.'
  ],

  architecture: [
    'Xtrata is the immutable reference graph.',
    'Contracts enforce bounded rules and settlement logic.',
    'Applications deliver UX, indexing, and off-chain compute.'
  ],

  boundaries: [
    'Xtrata does not replace application UX, indexing, or off-chain compute.',
    'Xtrata does not make legal rights enforcement automatic by itself.',
    'Xtrata provides durable state references so higher layers can enforce policy and coordination.'
  ],

  bigIdeaLead:
    'The foundational role is simple: make critical state trustworthy, composable, and durable.',
  bigIdeaTagline: 'Xtrata is boring infrastructure for useful, powerful, and exciting Web3 apps.'
};

const ARTIST_PORTAL_GUIDE = {
  title: 'Creator Portal and collection mint guide',
  intro: 'Public inscriptions are open. Collection contracts are available now.',
  access:
    'Contact Jim.BTC (@JimDotBTC on X) to request access to the Creator Portal.',
  portalSteps: [
    'Connect your approved wallet in the Creator Portal.',
    'Configure collection details, pricing, and sale settings.',
    'Upload assets, stage metadata, and publish when your drop is ready.',
    'Share your collection page so buyers can mint directly from your release.'
  ],
  mintFlow: [
    'Collection mints run through the collection mint contract.',
    'Each buyer mint finalizes an on-chain inscription in Xtrata-compatible format.',
    'Owner controls let you monitor status, pause/unpause, and manage launch operations.'
  ],
  sizeNote:
    'There is no fixed hard cap on collection size in this flow. Large releases should still be staged in manageable batches.'
};




type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; code: string };

const parseMarkdown = (markdown: string): DocBlock[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', code: codeLines.join('\n') });
      index += 1;
      continue;
    }
    if (line.startsWith('#')) {
      const match = line.match(/^(#+)\s+(.*)$/);
      if (match) {
        blocks.push({ type: 'heading', level: match[1].length, text: match[2] });
        index += 1;
        continue;
      }
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith('- ')) {
        items.push(lines[index].slice(2).trim());
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (lines[index].startsWith('- ') || lines[index].startsWith('#')) {
        break;
      }
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
      continue;
    }
    index += 1;
  }
  return blocks;
};

const renderInline = (text: string) => {
  const parts: Array<string | JSX.Element> = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`b-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={`c-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`l-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};

const renderMarkdown = (markdown: string) => {
  const blocks = parseMarkdown(markdown);
  return blocks.map((block, idx) => {
    switch (block.type) {
      case 'heading': {
        const Tag = block.level <= 2 ? 'h3' : 'h4';
        return <Tag key={`h-${idx}`}>{renderInline(block.text)}</Tag>;
      }
      case 'list':
        return (
          <ul key={`l-${idx}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`li-${idx}-${itemIndex}`}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      case 'code':
        return (
          <pre key={`c-${idx}`}>
            <code>{block.code}</code>
          </pre>
        );
      default:
        return <p key={`p-${idx}`}>{renderInline(block.text)}</p>;
    }
  });
};

export default function PublicApp() {
  const contract = PUBLIC_CONTRACT;
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialTheme()
  );
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupTouched, setWalletLookupTouched] = useState(false);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [creativeStoryOpen, setCreativeStoryOpen] = useState(false);
  const [artistPortalGuideOpen, setArtistPortalGuideOpen] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(() => {
    return IN_HOUSE_DOC_SECTIONS[0]?.id ?? null;
  });
  const [activeDocExpanded, setActiveDocExpanded] = useState(false);
  const [liveCollections, setLiveCollections] = useState<PublicLiveCollectionRecord[]>([]);
  const [liveCollectionsLoading, setLiveCollectionsLoading] = useState(false);
  const [liveCollectionsError, setLiveCollectionsError] = useState<string | null>(null);
  const [liveMintStatusByCollectionId, setLiveMintStatusByCollectionId] = useState<
    Record<string, PublicLiveMintStatus | null>
  >({});
  const [liveMintStatusLoadingByCollectionId, setLiveMintStatusLoadingByCollectionId] =
    useState<Record<string, boolean>>({});
  const [liveMintStatusErrorByCollectionId, setLiveMintStatusErrorByCollectionId] =
    useState<Record<string, string | null>>({});
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const initial = buildCollapsedState(false);
    initial['wallet-lookup'] = true;
    initial['wallet-session'] = true;
    initial['active-contract'] = true;
    initial['collection-viewer'] = true;
    initial.market = true;
    initial['live-collections'] = true;
    initial.mint = false;
    return initial;
  });
  const tabGuard = useActiveTabGuard();

  const queryClient = useQueryClient();
  const contractId = getContractId(contract);
  const contractExplorerUrl = useMemo(
    () => getStacksExplorerContractUrl(contractId, contract.network) ?? '#',
    [contractId, contract.network]
  );
  const activeDoc = useMemo(
    () => IN_HOUSE_DOC_SECTIONS.find((doc) => doc.id === activeDocId) ?? null,
    [activeDocId]
  );
  const activeDocSummary = useMemo(
    () => (activeDoc ? getDocSummary(activeDoc) : null),
    [activeDoc]
  );
  const activeDocToggleCopy = useMemo(
    () => getDocDetailToggleCopy(activeDoc),
    [activeDoc]
  );
  const activeDocModuleJump = useMemo(
    () => getDocModuleJump(activeDoc),
    [activeDoc]
  );
  const activeDocDetailsId = activeDoc ? `docs-details-${activeDoc.id}` : null;
  const activeDocPosition = useMemo(() => {
    if (!activeDocId) {
      return null;
    }
    const index = IN_HOUSE_DOC_SECTIONS.findIndex((doc) => doc.id === activeDocId);
    if (index < 0) {
      return null;
    }
    return {
      index,
      total: IN_HOUSE_DOC_SECTIONS.length
    };
  }, [activeDocId]);
  const liveCollectionCards = useMemo<PublicLiveCollectionCard[]>(() => {
    const cards = liveCollections
      .filter(
        (collection) =>
          String(collection.state ?? '')
            .trim()
            .toLowerCase() === 'published' &&
          isCollectionVisibleOnPublicPage(collection.metadata)
      )
      .map((collection) => {
        const metadata = toRecord(collection.metadata);
        const metadataCollection = toRecord(metadata?.collection);
        const metadataCollectionPage = toRecord(metadata?.collectionPage);
        const metadataPricing = toRecord(metadata?.pricing);
        const fallbackSupply = toBigIntOrNull(metadataCollection?.supply);
        const name =
          toText(metadataCollection?.name) ||
          toText(collection.display_name) ||
          toText(collection.slug) ||
          collection.id;
        const symbol = toText(metadataCollection?.symbol);
        const description =
          toMultilineText(metadataCollectionPage?.description) ||
          toMultilineText(metadataCollection?.description) ||
          'This collection is live and ready for minting.';
        const liveKey = toText(collection.slug) || collection.id;
        const livePath = `/collection/${encodeURIComponent(liveKey)}`;
        const contractTarget = resolvePublicCollectionContractTarget(collection);
        const contractId = contractTarget
          ? `${contractTarget.address}.${contractTarget.contractName}`
          : null;
        return {
          id: collection.id,
          slug: toText(collection.slug),
          name,
          artistAddress: toText(collection.artist_address),
          displayOrder: getCollectionPageDisplayOrder(collection.metadata),
          symbol: symbol.length > 0 ? symbol : 'N/A',
          description,
          livePath,
          coverImage: toRecord(metadataCollectionPage?.coverImage),
          fallbackCoreContractId: toText(metadata?.coreContractId) || null,
          fallbackSupply,
          contractId,
          contractTarget,
          templateVersion: toText(metadata?.templateVersion),
          pricing: resolveCollectionMintPricingMetadata(metadataPricing)
        };
      });
    return sortPublicCollectionCards(cards);
  }, [liveCollections]);
  const usdPriceBook = useUsdPriceBook({
    enabled: liveCollectionCards.length > 0
  }).data ?? null;
  const mismatch = getNetworkMismatch(contract.network, walletSession.network);
  const readOnlySender = walletSession.address ?? contract.address;
  const baseLookupState = useMemo(
    () => getWalletLookupState(walletLookupInput, walletSession.address ?? null),
    [walletLookupInput, walletSession.address]
  );
  const bnsLookupQuery = useBnsAddress({
    name: baseLookupState.lookupName,
    network: contract.network,
    enabled: !!baseLookupState.lookupName
  });
  const bnsLookupStatus = baseLookupState.lookupName
    ? bnsLookupQuery.isLoading
      ? 'loading'
      : bnsLookupQuery.isError
        ? 'error'
        : bnsLookupQuery.data?.address
          ? 'resolved'
          : 'missing'
    : 'idle';
  const bnsLookupError =
    bnsLookupQuery.error instanceof Error ? bnsLookupQuery.error.message : null;
  const walletLookupState = useMemo(
    () =>
      getWalletLookupState(walletLookupInput, walletSession.address ?? null, {
        resolvedNameAddress: bnsLookupQuery.data?.address ?? null,
        bnsStatus: bnsLookupStatus,
        bnsError: bnsLookupError
      }),
    [
      walletLookupInput,
      walletSession.address,
      bnsLookupQuery.data?.address,
      bnsLookupStatus,
      bnsLookupError
    ]
  );

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata Public',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const hasHiroApiKey =
    typeof __XSTRATA_HAS_HIRO_KEY__ !== 'undefined' &&
    __XSTRATA_HAS_HIRO_KEY__;
  const showRateLimitWarning = rateLimitWarning && !hasHiroApiKey;

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCollapseAll = () => {
    setCollapsedSections(buildCollapsedState(true));
  };

  const handleExpandAll = () => {
    setCollapsedSections(buildCollapsedState(false));
  };

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    applyThemeToDocument(nextTheme);
    writeThemePreference(nextTheme);
  };

  const focusSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: false }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const anchor = document.getElementById(key);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.history.replaceState(null, '', `#${key}`);
      });
    }
  };

  const handleNavJump = (
    event: MouseEvent<HTMLAnchorElement>,
    key: SectionKey
  ) => {
    event.preventDefault();
    focusSection(key);
  };

  const handleSelectDoc = (docId: string) => {
    setActiveDocId(docId);
    setActiveDocExpanded(false);
    if (typeof window === 'undefined') {
      return;
    }
    window.requestAnimationFrame(() => {
      if (!window.matchMedia('(max-width: 959px)').matches) {
        return;
      }
      const reader = document.getElementById('docs-reader');
      if (!reader) {
        return;
      }
      reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  useEffect(() => {
    if (hasHiroApiKey) {
      return;
    }
    const handler = () => {
      setRateLimitWarning(true);
    };
    window.addEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    return () => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    };
  }, [hasHiroApiKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const openHashSection = () => {
      const section = toSectionKeyFromHash(window.location.hash);
      if (!section) {
        return;
      }
      setCollapsedSections((prev) => ({ ...prev, [section]: false }));
      window.requestAnimationFrame(() => {
        const anchor = document.getElementById(section);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    };

    openHashSection();
    window.addEventListener('hashchange', openHashSection);
    return () => {
      window.removeEventListener('hashchange', openHashSection);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadLiveCollections = async () => {
      setLiveCollectionsLoading(true);
      setLiveCollectionsError(null);
      try {
        const response = await fetch(
          '/collections?publishedOnly=1&publicVisibleOnly=1',
          {
            signal: controller.signal
          }
        );
        const payload = await parsePublicCollectionsResponse(response);
        if (controller.signal.aborted) {
          return;
        }
        setLiveCollections(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to load live collections.';
        setLiveCollectionsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLiveCollectionsLoading(false);
        }
      }
    };

    void loadLiveCollections();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    const activeIds = new Set(liveCollectionCards.map((collection) => collection.id));
    setLiveMintStatusByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );
    setLiveMintStatusLoadingByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );
    setLiveMintStatusErrorByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );

    const cardsWithContracts = liveCollectionCards.filter(
      (
        collection
      ): collection is PublicLiveCollectionCard & {
        contractTarget: PublicCollectionContractTarget;
      } => collection.contractTarget !== null
    );
    const shouldRefreshLiveMintStatus =
      cardsWithContracts.length > 0 &&
      tabGuard.isActive &&
      !collapsedSections['live-collections'];
    if (!shouldRefreshLiveMintStatus) {
      return () => {
        cancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const scheduleRefresh = (delayMs: number) => {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void refreshMintStatus();
      }, delayMs);
    };

    const refreshMintStatus = async () => {
      setLiveMintStatusLoadingByCollectionId((current) => {
        const next = { ...current };
        cardsWithContracts.forEach((collection) => {
          next[collection.id] = true;
        });
        return next;
      });

      const settled = await Promise.all(
        cardsWithContracts.map(async (collection) => {
          try {
            const status = await loadPublicMintStatus(collection.contractTarget);
            return {
              id: collection.id,
              status,
              error: null as string | null,
              rateLimited: false
            };
          } catch (error) {
            return {
              id: collection.id,
              status: null as PublicLiveMintStatus | null,
              error: toMintStatusErrorMessage(error),
              rateLimited: isRateLimitError(error)
            };
          }
        })
      );

      if (cancelled) {
        return;
      }

      const hasRateLimitedEntry = settled.some((entry) => entry.rateLimited);
      const hasErrorEntry = settled.some((entry) => entry.error !== null);

      setLiveMintStatusByCollectionId((current) => {
        const next = { ...current };
        settled.forEach((entry) => {
          if (entry.status) {
            next[entry.id] = entry.status;
          } else if (!next[entry.id]) {
            next[entry.id] = null;
          }
        });
        return next;
      });
      setLiveMintStatusErrorByCollectionId((current) => {
        const next = { ...current };
        settled.forEach((entry) => {
          next[entry.id] = entry.error;
        });
        return next;
      });
      setLiveMintStatusLoadingByCollectionId((current) => {
        const next = { ...current };
        cardsWithContracts.forEach((collection) => {
          next[collection.id] = false;
        });
        return next;
      });

      const nextDelayMs = hasRateLimitedEntry
        ? LIVE_MINT_RATE_LIMIT_BACKOFF_MS
        : hasErrorEntry
          ? LIVE_MINT_ERROR_BACKOFF_MS
          : LIVE_MINT_REFRESH_INTERVAL_MS;
      scheduleRefresh(nextDelayMs);
    };

    void refreshMintStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [liveCollectionCards, tabGuard.isActive, collapsedSections['live-collections']]);

  useEffect(() => {
    if (!creativeStoryOpen && !artistPortalGuideOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCreativeStoryOpen(false);
        setArtistPortalGuideOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [creativeStoryOpen, artistPortalGuideOpen]);

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  const handleConnectWallet = async () => {
    setWalletPending(true);
    const session = await walletAdapter.connect();
    setWalletSession(session);
    setWalletPending(false);
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    await walletAdapter.disconnect();
    setWalletSession(walletAdapter.getSession());
    setWalletPending(false);
  };

  const handleWalletLookupSearch = () => {
    setViewerMode('wallet');
    setCollapsedSections((prev) => ({ ...prev, 'collection-viewer': false }));
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleClearWalletLookup = () => {
    setWalletLookupInput('');
    setWalletLookupTouched(false);
  };

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    setViewerMode('collection');
    queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line no-console
    console.log(`[mint] Seal submitted, txId=${payload.txId}`);
  };

  const openCreativeStory = () => {
    setCreativeStoryOpen(true);
  };

  const closeCreativeStory = () => {
    setCreativeStoryOpen(false);
  };

  const openArtistPortalGuide = () => {
    setArtistPortalGuideOpen(true);
  };

  const closeArtistPortalGuide = () => {
    setArtistPortalGuideOpen(false);
  };

  return (

 
   <div className="app">
    <header className="app__header">
      <section className="app__hero" aria-label="Xtrata overview">
        <div className="app__hero-content">
          <p className="app__hero-kicker">
            Immutable infrastructure for trustless creative and Web3 applications
          </p>
          <h1 className="app__title">
            XTRATA <span className="app__title-tag">On-Chain Data Layer</span>
          </h1>
          <p className="app__hero-note">
            Xtrata enables permanent, reconstructable on-chain media and application data — giving apps verifiable ownership, attribution, and deterministic execution.
            Moving beyond metadata pointers to fully composable on-chain data.
          </p>
        </div>

          <div className="app__hero-actions">
            <button
              className="button app__hero-button"
              type="button"
              onClick={openCreativeStory}
            >
              What is Xtrata?
            </button>
          </div>
        </section>

        <div className="app__nav-zone">
          <div className="app__toolbar">
            <nav className="app__nav" aria-label="Section navigation">
              <a
                className="button button--ghost app__nav-link"
                href="#wallet-lookup"
                onClick={(event) => handleNavJump(event, 'wallet-lookup')}
              >
                Wallet lookup
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#wallet-session"
                onClick={(event) => handleNavJump(event, 'wallet-session')}
              >
                Wallet
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#active-contract"
                onClick={(event) => handleNavJump(event, 'active-contract')}
              >
                Active contract
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#mint"
                onClick={(event) => handleNavJump(event, 'mint')}
              >
                Inscribe
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#collection-viewer"
                onClick={(event) => handleNavJump(event, 'collection-viewer')}
              >
                Viewer
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#market"
                onClick={(event) => handleNavJump(event, 'market')}
              >
                Market
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#commerce"
                onClick={(event) => handleNavJump(event, 'commerce')}
              >
                Commerce
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#live-collections"
                onClick={(event) => handleNavJump(event, 'live-collections')}
              >
                Artist collections
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#docs"
                onClick={(event) => handleNavJump(event, 'docs')}
              >
                Docs
              </a>
            </nav>
            <div className="app__controls">
              <div className="app__controls-group">
                <label className="theme-select" htmlFor="public-theme-select">
                  <span className="theme-select__label">Theme</span>
                  <select
                    id="public-theme-select"
                    className="theme-select__control"
                    value={themeMode}
                    onChange={handleThemeChange}
                    onInput={handleThemeChange}
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={openArtistPortalGuide}
                >
                  Creator portal
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleCollapseAll}
                >
                  Collapse all
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleExpandAll}
                >
                  Expand all
                </button>
              </div>
            </div>
          </div>
        </div>
        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
        />
      </header>
      {!tabGuard.isActive && (
        <div className="app__notice">
          <div className="alert">
            <div>
              <strong>Another xtrata tab is active.</strong> This tab is paused
              to avoid loading conflicts.
            </div>
            <button
              className="button"
              type="button"
              onClick={tabGuard.takeControl}
            >
              Make this tab active
            </button>
          </div>
        </div>
      )}
      <main className="app__main">
        <div className="app__modules app__modules--compact">
          <WalletLookupScreen
            walletSession={walletSession}
            lookupState={walletLookupState}
            lookupTouched={walletLookupTouched}
            onLookupTouched={setWalletLookupTouched}
            onLookupInputChange={setWalletLookupInput}
            onSearch={handleWalletLookupSearch}
            collapsed={collapsedSections['wallet-lookup']}
            onToggleCollapse={() => toggleSection('wallet-lookup')}
          />

          <section
            className={`panel app-section panel--compact wallet-session-panel${collapsedSections['wallet-session'] ? ' panel--collapsed' : ''}`}
            id="wallet-session"
          >
            <div className="panel__header">
              <div>
                <h2>Wallet</h2>
                <AddressLabel
                  className="wallet-session__inline-address"
                  address={walletSession.address}
                  network={walletSession.network}
                  fallback="Not connected"
                />
              </div>
              <div className="panel__actions">
                <span className="badge badge--neutral">
                  {walletSession.isConnected ? 'Connected' : 'Disconnected'}
                </span>
                {walletSession.isConnected ? (
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={handleDisconnectWallet}
                    disabled={walletPending}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={walletPending}
                  >
                    Connect wallet
                  </button>
                )}
                <button
                  className="button button--ghost button--collapse"
                  type="button"
                  onClick={() => toggleSection('wallet-session')}
                  aria-expanded={!collapsedSections['wallet-session']}
                >
                  {collapsedSections['wallet-session'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Address</span>
                  <AddressLabel
                    className="meta-value"
                    address={walletSession.address}
                    network={walletSession.network}
                    fallback="Not connected"
                  />
                </div>
              <div>
                <span className="meta-label">Wallet network</span>
                <span className="meta-value">
                  {walletSession.network ?? 'unknown'}
                </span>
              </div>
            </div>
              {mismatch && (
                <div className="alert">
                  Wallet is on {mismatch.actual}. Switch to {mismatch.expected}{' '}
                  to mint with this contract.
                </div>
              )}
              {showRateLimitWarning && (
                <div className="alert">
                  <div>
                    <strong>Rate limit detected.</strong> No Hiro API key is
                    configured for the dev proxy. Set HIRO_API_KEYS (or
                    HIRO_API_KEY) in .env.local and restart the dev server.
                  </div>
                  <button
                    className="button button--ghost"
                    onClick={() => setRateLimitWarning(false)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            className={`panel app-section panel--compact${collapsedSections['active-contract'] !== false ? ' panel--collapsed' : ''}`}
            id="active-contract"
          >
            <div className="panel__header">
              <div>
                <h2>Active contract</h2>
                <p>Public view and mint target.</p>
              </div>
              <div className="panel__actions">
                <span className={`badge badge--${contract.network}`}>
                  {contract.network}
                </span>
                <button
                  className="button button--ghost button--collapse"
                  type="button"
                  onClick={() => toggleSection('active-contract')}
                  aria-expanded={!collapsedSections['active-contract']}
                >
                  {collapsedSections['active-contract'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Contract</span>
                  <span className="meta-value">{contract.label}</span>
                </div>
                <div>
                  <span className="meta-label">Contract ID</span>
                  <a
                    className="meta-value active-contract__link"
                    href={contractExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {contractId}
                  </a>
                </div>
                <div>
                  <span className="meta-label">Network</span>
                  <span className="meta-value">{contract.network}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

        <ViewerScreen
          contract={contract}
          senderAddress={readOnlySender}
          walletSession={walletSession}
          walletLookupState={walletLookupState}
          focusKey={viewerFocusKey ?? undefined}
          collapsed={collapsedSections['collection-viewer']}
          onToggleCollapse={() => toggleSection('collection-viewer')}
          isActiveTab={tabGuard.isActive}
          mode={viewerMode}
          onModeChange={setViewerMode}
          onClearWalletLookup={handleClearWalletLookup}
          modeLabels={{ collection: 'Chain', wallet: 'Wallet' }}
          viewerTitles={{ collection: 'Chain viewer', wallet: 'Wallet viewer' }}
          allowSummaryPrefetch={false}
          allowBackgroundRelationshipSync={false}
        />

        <PublicMarketScreen
          contract={contract}
          walletSession={walletSession}
          collapsed={collapsedSections.market}
          onToggleCollapse={() => toggleSection('market')}
        />

        <PublicCommerceScreen
          contract={contract}
          walletSession={walletSession}
          collapsed={collapsedSections['commerce']}
          onToggleCollapse={() => toggleSection('commerce')}
        />

        <section
          className={`panel app-section${collapsedSections['live-collections'] ? ' panel--collapsed' : ''}`}
          id="live-collections"
        >
          <div className="panel__header">
            <div>
              <h2>Current + previous artist collections</h2>
              <p>Artist collection pages currently published by collection owners.</p>
            </div>
            <div className="panel__actions">
              <span className="badge badge--neutral">
                {liveCollectionsLoading
                  ? 'Refreshing'
                  : `${liveCollectionCards.length} listed`}
              </span>
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('live-collections')}
                aria-expanded={!collapsedSections['live-collections']}
              >
                {collapsedSections['live-collections'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            {liveCollectionsError && <div className="alert">{liveCollectionsError}</div>}
            {!liveCollectionsError && liveCollectionsLoading && liveCollectionCards.length === 0 && (
              <p>Loading artist collection pages...</p>
            )}
            {!liveCollectionsError &&
              !liveCollectionsLoading &&
              liveCollectionCards.length === 0 && (
                <p>No artist collections are currently published to the public page.</p>
              )}
            {liveCollectionCards.length > 0 && (
              <div className="public-live-collections">
                {liveCollectionCards.map((collection) => {
                  const mintStatus = liveMintStatusByCollectionId[collection.id] ?? null;
                  const mintStatusLoading = Boolean(
                    liveMintStatusLoadingByCollectionId[collection.id]
                  );
                  const mintStatusError = liveMintStatusErrorByCollectionId[collection.id] ?? null;
                  const effectiveMintPrice = resolvePublicDisplayedMintPrice(
                    collection,
                    mintStatus
                  );
                  const effectiveMintPriceDisplay = formatMicroStxWithUsd(
                    effectiveMintPrice,
                    usdPriceBook
                  );
                  const maxSupply = mintStatus?.maxSupply ?? collection.fallbackSupply ?? null;
                  const mintedCount = mintStatus?.mintedCount ?? null;
                  const remainingCount =
                    mintStatus?.remaining ??
                    (maxSupply !== null && mintedCount !== null
                      ? maxSupply <= mintedCount
                        ? 0n
                        : maxSupply - mintedCount
                      : null);
                  const mintStateLabel = buildMintStateLabel(mintStatus);
                  const soldOut = isPublicMintSoldOut(mintStatus);
                  const freeMint = isPublicCollectionFreeMint(collection, mintStatus);
                  const priceTone = resolveCollectionMintPriceTone({
                    displayedMintPriceMicroStx: effectiveMintPrice,
                    freeMint
                  });
                  const statusBadge = soldOut ? (
                    <span className="badge badge--compact badge--sold-out">Sold out</span>
                  ) : freeMint ? (
                    <span className="badge badge--compact badge--free-mint">Free mint</span>
                  ) : null;
                  return (
                    <a
                      className="public-live-collections__card"
                      key={collection.id}
                      href={collection.livePath}
                      aria-label={`Open ${collection.name} collection page`}
                    >
                      <div className="public-live-collections__media-stack">
                        <div className="public-live-collections__media">
                          <CollectionCoverImage
                            coverImage={collection.coverImage}
                            collectionId={collection.id}
                            fallbackCoreContractId={collection.fallbackCoreContractId}
                            alt={`${collection.name} cover`}
                            placeholderClassName="public-live-collections__media-placeholder"
                            emptyMessage="Collection cover image not set yet."
                            loadingMessage="Resolving cover image..."
                            errorMessage="Collection cover image unavailable."
                            debugLabel={`public-app-card:${collection.id}`}
                          />
                        </div>
                        <div
                          className={`public-live-collections__media-price public-live-collections__media-price--${priceTone}`}
                        >
                          Mint price
                          <strong>{effectiveMintPriceDisplay.primary}</strong>
                          <span className="public-live-collections__media-price-subtle">
                            {effectiveMintPriceDisplay.secondary ?? '\u00a0'}
                          </span>
                        </div>
                      </div>
                      <div className="public-live-collections__card-header">
                        <h3>{collection.name}</h3>
                        <div className="public-live-collections__card-badges">
                          <span className="badge badge--neutral">{collection.symbol}</span>
                          {statusBadge}
                        </div>
                      </div>
                      <div className="public-live-collections__artist">
                        <span className="meta-label">Artist</span>
                        <AddressLabel
                          className="public-live-collections__artist-label"
                          address={collection.artistAddress || null}
                          fallback="Artist unavailable"
                        />
                      </div>
                      <p className="public-live-collections__description">{collection.description}</p>
                      <div className="public-live-collections__summary">
                        <span className="public-live-collections__stat">
                          State: <strong>{mintStateLabel}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          Size: <strong>{formatBigintLabel(maxSupply)}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          Minted: <strong>{formatBigintLabel(mintedCount)}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          Remaining: <strong>{formatBigintLabel(remainingCount)}</strong>
                        </span>
                      </div>
                      <div className="public-live-collections__card-meta">
                        <p className="meta-value">
                          Collection: <code>{collection.slug || collection.id}</code>
                        </p>
                        {mintStatusLoading && (
                          <p className="meta-value">Refreshing mint status...</p>
                        )}
                        {mintStatusError && (
                          <p className="meta-value">
                            Mint status unavailable: {mintStatusError}
                          </p>
                        )}
                      </div>
                      <div className="mint-actions">
                        <span className="button button--ghost button--mini">
                          Open collection page
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section
          className={`panel app-section${collapsedSections.docs ? ' panel--collapsed' : ''}`}
          id="docs"
        >
          <div className="panel__header">
            <div>
              <h2>Docs</h2>
                <p>Understand the protocol, how minting works, how markets integrate, and how creators, collectors, and builders connect through Xtrata.</p>

            </div>
            <div className="panel__actions">
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('docs')}
                aria-expanded={!collapsedSections.docs}
              >
                {collapsedSections.docs ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <div className="docs-layout">
              <aside className="docs-menu" aria-label="Documentation topics">
                <div className="docs-menu__section">
                  <h3>Docs</h3>
                  <p>Expand any section for greater detail.</p>
                  <div className="docs-menu__list">
                    {IN_HOUSE_DOC_SECTIONS.map((doc) => (
                      <button
                        key={doc.id}
                        className={`docs-menu__item${activeDocId === doc.id ? ' docs-menu__item--active' : ''}`}
                        type="button"
                        onClick={() => handleSelectDoc(doc.id)}
                        aria-pressed={activeDocId === doc.id}
                      >
                        <span className="docs-menu__item-title">{doc.title}</span>
                        <span className="docs-menu__item-tag">{doc.tag}</span>
                      </button>
                    ))}
                  </div>
                  {activeDoc && (
                    <div className="docs-menu__active">
                      <p className="docs-menu__active-label">Selected topic</p>
                      <p className="docs-menu__active-title">{activeDoc.title}</p>
                      <p className="docs-menu__active-text">{activeDoc.description}</p>
                    </div>
                  )}
                </div>
              </aside>
              <article className="docs-reader" id="docs-reader">
                {activeDoc ? (
                  <>
                    <div className="docs-viewer__header">
                      <div>
                        <h3>{activeDoc.title}</h3>
                        <span className="docs-viewer__tag">{activeDoc.tag}</span>
                      </div>
                    </div>
                    {activeDocPosition && (
                      <p className="docs-viewer__progress">
                        Topic {activeDocPosition.index + 1} of {activeDocPosition.total}
                      </p>
                    )}
                    {activeDocSummary && (
                      <div className="docs-viewer__summary">
                        <p className="docs-viewer__summary-lead">{activeDocSummary.lead}</p>
                        {activeDocSummary.points.length > 0 && (
                          <ul className="docs-viewer__summary-list">
                            {activeDocSummary.points.map((point, index) => (
                              <li key={`${activeDoc.id}-summary-${index}`}>{point}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="docs-viewer__actions">
                      <button
                        className="button button--ghost docs-viewer__toggle"
                        type="button"
                        onClick={() => setActiveDocExpanded((prev) => !prev)}
                        aria-expanded={activeDocExpanded}
                        aria-controls={activeDocDetailsId ?? undefined}
                      >
                        {activeDocExpanded
                          ? activeDocToggleCopy.close
                          : activeDocToggleCopy.open}
                      </button>
                      {activeDocModuleJump && (
                        <button
                          className="button button--ghost docs-viewer__jump"
                          type="button"
                          onClick={() => focusSection(activeDocModuleJump.section)}
                        >
                          {activeDocModuleJump.label}
                        </button>
                      )}
                    </div>
                    <div
                      className={`docs-viewer__details${activeDocExpanded ? ' is-open' : ''}`}
                      id={activeDocDetailsId ?? undefined}
                      hidden={!activeDocExpanded}
                    >
                      <div className="docs-viewer__content">
                        {renderMarkdown(activeDoc.content)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="docs-viewer__empty">
                    Select a topic from the menu to read it here.
                  </div>
                )}
              </article>
              <div className="docs-menu__section">
                <h3>External references</h3>
                <div className="docs-menu__links">
                  {DOC_SECTIONS.filter((doc) => doc.external && doc.href).map((doc) => (
                    <a
                      key={doc.id}
                      className="docs-menu__link"
                      href={doc.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="docs-menu__link-header">
                        {(doc.id === 'github' || doc.id === 'x') && (
                          <span className="docs-menu__link-icon" aria-hidden="true">
                            <svg viewBox="0 0 16 16" focusable="false">
                              {doc.id === 'github' ? (
                                <path
                                  fill="currentColor"
                                  d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.49-2.7-1.07-2.7-1.07-.37-.92-.9-1.16-.9-1.16-.74-.5.06-.49.06-.49.82.06 1.25.84 1.25.84.73 1.25 1.91.89 2.38.68.07-.53.29-.89.52-1.09-1.78-.2-3.64-.89-3.64-3.96 0-.88.31-1.6.83-2.16-.08-.21-.36-1.03.08-2.14 0 0 .68-.22 2.22.82A7.7 7.7 0 0 1 8 4.85c.68 0 1.36.09 2 .26 1.54-1.04 2.22-.82 2.22-.82.44 1.11.16 1.93.08 2.14.51.56.82 1.28.82 2.16 0 3.08-1.87 3.76-3.66 3.96.29.24.55.73.55 1.47v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                                />
                              ) : (
                                <path
                                  fill="currentColor"
                                  d="M3 2h2.75l2.86 4.09L12.12 2H14l-4.36 4.98L14.5 14h-2.75l-3.02-4.3L4.94 14H3.06l4.48-5.12L3 2zm1.79 1.05L11.8 13h.91L5.7 3.05h-.91z"
                                />
                              )}
                            </svg>
                          </span>
                        )}
                        <span className="docs-menu__link-title">{doc.title}</span>
                      </span>
                      <span className="docs-menu__link-text">{doc.description}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      {creativeStoryOpen && (
        <div
          className="modal-overlay story-modal-overlay"
          onClick={closeCreativeStory}
          role="presentation"
        >
          <div
            className="modal story-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creative-story-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__header story-modal__header">
              <div>
                <p className="story-modal__eyebrow">Xtrata First, Apps Next</p>
                <h2 className="modal__title story-modal__title" id="creative-story-title">
                  {CREATIVE_STORY.title}
                </h2>
              </div>
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={closeCreativeStory}
              >
                Close
              </button>
            </div>

            <div className="story-modal__body">
              {CREATIVE_STORY.foundation.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              <section className="story-modal__section">
                <h3>Core guarantees</h3>
                <ul className="story-modal__proof-list">
                  {CREATIVE_STORY.guarantees.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section">
                <h3>What Xtrata enables now</h3>
                <ul className="story-modal__proof-list">
                  {CREATIVE_STORY.enablesNow.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section">
                <h3>What Xtrata could enable next</h3>
                <ul className="story-modal__proof-list">
                  {CREATIVE_STORY.enablesNext.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section">
                <h3>Stack separation</h3>
                {CREATIVE_STORY.architecture.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>

              <section className="story-modal__section">
                <h3>Scope and boundaries</h3>
                <ul className="story-modal__proof-list">
                  {CREATIVE_STORY.boundaries.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section story-modal__section--highlight">
                <h3>So. What's the BIG idea?</h3>
                <p>
                  {CREATIVE_STORY.bigIdeaLead}
                  <span className="story-modal__big-idea-tagline">
                    {CREATIVE_STORY.bigIdeaTagline}
                  </span>
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
      {artistPortalGuideOpen && (
        <div
          className="modal-overlay"
          onClick={closeArtistPortalGuide}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="artist-portal-guide-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__header">
              <div>
                <p className="story-modal__eyebrow">For artists</p>
                <h2 className="modal__title" id="artist-portal-guide-title">
                  {ARTIST_PORTAL_GUIDE.title}
                </h2>
              </div>
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={closeArtistPortalGuide}
              >
                Close
              </button>
            </div>

            <div className="story-modal__body">
              <p>{ARTIST_PORTAL_GUIDE.intro}</p>
              <p>
                <strong>{ARTIST_PORTAL_GUIDE.access}</strong>
              </p>

              <section className="story-modal__section">
                <h3>How the Creator Portal works</h3>
                <ul className="story-modal__proof-list">
                  {ARTIST_PORTAL_GUIDE.portalSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section">
                <h3>How collection mints work</h3>
                <ul className="story-modal__proof-list">
                  {ARTIST_PORTAL_GUIDE.mintFlow.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>

              <section className="story-modal__section story-modal__section--highlight">
                <h3>Collection size</h3>
                <p>{ARTIST_PORTAL_GUIDE.sizeNote}</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
