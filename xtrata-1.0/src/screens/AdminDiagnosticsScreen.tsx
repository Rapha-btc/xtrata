import { useCallback, useEffect, useMemo, useState } from 'react';
import AddressLabel from '../components/AddressLabel';
import type { NetworkType } from '../lib/network/types';
import { getApiBaseUrls } from '../lib/network/config';
import { getStacksExplorerContractUrl } from '../lib/network/explorer';
import {
  LOG_ENABLED_KEY,
  LOG_DEDUPE_KEY,
  LOG_LEVEL_KEY,
  LOG_TAGS_KEY,
  clearLogDedupeCache
} from '../lib/utils/logger';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type AdminDiagnosticsScreenProps = {
  contractId: string;
  contractNetwork: NetworkType;
  walletAddress: string | null;
  walletNetwork: string | null;
  readOnlySender: string;
  isActiveTab: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type LogConfigState = {
  enabled: boolean;
  level: LogLevel;
  tagsInput: string;
  dedupe: boolean;
};

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const getStorageValue = (key: string) => {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const parseEnabled = (value: string | null | undefined) => {
  if (!value) {
    return true;
  }
  const normalized = value.toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
};

const parseLevel = (value: string | null | undefined): LogLevel | null => {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return null;
};

const parseDedupe = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on';
};

const readLogConfig = (): LogConfigState => {
  const env = import.meta.env ?? {};
  const enabledValue = getStorageValue(LOG_ENABLED_KEY) ?? env.VITE_LOG_ENABLED;
  const levelValue = getStorageValue(LOG_LEVEL_KEY) ?? env.VITE_LOG_LEVEL;
  const tagsValue = getStorageValue(LOG_TAGS_KEY) ?? env.VITE_LOG_TAGS;
  const dedupeValue = getStorageValue(LOG_DEDUPE_KEY) ?? env.VITE_LOG_DEDUPE;
  return {
    enabled: parseEnabled(enabledValue),
    level: parseLevel(levelValue) ?? 'warn',
    tagsInput: tagsValue ?? '',
    dedupe: parseDedupe(dedupeValue)
  };
};

const persistLogConfig = (config: LogConfigState) => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(LOG_ENABLED_KEY, config.enabled ? 'true' : 'false');
    localStorage.setItem(LOG_LEVEL_KEY, config.level);
    localStorage.setItem(LOG_DEDUPE_KEY, config.dedupe ? 'true' : 'false');
    const trimmed = config.tagsInput.trim();
    if (!trimmed) {
      localStorage.removeItem(LOG_TAGS_KEY);
    } else {
      localStorage.setItem(LOG_TAGS_KEY, trimmed);
    }
  } catch (error) {
    // ignore storage errors in diagnostics UI
  }
};

export default function AdminDiagnosticsScreen(props: AdminDiagnosticsScreenProps) {
  const [logConfig, setLogConfig] = useState<LogConfigState>(() =>
    readLogConfig()
  );
  const apiBases = useMemo(
    () => getApiBaseUrls(props.contractNetwork),
    [props.contractNetwork]
  );
  const contractExplorerUrl = useMemo(
    () => getStacksExplorerContractUrl(props.contractId, props.contractNetwork),
    [props.contractId, props.contractNetwork]
  );
  const effectiveTagsLabel = logConfig.tagsInput.trim()
    ? logConfig.tagsInput.trim()
    : 'all';

  const applyLogConfig = useCallback((next: LogConfigState) => {
    setLogConfig(next);
    persistLogConfig(next);
  }, []);

  const handleEnabledToggle = () => {
    applyLogConfig({ ...logConfig, enabled: !logConfig.enabled });
  };

  const handleLevelChange = (value: LogLevel) => {
    applyLogConfig({ ...logConfig, level: value });
  };

  const handleTagsChange = (value: string) => {
    applyLogConfig({ ...logConfig, tagsInput: value });
  };

  const handleDedupeToggle = () => {
    const next = !logConfig.dedupe;
    applyLogConfig({ ...logConfig, dedupe: next });
    clearLogDedupeCache();
  };

  const handleReset = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOG_ENABLED_KEY);
        localStorage.removeItem(LOG_LEVEL_KEY);
        localStorage.removeItem(LOG_TAGS_KEY);
        localStorage.removeItem(LOG_DEDUPE_KEY);
      }
    } catch (error) {
      // ignore storage errors in diagnostics UI
    }
    applyLogConfig(readLogConfig());
  };

  const applyPreset = (preset: LogConfigState) => {
    applyLogConfig(preset);
  };

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (
        event.key === LOG_ENABLED_KEY ||
        event.key === LOG_LEVEL_KEY ||
        event.key === LOG_TAGS_KEY ||
        event.key === LOG_DEDUPE_KEY
      ) {
        setLogConfig(readLogConfig());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="admin-diagnostics"
    >
      <div className="panel__header">
        <div>
          <h2>Admin diagnostics</h2>
          <p>Logging toggles and quick environment checks.</p>
        </div>
        <div className="panel__actions">
          <button
            className="button button--ghost button--collapse"
            type="button"
            onClick={props.onToggleCollapse}
            aria-expanded={!props.collapsed}
          >
            {props.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className="panel__body">
        <div className="meta-grid meta-grid--dense">
          <div>
            <span className="meta-label">Contract</span>
            {contractExplorerUrl ? (
              <a
                className="meta-value active-contract__link"
                href={contractExplorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                {props.contractId}
              </a>
            ) : (
              <span className="meta-value">{props.contractId}</span>
            )}
          </div>
          <div>
            <span className="meta-label">Network</span>
            <span className="meta-value">{props.contractNetwork}</span>
          </div>
          <div>
            <span className="meta-label">API base</span>
            <span className="meta-value">{apiBases.join(', ')}</span>
          </div>
          <div>
            <span className="meta-label">Read-only sender</span>
            <AddressLabel
              className="meta-value"
              address={props.readOnlySender}
              network={props.contractNetwork}
              fallback="Unknown"
              showAddressWhenNamed
            />
          </div>
          <div>
            <span className="meta-label">Wallet</span>
            <AddressLabel
              className="meta-value"
              address={props.walletAddress}
              network={
                props.walletNetwork === 'mainnet' || props.walletNetwork === 'testnet'
                  ? props.walletNetwork
                  : null
              }
              fallback="Not connected"
              showAddressWhenNamed
            />
          </div>
          <div>
            <span className="meta-label">Wallet network</span>
            <span className="meta-value">{props.walletNetwork ?? 'Unknown'}</span>
          </div>
          <div>
            <span className="meta-label">Tab status</span>
            <span className="meta-value">
              {props.isActiveTab ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>

        <label className="field">
          <span className="field__label">Logging</span>
          <div className="field__row admin-diagnostics__controls">
            <button
              type="button"
              className={`button ${logConfig.enabled ? '' : 'button--ghost'}`}
              onClick={handleEnabledToggle}
            >
              {logConfig.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <select
              className="select"
              value={logConfig.level}
              onChange={(event) =>
                handleLevelChange(event.target.value as LogLevel)
              }
            >
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <span className="admin-diagnostics__status">
              Tags: {effectiveTagsLabel}
            </span>
            <button
              type="button"
              className={`button button--ghost button--mini${logConfig.dedupe ? ' is-active' : ''}`}
              onClick={handleDedupeToggle}
              title="Only log the first occurrence per tag/message (suppresses repeats across IDs)"
            >
              {logConfig.dedupe ? 'Dedupe on' : 'Dedupe off'}
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field__label">Log tags</span>
          <input
            className="input"
            placeholder="market,viewer,preview or *"
            value={logConfig.tagsInput}
            onChange={(event) => handleTagsChange(event.target.value)}
          />
          <span className="field__hint">Leave blank to capture all tags.</span>
        </label>

        <div className="admin-diagnostics__presets">
          <span className="field__label">Presets</span>
          <div className="admin-diagnostics__preset-buttons">
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() =>
                applyPreset({
                  enabled: true,
                  level: 'warn',
                  tagsInput: 'viewer',
                  dedupe: logConfig.dedupe
                })
              }
            >
              Minimal
            </button>
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() =>
                applyPreset({
                  enabled: true,
                  level: 'debug',
                  tagsInput: 'viewer,preview,thumbnail,cache,token-uri',
                  dedupe: logConfig.dedupe
                })
              }
            >
              Viewer debug
            </button>
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() =>
                applyPreset({
                  enabled: true,
                  level: 'debug',
                  tagsInput: 'market,readonly',
                  dedupe: logConfig.dedupe
                })
              }
            >
              Market debug
            </button>
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() =>
                applyPreset({
                  enabled: true,
                  level: 'debug',
                  tagsInput: '*',
                  dedupe: logConfig.dedupe
                })
              }
            >
              All
            </button>
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() =>
                applyPreset({
                  enabled: false,
                  level: logConfig.level,
                  tagsInput: logConfig.tagsInput,
                  dedupe: logConfig.dedupe
                })
              }
            >
              Off
            </button>
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
