import { describe, expect, it } from 'vitest';
import {
  deriveExpectedContractName,
  parseContractPrincipal,
  resolveCollectionContractLink
} from '../contract-link';

describe('manage contract link resolver', () => {
  it('parses a full contract principal', () => {
    expect(
      parseContractPrincipal(
        'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv1-7f52463b'
      )
    ).toEqual({
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      contractName: 'xtrata-collection-ahv1-7f52463b'
    });
  });

  it('resolves from metadata contractName and address', () => {
    const resolved = resolveCollectionContractLink({
      collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
      collectionSlug: 'ahv1',
      contractAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      metadata: {
        contractName: 'xtrata-collection-ahv1-7f52463b'
      }
    });

    expect(resolved).toMatchObject({
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      contractName: 'xtrata-collection-ahv1-7f52463b',
      source: 'metadata-contract-name'
    });
  });

  it('resolves contractName from full contract id in collection.contract_address', () => {
    const resolved = resolveCollectionContractLink({
      collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
      collectionSlug: 'ahv1',
      contractAddress:
        'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv1-7f52463b',
      metadata: null
    });

    expect(resolved?.contractName).toBe('xtrata-collection-ahv1-7f52463b');
    expect(resolved?.source).toBe('collection-contract-id');
  });

  it('derives expected contractName from slug + id when metadata is missing', () => {
    expect(
      deriveExpectedContractName({
        collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
        collectionSlug: 'ahv1',
        mintType: 'standard'
      })
    ).toBe('xtrata-collection-ahv1-7f52463b');
  });

  it('uses deploy snapshot contractName as highest-priority source', () => {
    const resolved = resolveCollectionContractLink({
      collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
      collectionSlug: 'ahv1',
      contractAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      deployContractName: 'xtrata-collection-ahv1-7f52463b',
      metadata: {
        contractName: 'xtrata-collection-ahv1-other'
      }
    });

    expect(resolved?.contractName).toBe('xtrata-collection-ahv1-7f52463b');
    expect(resolved?.source).toBe('deploy');
  });
});
