import {readFileSync} from 'node:fs'
import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('$app/navigation', () => ({afterNavigate: vi.fn()}))
vi.mock('../src/lib/components/shell/SimpleMenu.svelte', () => ({default: () => {}}))
vi.mock('../src/lib/components/shell/HomeContent.svelte', () => ({default: () => {}}))
vi.mock('../src/lib/components/shell/HomeAbout.svelte', () => ({default: () => {}}))

import HomePage from '../src/lib/components/shell/HomePage.svelte'
import {game} from '$game'
import {AVAILABLE_LANGUAGES, i18n} from '../src/lib/i18n/i18n'

describe('localized homepage metadata', () => {
    let target: HTMLDivElement
    let component: ReturnType<typeof mount>

    beforeEach(async () => {
        await i18n.changeLanguage('en')
        target = document.createElement('div')
        document.body.append(target)
        component = mount(HomePage, {target})
        flushSync()
    })

    afterEach(async () => {
        await unmount(component)
        target.remove()
        await i18n.changeLanguage('en')
    })

    function meta(selector: string) {
        return document.head.querySelector(selector)?.getAttribute('content')
    }

    function applicationDescription() {
        const script = document.head.querySelector('script[type="application/ld+json"]')
        return JSON.parse(script?.textContent ?? '{}').description
    }

    it('updates the title, previews and structured description when the language changes', async () => {
        expect(document.title).toBe(game.meta.homeTitle)
        expect(meta('meta[name="description"]')).toBe(game.meta.description)
        for (const language of AVAILABLE_LANGUAGES) {
            const {home} = JSON.parse(readFileSync(`static/locales/${language}.json`, 'utf8'))
            i18n.addResourceBundle(language, 'home', home, true, true)
            await i18n.changeLanguage(language)
            flushSync()

            const title = home[`title_${game.id}`]
            const description = home[`description_${game.id}`]
            expect(document.title).toBe(title)
            expect(meta('meta[property="og:title"]')).toBe(title)
            expect(meta('meta[name="twitter:title"]')).toBe(title)
            expect(meta('meta[name="description"]')).toBe(description)
            expect(meta('meta[property="og:description"]')).toBe(description)
            expect(meta('meta[name="twitter:description"]')).toBe(description)
            expect(applicationDescription()).toBe(description)
        }
    })

    it('keeps markup in a translated description inside the JSON-LD string', async () => {
        const description = 'A translated description </script><img data-injected="true" src="x"> & more'
        i18n.addResourceBundle('it', 'home', {[`description_${game.id}`]: description}, true, true)
        await i18n.changeLanguage('it')
        flushSync()

        expect(applicationDescription()).toBe(description)
        expect(meta('meta[name="description"]')).toBe(description)
        expect(document.querySelector('[data-injected]')).toBeNull()
    })
})
