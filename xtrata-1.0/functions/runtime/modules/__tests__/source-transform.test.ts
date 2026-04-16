import { describe, expect, it } from 'vitest';
import {
  isTransformableRuntimeModulePath,
  transformRuntimeModuleSource
} from '../source-transform';

describe('runtime module source transform', () => {
  it('detects transformable runtime module paths', () => {
    expect(isTransformableRuntimeModulePath('System/shared/standalone_bridge.js')).toBe(true);
    expect(isTransformableRuntimeModulePath('System/shared/bvst_unified_bg.wasm')).toBe(false);
  });

  it('rewrites addModule and worker urls through runtime module helper', () => {
    const source = `
      async function boot(audioContext) {
        await audioContext.audioWorklet.addModule('./processor_unified.js');
        return new Worker('/System/shared/processor_unified.js');
      }
    `;
    const result = transformRuntimeModuleSource(source);
    expect(result.changed).toBe(true);
    expect(result.source).toContain('__xtrataResolveRuntimeModuleUrl');
    expect(result.source).toContain(
      "audioContext.audioWorklet.addModule(__xtrataResolveRuntimeModuleUrl('./processor_unified.js'))"
    );
    expect(result.source).toContain(
      "new Worker(__xtrataResolveRuntimeModuleUrl('/System/shared/processor_unified.js'))"
    );
  });

  it('rewrites window.location.href URL bases to prefer document.baseURI', () => {
    const source = `
      function withCacheBust(url) {
        const abs = new URL(url, window.location.href);
        return abs.toString();
      }
      function resolve(relPath) {
        const base = new URL(this.manifestUrl, window.location.href);
        return new URL(relPath, base).toString();
      }
    `;
    const result = transformRuntimeModuleSource(source);
    expect(result.changed).toBe(true);
    expect(result.source).toContain('__xtrataResolveRuntimeDocumentBase()');
    expect(result.source).toContain(
      'new URL(url, __xtrataResolveRuntimeDocumentBase())'
    );
    expect(result.source).toContain(
      'new URL(this.manifestUrl, __xtrataResolveRuntimeDocumentBase())'
    );
  });
});
