import { describe, expect, it } from 'vitest';
import {
  deriveExpectedContractName,
  parseContractPrincipal,
  resolveCollectionContractLink
} from '../contract-link';

describe('shared collection contract link resolver', () => {
  it('parses full contract principal values', () => {
    expect(
      parseContractPrincipal(
        'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7.xtrata-collection-ahv1-7f52463b'
      )
    ).toEqual({
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      contractName: 'xtrata-collection-ahv1-7f52463b'
    });
  });

  it('derives expected names from slug and collection id', () => {
    expect(
      deriveExpectedContractName({
        collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
        collectionSlug: 'ahv1',
        mintType: 'standard'
      })
    ).toBe('xtrata-collection-ahv1-7f52463b');
  });

  it('resolves from metadata or falls back to derived names', () => {
    const fromMetadata = resolveCollectionContractLink({
      collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
      collectionSlug: 'ahv1',
      contractAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      metadata: { contractName: 'xtrata-collection-ahv1-7f52463b' }
    });
    expect(fromMetadata?.source).toBe('metadata-contract-name');

    const fromFallback = resolveCollectionContractLink({
      collectionId: '7f52463b-80c8-4ca2-bc54-27ceb44f45e0',
      collectionSlug: 'ahv1',
      contractAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      metadata: { mintType: 'standard' }
    });
    expect(fromFallback?.source).toBe('derived-slug-id');
    expect(fromFallback?.contractName).toBe('xtrata-collection-ahv1-7f52463b');
  });
});
