import type { InscriptionMeta } from '../protocol/types';

export type TokenSummary = {
  id: bigint;
  owner: string | null;
  tokenUri: string | null;
  meta: InscriptionMeta | null;
  svgDataUri: string | null;
};

export type StreamStatus = {
  id: string;
  phase: 'idle' | 'buffering' | 'playable' | 'loading' | 'complete' | 'error';
  bufferedSeconds: number;
  chunksLoaded: number;
  totalChunks: number;
  mimeType: string | null;
  updatedAt: number;
} | null;
