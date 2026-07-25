<script lang="ts">
    import type {SongStorable, SerializedSong} from '$core/Songs/Song'
    import {songService} from '$core/Services/SongService'
    import {logger} from '$stores/LoggerStore.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'

    // Old: src/components/pages/VsrgComposer/VsrgComposerMenu.tsx's local (non-exported)
    // `SelectSongRow` component (lines ~276-300) - the background-audio-song PICKER row (rendered
    // via the second `SongMenu` in the Settings panel, `exclude={['vsrg']}`). Sibling file NOT
    // explicitly named in this task's brief, same "brief-silent sibling" rationale as
    // VsrgComposerSongRow.svelte's own header comment (SongMenu.svelte's generic `SongComponent`
    // prop needs a real `Component<T>` reference). Named `VsrgComposerAudioSongRow` (not old's
    // "SelectSongRow", and old's own interface name for this component - "SeelctSongRowProps" - is a
    // pre-existing TS-only misspelling with zero runtime effect, not reproduced as a type name here).
    //
    // PRESERVED QUIRK: the tooltip text "Click to select as background song" is a raw, untranslated
    // literal in old (not routed through `t(...)`), matching this same file family's disclosed
    // untranslated-string pattern (see VsrgComposerSongRow.svelte's own header comment).
    let {
        data,
        onClick,
    }: {
        data: SongStorable
        onClick: (song: SerializedSong) => void
    } = $props()

    async function selectAsAudioSong() {
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error('Could not find song')
        onClick(song)
    }

    // old had no keyboard handler on the (bare onClick) row div - pre-existing a11y gap, same
    // additive role/tabindex/onkeydown fix already applied to every other SongRow sibling.
    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        selectAsAudioSong()
    }
</script>

<div
    class="song-row {hasTooltip(true)}"
    onclick={selectAsAudioSong}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
    style="cursor:pointer"
>
    <div class="song-name">
        {data.name}
    </div>
    <Tooltip>
        Click to select as background song
    </Tooltip>
</div>
