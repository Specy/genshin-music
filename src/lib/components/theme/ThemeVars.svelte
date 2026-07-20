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
    /* P3 Task 5 re-check (was flagged lower-confidence in P3 Task 4, before the
       global CSS existed to check it against): the old app had TWO nested
       wrapper divs here - a body-level flex column (`display:flex;
       flex-direction:column; width:100%; justify-content:center;
       min-height:100%`, src/app/layout.tsx) around ThemeProviderWrapper's own
       div (`display:flex; width:100%; flex:1`, i.e. an implicit flex ROW,
       src/components/shared/ProviderWrappers/ThemeProviderWrapper.tsx). This
       component is now the outermost wrapper in the new tree (app.html's body
       only contains a transparent `display:contents` slot - no separate
       body-level div exists or is planned), so it has to reproduce BOTH divs'
       combined computed effect on its own:
         - Height: the old outer div's `flex:1` made ThemeProviderWrapper's div
           grow to fill the body-level flex column's `min-height:100%`. Here
           there is no flex parent for `flex:1` to grow within (body is not a
           flex container - see App.css, also ported this task), so a literal
           `flex:1` would be inert and this div would collapse to content
           height instead of filling the viewport. `width:100%; height:100%`
           is the correct translation instead - it resolves against `html,
           body { height:100%; min-height:100vh }` (App.css), giving the same
           full-viewport sizing the old two-div chain produced.
         - flex-direction: the old INNER div (this one) was an implicit ROW
           (flex-direction was never set). That matters because App.css's
           `.default-content { flex:1 }` and `.app, .app-content
           { width:100%; ...no height... }` (AppBackground.svelte's root class,
           already ported in Task 4) both rely on being cross-axis-stretched to
           full height by a ROW-direction ancestor with a real height - exactly
           what ThemeProviderWrapper's row div provided. Switching this wrapper
           to `column` would break that stretch for whatever Task 7/8 eventually
           nest here (DefaultPage's whole flex chain assumes it). Kept as `row`
           (the old div's own default) so descendants keep getting that stretch
           for free, same as under the old two-div chain.
         - justify-content: kept from the old OUTER div for parity, though it
           was (and remains) inert in practice - the single child fills the
           main axis via width:100%/flex:1 either way. */
    .theme-vars-root {
        display: flex;
        flex-direction: row;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
</style>
