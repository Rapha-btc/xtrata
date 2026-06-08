# Xtrata Collection Manifest Standard

Status: Draft standard  
Target audience: marketplaces, indexers, wallets, artists, archivists, launch partners, protocol developers, preservation teams  
Recommended location: `docs/standards/xtrata-collection-manifest-standard.md`

## 1. Purpose and Overview

An Xtrata Collection Manifest is the canonical control document for an Xtrata-backed collection.

It is not just NFT metadata. It is the structured, hash-verifiable, machine-readable and human-readable document that defines what a collection is, where its assets live, how each item maps to Xtrata inscriptions or source assets, how the collection can be reconstructed, how marketplaces should display it, how provenance is preserved, how creators and contributors are credited, how rights are represented, and how future tools can safely integrate with it.

The manifest is intended to provide boring infrastructure for wild data: strict, predictable structure for complex creative, historical, generative, musical, audiovisual and software-like collections.

An Xtrata Collection Manifest SHOULD be one of:

- directly inscribed as an Xtrata inscription;
- referenced by an Xtrata-inscribed manifest pointer whose hash identifies the exact document;
- stored in a content-addressed external system and referenced from an Xtrata inscription, resolver contract, launch record or collection metadata record.

The preferred long-term pattern is that the canonical manifest is itself reconstructable from Xtrata or cryptographically bound to an Xtrata inscription. Convenience mirrors MAY exist, but marketplaces and indexers SHOULD treat the hash-bound manifest as the source of truth.

### Why This Standard Is Needed

Collections are not only images and names. A serious collection can include source provenance, launch partners, original protocol references, migrated asset mappings, audio stems, generator code, trait models, runtime modules, historical notes, holder snapshots, claim rules, creator signatures, marketplace preferences and amendment history.

Without a standard manifest, each collection invents a different structure. That makes integrations fragile. Marketplaces must guess. Preservation teams lose context. Wallets cannot display relationships. Indexers cannot verify mappings. Future tools cannot safely reconstruct the collection.

This standard gives Xtrata collections a durable integration surface.

### How This Differs From Normal NFT Metadata

Traditional NFT metadata usually describes one token. It commonly includes a name, description, image, attributes and sometimes animation or external URLs.

An Xtrata Collection Manifest describes the whole collection and its reconstruction rules. It can describe:

- collection identity and supply;
- creators, collaborators, publishers and marketplace partners;
- item-to-inscription mappings;
- original-to-Xtrata migration mappings;
- source collection provenance;
- trait schema and rarity model;
- per-item traits;
- image, audio, video, HTML, generator and runtime assets;
- reconstruction and verification instructions;
- resolver contract behavior;
- mint rules and launch configuration;
- rights, licensing and AI usage policy;
- historical notes and amendment history.

Per-token metadata MAY still exist, but it is subordinate to the manifest when the manifest declares collection-level rules.

### Central Source of Truth

For fixed, pre-inscribed collections, the manifest MAY be the only collection resolver needed. For live-minted or dynamic collections, resolver contracts MAY provide the current item mapping, but the manifest SHOULD still document the resolver, expected interfaces, reconstruction rules and marketplace behavior.

A marketplace SHOULD be able to answer the following questions from the manifest:

- What collection is this?
- Which core Xtrata contract is authoritative?
- How many items exist or can exist?
- How does collection item `n` map to an Xtrata inscription?
- How is the image, audio, animation, HTML, data payload or software module reconstructed?
- What traits, rarity fields and display fields should be shown?
- Who created, published, migrated, preserved or verified the collection?
- What rights and usage restrictions apply?
- Which contracts, wallets and URLs are verified?
- Has this manifest superseded an earlier manifest?

## 2. Foundry Context

This standard comes from recurring Foundry work across collection migration, preservation, marketplace launch planning and composable inscription tooling.

The same themes have appeared repeatedly:

- scattered collection data needs to be pulled into one canonical structure;
- fragile or abandoned collections need a durable migration and preservation path;
- pre-inscribed collections, including Froggies-style 10,000-piece migrations, need simple permanent item mapping;
- audiovisual collections, including NFTs for Peace-style archives, need to preserve images, audio, metadata, generative context and creator notes together;
- new art launches, including DYLE via Fak.fun-style marketplace distribution, need a predictable integration path;
- Xtrata needs to remain open, reconstructable and friendly to third-party tools;
- each collection should not require a one-off structure or custom integration conversation.

The manifest centralizes collection identity, provenance, reconstruction logic, marketplace behavior, asset mapping and future compatibility. It gives creators freedom in what they make while giving infrastructure predictable rules for how to read it.

## 3. Design Principles

Xtrata Collection Manifests SHOULD follow these principles.

### Deterministic Where Possible

If a mapping can be expressed by a formula, it SHOULD be expressed by a formula. If an asset can be hash-verified, its hash SHOULD be present. If a collection can be reconstructed without external services, that path SHOULD be documented.

### Strict But Extensible

The core schema SHOULD be strict enough that validators can catch errors. Optional sections SHOULD allow advanced collections without forcing simple art collections to fill unnecessary fields.

Unknown extension fields SHOULD be namespaced under `extensions`.

### Marketplace-Friendly

The manifest SHOULD include display names, descriptions, collection images, item image or content references, animation references, trait display hints, creator attribution, royalties, verified contract IDs and collection resolver information.

### Human-Readable and Machine-Readable

Every important machine field SHOULD have stable names and types. Every complex collection SHOULD also provide human-readable summaries for collectors, curators and archivists.

### Reconstruction-First

The manifest SHOULD prioritize independent reconstruction over convenience display. If a preview URL exists, the manifest SHOULD still explain how to derive the underlying content from Xtrata inscriptions, hashes, source assets or generator code.

### Provenance-Preserving

For migrations and preservation projects, the manifest SHOULD preserve original collection references, source protocol identifiers, historical notes, original creator information, archive notes, snapshots and migration rationale.

### Hash-Verifiable

Manifests SHOULD include hashes for referenced assets, item maps, map chunks, source snapshots, generator code, runtime modules and validation reports. Hash algorithms MUST be explicitly named.

### Signature-Ready

Manifests SHOULD be canonicalizable and signable. Creator, publisher, marketplace and archivist signatures SHOULD be represented in a structured `security.signatures` section.

### Suitable For Multiple Collection Types

The same standard SHOULD support:

- pre-inscribed collections;
- live-minted collections;
- migrated collections;
- generative collections;
- simple art collections;
- audiovisual collections;
- Audionals-style music and data inscriptions;
- BVST and software-like module collections;
- preservation archives;
- marketplace launches;
- future composable data tools.

### Chunkable For Large Collections

Large collections SHOULD NOT be forced into one massive JSON document. The manifest SHOULD support chunked item maps, range maps, external hashed map files and Xtrata-inscribed map chunks.

### Compatible With Resolver Contracts, Not Dependent On Them

Resolver contracts are useful, but not mandatory. A manifest SHOULD be able to document direct mappings, sequential ranges, resolver calls, external source mappings and exceptions.

### Designed For Long-Term Survival

A manifest SHOULD assume that project websites, APIs, storage gateways, marketplace pages and launch tools may disappear. It SHOULD preserve enough information for independent reconstruction.

## 4. Manifest Tiers

The schema supports three levels of complexity. A collection SHOULD declare its tier in `manifest.tier`.

### Level 1: Minimal Marketplace Manifest

Use Level 1 for simple collections where the primary goal is stable marketplace display and item resolution.

Required sections:

- manifest header;
- collection identity;
- creator data;
- supply;
- core Xtrata contract;
- item map or sequential range;
- marketplace display fields;
- asset hashes;
- rights summary;
- validation metadata.

Level 1 is enough for many art drops and straightforward marketplace launches.

### Level 2: Preservation Manifest

Use Level 2 for migrations, restored collections and historically important archives.

Level 2 adds:

- original collection provenance;
- source protocol and source contract references;
- migration reason;
- original-to-Xtrata mapping;
- historical context;
- holder snapshot and claim mapping;
- reconstruction instructions;
- verification report;
- creator, archivist and preservation notes.

Level 2 is appropriate for abandoned or fragile collections, pre-inscribed migrations and archival projects.

### Level 3: Full Composable Xtrata Manifest

Use Level 3 for advanced collections, Audionals, BVSTs, generative art, software-like inscriptions and future applications.

Level 3 adds:

- audio stems, mixes, BPM, key and playback rules;
- generator code, seeds and deterministic render logic;
- runtime dependencies and software modules;
- rights logic and AI policy;
- marketplace adapters;
- resolver behavior;
- validation rules;
- security signatures;
- integration hooks;
- reproducibility instructions.

Level 3 is intended for collections that behave more like creative systems than static media sets.

## 5. Full Manifest Schema Template

The following template is intentionally broad. Implementations MAY omit optional sections that do not apply, but MUST preserve field names and types when a section is used.

```json
{
  "manifest": {
    "standard": "xtrata-collection-manifest",
    "schemaVersion": "0.1.0",
    "tier": "level-1 | level-2 | level-3",
    "manifestId": "xtrata-manifest:dyle:2026-06-05",
    "network": "mainnet | testnet",
    "createdAt": "2026-06-05T00:00:00Z",
    "updatedAt": "2026-06-05T00:00:00Z",
    "status": "draft | active | superseded | archived",
    "language": "en",
    "canonicalUri": "xtrata://inscription/{manifestTokenId}",
    "canonicalInscription": {
      "contractId": "SP...xtrata-v3-0-0",
      "tokenId": "12345",
      "finalHash": "0x...",
      "mimeType": "application/json"
    },
    "previousManifest": {
      "manifestId": "xtrata-manifest:example:v0",
      "hash": "sha256:...",
      "uri": "xtrata://inscription/..."
    },
    "supersedes": [],
    "humanSummary": "Canonical collection manifest for Example Collection."
  },

  "collection": {
    "collectionId": "example-collection",
    "name": "Example Collection",
    "symbol": "EXAMPLE",
    "description": "A concise collection description.",
    "longDescription": "A longer human-readable description for marketplaces and archives.",
    "category": "art | migration | audiovisual | music | generative | software | preservation | mixed",
    "tags": ["xtrata", "art"],
    "supply": {
      "declared": 1000,
      "minted": 1000,
      "maximum": 1000,
      "supplyType": "fixed | capped | open | dynamic",
      "indexBase": 0
    },
    "dates": {
      "originalLaunch": "2024-01-01T00:00:00Z",
      "xtrataLaunch": "2026-06-05T00:00:00Z",
      "reveal": "2026-06-06T00:00:00Z"
    },
    "canonicalContracts": {
      "xtrataCore": "SP...xtrata-v3-0-0",
      "collectionResolver": "SP...example-collection-resolver",
      "collectionMint": "SP...example-collection-mint",
      "marketplace": "SP...marketplace-contract"
    },
    "display": {
      "collectionImage": {
        "uri": "xtrata://inscription/100",
        "mimeType": "image/png",
        "hash": "sha256:..."
      },
      "bannerImage": {
        "uri": "xtrata://inscription/101",
        "mimeType": "image/png",
        "hash": "sha256:..."
      },
      "thumbnailMode": "image | animation | audio | html | generated",
      "backgroundColor": "#000000",
      "externalUrl": "https://example.com",
      "marketplaceDescription": "Short display copy for marketplaces."
    }
  },

  "people": {
    "creators": [
      {
        "name": "Artist Name",
        "role": "artist | musician | developer | archivist | generator-author",
        "wallets": ["SP..."],
        "verifiedUrls": ["https://artist.example"],
        "social": {
          "x": "artist",
          "website": "https://artist.example"
        },
        "creditLine": "Art by Artist Name"
      }
    ],
    "collaborators": [],
    "contributors": [],
    "archivists": [],
    "publishers": [
      {
        "name": "Publisher Name",
        "wallets": ["SP..."],
        "role": "publisher",
        "verifiedUrls": ["https://publisher.example"]
      }
    ],
    "launchPartners": [
      {
        "name": "Fak.fun",
        "role": "marketplace | launchpad | curator",
        "verifiedUrl": "https://fak.fun",
        "wallets": [],
        "contractIds": []
      }
    ]
  },

  "provenance": {
    "type": "native-xtrata | migrated | preserved | derivative | hybrid",
    "originalCollection": {
      "name": "Original Collection",
      "protocol": "stacks | bitcoin | ethereum | ipfs | ordinals | other",
      "contractId": "SP...original-contract",
      "chainId": "mainnet",
      "website": "https://original.example",
      "marketplaceUrls": [],
      "sourceMetadataUri": "ipfs://...",
      "sourceArchiveUri": "xtrata://inscription/...",
      "sourceHash": "sha256:..."
    },
    "migration": {
      "reason": "abandoned-protocol | fragile-storage | creator-request | preservation | upgrade",
      "method": "pre-inscribed | holder-claim | mirrored | wrapped | reminted",
      "startedAt": "2026-06-05T00:00:00Z",
      "completedAt": "2026-06-05T00:00:00Z",
      "migrationOperator": "SP...",
      "notes": "Why the collection moved to Xtrata."
    },
    "historicalContext": {
      "summary": "Human-readable historical context.",
      "timeline": [
        {
          "date": "2024-01-01",
          "event": "Original collection launched."
        }
      ],
      "references": [
        {
          "label": "Archive note",
          "uri": "https://...",
          "hash": "sha256:..."
        }
      ]
    }
  },

  "assetRegistry": {
    "hashAlgorithm": "sha256",
    "assets": [
      {
        "assetId": "collection-cover",
        "type": "image | audio | video | html | json | code | data | module | archive",
        "uri": "xtrata://inscription/100",
        "xtrata": {
          "contractId": "SP...xtrata-v3-0-0",
          "tokenId": "100",
          "finalHash": "0x...",
          "mimeType": "image/png"
        },
        "mimeType": "image/png",
        "sizeBytes": 123456,
        "hash": "sha256:...",
        "role": "cover | item-media | generator | stem | runtime | metadata | validation-report",
        "fallbackUris": [],
        "license": "CC-BY-4.0",
        "notes": "Optional asset notes."
      }
    ]
  },

  "itemMap": {
    "mappingType": "explicit | sequential | chunked | resolver | hybrid",
    "indexBase": 0,
    "count": 1000,
    "coreContractId": "SP...xtrata-v3-0-0",
    "explicitItems": [
      {
        "index": 0,
        "collectionItemId": "0",
        "name": "Example #0",
        "xtrataInscription": {
          "contractId": "SP...xtrata-v3-0-0",
          "tokenId": "5000",
          "finalHash": "0x...",
          "mimeType": "image/png"
        },
        "sourceItem": {
          "sourceId": "0",
          "sourceTokenId": "0",
          "sourceUri": "ipfs://...",
          "sourceHash": "sha256:..."
        },
        "metadata": {
          "uri": "xtrata://inscription/6000",
          "hash": "sha256:..."
        },
        "image": {
          "uri": "xtrata://inscription/5000",
          "hash": "sha256:..."
        },
        "animation": {
          "uri": "xtrata://inscription/7000",
          "hash": "sha256:..."
        },
        "exceptions": []
      }
    ],
    "sequentialRanges": [
      {
        "rangeId": "primary",
        "firstItemIndex": 0,
        "lastItemIndex": 999,
        "firstXtrataInscriptionId": "5000",
        "lastXtrataInscriptionId": "5999",
        "formula": "xtrataTokenId = firstXtrataInscriptionId + (itemIndex - firstItemIndex)",
        "sourceFormula": "sourceTokenId = itemIndex",
        "exceptions": [
          {
            "itemIndex": 42,
            "xtrataTokenId": "7001",
            "reason": "replacement-after-verification-failure",
            "evidenceHash": "sha256:..."
          }
        ],
        "verificationHash": "sha256:..."
      }
    ],
    "chunkedMaps": [
      {
        "chunkId": "items-0000-0999",
        "firstItemIndex": 0,
        "lastItemIndex": 999,
        "uri": "xtrata://inscription/9000",
        "mimeType": "application/json",
        "hash": "sha256:...",
        "itemCount": 1000
      }
    ],
    "resolver": {
      "enabled": true,
      "contractId": "SP...collection-resolver",
      "interface": "xtrata-collection-resolver-v1",
      "coreContractFunction": "get-locked-core-contract",
      "countFunction": "get-minted-index-count",
      "mapFunction": "get-minted-id",
      "mapReturnType": "optional { token-id: uint }",
      "notes": "Resolver maps collection index to core Xtrata token id."
    }
  },

  "traits": {
    "schema": [
      {
        "traitType": "Background",
        "valueType": "string",
        "displayType": "text",
        "required": true,
        "allowedValues": ["Blue", "Red", "Gold"]
      },
      {
        "traitType": "Score",
        "valueType": "number",
        "displayType": "number",
        "required": false
      }
    ],
    "rarityModel": {
      "model": "frequency | weighted | generated | external-report",
      "reportUri": "xtrata://inscription/...",
      "reportHash": "sha256:...",
      "notes": "How rarity was calculated."
    },
    "perItemTraits": [
      {
        "index": 0,
        "attributes": [
          {
            "trait_type": "Background",
            "value": "Blue"
          }
        ]
      }
    ],
    "traitChunks": [
      {
        "chunkId": "traits-0000-0999",
        "uri": "xtrata://inscription/9100",
        "hash": "sha256:...",
        "firstItemIndex": 0,
        "lastItemIndex": 999
      }
    ]
  },

  "generative": {
    "enabled": false,
    "generationType": "deterministic | assisted | curated | hybrid",
    "seedPolicy": {
      "seedSource": "item-index | source-token-id | xtrata-token-id | hash | external-seed",
      "seedFormula": "seed = sha256(collectionId + ':' + itemIndex)",
      "immutable": true,
      "exceptions": []
    },
    "generatorCode": [
      {
        "assetId": "generator-v1",
        "language": "javascript",
        "runtime": "browser-es2020",
        "uri": "xtrata://inscription/...",
        "hash": "sha256:...",
        "entrypoint": "render"
      }
    ],
    "rendering": {
      "deterministic": true,
      "viewport": {
        "width": 1024,
        "height": 1024
      },
      "outputMimeType": "image/png",
      "referenceRenderer": "xtrata-renderer-v1",
      "referenceOutputs": [
        {
          "index": 0,
          "hash": "sha256:..."
        }
      ]
    }
  },

  "runtime": {
    "requirements": [
      {
        "type": "browser | audio-worklet | wasm | js | html | bvst-host",
        "name": "browser-es2020",
        "version": ">=1",
        "required": true
      }
    ],
    "entrypoints": [
      {
        "name": "main",
        "assetId": "runtime-main",
        "path": "index.html",
        "permissions": ["read-inscriptions"],
        "sandbox": "required"
      }
    ],
    "dependencies": [
      {
        "dependencyId": "dep-001",
        "type": "xtrata-inscription | npm | wasm | data | module",
        "uri": "xtrata://inscription/...",
        "hash": "sha256:...",
        "required": true
      }
    ],
    "reproducibility": {
      "instructions": "Steps to rebuild or run the collection.",
      "knownNonDeterminism": [],
      "referenceEnvironment": "browser-es2020"
    }
  },

  "reconstruction": {
    "strategy": "xtrata-core | xtrata-core-with-fallbacks | source-plus-xtrata | generator",
    "coreContractId": "SP...xtrata-v3-0-0",
    "fallbackContracts": [
      "SP...xtrata-v2-1-1",
      "SP...xtrata-v2-1-0",
      "SP...xtrata-v1-1-1"
    ],
    "requiredReadOnlyCalls": [
      "get-inscription-meta",
      "get-token-uri",
      "get-dependencies",
      "get-chunk-batch",
      "get-chunk"
    ],
    "instructions": [
      "Resolve collection index to Xtrata token id.",
      "Read inscription metadata.",
      "Read chunks in ascending index order.",
      "Reconstruct bytes and verify final hash.",
      "Render using the declared MIME type."
    ],
    "sequentialInscriptionRanges": [],
    "validationReport": {
      "uri": "xtrata://inscription/...",
      "hash": "sha256:...",
      "validatedAt": "2026-06-05T00:00:00Z",
      "validator": "xtrata-manifest-validator"
    }
  },

  "marketplace": {
    "compatibility": {
      "displayAs": "collection | album | software | archive | mixed",
      "preferredMedia": "image | animation | audio | html | generated",
      "supportsAnimation": true,
      "supportsAudio": true,
      "supportsHtml": true,
      "requiresRuntimeSandbox": true
    },
    "fields": {
      "nameTemplate": "Example #{index}",
      "descriptionTemplate": "Item {index} from Example Collection.",
      "externalUrlTemplate": "https://example.com/item/{index}",
      "imageTemplate": "xtrata://inscription/{xtrataTokenId}"
    },
    "adapters": [
      {
        "marketplace": "Fak.fun",
        "collectionUrl": "https://fak.fun/...",
        "verified": true,
        "notes": "Marketplace launch partner."
      }
    ],
    "royalties": {
      "basisPoints": 500,
      "recipient": "SP...",
      "splits": [
        {
          "recipient": "SP...",
          "basisPoints": 400,
          "role": "artist"
        },
        {
          "recipient": "SP...",
          "basisPoints": 100,
          "role": "publisher"
        }
      ]
    }
  },

  "minting": {
    "mode": "pre-inscribed | live-minted | claim | migration | hybrid",
    "collectionMintContract": "SP...collection-mint",
    "resolverContract": "SP...collection-resolver",
    "price": {
      "asset": "STX",
      "amount": "1000000"
    },
    "phases": [
      {
        "phaseId": 1,
        "name": "Public",
        "startBlock": 0,
        "endBlock": 0,
        "maxPerWallet": 1,
        "allowlistMode": "public"
      }
    ],
    "preInscribed": {
      "complete": true,
      "firstInscriptionId": "5000",
      "lastInscriptionId": "5999"
    }
  },

  "resolverConfig": {
    "required": false,
    "type": "none | standard-xtrata-collection-resolver | custom",
    "contractId": "SP...resolver",
    "interface": "xtrata-collection-resolver-v1",
    "readOnlyCalls": {
      "getLockedCoreContract": "get-locked-core-contract",
      "getMintedIndexCount": "get-minted-index-count",
      "getMintedId": "get-minted-id"
    },
    "trustModel": "on-chain | manifest-only | hybrid",
    "notes": "Resolver is optional for fixed sequential collections."
  },

  "rights": {
    "license": "All rights reserved | CC0 | CC-BY-4.0 | custom",
    "licenseUri": "https://...",
    "commercialUse": "allowed | disallowed | limited | unknown",
    "derivatives": "allowed | disallowed | limited | unknown",
    "attributionRequired": true,
    "aiUsagePolicy": {
      "training": "allowed | disallowed | limited | unknown",
      "inference": "allowed | disallowed | limited | unknown",
      "styleImitation": "allowed | disallowed | limited | unknown",
      "notes": "Collection-specific AI usage terms."
    },
    "sampleProvenanceRequired": true,
    "rightsNotes": "Human-readable rights summary."
  },

  "audio": {
    "enabled": false,
    "collectionType": "song | album | stems | samples | generative-music | mixed",
    "bpm": 120,
    "key": "C minor",
    "durationSeconds": 180,
    "looping": {
      "enabled": false,
      "loopStartSeconds": 0,
      "loopEndSeconds": 180
    },
    "mixes": [
      {
        "mixId": "master",
        "assetId": "audio-master",
        "format": "audio/wav",
        "hash": "sha256:..."
      }
    ],
    "stems": [
      {
        "stemId": "drums",
        "assetId": "stem-drums",
        "instrument": "drums",
        "bpm": 120,
        "key": "C minor",
        "bars": 64,
        "hash": "sha256:..."
      }
    ],
    "playbackInstructions": "How players should combine or loop assets.",
    "sampleProvenance": []
  },

  "software": {
    "enabled": false,
    "type": "bvst | module | app | game | data-tool | runtime",
    "modules": [
      {
        "moduleId": "module-main",
        "assetId": "runtime-main",
        "entrypoint": "main",
        "apiVersion": "1.0.0",
        "hash": "sha256:..."
      }
    ],
    "permissions": [
      {
        "permission": "network",
        "required": false,
        "reason": "Should not be required for deterministic playback."
      }
    ],
    "securityModel": {
      "sandboxRequired": true,
      "externalNetworkAllowed": false,
      "fileSystemAllowed": false
    }
  },

  "snapshots": {
    "holderSnapshot": {
      "required": false,
      "blockHeight": 123456,
      "source": "stacks-api | marketplace-export | custom",
      "uri": "xtrata://inscription/...",
      "hash": "sha256:..."
    },
    "claimMapping": [
      {
        "sourceWallet": "SP...",
        "sourceTokenId": "1",
        "xtrataTokenId": "5001",
        "claimStatus": "unclaimed | claimed | reserved | ineligible"
      }
    ]
  },

  "interoperability": {
    "externalReferences": [
      {
        "type": "website | marketplace | archive | source-code | social | documentation",
        "label": "Project website",
        "uri": "https://example.com",
        "verified": true,
        "hash": "sha256:..."
      }
    ],
    "walletHints": {
      "preferredDisplay": "grid | list | album | app",
      "primaryAction": "view | play | run | inspect",
      "safePreviewMimeTypes": ["image/png", "audio/wav", "text/html"]
    },
    "indexerHints": {
      "cachePolicy": "immutable | append-only | mutable-with-amendments",
      "rangeMapping": true,
      "chunkedMaps": true,
      "expectedItemCount": 1000
    }
  },

  "validation": {
    "schemaUri": "xtrata://schema/xtrata-collection-manifest/0.1.0",
    "validated": false,
    "validator": "xtrata-manifest-validator",
    "validationRules": [
      "item-count-equals-supply",
      "all-item-references-resolve",
      "all-hashes-match",
      "sequential-ranges-contiguous",
      "exceptions-documented",
      "creator-signatures-valid"
    ],
    "reports": []
  },

  "security": {
    "verifiedWallets": [
      {
        "wallet": "SP...",
        "role": "creator",
        "verificationMethod": "signature | known-contract | marketplace-verification | manual"
      }
    ],
    "verifiedContracts": [
      {
        "contractId": "SP...xtrata-v3-0-0",
        "role": "xtrata-core",
        "network": "mainnet"
      }
    ],
    "verifiedUrls": [
      {
        "url": "https://example.com",
        "role": "official-site",
        "verifiedAt": "2026-06-05T00:00:00Z"
      }
    ],
    "hashes": {
      "manifestHash": "sha256:...",
      "itemMapHash": "sha256:...",
      "assetRegistryHash": "sha256:..."
    },
    "signatures": [
      {
        "signer": "SP...",
        "role": "creator",
        "message": "sha256:...",
        "signature": "0x...",
        "signedAt": "2026-06-05T00:00:00Z",
        "canonicalization": "json-canonicalization-scheme"
      }
    ],
    "amendments": [
      {
        "amendmentId": "amendment-001",
        "type": "correction | clarification | supersession | security-warning",
        "date": "2026-06-05T00:00:00Z",
        "previousManifestHash": "sha256:...",
        "newManifestHash": "sha256:...",
        "reason": "Corrected a trait label without changing token content.",
        "signedBy": ["SP..."]
      }
    ]
  },

  "humanReadable": {
    "collectorSummary": "What collectors should know.",
    "marketplaceSummary": "What marketplaces should display.",
    "archivistSummary": "What archivists should preserve.",
    "developerSummary": "How developers should integrate."
  },

  "extensions": {
    "exampleNamespace": {
      "customField": "Custom extension data."
    }
  }
}
```

## 6. Sequential Collection Support

A pre-inscribed sequential collection SHOULD be representable without a huge per-item map.

For example, a Froggies-style 10,000-piece migration can define:

```json
{
  "itemMap": {
    "mappingType": "sequential",
    "indexBase": 1,
    "count": 10000,
    "coreContractId": "SP...xtrata-v3-0-0",
    "sequentialRanges": [
      {
        "rangeId": "froggies-primary",
        "firstItemIndex": 1,
        "lastItemIndex": 10000,
        "firstXtrataInscriptionId": "25000",
        "lastXtrataInscriptionId": "34999",
        "formula": "xtrataTokenId = 25000 + (itemIndex - 1)",
        "sourceFormula": "sourceTokenId = itemIndex",
        "exceptions": [],
        "verificationHash": "sha256:..."
      }
    ]
  }
}
```

The validator MUST check:

- `lastItemIndex - firstItemIndex + 1` equals range count;
- `lastXtrataInscriptionId - firstXtrataInscriptionId + 1` equals range count;
- all exceptions are documented;
- the range hash matches the canonical serialized range data;
- sampled or full inscription checks resolve successfully.

For small, fully pre-inscribed and immutable collections, a manifest-only model MAY be sufficient. A custom resolver contract is not required when:

- the full mapping is fixed;
- the mapping is deterministic;
- the manifest is canonical and hash-verified;
- no future minting or dynamic claim behavior is required;
- marketplaces can compute the Xtrata token id from the manifest formula.

If a collection later adds claims, replacement logic, dynamic reveal, cross-contract routing or nontrivial exceptions, it SHOULD use a resolver contract or a superseding manifest that clearly documents the change.

## 7. Manifest Versus Resolver Contract

Manifests and resolver contracts solve related but different problems.

The manifest documents the collection. A resolver contract answers on-chain lookup questions.

Not every collection needs a custom resolver contract.

### Manifest-Only Collections

A manifest can be enough when the collection is fixed, pre-inscribed and immutable. This is appropriate for many preservation projects and sequential migrations.

Marketplace flow:

```text
collection manifest + collection index
-> formula or explicit item map
-> Xtrata core contract + inscription id
-> verified on-chain content
```

### Standard Resolver Collections

A standard Xtrata resolver contract is useful for live-minted collections.

Recommended resolver interface:

```clarity
(get-locked-core-contract () (response principal uint))
(get-minted-index-count () (response uint uint))
(get-minted-id (uint) (optional { token-id: uint }))
```

Marketplace flow:

```text
collection resolver + collection index
-> get-locked-core-contract()
-> get-minted-id(index)
-> Xtrata core contract + inscription id
-> verified on-chain content
```

The manifest SHOULD still document the resolver contract, interface name, expected read-only calls and trust model.

### Custom Resolver Collections

Custom resolver contracts may be appropriate for dynamic collections, claim systems, multi-contract routing, generative reveals, replacement policies or cross-protocol migrations.

The manifest MUST document custom resolver behavior enough that third-party tools can integrate without private knowledge.

## 8. Use-Case Examples

### Froggies-Style Migration

Profile:

- 10,000 pieces;
- originally from an abandoned or fragile protocol;
- pre-inscribed on Xtrata;
- likely sequential from item 1 to item 10,000;
- fixed mapping from original item IDs to Xtrata inscription IDs.

Recommended manifest tier: Level 2.

Required manifest behavior:

- declare original collection provenance;
- document source protocol, source collection ID and historical context;
- define sequential item mapping;
- include any exceptions;
- include source archive hashes;
- include migration reason and operator;
- include verification report;
- document whether holder claims exist.

A custom resolver contract may not be necessary if the mapping is simple and permanent.

### NFTs For Peace-Style Audiovisual Preservation

Profile:

- 500-piece audiovisual collection;
- image, audio, metadata and collection references;
- roughly 490 algorithmically generated works and 10 human-generated works;
- preservation requires more than a static image.

Recommended manifest tier: Level 2 or Level 3.

Required manifest behavior:

- preserve original collection context;
- map each item to image and audio assets;
- document which works were algorithmically generated and which were human generated;
- preserve generator context, source assets, stems, metadata and creator notes where available;
- include playback and rendering instructions;
- include preservation notes explaining gaps, uncertainties and restored data.

### DYLE / Fak.fun Art Launch

Profile:

- new artist collection;
- launched through a marketplace partner;
- Xtrata-native content;
- marketplace display and mint compatibility are important.

Recommended manifest tier: Level 1 or Level 2.

Required manifest behavior:

- identify artist, publisher and Fak.fun launch partner fields;
- define collection supply;
- document collection mint or resolver contract;
- map collection item index to Xtrata inscription id;
- include marketplace display fields;
- include rights and royalty fields;
- include creator signatures where possible.

### Audionals / Music-Style Collection

Profile:

- music or data inscriptions;
- includes audio masters, stems, samples, BPM, key and playback behavior.

Recommended manifest tier: Level 3.

Required manifest behavior:

- define audio asset registry;
- include master mixes and stems;
- document BPM, key, duration, looping and playback instructions;
- preserve sample provenance;
- document rights for samples, stems, remixes and commercial usage;
- include deterministic playback rules if composition is generated.

### BVST / Software-Like Inscription

Profile:

- software-like or modular inscription;
- includes runtime modules, dependencies, entrypoints and permissions.

Recommended manifest tier: Level 3.

Required manifest behavior:

- define runtime requirements;
- list modules and dependency graph;
- identify entrypoints;
- define sandbox and permission expectations;
- include reproducibility instructions;
- include hashes for modules and reference outputs;
- document security assumptions and known limitations.

## 9. Validation Rules and Tooling

A future Xtrata manifest validator SHOULD check the following.

### Schema Validity

- Manifest declares `standard`, `schemaVersion` and `tier`.
- Required fields for the declared tier are present.
- Field types match the schema.
- Unknown extension fields are namespaced under `extensions`.

### Collection Consistency

- Item count equals declared supply where supply is fixed.
- `indexBase` is explicit.
- Collection IDs, symbols and contract IDs are valid.
- Required marketplace display fields are present.

### Item Resolution

- Every explicit item reference resolves.
- Sequential ranges are contiguous.
- Sequential range formulas produce the declared inscription IDs.
- Exceptions are documented and non-overlapping.
- Chunked item maps cover the expected item range.
- Chunked item maps do not overlap unless explicitly marked as superseding.

### Hash Verification

- Manifest hash matches the canonical manifest bytes.
- Asset hashes match referenced assets.
- Item map chunk hashes match.
- Validation report hashes match.
- Xtrata inscription final hashes match contract metadata where present.

### Migration and Preservation

- Source collection references are present for migrations.
- Original-to-Xtrata mappings are complete or gaps are documented.
- Holder snapshot references include block height and hash.
- Migration reason and method are present.
- Archivist notes are present for preservation tier manifests.

### Marketplace Compatibility

- Collection image and banner references resolve.
- Item image, animation, audio or runtime references resolve.
- Trait schema is valid.
- Per-item traits use declared trait types.
- Royalty and split basis points are valid.
- Verified marketplace URLs and contract IDs are present when launch partners are declared.

### Audio and Runtime

- Audio collections include duration, MIME types and playback instructions.
- Stem references resolve and hash-verify.
- Runtime collections include entrypoints, dependencies and sandbox requirements.
- BVST or software module references include hashes and reproducibility instructions.

### Signatures and Security

- Creator signatures verify against declared creator wallets.
- Publisher, marketplace and archivist signatures verify when present.
- Superseded manifests point to previous hashes.
- Amendments are signed and explain what changed.

The validator SHOULD be able to output a validation report that can itself be inscribed on Xtrata or referenced by hash from the manifest.

## 10. Security Considerations

Xtrata Collection Manifests become high-value integration documents. They must be treated as security-sensitive infrastructure.

### Spoofing Prevention

Marketplaces SHOULD NOT trust a manifest only because it uses a collection name. They SHOULD verify:

- creator wallets;
- collection contracts;
- Xtrata core contracts;
- launch partner URLs;
- resolver contract IDs;
- manifest signatures;
- manifest hashes.

### Verified Creator Wallets

Creator and publisher wallet verification SHOULD be explicit. A manifest SHOULD include signatures from known wallets where possible. If creator signatures are unavailable for a preservation project, the manifest SHOULD explain the trust path and identify the archivist or migration operator.

### Verified Contracts

Every contract ID used by the manifest SHOULD include its role and network. Marketplaces SHOULD reject or warn on mismatched networks, malformed contract IDs or unverified resolver contracts.

### Manifest Signing

The manifest SHOULD be signed after canonicalization. Implementations MUST document the canonicalization method used for signing. Signatures SHOULD cover the full manifest hash, not only selected fields.

### Asset Hash Verification

Asset URLs are not proof. Every important asset SHOULD have a hash. Xtrata inscription final hashes SHOULD be checked against contract read-only metadata.

### Tamper-Evident Updates

Immutable data cannot be edited. Corrections MUST be represented as amendments or superseding manifests. A new manifest SHOULD point back to the previous manifest hash and explain the reason for change.

### Superseded Manifests

A superseded manifest SHOULD remain readable. Indexers SHOULD retain it but mark it as superseded when a valid signed replacement exists.

### Phishing Risks

Manifest URLs, external links and marketplace links can be abused. Wallets and marketplaces SHOULD distinguish verified official links from unverified external references.

### Third-Party Indexer Trust

Indexers MAY cache parsed manifests, but they SHOULD expose the manifest hash and validation status. Clients SHOULD be able to independently reconstruct or verify the manifest path.

### Corrections Without Rewriting History

If a trait label, description, attribution or URL is corrected, the correction MUST NOT pretend the original immutable data changed. The manifest SHOULD record the amendment and state whether item content, metadata, display text or interpretation changed.

## 11. Recommended File Structure

Recommended repository structure:

```text
docs/standards/xtrata-collection-manifest-standard.md
docs/standards/xtrata-manifest-templates/README.md
docs/standards/xtrata-manifest-templates/00-manifest-index.json
docs/standards/xtrata-manifest-templates/collections/minimal-marketplace-manifest.json
docs/standards/xtrata-manifest-templates/collections/preservation-migration-manifest.json
docs/standards/xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json
docs/standards/xtrata-manifest-templates/collections/full-composable-manifest.json
schemas/xtrata-collection-manifest.schema.json
docs/standards/xtrata-manifest-validation.md
```

The main markdown standard should remain the human-readable protocol reference. A JSON schema should become the machine validation target. The manifest template package should track real integration cases without requiring readers to infer the standard from production data.

## 12. Companion Artifacts and Future Work

This document defines the main Xtrata Collection Manifest standard. The current
companion artifacts are:

- [`schemas/xtrata-collection-manifest.schema.json`](../../schemas/xtrata-collection-manifest.schema.json): draft JSON Schema for automated validation.
- [`docs/standards/xtrata-manifest-templates/README.md`](xtrata-manifest-templates/README.md): active entry point for the modular manifest template package.
- [`docs/standards/xtrata-manifest-templates/00-manifest-index.json`](xtrata-manifest-templates/00-manifest-index.json): machine-readable index of root templates, specialist folders and shared template standards.
- [`docs/standards/xtrata-manifest-templates/collections/minimal-marketplace-manifest.json`](xtrata-manifest-templates/collections/minimal-marketplace-manifest.json): collection template for a simple art marketplace launch.
- [`docs/standards/xtrata-manifest-templates/collections/preservation-migration-manifest.json`](xtrata-manifest-templates/collections/preservation-migration-manifest.json): collection template for a Froggies-style migration.
- [`docs/standards/xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json`](xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json): collection template for NFTs for Peace-style audiovisual preservation.
- [`docs/standards/xtrata-manifest-templates/collections/full-composable-manifest.json`](xtrata-manifest-templates/collections/full-composable-manifest.json): collection template for Audionals, BVSTs and generative software-like collections.
- [`docs/standards/xtrata-manifest-validation.md`](xtrata-manifest-validation.md): validator behavior, error codes, canonicalization, signature verification and report format.

Future work should turn the draft schema and validation guidance into a tested
SDK package and CLI.

## 13. Marketplace Integration Summary

For Xtrata-native collections, the preferred permanent marketplace standard is:

```text
collection contract or manifest + collection index
-> get-minted-id(index) or manifest item formula
-> Xtrata core contract + inscription id
-> get-inscription-meta(id)
-> get-chunk-batch(id, indexes) or get-chunk(id, index)
-> verify final hash
-> render content using MIME type and manifest display rules
```

If a resolver contract is present, marketplaces SHOULD use the resolver for live item mapping and the manifest for collection context, display rules, provenance, rights and verification.

If no resolver contract is present, marketplaces MAY use a signed, hash-verified manifest when the collection is fixed and the item mapping is explicit or sequential.

The manifest is the long-term collection control document. Resolver contracts answer live lookup questions. Token metadata helps with per-item display. Xtrata inscriptions provide the verified content.
