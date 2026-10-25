import {flushSync, mount, unmount} from 'svelte'
import {afterEach, describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createInstance} from 'i18next'
import Markdown from '../src/lib/components/utility/Markdown.svelte'
import {escapeMarkdown, parseMarkdown} from '../src/lib/components/utility/markdown'
import {AVAILABLE_LANGUAGES, i18n} from '../src/lib/i18n/i18n'

const english = JSON.parse(readFileSync('static/locales/en.json', 'utf8'))

// Translated markdown is rendered without ever being treated as markup (see markdown.ts): marked
// only tokenizes it, and what survives is a fixed set of nodes rendered as escaped text. These
// pin both halves - what the set keeps, and that everything outside it arrives as plain text.
describe('translated markdown', () => {
    let target: HTMLDivElement | undefined
    let component: ReturnType<typeof mount> | undefined

    afterEach(() => {
        if (component) unmount(component)
        target?.remove()
        component = undefined
        target = undefined
    })

    function render(source: string): HTMLDivElement {
        target = document.createElement('div')
        document.body.append(target)
        component = mount(Markdown, {target, props: {source}})
        flushSync()
        return target
    }

    it('renders the supported subset as elements, with no stray spaces around inline ones', () => {
        const root = render(
            '## Title\n\nUse the **Composer** and *practice*, or `code`.\n\n- one [link](/composer)\n- two\n\n1. first\n2. second'
        )
        expect(root.querySelector('h2')?.textContent).toBe('Title')
        expect(root.querySelector('p')?.textContent).toBe('Use the Composer and practice, or code.')
        expect(root.querySelector('p strong')?.textContent).toBe('Composer')
        expect(root.querySelector('p em')?.textContent).toBe('practice')
        expect(root.querySelector('p code')?.textContent).toBe('code')
        expect([...root.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['one link', 'two'])
        expect(root.querySelector('ul a')?.getAttribute('href')).toBe('/composer')
        expect(root.querySelectorAll('ol > li')).toHaveLength(2)
    })

    it('starts headings at h2, since the page owns the h1', () => {
        const root = render('# Top\n\n### Sub')
        expect(root.querySelector('h1')).toBeNull()
        expect(root.querySelector('h2')?.textContent).toBe('Top')
        expect(root.querySelector('h3')?.textContent).toBe('Sub')
    })

    it('opens https links in a new tab and drops every other kind of link to its text', () => {
        const root = render(
            '[site](https://specy.app) [js](javascript:alert(1)) [http](http://example.com) [proto](//evil.example)'
        )
        const links = [...root.querySelectorAll('a')]
        expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://specy.app'])
        expect(links[0].getAttribute('target')).toBe('_blank')
        expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
        expect(root.textContent).toBe('site js http proto')
    })

    it('renders raw HTML and images as text, never as elements', () => {
        const root = render('<img src=x onerror=alert(1)> <b>bold</b> ![alt text](/a.png)\n\n<script>alert(1)</script>')
        expect(root.querySelector('img, b, script')).toBeNull()
        expect(root.textContent).toContain('<b>bold</b>')
        expect(root.textContent).toContain('alt text')
        expect(root.textContent).toContain('<script>alert(1)</script>')
    })

    it('escapes interpolated names so markdown syntax in them stays literal', () => {
        const names = escapeMarkdown('A_B, *C*, [D](/x)')
        expect(parseMarkdown(names)).toEqual([
            {kind: 'paragraph', children: [{kind: 'text', text: 'A_B, *C*, [D](/x)'}]},
        ])
    })

    it('each game has its about text, and it interpolates the instrument list as given', () => {
        for (const key of ['home:about_genshin', 'home:about_sky'] as const) {
            const INSTRUMENTS = 'Lyre & <Harp>'
            const text = i18n.t(key, {APP_NAME: 'Test', INSTRUMENTS})
            expect(text).toContain(INSTRUMENTS)
            expect(text).not.toContain('{{')
            expect(parseMarkdown(text)[0]).toMatchObject({kind: 'heading', level: 2})
        }
    })

    it.each(AVAILABLE_LANGUAGES.flatMap(language =>
        (['genshin', 'sky'] as const).map(game => ({language, game}))
    ))('renders the $game About text in $language with its links and instrument names intact', async ({language, game}) => {
        const locale = JSON.parse(readFileSync(`static/locales/${language}.json`, 'utf8'))
        const translator = createInstance()
        await translator.init({lng: language, fallbackLng: false, resources: {[language]: locale}, interpolation: {escapeValue: false}})
        const key = `home:about_${game}` as const
        const instrumentNames = 'Lyre & <Harp>, A_B'
        const text = translator.t(key, {APP_NAME: 'Test App', INSTRUMENTS: escapeMarkdown(instrumentNames)})
        const root = render(text)

        expect(root.querySelector('h2')?.textContent).toContain('Test App')
        expect(root.querySelectorAll('h3')).toHaveLength(4)
        expect(root.textContent).toContain(instrumentNames)
        expect(root.textContent).not.toContain('{{')
        expect(root.querySelector('harp')).toBeNull()
        const expectedLinks = [...english.home[`about_${game}`].matchAll(/\]\(([^)]+)\)/g)]
            .map(match => match[1]).sort()
        expect([...root.querySelectorAll('a')].map(link => link.getAttribute('href')).sort()).toEqual(expectedLinks)
        expect(translator.t(`home:title_${game}`)).toBe(locale.home[`title_${game}`])
        expect(translator.t(`home:description_${game}`)).toBe(locale.home[`description_${game}`])
    })
})
