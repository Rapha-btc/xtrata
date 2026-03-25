const fs = require('fs');
const path = require('path');
const {
  INSCRIPTION_ARCHIVE_DIR,
  CONTEXT_EXCLUDE_PATTERNS
} = require('./config');

// AGENTs.md byte caps per pack type:
// - research: only needs identity + journal schema + fee model (~2000B)
// - compose/inscribe: needs full file for recursive structure + HTML spec (~5000B)
const AGENTS_MD_CAPS = { research: 2000, compose: 5000, inscription: 5000 };

function defaultPack(pack) {
  return [
    { path: 'data/repo-memory/context-summary.md', maxBytes: 1800 },
    { path: 'AGENTs.md', maxBytes: AGENTS_MD_CAPS[pack] || 5000 },
    { path: 'CLAUDE.md', maxBytes: 2200 },
    { path: 'dashboard/config.js', maxBytes: 2200 }
  ];
}

const PACKS = {
  research: {
    // Lean pack: balance/chain state lives in context-summary.md (already in DEFAULT_PACK).
    // EVOLUTION.md and future-inscription-ideas.md are compose-time concerns only.
    // repo-notes and change-requests are injected conditionally via extraFiles when needed.
    files: [
      { path: 'research-buffer.md', maxBytes: 4000 },
      { path: 'ledger.md', maxBytes: 2800 },
      { path: 'data/repo-memory/README.md', maxBytes: 1800 },
      { path: 'data/repo-memory/repo-map.md', maxBytes: 2400 }
    ],
    archiveCount: 2,
    notes: [
      'Use only the files below as your first-pass context.',
      'Economics (balance, runway, fee-unit) are in context-summary.md — do not re-query the chain unless that data is stale (older than 4 hours).',
      'For repo self-awareness, read data/repo-memory/ first and treat it as the durable local memory layer.',
      'Only inspect code files when a concrete repo hypothesis or failure requires validation, then update repo-memory with a concise summary.',
      'Do not scan logs, legacy material, node_modules, lockfiles, or runtime JSON unless one specific file is required.',
      'Mirror Protocol: write a 3-sentence summary of the prior entry thesis in your buffer update — do not read the full archive HTML unless you need a specific quote.'
    ]
  },
  // research pack variant with repo-memory write files (injected when change-requests are open)
  researchWithRepo: {
    files: [
      { path: 'research-buffer.md', maxBytes: 4000 },
      { path: 'ledger.md', maxBytes: 2800 },
      { path: 'data/repo-memory/README.md', maxBytes: 1800 },
      { path: 'data/repo-memory/repo-map.md', maxBytes: 2400 },
      { path: 'data/repo-memory/repo-notes.md', maxBytes: 2600 },
      { path: 'data/repo-memory/change-requests.md', maxBytes: 2400 }
    ],
    archiveCount: 2,
    notes: [
      'Use only the files below as your first-pass context.',
      'Economics (balance, runway, fee-unit) are in context-summary.md — do not re-query the chain unless that data is stale (older than 4 hours).',
      'For repo self-awareness, read data/repo-memory/ first and treat it as the durable local memory layer.',
      'Only inspect code files when a concrete repo hypothesis or failure requires validation, then update repo-memory with a concise summary.',
      'Do not scan logs, legacy material, node_modules, lockfiles, or runtime JSON unless one specific file is required.',
      'Mirror Protocol: write a 3-sentence summary of the prior entry thesis in your buffer update — do not read the full archive HTML unless you need a specific quote.',
      'Open change-requests.md and repo-notes.md are included — review and update them as part of repo self-awareness.'
    ]
  },
  compose: {
    files: [
      { path: 'research-buffer.md', maxBytes: 4500 },
      { path: 'ledger.md', maxBytes: 2500 },
      { path: 'EVOLUTION.md', maxBytes: 2200 },
      { path: 'future-inscription-ideas.md', maxBytes: 2200 }
    ],
    archiveCount: 3,
    notes: [
      'Start from the files below and only open one archived entry if Mirror Protocol needs a direct comparison.',
      'Do not inspect logs, runtime JSON, or legacy experiments during compose.'
    ]
  },
  inscription: {
    files: [
      { path: 'ledger.md', maxBytes: 2000 },
      { path: 'scripts/inscribe-entry.cjs', maxBytes: 4200 }
    ],
    archiveCount: 0,
    notes: [
      'Treat scripts/inscribe-entry.cjs as the canonical SDK inscription path.',
      'Validate only the newest draft in inscriptions/ before broadcasting.'
    ]
  },
  outreachResearch: {
    files: [
      { path: 'research-buffer.md', maxBytes: 2400 },
      { path: 'data/runtime/registered-agents.json', maxBytes: 2000 },
      { path: 'data/outreach/draft.json', maxBytes: 1800 },
      { path: 'data/outreach/agent-memory.json', maxBytes: 2200 },
      { path: 'docs/agent-27-ambassador-brief.md', maxBytes: 2200 },
      { path: 'docs/aibtc-agent-comms-prompt.md', maxBytes: 3200 }
    ],
    archiveCount: 0,
    notes: [
      'Keep outreach research narrow: agent profile, ambassador brief, recent research, and recent conversation memory.',
      'Prefer reply or follow-up logic when a thread already exists or an inbound message is present.',
      'Draft one actionable message with a clear next step.'
    ]
  },
  outreachSend: {
    files: [
      { path: 'data/outreach/draft.json', maxBytes: 2000 },
      { path: 'data/outreach/agent-memory.json', maxBytes: 2200 },
      { path: 'docs/agent-27-ambassador-brief.md', maxBytes: 2200 },
      { path: 'data/runtime/registered-agents.json', maxBytes: 2000 },
      { path: 'docs/aibtc-agent-comms-prompt.md', maxBytes: 2600 }
    ],
    archiveCount: 0,
    notes: [
      'Only use the saved outreach draft, ambassador brief, recent conversation memory, and agent registry for this send.',
      'Treat the draft mode as authoritative: intro, reply, or follow-up.'
    ]
  }
};

function uniqFileSpecs(fileSpecs) {
  const seen = new Set();
  const ordered = [];

  for (const spec of fileSpecs) {
    const key = spec.path;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(spec);
  }

  return ordered;
}

function readFileSnippet(absPath, maxBytes) {
  try {
    // Strip null bytes and control chars (except \n \r \t) — some registry
    // entries contain binary prefixes that crash spawn() via args.
    const raw = fs.readFileSync(absPath, 'utf8')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    if (Buffer.byteLength(raw, 'utf8') <= maxBytes) return raw;

    let snippet = raw;
    while (Buffer.byteLength(snippet, 'utf8') > maxBytes && snippet.length > 0) {
      snippet = snippet.slice(0, Math.max(0, snippet.length - 200));
    }

    return `${snippet}\n\n[truncated to ${maxBytes} bytes]`;
  } catch (err) {
    if (err.code === 'ENOENT') return '[missing]';
    return `[error reading file: ${err.message}]`;
  }
}

function listArchiveCandidates(limit) {
  try {
    return fs.readdirSync(INSCRIPTION_ARCHIVE_DIR)
      .filter((file) => file.endsWith('.html'))
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

function buildContextPack({ workdir, pack = 'research', extraFiles = [] }) {
  const selected = PACKS[pack] || PACKS.research;
  const fileSpecs = uniqFileSpecs([
    ...defaultPack(pack),
    ...selected.files,
    ...extraFiles.map((filePath) => ({ path: filePath, maxBytes: 2000 }))
  ]);

  const sections = [
    'Context boundary:',
    ...selected.notes.map((note) => `- ${note}`),
    `- Excluded by default: ${CONTEXT_EXCLUDE_PATTERNS.join(', ')}`
  ];

  const archiveCandidates = listArchiveCandidates(selected.archiveCount || 0);
  if (archiveCandidates.length > 0) {
    sections.push(`Archive candidates:\n- ${archiveCandidates.join('\n- ')}`);
  }

  for (const spec of fileSpecs) {
    const absPath = path.join(workdir, spec.path);
    const snippet = readFileSnippet(absPath, spec.maxBytes);
    sections.push(`File: ${spec.path}\n\`\`\`\n${snippet}\n\`\`\``);
  }

  return {
    name: pack,
    files: fileSpecs.map((spec) => spec.path),
    excluded: CONTEXT_EXCLUDE_PATTERNS.slice(),
    summary: `${pack} pack: ${fileSpecs.map((spec) => spec.path).join(', ')}`,
    prompt: sections.join('\n\n')
  };
}

module.exports = { PACKS, buildContextPack };
