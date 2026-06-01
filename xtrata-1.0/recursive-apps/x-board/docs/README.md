# X-Board Documentation

[`../x-board.html`](../x-board.html) is the only browser application file.

X-Board is a square public billboard with `93` independently programmable
regions. The standalone browser and Clarity registry share one canonical styled
`B1` programme schema and the browser packages wallet contract calls directly.

| File | Purpose |
|---|---|
| [`../x-board.html`](../x-board.html) | Standalone HTML, CSS, and JavaScript application |
| [`memo-format.md`](./memo-format.md) | Canonical `B1` programme schema |
| [`developer-notes.md`](./developer-notes.md) | Runtime architecture and maintenance map |
| [`test-plan.md`](./test-plan.md) | Browser and contract verification checklist |
| [`clarity-contract-plan.md`](./clarity-contract-plan.md) | Contract model and wallet migration plan |
| [`x-board-project-plan.md`](./x-board-project-plan.md) | Product scope and implementation roadmap |

## Rules

- Keep `../x-board.html` as the sole standalone application.
- Preserve the `12 x 12` square canvas and `93` immutable slot identities.
- Preserve the full-square local preview.
- Update the browser compiler, decoder, contract validator, tests, and docs
  together when changing `B1`.
- Use bounded contract reads and avoid aggressive polling.
