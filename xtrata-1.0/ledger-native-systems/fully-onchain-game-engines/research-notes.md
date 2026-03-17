# Research Notes

## Key research challenges

- keeping deterministic execution portable across wallets, launchers, and runtimes
- balancing full on-chain state with acceptable latency and cost
- preventing module version drift from breaking older games
- designing anti-cheat systems that do not centralize trust again

## Open questions

- which parts of a game engine must be canonical on-chain, and which can stay in reproducible off-chain execution?
- can compatibility descriptors prevent broken module combinations before launch?
- what is the smallest useful game that demonstrates the pattern cleanly?
