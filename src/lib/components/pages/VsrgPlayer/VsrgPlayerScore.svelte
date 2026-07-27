<script lang="ts">
    import {VSRG_SCORE_COLOR_MAP} from '$core/legacyConfig'
    import {vsrgPlayerStore} from '$stores/VsrgPlayerStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // vsrgPlayerStore.score is a Svelte-reactive $state object, so the template reads below stay
    // live without a subscription.
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
    /* QUIRK: animation: fadeIn 0.4s below references a keyframe that isn't defined anywhere
       globally (App.css/Theme.css have no @keyframes fadeIn; the only such keyframes are scoped
       inside other components' own <style> blocks) - a harmless no-op, not newly introduced here.
       The same undefined reference recurs elsewhere in this codebase's CSS; don't "fix" it here by
       inventing a keyframe, or drop it as unused without checking those other sites too. */
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
