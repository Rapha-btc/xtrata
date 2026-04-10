# Xtrata x Learn Africa Build Partnership Proposal

Status: Discussion draft  
Date: 2026-04-10

## Purpose

This proposal outlines a practical partnership model between Xtrata and Learn Africa Build in which the Xtrata builder stack becomes open source while Xtrata retains control of the canonical protocol contract, production fee rail, and related governance.

The goal is to reduce adoption friction, expand the builder ecosystem, and create a durable commercial relationship without giving up control of the core protocol economics.

## Executive Summary

The recommended model is:

- Xtrata open sources the application layer, SDKs, tooling, examples, and developer documentation.
- Xtrata retains stewardship of the canonical production contract deployment, fee settings, recipient address, protocol versioning, and official brand usage.
- Learn Africa Build becomes a strategic implementation, education, and ecosystem partner that helps drive real-world adoption, especially across African builder and institution networks.
- Production partners are encouraged to build on the official Xtrata protocol rail, while forks of the open-source app and tooling remain possible.

This creates an open ecosystem at the builder layer and a managed core at the protocol layer.

## Strategic Rationale

This structure supports both adoption and sustainability.

- Open sourcing the app and SDK increases trust, lowers integration friction, and makes it easier for third parties to build with Xtrata.
- Retaining control of the canonical contract protects protocol integrity, fee collection, compatibility, and long-term product direction.
- Learn Africa Build gains a credible open platform to bring into local programs, training, pilots, and implementation work.
- Xtrata gains distribution, implementation capacity, and ecosystem growth without turning the protocol itself into an unmanaged commons.

## Proposed Boundary

### Open-Source Scope

The following components should be released under an open-source license:

- Web app and reference UI
- SDKs and client libraries
- Read-only helpers and integration tooling
- Documentation, quickstarts, examples, and templates
- Reference implementations for sector use cases
- Non-sensitive backend helpers and developer utilities
- Test fixtures and integration examples for builders

### Xtrata-Controlled Scope

The following components should remain under Xtrata control:

- Canonical production smart contract deployment
- Fee recipient address and fee policy
- Protocol governance and approval of contract-impacting changes
- Official contract registries and production defaults
- Compatibility guarantees for the official protocol rail
- Xtrata trademarks, naming, and certification language
- Any future protocol upgrades to the official production contract family

## Important Clarification on Contract Control

If the contract is deployed on-chain, it will be visible and inspectable in practice. That means the real control point is not secrecy. The real control point is stewardship of the official deployment.

The partnership should therefore be explicit that:

- anyone may inspect how the protocol works,
- builders may integrate with the open Xtrata stack,
- but the official Xtrata production rail is the canonical contract deployment operated and governed by Xtrata.

This keeps the business model defensible without relying on obscurity.

## Proposed Partnership Model

### Xtrata Responsibilities

- Maintain the canonical production contract deployment and related protocol policy
- Maintain official SDK compatibility and release direction
- Approve contract-level changes that affect production compatibility or fee behavior
- Provide technical guidance for builders integrating with the protocol
- Define official branding and certification rules such as "Built on Xtrata Protocol"

### Learn Africa Build Responsibilities

- Source and develop high-value use cases, especially in education, creator, archive, and institutional contexts
- Build solutions on top of the open Xtrata stack
- Lead implementation, onboarding, workshops, and field-level partner support where appropriate
- Contribute improvements back to the open-source app, SDK, docs, and templates
- Act as a regional ecosystem and distribution partner for Xtrata-powered deployments

## Recommended Commercial Structure

The cleanest default commercial model is:

- protocol fees flow to Xtrata through the canonical contract,
- implementation revenue flows to the party delivering the implementation work,
- joint projects use a separate statement of work with agreed revenue split,
- Learn Africa Build may receive referral or originator upside for projects it sources onto the official Xtrata rail.

This structure keeps the protocol economics simple while allowing both parties to benefit from adoption.

### Recommended Revenue Approach

For the initial partnership phase:

- Xtrata keeps 100% of canonical protocol fees
- Learn Africa Build keeps implementation, training, and support revenue for work it leads
- jointly delivered projects are split by separate agreement per project
- Xtrata may offer Learn Africa Build a referral share or strategic partner bonus on qualified volume it originates, if desired for alignment

This avoids overcomplicating the core economic model too early.

## Governance Model

The governance model should distinguish between open-source contribution and protocol authority.

### Open-Source Governance

- Public contributions are welcomed for app, SDK, docs, and integration tooling
- Feature requests and bug fixes follow normal open-source contribution flow
- Xtrata remains lead maintainer for protocol-facing repositories unless otherwise agreed
- Learn Africa Build is recognized as a strategic maintainer and ecosystem contributor

### Protocol Governance

The following decisions remain subject to Xtrata approval:

- changes to official production contract interfaces,
- changes to fee logic or fee recipient configuration,
- changes to official registry defaults,
- branding rules around official Xtrata compatibility,
- production contract upgrades or migrations.

Any change that materially affects the canonical contract rail should require Xtrata signoff.

## Branding and Ecosystem Positioning

To keep the model clear, public messaging should avoid saying that the entire protocol core is open and uncontrolled. A better position is:

"Xtrata is an open-source builder stack and SDK ecosystem powered by the official Xtrata Protocol contract."

This gives builders confidence while preserving the distinction between:

- the open tools they can use and extend, and
- the official contract rail that defines the production protocol.

## Licensing Recommendation

Recommended structure:

- App, SDK, docs, and examples: `Apache-2.0` or `MIT`
- Xtrata name, marks, and official compatibility language: trademark reserved
- Official contract deployments and associated production governance: controlled by Xtrata

If contract source is published or already publicly inspectable, the commercial distinction should be made through branding, governance, and canonical deployment status, not through ambiguous ownership claims.

## Suggested Phased Rollout

### Phase 1: Alignment

- Agree the open-source boundary
- Agree the official protocol control boundary
- Draft a short memorandum of understanding
- Agree branding language and partner positioning

### Phase 2: Open-Source Launch

- Publish the open-source repositories or repo structure
- Add contribution guidelines and maintainer rules
- Publish builder quickstarts and examples
- Announce Learn Africa Build as a strategic ecosystem partner

### Phase 3: Pilot Delivery

- Select two or three high-signal pilot use cases
- Build them on the open Xtrata stack using the official contract rail
- Use those pilots to validate operating model, demand, and support needs

### Phase 4: Ecosystem Expansion

- Launch workshops, partner onboarding, and case studies
- Expand templates for education, creator, archive, and commerce use cases
- Consider a formal partner program once the first pilots are stable

## Suggested Documents to Prepare Next

To make this partnership operational, the following documents should be produced:

- Open-source boundary and governance note
- Partnership memorandum of understanding
- Branding and trademark usage policy
- Contribution guidelines for external builders
- Optional partner referral and joint delivery framework

## Draft Proposal Language for Sam

Below is a concise version that can be sent directly as a discussion note.

---

I think there is a strong basis for a partnership between Xtrata and Learn Africa Build if we structure it properly.

My view is that Xtrata should become open at the builder layer while keeping stewardship of the canonical protocol contract. In practice, that means we open source the app, SDK, tooling, docs, and integration layer so that Learn Africa Build and other partners can build freely on top of it. At the same time, Xtrata would retain control of the official production contract deployment, the fee rail, protocol governance, and official compatibility standards.

That gives us the best of both models. Builders get openness, trust, and flexibility. Xtrata keeps responsibility for protocol integrity and the core fee mechanism. Learn Africa Build can then become a strategic implementation and ecosystem partner, helping bring real use cases, training, pilots, and distribution into the market.

Commercially, I think the cleanest approach is for Xtrata to keep protocol fees on the canonical contract while Learn Africa Build leads or shares implementation, support, and training revenue on projects it helps originate or deliver. For jointly delivered projects, we can define the split case by case.

If this direction makes sense, the next step would be for us to write a simple partnership note that defines:

- what is open source,
- what remains under Xtrata control,
- how governance works,
- how revenue and project delivery are handled,
- and what our first pilot use cases should be.

I think that gives us a practical structure for opening Xtrata up without losing control of the part that makes the protocol sustainable.

---

## Recommendation

Proceed with a partnership model based on "open builder ecosystem, managed protocol core."

This is the clearest way to:

- make Xtrata more adoptable,
- protect the canonical fee rail,
- give Learn Africa Build a meaningful partner role,
- and create a credible long-term ecosystem strategy.
