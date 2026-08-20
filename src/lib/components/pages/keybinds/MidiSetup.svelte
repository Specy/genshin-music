<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '$game';
  import ShapeKeyboard from '$lib/games/shapes/ShapeKeyboard.svelte';
  import BaseNote from '$cmp/BaseNote.svelte';
  import MidiShortcut from './MidiShortcut.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import type { MIDINote, MIDIShortcut as MIDIShortcutData } from '$core/utils/Utilities';
  import type { InstrumentName } from '$core/types';
  import type { MIDIPreset, Pitch } from '$lib/games/types';
  import { MIDIProvider, type MIDIEvent } from '$lib/providers/MIDIProvider';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { AudioPlayer } from '$lib/audio/AudioPlayer';
  import { InstrumentData } from '$core/Songs/SongClasses';
  import { Instrument } from '$lib/audio/Instrument.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Separator from '$cmp/Separator.svelte';
  import { t } from '$i18n/binding.svelte';

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
    | { status: 'granted'; midiAccess: WebMidi.MIDIAccess }
    | { status: 'denied' }
    | { status: 'unsupported' }
    | { status: 'pending' };

  // The DEFAULT instrument (INSTRUMENTS[0] = game.instruments.list[0], i.e. the one `init()`
  // loads into `audioPlayer` below). It owns everything about the grid this page draws: the
  // Shape, the notes the Shape places, their glyphs, and the Note Id each button plays -
  // a MIDI preset maps hardware keys onto THOSE buttons.
  const baseInstrument = new Instrument();
  // The Basepoint this page auditions at, in ONE place: the player is built at it, and every
  // button's Note Number is asked for at it (ADR-0007 - the two must be the same value, or a
  // press enters a number the engine then resolves against a different Basepoint). This page
  // has no song and no pitch selector, so it is simply C; the layer it syncs below carries no
  // override, so `playNoteOfInstrument` resolves the player's base.
  const AUDITION_PITCH: Pitch = 'C';
  const audioPlayer = new AudioPlayer(AUDITION_PITCH);
  let mounted = true;

  // QUIRK (load-bearing): MIDINote/MIDIShortcut are plain, non-reactive classes - their fields
  // are mutated in place (e.g. note.status = ...) rather than through $state. $state does not
  // deep-proxy class instances and skips notifying on a referentially-unchanged reassignment, so
  // every `notes = [...notes]` / `shortcuts = [...MIDIProvider.settings.shortcuts]` below is
  // forcing a fresh array reference to make the already-mutated elements visible again - it is
  // not redundant spreading to "clean up". Removing any of these silently breaks reactivity for
  // that update.
  let notes: MIDINote[] = $state(MIDIProvider.notes);
  let currentPreset = $state('default');
  let midiAccess: MidiAccessStatus = $state({ status: 'pending' });
  let shortcuts: MIDIShortcutData[] = $state(MIDIProvider.settings.shortcuts);
  let presets: MIDIPreset[] = $state(MIDIProvider.getPresets());
  let selectedNote: MIDINote | null = $state(null);
  let selectedShortcut: string | null = $state(null);
  // eslint-disable-next-line no-undef
  let sources: WebMidi.MIDIInput[] = $state([]);

  async function init() {
    await loadInstrument(game.instruments.list[0]);
    if (!('requestMIDIAccess' in navigator)) {
      midiAccess = { status: 'unsupported' };
    } else {
      const res = await MIDIProvider.init();
      if (res) {
        midiAccess = { status: 'granted', midiAccess: res };
      } else {
        // means it was not previously requested, try again now:
        const access = await MIDIProvider.requestAccess();
        if (access) {
          midiAccess = { status: 'granted', midiAccess: access };
        } else {
          midiAccess = { status: 'denied' };
        }
      }
    }
    MIDIProvider.addInputsListener(midiStateChange);
    MIDIProvider.addListener(handleMidi);
    sources = MIDIProvider.inputs;
    notes = [...MIDIProvider.notes];
    currentPreset = MIDIProvider.settings.selectedPreset;
    shortcuts = [...MIDIProvider.settings.shortcuts];
    presets = MIDIProvider.getPresets();
  }

  // eslint-disable-next-line no-undef
  function midiStateChange(inputs: WebMidi.MIDIInput[]) {
    if (!mounted) return;
    sources = inputs;
  }

  function deselectNotes() {
    notes.forEach((note) => {
      note.status = note.midi < 0 ? 'wrong' : 'right';
    });
    notes = [...notes];
  }

  async function loadInstrument(name: InstrumentName) {
    const result = await audioPlayer.syncInstruments([new InstrumentData({ name })]);
    if (result.some((e) => !e)) return logger.error('Error loading instrument');
    if (!mounted) return audioPlayer.destroy();
  }

  function checkIfMidiIsUsed(midi: number, type: 'all' | 'shortcuts' | 'notes') {
    if (shortcuts.find((e) => e.midi === midi) && ['all', 'shortcuts'].includes(type)) return true;
    if (notes.find((e) => e.midi === midi) && ['all', 'notes'].includes(type)) return true;
    return false;
  }

  function loadPreset(name: string) {
    MIDIProvider.loadPreset(name);
    notes = [...MIDIProvider.notes];
    currentPreset = name;
  }

  function handleMidi([eventType, note, velocity]: MIDIEvent) {
    if (MIDIProvider.isDown(eventType) && velocity !== 0) {
      if (selectedNote) {
        if (checkIfMidiIsUsed(note, 'shortcuts'))
          return logger.warn(t('keybinds:key_already_used'));
        deselectNotes();
        if (MIDIProvider.isPresetBuiltin(currentPreset))
          return logger.warn(t('keybinds:cannot_edit_builtin_preset'));
        MIDIProvider.updateNoteOfCurrentPreset(selectedNote.index, note, 'right');
        selectedNote = null;
        notes = [...MIDIProvider.notes];
      }
      if (selectedShortcut) {
        const shortcut = shortcuts.find((e) => e.type === selectedShortcut);
        if (checkIfMidiIsUsed(note, 'all')) return logger.warn(t('keybinds:key_already_used'));
        if (shortcut) {
          MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right');
          shortcuts = [...MIDIProvider.settings.shortcuts];
        }
      }
      const shortcut = shortcuts.find((e) => e.midi === note);
      if (shortcut) {
        MIDIProvider.updateShortcut(shortcut.type, note, 'clicked');
        setTimeout(() => {
          MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right');
          shortcuts = [...MIDIProvider.settings.shortcuts];
        }, 150);
        shortcuts = [...MIDIProvider.settings.shortcuts];
      }
      const keyboardNotes = notes.filter((e) => e.midi === note);
      keyboardNotes.forEach((keyboardNote) => {
        // A preset slot is addressed by BUTTON (persisted MIDI settings stay button-keyed);
        // the default instrument is what turns that Button into the Note Number the engine plays.
        handleClick(
          keyboardNote,
          baseInstrument.getNoteFromIndex(keyboardNote.index)?.numberAt(AUDITION_PITCH),
          true
        );
      });
    }
  }

  /**
   * Select (or animate) one preset slot and audition it. `number` is the Note Number the drawn
   * button ENTERS at this page's Basepoint - the caller holds the note object the Shape gave it,
   * so nothing here has to guess where the button lives; `undefined` when the slot maps to no
   * note of the loaded instrument, in which case there is simply nothing to audition.
   */
  function handleClick(note: MIDINote, number: number | undefined, animate = false) {
    if (!animate) deselectNotes();
    note.status = 'clicked';
    if (animate) {
      setTimeout(() => {
        note.status = note.midi < 0 ? 'wrong' : 'right';
        notes = [...notes];
      }, 200);
      notes = [...notes];
      selectedShortcut = null;
    } else {
      notes = [...notes];
      selectedNote = note;
      selectedShortcut = null;
    }
    playSound(number);
  }

  function handleShortcutClick(shortcut: string) {
    deselectNotes();
    if (selectedShortcut === shortcut) {
      selectedShortcut = null;
      selectedNote = null;
      return;
    }
    selectedShortcut = shortcut;
    selectedNote = null;
  }

  /**
   * Audition one Note Number on the loaded instrument - the engine is Number-keyed since
   * ADR-0007 (it resolves the number back to a button at the layer's Basepoint), so what is
   * handed over here is `numberAt(AUDITION_PITCH)`, never the button's Nominal Id. The two
   * coincide only for an untuned instrument at Basepoint C, which both games' first instrument
   * happens to be - a tuned default would have auditioned the wrong key, or nothing at all.
   */
  function playSound(number: number | undefined) {
    if (number === undefined) return;
    audioPlayer.playNoteOfInstrument(0, number);
  }

  async function createPreset() {
    while (true) {
      const name = await asyncPrompt(t('keybinds:ask_preset_name'));
      if (!name) return;
      if (MIDIProvider.isPresetBuiltin(name) || presets.some((p) => p.name === name)) {
        logger.warn(t('keybinds:already_existing_preset'));
        continue;
      }
      // One empty slot per BUTTON of the instrument the grid draws, so a fresh preset always
      // covers exactly the buttons the user can see (the built-in presets already do; this
      // just stops a new preset from inheriting a stale length instead of the real one).
      MIDIProvider.createPreset({ name, notes: baseInstrument.notes.map(() => -1) });
      presets = MIDIProvider.getPresets();
      loadPreset(name);
      return;
    }
  }

  async function deletePreset(name: string) {
    if (MIDIProvider.isPresetBuiltin(name))
      return logger.warn(t('keybinds:cannot_delete_builtin_preset'));
    if (!(await asyncConfirm(t('keybinds:confirm_delete_preset', { preset_name: name })))) return;
    MIDIProvider.deletePreset(name);
    MIDIProvider.loadPreset('default');
    presets = MIDIProvider.getPresets();
    notes = [...MIDIProvider.notes];
    currentPreset = 'default';
  }

  onMount(() => {
    init();
    return () => {
      mounted = false;
      audioPlayer.destroy();
      MIDIProvider.removeInputsListener(midiStateChange);
      MIDIProvider.removeListener(handleMidi);
      AudioProvider.clear();
    };
  });
</script>

{#snippet faTrashIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
    /></svg
  >
{/snippet}

{#snippet faPlusIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
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
          <div
            style="border-radius:0.3rem;padding:0.2rem 0.4rem;border:solid 0.1rem var(--secondary)"
          >
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
      <AppButton
        onclick={() => deletePreset(currentPreset)}
        class="flex items-center"
        style="gap:0.5rem"
      >
        {@render faTrashIcon()}
        {t('keybinds:delete_midi_preset')}
      </AppButton>
      <AppButton onclick={createPreset} class="flex items-center" style="gap:0.5rem">
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
  <!-- Two arrays meet here (ADR-0005 §1/§3). The Shape places the DEFAULT INSTRUMENT's notes -
       those are the buttons a MIDI preset maps - and hands each one back with its Button; the
       row's editable data is the preset's own MIDINote for that Button, since a preset slot IS
       a Button (MIDIProvider persists settings that way). Nothing here assumes the two arrays
       line up positionally on screen: the Button comes from the Shape.
       The `notes` read below happens INSIDE the snippet, in this component's scope, so the
       `notes = [...notes]` republishing above still reaches every button even though the
       instrument's note array handed to the Shape never changes identity. -->
  <ShapeKeyboard
    shape={baseInstrument.shape}
    notes={baseInstrument.notes}
    class="keyboard"
    style="margin:1.5rem 0;width:fit-content"
  >
    {#snippet button(instrumentNote, button)}
      {@const note = notes[button]}
      {#if note}
        <BaseNote
          handleClick={() => handleClick(note, instrumentNote.numberAt(AUDITION_PITCH))}
          data={note}
          noteImage={instrumentNote.icon}
          noteText={note.midi < 0 ? 'N/A' : String(note.midi)}
        />
      {:else}
        <!-- a button the loaded preset has no slot for: every shipped preset covers the whole
             instrument, so this only shows up for a hand-edited/legacy short preset - the cell
             stays empty rather than crashing or offering an unmappable button -->
        <div></div>
      {/if}
    {/snippet}
  </ShapeKeyboard>
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
       "fix" - that class is threaded through MidiShortcut.svelte's own AppButton class prop,
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
