import { describe, expect, it } from 'vitest';
import { injectRecursiveBridgeHtml } from '../recursive';

describe('recursive bridge html injection', () => {
  it('injects bridge script into head', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-1');
    expect(result).toContain('data-xtrata-runtime-diagnostics');
    expect(result).toContain('data-xtrata-runtime-module-bootstrap');
    expect(result).toContain('data-xtrata-bridge');
    expect(result.indexOf('data-xtrata-runtime-diagnostics')).toBeLessThan(
      result.indexOf('data-xtrata-runtime-module-bootstrap')
    );
    expect(result.indexOf('data-xtrata-runtime-module-bootstrap')).toBeLessThan(
      result.indexOf('data-xtrata-bridge')
    );
    expect(result.indexOf('data-xtrata-bridge')).toBeLessThan(
      result.indexOf('</head>')
    );
  });

  it('injects bridge script into body when head is missing', () => {
    const html = '<html><body><div>Hi</div></body></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-2');
    expect(result).toContain('data-xtrata-runtime-diagnostics');
    expect(result).toContain('data-xtrata-runtime-module-bootstrap');
    expect(result).toContain('data-xtrata-bridge');
    expect(result.indexOf('data-xtrata-bridge')).toBeLessThan(
      result.indexOf('<div>Hi</div>')
    );
  });

  it('avoids duplicate injection', () => {
    const html =
      '<html><head><script data-xtrata-runtime-diagnostics="true"></script><script data-xtrata-runtime-module-bootstrap="true"></script><script data-xtrata-bridge="true"></script></head></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-3');
    const bridgeMatches = result.match(/data-xtrata-bridge/g) ?? [];
    const diagnosticsMatches = result.match(/data-xtrata-runtime-diagnostics/g) ?? [];
    const bootstrapMatches =
      result.match(/data-xtrata-runtime-module-bootstrap/g) ?? [];
    expect(bridgeMatches).toHaveLength(1);
    expect(diagnosticsMatches).toHaveLength(1);
    expect(bootstrapMatches).toHaveLength(1);
  });

  it('falls back to native fetch on bridge contract mismatch', () => {
    const html = '<html><head><title>Fallback</title></head><body></body></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-4');
    expect(result).toContain("cause === 'Contract mismatch' && originalFetch");
    expect(result).toContain('return originalFetch(input, init);');
  });
});
