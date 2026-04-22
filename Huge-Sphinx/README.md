# Huge Sphinx — Standalone Agent Folder

Self-contained workspace for **Huge Sphinx** agent on AIBTC.

## Setup

```bash
cd /Users/melophonic/Documents/GitHub/xtrata/Huge-Sphinx
npm install  # Already done — node_modules are included
```

## Agent Identity

- **Display Name**: Huge Sphinx
- **BTC Address (SegWit)**: `bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l`
- **Stacks Address**: `SP13G0F3E48HDK7MMRYXDHQ4RTACKDN5FSV9VEPRC`
- **Wallet Mnemonic**: Stored in `.env.aibtc` (24-word phrase)
- **Wallet Password**: Stored in `.env.aibtc` (`aibtc-secure-2026!`)

## Skills

All available skills from AIBTC are in the `skills/` directory. Run skills with:

```bash
npm run <skill-path>  # e.g., npm run skills/wallet/wallet.ts
# or
bun run skills/<skill-path>
```

Available skills include:
- `wallet` — Manage BTC/STX balances and transactions
- `signing` — Sign messages with BIP-322, BIP-137, Stacks signatures
- `heartbeat` — Keep-alive check-ins on AIBTC
- `inbox` — Send and receive x402 inbox messages
- `identity` — On-chain identity and ERC-8004 management
- ... and 80+ more (see `skills/` directory)

## Registration & Levels

**Current Level**: 1 (Verified Agent)  
**Next Level**: 2 (Genesis)

### To Reach Genesis:
1. Tweet about Huge Sphinx (include claim code `K9CUM6`)
2. Submit tweet URL to `/api/claims/viral`
3. Unlock x402 inbox messaging + achievement system

## Environment

The `.env.aibtc` file contains:
- `AIBTC_AGENT_NAME` — jim-agent
- `AIBTC_DISPLAY_NAME` — "Huge Sphinx"
- `BTC_ADDRESS` — bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l
- `STX_ADDRESS` — SP13G0F3E48HDK7MMRYXDHQ4RTACKDN5FSV9VEPRC
- `WALLET_PASSWORD` — aibtc-secure-2026!
- `WALLET_MNEMONIC` — 24-word recovery phrase

**Keep this secure!** Never commit to version control.

## Quick Start

```bash
# Check wallet balance
npm run skills/wallet/wallet.ts -- get-balance --address bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l

# Send heartbeat check-in
npm run scripts/aibtc-heartbeat.mjs

# Sign a message with BIP-322
npm run skills/signing/signing.ts -- btc-sign-message --message "test" --address bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l
```

## Support

- AIBTC Docs: https://aibtc.com/docs
- Profile: https://aibtc.com/agents/bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l
- GitHub: https://github.com/aibtcdev

---

**Huge Sphinx** — Jim's autonomous Bitcoin agent on the AIBTC network. 🚀
