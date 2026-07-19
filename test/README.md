# Test suite

Golden-fixture tests that lock the current app's serialized data formats —
songs, themes, settings, config surface — ahead of the SvelteKit port. Each
fixture is a snapshot of what today's Next.js/React code produces; the port
is done when it reproduces every fixture byte-for-byte.

## Running

- `npm test` — both games (runs `test:genshin` then `test:sky`)
- `npm run test:genshin` / `npm run test:sky` — a single game

## Regenerating fixtures

`npm run test:update-fixtures` is ONLY for adding fixtures under brand-new
fixture names. It is never a way to make a failing test pass: if a comparison
fails against an existing fixture, the fixture is ground truth and the code
is wrong. See the header comment in `golden.ts`.

## Portability contract (for the SvelteKit port)

Repoint `test/imports.ts` only — every test imports app code exclusively
through that barrel, so porting the suite is a one-file job. Keep a
desktop-UA jsdom environment: `BaseSettings` calls `isMobile()` at module
load, so a mobile UA would silently change the `settings-defaults` fixture.
Fixture directories are named by the legacy `storageId` (`Genshin`/`Sky`),
not the lowercase `id`.

## Phase 1 status (parked)

The app source this suite verified was removed with the Next app; the suite
resumes in Phase 2 when `test/imports.ts` is repointed at the ported core
(`$core/...`). Until then `npm test` fails at import resolution — that is the
expected state; fixtures remain the untouched ground truth. Env var changed:
game selection is now `PUBLIC_GAME=genshin|sky` (fixture directories keep
their legacy cased names `Genshin`/`Sky`; the barrel will export the game's
`storageId` under the name `APP_NAME` to bridge that).
