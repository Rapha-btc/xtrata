# Memo Message Board

Single-file bulletin board demo for Xtrata.

## What it does

- Displays one large board message.
- Watches incoming STX transfers for a configured address.
- Uses the newest qualifying transfer memo as the live message.
- Shows pending memos before confirmation so the board feels transactional.

## Important limit

This version is intentionally simple and uses standard STX transfer memos.
That means the message payload is limited to `34 bytes`, not `256` characters.

If you want `256` characters, keep the same HTML UI and switch the update path
to a contract call that accepts `(string-utf8 256)` or similar.

## Before inscribing

Edit `index.html`:

- Set `CONFIG.targetAddress`
- Set `CONFIG.minAmountMicroStx`
- Optionally set `CONFIG.requiredPrefix`
- Optionally set `CONFIG.apiKey`

Then inscribe that single `index.html` file.
