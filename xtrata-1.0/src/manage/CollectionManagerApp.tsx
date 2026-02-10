import { useState } from 'react';
import CollectionListPanel from './components/CollectionListPanel';
import DeployWizardPanel from './components/DeployWizardPanel';
import CollectionSettingsPanel from './components/CollectionSettingsPanel';
import AssetStagingPanel from './components/AssetStagingPanel';
import PublishOpsPanel from './components/PublishOpsPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import InfoTooltip from './components/InfoTooltip';

const PANEL_KEYS = [
  'collection-list',
  'deploy-wizard',
  'collection-settings',
  'asset-staging',
  'publish-ops',
  'debug-tools'
] as const;

type PanelKey = (typeof PANEL_KEYS)[number];

export default function CollectionManagerApp() {
  const [collapsed, setCollapsed] = useState<Record<PanelKey, boolean>>(() =>
    PANEL_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<PanelKey, boolean>)
  );

  const togglePanel = (key: PanelKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="eyebrow">Artist workspace</span>
        <h1>Collection manager</h1>
        <p>Deploy, configure, stage assets, and publish collections from one guarded portal.</p>
      </header>
      <main className="app__main">
        <section
          className={`panel app-section${collapsed['collection-list'] ? ' panel--collapsed' : ''}`}
        >
          <div className="panel__header">
            <div>
              <h2>
                Collection list
                <InfoTooltip text="View each draft collection and jump to its deploy/metadata details." />
              </h2>
              <p>Track each draft collection, view owner contract, and jump to deploy.</p>
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

        <section className={`panel app-section${collapsed['deploy-wizard'] ? ' panel--collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <h2>
                Deploy wizard
                <InfoTooltip text="Create a `CollectionRecord` draft and submit the collection-mint deploy flow." />
              </h2>
              <p>Guided contract deploy that creates a new `CollectionRecord` draft.</p>
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

        <section className={`panel app-section${collapsed['collection-settings'] ? ' panel--collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <h2>
                Collection settings
                <InfoTooltip text="Load the draft to edit the display name, splits, and contract info before publishing." />
              </h2>
              <p>Contract pricing, splits, allowlist, supply, and collection metadata.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('collection-settings')}>
                {collapsed['collection-settings'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <CollectionSettingsPanel />
          </div>
        </section>

        <section className={`panel app-section${collapsed['asset-staging'] ? ' panel--collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <h2>
                Asset staging
                <InfoTooltip text="Upload files to Cloudflare, compute hashes/chunks, and store manifest rows for minting." />
              </h2>
              <p>Upload folder, compute hashes, and write manifest rows before publishing.</p>
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

        <section className={`panel app-section${collapsed['publish-ops'] ? ' panel--collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <h2>
                Publish &amp; ops
                <InfoTooltip text="Mark a collection published, refresh reservations, and release stuck slots." />
              </h2>
              <p>Review manifest readiness, release expired reservations, and publish collections.</p>
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

        <section className={`panel app-section${collapsed['debug-tools'] ? ' panel--collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <h2>
                Diagnostics
                <InfoTooltip text="Run the D1 health check and storage upload test so you can confirm the backend works." />
              </h2>
              <p>Verify D1 connectivity and R2 uploads from within the portal.</p>
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
      </main>
    </div>
  );
}
