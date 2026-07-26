import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs['flat/recommended'],
    {
        languageOptions: {
            globals: {...globals.browser, ...globals.node},
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
        languageOptions: {
            parserOptions: {parser: ts.parser},
        },
    },
    {
        // test/: FINAL DECISION (P5 Task 7 — closes the "revisit with formatter/EOL decision in
        // Phase 5" note this comment used to carry). KEEP the ignore. The tie-breaker the decision
        // was conditioned on was run: `npx eslint test/ --no-ignore` is NOT clean (5 errors, all
        // @typescript-eslint/no-explicit-any: 2 in composedSong.test.ts, 1 each in golden.ts,
        // primitives.test.ts, recordedSong.test.ts), and the suite has been green and stable
        // since Phase 2. Enabling lint on it now would surface a batch of style-only findings at
        // the exact point this branch needs to be frozen for review, for zero behavioral benefit.
        // No further revisit.
        // .claude/ is a local-only leftover of deleted worktrees (see
        // .gitignore) — never tracked, not part of this repo's source.
        // .superpowers/ is the same kind of local-only scratch: the SDD progress ledger plus
        // old-blobs-* dirs where review agents parked old-app .tsx files for side-by-side diffing.
        // Gitignored and never tracked, but eslint walked into them and reported 10 errors from
        // pre-migration React source, making `npm run lint` red in any working copy that ran the
        // workflow — including for a contributor following README.md's own instruction to run it.
        // (Whole-branch final review follow-up F27; prescribed there as exactly this one-line fix.)
        // src/lib/core: byte-verbatim ported legacy — lint debt PERMANENTLY accepted for this
        // migration's duration (P2 review adjudication; reaffirmed as a standing decision, not a
        // pending one, by P5 Task 7). Any future cleanup is a separate post-migration call.
        ignores: ['build/', '.svelte-kit/', 'static/', 'test/', 'node_modules/', '.claude/', '.superpowers/', 'src/lib/core/'],
    }
)
