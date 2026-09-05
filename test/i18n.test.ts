import {describe, expect, it} from 'vitest'
import {readFileSync, readdirSync} from 'node:fs'
import {join, sep} from 'node:path'
import {i18n, isLanguageLoaded, setI18nLanguage} from '../src/lib/i18n/i18n'

describe('i18n core', () => {
    it('boots with bundled english and translates a known key', () => {
        expect(isLanguageLoaded('en')).toBe(true)
        expect(i18n.t('common:confirm')).toBeTypeOf('string')
        expect(i18n.t('common:confirm').length).toBeGreaterThan(0)
    })
    it('setI18nLanguage falls back gracefully for an unfetchable locale', async () => {
        const ok = await setI18nLanguage(i18n, 'ja')  // fetch fails in vitest (no server) -> cache miss -> false
        expect(ok).toBe(false)
        expect(i18n.language ?? 'en').toBeTruthy()
    })
})

/**
 * INTERPOLATED VALUES ARE NOT HTML-ESCAPED BY i18next, and the pair of tests below is the whole
 * reason that is safe (see i18n.ts's `interpolation` block).
 *
 * i18next escapes by default on the assumption that its output is headed for innerHTML. Here it
 * never is - every translated string is rendered as Svelte TEXT - so the escaping happened twice
 * and the entities reached the screen literally: a song called "Wanderer / Bad Data" was reported
 * as "Wanderer &#x2F; Bad Data" by the backup page's validation toast, and any name holding
 * & < > " ' or / was mangled the same way.
 */
describe('interpolation hands values through unescaped, and Svelte is what escapes them', () => {
    it('a name full of HTML metacharacters survives interpolation intact', () => {
        const song_name = `Wanderer / <b>Bad</b> & "Data"`
        expect(i18n.t('backup:error_validating_song', {song_name})).toBe(
            `Error validating song "${song_name}"`
        )
    })

    /**
     * THE INVARIANT THAT KEEPS THE ABOVE SAFE: nothing renders a translated string as MARKUP. A
     * repo-wide check rather than a list of the surfaces that interpolate names today, because the
     * risk is a `{@html}` added later over a `t(...)` - which is exactly the edit this catches and
     * a per-surface test would not.
     */
    /**
     * ALLOWLISTED, and the bar for adding to this list is high: the value must be machine
     * generated and escaped at the point of interpolation, never a translated or
     * user-supplied string.
     *
     * HomePage.svelte emits the page's schema.org JSON-LD, which has to be a real <script>
     * element - <svelte:element this="script"> renders nothing in Svelte, and a literal
     * <script> in a component is taken as its instance script, so {@html} is the only way.
     * Its payload comes from game.json via seo.ts's serializeJsonLd, which escapes < > and
     * & so nothing interpolated can close the tag.
     */
    const HTML_ALLOWED = new Set(['src/lib/components/shell/HomePage.svelte'])

    it('no component renders anything with {@html}', () => {
        const offenders: string[] = []
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir, {withFileTypes: true})) {
                const path = join(dir, entry.name)
                if (entry.isDirectory()) walk(path)
                else if (
                    entry.name.endsWith('.svelte') &&
                    readFileSync(path, 'utf8').includes('{@html') &&
                    !HTML_ALLOWED.has(path.split(sep).join('/'))
                )
                    offenders.push(path)
            }
        }
        walk('src')
        expect(offenders).toEqual([])
    })

    it('no allowlisted {@html} interpolates a translated string', () => {
        for (const path of HTML_ALLOWED) {
            const source = readFileSync(path, 'utf8')
            for (const [, expression] of source.matchAll(/\{@html ([\s\S]*?)\}\n/g)) {
                expect(expression, `${path} interpolates t() into {@html}`).not.toMatch(/\bt\(/)
            }
        }
    })
})
