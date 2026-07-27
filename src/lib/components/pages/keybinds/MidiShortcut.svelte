<script lang="ts">
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {t} from '$i18n/binding.svelte'
    import type {MIDIShortcutName} from '$core/utils/Utilities'

    // No <style> block here: .midi-shortcut/.wrong/.right/.clicked/.selected are declared
    // :global() in MidiSetup.svelte's own <style> instead, since these classes land on a <button>
    // that AppButton.svelte's own template writes - a scoped style here could never reach it.
    let {status, onClick, type, selected, midi}: {
        status: string
        onClick: (data: string) => void
        type: MIDIShortcutName
        selected: boolean
        midi: number
    } = $props()
</script>

<AppButton class={['midi-shortcut', status]} toggled={selected} onclick={() => onClick(type)}>
    {t(`keybinds:shortcuts.${type}`)} ({midi === -1 ? 'N/A' : midi})
</AppButton>
