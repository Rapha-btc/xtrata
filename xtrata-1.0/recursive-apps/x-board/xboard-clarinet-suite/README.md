# Xboard v1 Clarinet Suite

This is a runnable Clarinet project for the Xboard v1 contract draft.

## Files

- `contracts/xboard-v1.clar` - contract draft under test
- `tests/xboard-v1.test.ts` - Vitest/Clarinet SDK tests
- `Clarinet.toml` - Clarinet project config
- `package.json` - Node test dependencies and scripts
- `test-suite-plan.md` - plain-English coverage plan

## Run

```bash
npm install
clarinet check
npm test
```

## Notes

This is a test suite for a first implementation draft, not a completed audit.

Run `clarinet check` first. If the contract does not compile, fix compile errors before interpreting test results.

The suite deliberately covers the areas most likely to create permanent-money bugs:

- outbid accounting
- locked balance accounting
- release/unlink behaviour
- fee withdrawal separation
- pause behaviour
- programme validation
- tile/programme mismatch
