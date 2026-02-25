import { afterEach, describe, expect, it, vi } from 'vitest';
import { __testing, loadWalletHoldingsIndex } from '../wallet-index';

const MAINNET = 'mainnet' as const;
const OWNER = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
const PRIMARY_CONTRACT =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
const LEGACY_CONTRACT =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';

describe('wallet holdings index', () => {
  afterEach(() => {
    __testing.resetWalletHoldingsIndexState();
  });

  it('parses, dedupes, sorts, and filters token ids by contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total: 4,
        results: [
          {
            asset_identifier: `${PRIMARY_CONTRACT}::xtrata-inscription`,
            value: { repr: 'u9' }
          },
          {
            asset_identifier: `${PRIMARY_CONTRACT}::xtrata-inscription`,
            value: { repr: 'u2' }
          },
          {
            asset_identifier: `${PRIMARY_CONTRACT}::xtrata-inscription`,
            value: { repr: 'u2' }
          },
          {
            asset_identifier: `SPOTHER.other::xtrata-inscription`,
            value: { repr: 'u99' }
          }
        ]
      })
    });

    const result = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT],
      apiBaseUrls: ['https://api.mainnet.hiro.so'],
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result?.tokenIds.map((id) => id.toString())).toEqual(['2', '9']);
    expect(result?.sourceBase).toBe('https://api.mainnet.hiro.so');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next base when the first base fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          results: [
            {
              asset_identifier: `${LEGACY_CONTRACT}::xtrata-inscription`,
              token_id: '77'
            }
          ]
        })
      });

    const result = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT, LEGACY_CONTRACT],
      apiBaseUrls: [
        'https://api.mainnet.hiro.so',
        'https://backup.mainnet.hiro.so'
      ],
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result?.tokenIds.map((id) => id.toString())).toEqual(['77']);
    expect(result?.sourceBase).toBe('https://backup.mainnet.hiro.so');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when no Hiro-compatible base is available', async () => {
    const fetchMock = vi.fn();
    const result = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT],
      apiBaseUrls: ['https://stacks-node-api.mainnet.stacks.co'],
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns cached snapshot when rate-limited, then backs off', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          results: [
            {
              asset_identifier: `${PRIMARY_CONTRACT}::xtrata-inscription`,
              token_id: '11'
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({})
      });

    const first = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT],
      apiBaseUrls: ['https://api.mainnet.hiro.so'],
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(first?.tokenIds.map((id) => id.toString())).toEqual(['11']);

    const second = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT],
      apiBaseUrls: ['https://api.mainnet.hiro.so'],
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(second?.tokenIds.map((id) => id.toString())).toEqual(['11']);

    const third = await loadWalletHoldingsIndex({
      network: MAINNET,
      walletAddress: OWNER,
      contractIds: [PRIMARY_CONTRACT],
      apiBaseUrls: ['https://api.mainnet.hiro.so'],
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(third?.tokenIds.map((id) => id.toString())).toEqual(['11']);

    // Third call is served from local snapshot while backoff is active.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
