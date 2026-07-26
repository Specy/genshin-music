<script module lang="ts">
    // Old: VsrgPlayerKeyboard.tsx's own exported type - unchanged. Consumed (type-only) by
    // VsrgPlayerRenderer.ts/VsrgPlayerCanvas.svelte and the +page.svelte route.
    export type VsrgKeyboardLayout = 'line' | 'circles'
</script>

<script lang="ts">
    import {onMount} from 'svelte'
    import {KeyboardProvider} from '$lib/providers/KeyboardProvider'
    import {vsrgPlayerStore} from '$stores/VsrgPlayerStore.svelte'

    // Old: src/components/pages/VsrgPlayer/VsrgPlayerKeyboard.tsx (170 lines, TWO function
    // components - `VsrgPlayerKeyboard` + its own local, non-exported `VsrgPlayerKeyboardKey`) +
    // VsrgPlayerKeyboard.module.css (96 lines, MINUS the bare `.vsrg-player-key-circle` rule - see
    // the style block below). Both old components collapse into this ONE file:
    // `VsrgPlayerKeyboardKey` becomes a local, parameterized `{#snippet keyboardKey(...)}` - the
    // established idiom for a repeated sub-template used only within its own parent file.
    //
    // `useVsrgKeyboardLayout()` (old: a `mobx.observe`-subscribing hook copying
    // `vsrgPlayerStore.keyboard` into local React state) -> `vsrgPlayerStore.keyboard` read
    // DIRECTLY below: it is already a Svelte-reactive `$state` array (VsrgPlayerStore.svelte.ts), so
    // template reads stay live without a subscription hook, matching this migration's established
    // convention for every other mobx-observable-turned-`$state` field. `useVsrgKey(index, layout)`
    // (old: a PER-KEY `mobx.observe` hook) -> `vsrgPlayerStore.keyboard[index]` read directly inside
    // the snippet below, same reasoning (each key object is itself `$state`-proxied, so reading
    // `.isPressed`/`.key` off it is already fine-grained-reactive). Neither
    // `useVsrgKeyboardLayout.ts` nor `useVsrgKey.ts` is ported as a separate file - both hooks'
    // entire reason to exist (bridging a mobx-observable into React state) has no equivalent need
    // here.
    //
    // `useEffect(() => { KeyboardProvider.listen(...) x2; return unregister }, [layout])` - old
    // re-registered its physical-keyboard listeners on every `layout` CHANGE because its callback
    // closed over that specific `layout` ARRAY VALUE (a fresh copy `mobx.observe` handed it), which
    // would otherwise go stale after a key-count change (4 vs 6 keys, e.g. switching songs). This
    // port's callback reads `vsrgPlayerStore.keyboard` FRESH from the store on every physical
    // keypress instead of closing over a captured local `layout` variable, so it can never go stale
    // - the listeners are therefore registered ONCE in `onMount` (no re-registration on layout
    // change needed): same reachable-key-index result either way, since the store itself is always
    // the freshest source of truth - old's own re-registration existed purely to work around the
    // staleness of a closure-over-a-copy, not to change what index gets computed. Disclosed
    // simplification, not a behavior change.
    //
    // DISCLOSED GAP (do not silently "fix" - see the style block below for the full reasoning):
    // the bare `.vsrg-player-key-circle` rule is intentionally SKIPPED here per the standing 4c
    // delimiter (owned by `$cmp/pages/keybinds/VsrgKey.svelte`). Because Svelte scopes each
    // component's own style block independently, that rule's scope hash never reaches elements
    // rendered by THIS file, so - when `keyboardLayout` is set to `'circles'` (non-default; the
    // `keyboardLayout` setting's own default is `'line'`, BaseSettings.ts:595) - the bottom
    // `.vsrg-player-keyboard-circles` row's key buttons render without that rule's
    // background-color/color/border/border-radius/font-size/layout declarations (browser defaults
    // apply instead). In `'line'` mode (the default) the SAME class is only ever used inside the
    // `.vsrg-player-keyboard-control-left`/`-right` wings, where the compound `!important` override
    // rule below still applies its own sizing/rotation regardless. This is a real, narrow, disclosed
    // visual gap - not reachable on first load, only after a user explicitly switches the keyboard
    // layout setting to "circles".
    interface VsrgPlayerKeyboardProps {
        hitObjectSize: number
        keyboardLayout: VsrgKeyboardLayout
        offset: number
        verticalOffset: number
        horizontalOffset: number
    }

    let {
        hitObjectSize,
        offset,
        keyboardLayout,
        verticalOffset,
        horizontalOffset,
    }: VsrgPlayerKeyboardProps = $props()

    const layout = $derived(vsrgPlayerStore.keyboard)
    const perSide = $derived(Math.ceil(layout.length / 2))
    const left = $derived(layout.slice(0, perSide))
    // old: `layout.slice(perSide + middle)` where `middle = layout.length - perSide * 2` - always 0
    // for VSRG's only two supported key counts (4/6, both even), simplified here with zero
    // observable difference (disclosed, not silently dropped).
    const right = $derived(layout.slice(perSide))

    onMount(() => {
        KeyboardProvider.listen(({letter, event}) => {
            if (event.repeat) return
            const index = vsrgPlayerStore.keyboard.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.pressKey(index)
        }, {type: 'keydown', id: 'vsrg-player-keyboard'})
        KeyboardProvider.listen(({letter, event}) => {
            if (event.repeat) return
            const index = vsrgPlayerStore.keyboard.findIndex((l) => l.key === letter)
            if (index >= 0) vsrgPlayerStore.releaseKey(index)
        }, {type: 'keyup', id: 'vsrg-player-keyboard'})
        return () => {
            KeyboardProvider.unregisterById('vsrg-player-keyboard')
        }
    })
</script>

{#snippet keyboardKey(index: number, layoutType: VsrgKeyboardLayout, size: number)}
    {@const data = vsrgPlayerStore.keyboard[index]}
    {#if layoutType === 'circles'}
        <button
            class="vsrg-player-key-hitbox-circle flex-centered"
            style="padding-bottom:{offset}px"
            onpointerdown={() => vsrgPlayerStore.pressKey(index)}
            onpointerup={() => vsrgPlayerStore.releaseKey(index)}
            onpointerleave={() => vsrgPlayerStore.releaseKey(index)}
        >
            <div
                class="vsrg-player-key-circle {data?.isPressed ? 'vsrg-key-pressed' : ''}"
                style="width:{size}px;height:{size}px"
            >
                {data?.key}
            </div>
        </button>
    {:else if layoutType === 'line'}
        <!-- old's own <button> had no text/icon content and no aria-label either (a plain colored
             strip) - preserved as-is rather than inventing new a11y attributes old didn't have,
             same established convention as VsrgComposerKeyboard.svelte's identical select buttons. -->
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
            class="vsrg-player-key-hitbox-line"
            onpointerdown={() => vsrgPlayerStore.pressKey(index)}
            onpointerup={() => vsrgPlayerStore.releaseKey(index)}
            onpointerleave={() => vsrgPlayerStore.releaseKey(index)}
        >
            <div
                class="vsrg-player-key-line {data?.isPressed ? 'vsrg-key-pressed' : ''}"
                style="height:{offset}px"
            ></div>
        </button>
    {/if}
{/snippet}

{#if keyboardLayout === 'line'}
    <div
        class="vsrg-player-keyboard-control-left"
        style="--vertical-offset:calc(-{perSide * 2}vw + {verticalOffset * 0.1}rem);--horizontal-offset:{horizontalOffset * 0.1 + 1}rem"
    >
        {#each left as letter (`${letter.key}-${layout.length}`)}
            {@render keyboardKey(letter.index, 'circles', hitObjectSize)}
        {/each}
    </div>
    <div
        class="vsrg-player-keyboard-control-right"
        style="--vertical-offset:calc(-{perSide * 2}vw + {verticalOffset * 0.1}rem);--horizontal-offset:{horizontalOffset * 0.1 + 1}rem"
    >
        {#each right as letter (`${letter.key}-${layout.length}`)}
            {@render keyboardKey(letter.index, 'circles', hitObjectSize)}
        {/each}
    </div>
{/if}
<div class="vsrg-player-keyboard-circles">
    {#each layout as letter (`${letter.key}-${layout.length}`)}
        {@render keyboardKey(letter.index, keyboardLayout, hitObjectSize)}
    {/each}
</div>

<style>
    /* Old: VsrgPlayerKeyboard.module.css (96 lines). Every rule ported verbatim, in the SAME order
       as old, EXCEPT the bare `.vsrg-player-key-circle` rule (SKIPPED per the standing 4c delimiter
       - it already lives, scoped to itself, in $cmp/pages/keybinds/VsrgKey.svelte; VsrgKey.svelte's
       own header comment records the same delimiter from the other side). See this file's script
       header comment "DISCLOSED GAP" for the resulting, narrow visual consequence. */
    .vsrg-player-keyboard-circles {
        position: absolute;
        bottom: 0;
        display: flex;
        z-index: 2;
        width: 50vw;
        max-width: 35rem;
    }

    .vsrg-player-keyboard-control-left,
    .vsrg-player-keyboard-control-right {
        display: flex;
        flex-direction: column;
        position: absolute;
        bottom: var(--vertical-offset);
    }

    .vsrg-player-keyboard-control-left {
        left: var(--horizontal-offset);
        transform-origin: top left;
        transform: rotate(-35deg);
    }

    .vsrg-player-keyboard-control-right {
        flex-direction: column-reverse;
        right: var(--horizontal-offset);
        transform-origin: top right;
        transform: rotate(35deg);
    }

    .vsrg-player-keyboard-control-left .vsrg-player-key-circle,
    .vsrg-player-keyboard-control-right .vsrg-player-key-circle {
        width: 8vw !important;
        max-width: 5rem;
        height: 8vw !important;
        max-height: 5rem;
    }

    .vsrg-player-keyboard-control-left .vsrg-player-key-circle {
        transform: rotate(35deg);
    }

    .vsrg-player-keyboard-control-right .vsrg-player-key-circle {
        transform: rotate(-35deg);

    }

    /* Old's own second `.vsrg-player-keyboard-circles` rule was an EMPTY ruleset holding only a
       commented-out declaration (`transform: rotateX(35deg) translateZ(-4.5vh); magic number`,
       genuinely dead in old too - the class's real, effective rule is the one above). Svelte's own
       CSS compiler flags empty rulesets, so the dead declaration is preserved here as a plain
       comment instead of a second empty selector block - zero behavior change either way. */

    .vsrg-player-key-hitbox-circle,
    .vsrg-player-key-hitbox-line {
        cursor: pointer;
        border: none;
        background: none;
        padding: 0;
        margin: 0;
        flex: 1;
    }

    .vsrg-player-key-hitbox-line {
        height: 50vh;
        display: flex;
        align-items: flex-end;
    }

    .vsrg-player-key-hitbox-line:nth-child(odd) {
        filter: brightness(0.8);
    }

    .vsrg-player-key-line {
        width: 100%;
        height: 100%;
        background-color: var(--secondary);
    }

    .vsrg-key-pressed {
        background-color: var(--accent);
        color: var(--accent-text);
    }
</style>
