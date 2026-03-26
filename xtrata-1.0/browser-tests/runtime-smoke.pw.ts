import { expect, test, type Page } from '@playwright/test';
import {
  buildRuntimeSmokeHarnessUrl,
  buildRuntimeUrl,
  resolveRuntimeSmokeTarget
} from './runtime-target';

type SmokeSummary = {
  status: 'pending' | 'pass' | 'fail';
  primaryFailure: string | null;
  milestoneCounts: {
    passed: number;
    total: number;
  };
  milestones: Record<string, boolean>;
};

const resolveSummary = async (page: Page) =>
  page.evaluate(() => {
    const runtimeSmoke = (window as typeof window & {
      __xtrataRuntimeSmoke?: {
        getSummary: () => SmokeSummary;
        getEvents: () => unknown[];
      };
    }).__xtrataRuntimeSmoke;
    return {
      summary: runtimeSmoke?.getSummary() || null,
      events: runtimeSmoke?.getEvents() || []
    };
  });

test.describe('runtime smoke harness', () => {
  test('loads RetroKeys runtime through the smoke harness', async ({
    page,
    baseURL
  }, testInfo) => {
    test.setTimeout(180_000);

    if (!baseURL) {
      throw new Error('Missing Playwright baseURL.');
    }

    const target = resolveRuntimeSmokeTarget();
    const harnessUrl = buildRuntimeSmokeHarnessUrl(baseURL, target);
    const runtimeUrl = buildRuntimeUrl(baseURL, target);
    const consoleMessages: string[] = [];

    page.on('console', (message) => {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });

    await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#runtime-url')).toHaveValue(runtimeUrl);

    await page.waitForFunction(() => {
      const runtimeSmoke = (window as typeof window & {
        __xtrataRuntimeSmoke?: {
          getSummary: () => SmokeSummary;
        };
      }).__xtrataRuntimeSmoke;
      if (!runtimeSmoke) {
        return false;
      }
      const summary = runtimeSmoke.getSummary();
      return summary.status === 'pass' || summary.status === 'fail';
    }, undefined, { timeout: 150_000 });

    const snapshot = await resolveSummary(page);

    await testInfo.attach('runtime-smoke-summary.json', {
      body: JSON.stringify(
        {
          harnessUrl,
          runtimeUrl,
          target,
          ...snapshot
        },
        null,
        2
      ),
      contentType: 'application/json'
    });

    if (consoleMessages.length > 0) {
      await testInfo.attach('runtime-smoke-console.log', {
        body: consoleMessages.join('\n'),
        contentType: 'text/plain'
      });
    }

    expect(snapshot.summary).not.toBeNull();
    expect(snapshot.summary?.status).toBe('pass');
    expect(snapshot.summary?.primaryFailure).toBeNull();
    expect(snapshot.summary?.milestones.diagnosticsInstalled).toBe(true);
    expect(snapshot.summary?.milestones.patchLoaded).toBe(true);
    expect(snapshot.summary?.milestones.manifestLoaded).toBe(true);
    expect(snapshot.summary?.milestones.audioContextRunning).toBe(true);
    expect(snapshot.summary?.milestones.workletRequested).toBe(true);
    expect(snapshot.summary?.milestones.workletLoaded).toBe(true);
    expect(snapshot.summary?.milestones.workletNodeCreated).toBe(true);

    if (target.expectedText) {
      await expect(page.frameLocator('#runtime-frame').locator('body')).toContainText(
        target.expectedText
      );
    }
  });
});
