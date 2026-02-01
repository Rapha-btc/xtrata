import { describe, expect, it, vi } from 'vitest';
import type { XtrataClient } from '../client';
import { fetchContractAdminStatus } from '../admin-status';

const makeClient = (overrides: Partial<XtrataClient> = {}): XtrataClient => {
  const base = {
    contract: {
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: 'xtrata-v1-1-1',
      network: 'mainnet'
    },
    getAdmin: vi.fn().mockResolvedValue('SPADMIN'),
    getRoyaltyRecipient: vi.fn().mockResolvedValue('SPROYALTY'),
    getFeeUnit: vi.fn().mockResolvedValue(100000n),
    isPaused: vi.fn().mockResolvedValue(false),
    getNextTokenId: vi.fn().mockResolvedValue(12n),
    getLastTokenId: vi.fn().mockResolvedValue(0n),
    getTokenUri: vi.fn(),
    getOwner: vi.fn(),
    getSvg: vi.fn(),
    getSvgDataUri: vi.fn(),
    getInscriptionMeta: vi.fn(),
    getDependencies: vi.fn(),
    getChunk: vi.fn(),
    getUploadState: vi.fn(),
    getPendingChunk: vi.fn()
  };
  return { ...base, ...overrides } as XtrataClient;
};

describe('contract admin status', () => {
  it('fetches admin status for v1.1.1', async () => {
    const client = makeClient();
    const status = await fetchContractAdminStatus({
      client,
      senderAddress: 'SPTEST'
    });

    expect(status.admin).toBe('SPADMIN');
    expect(status.royaltyRecipient).toBe('SPROYALTY');
    expect(status.feeUnitMicroStx).toBe(100000n);
    expect(status.paused).toBe(false);
    expect(status.nextTokenId).toBe(12n);
    expect(client.getAdmin).toHaveBeenCalledTimes(1);
    expect(client.getRoyaltyRecipient).toHaveBeenCalledTimes(1);
    expect(client.getFeeUnit).toHaveBeenCalledTimes(1);
    expect(client.isPaused).toHaveBeenCalledTimes(1);
    expect(client.getNextTokenId).toHaveBeenCalledTimes(1);
  });
});
