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
const WORKSPACE_PATH = '/workspace';
const MANAGE_PATH = '/manage';

type LabNavItem = {
  label: string;
  href: string;
};

type LabPillar = {
  eyebrow: string;
  title: string;
  description: string;
};

type LabValueCard = {
  title: string;
  description: string;
};

type LabTrackCard = {
  title: string;
  labFit: string;
  description: string;
  whyXtrata: string;
  outcome: string;
};

type LabIdeaCard = {
  title: string;
  tag: string;
  summary: string;
  xtrataFit: string;
  sprintScope: string;
};

type LabPathCard = {
  level: string;
  title: string;
  timeline: string;
  description: string;
  modules: string[];
};

type LabFlowStep = {
  step: string;
  title: string;
  description: string;
};

type LabResourceLink = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

const LAB_NAV_ITEMS: readonly LabNavItem[] = [
  { label: 'Why Xtrata', href: '#why-xtrata' },
  { label: 'Build Tracks', href: '#build-tracks' },
  { label: 'Project Ideas', href: '#project-ideas' },
  { label: 'Starter Paths', href: '#starter-paths' }
] as const;

const LAB_PILLARS: readonly LabPillar[] = [
  {
    eyebrow: 'Learn',
    title: 'Academy',
    description:
      'Use a real protocol primitive, not a toy demo. Xtrata gives LAB builders a concrete way to learn how permanent Bitcoin-secured apps are structured on Stacks.'
  },
  {
    eyebrow: 'Turn ideas into products',
    title: 'Incubator',
    description:
      'Move from experiments to durable businesses. Xtrata is strongest when products need records, files, media, templates, or reusable app modules to stay available and verifiable.'
  },
  {
    eyebrow: 'Leave infrastructure behind',
    title: 'Tooling and infrastructure',
    description:
      'Build shared datasets, component libraries, archives, creator primitives, and developer templates that other LAB teams can fork and extend.'
  }
] as const;

const LAB_VALUE_CARDS: readonly LabValueCard[] = [
  {
    title: 'Permanent by default',
    description:
      'Store app assets, records, media, and reusable modules on-chain instead of depending on a fragile backend or disappearing host.'
  },
  {
    title: 'Verifiable and reconstructable',
    description:
      'Xtrata inscriptions are chunked, sealed, and reconstructable, making provenance and long-term integrity part of the product itself.'
  },
  {
    title: 'Composable across teams',
    description:
      'Recursive composition makes it possible to build on previous work instead of rebuilding the same primitives for every hackathon or startup.'
  },
  {
    title: 'Monetizable without platform lock-in',
    description:
      'Ownership, payment rails, and reusable on-chain assets create clearer routes to paid products, commercial tools, and creative economies.'
  }
] as const;

const LAB_TRACK_CARDS: readonly LabTrackCard[] = [
  {
    title: 'Education and credentials',
    labFit: 'Academy',
    description:
      'Certificates, learner portfolios, bootcamp records, and proof-of-skill artifacts that can be verified globally.',
    whyXtrata:
      'The value is in durable records, supporting artifacts, and a clear history of who issued what.',
    outcome: 'Useful for academies, universities, talent pipelines, and scholarship programs.'
  },
  {
    title: 'Business identity and reputation',
    labFit: 'Incubator',
    description:
      'Portable trust layers for micro-businesses, merchants, cooperatives, and service providers.',
    whyXtrata:
      'Profiles, references, delivery proofs, and supporting media can remain available beyond any single app or marketplace.',
    outcome: 'Strong fit for local commerce, informal economies, and startup-facing financial tooling.'
  },
  {
    title: 'Creator tools and cultural archives',
    labFit: 'Infrastructure',
    description:
      'Reusable music primitives, visual packs, design systems, archives, and remixable media products.',
    whyXtrata:
      'Recursive assets and permanent storage let builders create creative primitives that can be reused, cited, and monetized.',
    outcome: 'High relevance for African music, art, fashion, film, and digital culture ecosystems.'
  },
  {
    title: 'Stablecoin and commerce products',
    labFit: 'Incubator',
    description:
      'Durable storefronts, paid knowledge products, treasury dashboards, and simple payment-native apps.',
    whyXtrata:
      'Catalogs, receipts, digital goods, and transaction-adjacent records can persist as part of the product surface.',
    outcome: 'Practical path for startup teams building around volatile currency conditions and cross-border commerce.'
  },
  {
    title: 'Knowledge maps and public-interest records',
    labFit: 'Academy / Infrastructure',
    description:
      'Community directories, grant maps, service registries, local data archives, and lightweight civic record systems.',
    whyXtrata:
      'These products gain value when records are forkable, attributable, and difficult to erase or silently alter.',
    outcome: 'Best for builder communities, social impact tooling, and shared regional infrastructure.'
  },
  {
    title: 'Fully on-chain apps and templates',
    labFit: 'Infrastructure',
    description:
      'Recursive frontends, SDK wrappers, component libraries, and protocol-native starter kits for the next LAB team.',
    whyXtrata:
      'Xtrata is not only for content storage. It can hold the reusable modules and asset graphs behind ambitious on-chain products.',
    outcome: 'Compounds ecosystem output instead of funding one-off demos.'
  }
] as const;

const LAB_IDEA_CARDS: readonly LabIdeaCard[] = [
  {
    title: 'Credential Vault',
    tag: 'Academy',
    summary:
      'Issue bootcamp certificates with supporting work samples, cohort metadata, and verifiable proof of completion.',
    xtrataFit: 'Permanent records plus recursive links between coursework, student output, and final credential.',
    sprintScope: 'Weekend sprint: issuer dashboard, learner page, certificate viewer.'
  },
  {
    title: 'Merchant Reputation Ledger',
    tag: 'Incubator',
    summary:
      'Give micro-businesses a portable trust page with proof-of-delivery records, buyer references, and work history.',
    xtrataFit: 'Business identity becomes durable, portable, and less dependent on one marketplace.',
    sprintScope: 'Sprint scope: merchant page, delivery proof upload, feedback records.'
  },
  {
    title: 'Local Resource Map',
    tag: 'Academy / Infrastructure',
    summary:
      'Map grants, communities, services, bootcamps, labs, and mentors by region so builders can fork and maintain local versions.',
    xtrataFit: 'Forkable datasets and attributable updates are more useful than a static directory.',
    sprintScope: 'Sprint scope: city map, category filters, contribution history.'
  },
  {
    title: 'Music Primitive Packs',
    tag: 'Infrastructure',
    summary:
      'Publish stems, loops, presets, and visual packs that other creators can build from and credit upstream.',
    xtrataFit: 'Recursive media makes re-use and provenance a first-class part of the product.',
    sprintScope: 'Sprint scope: primitive pack viewer, remix links, creator payout hooks.'
  },
  {
    title: 'Paid Knowledge Posts',
    tag: 'Incubator',
    summary:
      'Let domain experts publish permanent reports, tutorials, or local market explainers with native payment gating.',
    xtrataFit: 'The content itself becomes durable infrastructure rather than disposable platform content.',
    sprintScope: 'Sprint scope: post publisher, pay-to-unlock page, writer archive.'
  },
  {
    title: 'LAB Starter Kit Library',
    tag: 'Infrastructure',
    summary:
      'Create reusable templates for storefronts, certificate issuers, creator archives, and community directories.',
    xtrataFit: 'Shared modules are exactly where recursive composition compounds ecosystem output.',
    sprintScope: 'Sprint scope: one template, example data, and a fork-ready deployment guide.'
  }
] as const;

const LAB_PATH_CARDS: readonly LabPathCard[] = [
  {
    level: 'Beginner',
    title: 'Ship one permanent record',
    timeline: '1 to 2 days',
    description:
      'Start with a project where permanence is the product advantage: a knowledge post, a builder profile, or a certificate issuer.',
    modules: ['Wallet + contract setup', 'Basic inscription flow', 'Simple public page']
  },
  {
    level: 'Intermediate',
    title: 'Launch a product surface',
    timeline: '3 to 7 days',
    description:
      'Build a merchant page, a paid content flow, or a community directory that combines app logic with Xtrata-backed records and assets.',
    modules: ['App state + records', 'Payments or access control', 'Reusable content model']
  },
  {
    level: 'Advanced',
    title: 'Publish infrastructure others can fork',
    timeline: '1 to 3 weeks',
    description:
      'Create a component library, recursive media system, or fully on-chain product template that other LAB teams can extend.',
    modules: ['Recursive assets', 'SDK-based workflows', 'Template or ecosystem-facing packaging']
  }
] as const;

const LAB_FLOW_STEPS: readonly LabFlowStep[] = [
  {
    step: '01',
    title: 'Choose a locally relevant product',
    description:
      'Start with a real use case: credentials, commerce, archives, directories, creator tools, or community infrastructure.'
  },
  {
    step: '02',
    title: 'Use Stacks for execution',
    description:
      'Put pricing, permissions, ownership, or business logic where smart contracts add clarity and trust.'
  },
  {
    step: '03',
    title: 'Use Xtrata for memory',
    description:
      'Store the records, files, templates, modules, and media that should stay reconstructable and reusable over time.'
  },
  {
    step: '04',
    title: 'Ship something forkable',
    description:
      'Aim for outputs other LAB teams can learn from, adapt, or build on instead of one isolated demo.'
  }
] as const;

const LAB_RESOURCE_LINKS: readonly LabResourceLink[] = [
  {
    title: 'Open the Xtrata workspace',
    description:
      'Use the live app to inspect existing inscriptions, try the mint flow, and understand the protocol surface.',
    href: WORKSPACE_PATH,
    cta: 'Open workspace'
  },
  {
    title: 'Start with the mint flow',
    description:
      'If you want to feel the protocol quickly, begin by inscribing a file and seeing how the flow works end to end.',
    href: `${WORKSPACE_PATH}#mint`,
    cta: 'Go to mint'
  },
  {
    title: 'Read the public docs module',
    description:
      'Use the in-app docs module for protocol concepts, workflows, and builder-facing explanations.',
    href: `${WORKSPACE_PATH}#docs`,
    cta: 'Open docs'
  },
  {
    title: 'Launch artist and collection tooling',
    description:
      'For curated launches and collection operations, the allowlisted manage portal handles deploy and publish workflows.',
    href: MANAGE_PATH,
    cta: 'Open manage'
  }
] as const;

const isLabPath = (pathname: string) => pathname === '/lab' || pathname.startsWith('/lab/');

export default function LabLandingPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Xtrata x Let Africa Build';
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

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const onLabRoute = isLabPath(pathname);

  return (
    <div className="app lab-page">
      <header className="app__header">
        <section className="panel lab-page__masthead" aria-label="LAB navigation">
          <div className="lab-page__brand">
            <a className="lab-page__brand-link" href={HOME_PATH}>
              XTRATA
            </a>
            <span className="badge badge--neutral">Let Africa Build</span>
          </div>

          <nav className="lab-page__topnav" aria-label="LAB section navigation">
            {LAB_NAV_ITEMS.map((item) => (
              <a key={item.href} className="lab-page__topnav-link" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="lab-page__masthead-actions">
            <a className="button button--ghost button--mini" href={HOME_PATH}>
              Home
            </a>
            <a className="button button--mini" href={WORKSPACE_PATH}>
              Workspace
            </a>
            <label className="theme-select" htmlFor="lab-theme-select">
              <span className="theme-select__label">Theme</span>
              <select
                id="lab-theme-select"
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

        <section className="panel lab-page__hero" aria-label="Let Africa Build landing page hero">
          <div className="lab-page__hero-copy">
            <span className="lab-page__eyebrow">LAB x Xtrata</span>
            <h1 className="lab-page__headline">Build permanent apps on Bitcoin-secured rails.</h1>
            <p className="lab-page__subline">
              Let Africa Build is creating the builder pipeline. Xtrata gives that pipeline a
              permanent, composable data layer on Stacks for records, media, modules, datasets,
              and products that should stay verifiable and reusable.
            </p>
            <div className="lab-page__signal-row">
              <span className="lab-page__signal-pill">Permanent storage</span>
              <span className="lab-page__signal-pill">Recursive composition</span>
              <span className="lab-page__signal-pill">SDK-ready workflows</span>
              <span className="lab-page__signal-pill">Built for real products</span>
            </div>
            <div className="lab-page__hero-actions">
              <a className="button" href={WORKSPACE_PATH}>
                Start building
              </a>
              <a className="button button--ghost" href="#project-ideas">
                Explore ideas
              </a>
            </div>
          </div>

          <div className="lab-page__hero-panel">
            <div className="lab-page__hero-panel-top">
              <span className="lab-page__hero-panel-label">Protocol fit</span>
              <strong>Stacks for execution. Xtrata for memory.</strong>
              <p>
                Use contracts for business logic. Use Xtrata when the data itself should last,
                travel, and be composable across products.
              </p>
            </div>
            <div className="lab-page__hero-panel-grid">
              {LAB_PILLARS.map((pillar) => (
                <article key={pillar.title} className="lab-page__micro-card">
                  <span>{pillar.eyebrow}</span>
                  <strong>{pillar.title}</strong>
                  <p>{pillar.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </header>

      <main className="app__main lab-page__main">
        <section className="panel lab-page__section" id="why-xtrata">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Why this matters</span>
              <h2>Infrastructure-first tooling for LAB builders</h2>
            </div>
            <p>
              The strongest LAB projects will not look like generic crypto demos. They will look
              like products that solve local problems and leave reusable infrastructure behind.
            </p>
          </div>
          <div className="lab-page__value-grid">
            {LAB_VALUE_CARDS.map((card) => (
              <article key={card.title} className="lab-page__value-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
          <div className="lab-page__stack-shell">
            <div className="lab-page__stack-layers">
              <div className="lab-page__stack-layer">
                <span className="lab-page__stack-index">01</span>
                <div>
                  <strong>Bitcoin</strong>
                  <p>Settlement, security, and long-term trust anchor.</p>
                </div>
              </div>
              <div className="lab-page__stack-layer">
                <span className="lab-page__stack-index">02</span>
                <div>
                  <strong>Stacks</strong>
                  <p>Smart contracts, app logic, permissions, and payment flows.</p>
                </div>
              </div>
              <div className="lab-page__stack-layer">
                <span className="lab-page__stack-index">03</span>
                <div>
                  <strong>Xtrata</strong>
                  <p>Permanent data, media, records, component libraries, and reusable modules.</p>
                </div>
              </div>
              <div className="lab-page__stack-layer">
                <span className="lab-page__stack-index">04</span>
                <div>
                  <strong>LAB products</strong>
                  <p>Credentials, commerce, creator primitives, local maps, archives, and tools.</p>
                </div>
              </div>
            </div>
            <aside className="lab-page__stack-note">
              <span className="lab-page__section-kicker">Use Xtrata when</span>
              <h3>The data is part of the product advantage</h3>
              <ul className="lab-page__list">
                <li>The records should remain accessible and verifiable.</li>
                <li>The assets should be reusable across multiple apps or teams.</li>
                <li>The product benefits from provenance, permanence, or remixability.</li>
                <li>You want builders to fork the output instead of starting from zero.</li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="panel lab-page__section" id="build-tracks">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Build categories</span>
              <h2>What LAB builders can ship with Xtrata</h2>
            </div>
            <p>
              These are the categories where permanence, verifiability, and reuse create obvious
              product value instead of ornamental blockchain complexity.
            </p>
          </div>
          <div className="lab-page__track-grid">
            {LAB_TRACK_CARDS.map((card) => (
              <article key={card.title} className="lab-page__track-card">
                <span className="lab-page__track-fit">{card.labFit}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="lab-page__track-meta">
                  <strong>Why Xtrata</strong>
                  <p>{card.whyXtrata}</p>
                </div>
                <div className="lab-page__track-meta">
                  <strong>Outcome</strong>
                  <p>{card.outcome}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel lab-page__section" id="project-ideas">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Idea bank</span>
              <h2>Projects that feel native to LAB</h2>
            </div>
            <p>
              Good LAB projects should feel practical, regional, and forkable. They should solve
              something real while teaching the ecosystem how to build the next layer.
            </p>
          </div>
          <div className="lab-page__idea-grid">
            {LAB_IDEA_CARDS.map((card) => (
              <article key={card.title} className="lab-page__idea-card">
                <div className="lab-page__idea-header">
                  <h3>{card.title}</h3>
                  <span className="badge badge--neutral badge--compact">{card.tag}</span>
                </div>
                <p>{card.summary}</p>
                <div className="lab-page__idea-meta">
                  <strong>Xtrata fit</strong>
                  <p>{card.xtrataFit}</p>
                </div>
                <div className="lab-page__idea-meta">
                  <strong>First sprint</strong>
                  <p>{card.sprintScope}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel lab-page__section" id="starter-paths">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Starter paths</span>
              <h2>Choose a path based on scope, not hype</h2>
            </div>
            <p>
              A strong LAB workflow starts small, proves one permanent advantage, and then expands
              into reusable infrastructure.
            </p>
          </div>
          <div className="lab-page__path-grid">
            {LAB_PATH_CARDS.map((card) => (
              <article key={card.title} className="lab-page__path-card">
                <span className="lab-page__path-level">{card.level}</span>
                <h3>{card.title}</h3>
                <p className="lab-page__path-timeline">{card.timeline}</p>
                <p>{card.description}</p>
                <ul className="lab-page__list">
                  {card.modules.map((module) => (
                    <li key={module}>{module}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel lab-page__section" id="shipping-flow">
          <div className="lab-page__section-heading">
            <div>
              <span className="lab-page__section-kicker">Build flow</span>
              <h2>How to turn LAB energy into durable output</h2>
            </div>
            <p>
              The page should not only inspire. It should help founders and new builders picture
              the actual workflow from first prototype to something another team can fork.
            </p>
          </div>
          <div className="lab-page__flow-shell">
            <div className="lab-page__flow-grid">
              {LAB_FLOW_STEPS.map((step) => (
                <article key={step.step} className="lab-page__flow-card">
                  <span className="lab-page__flow-index">{step.step}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
            <aside className="lab-page__resource-list">
              <div className="lab-page__resource-header">
                <span className="lab-page__section-kicker">Useful links</span>
                <h3>Move from inspiration to action</h3>
              </div>
              {LAB_RESOURCE_LINKS.map((link) => (
                <a key={link.title} className="lab-page__resource-card" href={link.href}>
                  <div>
                    <strong>{link.title}</strong>
                    <p>{link.description}</p>
                  </div>
                  <span>{link.cta}</span>
                </a>
              ))}
            </aside>
          </div>
        </section>

        <section className="panel lab-page__cta" aria-label="LAB closing call to action">
          <div className="lab-page__cta-copy">
            <span className="lab-page__section-kicker">Build with intent</span>
            <h2>Xtrata turns ideas into permanent infrastructure.</h2>
            <p>
              LAB is building a generation of founders and protocol-native product teams. The most
              valuable thing they can leave behind is not a one-week demo, but an artifact,
              template, dataset, tool, or app module that stays useful after the sprint ends.
            </p>
          </div>
          <div className="lab-page__cta-actions">
            <a className="button" href={WORKSPACE_PATH}>
              Open Xtrata
            </a>
            <a className="button button--ghost" href={`${WORKSPACE_PATH}#docs`}>
              Read docs
            </a>
            {!onLabRoute && (
              <a className="button button--ghost" href="/lab">
                Open LAB page
              </a>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
