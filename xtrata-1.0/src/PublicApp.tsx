import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import { getContractId } from './lib/contract/config';
import { useBnsAddress } from './lib/bns/hooks';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkMismatch } from './lib/network/guard';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import AddressLabel from './components/AddressLabel';
import MintScreen from './screens/MintScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';
import WalletLookupScreen from './screens/WalletLookupScreen';
import PublicMarketScreen from './screens/PublicMarketScreen';

const walletSessionStore = createWalletSessionStore();

const SECTION_KEYS = [
  'wallet-lookup',
  'wallet-session',
  'active-contract',
  'docs',
  'mint',
  'market',
  'collection-viewer'
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

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
- The inscription appears in collection mode and wallet mode.

### First-week operating habits
- Keep a small test file workflow for quick verification before larger mints.
- Track token IDs and tx IDs for each release.
- If you run listings, confirm escrow status before sharing market links.

### Common onboarding mistakes to avoid
- Minting on the wrong network relative to contract selection.
- Upload interruption between Begin and Seal without re-checking status.
- Assuming thumbnail resolution equals full media completion.`
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
    title: 'IDs and v1/v2 continuity',
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
    id: 'xst-token',
    title: 'XST participation token',
    tag: 'XST',
    description: 'Deterministic emissions that begin at inscription #1000.',
    content: `## XST in one view
XST is the participation token of Xtrata. It is not sold, not pre-mined, and not governed after deployment.

### Hard guarantees
- Fixed supply: **1,000,000,000 XST**
- Emissions start only after **inscription #1000** exists
- Emissions run for **4 years** (~210,240 blocks at ~10 minutes) and then stop forever
- No admin switches can change supply or schedule

### Emission schedule (per block)
- Year 1: 40% (400,000,000)
- Year 2: 30% (300,000,000)
- Year 3: 20% (200,000,000)
- Year 4: 10% (100,000,000)

Per-block emission is constant within each year and computed from ~52,560 blocks per year.

### Distribution model
- **Owner pool (70%)** goes to inscription owners (weighted by token ID)
- **Participant pool (30%)** is optional and can reward active participants (sqrt weighting)
- Claims are pull-based. The contract never loops over wallets.

### Inscription weighting (owner pool)
Weights are deterministic and tied to token ID:
- #0 = 1400
- #1-10 = 1200
- #11-100 = 1000
- #101-1,000 = 800
- #1,001-10,000 = 640
- #10,001-100,000 = 512
- #100,001-1,000,000 = 410
Weights continue to decay by 4/5 each decade after that.

### Determinism guarantees
- Start block is set once at #1000
- Emissions depend only on block height
- Weights depend only on token ID
- Ownership is read directly from the NFT

### Claim mechanics (simplified)
- Update emissions
- pending = weight x (accumulator - rewardDebt)
- Transfer to current owner
- Update rewardDebt

### Claim operations in real usage
- Claims are independent per wallet and can be run on your own cadence.
- Longer intervals can reduce operational overhead but increase single-claim size.
- Frequent claims can improve personal accounting visibility.

### Practical interpretation of weights
- Earlier inscriptions have stronger weight and larger share pressure.
- Later IDs still participate but with lower multiplier tiers.
- Distribution is deterministic, so expectations can be modeled ahead of claim.

### What this means for participants
- No hidden inflation path after the 4-year schedule ends.
- Ownership changes immediately affect future owner-pool attribution.
- Protocol rules stay transparent because all key math is deterministic and auditable.`
  },
  {
    id: 'xst-oracle',
    title: 'XST oracle inscription',
    tag: 'Oracle',
    description: 'A single on-chain viewer that reads live token stats.',
    content: `## One permanent inscription, live stats
The oracle inscription is a single HTML/JS inscription that renders the current XST state.

### What it shows
- Emissions start block and time elapsed
- Total emitted, remaining supply, and projected end date
- Distribution by owner pool and participant pool
- Claimable estimates for a given inscription ID

### How it stays live
The inscription itself is static, but it calls public on-chain read-only endpoints:
- XST token contract for emission state
- Xtrata contract for inscription IDs and ownership
- Indexer APIs for holder distribution snapshots
The viewer refreshes on an interval and caches results to avoid heavy polling.

### Important note
This is a **viewer**, not a consensus oracle. It never writes to chain and does not change token state.

### Reading the oracle responsibly
- Use it for insight and planning, not as the source of execution guarantees.
- Cross-check critical values against direct read-only calls when needed.
- Expect minor lag based on indexer refresh intervals.

### Operational value
- Gives participants a shared dashboard view of emissions progress.
- Makes pool distribution trends easier to communicate publicly.
- Reduces manual query overhead for recurring reporting.`
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
    id: 'github',
    title: 'GitHub repository',
    tag: 'Source',
    description: 'View the full codebase and documentation on GitHub.',
    external: true,
    href: 'https://github.com/stxtrata/xtrata'
  }
];

const IN_HOUSE_DOC_SECTIONS = DOC_SECTIONS.filter(
  (doc) => !doc.external && !!doc.content
);

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
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupTouched, setWalletLookupTouched] = useState(false);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [activeDocId, setActiveDocId] = useState<string | null>(() => {
    return IN_HOUSE_DOC_SECTIONS[0]?.id ?? null;
  });
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const initial = buildCollapsedState(false);
    initial['wallet-lookup'] = true;
    initial['wallet-session'] = true;
    return initial;
  });
  const tabGuard = useActiveTabGuard();

  const queryClient = useQueryClient();
  const contractId = getContractId(contract);
  const activeDoc = useMemo(
    () => DOC_SECTIONS.find((doc) => doc.id === activeDocId) ?? null,
    [activeDocId]
  );
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

  const handleSelectDoc = (docId: string) => {
    setActiveDocId(docId);
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

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <h1 className="app__title">
            XTRATA <span className="app__title-tag">- Data Inscription Portal</span>
          </h1>
          <div className="app__toolbar">
            <nav className="app__nav">
              <a className="button button--ghost app__nav-link" href="#wallet-lookup">
                Wallet lookup
              </a>
              <a className="button button--ghost app__nav-link" href="#wallet-session">
                Wallet
              </a>
              <a className="button button--ghost app__nav-link" href="#active-contract">
                Active contract
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#collection-viewer"
              >
                Viewer
              </a>
              <a className="button button--ghost app__nav-link" href="#market">
                Market
              </a>
              <a className="button button--ghost app__nav-link" href="#mint">
                Mint
              </a>
              <a className="button button--ghost app__nav-link" href="#docs">
                Docs
              </a>
            </nav>
            <div className="app__controls">
              <div className="app__controls-group">
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
        <p>View the collection, mint an inscription, and manage your wallet.</p>
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
                    configured for the dev proxy. Set HIRO_API_KEY in .env.local
                    and restart the dev server.
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
            className={`panel app-section panel--compact${collapsedSections['active-contract'] ? ' panel--collapsed' : ''}`}
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
                  <span className="meta-value">{contractId}</span>
                </div>
                <div>
                  <span className="meta-label">Network</span>
                  <span className="meta-value">{contract.network}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

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
        />

        <PublicMarketScreen
          contract={contract}
          walletSession={walletSession}
          collapsed={collapsedSections.market}
          onToggleCollapse={() => toggleSection('market')}
        />

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

        <section
          className={`panel app-section${collapsedSections.docs ? ' panel--collapsed' : ''}`}
          id="docs"
        >
          <div className="panel__header">
            <div>
              <h2>Docs</h2>
              <p>Learn the protocol, minting flow, markets, and how the tech fits together.</p>
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
                  <h3>In-house topics</h3>
                  <p>Select a topic to expand it for full reading.</p>
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
                        <span className="docs-menu__item-text">{doc.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
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
                        <span className="docs-menu__link-title">{doc.title}</span>
                        <span className="docs-menu__link-text">{doc.description}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </aside>
              <article className="docs-reader" id="docs-reader">
                {activeDoc && activeDoc.content ? (
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
                    <div className="docs-viewer__content">
                      {renderMarkdown(activeDoc.content)}
                    </div>
                  </>
                ) : (
                  <div className="docs-viewer__empty">
                    Select a topic from the menu to read it here.
                  </div>
                )}
              </article>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
