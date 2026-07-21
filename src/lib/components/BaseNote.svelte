<script lang="ts" generics="T">
    import {game} from '$game'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {preventDefault} from '$core/utils/Utilities'
    import type {NoteImage} from '$lib/games/types'
    import GenshinNoteBorder from './GenshinNoteBorder.svelte'
    import SvgNote from './SvgNote.svelte'

    // Old: src/components/shared/Miscellaneous/BaseNote.tsx (105 lines) - the shared per-note
    // button used by the Player/Composer/Zen note components. None of those are ported yet this
    // task; BaseNote is pre-positioned ahead of its consumers the same way MenuSidebar's
    // hamburger slot is pre-positioned ahead of Task 8/9 - see this task's own report for the
    // dev-smoke caveat that follows from that (no real render to grep for yet).
    //
    // Reactivity: old used `useState` + a `mobx.observe(ThemeProvider.state.data, ...)` effect to
    // re-run `getTextColor()` on every theme change, disposing the observer on unmount. The
    // `ThemeProvider` singleton (aliased `theme` here, same alias ThemeVars.svelte uses) is
    // rune-backed (`this.state = $state(...)` in ThemeProvider.svelte.ts) - reading `theme.get(...)`
    // inside a `$derived` below auto-tracks it, so the manual subscribe/dispose dance collapses into
    // a plain derived value with identical behavior.
    //
    // Two-tier rule (src/lib/core/legacyConfig.ts header comment): this file lives in
    // src/lib/components, i.e. UI code, so GAME-DATA constants must be read from `$game` directly,
    // never from `$core/legacyConfig`'s re-exports (NOTES_CSS_CLASSES/BASE_THEME_CONFIG are exposed
    // there only for CORE files). Old -> new mapping used below:
    //   APP_NAME === 'Genshin'            -> game.features.hasNoteFrame
    //     (all 3 of this file's old APP_NAME checks - the <GenshinNoteBorder> render gate, the
    //     default border color, and getTextColor's luminosity branch - collapse to this one flag;
    //     docs/superpowers/audits/2026-07-19-app-name-audit.md lines 299-301 maps all three BaseNote
    //     rows to `features.hasNoteFrame`, and its own write-up (the "note-border cluster" note)
    //     explains why: they all describe one visual identity, not three independent behaviors.)
    //   NOTES_CSS_CLASSES.note / .noteName -> game.notes.cssClasses.note / .noteName
    //   BASE_THEME_CONFIG.text.*           -> game.themes.baseConfig.text.*
    //   SvgNotes (old shared/SvgNotes barrel) -> SvgNote.svelte (ported P3 Task 9)
    //   preventDefault (old $lib/utils/Utilities) -> restored into $core/utils/Utilities.ts by this
    //     same task (BaseNote is its first real consumer); retyped from `React.MouseEvent` to the
    //     DOM `Event` so one helper still covers both the pointerdown and contextmenu handlers below,
    //     matching how the old function was passed directly as `onContextMenu={preventDefault}`.
    //
    // `noteRef`: forwarded via Svelte's $bindable (the React `RefObject` equivalent) onto the inner
    // bordered div, matching the old `ref={noteRef}` target exactly. Grepped the whole old branch -
    // no caller ever read `noteRef.current`, only BaseNote.tsx's own declaration/attachment - so
    // this is a faithfully-ported but currently-dead part of the prop surface, same disclosure style
    // as the clickOutside `onOutside` MouseEvent-arg note from Task 1/8.
    //
    // `noteText` preserves an old quirk as-is: the prop TYPE is required (`noteText: string`, no
    // `?`) but the destructure still carries a `= 'A'` default, so the default is presently dead from
    // a type-system standpoint (any real caller must already pass noteText). Not "fixed" here.
    type BaseNoteData = {
        status: 'clicked' | string
    }

    let {
        data,
        noteText = 'A',
        handleClick,
        noteImage,
        clickClass = '',
        noteClass = '',
        noteRef = $bindable(),
    }: {
        data: T & BaseNoteData
        clickClass?: string
        noteClass?: string
        noteRef?: HTMLDivElement
        noteText: string
        handleClick: (data: T & BaseNoteData) => void
        noteImage?: NoteImage
    } = $props()

    function parseClass(status: string, clickClass: string) {
        let className = game.notes.cssClasses.note
        switch (status) {
            case 'clicked':
                className += ` click-event ${clickClass}`
                break
            default:
                break
        }
        return className
    }

    function parseBorderColor(status: string) {
        if (status === 'clicked') return 'transparent'
        if (status === 'wrong') return '#d66969'
        if (status === 'right') return '#358a55'
        return game.features.hasNoteFrame ? '#eae5ce' : 'unset'
    }

    function getTextColor() {
        const noteBg = theme.get('note_background')
        if (game.features.hasNoteFrame) {
            if (noteBg.luminosity() > 0.65) {
                return game.themes.baseConfig.text.note
            } else {
                return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
            }
        } else {
            return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
        }
    }

    const className = $derived(`${parseClass(data.status, clickClass)} ${noteClass}`)
    // old code called parseBorderColor(data.status) twice (once for the inline border-color style,
    // once for GenshinNoteBorder's fill prop) - it's a pure function of `status`, so this collapses
    // to one derived value reused both places without changing the result.
    const borderColor = $derived(parseBorderColor(data.status))
    const textColor = $derived(getTextColor())
</script>

<button
    onpointerdown={(e) => {
        preventDefault(e)
        handleClick(data)
    }}
    oncontextmenu={preventDefault}
    class="button-hitbox-bigger"
>
    <div bind:this={noteRef} class={className} style="border-color:{borderColor}">
        {#if game.features.hasNoteFrame}
            <GenshinNoteBorder className="genshin-border" fill={borderColor} />
        {/if}
        {#if noteImage}
            <SvgNote
                name={noteImage}
                background={data.status === 'clicked' ? 'var(--accent)' : 'var(--note-background)'}
            />
        {/if}
        <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
            {noteText}
        </div>
    </div>
</button>
