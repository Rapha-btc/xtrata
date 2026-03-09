# Public State Surface

Local design test harness for the Xtrata public programmable-state demo.

## What it does

- Displays one large live message.
- Watches incoming STX transfers for a configured address.
- Uses the newest valid message command as the live message.
- Uses the newest valid theme command as the live default skin.
- Shows pending memos before confirmation so the board feels transactional.
- Loads a shared base stylesheet plus 7 swappable theme files for rapid design testing.

## Memo command protocol

- Message update: `m:HELLO` or `📝HELLO`
- Theme switch: `t:cp` or `🎨cp`
- Combined update: `m:GM|t:cp` or `📝GM|🎨cp`
- Plain unprefixed memos still count as message updates for compatibility.

Theme aliases:

- `sw` = Signal Wall
- `cp` = Chain Pulse
- `sb` = State Beacon
- `of` = Open Feed
- `mr` = Message Reactor
- `pc` = Public Console
- `ls` = Live Signal

State lanes resolve independently:

- newest valid message command controls the text
- newest valid theme command controls the default skin

## Design names

- Signal Wall
- Chain Pulse
- State Beacon
- Open Feed
- Message Reactor
- Public Console
- Live Signal

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

Default `CONFIG.minAmountMicroStx` is now `1` microSTX (`0.000001 STX`).
That keeps the transfer amount minimal. Confirmation speed depends on the
transaction fee selected by the wallet, not on sending a larger amount.

For local design testing, `index.html` now loads:

- `styles/base.css`
- one of the 7 `styles/theme-*.css` files

For a final inscription, either inline the chosen CSS back into the HTML or
inscribe the CSS assets alongside the HTML and update the references accordingly.
