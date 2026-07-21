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
        // test/ linting deferred; suite is live since Phase 2 (revisit with formatter/EOL decision in Phase 5)
        // .claude/ is a local-only leftover of deleted worktrees (see
        // .gitignore) — never tracked, not part of this repo's source.
        // src/lib/core: byte-verbatim ported legacy — lint debt accepted until post-migration cleanup (P2 review adjudication)
        ignores: ['build/', '.svelte-kit/', 'static/', 'test/', 'node_modules/', '.claude/', 'src/lib/core/'],
    }
)
