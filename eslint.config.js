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
        files: ['**/*.svelte'],
        languageOptions: {
            parserOptions: {parser: ts.parser},
        },
    },
    {
        // Parked until Phase 2 repoints the barrel; fixtures are data.
        // .claude/ is a local-only leftover of deleted worktrees (see
        // .gitignore) — never tracked, not part of this repo's source.
        ignores: ['build/', '.svelte-kit/', 'static/', 'test/', 'node_modules/', '.claude/'],
    }
)
