# Inscription Rendering Patch

This patch updates the Signal Board preview/rendering layer so it follows the same runtime/content model used by Signal King.

## What changed

- The app no longer renders every inscription through a generic iframe.
- It now probes `/runtime/content` with `HEAD` to detect the MIME type.
- Images render through an `<img>` using raw reconstructed content.
- Videos render through a muted looping `<video>` using raw reconstructed content.
- HTML/interactive inscriptions render through a sandboxed iframe using `/runtime/`.
- Local file testing falls back to the production `https://xtrata.xyz/runtime/content` and `https://xtrata.xyz/runtime/` routes.

## Why this matters

The preview square and the live board square should now show referenced Xtrata inscriptions in the tile itself when the inscription token ID is changed, matching the behaviour of the original Signal King reference file.
