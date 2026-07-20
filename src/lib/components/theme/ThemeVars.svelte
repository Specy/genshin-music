<script lang="ts">
    import Color from 'color'
    import {SvelteMap} from 'svelte/reactivity'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {game} from '$game'
    import {colorToRGB} from '$core/utils/Utilities'

    let {children} = $props()

    // eslint-disable-next-line svelte/prefer-writable-derived
    let mounted = $state(false)
    $effect(() => {
        mounted = true
    })

    const vars = $derived.by(() => {
        const map = new SvelteMap<string, string>()
        const clickColor = theme.get('accent').isDark()
            ? theme.get('accent').mix(theme.get('note_background')).lighten(0.1)
            : theme.get('accent').mix(theme.get('note_background')).lighten(0.2)
        const backgroundDesaturate = theme.get('note_background').desaturate(0.6)
        const borderFill = backgroundDesaturate.isDark()
            ? backgroundDesaturate.lighten(0.50).toString()
            : backgroundDesaturate.darken(0.18).toString()
        map.set('--clicked-note', clickColor.toString())
        map.set('--note-border-fill', borderFill)
        for (const e of theme.toArray()) {
            const layers = [10, 20]
            const layersMore = [10, 15, 20]
            map.set(`--${e.css}`, e.value)
            map.set(`--${e.css}-rgb`, colorToRGB(theme.get(e.name)).join(','))
            map.set(`--${e.css}-text`, e.text)
            layers.forEach(v => map.set(`--${e.css}-darken-${v}`, theme.get(e.name).darken(v / 100).toString()))
            layers.forEach(v => map.set(`--${e.css}-lighten-${v}`, theme.get(e.name).lighten(v / 100).toString()))
            layersMore.forEach(v => map.set(`--${e.css}-layer-${v}`, theme.layer(e.name, v / 100).toString()))
        }
        for (const t of game.composer.tempoChangers) {
            map.set(`--tempo-changer-${t.id}`, Color(t.color).toString())
        }
        return map
    })
    const styleString = $derived([...vars].map(([k, v]) => `${k}:${v}`).join(';'))
    const rootBlock = $derived(`:root{--html-background:${theme.get('background').alpha(1).toString()};--background:${theme.get('background').toString()};--primary:${theme.get('primary').toString()};--background-text:${theme.getText('background')};}`)
</script>

<svelte:head>
    <svelte:element this={'style'}>{rootBlock}</svelte:element>
    <meta name="theme-color" content={theme.get(mounted ? 'primary' : 'accent').toString()} />
</svelte:head>

<div style={styleString} class="theme-vars-root">
    {@render children()}
</div>

<style>
    /* old ThemeProviderWrapper div: display:flex + width:100% + flex:1 inside layout.tsx's body-level column (outer div: min-height:100%). flex:1 has no parent flex until Task 7 assembles the shell — min-height:100% is the literal translation of the old outer sizing. Task 7/8: re-verify against the assembled shell with tall content. */
    .theme-vars-root {
        display: flex;
        width: 100%;
        min-height: 100%;
    }
</style>
