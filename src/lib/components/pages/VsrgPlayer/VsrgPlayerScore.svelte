<script lang="ts">
    import {VSRG_SCORE_COLOR_MAP} from '$core/legacyConfig'
    import {vsrgPlayerStore} from '$stores/VsrgPlayerStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/VsrgPlayer/VsrgPlayerScore.tsx (59 lines, TWO function components -
    // the default export `_VsrgPlayerScore` + its own local, non-exported `ScoreElement`) +
    // VsrgPlayerScore.module.css (71 lines, split with the sibling VsrgLatestScore.svelte - old's
    // `VsrgLatestScore.tsx` imports the SAME module file but only ever consumes its
    // `.vsrg-floating-score`/`.vsrg-floating-combo` rules, a disjoint subset from this file's own
    // `.vsrg-player-score`/`.vsrg-final-score`/`.floating-score-element` - so the CSS module splits
    // cleanly across its two real consumers with zero duplication needed, unlike a genuinely SHARED
    // rule like `.settings-group-title`, VsrgComposerMenu.svelte's own precedent for that case).
    //
    // `memo(_VsrgPlayerScore, (p, n) => false)` DROPPED - old's own comparator always returns
    // `false` ("never equal", i.e. always re-render), and the component takes zero props anyway, so
    // this memo call was already a complete no-op in old - doubly safe to drop (established
    // "Svelte 5 fine-grained reactivity replaces manual memoization" precedent, on top of the memo
    // itself never actually preventing a re-render).
    // `useVsrgScore()` (old: a `mobx.observe`-subscribing hook copying `vsrgPlayerStore.score` into
    // local React state) -> `vsrgPlayerStore.score` read directly below: already a Svelte-reactive
    // `$state` object, so template reads stay live without a subscription hook (same established
    // convention as VsrgPlayerKeyboard.svelte's `useVsrgKeyboardLayout`/`useVsrgKey` drop);
    // `useVsrgScore.ts` is not ported as a separate file - its entire reason to exist has no
    // equivalent need here.
    // `ScoreElement` -> a local `{#snippet scoreElement(...)}`, the established idiom for a
    // repeated sub-template used only within its own parent file.
    // `useTranslation('vsrg_player')`'s implicit default namespace means every old bare `t('x')`
    // call below becomes the explicit `t('vsrg_player:x')` this migration's global `t()` requires
    // everywhere (established rule, e.g. PlayerSongControls.svelte's header comment).
</script>

{#snippet scoreElement(text: string, number: number, color: string, gridArea: string)}
    <div class="floating-score-element row" style="grid-area:{gridArea}">
        <span style="color:{color}">
            {text}
        </span>
        <span>
            {number}
        </span>
    </div>
{/snippet}

<div class="vsrg-player-score">
    <div class="column space-between">
        <div>
            {vsrgPlayerStore.score.score}
        </div>
    </div>
</div>
{#if vsrgPlayerStore.score.scoreVisible}
    <div class="vsrg-final-score box-shadow">
        {@render scoreElement(t('vsrg_player:amazing'), vsrgPlayerStore.score.amazing, VSRG_SCORE_COLOR_MAP.amazing, 'a')}
        {@render scoreElement(t('vsrg_player:perfect'), vsrgPlayerStore.score.perfect, VSRG_SCORE_COLOR_MAP.perfect, 'b')}
        {@render scoreElement(t('vsrg_player:great'), vsrgPlayerStore.score.great, VSRG_SCORE_COLOR_MAP.great, 'c')}
        {@render scoreElement(t('vsrg_player:good'), vsrgPlayerStore.score.good, VSRG_SCORE_COLOR_MAP.good, 'd')}
        {@render scoreElement(t('vsrg_player:miss'), vsrgPlayerStore.score.miss, VSRG_SCORE_COLOR_MAP.miss, 'e')}
        <div class="row space-between" style="width:100%;align-items:center;grid-area:f">
            <div style="font-size:1.2rem">
                {t('vsrg_player:combo')}: {vsrgPlayerStore.score.combo}x
            </div>
            <div class="flex" style="font-size:1.2rem;align-items:center">
                {vsrgPlayerStore.score.score}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Old: VsrgPlayerScore.module.css's OWN 3 classes (this file's real subset - see script header
       comment). `animation: fadeIn 0.4s` below references a keyframe named `fadeIn` that is not
       defined ANYWHERE in old's whole CSS tree (verified via a repo-wide grep) - a pre-existing,
       harmless no-op animation reference already reproduced byte-for-byte by every earlier task
       that ported an old file using it (App.css/Composer.css/VsrgComposer.css/menu.css all
       reference the same undefined name), not something newly introduced here. */
    .vsrg-player-score {
        position: absolute;
        top: 2.4rem;
        right: 0.5rem;
        min-width: 5rem;
        margin-top: 1rem;
        text-shadow: 0 0 0.5rem #252525;
        font-size: 1.4rem;
        color: var(--background-text);
    }


    .vsrg-final-score {
        position: absolute;
        top: 20%;
        display: grid;
        grid-template-areas:
            'a b'
            'c d'
            'e e'
            'f f';;
        gap: 2rem;
        background-color: var(--primary);
        border-radius: 0.5rem;
        border: solid 2px var(--secondary);
        padding: 1rem;
        z-index: 10;
        margin-left: auto;
        margin-right: auto;
        animation: fadeIn 0.4s;
    }

    .floating-score-element {
        display: grid;
        align-items: center;
        gap: 1rem;
        grid-template-columns: 1fr min-content;
        font-size: 1.4rem;
    }
</style>
