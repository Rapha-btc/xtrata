import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('runtime launcher html', () => {
  it('does not embed a literal closing script tag inside the inline module instrumenter', () => {
    const launcherHtml = fs.readFileSync(
      path.resolve(process.cwd(), 'public/runtime/index.html'),
      'utf8'
    );
    const start = launcherHtml.indexOf(
      'function instrumentInlineModuleScripts(html)'
    );
    const end = launcherHtml.indexOf('function buildRuntimeBaseTag(params)');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const section = launcherHtml.slice(start, end);
    expect(section).not.toContain("'</script>'");
    expect(section).toContain("'</' +");
    expect(section).toContain("'script>'");
  });
});
