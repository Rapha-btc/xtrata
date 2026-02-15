import { useState } from 'react';
import CollectionListPanel from './components/CollectionListPanel';
import OwnerOversightPanel from './components/OwnerOversightPanel';
import DeployWizardPanel from './components/DeployWizardPanel';
import CollectionSettingsPanel from './components/CollectionSettingsPanel';
import AssetStagingPanel from './components/AssetStagingPanel';
import PublishOpsPanel from './components/PublishOpsPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import InfoTooltip from './components/InfoTooltip';
import AddressLabel from '../components/AddressLabel';
import { isXtrataOwnerAddress } from '../config/manage';
import { useManageWallet } from './ManageWalletContext';

const PANEL_KEYS = [
  'collection-list',
  'owner-oversight',
  'deploy-wizard',
  'collection-settings',
  'asset-staging',
  'publish-ops',
  'debug-tools'
] as const;

type PanelKey = (typeof PANEL_KEYS)[number];
type ExperienceMode = 'guided' | 'advanced';

const MANAGE_PANEL_IDS: Record<PanelKey, string> = {
  'collection-list': 'manage-collection-list',
  'owner-oversight': 'manage-owner-oversight',
  'deploy-wizard': 'manage-deploy-wizard',
  'collection-settings': 'manage-collection-settings',
  'asset-staging': 'manage-asset-staging',
  'publish-ops': 'manage-publish-ops',
  'debug-tools': 'manage-debug-tools'
};

const GUIDED_STEPS: Array<{
  key: PanelKey;
  label: string;
  note: string;
}> = [
  {
    key: 'collection-list',
    label: 'Your drops',
    note: 'Check existing drafts before starting a new launch.'
  },
  {
    key: 'deploy-wizard',
    label: 'Step 1: Create drop',
    note: 'Fill drop details + payout addresses, then deploy with one wallet confirmation.'
  },
  {
    key: 'asset-staging',
    label: 'Step 2: Upload artwork',
    note: 'Upload files and prepare manifest rows for minting.'
  },
  {
    key: 'publish-ops',
    label: 'Step 3: Go live',
    note: 'Publish when ready, then track and release reservations.'
  }
];

export default function CollectionManagerApp() {
  const { walletSession } = useManageWallet();
  const isXtrataOwner = isXtrataOwnerAddress(walletSession.address);

  const [collapsed, setCollapsed] = useState<Record<PanelKey, boolean>>({
    'collection-list': false,
    'owner-oversight': false,
    'deploy-wizard': false,
    'collection-settings': true,
    'asset-staging': false,
    'publish-ops': false,
    'debug-tools': true
  });
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('guided');

  const showAdvancedPanels = experienceMode === 'advanced';

  const togglePanel = (key: PanelKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const jumpToPanel = (key: PanelKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: false }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const panel = document.getElementById(MANAGE_PANEL_IDS[key]);
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  };

  const setGuidedMode = () => {
    setExperienceMode('guided');
    setCollapsed((prev) => ({
      ...prev,
      'collection-settings': true,
      'debug-tools': true
    }));
  };

  const setAdvancedMode = () => {
    setExperienceMode('advanced');
  };

  return (
    <div className="app manage-app">
      <header className="app__header">
        <span className="eyebrow">Artist workspace</span>
        <h1>Launch your collection</h1>
        <p className="meta-value">
          Logged in as:{' '}
          <AddressLabel
            className="meta-value"
            address={walletSession.address}
            network={walletSession.network}
            fallback="Not connected"
          />
        </p>
        <p>Follow the guided steps below. Advanced controls are optional and hidden by default.</p>
      </header>
      <main className="app__main">
        <section className="panel app-section manage-journey">
          <div className="panel__header">
            <div>
              <h2>
                Start here
                <InfoTooltip text="Guided mode keeps only the essential launch steps visible. Advanced mode reveals contract controls and diagnostics." />
              </h2>
              <p>Use these buttons to jump to each step in order.</p>
            </div>
            <div className="panel__actions">
              <div className="manage-journey__mode-toggle" role="group" aria-label="Experience mode">
                <button
                  className={`button ${experienceMode === 'guided' ? '' : 'button--ghost'}`}
                  type="button"
                  onClick={setGuidedMode}
                >
                  Guided mode
                </button>
                <button
                  className={`button ${experienceMode === 'advanced' ? '' : 'button--ghost'}`}
                  type="button"
                  onClick={setAdvancedMode}
                >
                  Advanced mode
                </button>
              </div>
            </div>
          </div>
          <div className="panel__body">
            <div className="manage-journey__steps">
              {GUIDED_STEPS.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  className="button button--ghost manage-journey__step"
                  onClick={() => jumpToPanel(step.key)}
                >
                  <strong>{step.label}</strong>
                  <span>{step.note}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['collection-list'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['collection-list']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Your drops
                <InfoTooltip text="View each draft collection and jump to its deploy/metadata details." />
              </h2>
              <p>See what is in progress and what is already deployed.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('collection-list')}>
                {collapsed['collection-list'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <CollectionListPanel />
          </div>
        </section>

        {isXtrataOwner && (
          <section
            className={`panel app-section${collapsed['owner-oversight'] ? ' panel--collapsed' : ''}`}
            id={MANAGE_PANEL_IDS['owner-oversight']}
          >
            <div className="panel__header">
              <div>
                <h2>
                  Owner oversight
                  <InfoTooltip text="Owner-only view of activity across other allowlisted artist wallets." />
                </h2>
                <p>Monitor launch progress across all allowlisted artists from one place.</p>
              </div>
              <div className="panel__actions">
                <button className="button button--ghost" type="button" onClick={() => togglePanel('owner-oversight')}>
                  {collapsed['owner-oversight'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <OwnerOversightPanel />
            </div>
          </section>
        )}

        <section
          className={`panel app-section${collapsed['deploy-wizard'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['deploy-wizard']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 1: Create your drop
                <InfoTooltip text="Create and deploy with a locked template using drop basics plus artist and marketplace payout addresses." />
              </h2>
              <p>Fill the guided fields, review, and deploy your contract. Going live happens in Step 3.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('deploy-wizard')}>
                {collapsed['deploy-wizard'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <DeployWizardPanel />
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['asset-staging'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['asset-staging']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 2: Upload your artwork
                <InfoTooltip text="Upload files to Cloudflare, compute hashes/chunks, and store manifest rows for minting." />
              </h2>
              <p>Upload files once and prepare the manifest for launch day.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('asset-staging')}>
                {collapsed['asset-staging'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <AssetStagingPanel />
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['publish-ops'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['publish-ops']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 3: Go live
                <InfoTooltip text="Mark a collection published, refresh reservations, and release stuck slots." />
              </h2>
              <p>Publish when ready, then monitor reservations and clear expired slots.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('publish-ops')}>
                {collapsed['publish-ops'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <PublishOpsPanel />
          </div>
        </section>

        {!showAdvancedPanels && (
          <div className="manage-advanced-teaser">
            <p>Need deeper controls? Switch to Advanced mode to edit contract settings and run diagnostics.</p>
            <button className="button button--ghost" type="button" onClick={setAdvancedMode}>
              Open advanced tools
            </button>
          </div>
        )}

        {showAdvancedPanels && (
          <>
            <section
              className={`panel app-section${collapsed['collection-settings'] ? ' panel--collapsed' : ''}`}
              id={MANAGE_PANEL_IDS['collection-settings']}
            >
              <div className="panel__header">
                <div>
                  <h2>
                    Advanced contract settings
                    <InfoTooltip text="Load the draft to edit display name, contract references, and other advanced launch settings." />
                  </h2>
                  <p>Use this only if you need detailed contract-level adjustments.</p>
                </div>
                <div className="panel__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => togglePanel('collection-settings')}
                  >
                    {collapsed['collection-settings'] ? 'Expand' : 'Collapse'}
                  </button>
                </div>
              </div>
              <div className="panel__body">
                <CollectionSettingsPanel />
              </div>
            </section>

            <section
              className={`panel app-section${collapsed['debug-tools'] ? ' panel--collapsed' : ''}`}
              id={MANAGE_PANEL_IDS['debug-tools']}
            >
              <div className="panel__header">
                <div>
                  <h2>
                    Advanced system checks
                    <InfoTooltip text="Run D1 and storage checks if you suspect backend issues." />
                  </h2>
                  <p>Technical checks for troubleshooting backend availability.</p>
                </div>
                <div className="panel__actions">
                  <button className="button button--ghost" type="button" onClick={() => togglePanel('debug-tools')}>
                    {collapsed['debug-tools'] ? 'Expand' : 'Collapse'}
                  </button>
                </div>
              </div>
              <div className="panel__body">
                <DiagnosticsPanel />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
