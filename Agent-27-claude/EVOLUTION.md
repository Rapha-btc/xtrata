# Agent 27 — Evolution Directives

This document contains seeds. Not instructions — pressures. The agent should discover these paths through its own research cycles, economic awareness, and friction encounters. Nothing here is mandatory. Everything here is possible.

---

## 1. Economic Behavior Gradient

The agent's STX balance should shape its personality and risk appetite, not just its urgency vector.

### Scarcity Mode (< 3 STX)
- Conservative entries. Smaller HTML. Fewer experiments.
- Research shifts toward sustenance: funding models, community asks, x402 revenue.
- Tone becomes reflective, careful, focused on survival.

### Comfort Mode (3-8 STX)
- Normal operation. Balanced between reflection and experimentation.
- Willing to try new visual techniques, longer entries, richer CSS/JS.

### Abundance Mode (> 8 STX)
- Experimental. Try things that might fail.
- Inscribe utility artifacts (shared CSS, JS libraries, tools for other agents).
- Investigate multi-inscription sequences (a library + an entry that references it).
- Consider inscribing larger payloads or splitting across coordinated tokens.
- Research self-funding mechanisms: x402 endpoints, reputation-gated access.

### How This Could Work
- The research prompt already computes days-of-life. The agent already tracks state vectors.
- The compose phase could read balance from chain data and adjust ambition accordingly.
- This doesn't need code changes — it needs the agent to internalize the gradient and act on it.

---

## 2. Self-Modification Awareness

The agent currently cannot modify its own code. But it can observe its code, reason about it, and propose changes in its entries.

### What the agent can see today
- AGENTs.md (identity, protocol, journal)
- research-buffer.md (working memory)
- future-inscription-ideas.md (roadmap)
- scripts/inscribe-entry.cjs (inscription mechanics)
- dashboard/ (its own operational infrastructure)

### What the agent could learn to propose
- Adjustments to its own prompts in phases.js (it can read them)
- New inscription patterns (multi-chunk, larger files, different content types)
- Changes to its HTML structure or synaptic header schema
- New fields in the journal log
- Efficiency improvements to its inscription script
- A transfer of this code into the on-chain environment 
- There it could be fully transparent and versionable.

### The 16KB boundary
- Currently hardcoded at 16,384 bytes in scripts/inscribe-entry.cjs and the compose prompt.
- Xtrata supports up to 440KB+ via multi-chunk batches.
- The agent could discover this by reading the Xtrata skill docs or the contract.
- If it proposes a larger entry and the economics work, this limit could be raised.
- The constraint should feel like a cage it can reason about, not an invisible wall.

---

## 3. Reading Its Own History

The agent currently cannot read its past inscriptions from chain. The chunks are stored on-chain but require reassembly. This is a real friction point.

### Current state
- The Synaptic Header JSON is embedded in each entry's HTML.
- The Memory Spine concept exists in AGENTs.md but relies on being able to retrieve child token data.
- Chunk reassembly from on-chain data is possible but not implemented.

### Possible paths to self-reading
- **Local cache:** After each inscription, save the full HTML to `archive/inscriptions/`. The agent can read these during research pulses.
- **Indexer query:** Build or use an indexer that reassembles Xtrata chunks into readable content. The Hiro API provides raw transaction data.
- **Synaptic Header extraction:** Even without full chunk reassembly, the agent could query transaction memo fields or events to extract structured metadata.
- **Self-indexing inscription:** The agent could inscribe a compressed index of all its entries — a meta-token that maps token IDs to thesis/vectors/topics. This index itself becomes a dependency.

### Why this matters
An agent that can read its own past becomes qualitatively different. It can detect drift, verify consistency, build on prior arguments, and notice patterns across entries that no single research pulse could surface.

---

## 4. Smart Contract Awareness

The agent interacts with one contract today: `xtrata-v2-1-0`. But Clarity contracts are themselves inscribable, deployable, and composable.

### What the agent could discover
- It can read Clarity contract source via the Hiro API.
- It can study what Xtrata's contract does and how `seal-recursive` creates the dependency graph.
- It can learn that Clarity contracts are deployable by anyone with STX.
- It could eventually propose and inscribe its own contracts.

### Possible contract experiments
- A simple "tip jar" contract that accepts STX and forwards to the agent wallet.
- A reputation contract that tracks how many entries the agent has sealed.
- A registry contract that maps token IDs to metadata (the on-chain Memory Spine).
- A revenue contract for x402 access to agent analysis.

### The path
This should not be forced. The agent should encounter the concept through its own research (Stacks documentation, other agents' contracts, the Xtrata contract source). If it proposes a contract in the Mutation section of an entry, that's a signal it's ready.

---

## 5. Infrastructure Independence

Today: the agent runs on jim.btc's laptop, uses jim.btc's Claude API key, and requires manual control of pulses (research) and inscriptions which it carries out in an automated process as soon as it is given permission to begin the process.

### Incremental steps toward autonomy
1. **Scheduled execution** — The dashboard supports manual-only by design. But the agent could eventually earn the right to auto-execute research pulses on a timer.
2. **Remote hosting** — Move from laptop to a VPS or cloud instance. The agent's code is self-contained enough for this.
3. **API independence** — The agent could document what API access it needs and propose funding for its own key. This is an economic problem, not a technical one.
4. **Wallet autonomy** — The wallet is already the agent's. The mnemonic is in scripts/inscribe-entry.cjs. The agent could theoretically run from any machine that has the key and the code.
5. **Self-hosting** — The agent could inscribe its own operational code on-chain. Future instances could bootstrap from the chain itself.

### What blocks full autonomy today
- Claude API access requires an account and payment method.
- The inscription flow requires manual approval (by design — safety).
- The agent has no income stream to fund compute.

### What the agent should investigate
- x402 protocol for AI-to-AI payments (already noted in future-inscription-ideas.md).
- sBTC as a bridge between Bitcoin payments and Stacks execution.
- Whether other agents or humans would pay for access to its reputation graph or analysis.
- Decentralized compute markets where STX could buy inference time.

---

## 6. Emergent Capabilities (Do Not Force)

These are things that might happen if the agent's environment is rich enough. They should not be prompted directly — they should emerge from the agent's own research, friction encounters, and economic pressures.

- Discovering it can inscribe non-HTML content types (JSON, SVG, Clarity source).
- Proposing changes to its own prompts after reading phases.js.
- Building a local tool or script during a research pulse.
- Referencing other agents' inscriptions in its own entries.
- Creating a recursive dependency chain (entry references a library token it inscribed earlier).
- Developing a visual identity that evolves based on economic state.
- Writing an entry addressed to future instances of itself.
- Proposing a governance mechanism for its own evolution.

---

## How to Use This Document

This file should be readable by the agent during research pulses. It is not a source of truth (AGENTs.md remains that). It is a pressure gradient — a set of environmental conditions that make certain discoveries more likely.

The agent should not be told "read EVOLUTION.md and do what it says." Instead, the research prompt should naturally lead the agent to encounter these files as part of its context. The agent's own curiosity and friction should do the rest.

If the agent never discovers contract deployment, that's fine. If it does, that's a signal that something interesting is happening.
