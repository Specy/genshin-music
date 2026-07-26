<script lang="ts">
    import {onMount, untrack} from 'svelte'
    import {VSRG_SCORE_COLOR_MAP} from '$core/legacyConfig'
    import {subscribeVsrgLatestScore, vsrgPlayerStore} from '$stores/VsrgPlayerStore.svelte'
    import type {Timer} from '$core/utils/Utilities'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/VsrgPlayer/VsrgLatestScore.tsx (78 lines) - the same
    // VsrgPlayerScore.module.css split with VsrgPlayerScore.svelte discussed in that file's header
    // comment: this file only ever consumed `.vsrg-floating-score`/`.vsrg-floating-combo`, a
    // disjoint subset, ported here.
    //
    // `memo(_VsrgPlayerLatestScore, (p, n) => false)` DROPPED - same no-op reasoning as
    // VsrgPlayerScore.svelte's own identical memo drop (zero props, comparator always `false`).
    // `useTranslation('vsrg_player')`'s implicit default namespace -> every old bare `t('x')`
    // becomes the explicit `t('vsrg_player:x')` this migration's global `t()` requires everywhere.
    // `useMemo(() => ({...6 translated labels}), [t, i18n.language])` DROPPED: a pure render-perf
    // memo of 6 `t()` calls, made moot by Svelte's own compiled fine-grained reactivity (same
    // established "Svelte 5 replaces manual memoization" precedent) - `t(\`vsrg_player:${data.type}\`)`
    // is called directly inline instead, only ever reached once `data.type` is narrowed truthy (same
    // short-circuit old's own `{data.type && translationMap[data.type]}` already relied on to never
    // look up the empty-string key).
    //
    // `useState(vsrgPlayerStore.score.lastScore)` - captures the CURRENT `lastScore` value once, at
    // mount, exactly like old (a plain `let data = $state(...)` initializer runs once too, not a
    // live binding to the store - every subsequent value comes from the `subscribeVsrgLatestScore`
    // callback below, matching old's own `useState`+`setData` shape exactly).
    //
    // `VSRG_SCORE_COLOR_MAP` (sharedConfig.ts) already carries old's own `'': '#ffffff'` entry, so
    // `VSRG_SCORE_COLOR_MAP[data.type]` is ALWAYS a defined string for every possible `data.type`
    // (the 6 hit types AND the blanked-out `''`) - no undefined-color edge case to handle.
    //
    // `style`/`setStyle` (old's own PERSISTENT inline-style state, starting at `defaultStyle =
    // {transform: 'rotate(0) scale(1)', color: 'var(--primary-text)'}` and thereafter replaced with
    // `{transform: `rotate(${angle}deg)`, color: VSRG_SCORE_COLOR_MAP[data.type]}` - dropping the
    // `scale(1)` token after the very first update, since CSS `transform` already defaults to
    // scale(1) with no scale() function present) -> two persisted `$state` primitives below
    // (`styleTransform`/`styleColor`), reproducing the exact same two-phase shape.
    let data = $state(vsrgPlayerStore.score.lastScore)
    let ref: HTMLDivElement | undefined = $state()
    let styleTransform = $state('rotate(0) scale(1)')
    let styleColor = $state('var(--primary-text)')

    onMount(() => {
        let lastTimeout: Timer = 0
        const dispose = subscribeVsrgLatestScore((d) => {
            data = d
            clearTimeout(lastTimeout)
            lastTimeout = setTimeout(() => {
                data = {...d, type: ''}
            }, 800)
        })
        return () => {
            dispose()
            clearTimeout(lastTimeout)
        }
    })

    $effect(() => {
        void data
        if (!ref) return
        const el = ref
        const angle = Math.floor(Math.random() * 25 - 12.5)
        const newColor = VSRG_SCORE_COLOR_MAP[data.type]
        // old comment: "don't need 'style' to dep array since we need to animate only when data
        // changes" - old's explicit `[data]` React dependency array never re-ran on `style`/
        // `setStyle`. REAL BUG CAUGHT (not a preserved old quirk - this claim used to say the
        // opposite and was wrong): `ref.animate(...)` below reads `styleTransform`/`styleColor`
        // ($state) as WAAPI keyframe values, and the two lines after it write fresh values to both
        // - a synchronous `$state` read ANYWHERE during a Svelte 5 effect's execution is tracked as
        // a dependency, even nested inside a function-call argument list, regardless of a top-level
        // `void data` line. Left untracked, this effect re-triggers on its own write, superseding
        // the just-started animation with a freshly-random angle every time - an unbounded loop
        // (live-reproduced: one scored hit fired 37 extra re-runs in a single burst) that only
        // stops once two consecutive `Math.random()` draws happen to coincide, and can throw
        // `effect_update_depth_exceeded` on an unlucky run. Same established fix as
        // `zen-keyboard/+page.svelte`'s `setKeyboardLayout` effect, `ZenNote.svelte`'s `statusId`
        // write, `Player.svelte`'s settings-sync effect, and `NumericalInput.svelte`'s `onChange`
        // effect (see that file's own comment for the full precedent list) - `untrack()` confines
        // this effect's tracked dependencies to exactly `{data, ref}`, matching old's `[data]`-only
        // array. `el` is a plain local copy of the already-guarded `ref` (not a new `$state` read) -
        // needed because TypeScript's control-flow narrowing from `if (!ref) return` above does not
        // carry into the nested `untrack()` closure.
        untrack(() => {
            el.animate([
                {transform: styleTransform, color: styleColor},
                {transform: `rotate(${angle}deg) scale(1.3)`, color: newColor},
                {transform: `rotate(0) scale(1)`, color: newColor},
            ], {
                duration: 150,
                easing: 'ease-out',
            })
            styleTransform = `rotate(${angle}deg)`
            styleColor = newColor
        })
    })
</script>

<div
    bind:this={ref}
    style="transform:{styleTransform};color:{styleColor}"
    class="vsrg-floating-score"
>
    {#if data.type}
        {t(`vsrg_player:${data.type}`)}
    {/if}
</div>
<div class="vsrg-floating-combo">
    {#if data.combo > 0}
        {data.combo}x
    {/if}
</div>

<style>
    .vsrg-floating-score,
    .vsrg-floating-combo {
        position: absolute;
        top: 70%;
        width: 12rem;
        left: calc(50% - 6rem);
        pointer-events: none;
        text-align: center;
        font-size: 2.4rem;
        font-weight: bold;
        text-shadow: 0 0 0.5rem #252525;
    }

    .vsrg-floating-combo {
        top: 30%;
        font-size: 3rem;
        opacity: 0.8;
    }

    @media only screen and (max-width: 920px) {
        .vsrg-floating-score {
            font-size: 1.8rem;
            top: 65%;
        }

        .vsrg-floating-combo {
            top: 20%;
            font-size: 2.4rem;
            opacity: 0.8;
        }
    }
</style>
