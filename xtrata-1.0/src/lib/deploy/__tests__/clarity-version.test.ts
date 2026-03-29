import { describe, expect, it } from 'vitest';
import {
  resolveDeployClarityVersion,
  sourceRequiresClarity3
} from '../clarity-version';

describe('deploy clarity version helpers', () => {
  it('uses Clarity 3 for known collection deploy templates', () => {
    expect(
      resolveDeployClarityVersion({ templateVersion: 'xtrata-collection-mint-v1.4' })
    ).toBe(3);
    expect(
      resolveDeployClarityVersion({
        templateVersion: 'xtrata-preinscribed-collection-sale-v1.0'
      })
    ).toBe(3);
    expect(
      resolveDeployClarityVersion({ templateVersion: 'xtrata-collection-mint-v1-4' })
    ).toBe(3);
  });

  it('uses Clarity 3 when the source contains Clarity 3-only keywords', () => {
    const source = `
      (define-public (is-live)
        (ok (>= stacks-block-height u1)))
    `;

    expect(sourceRequiresClarity3(source)).toBe(true);
    expect(resolveDeployClarityVersion({ source })).toBe(3);
  });

  it('falls back to Clarity 2 for sources without Clarity 3 markers', () => {
    const source = `
      (define-public (is-live)
        (ok (>= block-height u1)))
    `;

    expect(sourceRequiresClarity3(source)).toBe(false);
    expect(resolveDeployClarityVersion({ source })).toBe(2);
  });
});
