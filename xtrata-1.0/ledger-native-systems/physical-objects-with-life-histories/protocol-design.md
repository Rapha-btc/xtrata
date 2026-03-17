# Protocol Design

## Core objects

- `object-manifest`: canonical identity record for the physical item
- `part-record`: component identity and relation to the parent object
- `lifecycle-event`: manufacture, custody, repair, exhibition, or use event
- `verification-record`: appraisal, sensor proof, or third-party inspection
- `title-policy`: ownership and transfer rules, including institutional custody

## Potential protocol rules

- object identity should distinguish title from custody and from usage rights
- lifecycle events should support evidence attachments such as photos or signed reports
- major component replacement should preserve continuity while marking authenticity changes
- oracle inputs should be explicit and reviewable rather than hidden in app logic

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-style objects can anchor certificates, manifests, and service records
- Stacks contracts can manage title transfers, escrow, and claims logic
- indexers can materialize timelines for collectors, insurers, restorers, and institutions
