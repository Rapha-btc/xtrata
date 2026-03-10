import { describe, expect, it } from 'vitest';
import {
  buildX402AccessCookie,
  createX402AccessToken,
  getX402CookieValue,
  verifyX402AccessToken
} from '../x402-auth';

const SECRET = 'test-secret';
const ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';

describe('x402 auth helpers', () => {
  it('signs and verifies a valid access token', async () => {
    const token = await createX402AccessToken(
      {
        sub: ADDRESS,
        slug: 'premium-recursive-demo',
        assetId: '7',
        mode: 'commerce',
        iat: 1_700_000_000,
        exp: 4_700_000_000
      },
      SECRET
    );

    const payload = await verifyX402AccessToken(token, SECRET, 1_700_000_000 * 1000);
    expect(payload).toEqual({
      sub: ADDRESS,
      slug: 'premium-recursive-demo',
      assetId: '7',
      mode: 'commerce',
      iat: 1_700_000_000,
      exp: 4_700_000_000
    });
  });

  it('rejects tampered tokens', async () => {
    const token = await createX402AccessToken(
      {
        sub: ADDRESS,
        slug: 'premium-recursive-demo',
        assetId: '7',
        mode: 'vault',
        iat: 1_700_000_000,
        exp: 4_700_000_000
      },
      SECRET
    );
    const [payloadSegment, signatureSegment] = token.split('.');
    const replacement = signatureSegment.endsWith('a') ? 'b' : 'a';
    const tampered = `${payloadSegment}.${signatureSegment.slice(0, -1)}${replacement}`;

    await expect(
      verifyX402AccessToken(tampered, SECRET, 1_700_000_000 * 1000)
    ).resolves.toBeNull();
  });

  it('rejects expired tokens', async () => {
    const token = await createX402AccessToken(
      {
        sub: ADDRESS,
        slug: 'premium-recursive-demo',
        assetId: '7',
        mode: 'commerce',
        iat: 1_700_000_000,
        exp: 1_700_000_010
      },
      SECRET
    );

    await expect(
      verifyX402AccessToken(token, SECRET, 1_700_000_020 * 1000)
    ).resolves.toBeNull();
  });

  it('reads access cookies from requests', () => {
    const request = new Request('https://xtrata.xyz/demo/premium/premium-recursive-demo', {
      headers: {
        Cookie: buildX402AccessCookie({
          token: 'signed-token',
          secure: false
        })
      }
    });

    expect(getX402CookieValue(request)).toBe('signed-token');
  });
});
