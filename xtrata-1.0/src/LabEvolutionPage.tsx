import { useEffect, useState, type ChangeEvent } from 'react';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';

const HOME_PATH = '/';
const LAB_PATH = '/lab';
const WORKSPACE_PATH = '/workspace';

type EvolutionNavItem = {
  label: string;
  href: string;
};

type EvolutionHeroCard = {
  step: string;
  title: string;
  description: string;
};

type EvolutionStage = {
  step: string;
  title: string;
  subtitle: string;
  intro: string;
  unlocked: string[];
  detailTitle: string;
  details: string[];
  takeaway: string;
};

type CapabilityCard = {
  title: string;
  description: string;
};

type NextLayerCard = {
  title: string;
  description: string;
  points: string[];
};

type SummaryRow = {
  layer: string;
  solved: string;
  missing: string;
};

const NAV_ITEMS: readonly EvolutionNavItem[] = [
  { label: 'Timeline', href: '#timeline' },
  { label: 'Xtrata', href: '#xtrata' },
  { label: 'AI + Payments', href: '#next-layer' },
  { label: 'Why Builders Care', href: '#why-builders-care' }
] as const;

const HERO_SIGNALS = [
  'Distributed storage',
  'Permanent archives',
  'Bitcoin-native data',
  'Programmable permanence'
] as const;

const HERO_CARDS: readonly EvolutionHeroCard[] = [
  {
    step: '01',
    title: 'IPFS',
    description: 'Distribution through content addressing.'
  },
  {
    step: '02',
    title: 'Arweave',
    description: 'Persistence with long-term storage incentives.'
  },
  {
    step: '03',
    title: 'Ordinals',
    description: 'Bitcoin-native permanence for on-chain artifacts.'
  },
  {
    step: '04',
    title: 'Xtrata',
    description: 'Programmable, composable, application-ready data.'
  }
] as const;

const EVOLUTION_STAGES: readonly EvolutionStage[] = [
  {
    step: '01',
    title: 'IPFS',
    subtitle: 'Distributed storage',
    intro:
      'IPFS changed how data is addressed. Instead of asking where a file lives, builders ask for the content identified by its CID.',
    unlocked: [
      'Decentralized file storage',
      'Content-addressed data',
      'Reduced reliance on centralized servers'
    ],
    detailTitle: 'Limitations',
    details: [
      'Not permanent by default because data must be pinned.',
      'Availability depends on nodes staying online.',
      'No built-in economic guarantees.',
      'No native programmability or composability.'
    ],
    takeaway: 'IPFS solved distribution, but not permanence or logic.'
  },
  {
    step: '02',
    title: 'Arweave',
    subtitle: 'Permanent storage',
    intro:
      'Arweave introduced the idea of paying once for long-term storage, turning permanence into a first-class product promise.',
    unlocked: [
      'Permanent data storage',
      'Economic incentives for long-term availability',
      'The permaweb: apps and records built to persist'
    ],
    detailTitle: 'Limitations',
    details: [
      'Data is static once uploaded.',
      'Composability between objects is limited.',
      'There is no rich execution layer.',
      'Dynamic systems are harder to build and evolve.'
    ],
    takeaway: 'Arweave solved permanence, but not programmable composition.'
  },
  {
    step: '03',
    title: 'Ordinals',
    subtitle: 'Data on Bitcoin',
    intro:
      'Ordinals moved data directly onto Bitcoin and shifted builder culture toward fully on-chain assets and artifacts.',
    unlocked: [
      'True on-chain storage on Bitcoin',
      'Immutable inscriptions tied to satoshis',
      'A cultural move toward fully on-chain assets'
    ],
    detailTitle: 'Limitations',
    details: [
      'No native programmability.',
      'Limited structure for complex systems.',
      'Composing across inscriptions is hard.',
      'The model was not designed for application logic.'
    ],
    takeaway: 'Ordinals solved Bitcoin-native permanence, but not application layers.'
  },
  {
    step: '04',
    title: 'Xtrata',
    subtitle: 'Programmable on-chain data',
    intro:
      'Xtrata builds on that progression and adds the missing application layer on Stacks, so data can be stored, referenced, extended, and used inside real systems.',
    unlocked: [
      'Programmable data through smart contracts on Stacks',
      'Composable structures that reference and build on other data',
      'Chunked, scalable storage for larger assets and modules',
      'Application-ready architecture for products, not just files',
      'Integration with STX, USDCx, and sBTC'
    ],
    detailTitle: 'What makes it different',
    details: [
      'Data is not only stored. It can be used, linked, and extended.',
      'Builders can create systems, not only files.',
      'Everything can become part of a living on-chain graph.'
    ],
    takeaway: 'Xtrata solves programmable permanence.'
  }
] as const;

const XTRATA_CAPABILITIES: readonly CapabilityCard[] = [
  {
    title: 'Programmable data',
    description: 'Data can participate in contract logic instead of sitting beside it as a passive file.'
  },
  {
    title: 'Composable structures',
    description: 'Records, modules, and media can reference one another and accumulate value across products.'
  },
  {
    title: 'Scalable chunking',
    description: 'Larger payloads can be stored in a way that stays verifiable and reconstructable.'
  },
  {
    title: 'App-ready architecture',
    description: 'Builders can ship product surfaces, workflows, and reusable primitives on top of the protocol.'
  },
  {
    title: 'Native settlement rails',
    description: 'STX, USDCx, and sBTC can plug into products that need payments, access, or automation.'
  }
] as const;

const NEXT_LAYER_CARDS: readonly NextLayerCard[] = [
  {
    title: 'AI + immutable memory',
    description:
      'Xtrata gives agents and AI systems a durable memory layer instead of disposable session state.',
    points: [
      'Store AI outputs permanently.',
      'Create verifiable memory for agents.',
      'Track how content evolves over time.',
      'Build systems that remember across sessions and users.'
    ]
  },
  {
    title: 'x402 + payment-native logic',
    description:
      'Programmable permanence becomes more useful when machines can charge, settle, and unlock behavior natively.',
    points: [
      'Charge for API access, agent actions, or content.',
      'Enable machine-to-machine payments.',
      'Support pay-per-use AI, data, and services.',
      'Combine settlement with STX, USDCx, and sBTC.'
    ]
  }
] as const;

const NEXT_LAYER_OUTCOMES = [
  'Autonomous agents with memory and payments',
  'Paid AI interactions and durable service logs',
  'On-chain audit trails for AI-generated work'
] as const;

const SUMMARY_ROWS: readonly SummaryRow[] = [
  {
    layer: 'IPFS',
    solved: 'Distributed storage',
    missing: 'Permanence, incentives, logic'
  },
  {
    layer: 'Arweave',
    solved: 'Permanent storage',
    missing: 'Programmability, composability'
  },
  {
    layer: 'Ordinals',
    solved: 'Bitcoin-native permanence',
    missing: 'Application layer'
  },
  {
    layer: 'Xtrata',
    solved: 'Programmable, composable, permanent data',
    missing: 'Nothing in this sequence'
  }
] as const;

const BUILDER_SHIFTS = [
  'Building systems instead of uploading files.',
  'Creating reusable primitives instead of isolated assets.',
  'Enabling collaboration across time instead of one-off releases.',
  'Monetizing data and logic directly instead of depending on a platform middle layer.'
] as const;

const TAKEAWAY_LINES = [
  'IPFS stored data',
  'Arweave made it permanent',
  'Ordinals put it on Bitcoin',
  'Xtrata makes it usable'
] as const;

export default function LabEvolutionPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'The Evolution of On-Chain Data | Xtrata';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeMode);
  }, [themeMode]);

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    writeThemePreference(nextTheme);
  };

  return (
    <div className="app lab-page lab-evolution-page">
      <header className="app__header">
        <section className="panel lab-page__masthead" aria-label="Evolution page navigation">
          <div className="lab-page__brand">
            <a className="lab-page__brand-link" href={HOME_PATH}>
              XTRATA
            </a>
            <span className="badge badge--neutral">LAB framing</span>
          </div>

          <nav className="lab-page__topnav" aria-label="Evolution section navigation">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} className="lab-page__topnav-link" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="lab-page__masthead-actions">
            <a className="button button--ghost button--mini" href={LAB_PATH}>
              LAB home
            </a>
            <a className="button button--mini" href={WORKSPACE_PATH}>
              Workspace
            </a>
            <label className="theme-select" htmlFor="lab-evolution-theme-select">
              <span className="theme-select__label">Theme</span>
              <select
                id="lab-evolution-theme-select"
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
          </div>
        </section>

        <section className="panel lab-page__hero lab-evolution-page__hero" aria-label="The evolution of on-chain data">
          <div className="lab-page__hero-copy lab-evolution-page__hero-copy">
            <span className="lab-page__eyebrow">The evolution of on-chain data</span>
            <h1 className="lab-page__headline lab-evolution-page__headline">
              From storage to permanence to programmability.
            </h1>
            <p className="lab-evolution-page__hero-tagline">
              Xtrata is not random. It is the next step in a clear builder-facing progression.
            </p>
            <p className="lab-page__subline">
              IPFS changed distribution. Arweave made permanence a product. Ordinals brought data
              fully onto Bitcoin. Xtrata adds the missing application layer, so builders can turn
              permanent data into systems, workflows, and living on-chain graphs.
            </p>
            <div className="lab-page__signal-row">
              {HERO_SIGNALS.map((signal) => (
                <span key={signal} className="lab-page__signal-pill">
                  {signal}
                </span>
              ))}
            </div>
            <div className="lab-page__hero-actions">
              <a className="button" href={WORKSPACE_PATH}>
                Open workspace
              </a>
              <a className="button button--ghost" href={LAB_PATH}>
                Back to LAB
              </a>
            </div>
          </div>

          <div className="lab-page__hero-panel lab-evolution-page__hero-panel">
            <div className="lab-page__hero-panel-top">
              <span className="lab-page__hero-panel-label">The pattern</span>
              <strong>Each layer solved a real problem, then exposed the next missing piece.</strong>
              <p>
                Distribution mattered first. Then permanence. Then Bitcoin-native permanence.
                Xtrata adds programmability, composition, and app-ready structure on top of that
                foundation.
              </p>
            </div>
            <div className="lab-page__hero-panel-grid lab-evolution-page__hero-steps">
              {HERO_CARDS.map((card) => (
                <article key={card.title} className="lab-page__micro-card">
                  <span>{card.step}</span>
                  <strong>{card.title}</strong>
                  <p>{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </header>

      <main className="app__main lab-page__main">
        <section className="panel lab-page__section" id="timeline">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Timeline</span>
              <h2>How distributed data evolved into programmable permanence</h2>
            </div>
            <p>
              This is the builder context behind Xtrata. Each step below unlocked a capability the
              next generation needed, but each also left a structural gap that still had to be
              solved.
            </p>
          </div>

          <div className="lab-evolution-page__timeline">
            {EVOLUTION_STAGES.map((stage) => (
              <article key={stage.title} className="lab-page__track-card lab-evolution-page__stage">
                <div className="lab-evolution-page__stage-header">
                  <div className="lab-evolution-page__stage-heading">
                    <span className="lab-page__track-fit">Stage {stage.step}</span>
                    <h3>{stage.title}</h3>
                    <p className="lab-evolution-page__stage-label">{stage.subtitle}</p>
                  </div>
                  <p className="lab-evolution-page__stage-intro">{stage.intro}</p>
                </div>

                <div className="lab-evolution-page__stage-grid">
                  <div className="lab-evolution-page__stage-block">
                    <strong>What it unlocked</strong>
                    <ul className="lab-page__list">
                      {stage.unlocked.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="lab-evolution-page__stage-block">
                    <strong>{stage.detailTitle}</strong>
                    <ul className="lab-page__list">
                      {stage.details.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="lab-evolution-page__takeaway">{stage.takeaway}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel lab-page__section" id="xtrata">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Why Xtrata</span>
              <h2>Xtrata turns stored data into usable infrastructure</h2>
            </div>
            <p>
              The point is not only to keep data around forever. The point is to make permanent
              data useful inside real products, markets, agents, and payment flows.
            </p>
          </div>

          <div className="lab-evolution-page__capability-grid">
            {XTRATA_CAPABILITIES.map((card) => (
              <article key={card.title} className="lab-page__value-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>

          <div className="lab-page__stack-shell">
            <div className="lab-evolution-page__difference-grid">
              <article className="lab-page__flow-card">
                <h3>Used, linked, extended</h3>
                <p>
                  Data becomes part of application logic, not only a storage endpoint or reference
                  URL.
                </p>
              </article>
              <article className="lab-page__flow-card">
                <h3>Systems, not files</h3>
                <p>
                  Builders can create apps, workflows, templates, and markets that depend on
                  durable state and reusable data.
                </p>
              </article>
              <article className="lab-page__flow-card">
                <h3>A living on-chain graph</h3>
                <p>
                  Records can build on prior records so value compounds instead of resetting with
                  every new release or app.
                </p>
              </article>
            </div>

            <aside className="lab-page__stack-note">
              <span className="lab-page__section-kicker">Use Xtrata when</span>
              <h3>The data itself should remain part of the product surface</h3>
              <ul className="lab-page__list">
                <li>Records should stay inspectable, reusable, and attributable.</li>
                <li>Assets need to survive beyond one team, app, or host.</li>
                <li>Products benefit from linking today&apos;s output to tomorrow&apos;s output.</li>
                <li>Builders want memory, provenance, and logic to reinforce each other.</li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="panel lab-page__section" id="next-layer">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Next layer</span>
              <h2>AI, payments, and automation sit naturally on top of programmable permanence</h2>
            </div>
            <p>
              Once data is durable and programmable, it stops behaving like a stored file and
              starts behaving like infrastructure for intelligent systems.
            </p>
          </div>

          <div className="lab-evolution-page__next-grid">
            {NEXT_LAYER_CARDS.map((card) => (
              <article key={card.title} className="lab-page__track-card lab-evolution-page__next-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <ul className="lab-page__list">
                  {card.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="lab-evolution-page__enabled-panel">
            <span className="lab-page__section-kicker">This enables</span>
            <div className="lab-evolution-page__enabled-grid">
              {NEXT_LAYER_OUTCOMES.map((item) => (
                <div key={item} className="lab-evolution-page__enabled-item">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel lab-page__section" id="why-builders-care">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Summary</span>
              <h2>Why this matters for builders</h2>
            </div>
            <p>
              The shift is strategic. Xtrata means builders are no longer choosing between durable
              data and application logic. They can design with both at once.
            </p>
          </div>

          <div className="lab-evolution-page__summary-shell">
            <div className="lab-evolution-page__table-wrap">
              <table className="lab-evolution-page__summary-table">
                <thead>
                  <tr>
                    <th scope="col">Layer</th>
                    <th scope="col">Solved</th>
                    <th scope="col">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {SUMMARY_ROWS.map((row) => (
                    <tr key={row.layer}>
                      <td>{row.layer}</td>
                      <td>{row.solved}</td>
                      <td>{row.missing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="lab-page__stack-note">
              <span className="lab-page__section-kicker">Builder shift</span>
              <h3>You are no longer just uploading files.</h3>
              <ul className="lab-page__list">
                {BUILDER_SHIFTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="lab-evolution-page__takeaway-strip" aria-label="One line takeaway">
            {TAKEAWAY_LINES.map((line, index) => (
              <div key={line} className="lab-evolution-page__takeaway-line">
                <span>Step {index + 1}</span>
                <strong>{line}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel lab-page__cta" aria-label="Evolution page closing call to action">
          <div className="lab-page__cta-copy">
            <span className="lab-page__section-kicker">Next step</span>
            <h2>Use the framing, then move builders into the live Xtrata workflow.</h2>
            <p>
              This page explains why Xtrata exists. The workspace shows how the protocol behaves
              in practice, from inscription flow to viewer resolution to market-ready product
              surfaces.
            </p>
          </div>

          <div className="lab-page__cta-actions">
            <a className="button" href={WORKSPACE_PATH}>
              Open workspace
            </a>
            <a className="button button--ghost" href={LAB_PATH}>
              Back to LAB
            </a>
            <a className="button button--ghost" href="#timeline">
              View timeline
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
