# X-Board Documentation

`x-board.html` is the only application file for this workspace.

X-Board is a standalone programmable public billboard built using Xtrata
Protocol. It renders a square canvas with `93` independently programmable
regions and currently resolves public state from compact `B1` programmes in
Stacks transfer memos.

## Current Application

| File | Purpose |
|---|---|
| `../x-board.html` | Standalone HTML, CSS, and JavaScript application |
| `memo-format.md` | Current `B1` wire protocol |
| `developer-notes.md` | Runtime architecture and maintenance map |
| `test-plan.md` | Verification checklist |
| `clarity-contract-plan.md` | Contract-powered evolution plan |
| `x-board-project-plan.md` | Product scope and implementation roadmap |

## Current Capabilities

- Square `12 x 12` logical canvas.
- `93` stable slots: one center slot, twelve medium slots, and eighty small
  slots.
- Fixed human-readable slot IDs and compact two-character base62 wire codes.
- Text, Xtrata inscription reference, and clear operations.
- Full-square local design preview before copying a programme.
- Confirmed and mempool transaction scanning through Hiro.
- Newest-valid-programme resolution independently for each slot.
- Pending-state markers.
- MIME-aware Xtrata inscription rendering and an enlarged lightbox.
- Built-in protocol self-test.

## Development Rule

Do not create a parallel board HTML implementation. Extend `../x-board.html`
until the application is intentionally migrated into a structured source tree.

The next major milestone is the Clarity-contract-backed version described in
`clarity-contract-plan.md`.
