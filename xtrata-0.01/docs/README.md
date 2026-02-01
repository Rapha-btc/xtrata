Xtrata v15.1 — Recursive Inscription Data Layer for Bitcoin L2

⸻

What is Xtrata?

Xtrata is a contract-driven, on-chain data layer for Bitcoin Layer-2 (Stacks).

It is designed to make large, permanent, composable data practical on Bitcoin L2 — not just images or metadata, but entire applications, media engines, and recursive software modules.

Where Ordinals treat inscriptions as isolated artefacts, Xtrata treats them as
structured, addressable data blocks that are designed to be reused, referenced, and rebuilt on-chain.

A single Xtrata inscription can be as large as a Bitcoin block, uploaded in chunks, sealed immutably, and reconstructed deterministically by any client — forever.

⸻

Why Xtrata exists

Bitcoin has permanence.
Stacks brings programmability.

What has been missing is a native data layer that can operate at scale without relying on:
	•	IPFS
	•	Arweave
	•	centralized gateways
	•	off-chain mirrors

Xtrata fills that gap.

It enables:
	•	100× faster inscription reads via batching
	•	100× cheaper uploads compared to naïve ordinal-style writes
	•	deterministic reconstruction of large on-chain datasets
	•	recursion-first application design

This makes an entirely new class of Bitcoin-secured applications viable.

⸻

Recursion-first by design

Xtrata is built on the assumption that everything will be reused.

Inscriptions are not treated as static blobs, but as modules:
	•	audio engines referencing audio engines
	•	media referencing media
	•	applications built from other applications
	•	datasets composed from smaller datasets

This is the architectural foundation that enables complex, modular, on-chain applications and recursive media formats.

Recursion is not bolted on — it is the default posture of the system.

⸻

SIP-009 compatible — but not limited by it

Xtrata is fully SIP-009 compliant, meaning:
	•	standard NFT collections work out of the box
	•	wallets and marketplaces can index ownership normally
	•	no secondary platforms or metadata hosts are required

However, SIP-009 is treated as a compatibility layer, not the ceiling.

The same contracts and tooling power:
	•	conventional NFT collections
	•	recursive media
	•	application-level inscriptions
	•	large, block-scale on-chain datasets

All resolve from on-chain data.

⸻

What’s in this repo

This repository contains:
	•	the Xtrata smart contracts
	•	a single-page web app for minting, viewing, and managing inscriptions
	•	batch upload and sealing logic
	•	deterministic chunk reconstruction
	•	viewer support for large audio and video inscriptions

The UI is built with Vite + React + TypeScript and drives:
	•	contract reads/writes
	•	batch chunk uploads
	•	sealed inscription workflows
	•	adaptive read strategies for cost and performance

⸻

Release notes
	•	docs/release-notes-xtrata-v1.1.0.md

⸻

Requirements
	•	Node.js 18+

⸻

Setup

npm install
npm run dev


⸻

Tests

npm test

Clarinet contract tests:

npm run test:clarinet

Contract trait sync and validation:

npm run contracts:sync
npm run contracts:verify


⸻

Design notes
	•	Inscriptions are immutable once sealed.
	•	Uploads are chunked, resumable, and purgeable if abandoned.
	•	Reads prefer batch access, with adaptive fallback to per-chunk reads.
	•	Large media previews buffer initial data and stream the remainder on demand.
	•	IndexedDB is used for local caching (clearable via the Viewer panel).

⸻

Local dev API proxy (CORS)

Vite proxies Hiro API endpoints to avoid CORS issues:
	•	/hiro/testnet
	•	/hiro/mainnet

Optional:
	•	set HIRO_API_KEY in .env.local to reduce 429 rate limits

Override endpoints if required:
	•	VITE_STACKS_API_TESTNET
	•	VITE_STACKS_API_MAINNET

⸻

Debug logging

Granular tagged logging is available for deep inspection:

localStorage.setItem('xtrata.log.level', 'debug')
localStorage.setItem('xtrata.log.tags', 'chunk,preview,token-uri,stream,cache,tab,mint')
localStorage.setItem('xtrata.log.enabled', 'true')

Or via env vars:

VITE_LOG_LEVEL=debug
VITE_LOG_TAGS=chunk,preview,token-uri,stream,cache,tab,mint
VITE_LOG_ENABLED=true


⸻

The bigger picture

Xtrata is intended to become boring infrastructure:
a dependable, permanent data substrate for Bitcoin-secured applications.

If Bitcoin is the settlement layer, and Stacks is the execution layer,
Xtrata is the memory layer.

⸻

