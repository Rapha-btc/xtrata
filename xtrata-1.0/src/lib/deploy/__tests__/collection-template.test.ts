import { describe, expect, it } from 'vitest';
import {
  buildCollectionMintContractSource,
  createDefaultCollectionTemplateDraft,
  createDefaultCollectionTemplatePolicy,
  resolveTemplateDraft
} from '../collection-template';

const TEST_TEMPLATE = `
(define-constant ALLOWED-XTRATA-CONTRACT 'SP123.old-target)
(define-data-var paused bool true)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var allowlist-enabled bool false)
(define-data-var max-per-wallet uint u0)
(define-data-var reservation-expiry-blocks uint u1440)
(define-data-var collection-name (string-ascii 64) "")
(define-data-var collection-symbol (string-ascii 16) "")
(define-data-var collection-base-uri (string-ascii 256) "")
(define-data-var collection-description (string-ascii 256) "")
(define-data-var default-token-uri (string-ascii 256) DEFAULT-TOKEN-URI)
`;

describe('collection template deploy helpers', () => {
  it('resolves locked fields from policy defaults', () => {
    const policy = createDefaultCollectionTemplatePolicy('SPCORE.xtrata-v2-1-0');
    policy.locked = true;
    policy.editableFields.collectionName = false;
    policy.defaults.collectionName = 'Policy Name';
    const draft = createDefaultCollectionTemplateDraft('SPOTHER.xtrata-v2-1-0');
    draft.collectionName = 'User Name';
    const resolved = resolveTemplateDraft({
      draft,
      policy,
      fallbackCoreContractId: 'SPFALLBACK.xtrata-v2-1-0'
    });
    expect(resolved.collectionName).toBe('Policy Name');
  });

  it('builds template source with configured values', () => {
    const policy = createDefaultCollectionTemplatePolicy(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    const draft = {
      ...createDefaultCollectionTemplateDraft(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
      ),
      collectionName: 'Demo Collection',
      collectionSymbol: 'DEMO',
      defaultMintPriceStx: '0.25',
      defaultMaxSupply: '777',
      defaultMaxPerWallet: '3',
      defaultAllowlistEnabled: true
    };

    const result = buildCollectionMintContractSource({
      templateSource: TEST_TEMPLATE,
      draft,
      policy,
      fallbackCoreContractId:
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain(
      "(define-constant ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)"
    );
    expect(result.source).toContain(
      '(define-data-var collection-name (string-ascii 64) "Demo Collection")'
    );
    expect(result.source).toContain(
      '(define-data-var collection-symbol (string-ascii 16) "DEMO")'
    );
    expect(result.source).toContain('(define-data-var mint-price uint u250000)');
    expect(result.source).toContain('(define-data-var max-supply uint u777)');
    expect(result.source).toContain(
      '(define-data-var allowlist-enabled bool true)'
    );
  });

  it('returns validation errors for malformed fields', () => {
    const policy = createDefaultCollectionTemplatePolicy(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    const draft = {
      ...createDefaultCollectionTemplateDraft('BAD'),
      coreContract: 'invalid',
      defaultMintPriceStx: '1.1234567',
      defaultMaxSupply: '-1',
      reservationExpiryBlocks: '0'
    };
    const result = buildCollectionMintContractSource({
      templateSource: TEST_TEMPLATE,
      draft,
      policy,
      fallbackCoreContractId:
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
