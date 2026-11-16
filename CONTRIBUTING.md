# Contributing

Thanks for wanting to help. This project is mostly driven by one maintainer and a
rotating cast of AI agents, so a little structure keeps it sane.

## Read first

- `AGENTS.md` — the full handover/context. **Read it before coding.**
- `docs/ARCHITECTURE.md` — the 10-minute map.
- `docs/DEPENDENCIES.md` — why `npm audit fix` must **not** be run here.

## Working with AI agents

- This repo has been built across many "coding sessions." Each round is captured
  in `AGENTS.md`'s round table and `CHANGELOG.md`.
- **Ideas and coding are separate sessions.** When asked for ideas, deliver a
  prose menu and stop — do not implement. Only build what the owner approves.
- Do not touch the sibling TDLib repo (`../photogram`).
- Never commit secrets: bot token, channel id, Expo token, release keystore,
  or any personal identity beyond the GitHub username `Avithegod2010`.

## Local workflow

1. `npm install` (or `npm ci`).
2. `npm run check` — runs `tsc --noEmit` **and** the test suite. CI runs the
   same on Node 24.
3. Add or extend a test under `tests/*.test.mjs` for any pure logic you change.
   Pure modules (`vecmath`, `pbkdf2`, `autotags`, `format`, `caption`, `trips`,
   `phash`, `motionScan`) can be imported directly by the suite.
4. Keep commits focused; the repo history is a clean narrative of rounds.

## Pull requests

- Fill in `.github/PULL_REQUEST_TEMPLATE.md`.
- The CI workflow (`.github/workflows/ci.yml`) must pass: typecheck, tests,
  critical-level audit gate, Metro bundle, and expo dependency drift.
- No secrets in the diff; no `package-lock.json` churn from `npm audit fix`.

## Device verification

Most features are "code-only" until exercised on a real Android device. If you
have a device, the checklist in `AGENTS.md` is the acceptance test. If you
don't, say so — do not claim hardware verification you didn't do.
