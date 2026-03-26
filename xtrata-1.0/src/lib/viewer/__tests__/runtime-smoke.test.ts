import { describe, expect, it } from 'vitest';
import { summarizeRuntimeSmoke } from '../runtime-smoke';

describe('runtime smoke summary', () => {
  it('marks a healthy runtime chain as pass', () => {
    const summary = summarizeRuntimeSmoke([
      { message: 'Runtime diagnostics installed' },
      { message: 'Runtime module bootstrap installed' },
      {
        message: 'Tracked fetch completed',
        detail: {
          responseUrl: 'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/patch.json'
        }
      },
      {
        message: 'Tracked fetch completed',
        detail: {
          responseUrl: 'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/manifest.json'
        }
      },
      {
        message: 'AudioContext created',
        detail: {
          state: 'running'
        }
      },
      { message: 'AudioWorklet.addModule called' },
      { message: 'AudioWorklet.addModule resolved' },
      { message: 'AudioWorkletNode created' },
      {
        message: 'AudioNode connect',
        detail: {
          destination: 'AudioDestinationNode'
        }
      }
    ]);

    expect(summary.status).toBe('pass');
    expect(summary.primaryFailure).toBeNull();
    expect(summary.milestones.workletLoaded).toBe(true);
    expect(summary.milestones.destinationConnected).toBe(true);
  });

  it('marks a worklet failure as fail', () => {
    const summary = summarizeRuntimeSmoke([
      { message: 'Runtime diagnostics installed' },
      { message: 'AudioWorklet.addModule called' },
      {
        message: 'AudioWorklet.addModule failed',
        detail: {
          error: "Unable to load a worklet's module."
        }
      }
    ]);

    expect(summary.status).toBe('fail');
    expect(summary.primaryFailure).toContain('Unable to load a worklet');
  });

  it('stays pending while milestones are incomplete and there is no failure', () => {
    const summary = summarizeRuntimeSmoke([
      { message: 'Runtime diagnostics installed' },
      { message: 'AudioContext created', detail: { state: 'running' } }
    ]);

    expect(summary.status).toBe('pending');
    expect(summary.primaryFailure).toBeNull();
  });
});
