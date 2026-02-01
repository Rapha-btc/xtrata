import { describe, expect, it } from 'vitest';
import { injectRecursiveBridgeHtml } from '../recursive';

describe('recursive bridge html injection', () => {
  it('injects bridge script into head', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-1');
    expect(result).toContain('data-xtrata-bridge');
    expect(result.indexOf('data-xtrata-bridge')).toBeLessThan(
      result.indexOf('</head>')
    );
  });

  it('injects bridge script into body when head is missing', () => {
    const html = '<html><body><div>Hi</div></body></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-2');
    expect(result).toContain('data-xtrata-bridge');
    expect(result.indexOf('data-xtrata-bridge')).toBeLessThan(
      result.indexOf('<div>Hi</div>')
    );
  });

  it('avoids duplicate injection', () => {
    const html = '<html><head><script data-xtrata-bridge="true"></script></head></html>';
    const result = injectRecursiveBridgeHtml(html, 'bridge-3');
    const matches = result.match(/data-xtrata-bridge/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
