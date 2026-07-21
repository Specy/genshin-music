<script lang="ts">
    import type {Snippet} from 'svelte'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import type {SettingUpdate, SettingUpdateKey, SettingsSelect} from '$core/types/SettingsPropriety'

    // Old: src/components/shared/Settings/Select.tsx - the settings-pane-specific select, DISTINCT
    // from the generic `inputs/Select.svelte` (old `Inputs/Select.tsx`, ported Phase 3 Task 5).
    // Renamed `SettingsSelect` (matching this task's file list) to avoid colliding with that
    // sibling component's name.
    //
    // Old took `theme: Theme` as a prop, threaded all the way down from SettingsPane -> SettingsRow
    // -> Select. Every other already-ported component in this tree instead imports the reactive
    // `ThemeProvider` singleton directly (established Phase 3 - see `inputs/Select.svelte`,
    // `BaseNote.svelte`); done the same way here, dropping the `theme` prop (SettingsRow.svelte's
    // own local `theme`/`useTheme()` is dropped the same way).
    //
    // Old also took a separate `type: string | number` prop, always called by its only caller
    // (SettingsRow) as `data.options[0]` - since `data` is passed in as its own prop anyway,
    // `data.options[0]` is read directly below instead of threading a second, fully-derivable prop.
    //
    // The inline SVG chevron built from the theme's text color is the exact same `$derived`
    // mechanism `inputs/Select.svelte` already established - kept identical here (byte-for-byte),
    // per this task's dispatch.
    let {
        value,
        onChange,
        data,
        objectKey,
        children,
    }: {
        value: string | number
        data: SettingsSelect
        objectKey: SettingUpdateKey
        children: Snippet
        onChange: (data: SettingUpdate) => void
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLSelectElement}) {
        onChange({
            key: objectKey,
            data: {
                ...data,
                value: typeof data.options[0] === 'number' ? parseInt(e.currentTarget.value) : e.currentTarget.value
            }
        })
        e.currentTarget.blur()
    }

    const backgroundImage = $derived(
        `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
    )
</script>

<select value={value} onchange={handleChange} style="background-image:{backgroundImage}">
    {@render children()}
</select>
