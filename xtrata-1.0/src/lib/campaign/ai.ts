import type { CampaignDraft, CampaignPlatform } from './types';

export type CampaignAiConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export type CampaignAiParams = {
  draft: CampaignDraft;
  platforms: CampaignPlatform[];
  keywords: string;
  tone: string;
  audience: string;
  theme?: string;
  config: CampaignAiConfig;
};

type AiResponsePayload = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
};

const PLATFORM_KEYS: CampaignPlatform[] = [
  'x',
  'youtube',
  'instagram',
  'reddit',
  'telegram',
  'discord'
];

const extractOutputText = (payload: AiResponsePayload) => {
  if (payload.output_text) {
    return payload.output_text;
  }
  const textChunks: string[] = [];
  payload.output?.forEach((item) => {
    if (item.type === 'message' && item.content) {
      item.content.forEach((content) => {
        if (content.type === 'output_text' && content.text) {
          textChunks.push(content.text);
        }
      });
    }
  });
  return textChunks.join('\n').trim();
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const extractJson = (value: string) => {
  const direct = safeJsonParse(value);
  if (direct) {
    return direct;
  }
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  return safeJsonParse(match[0]);
};

const buildPrompt = (params: CampaignAiParams) => {
  const enabledList = params.platforms.join(', ');
  const masterCopy = params.draft.masterCopy.trim();
  const cta = params.draft.cta.trim();
  const hashtags = params.draft.hashtags.trim();
  const keywords = params.keywords.trim();
  const audience = params.audience.trim();
  const theme = params.theme?.trim();
  return `You are a social media copywriter for Xtrata.\n\n` +
    `Goal: Generate platform-specific post copy.\n` +
    `Platforms to fill: ${enabledList}.\n` +
    `Tone: ${params.tone}.\n` +
    `Audience: ${audience || 'general crypto + creators + builders'}.\n\n` +
    `${theme ? `Core theme:\n${theme}\n\n` : ''}` +
    `Campaign context:\n${masterCopy || 'No master copy provided.'}\n\n` +
    `Keywords/notes:\n${keywords || 'None'}\n\n` +
    `CTA link:\n${cta || 'None'}\n\n` +
    `Hashtags:\n${hashtags || 'None'}\n\n` +
    `Output ONLY valid JSON with keys x, youtube, instagram, reddit, telegram, discord.\n` +
    `For platforms not in the list, return an empty string.\n` +
    `Keep X posts under 280 characters. Use line breaks sparingly.`;
};

export const generateCampaignCopies = async (params: CampaignAiParams) => {
  const prompt = buildPrompt(params);
  const response = await fetch(params.config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.config.apiKey}`
    },
    body: JSON.stringify({
      model: params.config.model,
      instructions:
        'Return ONLY valid JSON. Do not include markdown or commentary.',
      input: prompt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as AiResponsePayload;
  const outputText = extractOutputText(payload);
  const parsed = extractJson(outputText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response did not include valid JSON.');
  }

  const normalized: Record<CampaignPlatform, string> = {
    x: '',
    youtube: '',
    instagram: '',
    reddit: '',
    telegram: '',
    discord: ''
  };
  PLATFORM_KEYS.forEach((platform) => {
    const value = (parsed as Record<string, unknown>)[platform];
    if (typeof value === 'string') {
      normalized[platform] = value;
    }
  });
  return normalized;
};
