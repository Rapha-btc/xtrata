# 09 — Implementation Checklist

Use this checklist to validate the final `XTRATA_AGENT_SKILL.md` file before
it is published for agent consumption.

---

## Completeness Checklist

### Core Requirements

- [ ] An agent reading ONLY the skill file (with no other context) could
      construct and broadcast a valid Xtrata inscription transaction
- [ ] The skill file is fully self-contained — no external references required
- [ ] All code examples are complete and runnable (not pseudocode)

### Contract Documentation

- [ ] Contract address is listed: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`
- [ ] Contract name is listed: `xtrata-v2-1-0`
- [ ] Full contract ID is listed: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- [ ] Helper contract name is listed: `xtrata-small-mint-v1-0`
- [ ] Helper full contract ID is listed: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0`
- [ ] Every public function is documented with exact parameter types
- [ ] Every read-only function is documented with exact parameter types
- [ ] Every error code is listed with its numeric value and name
- [ ] All constants are documented (CHUNK-SIZE, MAX-BATCH-SIZE, etc.)

### Data Model

- [ ] Chunking algorithm is explained (16,384-byte fixed chunks)
- [ ] Hashing algorithm is explained (incremental SHA-256 chain)
- [ ] Hash computation code example is provided and correct
- [ ] Content deduplication via `HashToId` is explained
- [ ] `InscriptionMeta` structure is fully documented
- [ ] Upload session lifecycle is documented (create → upload → seal → expire)

### Transaction Construction

- [ ] Required npm packages are listed with exact names
- [ ] Network setup code is provided (mainnet + testnet)
- [ ] Helper route transaction construction example is complete
- [ ] `begin-or-get` transaction construction example is complete
- [ ] `add-chunk-batch` transaction construction example is complete
- [ ] `seal-inscription` transaction construction example is complete
- [ ] `transfer` transaction construction example is complete
- [ ] Post-conditions are shown for every fee-paying operation
- [ ] `PostConditionMode.Deny` is used in all examples
- [ ] Nonce management is explained
- [ ] Inter-transaction delays are documented (5 seconds)

### Fee Model

- [ ] Fee formula documented: begin = fee-unit, seal = fee-unit * (1 + ceil(chunks/50))
- [ ] Default fee-unit stated: 100,000 microSTX (0.1 STX)
- [ ] Fee calculation code example is provided
- [ ] Post-condition spend caps match fee calculations
- [ ] Balance check code example is provided

### Workflows

- [ ] Route selection rules are documented (helper vs staged)
- [ ] Complete helper mint workflow with working code
- [ ] Complete staged mint workflow (begin → upload → seal) with working code
- [ ] Transfer workflow with working code
- [ ] Query workflow (get metadata, read content, enumerate tokens)
- [ ] Recursive inscription workflow with working code
- [ ] Upload resume workflow (check state, resume from interruption)
- [ ] Deduplication check workflow (get-id-by-hash before inscribing)

### aibtc Integration

- [ ] MCP wallet tool mapping is provided
- [ ] Autonomous inscription loop (10-step) is documented
- [ ] MCP/SDK split is documented for helper and chunk-buffer writes
- [ ] Balance check before operations is shown
- [ ] Error recovery decision tree is provided

### Error Handling

- [ ] All 12 contract error codes are documented
- [ ] Each error has: trigger cause and resolution strategy
- [ ] Transaction-level errors are covered (post-condition, nonce, balance)
- [ ] Network errors are covered with retry strategy
- [ ] Exponential backoff code example is provided

### Network & API

- [ ] Mainnet and testnet API endpoints are listed
- [ ] Rate limiting guidance is provided
- [ ] Account balance endpoint is documented
- [ ] Transaction status endpoint is documented
- [ ] Read-only call endpoint is documented
- [ ] Clarity value type reference is included

### Security

- [ ] Private key safety warning is included
- [ ] Post-condition safety is emphasized
- [ ] Spend cap limits are documented
- [ ] Testnet-first guidance is included
- [ ] Transaction logging recommendation is included

---

## Quality Checklist

- [ ] Zero ambiguous instructions — an agent should never have to guess
- [ ] Every function name is exact (matches the deployed contract)
- [ ] Every parameter type is exact (matches Clarity types)
- [ ] Every code example uses correct imports
- [ ] Contract address/name is consistent throughout all examples
- [ ] Fee calculations in code match the documented formula
- [ ] Post-condition amounts match fee calculations

---

## Companion Scripts

Optional but recommended:

- [ ] `scripts/xtrata-mint-example.js` — Complete, runnable minting script
- [ ] `scripts/xtrata-transfer-example.js` — Complete, runnable transfer script
- [ ] `scripts/xtrata-query-example.js` — Complete, runnable query script

Scripts should work with minimal configuration:
- [ ] Only requires: private key and network choice
- [ ] Includes clear usage instructions in comments
- [ ] Handles errors gracefully with meaningful messages

---

## Final Validation

Before publishing, test the skill file by having a fresh AI agent:

1. Read only the skill file (no other context)
2. Attempt to write code for a mint operation
3. Verify the code would produce valid transactions
4. Verify error handling covers common failure modes
5. Verify the agent understands the fee model and sets correct post-conditions
