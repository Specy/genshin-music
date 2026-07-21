<script lang="ts">
    import {onMount} from 'svelte'
    import {game} from '$game'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import BaseNote from '$cmp/BaseNote.svelte'
    import {KeyboardProvider} from '$lib/providers/KeyboardProvider'
    import type {KeyboardCode} from '$lib/providers/KeyboardProvider/KeyboardTypes'
    import type {VsrgSongKeys} from '$core/Songs/VsrgSong'
    import {keyBinds} from '$stores/KeybindsStore.svelte'
    import {Instrument} from '$lib/audio/Instrument.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import ShortcutEditor from '$cmp/pages/keybinds/ShortcutEditor.svelte'
    import VsrgKey from '$cmp/pages/keybinds/VsrgKey.svelte'
    import MidiSetup from '$cmp/pages/keybinds/MidiSetup.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/app/_client-pages/keybinds/index.tsx (217 lines). `useObservableMap`/
    // `useObservableArray` (mobx-observable -> React-state bridges) are dropped outright:
    // `keyBinds.getShortcutMap(page)` returns a live `SvelteMap` (KeybindsStore.svelte.ts) and
    // `keyBinds.getVsrgKeybinds(n)` returns a plain `string[]` living inside that store's own
    // `$state` object - both are ALREADY reactive Svelte 5 runes state, read directly with no
    // wrapper (same collapse as every other mobx-hook removal across this migration).
    //
    // `useConfig().IS_MOBILE` -> `globalConfigStore.state.IS_MOBILE` (GlobalConfigStore.svelte.ts,
    // ported P3 Task 1).
    //
    // The `KeyboardProvider.listen(..., {id: 'keybinds'})` registration lived inside
    // `useEffect(..., [selected])` old - re-subscribing (unregister + listen again) on every
    // `selected` change purely so the callback's closure captured the LATEST `selected` value
    // (a React closure-staleness workaround). `selected` here is Svelte `$state`, read live on
    // every invocation regardless of when the listener was registered - so registering once in
    // `onMount` (cleaning up on unmount) is behaviorally identical and needs no re-subscribe.
    //
    // Two-tier rule: `APP_NAME === 'Sky' ? 'keyboard-5' : ''` -> `game.notes.perColumn === 15 ?
    // 'keyboard-5' : ''` (UI code reads `$game` directly, never `$core/legacyConfig`'s GAME-DATA -
    // Sky's 15-note-per-column layout is what old's Sky-only ternary was really keying off of).
    const baseInstrument = new Instrument()

    let selected = $state<{type: string; index: number}>({type: '', index: -1})

    const composerShortcuts = keyBinds.getShortcutMap('composer')
    const playerShortcuts = keyBinds.getShortcutMap('player')
    const vsrgComposerShortcuts = keyBinds.getShortcutMap('vsrg_composer')
    const vsrgPlayerShortcuts = keyBinds.getShortcutMap('vsrg_player')

    onMount(() => {
        setPageVisited('keybinds')
        KeyboardProvider.listen(
            ({letter, code}) => {
                if (letter === 'Escape') {
                    selected = {type: '', index: -1}
                    return
                }
                const {type, index} = selected
                const note = baseInstrument.getNoteFromIndex(index)
                if (type === 'keyboard' && index !== -1) {
                    // note is non-null whenever `index` came from a real note-grid click below
                    // (old trusted this identically, with no null check of its own)
                    const existing = keyBinds.setKeyboardKeybind(note!.noteNames.keyboard, code)
                    if (existing !== undefined) logger.warn(t('keybinds:already_used_keybind', {note_name: existing.name}))
                    selected = {type: '', index: -1}
                }
                if (['k4', 'k6', 'k8'].includes(type) && index !== -1) {
                    const kind = Number(type.replace('k', '')) as VsrgSongKeys
                    keyBinds.setVsrgKeybind(kind, index, letter)
                    selected = {type: '', index: -1}
                }
            },
            {id: 'keybinds'}
        )
        return () => KeyboardProvider.unregisterById('keybinds')
    })
</script>

<DefaultPage>
    <PageMetadata text={t('home:keybinds_or_midi_name')} description="Change the app keyboard keybinds and MIDI input keys" />
    <h1>
        {t('keybinds:midi_keybinds')}
    </h1>
    <MidiSetup />
    {#if !globalConfigStore.state.IS_MOBILE}
        <h1>
            {t('keybinds:keyboard_keybinds')}
        </h1>
        <div>
            {t('keybinds:keyboard_keybinds_description')}
        </div>
        <div class="flex-centered">
            <div class="keyboard {game.notes.perColumn === 15 ? 'keyboard-5' : ''}" style="margin:1rem 0">
                {#each baseInstrument.notes as note, i (i)}
                    {@const key = keyBinds.getKeyOfShortcut('keyboard', note.noteNames.keyboard)}
                    <BaseNote
                        data={{status: selected.type === 'keyboard' && i === selected.index ? 'clicked' : ''}}
                        noteImage={baseInstrument.notes[i].noteImage}
                        noteText={key ? (KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key) : '???'}
                        handleClick={() => {
                            selected = {type: 'keyboard', index: selected.index === i ? -1 : i}
                        }}
                    />
                {/each}
            </div>
        </div>

        <h1>
            {t('keybinds:composer_shortcuts')}
        </h1>
        <div class="column">
            <ShortcutEditor
                map={composerShortcuts}
                onChangeShortcut={(oldKey, newKey) => {
                    if (oldKey === newKey) return
                    const existing = keyBinds.setShortcut('composer', oldKey, newKey)
                    if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                }}
            />
        </div>
        <h1>
            {t('keybinds:player_shortcuts')}
        </h1>
        <div class="column">
            <ShortcutEditor
                map={playerShortcuts}
                onChangeShortcut={(oldKey, newKey) => {
                    if (oldKey === newKey) return
                    const existing = keyBinds.setShortcut('player', oldKey, newKey)
                    if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                }}
            />
        </div>
        <h1>
            {t('keybinds:vsrg_composer_shortcuts')}
        </h1>
        <div class="column">
            <ShortcutEditor
                map={vsrgComposerShortcuts}
                onChangeShortcut={(oldKey, newKey) => {
                    if (oldKey === newKey) return
                    const existing = keyBinds.setShortcut('vsrg_composer', oldKey, newKey)
                    if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                }}
            />
        </div>
        <h1>
            {t('keybinds:vsrg_player_shortcuts')}
        </h1>
        <div class="column">
            <ShortcutEditor
                map={vsrgPlayerShortcuts}
                onChangeShortcut={(oldKey, newKey) => {
                    if (oldKey === newKey) return
                    const existing = keyBinds.setShortcut('vsrg_player', oldKey, newKey)
                    if (existing) logger.warn(`This shortcut is already used by the "${existing}" action`)
                }}
            />
        </div>
        <h1>
            {t('keybinds:vsrg_keybinds')}
        </h1>
        <div class="column" style="margin-left:1rem">
            {@render vsrgKeyGroup('k4', keyBinds.getVsrgKeybinds(4))}
            {@render vsrgKeyGroup('k6', keyBinds.getVsrgKeybinds(6))}
        </div>
    {/if}
</DefaultPage>

{#snippet vsrgKeyGroup(type: 'k4' | 'k6', keys: string[])}
    <!-- Old: `[k4, k6].map((keys, j) => <Fragment key={j}>...</Fragment>)` iterated two React
         state ARRAYS wrapped in a fresh literal each render - harmless in React (the whole
         component function re-runs on every state change, so `k4`/`k6` are always read fresh).
         PORTED-AS-A-BUG-THEN-FIXED (not a preserved quirk - a genuine Svelte-specific regression
         caught via interactive smoke testing, not present in old): a literal top-level `let k4 =
         keyBinds.getVsrgKeybinds(4)` + `{#each [k4, k6] as keys, j (j)} {#each keys as key, i
         (i)}...{/each}{/each}` compiled but did NOT reactively update the rendered letter after
         `keyBinds.setVsrgKeybind(...)` mutates `keys[i]` in place - verified via real UI
         interaction: the underlying store update DID persist correctly (localStorage's
         `Genshin_keybinds.vsrg.k4` held the new letter), but the DOM text stayed stale until a
         full reload. Root cause: `keyBinds.getVsrgKeybinds(n)` returns the SAME array reference
         before and after a `keys[i] = x` in-place mutation (only an element changed, never the
         array's own identity) - wrapping that live array in a fresh `[k4, k6]` literal, one extra
         indirection removed from the actual `$state`-proxied source, was enough to lose Svelte's
         fine-grained per-element tracking through the nested each-blocks. Calling
         `keyBinds.getVsrgKeybinds(n)` DIRECTLY at each `{@render}` call site (a snippet, taking
         the array as a plain parameter) puts the reactive read directly in a tracked template
         position with no intermediate variable/array-literal layer between it and the `{#each
         keys as key, i (i)}` that actually indexes it - confirmed fixed via the same live-UI
         reproduction. One snippet + two call sites (rather than the old single Fragment loop)
         since Svelte has no equivalent of iterating over named local variables the way
         `[k4, k6].map(...)` does. -->
    <h2>
        {keys.length} keys
    </h2>
    <div class="row">
        {#each keys as key, i (i)}
            <VsrgKey
                letter={key}
                isActive={selected.type === type && selected.index === i}
                handleClick={(willBeSelected) => {
                    selected = {type, index: willBeSelected ? i : -1}
                }}
            />
        {/each}
    </div>
{/snippet}
