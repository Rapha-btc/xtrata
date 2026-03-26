## Runtime Browser Smoke Tests

This folder contains Playwright-driven runtime smoke coverage for module-backed
apps and synths.

### Default target

The checked-in default target is the RetroKeys synth:

- contract: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- token: `259`
- network: `mainnet`

### Local run

Use the local Pages-style server when your environment allows local listeners:

```bash
npm run test:browser -- browser-tests/runtime-smoke.pw.ts
```

This starts:

- `npm run build`
- `wrangler pages dev dist ...`
- Playwright against the local app URL

### Remote deployed run

Use this when local `wrangler pages dev` is blocked or when you want to hit a
branch deployment directly:

```bash
PLAYWRIGHT_BASE_URL=https://new-runtime.xtrata.pages.dev \
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
npm run test:browser:remote -- browser-tests/runtime-smoke.pw.ts
```

### Optional target overrides

You can override the built runtime target without editing the repo:

- `PLAYWRIGHT_RUNTIME_URL`
- `PLAYWRIGHT_RUNTIME_CONTRACT_ID`
- `PLAYWRIGHT_RUNTIME_TOKEN_ID`
- `PLAYWRIGHT_RUNTIME_NETWORK`
- `PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH`
- `PLAYWRIGHT_RUNTIME_EXPECTED_TEXT`
- `PLAYWRIGHT_RUNTIME_FALLBACK_CONTRACT_ID`

If `PLAYWRIGHT_RUNTIME_URL` is set, it takes precedence over the contract/token
builder.
