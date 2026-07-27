<script lang="ts">
    import {onMount} from 'svelte'
    import {game} from '$game'
    import BaseNote from '$cmp/BaseNote.svelte'
    import MidiShortcut from './MidiShortcut.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import type {MIDINote, MIDIShortcut as MIDIShortcutData} from '$core/utils/Utilities'
    import type {InstrumentName} from '$core/types'
    import type {MIDIPreset} from '$lib/games/types'
    import {MIDIProvider, type MIDIEvent} from '$lib/providers/MIDIProvider'
    import {AudioProvider} from '$lib/providers/AudioProvider'
    import {AudioPlayer} from '$lib/audio/AudioPlayer'
    import {InstrumentData} from '$core/Songs/SongClasses'
    import {Instrument} from '$lib/audio/Instrument.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import Separator from '$cmp/Separator.svelte'
    import {t} from '$i18n/binding.svelte'

    // mounted is an unmount-race guard, not just a redundant flag: loadInstrument below actively
    // destroys a late-resolving AudioPlayer load when it resolves after unmount - real cleanup
    // behavior, not decoration to remove.

    // WebMidi is an ambient global namespace (@types/webmidi, referenced in src/app.d.ts); plain
    // .ts files resolve it fine (typescript-eslint's recommended config turns off no-undef there,
    // deferring to tsc), but .svelte script blocks go through eslint-plugin-svelte's own
    // recommended config, which doesn't carry that same override - same gap fixed in AppInit.svelte's
    // identical WebMidi.MIDIInput[] usage.
    type MidiAccessStatus =
        // eslint-disable-next-line no-undef
        | {status: 'granted'; midiAccess: WebMidi.MIDIAccess}
        | {status: 'denied'}
        | {status: 'unsupported'}
        | {status: 'pending'}

    const baseInstrument = new Instrument()
    const audioPlayer = new AudioPlayer('C')
    let mounted = true

    // QUIRK (load-bearing): MIDINote/MIDIShortcut are plain, non-reactive classes - their fields
    // are mutated in place (e.g. note.status = ...) rather than through $state. $state does not
    // deep-proxy class instances and skips notifying on a referentially-unchanged reassignment, so
    // every `notes = [...notes]` / `shortcuts = [...MIDIProvider.settings.shortcuts]` below is
    // forcing a fresh array reference to make the already-mutated elements visible again - it is
    // not redundant spreading to "clean up". Removing any of these silently breaks reactivity for
    // that update.
    let notes: MIDINote[] = $state(MIDIProvider.notes)
    let currentPreset = $state('default')
    let midiAccess: MidiAccessStatus = $state({status: 'pending'})
    let shortcuts: MIDIShortcutData[] = $state(MIDIProvider.settings.shortcuts)
    let presets: MIDIPreset[] = $state(MIDIProvider.getPresets())
    let selectedNote: MIDINote | null = $state(null)
    let selectedShortcut: string | null = $state(null)
    // eslint-disable-next-line no-undef
    let sources: WebMidi.MIDIInput[] = $state([])

    async function init() {
        await loadInstrument(game.instruments.list[0])
        if (!('requestMIDIAccess' in navigator)) {
            midiAccess = {status: 'unsupported'}
        } else {
            const res = await MIDIProvider.init()
            if (res) {
                midiAccess = {status: 'granted', midiAccess: res}
            } else {
                // means it was not previously requested, try again now:
                const access = await MIDIProvider.requestAccess()
                if (access) {
                    midiAccess = {status: 'granted', midiAccess: access}
                } else {
                    midiAccess = {status: 'denied'}
                }
            }
        }
        MIDIProvider.addInputsListener(midiStateChange)
        MIDIProvider.addListener(handleMidi)
        sources = MIDIProvider.inputs
        notes = [...MIDIProvider.notes]
        currentPreset = MIDIProvider.settings.selectedPreset
        shortcuts = [...MIDIProvider.settings.shortcuts]
        presets = MIDIProvider.getPresets()
    }

    // eslint-disable-next-line no-undef
    function midiStateChange(inputs: WebMidi.MIDIInput[]) {
        if (!mounted) return
        sources = inputs
    }

    function deselectNotes() {
        notes.forEach((note) => {
            note.status = note.midi < 0 ? 'wrong' : 'right'
        })
        notes = [...notes]
    }

    async function loadInstrument(name: InstrumentName) {
        const result = await audioPlayer.syncInstruments([new InstrumentData({name})])
        if (result.some((e) => !e)) return logger.error('Error loading instrument')
        if (!mounted) return audioPlayer.destroy()
    }

    function checkIfMidiIsUsed(midi: number, type: 'all' | 'shortcuts' | 'notes') {
        if (shortcuts.find((e) => e.midi === midi) && ['all', 'shortcuts'].includes(type)) return true
        if (notes.find((e) => e.midi === midi) && ['all', 'notes'].includes(type)) return true
        return false
    }

    function loadPreset(name: string) {
        MIDIProvider.loadPreset(name)
        notes = [...MIDIProvider.notes]
        currentPreset = name
    }

    function handleMidi([eventType, note, velocity]: MIDIEvent) {
        if (MIDIProvider.isDown(eventType) && velocity !== 0) {
            if (selectedNote) {
                if (checkIfMidiIsUsed(note, 'shortcuts')) return logger.warn(t('keybinds:key_already_used'))
                deselectNotes()
                if (MIDIProvider.isPresetBuiltin(currentPreset)) return logger.warn(t('keybinds:cannot_edit_builtin_preset'))
                MIDIProvider.updateNoteOfCurrentPreset(selectedNote.index, note, 'right')
                selectedNote = null
                notes = [...MIDIProvider.notes]
            }
            if (selectedShortcut) {
                const shortcut = shortcuts.find((e) => e.type === selectedShortcut)
                if (checkIfMidiIsUsed(note, 'all')) return logger.warn(t('keybinds:key_already_used'))
                if (shortcut) {
                    MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right')
                    shortcuts = [...MIDIProvider.settings.shortcuts]
                }
            }
            const shortcut = shortcuts.find((e) => e.midi === note)
            if (shortcut) {
                MIDIProvider.updateShortcut(shortcut.type, note, 'clicked')
                setTimeout(() => {
                    MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right')
                    shortcuts = [...MIDIProvider.settings.shortcuts]
                }, 150)
                shortcuts = [...MIDIProvider.settings.shortcuts]
            }
            const keyboardNotes = notes.filter((e) => e.midi === note)
            keyboardNotes.forEach((keyboardNote) => {
                handleClick(keyboardNote, true)
            })
        }
    }

    function handleClick(note: MIDINote, animate = false) {
        if (!animate) deselectNotes()
        note.status = 'clicked'
        if (animate) {
            setTimeout(() => {
                note.status = note.midi < 0 ? 'wrong' : 'right'
                notes = [...notes]
            }, 200)
            notes = [...notes]
            selectedShortcut = null
        } else {
            notes = [...notes]
            selectedNote = note
            selectedShortcut = null
        }
        playSound(note)
    }

    function handleShortcutClick(shortcut: string) {
        deselectNotes()
        if (selectedShortcut === shortcut) {
            selectedShortcut = null
            selectedNote = null
            return
        }
        selectedShortcut = shortcut
        selectedNote = null
    }

    function playSound(note: MIDINote) {
        if (note === undefined) return
        audioPlayer.playNoteOfInstrument(0, note.index)
    }

    async function createPreset() {
        while (true) {
            const name = await asyncPrompt(t('keybinds:ask_preset_name'))
            if (!name) return
            if (MIDIProvider.isPresetBuiltin(name) || presets.some((p) => p.name === name)) {
                logger.warn(t('keybinds:already_existing_preset'))
                continue
            }
            MIDIProvider.createPreset({name, notes: notes.map(() => -1)})
            presets = MIDIProvider.getPresets()
            loadPreset(name)
            return
        }
    }

    async function deletePreset(name: string) {
        if (MIDIProvider.isPresetBuiltin(name)) return logger.warn(t('keybinds:cannot_delete_builtin_preset'))
        if (!(await asyncConfirm(t('keybinds:confirm_delete_preset', {preset_name: name})))) return
        MIDIProvider.deletePreset(name)
        MIDIProvider.loadPreset('default')
        presets = MIDIProvider.getPresets()
        notes = [...MIDIProvider.notes]
        currentPreset = 'default'
    }

    onMount(() => {
        init()
        return () => {
            mounted = false
            audioPlayer.destroy()
            MIDIProvider.removeInputsListener(midiStateChange)
            MIDIProvider.removeListener(handleMidi)
            AudioProvider.clear()
        }
    })
</script>

{#snippet faTrashIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z" /></svg>
{/snippet}

{#snippet faPlusIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
{/snippet}

<Column gap="1rem">
    <Row justify="between">
        <div>{t('keybinds:midi_status')}:</div>
        <div>{t(`keybinds:midi_access_${midiAccess.status}`)}</div>
    </Row>
    <Row gap="1rem" align="center" justify="between">
        {t('keybinds:connected_midi_devices')}:
        <Row gap="0.5rem" style="flex-wrap:wrap">
            {#if sources.length > 0}
                {#each sources as source (source.id)}
                    <div style="border-radius:0.3rem;padding:0.2rem 0.4rem;border:solid 0.1rem var(--secondary)">
                        {source.name} - {source.id}
                    </div>
                {/each}
            {:else}
                {t('keybinds:no_connected_devices')}
            {/if}
        </Row>
    </Row>
    <Separator height="0.1rem" background="var(--secondary)" />
    <Row justify="between" gap="0.5rem">
        {t('keybinds:midi_layout_preset')}:
        <Row gap="0.5rem">
            <select
                class="midi-select"
                style="margin-left:0.5rem"
                value={currentPreset}
                onchange={(e) => loadPreset(e.currentTarget.value)}
            >
                <optgroup label="App presents">
                    {#each game.midi.presets as preset (preset.name)}
                        <option value={preset.name}>{preset.name}</option>
                    {/each}
                </optgroup>
                <optgroup label="Your presets">
                    {#each presets as preset (preset.name)}
                        <option value={preset.name}>{preset.name}</option>
                    {/each}
                </optgroup>
            </select>
            <AppButton onclick={() => deletePreset(currentPreset)} className="flex items-center" style="gap:0.5rem">
                {@render faTrashIcon()}
                {t('keybinds:delete_midi_preset')}
            </AppButton>
            <AppButton onclick={createPreset} className="flex items-center" style="gap:0.5rem">
                {@render faPlusIcon()}
                {t('keybinds:create_midi_preset')}
            </AppButton>
        </Row>
    </Row>
    <div style="margin:0.5rem 0">
        {t('keybinds:midi_note_selection_description')}
    </div>
</Column>

<div class="midi-setup-content">
    <div class={game.notes.perColumn === 15 ? 'keyboard keyboard-5' : 'keyboard'} style="margin:1.5rem 0;width:fit-content">
        {#each notes as note, i (i)}
            <BaseNote
                handleClick={() => handleClick(note)}
                data={note}
                noteImage={baseInstrument.notes[i]?.noteImage}
                noteText={note.midi < 0 ? 'N/A' : String(note.midi)}
            />
        {/each}
    </div>
    <div class="midi-shortcuts-wrapper">
        <h1>
            {t('keybinds:midi_shortcuts')}
        </h1>
        <div class="midi-shortcuts">
            {#each shortcuts as shortcut (shortcut.type)}
                <MidiShortcut
                    type={shortcut.type}
                    status={shortcut.status}
                    midi={shortcut.midi}
                    selected={selectedShortcut === shortcut.type}
                    onClick={handleShortcutClick}
                />
            {/each}
        </div>
    </div>
</div>

<style>
    /* QUIRK: the :global(.midi-shortcut*) rules below are REQUIRED, not a scoping violation to
       "fix" - that class is threaded through MidiShortcut.svelte's own AppButton className prop,
       landing on a <button> that its own template writes, which a plain scoped selector here could
       never reach. */
    .midi-setup-content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        margin-top: auto;
    }

    .midi-shortcuts-wrapper {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        flex: 1;
    }

    .midi-shortcuts {
        display: flex;
        gap: 0.2rem;
        flex-wrap: wrap;
        width: 100%;
    }

    :global(.midi-shortcut) {
        margin: 0.2rem;
        transition: all 0.1s;
        padding: 0.2rem 0.5rem;
        font-size: 1rem;
    }

    :global(.midi-shortcut.wrong) {
        background-color: #d66969;
    }

    :global(.midi-shortcut.right) {
        background-color: rgb(53, 138, 85);
    }

    :global(.midi-shortcut.clicked) {
        transform: scale(0.95);
        background-color: var(--secondary);
    }

    /* QUIRK: dead CSS - status only ever resolves to 'wrong'/'right'/'clicked' (MIDIShortcut's own
       status union), never the literal "selected", so this rule can never match. Kept anyway
       (unlike a since-omitted sibling dead rule targeting an equally-unused class, which would
       have tripped svelte-check's unused-selector lint as a plain scoped selector - this one's
       :global() wrapper exempts it from that check). Flagged, not fixed - don't wire "selected"
       into the class string above to "make this work". */
    :global(.midi-shortcut.selected) {
        background-color: var(--accent);
    }
</style>
