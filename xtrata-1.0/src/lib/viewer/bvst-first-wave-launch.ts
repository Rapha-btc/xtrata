import liveRuntimeMap from '../../data/bvst-first-wave-live-runtime-map.json';
import type { NetworkType } from '../network/types';
import {
  buildRuntimeModuleBaseHref,
  normalizeModuleTokenUriPath
} from './module-paths';
import { buildRuntimeOpenUrl } from './runtime-open';

type LiveRuntimePluginEntry = {
  localBundleName: string;
  liveOnChainName: string;
  releaseCatalogTokenId: number;
  manifestTokenId: number;
  patchTokenId: number;
  shellTokenId: number;
  paths: {
    manifest: string;
    patch: string;
    shell: string;
  };
};

type LiveRuntimeMap = {
  network: NetworkType;
  contractId: string;
  rootCatalogTokenId: number;
  releaseCatalogTokenId: number;
  familyCatalogs: Record<string, number>;
  plugins: LiveRuntimePluginEntry[];
};

const FIRST_WAVE_LIVE_RUNTIME_MAP = liveRuntimeMap as LiveRuntimeMap;

export type BvstFirstWaveLiveSynthName =
  | 'JMS10'
  | 'BVSTEngine'
  | 'BVSTSynth'
  | 'MinerOne'
  | 'MinerTwo'
  | 'ChainPoly'
  | 'RetroKeys';

export type BvstFirstWaveRequestedSynthName =
  | 'JMS10'
  | 'UniversalEngine'
  | 'UniversalSynth'
  | 'BlueMarvinOne'
  | 'BlueMarvinTwo'
  | 'NeonPoly'
  | 'RetroKeys'
  | BvstFirstWaveLiveSynthName;

export type ResolvedBvstFirstWaveLaunchTarget = {
  requestedName: string;
  localBundleName: string;
  liveOnChainName: BvstFirstWaveLiveSynthName;
  contractId: string;
  network: NetworkType;
  releaseCatalogTokenId: number;
  manifestTokenId: number;
  patchTokenId: number;
  shellTokenId: number;
  shellPath: string;
  moduleBasePath: string;
  moduleBaseHref: string;
};

const normalizeLookupKey = (value: string) => value.trim().toLowerCase();

const normalizeWorkspaceRuntimePath = (value: string) => {
  const normalized = normalizeModuleTokenUriPath(value);
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith('on-chain-modules/workspace/')) {
    return normalized;
  }
  if (normalized.startsWith('workspace/')) {
    return `on-chain-modules/${normalized}`;
  }
  return `on-chain-modules/workspace/${normalized}`;
};

const buildModuleBasePathFromShellPath = (shellPath: string) => {
  const normalizedShellPath = normalizeWorkspaceRuntimePath(shellPath);
  if (!normalizedShellPath) {
    return null;
  }
  const segments = normalizedShellPath.split('/');
  if (segments.length < 2) {
    return null;
  }
  segments.pop();
  return `${segments.join('/')}/`;
};

const entryByName = (() => {
  const map = new Map<string, LiveRuntimePluginEntry>();
  for (const plugin of FIRST_WAVE_LIVE_RUNTIME_MAP.plugins) {
    map.set(normalizeLookupKey(plugin.localBundleName), plugin);
    map.set(normalizeLookupKey(plugin.liveOnChainName), plugin);
  }
  return map;
})();

export const getBvstFirstWaveLiveRuntimeMap = () => FIRST_WAVE_LIVE_RUNTIME_MAP;

export const normalizeBvstFirstWaveRuntimePath = (value: string) =>
  normalizeWorkspaceRuntimePath(value);

export const resolveBvstFirstWaveLaunchTarget = (
  requestedName: string
): ResolvedBvstFirstWaveLaunchTarget => {
  const trimmedName = requestedName.trim();
  const entry = entryByName.get(normalizeLookupKey(trimmedName));
  if (!entry) {
    throw new Error(`Unknown BVST first-wave synth: ${requestedName}`);
  }

  const shellPath = normalizeWorkspaceRuntimePath(entry.paths.shell);
  if (!shellPath) {
    throw new Error(`Invalid BVST shell path for ${entry.localBundleName}`);
  }
  const moduleBasePath = buildModuleBasePathFromShellPath(shellPath);
  if (!moduleBasePath) {
    throw new Error(`Invalid BVST module base for ${entry.localBundleName}`);
  }

  const moduleBaseHref = buildRuntimeModuleBaseHref({
    network: FIRST_WAVE_LIVE_RUNTIME_MAP.network,
    contractId: FIRST_WAVE_LIVE_RUNTIME_MAP.contractId,
    tokenUriPath: shellPath,
    entryTokenId: entry.shellTokenId
  });
  if (!moduleBaseHref) {
    throw new Error(
      `Unable to build BVST runtime module base for ${entry.localBundleName}`
    );
  }

  return {
    requestedName: trimmedName,
    localBundleName: entry.localBundleName,
    liveOnChainName: entry.liveOnChainName as BvstFirstWaveLiveSynthName,
    contractId: FIRST_WAVE_LIVE_RUNTIME_MAP.contractId,
    network: FIRST_WAVE_LIVE_RUNTIME_MAP.network,
    releaseCatalogTokenId: entry.releaseCatalogTokenId,
    manifestTokenId: entry.manifestTokenId,
    patchTokenId: entry.patchTokenId,
    shellTokenId: entry.shellTokenId,
    shellPath,
    moduleBasePath,
    moduleBaseHref
  };
};

export const buildBvstFirstWaveRuntimeOpenUrl = (
  requestedName: string,
  options?: {
    fallbackContractId?: string | null;
  }
) => {
  const target = resolveBvstFirstWaveLaunchTarget(requestedName);
  return buildRuntimeOpenUrl({
    contractId: target.contractId,
    tokenId: BigInt(target.shellTokenId),
    network: target.network,
    fallbackContractId: options?.fallbackContractId ?? null,
    moduleBaseHref: target.moduleBaseHref
  });
};
