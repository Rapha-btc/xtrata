import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../content', () => ({
  fetchOnChainContent: vi.fn()
}));

import { fetchOnChainContent } from '../content';
import {
  extractRuntimeContentUrls,
  hasRuntimeContentUrls,
  inlineRuntimeContentUrls,
  parseRuntimeContentReference,
  replaceRuntimeContentUrls
} from '../runtime-inline';

const CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';

describe('viewer runtime inline', () => {
  const fetchOnChainContentMock = vi.mocked(fetchOnChainContent);

  beforeEach(() => {
    fetchOnChainContentMock.mockReset();
  });

  it('extracts unique runtime content urls from html', () => {
    const first = `/runtime/content?contractId=${CONTRACT_ID}&tokenId=283&network=mainnet`;
    const second = `/runtime/content?contractId=${CONTRACT_ID}&tokenId=284&network=mainnet`;
    const html = `
      <link rel="stylesheet" href="${first}">
      <script type="module">
        import { createCicada } from '${second}';
        console.log('${first}');
      </script>
    `;

    expect(extractRuntimeContentUrls(html)).toEqual([first, second]);
    expect(hasRuntimeContentUrls(html)).toBe(true);
    expect(hasRuntimeContentUrls('<p>No runtime urls here.</p>')).toBe(false);
  });

  it('parses runtime content references including fallback contract ids', () => {
    const rawUrl =
      `/runtime/content?contractId=${CONTRACT_ID}` +
      '&tokenId=285&network=mainnet' +
      `&fallbackContractId=${CONTRACT_ID.replace('v2-1-0', 'v1-1-1')}`;

    expect(parseRuntimeContentReference(rawUrl)).toEqual({
      rawUrl,
      contractId: CONTRACT_ID,
      tokenId: 285n,
      fallbackContractId:
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
    });
  });

  it('replaces all matched runtime urls', () => {
    const rawUrl = `/runtime/content?contractId=${CONTRACT_ID}&tokenId=283&network=mainnet`;
    const html = `<link href="${rawUrl}"><script>console.log("${rawUrl}")</script>`;

    expect(
      replaceRuntimeContentUrls(
        html,
        new Map([[rawUrl, 'data:text/css;base64,Ym9keXt9']])
      )
    ).toBe(
      '<link href="data:text/css;base64,Ym9keXt9"><script>console.log("data:text/css;base64,Ym9keXt9")</script>'
    );
  });

  it('inlines runtime content urls as data uris', async () => {
    const styleUrl = `/runtime/content?contractId=${CONTRACT_ID}&tokenId=283&network=mainnet`;
    const moduleUrl = `/runtime/content?contractId=${CONTRACT_ID}&tokenId=284&network=mainnet`;
    const client = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn(async (id: bigint) => {
        if (id === 283n) {
          return {
            owner: 'SPTEST',
            creator: null,
            mimeType: 'text/css',
            totalSize: 11n,
            totalChunks: 1n,
            sealed: true,
            finalHash: new Uint8Array([0])
          };
        }
        return {
          owner: 'SPTEST',
          creator: null,
          mimeType: 'text/javascript',
          totalSize: 29n,
          totalChunks: 1n,
          sealed: true,
          finalHash: new Uint8Array([0])
        };
      })
    } as any;
    fetchOnChainContentMock.mockImplementation(async ({ id }) => {
      if (id === 283n) {
        return new TextEncoder().encode('body{color:red}');
      }
      return new TextEncoder().encode('export const createCicada = 1;');
    });

    const html = `
      <link rel="stylesheet" href="${styleUrl}">
      <script type="module">
        import { createCicada } from '${moduleUrl}';
        console.log(createCicada);
      </script>
    `;

    const result = await inlineRuntimeContentUrls({
      html,
      client
    });

    expect(result).not.toContain('/runtime/content?');
    expect(result).toContain('<style data-xtrata-inline-runtime="true">');
    expect(result).toContain('body{color:red}');
    expect(result).toContain(
      "const { createCicada } = await import('data:text/javascript;base64,ZXhwb3J0IGNvbnN0IGNyZWF0ZUNpY2FkYSA9IDE7')"
    );
    expect(client.getInscriptionMeta).toHaveBeenCalledTimes(2);
    expect(fetchOnChainContentMock).toHaveBeenCalledTimes(2);
  });

  it('resolves template-literal token ids before inlining runtime imports', async () => {
    const loaderUrl =
      `/runtime/content?contractId=${CONTRACT_ID}&tokenId=\${LOADER_ID}&network=mainnet`;
    const client = {
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      getInscriptionMeta: vi.fn(async (id: bigint) => ({
        owner: 'SPTEST',
        creator: null,
        mimeType: 'text/javascript',
        totalSize: 17n,
        totalChunks: 1n,
        sealed: true,
        finalHash: new Uint8Array([0])
      }))
    } as any;
    fetchOnChainContentMock.mockResolvedValue(
      new TextEncoder().encode('export const k = 1;')
    );

    const html = `
      <script type="module">
        const LOADER_ID = Number('285');
        const mod = await import(\`${loaderUrl}\`);
        console.log(mod);
      </script>
    `;

    const result = await inlineRuntimeContentUrls({
      html,
      client
    });

    expect(result).not.toContain('/runtime/content?');
    expect(result).toContain('const LOADER_ID = Number(\'285\')');
    expect(result).toContain(
      'await import(`data:text/javascript;base64,ZXhwb3J0IGNvbnN0IGsgPSAxOw==`)'
    );
    expect(client.getInscriptionMeta).toHaveBeenCalledWith(
      285n,
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
  });
});
