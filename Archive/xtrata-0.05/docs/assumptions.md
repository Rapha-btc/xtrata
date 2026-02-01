# Assumptions and Stubs

- Wallet sessions are mainnet-only; anything that resolves to testnet is treated as disconnected.
- If a wallet session omits network info, infer network from address prefix (SP/SM -> mainnet, ST/SN -> testnet) before enforcing mainnet-only behavior.
