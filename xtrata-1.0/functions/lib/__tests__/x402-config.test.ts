import { describe, expect, it } from 'vitest';
import {
  buildX402DemoRoute,
  getX402ContractId,
  getX402PremiumRoute
} from '../x402-config';

describe('x402 config', () => {
  it('builds a commerce-backed demo route from env', () => {
    const lookup = buildX402DemoRoute({
      X402_DEMO_ASSET_ID: '11',
      X402_DEMO_LISTING_ID: '3',
      X402_DEMO_PRICE: '2000000'
    });

    expect(lookup.error).toBeNull();
    expect(lookup.route?.slug).toBe('premium-recursive-demo');
    expect(lookup.route?.assetId).toBe(11n);
    expect(lookup.route?.commerce?.listingId).toBe(3n);
    expect(lookup.route?.commerce?.price).toBe(2_000_000n);
    expect(getX402ContractId(lookup.route!.contract)).toContain('.xtrata-v2-1-0');
  });

  it('requires commerce listing data when commerce mode is enabled', () => {
    const lookup = buildX402DemoRoute({
      X402_DEMO_ASSET_ID: '11',
      X402_DEMO_ACCESS_MODE: 'commerce'
    });

    expect(lookup.route).toBeNull();
    expect(lookup.error).toContain('X402_DEMO_LISTING_ID');
  });

  it('requires vault id when minimum tier above one', () => {
    const lookup = buildX402DemoRoute({
      X402_DEMO_ASSET_ID: '11',
      X402_DEMO_ACCESS_MODE: 'vault',
      X402_DEMO_MIN_TIER: '2'
    });

    expect(lookup.route).toBeNull();
    expect(lookup.error).toContain('X402_DEMO_VAULT_ID');
  });

  it('matches only the configured slug', () => {
    const env = {
      X402_DEMO_SLUG: 'demo-slug',
      X402_DEMO_ASSET_ID: '11',
      X402_DEMO_LISTING_ID: '3',
      X402_DEMO_PRICE: '2000000'
    };

    expect(getX402PremiumRoute(env, 'demo-slug').route?.slug).toBe('demo-slug');
    expect(getX402PremiumRoute(env, 'other-slug').route).toBeNull();
    expect(getX402PremiumRoute(env, 'other-slug').error).toBeNull();
  });
});
