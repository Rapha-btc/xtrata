import { useEffect, useMemo, useState } from 'react';
import {
  deleteCampaignAsset,
  loadCampaignAssetBlob,
  loadCampaignDrafts,
  saveCampaignDrafts,
  storeCampaignAsset
} from '../lib/campaign/storage';
import { generateCampaignCopies } from '../lib/campaign/ai';
import type {
  CampaignDraft,
  CampaignPlatform,
  CampaignPlatformConfig,
  CampaignDraftStatus,
  CampaignAsset
} from '../lib/campaign/types';

const PLATFORMS: {
  id: CampaignPlatform;
  label: string;
  maxLength?: number;
  supportsTitle?: boolean;
  composeHint: string;
  composeUrl?: (params: { text: string; title?: string; link?: string }) => string;
}[] = [
  {
    id: 'x',
    label: 'X / Twitter',
    maxLength: 280,
    composeHint: 'Opens the X composer with prefilled text.',
    composeUrl: ({ text }) =>
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
  },
  {
    id: 'youtube',
    label: 'YouTube',
    supportsTitle: true,
    composeHint: 'Opens YouTube Studio upload.',
    composeUrl: () => 'https://studio.youtube.com'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    composeHint: 'Opens Instagram in a new tab (manual upload).',
    composeUrl: () => 'https://www.instagram.com'
  },
  {
    id: 'reddit',
    label: 'Reddit',
    supportsTitle: true,
    composeHint: 'Opens Reddit submit with prefilled title + text.',
    composeUrl: ({ text, title }) => {
      const safeTitle = title ?? 'Xtrata update';
      return `https://www.reddit.com/submit?title=${encodeURIComponent(
        safeTitle
      )}&text=${encodeURIComponent(text)}`;
    }
  },
  {
    id: 'telegram',
    label: 'Telegram',
    composeHint: 'Opens Telegram share dialog.',
    composeUrl: ({ text, link }) => {
      const url = link ?? '';
      return `https://t.me/share/url?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text)}`;
    }
  },
  {
    id: 'discord',
    label: 'Discord',
    composeHint: 'Opens Discord (paste into channel).',
    composeUrl: () => 'https://discord.com/app'
  }
];

const PLATFORM_DEFAULTS: Record<CampaignPlatform, CampaignPlatformConfig> = {
  x: { enabled: true, copy: '' },
  youtube: { enabled: false, copy: '', title: '' },
  instagram: { enabled: false, copy: '' },
  reddit: { enabled: false, copy: '', title: '' },
  telegram: { enabled: false, copy: '' },
  discord: { enabled: true, copy: '' }
};

const STATUS_OPTIONS: CampaignDraftStatus[] = [
  'draft',
  'approved',
  'scheduled',
  'published'
];

const DEFAULT_CAMPAIGN_LINK = 'https://xtrata.xyz';
const LINK_PLACEHOLDER_REGEX = /\[link\]/gi;
const URL_REGEX = /https?:\/\/\S+/i;

type CampaignTheme = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  tone: string;
  audience: string;
};

const CAMPAIGN_THEMES: CampaignTheme[] = [
  {
    id: 'memory-layer',
    label: 'Memory Layer for Bitcoin',
    description: 'Position Xtrata as the on-chain memory layer for Bitcoin L2.',
    keywords: 'memory layer, Bitcoin L2, permanence, Stacks, on-chain data',
    tone: 'bold + visionary',
    audience: 'general crypto audience + builders'
  },
  {
    id: 'permanence',
    label: 'Permanent On-Chain Data',
    description: 'Focus on permanence, deterministic reconstruction, and immutability.',
    keywords: 'permanent, immutable, deterministic reconstruction, on-chain bytes',
    tone: 'clear + confident',
    audience: 'collectors, curators, long-term builders'
  },
  {
    id: 'recursion',
    label: 'Recursive Inscriptions',
    description: 'Explain modular content and recursive media/app building.',
    keywords: 'recursion, modular media, inscriptions referencing inscriptions',
    tone: 'technical + inspiring',
    audience: 'builders, creative technologists'
  },
  {
    id: 'compatibility',
    label: 'SIP-009 Compatibility',
    description: 'Highlight wallet + marketplace compatibility with richer data.',
    keywords: 'SIP-009, compatible NFTs, marketplaces, wallets',
    tone: 'practical + reassuring',
    audience: 'marketplaces, platforms, integrators'
  },
  {
    id: 'scale',
    label: 'Scale + Efficiency',
    description: 'Chunking, batching, and cheaper reads for large data.',
    keywords: 'chunking, batch reads, scale, efficiency, large media',
    tone: 'technical + precise',
    audience: 'builders, infra teams'
  },
  {
    id: 'creator-drops',
    label: 'Creator Drops',
    description: 'Position Xtrata as a new creative medium for artists.',
    keywords: 'artists, drops, on-chain media, creative permanence',
    tone: 'creative + warm',
    audience: 'artists, musicians, creators'
  }
];

type DraftPreset = {
  id: string;
  label: string;
  description: string;
  title: string;
  masterCopy: string;
  cta: string;
  hashtags: string;
  status: CampaignDraftStatus;
};

const DRAFT_PRESETS: DraftPreset[] = [
  {
    id: 'awareness',
    label: 'Awareness',
    description: 'Broad positioning and a simple CTA.',
    title: 'Xtrata awareness',
    masterCopy:
      'Xtrata is the on-chain memory layer for Bitcoin.\\n\\n' +
      'Large, permanent, composable data — reconstructed deterministically forever.',
    cta: 'Explore the viewer → https://xtrata.xyz',
    hashtags: '#xtrata #bitcoin #stacks',
    status: 'draft'
  },
  {
    id: 'builder-update',
    label: 'Builder update',
    description: 'Technical framing for developers and integrators.',
    title: 'Xtrata for builders',
    masterCopy:
      'Build on-chain apps and media with chunked uploads, batch reads, and deterministic reconstruction.\\n\\n' +
      'SIP-009 compatible NFTs with real on-chain payloads.',
    cta: 'Read the developer guide → https://xtrata.xyz',
    hashtags: '#builders #web3 #stacks',
    status: 'draft'
  },
  {
    id: 'creator-drop',
    label: 'Creator drop',
    description: 'Artist-focused messaging and drop CTA.',
    title: 'Creator spotlight',
    masterCopy:
      'On-chain art that can reference other art — recursive media on Bitcoin L2.\\n\\n' +
      'New creative formats, permanent by default.',
    cta: 'See the drop → https://xtrata.xyz',
    hashtags: '#onchainart #creative #xtrata',
    status: 'draft'
  },
  {
    id: 'partner-spotlight',
    label: 'Partner spotlight',
    description: 'Marketplace or integration announcement.',
    title: 'Partner spotlight',
    masterCopy:
      'Xtrata is SIP-009 compatible and ready for marketplaces.\\n\\n' +
      'Richer metadata, real on-chain payloads, and recursive media support.',
    cta: 'Integration details → https://xtrata.xyz',
    hashtags: '#nft #marketplace #stacks',
    status: 'draft'
  },
  {
    id: 'release-note',
    label: 'Release note',
    description: 'Product update with features + CTA.',
    title: 'Xtrata update',
    masterCopy:
      'New update: improved recursion tooling, batch reads, and migration-ready workflows.\\n\\n' +
      'Everything still reconstructs deterministically from chain data.',
    cta: 'Read release notes → https://xtrata.xyz',
    hashtags: '#productupdate #xtrata',
    status: 'draft'
  }
];

const AI_KEY_STORAGE = 'xtrata.campaign.ai.key';
const AI_ENDPOINT_STORAGE = 'xtrata.campaign.ai.endpoint';
const AI_MODEL_STORAGE = 'xtrata.campaign.ai.model';
const AI_TONE_STORAGE = 'xtrata.campaign.ai.tone';
const AI_AUDIENCE_STORAGE = 'xtrata.campaign.ai.audience';
const AI_KEYWORDS_STORAGE = 'xtrata.campaign.ai.keywords';

const DEFAULT_AI_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';

const readLocal = (key: string, fallback = '') => {
  try {
    if (typeof localStorage === 'undefined') {
      return fallback;
    }
    return localStorage.getItem(key) ?? fallback;
  } catch (error) {
    return fallback;
  }
};

const writeLocal = (key: string, value: string) => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (!value) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    // ignore storage errors
  }
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const resolveDraftLink = (draft: CampaignDraft) => {
  const match = draft.cta.match(URL_REGEX);
  if (match?.[0]) {
    return match[0];
  }
  return DEFAULT_CAMPAIGN_LINK;
};

const replaceLinkPlaceholder = (value: string, link: string) =>
  value.replace(LINK_PLACEHOLDER_REGEX, link);

const buildCopy = (draft: CampaignDraft, platform: CampaignPlatform) => {
  const link = resolveDraftLink(draft);
  const base = draft.masterCopy.trim();
  const cta = draft.cta.trim();
  const tags = draft.hashtags.trim();
  const chunks = [base];
  if (cta) {
    chunks.push(cta);
  }
  if (tags) {
    chunks.push(tags);
  }
  let text = chunks.filter(Boolean).join('\n\n').trim();
  const platformMeta = PLATFORMS.find((entry) => entry.id === platform);
  if (platformMeta?.maxLength && text.length > platformMeta.maxLength) {
    text = text.slice(0, platformMeta.maxLength - 1).trimEnd();
    text = `${text}…`;
  }
  if (LINK_PLACEHOLDER_REGEX.test(text)) {
    return replaceLinkPlaceholder(text, link);
  }
  return text;
};

const normalizePlatforms = (
  platforms?: Partial<Record<CampaignPlatform, CampaignPlatformConfig>>
) => {
  const normalized = { ...PLATFORM_DEFAULTS } as Record<
    CampaignPlatform,
    CampaignPlatformConfig
  >;
  if (!platforms) {
    return normalized;
  }
  (Object.keys(normalized) as CampaignPlatform[]).forEach((platform) => {
    const incoming = platforms[platform];
    if (!incoming) {
      return;
    }
    normalized[platform] = {
      ...normalized[platform],
      ...incoming,
      enabled: incoming.enabled ?? normalized[platform].enabled,
      copy: incoming.copy ?? normalized[platform].copy
    };
  });
  return normalized;
};

const createDraft = (): CampaignDraft => {
  const now = Date.now();
  return {
    id: `draft-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New campaign draft',
    masterCopy: '',
    cta: DEFAULT_CAMPAIGN_LINK,
    hashtags: '',
    status: 'draft',
    scheduledAt: null,
    platforms: normalizePlatforms(),
    assets: [],
    createdAt: now,
    updatedAt: now
  };
};

const normalizeDrafts = (drafts: CampaignDraft[]) =>
  drafts.map((draft) => {
    const platforms = normalizePlatforms(draft.platforms);
    const link = resolveDraftLink(draft);
    const nextCta = LINK_PLACEHOLDER_REGEX.test(draft.cta)
      ? replaceLinkPlaceholder(draft.cta, link)
      : draft.cta;
    const nextMaster = LINK_PLACEHOLDER_REGEX.test(draft.masterCopy)
      ? replaceLinkPlaceholder(draft.masterCopy, link)
      : draft.masterCopy;
    const nextPlatforms = Object.fromEntries(
      (Object.keys(platforms) as CampaignPlatform[]).map((platform) => {
        const entry = platforms[platform];
        const nextCopy = LINK_PLACEHOLDER_REGEX.test(entry.copy)
          ? replaceLinkPlaceholder(entry.copy, link)
          : entry.copy;
        return [platform, { ...entry, copy: nextCopy }];
      })
    ) as Record<CampaignPlatform, CampaignPlatformConfig>;
    return {
      ...draft,
      cta: nextCta,
      masterCopy: nextMaster,
      platforms: nextPlatforms
    };
  });

const updateDraftList = (
  drafts: CampaignDraft[],
  id: string,
  updater: (draft: CampaignDraft) => CampaignDraft
) => drafts.map((draft) => (draft.id === id ? updater(draft) : draft));

const copyToClipboard = async (value: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      // fall through to legacy fallback
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (error) {
    return false;
  }
};

const getComposeUrl = (
  platform: CampaignPlatform,
  text: string,
  title?: string,
  link?: string
) => {
  const entry = PLATFORMS.find((item) => item.id === platform);
  if (!entry?.composeUrl) {
    return null;
  }
  return entry.composeUrl({ text, title, link });
};

type CampaignConsoleScreenProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export default function CampaignConsoleScreen(
  props: CampaignConsoleScreenProps
) {
  const [drafts, setDrafts] = useState<CampaignDraft[]>(() =>
    normalizeDrafts(loadCampaignDrafts())
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(
    drafts[0]?.id ?? null
  );
  const [assetMessage, setAssetMessage] = useState<string | null>(null);
  const [aiEndpoint, setAiEndpoint] = useState(() =>
    readLocal(AI_ENDPOINT_STORAGE, DEFAULT_AI_ENDPOINT)
  );
  const [aiApiKey, setAiApiKey] = useState(() =>
    readLocal(AI_KEY_STORAGE, '')
  );
  const [aiModel, setAiModel] = useState(() =>
    readLocal(AI_MODEL_STORAGE, DEFAULT_AI_MODEL)
  );
  const [aiTone, setAiTone] = useState(() =>
    readLocal(AI_TONE_STORAGE, 'clear + confident')
  );
  const [aiAudience, setAiAudience] = useState(() =>
    readLocal(AI_AUDIENCE_STORAGE, 'builders, creators, collectors')
  );
  const [aiKeywords, setAiKeywords] = useState(() =>
    readLocal(AI_KEYWORDS_STORAGE, '')
  );
  const [aiThemeId, setAiThemeId] = useState<string | null>(null);
  const [appendPreset, setAppendPreset] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [modelError, setModelError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    saveCampaignDrafts(drafts);
  }, [drafts]);

  useEffect(() => {
    writeLocal(AI_ENDPOINT_STORAGE, aiEndpoint);
  }, [aiEndpoint]);

  useEffect(() => {
    writeLocal(AI_KEY_STORAGE, aiApiKey);
  }, [aiApiKey]);

  useEffect(() => {
    writeLocal(AI_MODEL_STORAGE, aiModel);
  }, [aiModel]);

  useEffect(() => {
    writeLocal(AI_TONE_STORAGE, aiTone);
  }, [aiTone]);

  useEffect(() => {
    writeLocal(AI_AUDIENCE_STORAGE, aiAudience);
  }, [aiAudience]);

  useEffect(() => {
    writeLocal(AI_KEYWORDS_STORAGE, aiKeywords);
  }, [aiKeywords]);

  useEffect(() => {
    setModelOptions([]);
    setModelStatus('idle');
    setModelError(null);
  }, [aiEndpoint]);

  useEffect(() => {
    if (drafts.length === 0) {
      setSelectedDraftId(null);
      return;
    }
    if (!selectedDraftId) {
      setSelectedDraftId(drafts[0].id);
      return;
    }
    const exists = drafts.some((draft) => draft.id === selectedDraftId);
    if (!exists) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, selectedDraftId]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId]
  );

  const updateSelectedDraft = (updater: (draft: CampaignDraft) => CampaignDraft) => {
    if (!selectedDraft) {
      return;
    }
    setDrafts((current) => updateDraftList(current, selectedDraft.id, updater));
  };

  const handleCreateDraft = () => {
    const draft = createDraft();
    setDrafts((current) => [draft, ...current]);
    setSelectedDraftId(draft.id);
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const handleGenerateCopies = () => {
    if (!selectedDraft) {
      return;
    }
    updateSelectedDraft((draft) => {
      const nextPlatforms = { ...draft.platforms };
      (Object.keys(nextPlatforms) as CampaignPlatform[]).forEach((platform) => {
        nextPlatforms[platform] = {
          ...nextPlatforms[platform],
          copy: buildCopy(draft, platform)
        };
      });
      return { ...draft, platforms: nextPlatforms, updatedAt: Date.now() };
    });
  };

  const handleAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length || !selectedDraft) {
      return;
    }
    const storedAssets: CampaignAsset[] = [];
    for (const file of files) {
      const asset = await storeCampaignAsset(file);
      if (asset) {
        storedAssets.push(asset);
      }
    }
    if (storedAssets.length === 0) {
      setAssetMessage('Unable to save assets. IndexedDB may be unavailable.');
      return;
    }
    setAssetMessage(null);
    updateSelectedDraft((draft) => ({
      ...draft,
      assets: [...storedAssets, ...draft.assets],
      updatedAt: Date.now()
    }));
    event.target.value = '';
  };

  const handleRemoveAsset = async (assetId: string) => {
    await deleteCampaignAsset(assetId);
    updateSelectedDraft((draft) => ({
      ...draft,
      assets: draft.assets.filter((asset) => asset.id !== assetId),
      updatedAt: Date.now()
    }));
  };

  const handlePreviewAsset = async (asset: CampaignAsset) => {
    const blob = await loadCampaignAssetBlob(asset.id);
    if (!blob) {
      setAssetMessage('Asset could not be loaded from storage.');
      return;
    }
    setAssetMessage(null);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadAsset = async (asset: CampaignAsset) => {
    const blob = await loadCampaignAssetBlob(asset.id);
    if (!blob) {
      setAssetMessage('Asset could not be loaded from storage.');
      return;
    }
    setAssetMessage(null);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = asset.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const buildModelsEndpoint = (endpoint: string) => {
    try {
      const url = new URL(endpoint);
      if (url.pathname.includes('/v1/')) {
        url.pathname = url.pathname.replace(/\/v1\/.*/, '/v1/models');
      } else {
        url.pathname = '/v1/models';
      }
      url.search = '';
      return url.toString();
    } catch (error) {
      return 'https://api.openai.com/v1/models';
    }
  };

  const handleConnectAiKey = async () => {
    if (!aiApiKey.trim()) {
      setModelStatus('error');
      setModelError('Enter an API key before connecting.');
      return;
    }
    setModelStatus('loading');
    setModelError(null);
    try {
      const url = buildModelsEndpoint(aiEndpoint);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${aiApiKey}`
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model list failed (${response.status}): ${errorText}`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ id?: string }>;
      };
      const models = Array.isArray(payload.data)
        ? payload.data
            .map((item) => item.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .sort()
        : [];
      setModelOptions(models);
      if (models.length > 0 && !models.includes(aiModel)) {
        setAiModel(models[0]);
      }
      setModelStatus('ready');
    } catch (error) {
      setModelStatus('error');
      setModelError(error instanceof Error ? error.message : 'Failed to load models.');
    }
  };

  const handleGenerateAiCopies = async () => {
    if (!selectedDraft) {
      return;
    }
    if (!aiApiKey.trim()) {
      setAiError('Add an API key before generating AI copy.');
      setAiStatus('error');
      return;
    }
    const enabledPlatforms = (Object.keys(
      selectedDraft.platforms
    ) as CampaignPlatform[]).filter(
      (platform) => selectedDraft.platforms[platform].enabled
    );
    if (enabledPlatforms.length === 0) {
      setAiError('Enable at least one platform for AI generation.');
      setAiStatus('error');
      return;
    }
    setAiStatus('loading');
    setAiError(null);
    const activeTheme = CAMPAIGN_THEMES.find((theme) => theme.id === aiThemeId);
    try {
      const result = await generateCampaignCopies({
        draft: selectedDraft,
        platforms: enabledPlatforms,
        keywords: aiKeywords,
        tone: aiTone,
        audience: aiAudience,
        theme: activeTheme
          ? `${activeTheme.label}: ${activeTheme.description}`
          : undefined,
        config: {
          endpoint: aiEndpoint,
          apiKey: aiApiKey,
          model: aiModel
        }
      });
      updateSelectedDraft((draft) => ({
        ...draft,
        platforms: {
          ...draft.platforms,
          ...Object.fromEntries(
            enabledPlatforms.map((platform) => [
              platform,
              {
                ...draft.platforms[platform],
                copy: result[platform] ?? ''
              }
            ])
          )
        },
        updatedAt: Date.now()
      }));
      setAiStatus('idle');
    } catch (error) {
      setAiStatus('error');
      setAiError(error instanceof Error ? error.message : 'AI generation failed.');
    }
  };

  const handleApplyTheme = (theme: CampaignTheme) => {
    setAiThemeId(theme.id);
    setAiKeywords(theme.keywords);
    setAiTone(theme.tone);
    setAiAudience(theme.audience);
  };

  const handleApplyPreset = (preset: DraftPreset) => {
    updateSelectedDraft((draft) => {
      const next = { ...draft };
      if (appendPreset) {
        const existing = draft.masterCopy.trim();
        const incoming = preset.masterCopy.trim();
        next.masterCopy = [existing, incoming].filter(Boolean).join('\\n\\n');
        if (!draft.title.trim()) {
          next.title = preset.title;
        }
        if (!draft.cta.trim()) {
          next.cta = preset.cta;
        }
        if (!draft.hashtags.trim()) {
          next.hashtags = preset.hashtags;
        }
      } else {
        next.title = preset.title;
        next.masterCopy = preset.masterCopy;
        next.cta = preset.cta;
        next.hashtags = preset.hashtags;
        next.status = preset.status;
      }
      return { ...next, updatedAt: Date.now() };
    });
  };

  return (
    <section
      className={`panel app-section${props.collapsed ? ' panel--collapsed' : ''}`}
      id="campaign-console"
    >
      <div className="panel__header">
        <div>
          <h2>Campaign console</h2>
          <p>Draft, prep assets, and run no-API posting workflows.</p>
        </div>
        <div className="panel__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={handleCreateDraft}
          >
            New draft
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={props.onToggleCollapse}
            aria-expanded={!props.collapsed}
          >
            {props.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className="panel__body">
        <div className="campaign-console__grid">
          <div className="campaign-console__pane">
            <div className="campaign-console__pane-header">
              <div>
                <h3>Drafts</h3>
                <p>Organize messaging and platform variants.</p>
              </div>
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={handleCreateDraft}
              >
                Add
              </button>
            </div>
            {drafts.length === 0 ? (
              <p className="field__hint">No drafts yet. Create one to start.</p>
            ) : (
              <div className="campaign-console__draft-list">
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    className={`campaign-console__draft-card${
                      draft.id === selectedDraftId
                        ? ' campaign-console__draft-card--active'
                        : ''
                    }`}
                    onClick={() => setSelectedDraftId(draft.id)}
                  >
                    <div>
                      <span className="meta-label">{draft.title}</span>
                      <span className="campaign-console__draft-meta">
                        {draft.status} · {draft.assets.length} assets
                      </span>
                    </div>
                    <span className="campaign-console__draft-time">
                      {new Date(draft.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="campaign-console__pane campaign-console__pane--wide">
            {!selectedDraft ? (
              <p className="field__hint">Select a draft to edit.</p>
            ) : (
              <div className="campaign-console__editor">
                <div className="campaign-console__section">
                  <div>
                    <h3>Draft details</h3>
                    <p>Set the master copy and overall status.</p>
                  </div>
                  <div className="campaign-console__preset-header">
                    <span className="meta-label">Presets</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={appendPreset}
                        onChange={(event) => setAppendPreset(event.target.checked)}
                      />
                      <span>Append instead of replace</span>
                    </label>
                  </div>
                  <div className="campaign-console__preset-grid">
                    {DRAFT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="campaign-console__preset-card"
                        onClick={() => handleApplyPreset(preset)}
                      >
                        <span className="meta-label">{preset.label}</span>
                        <span className="campaign-console__draft-meta">
                          {preset.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="campaign-console__form-grid">
                    <label className="field">
                      <span className="field__label">Title</span>
                      <input
                        className="input"
                        value={selectedDraft.title}
                        onChange={(event) =>
                          updateSelectedDraft((draft) => ({
                            ...draft,
                            title: event.target.value,
                            updatedAt: Date.now()
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Status</span>
                      <select
                        className="input"
                        value={selectedDraft.status}
                        onChange={(event) =>
                          updateSelectedDraft((draft) => ({
                            ...draft,
                            status: event.target.value as CampaignDraftStatus,
                            updatedAt: Date.now()
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">Scheduled at</span>
                      <input
                        className="input"
                        type="datetime-local"
                        value={selectedDraft.scheduledAt ?? ''}
                        onChange={(event) =>
                          updateSelectedDraft((draft) => ({
                            ...draft,
                            scheduledAt: event.target.value || null,
                            updatedAt: Date.now()
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">CTA link</span>
                      <input
                        className="input"
                        placeholder="https://..."
                        value={selectedDraft.cta}
                        onChange={(event) =>
                          updateSelectedDraft((draft) => ({
                            ...draft,
                            cta: event.target.value,
                            updatedAt: Date.now()
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="field__label">Master copy</span>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={selectedDraft.masterCopy}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          masterCopy: event.target.value,
                          updatedAt: Date.now()
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Hashtags</span>
                    <input
                      className="input"
                      placeholder="#xtrata #bitcoin"
                      value={selectedDraft.hashtags}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          hashtags: event.target.value,
                          updatedAt: Date.now()
                        }))
                      }
                    />
                  </label>
                  <div className="campaign-console__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={handleGenerateCopies}
                    >
                      Generate platform copies
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => handleDeleteDraft(selectedDraft.id)}
                    >
                      Delete draft
                    </button>
                  </div>
                </div>

                <div className="campaign-console__section">
                  <div>
                    <h3>AI generator</h3>
                    <p>
                      Generate platform copy from the draft plus keywords. Store
                      keys locally only; use a proxy endpoint for production.
                    </p>
                  </div>
                  <div className="campaign-console__theme-grid">
                    {CAMPAIGN_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className={`campaign-console__theme-card${
                          aiThemeId === theme.id
                            ? ' campaign-console__theme-card--active'
                            : ''
                        }`}
                        onClick={() => handleApplyTheme(theme)}
                      >
                        <span className="meta-label">{theme.label}</span>
                        <span className="campaign-console__draft-meta">
                          {theme.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="campaign-console__form-grid">
                    <label className="field">
                      <span className="field__label">AI endpoint</span>
                      <input
                        className="input"
                        value={aiEndpoint}
                        onChange={(event) => setAiEndpoint(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Model</span>
                      {modelOptions.length > 0 ? (
                        <select
                          className="input"
                          value={aiModel}
                          onChange={(event) => setAiModel(event.target.value)}
                        >
                          {modelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          value={aiModel}
                          onChange={(event) => setAiModel(event.target.value)}
                        />
                      )}
                      <span className="field__hint">
                        {modelOptions.length > 0
                          ? 'Loaded models from API.'
                          : 'Enter a model or connect to load options.'}
                      </span>
                    </label>
                    <label className="field">
                      <span className="field__label">API key</span>
                      <input
                        className="input"
                        type="password"
                        value={aiApiKey}
                        onChange={(event) => setAiApiKey(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Tone</span>
                      <input
                        className="input"
                        value={aiTone}
                        onChange={(event) => setAiTone(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Audience</span>
                      <input
                        className="input"
                        value={aiAudience}
                        onChange={(event) => setAiAudience(event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="field__label">Keywords / notes</span>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={aiKeywords}
                      onChange={(event) => setAiKeywords(event.target.value)}
                    />
                  </label>
                  {modelError && <p className="field__error">{modelError}</p>}
                  {aiError && <p className="field__error">{aiError}</p>}
                  <div className="campaign-console__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={handleConnectAiKey}
                      disabled={modelStatus === 'loading'}
                    >
                      {modelStatus === 'loading'
                        ? 'Connecting...'
                        : modelOptions.length > 0
                          ? 'Refresh models'
                          : 'Connect & load models'}
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={handleGenerateAiCopies}
                      disabled={aiStatus === 'loading'}
                    >
                      {aiStatus === 'loading' ? 'Generating...' : 'Generate AI copies'}
                    </button>
                  </div>
                </div>

                <div className="campaign-console__section">
                  <div>
                    <h3>Assets</h3>
                    <p>Upload and reuse media for posts.</p>
                  </div>
                  <input
                    className="input"
                    type="file"
                    multiple
                    onChange={handleAssetUpload}
                  />
                  {assetMessage && <p className="field__error">{assetMessage}</p>}
                  {selectedDraft.assets.length === 0 ? (
                    <p className="field__hint">No assets saved yet.</p>
                  ) : (
                    <div className="campaign-console__asset-grid">
                      {selectedDraft.assets.map((asset) => (
                        <div key={asset.id} className="campaign-console__asset-card">
                          <div>
                            <span className="meta-label">{asset.name}</span>
                            <span className="campaign-console__asset-meta">
                              {formatBytes(asset.size)}
                            </span>
                          </div>
                          <div className="campaign-console__asset-actions">
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() => handlePreviewAsset(asset)}
                            >
                              Preview
                            </button>
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() => handleDownloadAsset(asset)}
                            >
                              Download
                            </button>
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() => handleRemoveAsset(asset.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="campaign-console__section">
                  <div>
                    <h3>Platform variants</h3>
                    <p>Enable platforms and customize copy.</p>
                  </div>
                  <div className="campaign-console__platform-grid">
                    {PLATFORMS.map((platform) => {
                      const config = selectedDraft.platforms[platform.id];
                      return (
                        <div
                          key={platform.id}
                          className="campaign-console__platform-card"
                        >
                          <div className="campaign-console__platform-header">
                            <div>
                              <span className="meta-label">{platform.label}</span>
                              <span className="campaign-console__draft-meta">
                                {platform.composeHint}
                              </span>
                            </div>
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(event) =>
                                  updateSelectedDraft((draft) => ({
                                    ...draft,
                                    platforms: {
                                      ...draft.platforms,
                                      [platform.id]: {
                                        ...config,
                                        enabled: event.target.checked
                                      }
                                    },
                                    updatedAt: Date.now()
                                  }))
                                }
                              />
                              <span>Enabled</span>
                            </label>
                          </div>
                          {platform.supportsTitle && (
                            <label className="field">
                              <span className="field__label">Title</span>
                              <input
                                className="input"
                                value={config.title ?? ''}
                                onChange={(event) =>
                                  updateSelectedDraft((draft) => ({
                                    ...draft,
                                    platforms: {
                                      ...draft.platforms,
                                      [platform.id]: {
                                        ...config,
                                        title: event.target.value
                                      }
                                    },
                                    updatedAt: Date.now()
                                  }))
                                }
                              />
                            </label>
                          )}
                          <label className="field">
                            <span className="field__label">Copy</span>
                            <textarea
                              className="textarea"
                              rows={3}
                              value={config.copy}
                              onChange={(event) =>
                                updateSelectedDraft((draft) => ({
                                  ...draft,
                                  platforms: {
                                    ...draft.platforms,
                                    [platform.id]: {
                                      ...config,
                                      copy: event.target.value
                                    }
                                  },
                                  updatedAt: Date.now()
                                }))
                              }
                            />
                          </label>
                          <div className="campaign-console__platform-actions">
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() =>
                                updateSelectedDraft((draft) => ({
                                  ...draft,
                                  platforms: {
                                    ...draft.platforms,
                                    [platform.id]: {
                                      ...config,
                                      copy: buildCopy(draft, platform.id)
                                    }
                                  },
                                  updatedAt: Date.now()
                                }))
                              }
                            >
                              Regenerate
                            </button>
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() => void copyToClipboard(config.copy)}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="campaign-console__section">
                  <div>
                    <h3>Post runner</h3>
                    <p>Step through each platform with one click.</p>
                  </div>
                  <div className="campaign-console__runner">
                    {PLATFORMS.map((platform) => {
                      const config = selectedDraft.platforms[platform.id];
                      if (!config.enabled) {
                        return null;
                      }
                      const composeUrl = getComposeUrl(
                        platform.id,
                        config.copy,
                        config.title,
                        selectedDraft.cta
                      );
                      return (
                        <div
                          key={platform.id}
                          className="campaign-console__runner-card"
                        >
                          <div>
                            <span className="meta-label">{platform.label}</span>
                            <span className="campaign-console__draft-meta">
                              {platform.composeHint}
                            </span>
                          </div>
                          <div className="campaign-console__runner-actions">
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={() => void copyToClipboard(config.copy)}
                            >
                              Copy text
                            </button>
                            {platform.supportsTitle && (
                              <button
                                className="button button--ghost button--mini"
                                type="button"
                                onClick={() =>
                                  void copyToClipboard(config.title ?? '')
                                }
                              >
                                Copy title
                              </button>
                            )}
                            {composeUrl && (
                              <a
                                className="button button--ghost button--mini"
                                href={composeUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open compose
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {PLATFORMS.every(
                      (platform) => !selectedDraft.platforms[platform.id].enabled
                    ) && (
                      <p className="field__hint">
                        Enable at least one platform to use the runner.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
