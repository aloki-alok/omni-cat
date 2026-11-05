# AGENTS.md

omni-cat is a Claude Code mod (plugin) in TypeScript on Bun. It draws a pixel character above the prompt and runs OmniDimension test calls. Its key constraint: it runs only inside Claude Code, so tests and checks go through the `claude plugin` command.

## Commands

- Test (all 28 tests): `claude plugin test .`
- Validate the plugin manifest: `claude plugin validate .`
- Render frames for the README images: `bun tools/dump-frames.ts > /tmp/frames.json`
- Compose the images: `uv run --with pillow python tools/compose.py /tmp/frames.json docs/assets`

There is no build step, no `package.json` and no linter. Do not run plain `bun test`: the test files import `claude-code/testing`, which only `claude plugin test` provides.

## Layout

- `.claude-plugin/plugin.json`: plugin name, version and the user settings (`api_key`, `agent_id`, `phone`, `mascot`).
- `.claude-plugin/marketplace.json`: lets `claude plugin marketplace add aloki-alok/omni-cat` find the plugin.
- `hooks/register.tsx`: the mod entry point. Registers `/omni`, the call state, polling and drawing.
- `hooks/art.ts`: pixel grids for each character (cat, crab, logo) and the drawing function.
- `hooks/lib.ts`: pure helpers that parse call logs and decide when a call has ended.
- `hooks/hooks.json`: lists the module Claude Code loads (`./register.tsx`).
- `hooks/*.test.ts`: tests that sit next to the code they cover.
- `types/index.d.ts`: shared types (`Call`, `Phase`, `Result`).
- `tools/`: scripts that render `docs/assets` (GIF, character sheet, social card). Not shipped logic.

## Rules

- The API key goes only to `https://omnidim.io/api/v1`, over https. Keep it a `sensitive` setting in `plugin.json`. Never log it or write it to a file.
- Make only two kinds of request: `POST /calls/dispatch` and `GET /calls/logs`. Send no analytics or telemetry. The README promises this.
- A test call is a real call and costs credits. Never dial from a test or a script. Use `/omni demo` for anything that needs no account.
- A call counts as finished only when someone spoke, or when the platform reports why not (no answer, busy, failed, voicemail). Keep that rule in `hooks/lib.ts`.
- Keep logic that needs no UI in `hooks/lib.ts` so it stays testable. Put new tests next to the file, as `*.test.ts`.
- If you change a pixel grid, re-render `docs/assets` with the two commands above. Check the README images still match.
- Keep `.claude-plugin/types/`, `node_modules/` and `tsconfig.json` out of git (see `.gitignore`).
- Terminals without true color show approximate colors. The desktop app and the VS Code panel do not show the mod.

## Before you open a PR

The repo has no CI. Run both checks and expect green:

1. `claude plugin test .` (28 pass, 0 fail)
2. `claude plugin validate .` (`Validation passed`)
