import { describe, expect, it } from 'vitest';
import {
  isTransformableRuntimeModulePath,
  transformRuntimeModuleSource
} from '../../runtime/modules/source-transform';

describe('runtime module source transform', () => {
  it('rewrites relative audio worklet module URLs against import.meta.url', () => {
    const input =
      "await audioContext.audioWorklet.addModule('./processor_unified.js');";

    const output = transformRuntimeModuleSource(input);

    expect(output.changed).toBe(true);
    expect(output.source).toContain('const __xtrataResolveRuntimeModuleUrl');
    expect(output.source).toContain(
      "audioContext.audioWorklet.addModule(__xtrataResolveRuntimeModuleUrl('./processor_unified.js'))"
    );
  });

  it('rewrites relative worker constructor URLs against import.meta.url', () => {
    const input =
      "const worker = new Worker('../shared/processor.js', { type: 'module' });";

    const output = transformRuntimeModuleSource(input);

    expect(output.changed).toBe(true);
    expect(output.source).toContain(
      "new Worker(__xtrataResolveRuntimeModuleUrl('../shared/processor.js'), { type: 'module' })"
    );
  });

  it('rewrites root-relative worklet URLs through the runtime asset resolver helper', () => {
    const input =
      "await audioContext.audioWorklet.addModule('/System/shared/processor_unified.js');";

    const output = transformRuntimeModuleSource(input);

    expect(output.changed).toBe(true);
    expect(output.source).toContain('window.__xtrataResolveRuntimeAssetUrl');
    expect(output.source).toContain(
      "audioContext.audioWorklet.addModule(__xtrataResolveRuntimeModuleUrl('/System/shared/processor_unified.js'))"
    );
  });

  it('leaves untouched source without relative runtime loaders', () => {
    const input = "console.log('ok');";

    const output = transformRuntimeModuleSource(input);

    expect(output.changed).toBe(false);
    expect(output.source).toBe(input);
  });

  it('only transforms JavaScript module paths', () => {
    expect(isTransformableRuntimeModulePath('System/shared/plugin_core.js')).toBe(true);
    expect(isTransformableRuntimeModulePath('System/shared/module.mjs')).toBe(true);
    expect(isTransformableRuntimeModulePath('System/shared/engine.wasm')).toBe(false);
    expect(isTransformableRuntimeModulePath('System/shared/config.json')).toBe(false);
  });
});
