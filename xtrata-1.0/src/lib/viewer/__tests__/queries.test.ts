import { describe, expect, it, vi } from 'vitest';
import type { InscriptionMeta } from '../../protocol/types';
import type { XtrataClient } from '../../contract/client';
import {
  fetchTokenSummary,
  fetchTokenSummaryWithFallback
} from '../queries';

const createMeta = (mimeType: string, owner = 'SPOWNER'): InscriptionMeta => ({
  owner,
  creator: null,
  mimeType,
  totalSize: 1n,
  totalChunks: 1n,
  sealed: true,
  finalHash: new Uint8Array([0])
});

describe('viewer queries', () => {
  it('skips svg fetch for non-svg mime types', async () => {
    const client = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v1-1-1',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn().mockResolvedValue(createMeta('image/png')),
      getTokenUri: vi.fn().mockResolvedValue('data:image/png;base64,AA=='),
      getOwner: vi.fn().mockResolvedValue('SPOWNER'),
      getSvgDataUri: vi.fn().mockResolvedValue('data:image/svg+xml;base64,AA==')
    } as unknown as XtrataClient;

    const summary = await fetchTokenSummary({
      client,
      id: 1n,
      senderAddress: 'SPTEST'
    });

    expect(client.getSvgDataUri).not.toHaveBeenCalled();
    expect(summary.svgDataUri).toBeNull();
  });

  it('handles svg errors and owner fallback', async () => {
    const client = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v1-1-1',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn().mockResolvedValue(createMeta('image/svg+xml', 'SPMETA')),
      getTokenUri: vi.fn().mockResolvedValue(null),
      getOwner: vi.fn().mockResolvedValue(null),
      getSvgDataUri: vi.fn().mockRejectedValue(new Error('missing'))
    } as unknown as XtrataClient;

    const summary = await fetchTokenSummary({
      client,
      id: 2n,
      senderAddress: 'SPTEST'
    });

    expect(client.getSvgDataUri).toHaveBeenCalledTimes(1);
    expect(summary.svgDataUri).toBeNull();
    expect(summary.owner).toBe('SPMETA');
  });

  it('uses primary ownership when legacy token is escrowed to v2 contract', async () => {
    const legacyClient = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v1-1-1',
        network: 'mainnet'
      },
      getInscriptionMeta: vi
        .fn()
        .mockResolvedValue(
          createMeta(
            'image/png',
            'sp3jnsexazp4bdshv0dn3m8r3p0my0eebqqzx743x.xtrata-v2-1-0'
          )
        ),
      getTokenUri: vi.fn().mockResolvedValue('ipfs://legacy'),
      getOwner: vi
        .fn()
        .mockResolvedValue(
          'sp3jnsexazp4bdshv0dn3m8r3p0my0eebqqzx743x.xtrata-v2-1-0'
        ),
      getSvgDataUri: vi.fn().mockResolvedValue(null)
    } as unknown as XtrataClient;

    const primaryClient = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn().mockResolvedValue(createMeta('image/png', 'SPWALLET')),
      getTokenUri: vi.fn().mockResolvedValue('ipfs://v2'),
      getOwner: vi.fn().mockResolvedValue('SPWALLET'),
      getSvgDataUri: vi.fn().mockResolvedValue(null)
    } as unknown as XtrataClient;

    const summary = await fetchTokenSummaryWithFallback({
      primaryClient,
      legacyClient,
      id: 3n,
      senderAddress: 'SPTEST',
      legacyMaxId: 38n,
      primaryAvailable: false,
      escrowOwner: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    });

    expect(summary.owner).toBe('SPWALLET');
    expect(summary.sourceContractId).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(primaryClient.getInscriptionMeta).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy summary when primary has no migrated record yet', async () => {
    const legacyClient = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v1-1-1',
        network: 'mainnet'
      },
      getInscriptionMeta: vi
        .fn()
        .mockResolvedValue(
          createMeta(
            'image/png',
            'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
          )
        ),
      getTokenUri: vi.fn().mockResolvedValue('ipfs://legacy'),
      getOwner: vi
        .fn()
        .mockResolvedValue(
          'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
        ),
      getSvgDataUri: vi.fn().mockResolvedValue(null)
    } as unknown as XtrataClient;

    const primaryClient = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn().mockResolvedValue(null),
      getTokenUri: vi.fn().mockResolvedValue(null),
      getOwner: vi.fn().mockResolvedValue(null),
      getSvgDataUri: vi.fn().mockResolvedValue(null)
    } as unknown as XtrataClient;

    const summary = await fetchTokenSummaryWithFallback({
      primaryClient,
      legacyClient,
      id: 3n,
      senderAddress: 'SPTEST',
      legacyMaxId: 38n,
      primaryAvailable: true,
      escrowOwner: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    });

    expect(summary.owner).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(summary.sourceContractId).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
    );
  });
});
