export type CampaignPlatform =
  | 'x'
  | 'youtube'
  | 'instagram'
  | 'reddit'
  | 'telegram'
  | 'discord';

export type CampaignPlatformConfig = {
  enabled: boolean;
  copy: string;
  title?: string;
  notes?: string;
  link?: string;
  scheduleAt?: string;
};

export type CampaignAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
};

export type CampaignDraftStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'published';

export type CampaignDraft = {
  id: string;
  title: string;
  masterCopy: string;
  cta: string;
  hashtags: string;
  status: CampaignDraftStatus;
  scheduledAt: string | null;
  platforms: Record<CampaignPlatform, CampaignPlatformConfig>;
  assets: CampaignAsset[];
  createdAt: number;
  updatedAt: number;
};
