#!/usr/bin/env node
// Generates the v3.2.3 announcement inscription with perfectly-aligned ASCII
// diagrams. Run: node scripts/gen-announcement.mjs
import { writeFileSync } from 'node:fs';

const W = 50; // inner width of layered boxes
const pad = (s) => {
  if (s.length > W) throw new Error(`too long (${s.length}>${W}): ${s}`);
  return s + ' '.repeat(W - s.length);
};
const box = (lines) => {
  const top = '┌' + '─'.repeat(W + 2) + '┐';
  const bot = '└' + '─'.repeat(W + 2) + '┘';
  const body = lines.map((l) => `│ ${pad(l)} │`);
  return [top, ...body, bot];
};
const arrow = (label) => {
  const col = Math.floor((W + 4) / 2);
  return [' '.repeat(col) + '│', ' '.repeat(col - label.length - 1) + label + ' ▼'];
};
const block = (arr) => arr.join('\n');

const stack = block([
  ...box(['X T R A T A   —   data layer', '', 'the bytes themselves: hash-bound, on-chain']),
  ...arrow('writes into'),
  ...box(['S T A C K S   —   execution layer', '', 'Clarity contracts · abundant, cheap blockspace']),
  ...arrow('settles to / anchored by'),
  ...box(['B I T C O I N   —   settlement layer', '', 'scarce, final, permanent blockspace'])
]);

const lineage = block([
  '   v1-1-1   ───────▶   v2-1-0   ───────▶   v3-2-3',
  '   (begin)            (grow)              (now)',
  '      │                  │                   ▲',
  '      └──────────────────┴─── migrate ───────┘',
  '          legacy tokens carried forward,',
  '          same id · owner · content · lineage'
]);

const fees = block([
  '  BITCOIN BLOCK            STACKS BLOCKS  (one BTC block, many)',
  '  ┌───────────┐            ┌──────┐┌──────┐┌──────┐┌──────┐',
  '  │  scarce   │  ◀ anchor ─│ room ││ room ││ room ││ room │',
  '  │  costly   │            └──────┘└──────┘└──────┘└──────┘',
  '  │  final    │            cheap space for data and logic,',
  '  └───────────┘            inheriting Bitcoin settlement'
]);

const pointerW = 28;
const padR = (s) => s + ' '.repeat(Math.max(0, pointerW - s.length));
const L = [
  'CONVENTIONAL TOKEN', '──────────────────', 'token',
  '  │ points to', '  ▼', 'a link to a file',
  '  │ which lives on', '  ▼', 'someone\'s server',
  '  │', '  ▼', 'can move · rot · vanish'
];
const R = [
  'XTRATA INSCRIPTION', '──────────────────', 'token',
  '  │ contains', '  ▼', 'the bytes themselves',
  '  │ verified by', '  ▼', 'a hash sealed on-chain',
  '  │', '  ▼', 'permanent while the chain lives'
];
const pointer = block(L.map((l, i) => '  ' + padR(l) + (R[i] ?? '')));

const anatomy = block([
  '  your content',
  '       │  split into fixed 16 KiB chunks',
  '       ▼',
  '  [ chunk 1 ][ chunk 2 ]  ...  [ chunk n ]',
  '       │  folded into one running hash',
  '       ▼',
  '  final hash   0x16261baf…',
  '       │  sealed by the contract',
  '       ▼',
  '  token #N   — provably the bytes you wrote'
]);

const md = `# Xtrata — Sealing the v3 Core

Stacks mainnet. The Xtrata core advances to its third generation. This
inscription is a permanent on-chain record of that moment, written by the
network into itself.

## The chain of three

Xtrata's canonical core has moved through three contracts, all deployed by
\`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X\`. This is the line; nothing else is
part of it.

\`\`\`
${lineage}
\`\`\`

Each generation carried the work of the one before it forward without breaking
it. \`xtrata-v3-2-3\` is now the contract on which new Xtrata inscriptions are
made. The earlier cores remain live and readable forever, and any of their
tokens can be migrated into v3 — preserving the original id, ownership, content,
and lineage. Nothing is left behind; the past is brought forward intact.

## The three layers beneath it

Xtrata is a data layer. It does not stand alone — it stands on Stacks, which
stands on Bitcoin. Each layer does one job well.

\`\`\`
${stack}
\`\`\`

Bitcoin provides settlement: the most secure, most permanent blockspace there
is — and, because it is scarce, the most expensive. Stacks provides execution:
programmable Clarity contracts in abundant, low-cost blockspace, with every
block anchored back to Bitcoin. Xtrata uses that arrangement to do something
Bitcoin alone makes costly and Stacks alone makes possible: store real data,
permanently, affordably.

## Blockspace and fees

Permanence is a function of blockspace, and blockspace is scarce by design — that
scarcity is what makes it trustworthy. Writing raw data directly into Bitcoin
competes for its small, costly blocks. Stacks settles to Bitcoin while offering
far more room of its own, so data can be written cheaply and still inherit
Bitcoin-anchored finality.

\`\`\`
${fees}
\`\`\`

Xtrata is built for that economy: content is committed in fixed chunks so large
works fit within block limits, and small works can be sealed in a single
transaction.

## On-chain data, not a pointer to it

Most tokens point outward — to a link, to a file on a server that can move, rot,
or disappear. Xtrata keeps the bytes themselves on the chain, bound to a hash, so
what is read back is provably what was written.

\`\`\`
${pointer}
\`\`\`

## Anatomy of an inscription

\`\`\`
${anatomy}
\`\`\`

Content is reconstructable by anyone, for as long as the chain exists.
Inscriptions can also declare dependencies and parents, so relationship and
meaning survive alongside the raw data, and identical content is allowed to live
in many places at once — because the same bytes can honestly belong to different
people, editions, and contexts.

## Why this is inscribed

A network is only permanent if its history is permanent. By inscribing its own
upgrade — naming the three contracts, recording the handover, marking the
continuity — Xtrata makes its evolution part of the very ledger it maintains.
There is no separate changelog to trust, no off-chain note to lose. The record is
the network, and the network is the record.

If Xtrata becomes a lasting place for data on Bitcoin, let this be one of the
early stones in that wall: a deliberate, legible marker of where the work came
from and where it now lives.

## Sealed

Written as the first native inscription on \`xtrata-v3-2-3\`, after the continuity
offset was set and after migration from both prior cores was proven on mainnet.

\`\`\`
   xtrata-v1-1-1  ──▶  xtrata-v2-1-0  ──▶  xtrata-v3-2-3
\`\`\`

From here forward, Xtrata is written on \`xtrata-v3-2-3\`.
`;

writeFileSync(new URL('../docs/mainnet-v3.2.3-announcement-inscription.md', import.meta.url), md);
console.log('Wrote docs/mainnet-v3.2.3-announcement-inscription.md');
console.log('Bytes:', Buffer.byteLength(md, 'utf8'));
