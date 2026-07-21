<script lang="ts" generics="K extends string, V extends Shortcut<string>">
    import {cn} from '$core/utils/Utilities'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import IconButton from '$cmp/inputs/IconButton.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import Row from '$cmp/layout/Row.svelte'
    import {createKeyComboComposer, type Shortcut} from '$stores/KeybindsStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: the local (non-exported) `ShortcutElement` function component inside
    // src/components/pages/Keybinds/ShortcutEditor.tsx - split into its own file, same extraction
    // convention this task applies to `VsrgKey` (see that file's own header comment) and per the
    // brief's own "small sanctioned refactor" allowance: Svelte has no equivalent of "two function
    // components defined in one module", each one needing its own component-instance state/effects
    // for a KEYED list (this row's `newKey` must persist per-row across the parent's re-renders,
    // which a plain snippet - re-inlined, no component-instance identity of its own - can't give).
    let {mapKey, value, selected, setSelected, onChangeShortcut}: {
        mapKey: K
        value: V
        selected: boolean
        setSelected: (key: K) => void
        onChangeShortcut: (key: K, shortcut: V) => void
    } = $props()

    // Old: `const [newKey, setNewKey] = useState<K>(mapKey)` + `useEffect(() => setNewKey(mapKey),
    // [mapKey, selected])` (a second effect that discards any in-progress, unconfirmed key-combo
    // edit whenever this row is deselected - e.g. the user clicked a DIFFERENT row without
    // confirming this one - not just when `mapKey` itself changes). Collapsed into one *writable*
    // `$derived.by` (Svelte >=5.25): reading `newKey` tracks both `mapKey` and `selected` (the
    // `void selected` forces the second dependency even though it isn't part of the returned
    // value, matching old's explicit `[mapKey, selected]` array - same idiom as
    // `$i18n/binding.svelte.ts`'s `void binding.tick`); the key-combo-capture effect below can
    // still assign `newKey = ...` directly to diverge from it locally while the user types a new
    // combo, and that override is itself overwritten the next time `mapKey`/`selected` change -
    // the same "diverge locally, resync on prop change" shape `inputs/ColorPicker.svelte`/
    // `settings/SettingsRow.svelte` already established, just with two tracked dependencies
    // instead of one (`$derived`'s single-expression form can't `void`-track a second value, so
    // `$derived.by` is used here instead of the bare `$derived(...)` those two files use).
    let newKey: K = $derived.by(() => {
        void selected
        return mapKey
    })

    // Old: `useEffect(() => { if (!selected) return; return createKeyComboComposer(...) }, [selected,
    // value])`. `createKeyComboComposer`'s id is old's own literal `` `shortcut_${value}` `` -
    // PRESERVED QUIRK (flagged, not fixed): `value` is the whole `Shortcut<string>` object, not
    // `value.name`, so this string-interpolates to the literal `"shortcut_[object Object]"` for
    // EVERY row, not a per-row-unique id (almost certainly meant `value.name`). Harmless in
    // practice: only one `ShortcutElement` is ever `selected` at a time (the parent `ShortcutEditor`
    // holds a single shared `selected` key), so at most one instance's listener is ever registered
    // under this id simultaneously - reproduced byte-for-byte per the "preserve old quirks/bugs"
    // convention.
    $effect(() => {
        if (!selected) return
        return createKeyComboComposer(`shortcut_${value}`, ({keyCombo}) => {
            newKey = keyCombo.join('+') as K
        })
    })
</script>

{#snippet faCheckIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"/></svg>
{/snippet}

<div class={cn(
    'row shortcut-element',
    [selected, 'shortcut-element-selected'],
    hasTooltip(value.description)
)}>
    <Row align="center" gap="0.4rem">
        {t(`shortcuts:props.${value.name}`)}
        {#if value.holdable}
            <div style="font-size:0.8rem">({t('shortcuts:holdable')})</div>
        {/if}
    </Row>
    <Row gap="0.4rem">
        {#if selected}
            <IconButton cssVar="accent" onclick={() => onChangeShortcut(newKey, value)}>
                {@render faCheckIcon()}
            </IconButton>
        {/if}
        <AppButton className="shortcut-button" onclick={() => setSelected(mapKey)}>
            {newKey}
        </AppButton>
    </Row>
    {#if value.description}
        <Tooltip>
            {t(`shortcuts:props.${value.description}`)}
        </Tooltip>
    {/if}
</div>

<style>
    /* Old: src/components/pages/Keybinds/ShortcutEditor.module.css, byte-verbatim (the whole
       module belonged exclusively to this row - see Separator.svelte's own header comment for the
       same "CSS Module dedicated entirely to this component" precedent). */
    .shortcut-element {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        padding: 0.4rem;
        width: min-content;
        min-width: 30vw;
        padding-left: 1rem;
        border-radius: 0.4rem;
        background-color: var(--primary);
        color: var(--primary--text);
    }

    @media screen and (max-width: 920px) {
        .shortcut-element {
            min-width: 50vw;
        }
    }

    .shortcut-element-selected {
        outline: solid 0.1rem var(--accent);
    }

    /* :global() - this class is threaded through AppButton's `className` prop and lands on a
       <button> AppButton.svelte itself writes; a plain scoped selector here could never reach it
       (Svelte only scope-hashes elements a component's OWN template literally writes - same
       cross-component-boundary reasoning as MidiShortcut.svelte's own header comment). */
    :global(.shortcut-button) {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
