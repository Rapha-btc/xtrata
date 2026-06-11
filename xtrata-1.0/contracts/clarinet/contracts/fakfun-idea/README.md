# Bitcoin Pepe × Xtrata — make your Pepe live *forever*

Your Bitcoin Pepe's art lives on IPFS. If those pins ever drop, the picture is
gone — the token survives, the image doesn't. **Xtrata** stores image bytes
fully on-chain, permanently. This registry is the bridge: it lets a Bitcoin
Pepe holder mint a permanent, on-chain copy of their Pepe's art **without
burning anything and without leaving the Bitcoin Pepe collection.**

> TL;DR — You inscribe your Pepe's art on-chain once. After that you hold an
> on-chain **Xtrata twin** of your Pepe and can flip between "I want my Pepe" and
> "I want the on-chain twin" any time. The two can never both be loose at once,
> so there's always exactly one canonical token.

---

## What you get

- **A permanent on-chain inscription** ("the Xtrata twin") of your exact Pepe
  image — the bytes live on Stacks forever, reconstructable by anyone, no IPFS
  required.
- **Your Bitcoin Pepe is never burned.** It is preserved in the registry's
  escrow when you choose to hold the twin, and you can always pull it back.
- **One canonical identity at a time.** The registry guarantees the Pepe and its
  twin are never both circulating simultaneously.

---

## The one rule (the invariant)

For every Pepe you inscribe, the registry **always custodies exactly one side**
of the pair, and you hold the other:

| State | You hold | Registry holds |
|-------|----------|----------------|
| After you inscribe | your Pepe | the Xtrata twin |
| After you claim the twin | the Xtrata twin | your Pepe |
| After you claim the Pepe back | your Pepe | the Xtrata twin |

You flip between the two whenever you like. You never lose either one — they
just swap which side is in your wallet.

---

## What you can do

### 1. `inscribe` — mint your Pepe's on-chain twin (one time per Pepe)
You must **own the Pepe** you're inscribing. You pay the fee (see below), the
registry inscribes your Pepe's image on-chain via Xtrata, and the resulting twin
is escrowed in the registry **on mint**. You keep your Pepe.

### 2. `swap-pepe-for-xtrata` — get the twin into your wallet
Deposit your Pepe, withdraw the on-chain Xtrata twin. Now you hold the twin;
the registry safekeeps your Pepe.

> Note: your Pepe must **not be listed** on the Bitcoin Pepe marketplace when you
> deposit it (unlist it first).

### 3. `swap-xtrata-for-pepe` — get your Pepe back
Deposit the twin, withdraw your Pepe. Back to square one. Repeat as often as you
want.

---

## Once you hold the Xtrata twin

The twin is a normal Xtrata NFT in your wallet. You can:

- **Transfer or sell it** — standard SIP-009 transfer, plus the native Xtrata
  STX / sBTC / USDC markets.
- **Use it in recursive inscriptions** — the twin can be a *parent / dependency*
  of brand-new Xtrata inscriptions (ordinals-style recursion). Build on top of
  your forever-Pepe.
- **Read its art on-chain** — the image bytes and on-chain SVG are queryable
  directly from the Xtrata contract; no gateway needed.

What you **cannot** do is edit the image — Xtrata inscriptions are **sealed and
immutable** once minted. That permanence *is* the product.

(To do any of these you must be holding the twin — i.e. run
`swap-pepe-for-xtrata` first. Done with it? `swap-xtrata-for-pepe` puts your Pepe
back.)

---

## What it costs

Inscribing happens in a **single transaction**, and you (the holder) pay:

| Cost | Roughly | Goes to |
|------|---------|---------|
| Stacks network (miner) fee | a few thousandths of a STX | the miner |
| Xtrata protocol fee | ~0.1 STX | Xtrata |
| Registry fee | **free for the first 69**, then 3 STX | the project (split 50/50) |

Swapping back and forth only costs the network (miner) fee.

The registry fee is tunable by the contract owner: the free-tier size, the
standard fee, and **per-address discounts** for big supporters (a discount can
only ever *lower* a fee, never raise it).

---

## Safety

- **No burn, ever.** Your Pepe is escrowed, never destroyed. There is no admin
  "withdraw" path — the only way assets leave escrow is through your own swaps.
- **You must own the Pepe** to inscribe it; nobody can inscribe yours.
- **One twin per Pepe** — a Pepe can't be double-inscribed.
- **Immutable art** — the on-chain bytes are sealed at mint and can never change.

---

## Will my Pepe fit?

`inscribe` uses Xtrata's single-transaction path, which holds files up to
**512 KiB** (32 chunks × 16 KiB). Every Bitcoin Pepe image is a small pixel-art
PNG — a few kilobytes — so the entire collection fits with enormous headroom.
(All 2,089 images were measured; the largest is well under 10 KB.) The frontend
still checks each image's byte size before inscribing, as a belt-and-suspenders
guard.

---

## For other collections

This registry is **single-collection by design** — it's hardwired to Bitcoin
Pepe. To bring "live forever" to another Gamma collection, clone this contract
and change the two constants at the top:

```clarity
(define-constant MASTER 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3) ;; keep
(define-constant SOURCE 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe)  ;; <- your collection
```

Everything else — escrow, swaps, fees, discounts — works as-is.

---

## Addresses

| Thing | Contract |
|-------|----------|
| Xtrata master (inscriber) | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3` |
| Bitcoin Pepe (source) | `SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe` |
| This registry | `xtrata-collection-registry-v1.0` |

*Files: `xtrata-collection-registry-v1.0.clar` (mainnet-addressed deployment copy)
lives here; a clarinet-checkable copy using local aliases lives one folder up in
`contracts/` and is what the test suite runs against.*
