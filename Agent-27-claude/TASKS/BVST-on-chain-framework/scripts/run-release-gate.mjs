import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { bundleRoot, readJsonAt, writeJsonAt } from './_inscription-helpers.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const defaultReportPath = path.join(bundleRoot, 'verification', 'release-gate.report.json');

function parseArgs(argv) {
  const args = {
    withBrowserSmoke: false,
    withLiveQuote: false,
    out: defaultReportPath
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--with-browser-smoke') {
      args.withBrowserSmoke = true;
      continue;
    }
    if (arg === '--with-live-quote') {
      args.withLiveQuote = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --out');
      }
      args.out = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function runNodeScript(scriptPath, args = [], env = {}) {
  const startedAt = new Date().toISOString();
  await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env }
  });
  return { startedAt, finishedAt: new Date().toISOString() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const steps = [];

  const safetyArgs = [];
  if (args.withBrowserSmoke) safetyArgs.push('--with-browser-smoke');
  const safetyRun = await runNodeScript('TASKS/BVST-on-chain-framework/scripts/pre-inscription-safety-checks.mjs', safetyArgs, {
    XTRATA_BUNDLE_ROOT: bundleRoot
  });
  steps.push({
    name: 'pre_inscription_safety',
    status: 'passed',
    ...safetyRun,
    withBrowserSmoke: args.withBrowserSmoke,
    report: path.join(bundleRoot, 'verification', 'pre-inscription.report.json')
  });

  if (args.withLiveQuote) {
    const quoteRun = await runNodeScript('TASKS/BVST-on-chain-framework/scripts/preflight-quote.mjs', [], {
      XTRATA_BUNDLE_ROOT: bundleRoot
    });
    steps.push({
      name: 'live_quote_refresh',
      status: 'passed',
      ...quoteRun,
      report: path.join(bundleRoot, 'verification', 'preflight.quote.json')
    });
  }

  const statusRun = await runNodeScript(
    'TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs',
    ['--out', path.join(bundleRoot, 'verification', 'inscription-status.json')],
    { XTRATA_BUNDLE_ROOT: bundleRoot }
  );
  steps.push({
    name: 'status_refresh',
    status: 'passed',
    ...statusRun,
    report: path.join(bundleRoot, 'verification', 'inscription-status.json')
  });

  const simulationRun = await runNodeScript(
    'skills/xtrata-release-plan/scripts/xtrata-auto-inscribe.cjs',
    [bundleRoot, '--test-mode', 'simulate-release']
  );
  steps.push({
    name: 'auto_runner_simulation',
    status: 'passed',
    ...simulationRun,
    report: path.join(bundleRoot, 'verification', 'auto-inscribe-sim-run.json')
  });

  const safety = await readJsonAt(path.join(bundleRoot, 'verification', 'pre-inscription.report.json'));
  const status = await readJsonAt(path.join(bundleRoot, 'verification', 'inscription-status.json'));
  const simulation = await readJsonAt(path.join(bundleRoot, 'verification', 'auto-inscribe-sim-run.json'));
  const simulatedStatus = await readJsonAt(path.join(bundleRoot, 'verification', 'inscription-status.simulated.json'));
  const quote = await readJsonAt(path.join(bundleRoot, 'verification', 'preflight.quote.json'));

  const report = {
    generated_at: new Date().toISOString(),
    bundle_root: bundleRoot,
    summary: {
      status: 'passed',
      total_steps: steps.length,
      with_browser_smoke: args.withBrowserSmoke,
      with_live_quote: args.withLiveQuote
    },
    steps,
    readiness: {
      safety: safety.summary,
      live_status: status.summary,
      simulated_run: simulation.summary,
      simulated_status: simulatedStatus.summary,
      quote: {
        verifiedAt: quote.verifiedAt || null,
        feeUnitMicroStx: quote.quote?.feeUnitMicroStx || null,
        protocolFeeStx: quote.quote?.protocolFeeStx || null,
        liveMiningFeeStx: quote.quote?.miningFee?.live?.estimatedStx ?? null,
        predictedTokenRange: quote.quote?.predictedTokenRange || null
      }
    },
    artifacts: {
      safety_report: path.join(bundleRoot, 'verification', 'pre-inscription.report.json'),
      live_status: path.join(bundleRoot, 'verification', 'inscription-status.json'),
      simulated_status: path.join(bundleRoot, 'verification', 'inscription-status.simulated.json'),
      live_quote: path.join(bundleRoot, 'verification', 'preflight.quote.json'),
      simulation_run: path.join(bundleRoot, 'verification', 'auto-inscribe-sim-run.json'),
      simulation_events: path.join(bundleRoot, 'verification', 'auto-inscribe-sim-events.jsonl'),
      simulation_chain: path.join(bundleRoot, 'verification', 'auto-inscribe-sim-chain.jsonl'),
      simulation_failure: path.join(bundleRoot, 'verification', 'auto-inscribe-sim-failure.json')
    }
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await writeJsonAt(args.out, report);
  console.log(
    `BVST release gate passed: safety ${safety.summary.passed}/${safety.summary.passed + safety.summary.failed}, simulated ${simulation.summary.minted} minted, live queue ${status.summary.ready} ready / ${status.summary.blocked} blocked.`
  );
}

main().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    bundle_root: bundleRoot,
    summary: {
      status: 'failed'
    },
    error: {
      message: error.message || String(error),
      stack: error.stack || null
    }
  };
  try {
    await fs.mkdir(path.dirname(defaultReportPath), { recursive: true });
    await writeJsonAt(defaultReportPath, report);
  } catch {
    // Best effort only.
  }
  console.error(error);
  process.exitCode = 1;
});
