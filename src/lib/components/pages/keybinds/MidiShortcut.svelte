<script lang="ts">
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {t} from '$i18n/binding.svelte'
    import type {MIDIShortcutName} from '$core/utils/Utilities'

    // Old: src/components/pages/MidiSetup/MidiShortcut.tsx. `s[status]`/`s['midi-shortcut']`
    // (MidiSetup.module.css) become plain global class names. This file has NO <style> block of
    // its own: `.midi-shortcut`/`.midi-shortcut.wrong`/`.right`/`.clicked`/`.selected` are declared
    // as `:global(...)` rules inside MidiSetup.svelte's <style> (see that file's own header
    // comment) because the class is threaded through `AppButton`'s `className` prop and lands on a
    // `<button>` that AppButton.svelte itself writes - a scoped <style> here or in MidiSetup.svelte
    // could never reach it (Svelte scope-hashes only the elements a component's OWN template
    // literally writes, not classNames passed through a child's props), the exact same reason
    // AppButton's own `.app-button`/`.icon-app-button`/`.active` live in the GLOBAL App.css instead
    // of a scoped <style> (AppButton.svelte's own header comment says so explicitly).
    //
    // `useTranslation('keybinds')` (default ns 'keybinds') -> bare `t('shortcuts.' + type)` becomes
    // the explicit `t('keybinds:shortcuts.' + type)` the global `t()` binding requires everywhere in
    // this migration (no implicit-default-namespace convenience, see e.g. changelog/+page.svelte).
    //
    // Old: `className={\`${s['midi-shortcut']} ${s[status]}\`}` - when `status` is the empty string
    // ('' is a real MIDINote/MIDIShortcut status value, meaning "no state yet"), `s['']` is
    // `undefined` in a real CSS Modules object, and the template literal renders the literal text
    // "undefined" into the DOM class list (harmless - no selector targets `.undefined`). Normalized
    // away here per the established precedent for this exact class of quirk (Card.svelte's own
    // `className ?? ''` fix, P4a Task 7's blog components) rather than reproducing the literal
    // "undefined" token.
    let {status, onClick, type, selected, midi}: {
        status: string
        onClick: (data: string) => void
        type: MIDIShortcutName
        selected: boolean
        midi: number
    } = $props()
</script>

<AppButton className="midi-shortcut {status}" toggled={selected} onclick={() => onClick(type)}>
    {t(`keybinds:shortcuts.${type}`)} ({midi === -1 ? 'N/A' : midi})
</AppButton>
