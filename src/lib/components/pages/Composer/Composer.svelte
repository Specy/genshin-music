<script module lang="ts">
  /**
   * WHAT THE KEYBOARD IS HANDED WHILE THE LOWERED SHEET IS CLEARED (spec §4, see
   * `noteStatesCleared`): ONE Set for the life of the module, so every column advance during such a
   * playback hands the keys the same reference and no key's `held` prop can change. A fresh empty
   * Set per advance would clear the marks just as well and repaint the whole keyboard doing it,
   * which is the cost the clear exists to avoid.
   *
   * A plain Set and not a SvelteSet, like every other module-level constant here: it is never
   * written and nothing may observe it change.
   */
  const NO_HELD_BUTTONS = new Set<number>();
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { game } from '$game';
  import { APP_NAME } from '$core/legacyConfig';
  import type { Pitch } from '$lib/games/types';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import MidiParser from './MidiParser/MidiParser.svelte';
  import ComposerTools from './ComposerTools.svelte';
  import ComposerKeyboard from './ComposerKeyboard.svelte';
  import ComposerTempoChangers from './ComposerTempoChangers.svelte';
  import ComposerDurationPopover from './ComposerDurationPopover.svelte';
  import ComposerCanvas from './ComposerCanvas.svelte';
  import ComposerMenu from './ComposerMenu.svelte';
  import { ComposerInstrumentSynchronizer } from './ComposerInstrumentSynchronizer';
  import CanvasTool from './CanvasTool.svelte';
  import InstrumentControls from './InstrumentControls.svelte';
  import { Instrument, type ObservableNote } from '$lib/audio/Instrument.svelte';
  import { ComposerTransport, TRANSPORT_START_MARGIN_S } from '$lib/audio/ComposerTransport';
  import AudioRecorder from '$lib/audio/AudioRecorder';
  import Analytics from '$core/Analytics';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import { VsrgSong } from '$core/Songs/VsrgSong.svelte';
  import type { SerializedSong } from '$core/Songs/Song.svelte';
  import { NoteLayer } from '$core/Songs/Layer';
  import {
    isTrackAudible,
    type ColumnNote,
    type InstrumentData,
    type NoteColumn,
  } from '$core/Songs/SongClasses';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import { MIDIProvider, type MIDIEvent } from '$lib/providers/MIDIProvider';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import type { KeyboardNumber } from '$lib/providers/KeyboardProvider/KeyboardTypes';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { settingsService } from '$core/Services/SettingsService';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { songService } from '$core/Services/SongService';
  import { fileService } from '$core/Services/FileService';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import {
    createKeyboardListener,
    createReleaseGuard,
    createShortcutListener,
    type ShortcutListener,
  } from '$stores/KeybindsStore.svelte';
  import { numberToButton } from '$core/Songs/noteIds';
  //THE PRO VIEW'S TAP DISPATCH, as a pure decision (spec §7) - what a tap on a cell does, given what
  //this component looks up about that cell. The lookups and the mutation stay here; the rule does
  //not, so it is testable without a canvas.
  import {
    COMPOSER_LONG_PRESS_MS,
    proCellAction,
    type ComposerPopoverAnchor,
    type ScreenRect,
  } from './composerInput';
  import {
    HeldNoteRegistry,
    holderToken,
    midiHolderToken,
    type HeldSource,
  } from '$lib/audio/HeldNoteRegistry';
  import { spanForHeldMs } from '$core/Songs/sustainQuantize';
  import { registerLeaveHandler } from '$stores/navigationGuard.svelte';
  import { calculateSongLength, clamp, delay, formatMs } from '$core/utils/Utilities';

  let {
    songId = null,
    showMidi = false,
    inPreview = false,
  }: {
    songId?: string | null;
    showMidi?: boolean;
    inPreview?: boolean;
  } = $props();

  let settings: ComposerSettingsDataType = $state(settingsService.getDefaultComposerSettings());
  let layers: Instrument[] = $state([new Instrument(game.instruments.list[1])]); //TODO not sure if this is the best idea
  //it doesnt change the instrument because it is the same as the one in the base song
  let song: ComposedSong = $state(
    new ComposedSong('Untitled', [
      game.instruments.list[0],
      game.instruments.list[0],
      game.instruments.list[0],
    ])
  );
  // One-time seed, not reactive: later bpm/pitch edits flow through handleSettingChange's
  // songSetting branch instead, which writes song.bpm/song.pitch directly.
  //
  // THE SONG IS THE SINGLE SOURCE OF TRUTH for the Basepoint inside this component, and every
  // read of it below goes through `song.pitch` for that reason. Since ADR-0007 the Basepoint
  // decides what a stored number MEANS, so a settings copy that had drifted from the song would
  // not be a wrong playback rate any more — the keyboard would enter numbers at one Basepoint
  // while the canvas drew them at another. `settings.pitch` survives as the persisted UI copy,
  // written together with the song on every edit and re-seeded FROM it on load and undo.
  // svelte-ignore state_referenced_locally
  song.bpm = settings.bpm.value;
  // svelte-ignore state_referenced_locally
  song.pitch = settings.pitch.value;
  let layer = $state(0);
  // `$state.raw`, like song.breakpoints/song.instruments: this array is handed to the canvas and
  // the renderer calls `selectedColumns.includes(i)` once per visible column on every draw, so it
  // has to stay a PLAIN array rather than a deep proxy whose every element read is a trap. The
  // rule that comes with it: assign a new array, never push/splice (every write below already
  // does, see selectColumn).
  let selectedColumns: number[] = $state.raw([]);
  /**
   * One undo step. COMPOUND since ADR-0007, and it has to be: a Basepoint change or an instrument
   * swap rewrites the notes AND moves the setting that says what they mean, so a columns-only
   * snapshot would restore the notes into a song still claiming the new Basepoint — every one of
   * them a semitone (or an instrument) out. The three are captured and restored together or the
   * edit is not undoable at all.
   */
  type ComposerHistoryEntry = {
    columns: NoteColumn[];
    pitch: Pitch;
    instruments: InstrumentData[];
  };
  let undoHistory: ComposerHistoryEntry[] = $state([]);
  /**
   * The tools panel's clipboard. COMPOUND for the same reason the undo entry above is: the copied
   * columns hold ABSOLUTE Note Numbers (ADR-0007), which name the buttons they were copied from
   * only together with the Basepoint each SOURCE track was stated at — so that is captured with
   * them (`ComposedSong.trackPitches`, indexed by source track) and the paste restates the numbers
   * in the destination's terms. Without it a copy at Basepoint C pasted into a song at F reproduces
   * different buttons, which is the one thing a clipboard may not do.
   *
   * ONE value rather than two parallel `$state`s: the clipboard deliberately outlives the song it
   * was copied from (see loadSong), so a copy that installed columns beside the PREVIOUS copy's
   * Basepoints would silently transpose every paste after it.
   *
   * `$state.raw`, like selectedColumns: every write below replaces the whole value, and the
   * columns are handed to the model rather than read element-by-element. The rule that comes with
   * it: assign a new object, never mutate this one in place.
   */
  type ComposerClipboard = { columns: NoteColumn[]; pitches: Pitch[] };
  let clipboard: ComposerClipboard = $state.raw({ columns: [], pitches: [] });
  let isToolsVisible = $state(false);
  // One-time seed from the prop; later showMidi changes (callers never send any) are not tracked.
  // svelte-ignore state_referenced_locally
  let isMidiVisible = $state(showMidi || false);
  let isRecordingAudio = $state(false);
  let isPlaying = $state(false);
  // A context resume can be pending before playback has an audio-clock anchor. Keep that state
  // separate from isPlaying: the canvas must not move until audio has an exact start time, while
  // a second press still needs to cancel the pending request.
  let playbackStarting = $state(false);
  const playbackActive = $derived(isPlaying || playbackStarting);
  let playbackColumnStartMs = $state(0);
  let playbackAnchorGeneration = $state(0);
  let changes = $state(0);
  /**
   * CONTEXT.md: Pro View. The persisted setting, ANDed with `!inPreview` once here so every
   * consumer below - the grid modifier, the canvas' `{#key}`, the keyboard's sheet, the tempo
   * changers' placement - is asking the same question. /theme's composer preview keeps the
   * Compressed View: it is a small box inside a scrolling page, and a canvas sized to the WINDOW
   * would overrun it (`.canvas-wrapper-in-preview` and `composer-grid-in-preview` are the same
   * exclusion).
   */
  const proView = $derived(Boolean(settings.proView.value) && !inPreview);
  /**
   * Whether the Pro View's keyboard sheet is up. EPHEMERAL and never persisted (spec §5): every
   * composer mount starts with it lowered, and it means nothing at all in the Compressed View,
   * where the keyboard is simply the bottom of the page.
   */
  let keyboardRaised = $state(false);
  /**
   * ...and what actually decides the sheet's position, which is not quite the same thing, in two
   * ways. Recording audio REPLACES the keyboard's content with the recording UI (see
   * ComposerKeyboard), and that UI carries the only control that stops the recording - so the
   * sheet is held up for as long as one is running, whatever the user last tapped. And the OPEN
   * TOOLS PANEL takes the bottom of the window for itself (user addition 2026-08-22), so the
   * sheet goes down while it is open - but `keyboardRaised` itself is never rewritten, and that
   * IS the restore: closing the tools gives the sheet back exactly as it stood. Recording
   * outranks the tools for the same reason it outranks the user's own tap.
   */
  const keyboardSheetRaised = $derived((keyboardRaised && !isToolsVisible) || isRecordingAudio);
  /**
   * THE LOWERED SHEET'S PLAYBACK CLEAR (spec §4). While the song plays with the Pro View's keyboard
   * sheet down, the keys show NOTHING - every one of them unselected, no held marks - and cost
   * nothing per column: the two derived that paint them (`heldButtons` below and ComposerKeyboard's
   * `layerStatuses`) return module constants without reading the column at all, so a column advance
   * stops reaching the keyboard's DOM. Nobody can see that surface, and animating it was the one
   * per-tick cost the Pro View's sheet had left.
   *
   * NOT A FREEZE, and the three exclusions are the whole of the rule: while the song is STOPPED the
   * lowered sheet is still live, so browsing and editing with it down keep updating exactly as they
   * always have; raising it mid-playback restores the flashes on the next advance; and
   * `keyboardSheetRaised` already includes `isRecordingAudio`, so an audio recording - which forces
   * the sheet up and puts its only stop control there - is outside this by construction.
   */
  const noteStatesCleared = $derived(proView && !keyboardSheetRaised && isPlaying);
  /**
   * THE VIEW LOCK (CONTEXT.md): locked, the canvas stays pinned to the current track's Editable Zone;
   * unlocked, a stage drag pans the frame vertically too and it stays where the hand left it. The
   * fifth CanvasTool toggles this, and it reaches the canvas through the props channel like every
   * other reactive value (ComposerCanvas.svelte's $effect object, per that file's dependency rule) -
   * the renderer both reads it, for the drag, and diffs it, because re-locking is a COMMAND to ease
   * back rather than a description of anything. Ephemeral like the sheet above: every mount starts
   * locked, and nothing about it is persisted or stored in a song.
   *
   * THE CANVAS OPENS IT TOO (2026-08-22): a pinch or a ctrl+wheel on the canvas zooms the rows,
   * which is the user taking the frame - so the renderer reports that through `onViewUnlock` and the
   * padlock follows the gesture. Closing it again is this button's alone, and closing it is what
   * puts the zoom back to the current layer's own fit.
   */
  let viewLocked = $state(true);

  let broadcastChannel: BroadcastChannel | null = null;
  let mounted = false;
  let cleanup: (() => void)[] = [];
  const instrumentSynchronizer = new ComposerInstrumentSynchronizer({
    getLayers: () => layers,
    setLayers: (nextLayers) => (layers = nextLayers),
    isMounted: () => mounted,
    onLoadError: () => logger.error(t('logs:error_loading_instrument')),
    //ADR-0006 resync-on-mutation: an instrument swap replaces the layer that would sound the
    //committed window, and only NOW does the loaded replacement exist to recommit through.
    onSynced: () => resyncPlayback(),
  });

  const currentInstrument = $derived(layers[layer]);
  const songLength = $derived(calculateSongLength(song.columns, settings.bpm.value, song.selected));
  const usedLayersInSelectedColumn = $derived.by(() => {
    // Rebuilt as one immutable value whenever the song graph or selected column changes; the
    // instrument panel only needs membership checks, not a reactive collection of its own.
    return new Set(song.selectedColumn?.notes.map((note) => note.trackIndex) ?? []);
  });

  // No refreshSong() any more (2026-08-06 reactive-model plan, phase 1). ComposedSong publishes
  // its own changes now: `selected`, `breakpoints`, `instruments`, `name`/`bpm`/`pitch` are
  // signals, and the whole column/note graph rides one structure version that the `columns`
  // getter reads. So a mutation is published by the model method that made it - this component
  // just calls the method. `song` itself is still $state, but it only changes on load/create.

  onMount(() => {
    mounted = true;
    const loadedSettings = settingsService.getComposerSettings();
    const shortcutListener = createShortcutListener(
      'composer',
      'composer_shortcuts',
      handleShortcut,
      //A HELD NOTE KEY IS TRANSPARENT TO THESE COMBOS (user revision 2026-08-22). This surface's
      //note keys ARE the letter row that carries a/d/q/e, so without this every shortcut is dead
      //for as long as a note is held - and a Duration Hold is exactly "a note held while you step
      //the columns" (CONTEXT.md). See heldNoteKeyCodes and KeybindsStore's KeyComboOptions.
      { transparentCodes: heldNoteKeyCodes }
    );
    const shortcutKeyboardListener = createKeyboardListener(
      'composer_shortcuts_keyboard',
      handleKeyboardShortcut,
      { onRelease: handleKeyboardRelease }
    );
    //a key-up that never arrives (alt-tab, tab hidden, iOS bfcache) would leave a looping
    //sustaining voice sounding and its span growing for a key nobody is holding
    cleanup.push(
      shortcutKeyboardListener,
      shortcutListener,
      createReleaseGuard(() => {
        endAllSustainRecordings();
        //...and the stopped song's own held keys, whose clock and Duration Hold are the same kind
        //of thing a missing key-up would strand (see abandonNoteHolds)
        abandonNoteHolds();
      })
    );
    settings = loadedSettings;
    //the persisted settings arrive AFTER the defaults the song was seeded from, so re-seed both
    //song-level values a fresh song carries (see their declaration) — nothing is loaded yet, so
    //there are no notes for the Basepoint to move
    song.bpm = loadedSettings.bpm.value;
    song.pitch = loadedSettings.pitch.value;
    init(loadedSettings);
    broadcastChannel = window.BroadcastChannel
      ? new BroadcastChannel(APP_NAME + '_composer')
      : null;
    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', (event) => {
        if (!settings.syncTabs.value) return;
        if (!['play', 'stop'].includes(event?.data)) return;
        togglePlay(event.data === 'play');
      });
    }
    cleanup.push(registerLeaveHandler(prepareToLeave));
    if (window.location.hostname !== 'localhost') {
      window.addEventListener('beforeunload', handleUnload);
    }
    return () => {
      mounted = false;
      endAllSustainRecordings();
      //a hold clock left counting into an unmounted composer would open a popover on a song nobody
      //is looking at any more
      abandonNoteHolds();
      AudioProvider.clear();
      layers.forEach((instrument) => instrument.dispose());
      broadcastChannel?.close?.();
      isPlaying = false;
      playbackStarting = false;
      playbackStartGeneration++;
      //not the full stop path (the instruments were just disposed — there is nothing left to
      //cancel or release), but the transport's pending worker-timer wake survives unmount on
      //its own, and an awaiting startRecordingAudio needs the play-run promise settled so its
      //!mounted bail can run
      transport.stop();
      playbackEnded?.resolve();
      playbackEnded = null;
      cleanup.forEach((dispose) => dispose());
      KeyboardProvider.unregisterById('composer');
      //the tempo-changer digits register under their own id — unregistering only 'composer'
      //left one live handler set per mount, and they now share the page with held notes
      KeyboardProvider.unregisterById('composer_keyboard');
      MIDIProvider.removeListener(handleMidi);
      MIDIProvider.removeInputsListener(handleMidiInputsChange);
      if (AudioProvider.isRecording) AudioProvider.stopRecording();
      if (window.location.hostname !== 'localhost') {
        window.removeEventListener('beforeunload', handleUnload);
      }
    };
  });

  async function init(loadedSettings: ComposerSettingsDataType) {
    await syncInstruments();
    //the teardown above is synchronous, so an unmount during that await would run BEFORE these
    //registrations and leave both listeners behind — one live set per fast mount/unmount
    if (!mounted) return;
    AudioProvider.setReverb(loadedSettings.reverb.value);
    MIDIProvider.addListener(handleMidi);
    MIDIProvider.addInputsListener(handleMidiInputsChange);
    game.composer.tempoChangers.forEach((tempoChanger, i) => {
      KeyboardProvider.registerNumber(
        (i + 1) as KeyboardNumber,
        () => handleTempoChanger(tempoChanger),
        { id: 'composer_keyboard' }
      );
    });
    try {
      if (!songId) return;
      const loadedSong = await songService.getSongById(songId);
      if (!loadedSong) return;
      loadSong(loadedSong);
    } catch (e) {
      console.error('Error loading song');
      console.error(e);
    }
  }

  const handleKeyboardShortcut: ShortcutListener<'keyboard'> = ({ shortcut, code, event }) => {
    if (event.repeat) return;
    const shouldEditKeyboard = isPlaying || event.shiftKey;
    if (shouldEditKeyboard) {
      const note = currentInstrument.getNoteFromCode(shortcut.name);
      if (note === null) return;
      //the PHYSICAL key holds the note, not the shortcut name, so a keyboard LAYOUT change
      //mid-hold cannot orphan the release (KeyboardEvent.code is layout-independent). Rebinding
      //the key itself mid-hold still can: the key-up half only fires for keys that are bound.
      if (startSustainRecording(holderToken('keyboard', code), note.numberAt(layerPitch))) return;
      //WHILE PLAYING NOTHING CHANGED (user decision 2026-08-22): a key that records no sustain -
      //a non-sustaining instrument, a covered button - is still an immediate toggle, because
      //playing is performing and a performance has no long press to wait for.
      if (isPlaying) return toggleNoteImmediate(note);
      beginNoteHold(holderToken('keyboard', code), note);
    }
  };

  /**
   * Key-up half of hold-to-sustain, and of the stopped-song press machine below. Deliberately NOT
   * gated on `isPlaying || shiftKey` the way the down half is: that gate can flip while a key is
   * down (playback ends under a held key, shift is let go before the note is), and both halves
   * below no-op for a key that is holding nothing.
   */
  const handleKeyboardRelease: ShortcutListener<'keyboard'> = ({ code }) => {
    endSustainRecording(holderToken('keyboard', code));
    endNoteHold(holderToken('keyboard', code));
  };

  // ── the KEYLESS surfaces' own press machine, WHILE STOPPED (user decisions 2026-08-22) ─────────
  // A physical note key and an incoming MIDI note run the pointer's machine exactly
  // (beginNotePress/endNotePress/openDurationPopover), so all three surfaces are one gesture with
  // three input devices: a missing note is added at the DOWN edge, removing an existing one waits
  // for the UP edge (short press = remove), and holding for COMPOSER_LONG_PRESS_MS opens the
  // duration popover - after which the key is a Duration Hold like any other, and every column the
  // selection moves through grows the span (CONTEXT.md: Duration Hold).
  //
  // MIDI JOINED IN THE SAME PASS (superseding "MIDI stays an instant toggle"): the zen keyboard now
  // broadcasts real note-down/up over the wire (MIDIProvider.broadcastNoteDown/Up), so genuine hold
  // LENGTHS arrive from a controller and a note-on is no longer a click that happens to have an end.
  //
  // "HOLD" HERE IS THE PRESS THAT IS STILL DOWN and not the VSRG mechanic (CONTEXT.md warns off the
  // word for that reason) - it is what MAY become a Duration Hold, and does once the clock fires.
  //
  // KEYED BY HOLDER TOKEN, the same currency the sustain registry uses (HeldNoteRegistry): `k:KeyD`
  // for a physical key - the PHYSICAL key, so a layout change mid-hold cannot orphan the release -
  // and `m:60:0` for one MIDI note on one preset slot, which is what lets a device hold several
  // notes at once and two slots on one note be two independent holds. Several holders can resolve to
  // the same Note Number, which the id-keyed notePresses map then collapses into the one press it
  // always was.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- input-gesture bookkeeping, never read from the template
  const noteHolds = new Map<string, { id: number; longPress: ReturnType<typeof setTimeout> }>();

  function beginNoteHold(holder: string, note: ObservableNote) {
    //DUPLICATE-DOWN GUARD - an OS auto-repeat stream (belt to createKeyboardListener's own
    //`event.repeat` brace) or a controller re-sending a note-on it never released: either would
    //re-arm the clock below and never let it fire. The same rule HeldNoteRegistry.press applies.
    if (noteHolds.has(holder)) return;
    const id = numberOfNote(note);
    beginNotePress(id);
    noteHolds.set(holder, {
      id,
      //THE SAME CLOCK the on-screen key runs (ComposerNote.startLongPress) and the canvas runs
      //(ComposerRenderer.proLongPressTimeout) - spec §12's one threshold, third and fourth surface.
      //The anchor is resolved when it FIRES rather than now, because where that note is on screen
      //(which key, and whether the Pro View's keyboard sheet is even up) can change meanwhile.
      //
      //THE RECORD OUTLIVES ITS OWN TIMER: the key is still down when this fires, and it is that
      //record which makes the release below end both the press and the Duration Hold. Clearing an
      //already-fired timeout is a no-op, so the release needs no branch for the two cases.
      longPress: setTimeout(
        () => openDurationPopover(id, keylessNoteAnchor(note, id)),
        COMPOSER_LONG_PRESS_MS
      ),
    });
  }

  function endNoteHold(holder: string) {
    const hold = noteHolds.get(holder);
    if (!hold) return;
    noteHolds.delete(holder);
    clearTimeout(hold.longPress);
    endNotePress(hold.id);
  }

  /**
   * An UP edge that will never arrive: alt-tab, the tab going hidden, iOS bfcache, or - for the
   * `'midi'` source - the device itself vanishing mid-hold, which owes us no note-off. The same
   * guards the sustain recordings take, and this ABANDONS rather than releases: an interrupted
   * gesture is not a short press, so it must not delete the note the down edge added. What it does
   * end is the hold clock and any Duration Hold those holders were running, neither of which may
   * outlive a hand (or a cable) that is no longer there.
   */
  function abandonNoteHolds(source?: HeldSource) {
    //`holderToken(source, '')` is that source's own prefix - the tokens' one spelling, rather than a
    //second copy of 'm:' here (see HeldNoteRegistry)
    const prefix = source ? holderToken(source, '') : '';
    for (const [holder, hold] of noteHolds) {
      if (!holder.startsWith(prefix)) continue;
      clearTimeout(hold.longPress);
      if (durationPopover?.id === hold.id) durationPopover.holdActive = false;
      noteHolds.delete(holder);
    }
  }

  /**
   * WHICH PHYSICAL KEYS ARE CURRENTLY HOLDING A NOTE, and therefore step aside when a composer
   * shortcut combo is matched (KeybindsStore's KeyComboOptions, user revision 2026-08-22).
   *
   * BOTH REGISTRIES, because a key holds a note in two different ways depending on the transport:
   * stopped it is a press in `noteHolds` above, playing it is a sustain being recorded. The
   * annoyance it fixes is the same in both - a held letter key used to poison every combo, so
   * `a`/`d` could not step a column while one was down, which is the very thing a Duration Hold
   * wants (CONTEXT.md).
   *
   * Only the `'keyboard'` source: a MIDI or pointer holder is not a key code and could only ever
   * make a combo transparent by accident.
   */
  function heldNoteKeyCodes(): ReadonlySet<string> {
    const prefix = holderToken('keyboard', '');
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set, rebuilt per keydown
    const codes = new Set<string>();
    for (const holder of noteHolds.keys()) {
      if (holder.startsWith(prefix)) codes.add(holder.slice(prefix.length));
    }
    for (const { holder } of sustainRecordings.entriesOfSource('keyboard')) {
      codes.add(holder.slice(prefix.length));
    }
    return codes;
  }

  /**
   * WHAT A POPOVER OPENED FROM A KEY WITH NO ELEMENT OF ITS OWN IS ANCHORED TO - a physical note key
   * or an incoming MIDI note - in the order the user's eye would look for it:
   *  1. THE ON-SCREEN KEY for that note, when it is actually on screen - the same live element a
   *     pointer hold anchors to (ComposerPopoverAnchor), so the popover stands over the key the
   *     letter on the keycap names. Only when it is VISIBLE: in the Pro View the keyboard is a
   *     bottom sheet that spends most of its life translated off the bottom of the window, and a
   *     popover anchored to it would be placed off-screen too.
   *  2. THE CELL on the Pro View canvas, which is where that note IS when the sheet is down - the
   *     canvas' own rect, the same one a hold on the cell would have produced.
   *  3. FAILING BOTH, the middle of the window. Neither a key nor a MIDI note has a position of its
   *     own to fall back to, and a popover the user cannot see is worse than one that is merely not
   *     pointing at anything.
   */
  function keylessNoteAnchor(note: ObservableNote, id: number): ComposerPopoverAnchor {
    const element = noteElements.get(note);
    if (element) {
      const rect = element.getBoundingClientRect();
      const onScreen = rect.width > 0 && rect.top >= 0 && rect.top <= window.innerHeight;
      if (onScreen) return { element };
    }
    const startColumn =
      song.getSpanCovering(song.selected, layer, id)?.startColumn ?? song.selected;
    const cell = canvasMeasures?.proCellRect(startColumn, id) ?? null;
    if (cell) return { rect: cell };
    return {
      rect: { x: window.innerWidth / 2, y: window.innerHeight * 0.7, width: 0, height: 0 },
    };
  }

  /**
   * The on-screen keyboard's key elements, published by ComposerNote as it mounts and withdrawn as
   * it goes. It exists for one caller - physicalKeyAnchor above - and it is a registry rather than a
   * DOM query because the keys are drawn by the game's Shape (ShapeKeyboard), which owns their
   * markup and their order; a `querySelector` into it would be this file's second, silent opinion
   * about a structure it does not own.
   *
   * Keyed by the NOTE OBJECT, which is the one identity that survives everything that can move
   * underneath it: the Basepoint changes what number a key sounds and an instrument swap replaces
   * the whole list, and in both cases these are the very objects the keyboard was built from.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a DOM-node side table, never read from the template
  const noteElements = new Map<ObservableNote, HTMLElement>();

  function registerNoteElement(note: ObservableNote, element: HTMLElement | null) {
    if (element) noteElements.set(note, element);
    else noteElements.delete(note);
  }

  /** A MIDI device appearing or vanishing mid-hold owes us no note-off — release only ITS notes. */
  function handleMidiInputsChange() {
    for (const { holder } of sustainRecordings.entriesOfSource('midi')) endSustainRecording(holder);
    //...and, while stopped, its press gestures - a clock counting down for a controller that is no
    //longer on the wire, and any Duration Hold it was running (see abandonNoteHolds)
    abandonNoteHolds('midi');
  }

  const handleShortcut: ShortcutListener<'composer'> = ({ shortcut, event }) => {
    const wasPlaying = playbackActive;
    const { name } = shortcut;
    if (name === 'next_column' && !wasPlaying) selectColumn(song.selected + 1);
    if (name === 'previous_column' && !wasPlaying) selectColumn(song.selected - 1);
    if (name === 'remove_column' && !wasPlaying) removeColumns(1, song.selected);
    if (name === 'add_column' && !wasPlaying) addColumns(1, song.selected);
    if (name === 'previous_layer') {
      const previousLayer = layer - 1;
      if (previousLayer >= 0) changeLayer(previousLayer);
    }
    if (name === 'next_layer') {
      const nextLayer = layer + 1;
      if (nextLayer < layers.length) changeLayer(nextLayer);
    }
    //THE KEYBOARD SHEET, and only where there is one: in the Compressed View the keyboard is simply
    //the bottom of the page and this flag reaches no rule at all (see its declaration). The sheet is
    //held up for the length of a recording whatever this says, so a press during one is inert by
    //construction rather than by a guard here.
    //...and not while the tools hold the bottom of the window (keyboardSheetRaised): the flip
    //would change nothing visible now and spring a surprise state on the tools' close instead
    if (name === 'toggle_keyboard' && proView && !isToolsVisible) keyboardRaised = !keyboardRaised;
    if (name === 'toggle_play') {
      if (event.repeat) return;
      if ((event.target as HTMLElement | null)?.tagName === 'BUTTON') {
        (event.target as HTMLElement | null)?.blur();
      }
      event.preventDefault();
      togglePlay();
      if (settings.syncTabs.value) {
        // QUIRK: broadcasts wasPlaying ? 'play' : 'stop'. The play/pause button's own
        // onclick below broadcasts the opposite mapping for the same toggle gesture -
        // both intentional and deliberately left inconsistent; do not unify them.
        broadcastChannel?.postMessage?.(wasPlaying ? 'play' : 'stop');
      }
    }
  };

  function handleUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    event.returnValue = '';
  }

  function handleAutoSave() {
    //ADR-0006 resync-on-mutation, at the note-edit funnel: every editing path that changes what
    //playback would sound lands here right after its mutation — click add/remove, popover span
    //edits, column add/remove, tempo changers, sustain-recording note-add and release. For the
    //two sustain-recording paths the future columns are unchanged, so the resync is a harmless
    //no-op recommit — cheap, and simpler than exempting them.
    resyncPlayback();
    changes++;
    if (changes > 5 && settings.autosave.value) {
      //TODO maybe add here that songs which arent saved dont get autosaved
      if (song.name !== 'Untitled') {
        updateSong(song);
      }
    }
  }

  function handleMidi([eventType, note, velocity]: MIDIEvent) {
    if (!mounted) return;
    //note-off, or the running-status alias for it (note-on at velocity 0). The note itself is
    //not re-resolved: the holder token carries which press this ends, so an instrument swapped
    //mid-hold still releases the note that was actually pressed. (The SLOT still comes from the
    //live preset, so a preset edited mid-hold could still orphan a hold — only reachable from
    //the keybinds page, which unmounts this surface.)
    if (MIDIProvider.isNoteRelease(eventType, velocity)) {
      MIDIProvider.getNotesOfMIDIevent(note).forEach((keyboardNote) => {
        const holder = midiHolderToken(note, keyboardNote.index);
        endSustainRecording(holder);
        //...and the stopped song's UP EDGE (user revision 2026-08-22): the short press that removes
        //a note it found, and the end of a Duration Hold. One of the two registries is always empty
        //here - a press is either recording or editing - so both are told and each ignores a holder
        //it never had.
        endNoteHold(holder);
      });
      return;
    }
    if (MIDIProvider.isDown(eventType) && velocity !== 0) {
      const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note);
      keyboardNotes.forEach((keyboardNote) => {
        //a MIDI preset slot addresses a BUTTON of the current instrument (persisted settings,
        //still Button-keyed by design); a preset can outlive a shorter instrument's note list,
        //so resolve the note object here and hand THAT on - never the raw slot number
        const pressed = currentInstrument.notes[keyboardNote.index];
        if (!pressed) return;
        const holder = midiHolderToken(note, keyboardNote.index);
        if (startSustainRecording(holder, pressed.numberAt(layerPitch))) return;
        //WHILE PLAYING NOTHING CHANGED: a note-on that records no sustain (a non-sustaining
        //instrument, a covered button) is still an immediate toggle, because playing is performing.
        if (isPlaying) return toggleNoteImmediate(pressed);
        //STOPPED, a MIDI key is a PRESS like any other (user revision 2026-08-22): it adds the note
        //it finds missing now and defers the removal to the note-off above, so a hold in between can
        //open the duration popover. The zen keyboard broadcasting real note-down/up over the wire is
        //what makes a MIDI note's LENGTH mean something to reach for.
        beginNoteHold(holder, pressed);
      });
      const shortcut = MIDIProvider.settings.shortcuts.find((e) => e.midi === note);
      if (!shortcut) return;
      switch (shortcut.type) {
        case 'toggle_play':
          togglePlay();
          break;
        case 'next_column':
          selectColumn(song.selected + 1);
          break;
        case 'previous_column':
          selectColumn(song.selected - 1);
          break;
        case 'add_column':
          addColumns(1, song.selected);
          break;
        case 'remove_column':
          removeColumns(1, song.selected);
          break;
        case 'change_layer': {
          let nextLayer = layer + 1;
          if (nextLayer >= layers.length) nextLayer = 0;
          changeLayer(nextLayer);
          break;
        }
        default:
          break;
      }
    }
  }

  function updateSettings(override?: ComposerSettingsDataType) {
    settingsService.updateComposerSettings(override !== undefined ? override : settings);
  }

  function handleSettingChange({ data, key }: SettingUpdate) {
    //captured BEFORE the write below, because a Basepoint change is a real note edit and needs
    //both ends of the interval (ADR-0007). Undo has to see the song as it was, so the snapshot
    //goes in first too.
    const previousPitch = song.pitch;
    const pitchChanged = key === 'pitch' && data.value !== previousPitch;
    if (pitchChanged) addToHistory();
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[key] = { ...settings[key], value: data.value };
    if (data.songSetting) {
      // A songSetting key is written straight onto the song here, so whether the write publishes
      // is decided by the field it lands on. The keys that carry the flag today are bpm, pitch and
      // reverb: bpm/pitch are signals and publish through this dynamic write (they keep public
      // setters, which is why it still works); reverb is plain on purpose - it goes straight to
      // AudioProvider below and into serialize(). A fourth songSetting whose field needs to be
      // observed would have to be a signal on the song, like those two.
      // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
      song[key] = data.value;
    }
    if (key === 'reverb') {
      AudioProvider.setReverb(data.value as boolean);
    }
    //ADR-0007: the song's Basepoint is part of every number its notes store, so moving it REWRITES
    //them — every track that follows the song (a track with its own override keeps its effective
    //Basepoint, so its notes must not move). The write above already installed the new value; this
    //is handed both ends explicitly.
    //
    //...which makes it a NOTE EDIT, so it rides the note-edit funnel rather than resyncing on its
    //own: handleAutoSave() is what marks the song dirty, and the dirty count is what the
    //unsaved-changes prompts (loadSong, createNewSong, prepareToLeave) and the menu's dot read. A
    //transposed song that still counted as saved was silently discarded by all three.
    if (pitchChanged) {
      song.applyBasepointChange('song', previousPitch, data.value as Pitch);
      handleAutoSave();
    } else if (key === 'bpm' || key === 'pitch') {
      //ADR-0006 resync-on-mutation: bpm re-times every uncommitted boundary, so it retracts and
      //recommits the window (a pitch key that changed nothing lands here too, and recommitting an
      //unchanged window is the harmless half of the same rule). Reverb is a live node the committed
      //audio already flows through, and per-layer volume (see changeVolume) is a live gain for the
      //same reason — neither changes what should be committed, so neither resyncs.
      resyncPlayback();
    }
    updateSettings();
  }

  function addInstrument() {
    const isUmaMode = globalConfigStore.get().IS_UMA_MODE;
    if (song.instruments.length >= NoteLayer.MAX_LAYERS && !isUmaMode)
      return logger.error(
        t('composer:cant_add_more_than_n_layers', { max_layers: NoteLayer.MAX_LAYERS })
      );
    song.addInstrument(game.instruments.list[0]);
    syncInstruments(song);
  }

  async function removeInstrument(index: number) {
    if (layers.length <= 1) return logger.warn(t('composer:cant_remove_all_layers'));
    const confirm = await asyncConfirm(
      t('composer:confirm_layer_remove', {
        // Was `i18n.t('instruments.' + name)` — a pre-existing '.'-for-':' namespace
        // separator typo that NEVER resolved (i18next returned the raw
        // "instruments.Name" key here). Routed through tInstrument like every other
        // instrument-label lookup (Codex review, ADR-0003 follow-up): locale key,
        // else config displayName, else the raw name.
        layer_name: song.instruments[index].alias ?? tInstrument(song.instruments[index].name),
      })
    );
    if (confirm) {
      song.removeInstrument(index);
      syncInstruments(song);
      layer = Math.max(0, index - 1);
    }
  }

  function editInstrument(instrument: InstrumentData, index: number) {
    // setInstrument clones and REPLACES the array entry. That fresh identity is load-bearing:
    // InstrumentControls renders a keyed {#each} over the roster, so an in-place field edit would
    // leave the layer panel showing the old name/colour/visibility. Do not "optimise" it away.
    //
    // ADR-0007: it is also where the two NOTE rewrites live — an instrument swap (button-preserving
    // through nominal correspondence) and a per-layer Basepoint override change (the interval). The
    // snapshot goes in first so undo restores the notes and the roster together.
    const previous = song.instruments[index];
    if (previous && (previous.name !== instrument.name || previous.pitch !== instrument.pitch)) {
      addToHistory();
    }
    song.setInstrument(index, instrument);
    //THE NOTE-EDIT FUNNEL, not a bare resync: everything the popup writes is part of the saved song
    //(name, Basepoint override, volume, mute, alias, icon, visibility), and a swap or an override
    //change rewrites the track's notes as well — none of which counted as a change before, so the
    //save prompts and the menu's dirty dot never saw an edit made entirely from this panel.
    //It carries the ADR-0006 resync with it: this is where mute and the per-layer pitch override
    //land, and both change what committed audio should contain, synchronously — playSound reads the
    //roster entry just written. A NAME change resyncs a second time from syncInstruments, once the
    //replacement instrument exists.
    handleAutoSave();
    syncInstruments(song);
  }

  function syncInstruments(songToSync: ComposedSong = song) {
    return instrumentSynchronizer.sync(songToSync.instruments);
  }

  function changeVolume(obj: SettingVolumeUpdate) {
    const layerIndex = Number(obj.key.split('layer')[1]) - 1;
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[obj.key] = { ...settings[obj.key], volume: obj.value };
    layers[layerIndex].changeVolume(obj.value);
    updateSettings();
  }

  async function startRecordingAudio(override?: boolean) {
    if (!mounted) return;
    if (!override) {
      isRecordingAudio = false;
      // A stop during the 300 ms export pre-roll wins before playback has started. The initiating
      // call now observes the cancelled flag and returns, so this branch must also settle the
      // recorder it already connected instead of leaving it capturing indefinitely.
      if (AudioProvider.isRecording) void AudioProvider.stopRecording();
      return togglePlay(false);
    }
    // resume() must be requested directly from the export gesture. Waiting through the 300 ms
    // recorder lead-in first loses user activation in browsers that suspend contexts created at
    // app mount, leaving the transport clock frozen forever.
    isRecordingAudio = true;
    try {
      await AudioProvider.ensureRunning();
    } catch (error) {
      isRecordingAudio = false;
      console.error('Unable to start the audio context for composer export', error);
      return;
    }
    if (!mounted || !isRecordingAudio) return;
    AudioProvider.startRecording();
    await delay(300);
    if (!mounted || !isRecordingAudio) return;
    await togglePlay(true); //wait till song finishes
    //committed audio ENDS at the song's audio-true end (onFinished fires only once the last
    //column has fully elapsed), so all that is left to drain is the reverb/release tail
    await delay(1000);
    if (!mounted || !isRecordingAudio) return;
    isRecordingAudio = false;
    const recording = await AudioProvider.stopRecording();
    if (!recording) return;
    const fileName = await asyncPrompt(t('question:ask_song_name_cancellable'));
    try {
      if (fileName) await AudioRecorder.downloadBlob(recording.data, fileName + '.wav');
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_audio'));
    }
  }

  /**
   * Sound one NOTE ID on a track: immediately when `at` is omitted (previews, live entry), or
   * committed at the ABSOLUTE AudioContext time `at` — the engine speaks audio-clock time end
   * to end, never relative delays (ADR-0006). Every caller already holds a number — song
   * notes store them, and the keyboard's note answers `numberAt(pitch)` — so nothing here
   * resolves a Button any more (ADR-0005 §4 / ADR-0007: the engine's public API is
   * number-keyed). A number the track's instrument cannot voice at its Basepoint is STRANDED
   * there and stays silent, which is why the lookup below is still a guard.
   */
  function playSound(
    layer: number,
    number: number,
    at?: number,
    durationMs?: number,
    skipMs?: number
  ) {
    const instrument = layers[layer];
    if (!instrument) return;
    //one gate for both callers, so a live preview on a layer outside the solo set is as silent as
    //one on a muted layer - the rule belongs to the track, not to the path the sound came from
    if (!isTrackAudible(song.instruments, layer)) return;
    const pitch = song.instruments[layer].pitch || song.pitch;
    if (instrument.getNoteByNumber(number, pitch) === null) return;
    if (durationMs !== undefined && instrument.supportsSustain) {
      //spanned note on a sustaining instrument: hold for its musical length, then release
      instrument.pressNote(number, pitch, { at, durationMs, skipMs });
    } else {
      //on sustaining instruments play() IS the tap (minLength + release inside the
      //Instrument) — previews, span-1 columns and non-sustaining one-shots all land here
      instrument.play(number, pitch, at);
    }
  }

  /**
   * Attack a note and LEAVE IT SOUNDING until releaseNote — the live half of sustain recording.
   * Same guards as playSound, but no durationMs and no `at`: only the no-durationMs press is
   * registered in the instrument's heldVoices, so it is the only one a release can ever reach —
   * and a live press is a held voice sounding NOW, never committed into the future, so there is
   * no scheduled start for its release to race.
   */
  function playHeldSound(layer: number, number: number) {
    const instrument = layers[layer];
    if (!instrument) return;
    if (!isTrackAudible(song.instruments, layer)) return;
    const pitch = song.instruments[layer].pitch || song.pitch;
    if (instrument.getNoteByNumber(number, pitch) === null) return;
    instrument.pressNote(number, pitch);
  }

  /**
   * Real length in ms of columns [from, to): the song's own boundary grid (ADR-0008), which is
   * the difference of two rounded cumulative onsets rather than a sum of rounded columns. The
   * transport's running sum of consecutive calls therefore telescopes back onto the very times
   * song.toRecordedSong() writes — what plays and what exports cannot drift apart.
   */
  function columnsDurationMs(from: number, to: number): number {
    return song.columnsDurationMs(from, to);
  }

  // ── playback transport (ADR-0006: one clock, two meanings of "ahead") ──────────────────────
  // All playback timing lives on the AudioContext clock. The transport advances the sounding
  // cursor on it and commits column audio ahead on it, and every cancel sweep below reads the
  // SAME clock, so "what is committed" and "what is retractable" can never disagree about now.
  const clock = { now: () => AudioProvider.getAudioContext().currentTime };
  const transport = new ComposerTransport(clock, {
    columnDurationMs: (i) => columnsDurationMs(i, i + 1),
    columnCount: () => song.columns.length,
    // Sound column `index`'s notes, committed at the absolute audio time the transport's grid
    // assigned it. Commits only happen while the transport runs, so "am I playing" is implicit
    // here; a commit is the SONG sounding, never a browse's preview, so spanned notes always
    // carry their real length.
    commitColumn: (index, atAudioTime) => {
      song.columns[index]?.notes.forEach((note) => {
        playSound(
          note.trackIndex,
          note.id,
          atAudioTime,
          note.span > 1 ? columnsDurationMs(index, index + note.span) : undefined
        );
      });
    },
    // The sounding cursor entered `index`: move the selection with it (ignoreAudio — this
    // column's audio was committed up to a horizon ago), then let held sustains re-quantize
    // against the column the playhead has now actually reached.
    onSounding: (index, atAudioTime) => {
      publishPlaybackColumnStart(atAudioTime);
      selectColumn(index, true, false, true);
      advanceSustainRecordings();
    },
    // The audio-true end of the song: the last column has fully elapsed at the ear. The stop
    // path runs with an empty committed window left to cancel, and resolves the play-run
    // promise togglePlay handed out.
    onFinished: () => {
      togglePlay(false);
    },
  });

  /**
   * Retract every committed-but-unstarted event, on every layer, from this instant on. The
   * transport never touches audio (its contract), so each path that abandons the committed
   * window — stop, a jump's re-anchor, resyncPlayback — must run this sweep itself, and FIRST:
   * resync()/anchor() rebuild the window immediately, and anything not cancelled before that
   * would sound twice.
   */
  function resyncAudioCancel() {
    const now = clock.now();
    layers.forEach((instrument) => instrument?.cancelScheduledAfter(now));
  }

  /** Convert one absolute AudioContext timestamp to the renderer's performance.now() domain. */
  function publishPlaybackColumnStart(atAudioTime: number, newAnchor = false) {
    playbackColumnStartMs = performance.now() + (atAudioTime - clock.now()) * 1000;
    if (newAnchor) playbackAnchorGeneration++;
  }

  /**
   * Anchor both audio and visuals on the selected model column. Audio owns the exact timestamp;
   * reading it back avoids even a small second clock.now() skew between transport and renderer.
   */
  function anchorPlayback(index: number, margin = TRANSPORT_START_MARGIN_S): boolean {
    transport.anchor(index, margin);
    const startAt = transport.currentColumnStartTime;
    if (!transport.isRunning || startAt === null) return false;
    publishPlaybackColumnStart(startAt, true);
    pressSpansCoveringStart(startAt);
    return true;
  }

  /**
   * ADR-0006 "resync on mutation": any change to what-should-sound cancels the committed
   * window and recommits it from the sounding column with fresh durations. This is what makes
   * the ~1 s horizon free — in-window audio is never stale, so the window is indistinguishable
   * from a 0 ms one at the ear. No-op while stopped: there is no committed window to rebuild.
   */
  function resyncPlayback(forceReanchor = false) {
    if (!transport.isRunning) return;
    resyncAudioCancel();

    // Some model mutations (delete/restore in particular) move or replace selected behind this
    // component's back. A resync preserves the transport cursor, so reconcile explicitly instead
    // of letting the next sounding callback snap the UI back to the abandoned position.
    if (forceReanchor || song.selected !== transport.soundingColumn) {
      if (!anchorPlayback(song.selected)) void togglePlay(false);
      return;
    }

    // Before the start margin elapses, cancellation retracts both the anchor column and any
    // sustain which began earlier but covers it. Transport.resync() restores its own anchor;
    // Composer owns those external covering spans and must restore them at the identical time.
    const restoreCoveringSpan = transport.isCurrentColumnPending;
    transport.resync();
    if (restoreCoveringSpan && transport.isRunning && transport.isCurrentColumnPending) {
      const startAt = transport.currentColumnStartTime;
      if (startAt !== null) pressSpansCoveringStart(startAt);
    }
  }

  function changePitch(value: Pitch) {
    // MidiParser's own pitch funnel. It DELEGATES rather than repeating handleSettingChange's pitch
    // branch: the two entry points have to leave the song in the same state, and the copy that used
    // to live here had already drifted — it rewrote the notes and resynced but never counted the
    // change, so a Basepoint moved from the MIDI panel was a transposition the save prompts never
    // heard about.
    //
    // The guard is load-bearing rather than an optimisation: MidiParser calls this for the side
    // effects alone (its <PitchSelect> re-emits the value it is showing), and the branch it feeds
    // takes an undo snapshot and rewrites every note only when the Basepoint really moved.
    if (value === song.pitch) return;
    handleSettingChange({ key: 'pitch', data: { ...settings.pitch, value } });
  }

  /**
   * WHAT THE CANVAS CAN BE ASKED, once its renderer exists (see ComposerCanvas' onCanvasMeasures):
   * one visible column's width, and where a Pro View cell is on screen. Both are read at the instant
   * a duration popover opens and never held onto.
   *
   * A plain `let` and not `$state`: nothing reactive reads it - the two callers are event handlers -
   * and the value is a pair of closures over a renderer instance, which is exactly the kind of thing
   * a deep proxy has no business wrapping. Null before the dynamic pixi import resolves, in the
   * /theme preview, and after the canvas is torn down; every caller has a fallback for that.
   */
  let canvasMeasures: {
    columnWidth: () => number;
    proCellRect: (column: number, number: number) => ScreenRect | null;
  } | null = null;

  // ── note press state machine (spec 2026-08-03 §2 "Composer duration UX") ─────────
  // pointerdown creates a missing note immediately (the common tap feel); removal of an
  // existing note is deferred to the short-press RELEASE so a long-press can open the
  // duration popover without deleting the note first. Buttons covered by an earlier
  // note's span obey the occupancy rule: no new note, long-press edits the covering one.
  // Since 2026-08-22 a PHYSICAL note key runs the same machine while the song is stopped
  // (handleKeyNoteDown), and a held press that opened the popover is a Duration Hold
  // (CONTEXT.md) for as long as it lasts - see `holdActive` below.
  let durationPopover: {
    startColumn: number;
    trackIndex: number;
    id: number;
    /**
     * WHAT THE POPOVER IS POSITIONED AGAINST — the long-pressed keyboard BUTTON, or, since the Pro
     * View's canvas can open the same popover, the screen RECT of the cell that was held (spec §7).
     * See ComposerPopoverAnchor for why the two are different shapes rather than one nullable element.
     */
    anchor: ComposerPopoverAnchor;
    /** Span when the popover opened — the origin the still-held finger's drag is measured from. */
    spanAtOpen: number;
    /** Horizontal travel worth one column, frozen at open time (see holdDragStepPx). */
    dragStepPx: number;
    /**
     * The column selected when the popover opened — the SECOND origin of a Duration Hold
     * (CONTEXT.md), beside `spanAtOpen`. While the opening press is held, every column the selection
     * moves through is a column of span, from whatever moved it: a canvas scroll (either finger), a
     * wheel, the `<` `>` buttons, a shortcut, a Coast. Frozen here so the contribution stays
     * ABSOLUTE (`song.selected − selectedAtOpen`) rather than accumulated, exactly as the drag's is —
     * scrolling three columns out and three back leaves the span it started at.
     */
    selectedAtOpen: number;
    /**
     * WHETHER THE PRESS THAT OPENED THIS IS STILL DOWN (CONTEXT.md: Duration Hold). It is the whole
     * difference between the two lives of this popover: while it is true a column change EDITS the
     * span and dismisses nothing, and once it is false a column change dismisses as it always did,
     * leaving the slider, the steppers and the box for what the hand could not reach.
     *
     * A layer change dismisses in BOTH states — the note this popover names belongs to a track, and
     * a hold cannot follow it to another one.
     */
    holdActive: boolean;
    /**
     * The opening press's last reported horizontal travel, in px from where it began — 0 for a hold
     * with no pointer at all (a physical note key). Kept because the two contributions above are
     * ADDITIVE and either one can move on its own: when the selection moves under a still finger,
     * the span has to be recomputed from the travel that finger had already reported.
     */
    dragDeltaX: number;
  } | null = $state(null);
  // One press record PER BUTTON, not one for the whole keyboard: on touch two notes can be
  // held at once, and only the ADD half of the gesture runs at pointerdown - removal and
  // long-press are deferred to the release. A single slot let the second pointerdown
  // overwrite the first finger's record, so neither release recognised its own press and
  // tapping two selected notes together deselected NEITHER (one at a time worked, because
  // each down/up pair completed before the next down).
  // Keyed by Note Id, the same currency the three handlers already speak, so the id equality
  // the release used to test by hand is now the map lookup itself. Two fingers on the SAME
  // button still collapse to one record, which is the same single toggle they produced before.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- pointer-gesture bookkeeping, never read from the template
  const notePresses = new Map<
    number,
    { existedAtPress: boolean; coveringStart: number | null; longPressFired: boolean }
  >();

  /**
   * Drop every in-flight press. A record is only meaningful against the column and layer it
   * was taken in - its deferred removal targets `song.selected` and `layer` as they are at
   * RELEASE - so when either moves under a held finger the press is abandoned rather than
   * applied to whatever is now selected. Same dismissal points as durationPopover - including its
   * one exception, a running Duration Hold, which keeps both (see selectColumn) - and the reason a
   * stale record can never be consumed in a context it was not taken in.
   */
  function abandonNotePresses() {
    notePresses.clear();
  }

  // ── live sustain recording (playing + a sustaining track = the keyboard is an instrument) ──
  // Holding a key while the playhead walks records a DURATION: the note keeps sounding and its
  // span is re-quantized from how long the key has actually been down. Every input feeds the
  // same registry - pointer, PC keyboard, MIDI - because the note being held has nothing to do
  // with which device is holding it, and a release must find its note however it was started.
  type SustainRecording = {
    /** Track the key was pressed on: the selected layer can move under a held key. */
    trackIndex: number;
    startColumn: number;
    /**
     * The note object this hold owns. IDENTITY, not coordinates: undo, paste, a column
     * insert/remove or a song load can leave a DIFFERENT note answering the same
     * (column, track, id) address, and setNoteSpan would lengthen that one just as happily.
     */
    note: ColumnNote;
    /** Attack time - the hold clock the span is quantized against (see spanForHeldMs). */
    pressedAt: number;
    /** Whether this hold ever recorded more than its start column (drives autosave + the release). */
    grew: boolean;
  };
  const sustainRecordings = new HeldNoteRegistry<SustainRecording>();

  /**
   * Start recording a held note, or report that this press is an ordinary tap.
   *
   * Capability comes from the instrument config (`supportsSustain`), never from which game is
   * loaded. A button already covered by an earlier span obeys the occupancy rule, and a note
   * that already carries a duration is left alone - re-quantizing it from this press would
   * SHRINK an authored span back to what the finger has held so far.
   */
  function startSustainRecording(holder: string, id: number): boolean {
    if (!isPlaying) return false;
    if (!layers[layer]?.supportsSustain) return false;
    if (sustainRecordings.isHolding(holder)) return true; //auto-repeat / duplicate note-on
    if (song.getSpanCovering(song.selected, layer, id)) return false;
    const startColumn = song.selected;
    let note = song.selectedColumn.findNote(layer, id);
    if (note === null) {
      song.addNoteAt(startColumn, layer, id);
      handleAutoSave();
      note = song.columns[startColumn]?.findNote(layer, id) ?? null;
    }
    if (note === null) return false;
    //A note that already carries a duration records too: the hold can only ever LENGTHEN it
    //(see applySustainSpan), so re-playing an authored note over its own column is harmless,
    //while refusing here would drop the press back onto the editing path - which deletes the
    //note on release. Performing over your own long note must never erase it.
    const pressed = sustainRecordings.press(holder, id, {
      trackIndex: layer,
      startColumn,
      note,
      pressedAt: Date.now(),
      grew: false,
    });
    //null means this holder is already holding, which the guard above already returned for
    if (!pressed) return true;
    //only the first holder attacks: a second key on the same note joins the sounding voice
    if (pressed.isFirstHolderOfId) playHeldSound(layer, id);
    return true;
  }

  /**
   * Re-quantize one recording against the clock. Returns 'stale' when the note it owns is no
   * longer the note at its address, which is the signal to end the recording rather than write.
   */
  function applySustainSpan(
    id: number,
    recording: SustainRecording
  ): 'stale' | 'unchanged' | 'grown' {
    const current = song.columns[recording.startColumn]?.findNote(recording.trackIndex, id);
    if (current !== recording.note) return 'stale';
    //never past the playhead: a sustain cannot be recorded into the future
    const held = spanForHeldMs(
      Date.now() - recording.pressedAt,
      song.selected - recording.startColumn + 1,
      (offset) =>
        columnsDurationMs(recording.startColumn + offset, recording.startColumn + offset + 1)
    );
    //A hold only ever LENGTHENS. The quantized value is re-derived from scratch on every tick,
    //so without this floor anything that moves the playhead BACKWARDS under a held key -
    //a wheel-up, a timeline click, a canvas drag, a MIDI previous_column - would shrink the
    //playhead cap and rewrite the note shorter than what was already performed. It is also what
    //makes re-playing an already-spanned note safe.
    //...and never ask for more than the model would grant: setNoteSpan clamps to maxSpanAt but
    //publishes either way, so an unclamped request past a later same-id note would repaint the
    //canvas and invalidate the renderer's caches on every tick of the hold while changing nothing
    const applied = Math.min(
      Math.max(held, current.span),
      song.maxSpanAt(recording.startColumn, recording.trackIndex, id)
    );
    if (applied === current.span) return 'unchanged';
    song.setNoteSpan(recording.startColumn, recording.trackIndex, id, applied);
    if (current.span > 1) recording.grew = true;
    return 'grown';
  }

  /** The playhead moved: every still-held note re-quantizes against how long it has been down. */
  function advanceSustainRecordings() {
    for (const { holder, id, meta } of sustainRecordings.entries()) {
      if (applySustainSpan(id, meta) === 'stale') endSustainRecording(holder);
    }
  }

  /** End one hold: final quantization, then the voice stops if this was its last holder. */
  function endSustainRecording(holder: string) {
    const released = sustainRecordings.release(holder);
    if (!released) return;
    const { id, meta, isLastHolderOfId } = released;
    applySustainSpan(id, meta);
    if (isLastHolderOfId) layers[meta.trackIndex]?.releaseNote(id);
    //one save per recorded sustain - the per-tick growth deliberately does not count changes
    if (meta.grew) handleAutoSave();
  }

  function endAllSustainRecordings() {
    for (const { holder } of sustainRecordings.entries()) endSustainRecording(holder);
  }

  // Ends every hold when the ground under it moves. Loading or creating a song replaces `song`,
  // and an instrument edit, swap or removal replaces the Instrument a held voice belongs to —
  // all of those write `song`/`layer`/`layers` directly instead of going through changeLayer,
  // so hooking those call sites one by one would keep missing new ones. The note-identity check
  // in applySustainSpan already refuses the WRITE; this is what releases the voice.
  $effect(() => {
    void song;
    void layers[layer];
    return endAllSustainRecordings;
  });

  /**
   * The DISPLAYED track's effective Basepoint — the composer keyboard draws the selected
   * layer's instrument, so this is the Basepoint every press on it enters at and every note's
   * number is read at. Kept as one derived rather than re-spelled per handler: a keyboard
   * resolving at one Basepoint while the canvas resolves at another is the whole class of bug
   * ADR-0007 makes possible.
   */
  const layerPitch = $derived(song.instruments[layer]?.pitch || song.pitch);

  /** What pressing this key STORES and SOUNDS at the current Basepoint (ADR-0007 §4). */
  function numberOfNote(note: ObservableNote): number {
    return note.numberAt(layerPitch);
  }

  function handleClick(note: ObservableNote, pointerId: number) {
    //the clicked button's Note Number on the current layer's instrument - the one currency the
    //song edits below and the audio engine both speak (ADR-0005/ADR-0007)
    const id = numberOfNote(note);
    //while playing on a sustaining track the press is a PERFORMANCE, not an edit: it sounds
    //its own held attack, records its duration, and never deletes on release
    if (startSustainRecording(holderToken('pointer', pointerId), id)) return;
    beginNotePress(id);
  }

  /**
   * THE PRESS HALF of the state machine, in Note Numbers and knowing nothing about what pressed:
   * a pointer on a key (handleClick above) and a PHYSICAL note key (handleKeyNoteDown) are the same
   * gesture on the same surface, and the 2026-08-22 decision to give the physical key a long press
   * of its own is only true if it takes this path rather than a parallel one.
   *
   * The note is SOUNDED and, when it is missing, ADDED here - the common tap feel. Removal is the
   * release's, so a hold can open the duration popover without deleting the note first.
   */
  function beginNotePress(id: number) {
    playSound(layer, id);
    const covering = song.getSpanCovering(song.selected, layer, id);
    if (covering) {
      notePresses.set(id, {
        existedAtPress: false,
        coveringStart: covering.startColumn,
        longPressFired: false,
      });
      return;
    }
    const existing = song.selectedColumn.findNote(layer, id);
    if (existing === null) {
      song.addNoteAt(song.selected, layer, id);
      handleAutoSave();
    }
    notePresses.set(id, {
      existedAtPress: existing !== null,
      coveringStart: null,
      longPressFired: false,
    });
  }

  /**
   * THE RELEASE HALF, and the other end of every rule beginNotePress deferred: a short press on a
   * note that already existed REMOVES it, a covered button toggles nothing, and a press whose hold
   * opened the popover edits nothing at all on the way up.
   *
   * It is also where a Duration Hold ENDS for the two surfaces that own a press record (a keyboard
   * key and a physical note key) - the canvas has none and reports its own release through
   * handleProCellLongPressEnd. Cleared BEFORE the record is looked up, because it must happen even
   * when there is no record left to consume.
   */
  function endNotePress(id: number) {
    if (durationPopover?.id === id) durationPopover.holdActive = false;
    const press = notePresses.get(id);
    //a pointer fires twice per gesture (pointerup then pointerleave): the delete below consumes the
    //record, so the second call misses and does nothing
    if (!press) return;
    notePresses.delete(id);
    if (press.longPressFired) return;
    if (press.coveringStart !== null) return; //occupancy: covered buttons don't toggle
    if (press.existedAtPress) {
      song.removeNoteAt(song.selected, layer, id);
      handleAutoSave();
    }
  }

  /**
   * MIDI note entry, and the physical keyboard's WHILE PLAYING: toggling stays immediate there (the
   * pre-popover behavior), occupancy rule included. A physical key on a STOPPED song goes through
   * the press machine instead (handleKeyNoteDown) - see it for why MIDI does not.
   */
  function toggleNoteImmediate(note: ObservableNote) {
    toggleNoteInColumn(song.selected, numberOfNote(note));
  }

  /**
   * THE NOTE TOGGLE ITSELF, in ONE column of the current layer — the path every immediate entry
   * takes, whichever surface asked for it (spec §7): the physical keyboard and MIDI through
   * `toggleNoteImmediate` above, and a Pro View canvas tap through `handleProCellTap` below.
   *
   * ONE FUNCTION AND NOT TWO, because everything about it has to be the same for both: the preview
   * sound (played BEFORE the occupancy test, so a press on a covered button is still heard, and on
   * REMOVAL too — the keyboard has always previewed the note it is deleting), the occupancy rule, the
   * autosave funnel with its ADR-0006 resync and its `changes` count, and the fact that nothing here
   * touches `song.selected`. A canvas tap edits the column it landed on and moves the cursor nowhere;
   * the keyboard edits the selected column because that is the column ITS caller passes.
   *
   * A NUMBER RATHER THAN A BUTTON, unlike the spec's sketch of it: the removal half must work for a
   * Stranded Note, whose whole definition is that no button of this instrument voices it (CONTEXT.md:
   * Stranded Note) — a Button-keyed signature could not name one to delete it. `numberOfNote` is
   * where a pressed key becomes this number.
   */
  function toggleNoteInColumn(columnIndex: number, id: number) {
    playSound(layer, id);
    if (song.getSpanCovering(columnIndex, layer, id)) return;
    const existing = song.columns[columnIndex]?.findNote(layer, id);
    if (existing === undefined) return;
    if (existing === null) {
      song.addNoteAt(columnIndex, layer, id);
    } else {
      song.removeNoteAt(columnIndex, layer, id);
    }
    handleAutoSave();
  }

  /**
   * A SETTLED TAP ON A PRO VIEW CELL (spec §7): the whole of "tap = edit only, never selection".
   *
   * The renderer resolved WHERE (a column and a Note Number, the strip's band and every off-canvas
   * miss already declined there); this looks the cell up against the current layer and lets
   * `proCellAction` say what that means. Other layers' notes are not looked up at all — they never
   * block an add and are never the thing removed.
   *
   * THE UNDO SNAPSHOT is taken here rather than inside the shared toggle above, and that is a
   * deliberate asymmetry: `addToHistory` is the tools panel's compound entry (one clone, columns +
   * Basepoint + roster) and the composer keyboard has never taken one for a plain note toggle. Moving
   * it into the shared path would change what a keyboard press does; leaving the canvas without one
   * would make the one gesture that edits a column you cannot see the one gesture you cannot undo. So
   * the canvas takes one per editing gesture, and only when the gesture really edits — an inert tap
   * pushes nothing.
   */
  function handleProCellTap(columnIndex: number, id: number) {
    const instrument = song.instruments[layer];
    const action = proCellAction({
      hasOwnNote: song.columns[columnIndex]?.findNote(layer, id) != null,
      covered: song.getSpanCovering(columnIndex, layer, id) !== null,
      button: numberToButton(instrument?.name ?? '', layerPitch, id),
    });
    if (action === 'inert') return;
    addToHistory();
    toggleNoteInColumn(columnIndex, id);
  }

  /**
   * A PRO VIEW CELL HELD (spec §7): the composer keyboard's own long press, arriving from the canvas
   * instead of from a key.
   *
   * @returns whether the popover opened, which is what tells the renderer to swallow the release —
   * the canvas' counterpart of ComposerNote's `longPressFired`.
   *
   * Every gate is `handleNoteLongPress`'s, restated in this surface's terms rather than reasoned
   * about again: not while the song plays (holding MEANS recording a sustain then), only on
   * instruments that can sustain, only over a note of YOUR layer — and a hold over a span's tail
   * edits the note that owns the tail, which is the same occupancy rule the keyboard applies through
   * `press.coveringStart`.
   *
   * ONLY over an EXISTING note, and that is a decision re-affirmed rather than an omission (user,
   * 2026-08-22): an add-and-edit hold on empty cells was considered and rejected — a finger that
   * pauses before scrolling must not find it has written a note. Placing stays the tap's job; the
   * hold edits what is already there.
   */
  function handleProCellLongPress(columnIndex: number, id: number, rect: ScreenRect): boolean {
    if (isPlaying) return false;
    if (!layers[layer]?.supportsSustain) return false;
    const startColumn = song.getSpanCovering(columnIndex, layer, id)?.startColumn ?? columnIndex;
    const existing = song.columns[startColumn]?.findNote(layer, id);
    if (!existing) return false;
    addToHistory();
    durationPopover = {
      startColumn,
      trackIndex: layer,
      id,
      anchor: { rect },
      spanAtOpen: existing.span,
      //ONE WHOLE CELL of travel per column, which on this surface is the cell the finger is on (see
      //holdDragStepPx: the keyboard now measures in the same canvas columns) — and the finger that
      //opened the popover KEEPS EDITING (USER REVISION, 2026-08-22): the renderer feeds its
      //horizontal travel to dragPopoverSpan, the same absolute origin+delta rule the keyboard's
      //drag-after-hold applies through handleNoteDrag.
      dragStepPx: holdDragStepPx({ rect }),
      selectedAtOpen: song.selected,
      //the finger is still down, and stays the Duration Hold's until the renderer reports its
      //release through handleProCellLongPressEnd (CONTEXT.md: Duration Hold)
      holdActive: true,
      dragDeltaX: 0,
    };
    return true;
  }

  /**
   * CONTEXT.md: Duration Hold — the canvas' finger came up. The popover outlives it; what ends is
   * only the hold's own two rules (a column change edits instead of dismissing, and the selection
   * moves the span).
   *
   * The canvas keeps no press record — its hold is not an entry gesture, it never added a note — so
   * unlike the keyboard's release this is all there is to do.
   */
  function handleProCellLongPressEnd() {
    if (durationPopover) durationPopover.holdActive = false;
  }

  function handleNoteRelease(note: ObservableNote, pointerId: number) {
    //a recording press left no press record behind, so this is its only release path
    endSustainRecording(holderToken('pointer', pointerId));
    endNotePress(numberOfNote(note));
  }

  function handleNoteLongPress(note: ObservableNote, anchor: HTMLElement) {
    openDurationPopover(numberOfNote(note), { element: anchor });
  }

  /**
   * THE HOLD CAME GOOD ON A KEY — a pointer's, or a physical note key's (user decision 2026-08-22),
   * which is why this takes a Note Number and an anchor rather than a button and an element.
   *
   * Every gate is a rule rather than a guard. While the song plays, holding a key MEANS recording a
   * sustain — never "hand-edit this note's duration"; gated on isPlaying rather than on "is this
   * note recording" so it holds at every tempo and for the holds that record nothing (covered
   * buttons, already-spanned notes), and a popover opened mid-playback was useless anyway, since the
   * next tick dismisses it. Durations are only authorable on instruments that can actually sustain.
   * And a hold over a span's TAIL edits the note that owns the tail (`press.coveringStart`), which
   * is the occupancy rule the tap half already obeys.
   */
  function openDurationPopover(id: number, anchor: ComposerPopoverAnchor) {
    if (isPlaying) return;
    if (!layers[layer]?.supportsSustain) return;
    const press = notePresses.get(id);
    if (!press) return;
    press.longPressFired = true;
    const startColumn = press.coveringStart ?? song.selected;
    const existing = song.columns[startColumn]?.findNote(layer, id);
    if (!existing) return;
    addToHistory();
    durationPopover = {
      startColumn,
      trackIndex: layer,
      id,
      anchor,
      spanAtOpen: existing.span,
      dragStepPx: holdDragStepPx(anchor),
      selectedAtOpen: song.selected,
      //the key is still down by definition — this fires from its own hold clock
      holdActive: true,
      dragDeltaX: 0,
    };
  }

  /**
   * ONE COLUMN OF SPAN PER ONE VISIBLE COLUMN OF TRAVEL (CONTEXT.md: Duration Hold; user revision
   * 2026-08-22), whichever surface the hold began on — the canvas' own column width, taken at open
   * time.
   *
   * It used to be half the pressed KEY's width on the keyboard and half the CELL's on the canvas,
   * which made the same gesture mean two different things on one screen and, on the keyboard, a
   * distance with no relation to the columns the span is counted in. The canvas is where the span
   * can be SEEN growing, so its columns are the unit both surfaces measure in: drag a key one
   * column's width and the tail on the canvas grows by exactly the column under your eye.
   *
   * Measured once and frozen: the canvas cannot resize mid-gesture, and this would otherwise be a
   * layout read on every pointermove. The floor keeps the step usable if the measurement comes back
   * degenerate (no canvas yet, or a hidden/unlaid-out button behind the fallback below).
   */
  function holdDragStepPx(anchor: ComposerPopoverAnchor): number {
    const columnWidth = canvasMeasures?.columnWidth() ?? 0;
    if (columnWidth > 0) return Math.max(8, columnWidth);
    //no canvas to ask (the renderer's dynamic import has not resolved, or this is the /theme
    //preview): the anchor's own width is the nearest thing to a column on screen — and for a Pro
    //View cell it IS one, that rect being exactly one column wide
    const fallback =
      'element' in anchor ? anchor.element.getBoundingClientRect().width : anchor.rect.width;
    return Math.max(8, fallback);
  }

  /**
   * THE DURATION HOLD'S ONE WRITE PATH (CONTEXT.md: Duration Hold): the span the hold asks for,
   * from the two things that can have moved since it opened, and nothing else.
   *
   *     span = spanAtOpen + travel/step + (selected − selectedAtOpen)
   *
   * BOTH TERMS ARE ABSOLUTE and they ADD. Travel is measured from the press origin (right to
   * lengthen, left to shorten) and the selection from the column the popover opened on, so a wander
   * back — of the finger, of the canvas, or of both — restores the span it started at, and neither
   * feeder has to know what the other has done. The clamps are the slider's own.
   *
   * THE SELECTION TERM IS WHAT MAKES A HOLD REACH PAST THE SCREEN. A finger can only travel so far,
   * and a span can be a bar long: scrolling the canvas under the held key — with the other hand, the
   * wheel, the `<` `>` buttons or a shortcut — grows it a column at a time, which is the gesture the
   * glossary entry describes. It applies only while the opening press is HELD; selectColumn stops
   * calling this the moment it is let go.
   *
   * The drag ends with the pointer, but the popover outlives it (spec §2 dismissal rules), so the
   * slider, the steppers and the box are still there for what the hand could not reach.
   *
   * THREE FEEDERS, ONE RULE: the keyboard key's own drag arrives through handleNoteDrag below
   * (which first checks the moving key IS the popover's note), the Pro View canvas hold's drag
   * arrives here directly (USER REVISION, 2026-08-22) — the renderer only reports travel for the
   * press that opened the popover, so it has no second identity to check — and a selection that
   * moved under the hold re-enters through reapplyDurationHold with the travel already reported.
   */
  function dragPopoverSpan(deltaX: number) {
    const popover = durationPopover;
    if (!popover) return;
    popover.dragDeltaX = deltaX;
    const span = clamp(
      popover.spanAtOpen +
        Math.round(deltaX / popover.dragStepPx) +
        (song.selected - popover.selectedAtOpen),
      1,
      popoverMaxSpan
    );
    //setNoteSpan publishes unconditionally, and a drag is a stream of pointermoves that mostly
    //land on the span already applied - without this every one of them would repaint the canvas
    //and re-arm the autosave
    if (span === popoverSpan) return;
    setPopoverSpan(span);
  }

  /**
   * The selection moved under a still-held hold: re-ask for the span with the travel the opening
   * press had already reported. Same write path, same no-op skip — the only new thing in the sum is
   * `song.selected`, which the caller has already written.
   */
  function reapplyDurationHold() {
    const popover = durationPopover;
    if (!popover?.holdActive) return;
    dragPopoverSpan(popover.dragDeltaX);
  }

  function handleNoteDrag(note: ObservableNote, deltaX: number) {
    if (!durationPopover || durationPopover.id !== numberOfNote(note)) return;
    dragPopoverSpan(deltaX);
  }

  // The SPAN NUMBER, never the note object. Identity trap: with cloning gone the ColumnNote is a
  // stable object, so a $derived whose value IS the note re-runs on every edit (it reads the
  // tracked columns getter) but returns a === value and never propagates - the popover's slider
  // would freeze at the span it opened with while the song and the canvas tails updated
  // underneath. null doubles as "no such note", which is what the {#if} guard below tests.
  const popoverSpan = $derived.by(() => {
    const popover = durationPopover;
    if (!popover) return null;
    return (
      song.columns[popover.startColumn]?.findNote(popover.trackIndex, popover.id)?.span ?? null
    );
  });
  const popoverMaxSpan = $derived.by(() => {
    const popover = durationPopover;
    if (!popover) return 1;
    return song.maxSpanAt(popover.startColumn, popover.trackIndex, popover.id);
  });

  function setPopoverSpan(span: number) {
    if (!durationPopover) return;
    song.setNoteSpan(
      durationPopover.startColumn,
      durationPopover.trackIndex,
      durationPopover.id,
      span
    );
    handleAutoSave();
  }

  function closeDurationPopover() {
    durationPopover = null;
  }

  /**
   * Buttons of the current layer's instrument occupied by a span in the selected column
   * (tails, plus span starts so a long note reads as long).
   *
   * Deliberately BUTTONS, not Note Numbers (ADR-0004/0005/0007): the composer keyboard's rows
   * really are the current instrument's Buttons, and its other per-button side table
   * (`computeButtonLayerStatuses`) keys by the SAME instrument's Buttons — every track's notes
   * resolved against the keyboard on screen at ITS Basepoint, dropping the numbers it cannot
   * voice. One coordinate space for both side tables, addressed through the Button the Shape
   * hands the snippet; the -1 drop keeps numbers this instrument lacks out of it, here and
   * there alike.
   */
  const heldButtons = $derived.by(() => {
    //FIRST, and reading nothing but the gate: a column advance under the clear must not re-enter
    //the scan below at all, and it does not - this derived has no other dependency to invalidate on
    //once it has returned here (see noteStatesCleared).
    if (noteStatesCleared) return NO_HELD_BUTTONS;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt wholesale by this derived, never mutated after return
    const held = new Set<number>();
    const keyboard = layers[layer];
    if (!keyboard) return held;
    //the keyboard IS the selected layer's instrument, so its Basepoint is that track's
    const pitch = song.instruments[layer]?.pitch || song.pitch;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<number>();
    for (let start = song.selected - 1; start >= 0; start--) {
      for (const spanNote of song.columns[start]?.notesOfTrack(layer) ?? []) {
        if (seen.has(spanNote.id)) continue;
        seen.add(spanNote.id);
        if (start + spanNote.span > song.selected) {
          const button = keyboard.getButtonOfNumber(spanNote.id, pitch);
          if (button !== -1) held.add(button);
        }
      }
    }
    for (const spanNote of song.selectedColumn?.notesOfTrack(layer) ?? []) {
      if (spanNote.span > 1) {
        const button = keyboard.getButtonOfNumber(spanNote.id, pitch);
        if (button !== -1) held.add(button);
      }
    }
    return held;
  });

  async function renameSong(newName: string, id: string) {
    await songsStore.renameSong(id, newName);
    if (song.id === id) {
      song.name = newName;
    }
  }

  async function addSong(songToAdd: ComposedSong | RecordedSong) {
    const id = await songsStore.addSong(songToAdd);
    songToAdd.id = id;
    return songToAdd;
  }

  async function updateSong(songToSave: ComposedSong): Promise<boolean> {
    //if it is the default song, ask for name and add it
    if (songToSave.name === 'Untitled') {
      const name = await asyncPrompt(t('question:ask_song_name_cancellable'));
      if (name === null || !mounted) return false;
      songToSave.name = name;
      changes = 0;
      await addSong(songToSave);
      return true;
    }
    //if it exists, update it
    const existingSong = await songService.getSongById(songToSave.id!);
    if (existingSong) {
      songToSave.folderId = existingSong.folderId;
      await songsStore.updateSong(songToSave);
      console.log('song saved:', songToSave.name);
      changes = 0;
    } else {
      //if it doesn't exist, add it
      if (songToSave.name.includes('- Composed')) {
        const name = await asyncPrompt(t('composer:ask_song_name_for_composed_song_version'));
        if (name === null) return false;
        songToSave.name = name;
        addSong(songToSave);
        return true;
      }
      console.warn("song doesn't exist");
      songToSave.name = 'Untitled';
      updateSong(songToSave);
    }
    return true;
  }

  async function updateThisSong() {
    updateSong(song);
  }

  async function askForSongUpdate() {
    return await asyncConfirm(t('question:unsaved_song_save', { song_name: song.name }), true);
  }

  async function createNewSong() {
    if (song.name !== 'Untitled' && changes > 0) {
      const promptResult = await askForSongUpdate();
      if (promptResult === null) return;
      if (promptResult) {
        await updateSong(song);
      }
    }
    const name = await asyncPrompt(t('question:ask_song_name_cancellable'));
    if (name === null) return;
    const newSong = new ComposedSong(name, [
      game.instruments.list[0],
      game.instruments.list[0],
      game.instruments.list[0],
    ]);
    //a fresh song starts at the Basepoint (and tempo) the composer is set to, not at the
    //constructor's defaults: the settings panel is still showing those values, and since
    //ADR-0007 a song whose Basepoint disagreed with the panel would draw its notes on
    //different rows from the ones the keyboard entered them at
    newSong.bpm = settings.bpm.value;
    newSong.pitch = settings.pitch.value;
    changes = 0;
    if (!mounted) return;
    const added = (await addSong(newSong)) as ComposedSong;
    if (!mounted) return;
    //same reason as loadSong's guard: creating replaces the song under a running transport
    if (playbackActive || transport.isRunning) void togglePlay(false);
    song = added;
    layer = 0;
    // The roster above drives the controls, but notes sound through the separate loaded
    // Instrument array. Rebuild it when the song is replaced just as loadSong does; otherwise a
    // newly-created song displays its three default instruments while still playing the previous
    // song's layer instruments until another roster action happens to synchronize them.
    syncInstruments(added);
    // Selection and undo entries address the replaced song, while the clipboard is an
    // editor-level one: preserving it is what allows copy -> new song -> paste.
    selectedColumns = [];
    undoHistory = [];
    Analytics.songEvent({ type: 'create' });
  }

  async function loadSong(songToLoad: SerializedSong | ComposedSong) {
    //loading replaces the song under a running transport, and the committed window, the
    //sounding position and the play-run promise all belong to the song being replaced — playing
    //the incoming song from a stale index would be an accident, not a behavior. Stop first.
    if (playbackActive || transport.isRunning) void togglePlay(false);
    try {
      let parsed: ComposedSong | null = null;
      if (songToLoad instanceof ComposedSong) {
        //TODO not sure if i should clone the song here
        parsed = songToLoad;
      } else {
        if (RecordedSong.isSerializedType(songToLoad)) {
          const parsedRecorded = RecordedSong.deserialize(songToLoad);
          parsedRecorded.bpm = 400;
          parsed = parsedRecorded.toComposedSong(4);
          parsed.name += ' - Composed';
        }
        if (ComposedSong.isSerializedType(songToLoad)) {
          parsed = ComposedSong.deserialize(songToLoad);
        }
      }
      if (!parsed) return;
      if (changes !== 0) {
        let confirm = settings.autosave.value && song.name !== 'Untitled';
        if (!confirm && song.columns.length > 0) {
          //TODO is there a reason why this was not cancellable before?
          const promptResult = await asyncConfirm(
            t('question:unsaved_song_save', { song_name: song.name }),
            true
          );
          if (promptResult === null) return;
          confirm = promptResult;
        }
        if (confirm) {
          await updateSong(song);
        }
      }
      if (!mounted) return;
      // The confirmation/save awaits above leave the page interactive (and synced-tab messages
      // remain live). Playback may therefore have restarted since the entry guard. Stop once more
      // immediately before replacing every piece of song-dependent transport state.
      if (playbackActive || transport.isRunning) void togglePlay(false);
      settings.bpm = { ...settings.bpm, value: parsed.bpm };
      settings.pitch = { ...settings.pitch, value: parsed.pitch };
      settings.reverb = { ...settings.reverb, value: parsed.reverb };
      AudioProvider.setReverb(parsed.reverb);
      if (songToLoad.id && song.id === null) {
        isMidiVisible = false;
      }
      changes = 0;
      console.log('song loaded');
      layer = 0;
      song = parsed;
      selectedColumns = [];
      // Both hold columns cloned from the PREVIOUS song, carrying that song's track indices.
      // refreshSong() used to launder a stale restore into a fresh graph one tick later; with no
      // clone, undoing after a load installs the old song's columns into the new one - and then
      // autosaves the result.
      undoHistory = [];
      // the clipboard is deliberately NOT reset: its NoteColumns were cloned by copyColumns(), so
      // they are safe to carry across songs and serve as the tools panel's clipboard — and it
      // carries the Basepoints they were copied at, which is what lets the incoming song restate
      // them rather than paste another song's numbers verbatim (see its declaration).
      syncInstruments();
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_loading_song'));
    }
  }

  // In both functions the funnel (and its resync) runs BEFORE the selection move, not after.
  // While playing (reachable via the MIDI shortcuts) the move is a jump, and a jump's re-anchor
  // commits the target column's audio a start-margin into the future — still retractable, so a
  // resync arriving AFTER it would cancel that commit and, by resync's own contract, never
  // recommit the sounding column: the jumped-to column would land silent. Resync the mutation
  // first, then jump; the anchor is the last word on the committed window.
  function addColumns(amount = 1, position: number | 'end' = 'end') {
    song.addColumns(amount, position);
    handleAutoSave();
    if (amount === 1) selectColumn(song.selected + 1);
  }

  function removeColumns(amount: number, position: number) {
    if (song.columns.length < settings.beatMarks.value * 4) return;
    song.removeColumns(amount, position);
    handleAutoSave();
    if (song.columns.length <= song.selected) selectColumn(song.selected - 1);
  }

  /**
   * The promise the play-run in progress returned, with its resolver. CONTRACT: `await
   * togglePlay(true)` resolves when playback ENDS — startRecordingAudio depends on that ("wait
   * till song finishes"). Playback itself lives in the transport's worker-timer wakes, so
   * nothing here can await it; the contract is kept explicitly: PLAY creates the deferred, and
   * the stop path — reached by manual stop and by the transport's onFinished alike — resolves
   * it. Every other caller ignores the promise.
   */
  let playbackEnded: { promise: Promise<void>; resolve: () => void } | null = null;
  let playbackStartGeneration = 0;

  async function togglePlay(override?: boolean): Promise<void> {
    const newState = typeof override === 'boolean' ? override : !playbackActive;
    if (!newState) {
      playbackStartGeneration++;
      playbackStarting = false;
      isPlaying = false;
      //stopping playback releases voices still held from spanned notes. Live recordings end
      //FIRST, while their voices are still in heldVoices: each gets its normal release tail and
      //its final quantization, instead of the blanket fade below silencing a note whose span
      //would then keep growing for a key nobody can hear.
      endAllSustainRecordings();
      //then retract the committed window BEFORE fading what already sounds: with a ~1 s
      //horizon an uncancelled pause would leak a full second of runaway notes (ADR-0006 —
      //stop needed the cancellation registry anyway, which is why it exists).
      resyncAudioCancel();
      transport.stop();
      //finally fade what is already sounding — a release, not a cancellation: started audio
      //always rings out.
      layers.forEach((layer) => layer?.releaseAllNotes());
      playbackEnded?.resolve();
      playbackEnded = null;
      return;
    }
    //play while already playing (a duplicate 'play' broadcast from a synced tab): one
    //transport, one run — hand back the run in progress instead of committing its audio twice.
    if (playbackActive) return playbackEnded?.promise ?? Promise.resolve();

    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    playbackEnded = { promise, resolve };
    playbackStarting = true;
    const startGeneration = ++playbackStartGeneration;

    try {
      await AudioProvider.ensureRunning();
    } catch (error) {
      // A rejected resume is a failed play request, not a half-started run. Settle the deferred
      // so export and duplicate-play callers cannot hang, and leave the transport stopped.
      if (startGeneration === playbackStartGeneration) {
        playbackStarting = false;
        isPlaying = false;
        playbackEnded?.resolve();
        playbackEnded = null;
      }
      console.error('Unable to start the audio context for composer playback', error);
      return;
    }

    // stop/unmount/load can win while resume() is pending. Their generation bump and deferred
    // resolution make this completion stale; it must never anchor audio after that decision.
    if (!mounted || startGeneration !== playbackStartGeneration || !playbackStarting)
      return promise;

    //the audio-export offset lives in the anchor margin: the whole run — the resumed spans
    //below and every committed column — starts that much later, decided in exactly one place.
    const margin = TRANSPORT_START_MARGIN_S + (isRecordingAudio ? 0.5 : 0);
    //no selectColumn here: the anchor column is already selected, and its notes sound through
    //commitColumn like every other column's — the transport commits it at the anchor time.
    if (!anchorPlayback(song.selected, margin)) {
      //anchor refused (empty song / selection out of range — the transport's contract is to
      //stay STOPPED and fire nothing): nothing sounded and nothing will, so settle this run.
      return togglePlay(false);
    }
    playbackStarting = false;
    isPlaying = true;
    return promise;
  }

  /**
   * Notes whose span begins BEFORE the playback start column but still covers it
   * (play pressed mid-note): press each at `resumeAt` — the ABSOLUTE audio time the anchor
   * column is committed for, so resumed spans align with its notes by construction (the audio-
   * export offset rides in togglePlay's margin and needs no mirroring here). Each enters its
   * sample at the position the playhead would have reached, releasing where its span really
   * ends. Under the no-overlap invariant the nearest earlier same-(track, id) note is the only
   * possible coverer, so a backward scan marking seen pairs decides every candidate at its
   * first sighting. Only sustaining tracks resume — a one-shot sample's attack happened in the
   * past and cannot be meaningfully re-entered.
   */
  function pressSpansCoveringStart(resumeAt: number) {
    const startColumn = song.selected;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe set
    const seen = new Set<string>();
    for (let start = startColumn - 1; start >= 0; start--) {
      for (const spanNote of song.columns[start]?.notes ?? []) {
        const key = `${spanNote.trackIndex}:${spanNote.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (start + spanNote.span <= startColumn) continue;
        if (!layers[spanNote.trackIndex]?.supportsSustain) continue;
        //no id -> button -> id round-trip: playSound takes the id and drops it if the
        //track's instrument doesn't offer it (stranded = silent)
        playSound(
          spanNote.trackIndex,
          spanNote.id,
          resumeAt,
          columnsDurationMs(startColumn, start + spanNote.span),
          columnsDurationMs(start, startColumn)
        );
      }
    }
  }

  // Nothing is chained onto this. song.toggleBreakpoint() assigns a new breakpoints array (which
  // is what publishing means for that $state.raw field) and refuses any index validateBreakpoints()
  // would filter, so the toggle itself does not produce one to clean up.
  // Breakpoints going stale because COLUMNS disappeared is a different problem and not this
  // wrapper's to solve: the paths that shrink the live song's column array validate inside
  // ComposedSong - see validateBreakpoints' own docstring for which and why.
  function toggleBreakpoint(override?: number) {
    song.toggleBreakpoint(override);
  }

  function handleTempoChanger(changer: (typeof game.composer.tempoChangers)[number]) {
    if (selectedColumns.length) {
      addToHistory();
      song.setTempoChangerAt(selectedColumns, changer);
    } else {
      song.setTempoChangerAt(song.selected, changer);
    }
    handleAutoSave();
  }

  async function prepareToLeave(): Promise<boolean> {
    if (changes === 0) return true;
    if (settings.autosave.value) return updateSong(song);
    const shouldSave = await asyncConfirm(
      t('question:unsaved_song_save', { song_name: song.name }),
      true
    );
    if (shouldSave === null) return false;
    if (!shouldSave) return true;
    return updateSong(song);
  }

  async function changePage(pageName: string) {
    if (pageName === 'Home') return homeStore.open();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AppLink.svelte's identical resolve(href as any) note; pageName is a general runtime string, not a literal route id
    await goto(resolve(`/${pageName}` as any));
  }

  function selectColumn(
    index: number,
    ignoreAudio = false,
    forceAnchor = false,
    fromTransport = false
  ) {
    if (index < 0 || index > song.columns.length - 1) return;
    const jumped = index !== song.selected;
    //A RUNNING DURATION HOLD OWNS THE COLUMN CHANGE (CONTEXT.md: Duration Hold, user revision
    //2026-08-22): the press that opened the popover is still down, and a column crossed under it is
    //a column of SPAN rather than a dismissal. Both halves are suppressed for exactly as long as
    //that press lasts - the popover stays, and so does the press record it was opened from, whose
    //deferred edit is a no-op anyway once its hold has fired (see endNotePress). A LAYER change
    //still dismisses and still abandons, in either state: see changeLayer.
    //
    //...AND NOT WHILE THE SONG PLAYS. A hold can only be opened while stopped (openDurationPopover's
    //first gate), but playback can START under one - and then the column advances are the
    //TRANSPORT's rather than the hand's, so a hold left running would grow the span by one column
    //per tick for as long as the key stayed down. Playing dismisses, exactly as it always did.
    const holding = durationPopover?.holdActive === true && !isPlaying;
    //moving to another column dismisses the duration popover (spec §2 dismissal rules) and
    //abandons any held press, whose deferred edit was aimed at the column being left - this
    //is also every playback tick, so a note held while the song plays stays as pressed
    if (jumped && !holding) {
      if (durationPopover !== null) durationPopover = null;
      abandonNotePresses();
    }
    song.selected = index;
    //...AFTER the write, which is the whole input the re-ask adds (see reapplyDurationHold)
    if (jumped && holding) reapplyDurationHold();
    if (isToolsVisible && clipboard.columns.length === 0) {
      // the clicked column only ever feeds the min/max below, which then replace the array
      // wholesale - so extend the RANGE rather than pushing into the array (see its declaration)
      const min = Math.min(index, ...selectedColumns);
      const max = Math.max(index, ...selectedColumns);
      selectedColumns = new Array(max - min + 1).fill(0).map((_, i) => min + i);
    }
    // Only the transport callback may advance selection without changing its private cursor.
    // Renderer gestures also pass ignoreAudio (they should not preview a tap), but while playing
    // they are USER seeks and must cancel/re-anchor. Conflating those two sources was what made
    // wheel/drag/timeline movements snap back on the next transport wake.
    if (fromTransport) return;
    if (transport.isRunning) {
      // Manual movement while playing. Selection is already written above; anchor generation
      // makes even a +1 seek a discontinuity instead of looking like an ordinary transport tick.
      // Silent renderer releases publish their rounded landing even when it is the same floor
      // last published during the drag. Re-anchor that case too: while the pointer was down the
      // renderer deliberately ignored playback scheduling, so this release is the event which
      // hands visual/audio ownership back to the transport.
      if (jumped || forceAnchor) {
        resyncAudioCancel();
        if (!anchorPlayback(index)) void togglePlay(false);
      }
      return;
    }
    // A stopped renderer drag/coast is silent; a normal browse previews immediately.
    if (ignoreAudio) return;
    //stopped: manual browsing previews the column as immediate taps — no committed time and no
    //durations (sounding spans at length is playback's business, the transport's). Stranded ids
    //stay silent inside playSound, so no -1 guard is needed here any more.
    song.selectedColumn.notes.forEach((note) => {
      playSound(note.trackIndex, note.id);
    });
  }

  function selectColumnFromDirection(direction: number) {
    selectColumn(song.selected + direction);
  }

  function changeLayer(newLayer: number) {
    layer = newLayer;
    durationPopover = null;
    //the keys now belong to another instrument: each held note keeps the span it recorded and
    //releases on the track that actually sounded it
    endAllSustainRecordings();
    abandonNotePresses();
  }

  function toggleTools() {
    const wasVisible = isToolsVisible;
    isToolsVisible = !wasVisible;
    selectedColumns = wasVisible ? [] : [song.selected];
    // CLOSING THE PANEL ENDS THE COPY SESSION (user revision 2026-08-22). A copy still crosses
    // songs - that is what the clipboard's captured Basepoints are for, and loadSong still keeps it
    // - but only for as long as the panel stays open; closing discards it, so reopening always
    // starts clean rather than offering a paste from whatever was copied hours ago. Opening
    // discards nothing, there being nothing yet to discard.
    if (wasVisible) clipboard = { columns: [], pitches: [] };
    undoHistory = [];
  }

  function resetSelection() {
    clipboard = { columns: [], pitches: [] };
    selectedColumns = [song.selected];
  }

  function addToHistory() {
    if (!isToolsVisible) return;
    //ONE clone for all three members, so they cannot come from two different moments
    const snapshot = song.clone();
    undoHistory = [
      ...undoHistory,
      { columns: snapshot.columns, pitch: snapshot.pitch, instruments: snapshot.instruments },
    ];
  }

  function undo() {
    const history = undoHistory.pop();
    if (!history) return;
    song.restoreColumns(history.columns);
    //restored TOGETHER with the columns (see ComposerHistoryEntry): the notes only mean what the
    //Basepoint and the roster they were written against say they mean
    song.pitch = history.pitch;
    song.instruments = history.instruments.map((instrument) => instrument.clone());
    //...and the settings panel is a second copy of the song's Basepoint, so it follows or the two
    //disagree until the next edit
    settings.pitch = { ...settings.pitch, value: history.pitch };
    updateSettings();
    syncInstruments();
    //undo is the one mutation path with NO changes++ (it restores toward the saved state), so
    //it cannot ride the funnel's resync in handleAutoSave — resync explicitly (ADR-0006)
    resyncPlayback(true);
  }

  // The bulk tools below count changes bare rather than through handleAutoSave, so each carries
  // its own resync — the ADR-0006 rule is the same either way: the resync runs right after the
  // mutation. (copyColumns mutates nothing that sounds; its resync is the uniform rule
  // recommitting an unchanged window, and keeping the sites identical beats special-casing one.)
  function copyColumns(targetLayer: number | 'all') {
    // the Basepoints go in the same assignment as the columns, and they are the SOURCE song's:
    // read them now, because by paste time this component may be showing another song entirely
    clipboard = {
      columns: song.copyColumns(selectedColumns, targetLayer),
      pitches: song.trackPitches(),
    };
    changes++;
    resyncPlayback();
    selectedColumns = [];
  }

  function pasteColumns(insert: boolean, targetLayer: number | 'all') {
    addToHistory();
    if (targetLayer === 'all') song.pasteColumns(clipboard.columns, insert, clipboard.pitches);
    else if (Number.isFinite(targetLayer))
      song.pasteLayer(clipboard.columns, insert, targetLayer, clipboard.pitches);
    syncInstruments();
    changes++;
    resyncPlayback();
  }

  function eraseColumns(targetLayer: number | 'all') {
    addToHistory();
    song.eraseColumns(selectedColumns, targetLayer);
    changes++;
    resyncPlayback();
    selectedColumns = [song.selected];
  }

  function moveNotesBy(amount: number, position: number | 'all') {
    addToHistory();
    song.moveNotesBy(selectedColumns, amount, position);
    changes++;
    resyncPlayback();
  }

  function switchLayerPosition(direction: 1 | -1) {
    const toSwap = layer + direction;
    if (toSwap < 0 || toSwap > song.instruments.length - 1) return;
    // two halves of one move: swapLayer retags the notes (structure version), swapInstruments
    // reorders the roster (instruments signal)
    song.swapLayer(song.columns.length, 0, layer, toSwap);
    song.swapInstruments(layer, toSwap);
    changes++;
    resyncPlayback();
    syncInstruments();
    layer = toSwap;
  }

  function deleteColumns() {
    addToHistory();
    // no validateBreakpoints() chained on: deleteColumns() runs it itself, like the other paths
    // that shrink the column array. It did not use to, and while that was so, this call site was
    // what kept a deleted column's breakpoint out of the saved song
    song.deleteColumns(selectedColumns);
    changes++;
    resyncPlayback(true);
    selectedColumns = [song.selected];
  }

  function changeMidiVisibility(visible: boolean) {
    isMidiVisible = visible;
    if (visible) Analytics.songEvent({ type: 'create_MIDI' });
  }

  async function downloadSong(songToDownload: SerializedSong, as: 'song' | 'midi') {
    try {
      if (songToDownload.id === song.id) {
        if (settings.autosave.value) {
          await updateSong(song);
          songToDownload = song.serialize();
        } else {
          if (
            await asyncConfirm(
              t('composer:ask_download_of_current_song', { song_name: songToDownload.name })
            )
          ) {
            await updateSong(song);
            songToDownload = song.serialize();
          }
        }
      }
      if (as === 'song') {
        const parsed = songService.parseSong(songToDownload);
        songToDownload.data.appName = APP_NAME;
        const songName = songToDownload.name;
        // Downloads write the current format. The legacy old-format export was retired at
        // ADR-0007 (it cannot state an absolute Note Number) and its producer is kept,
        // commented, in ComposedSong/RecordedSong — old-format files still IMPORT fine.
        const converted = [parsed.serialize()];
        fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`);
        logger.success(t('logs:song_downloaded'));
        Analytics.userSongs('download', { page: 'composer' });
      } else if (as === 'midi') {
        const agrees = await asyncConfirm(t('menu:midi_download_warning'));
        const parsed = songService.parseSong(songToDownload);
        if (parsed instanceof VsrgSong) throw new Error("Can't convert Vsrg to MIDI");
        const midi = parsed.toMidi();
        if (!agrees) return;
        fileService.downloadMidi(midi);
        logger.success(t('logs:song_downloaded'));
      }
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_song'));
    }
  }
</script>

{#snippet playIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    style="color:var(--icon-color)"
    ><path
      d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"
    /></svg
  >
{/snippet}

{#snippet pauseIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="18"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    style="color:var(--icon-color)"
    ><path
      d="M144 479H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v352c0 26.5-21.5 48-48 48zm304-48V79c0-26.5-21.5-48-48-48h-96c-26.5 0-48 21.5-48 48v352c0 26.5 21.5 48 48 48h96c26.5 0 48-21.5 48-48z"
    /></svg
  >
{/snippet}

{#snippet addColumnIcon()}
  <svg
    width="194.40327mm"
    height="290.853mm"
    viewBox="0 0 194.40327 290.85299"
    xmlns="http://www.w3.org/2000/svg"
    class="tool-icon"
    style="fill:currentcolor"
  >
    <g>
      <rect
        width="50.962246"
        height="290.853"
        x="143.44104"
        y="2.4868996e-14"
        rx="15.05095"
        ry="17.061689"
      />
      <path
        d="m 42.968955,90.42652 c -2.198688,0 -3.96875,1.770063 -3.96875,3.96875 v 35.03145 H 3.9687499 C 1.7700625,129.42672 0,131.19678 0,133.39547 v 24.0621 c 0,2.19869 1.7700625,3.96875 3.9687499,3.96875 H 39.000205 v 35.03145 c 0,2.19869 1.770062,3.96875 3.96875,3.96875 h 24.062613 c 2.198687,0 3.968749,-1.77006 3.968749,-3.96875 v -35.03145 h 35.030933 c 2.19869,0 3.96875,-1.77006 3.96875,-3.96875 v -24.0621 c 0,-2.19869 -1.77006,-3.96875 -3.96875,-3.96875 H 71.000317 V 94.39527 c 0,-2.198687 -1.770062,-3.96875 -3.968749,-3.96875 z"
      />
      <rect width="7.8557625" height="1.5711526" x="57.085205" y="139.30885" rx="3.96875" />
    </g>
  </svg>
{/snippet}

{#snippet removeColumnIcon()}
  <svg
    width="194.40327mm"
    height="290.853mm"
    viewBox="0 0 194.40327 290.85299"
    xmlns="http://www.w3.org/2000/svg"
    class="tool-icon"
    style="fill:currentcolor"
  >
    <g>
      <rect
        width="50.962246"
        height="290.853"
        x="143.44104"
        y="2.4868996e-14"
        rx="15.05095"
        ry="17.061689"
      />
      <rect width="110.35661" height="35.805271" x="0" y="127.52386" rx="3.96875" />
    </g>
  </svg>
{/snippet}

{#snippet addPageIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

<!-- THE VIEW LOCK'S TWO STATES (Pro View only), a closed padlock while the frame is pinned to the
     current layer's Editable Zone and an open one while it can be panned. Same 448x512 Font Awesome
     viewBox and the same 16px box as the four tools above it, so the column stays one column. -->
{#snippet lockedViewIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M400 224h-24v-72C376 68.2 307.8 0 224 0S72 68.2 72 152v72H48c-26.5 0-48 21.5-48 48v192c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V272c0-26.5-21.5-48-48-48zm-104 0H152v-72c0-39.7 32.3-72 72-72s72 32.3 72 72v72z"
    /></svg
  >
{/snippet}

{#snippet unlockedViewIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M400 256H152V152c0-39.7 32.3-72 72-72s72 32.3 72 72v8c0 13.3 10.7 24 24 24h32c13.3 0 24-10.7 24-24v-8C376 68.2 307.8 0 224 0S72 68.2 72 152v104H48c-26.5 0-48 21.5-48 48v160c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V304c0-26.5-21.5-48-48-48z"
    /></svg
  >
{/snippet}

{#snippet toolsIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M501.1 395.7L384 278.6c-23.1-23.1-57.6-27.6-85.4-13.9L192 158.1V96L64 0 0 64l96 128h62.1l106.6 106.6c-13.6 27.8-9.2 62.3 13.9 85.4l117.1 117.1c14.6 14.6 38.2 14.6 52.7 0l52.7-52.7c14.5-14.6 14.5-38.2 0-52.7zM331.7 225c28.3 0 54.9 11 74.9 31l19.4 19.4c15.8-6.9 30.8-16.5 43.8-29.5 37.1-37.1 49.7-89.3 37.9-136.7-2.2-9-13.5-12.1-20.1-5.5l-74.4 74.4-67.9-11.3L334 98.9l74.4-74.4c6.6-6.6 3.4-17.9-5.7-20.2-47.4-11.7-99.6.9-136.6 37.9-28.5 28.5-41.9 66.1-41.2 103.6l82.1 82.1c8.1-1.9 16.5-2.9 24.7-2.9zm-103.9 82l-56.7-56.7L18.7 402.8c-25 25-25 65.5 0 90.5s65.5 25 90.5 0l123.6-123.6c-7.6-19.9-9.9-41.6-5-62.7zM64 472c-13.2 0-24-10.8-24-24 0-13.3 10.7-24 24-24s24 10.7 24 24c0 13.2-10.7 24-24 24z"
    /></svg
  >
{/snippet}

<PageMetadata
  text={`${t('home:composer_name')} - ${song.name}`}
  description="Create or edit songs with the composer, using up to 52 layers, tempo changers, multiple instruments and pitches. You can also convert a MIDI, video or audio into a sheet."
/>
{#if isMidiVisible}
  <MidiParser
    data={{
      instruments: song.instruments,
      selectedColumn: song.selected,
    }}
    functions={{
      changeMidiVisibility,
      changePitch,
      loadSong,
    }}
  />
{/if}
<!-- `composer-grid-in-preview` keeps /theme's composer preview on the pre-existing centred layout:
     App.css's desktop block gives the real page a permanent sidebar column and a canvas that fills
     the window, neither of which fits a small box inside a scrolling page (same exclusion as
     `.canvas-wrapper-in-preview` and ComposerMenu's `composer-menu-sidebar`). -->
<!-- `composer-grid-pro` is the Pro View's whole DOM difference (CONTEXT.md; App.css's own PRO VIEW
     block): the canvas' row takes the window, the keyboard becomes a bottom sheet over it and the
     tempo changers get their own slot. `proView` already excludes the preview - see its declaration. -->
<div
  class={[
    'composer-grid',
    'appear-on-mount',
    inPreview && 'composer-grid-in-preview',
    proView && 'composer-grid-pro',
    proView && keyboardSheetRaised && 'composer-grid-pro-raised',
  ]}
>
  <div class="column composer-left-control">
    <AppButton
      class="flex-centered"
      style="height:3rem;min-height:3rem;border-radius:0.3rem;background-color:var(--primary-darken-10)"
      onclick={() => {
        const wasPlaying = playbackActive;
        togglePlay();
        if (settings.syncTabs.value) {
          // QUIRK: opposite ternary from handleShortcut's toggle_play broadcast - see that function.
          broadcastChannel?.postMessage?.(wasPlaying ? 'stop' : 'play');
        }
      }}
      ariaLabel={playbackActive ? t('common:pause') : t('common:play')}
    >
      {#if playbackActive}
        {@render pauseIcon()}
      {:else}
        {@render playIcon()}
      {/if}
    </AppButton>
    <InstrumentControls
      instruments={song.instruments}
      selected={layer}
      usedLayers={usedLayersInSelectedColumn}
      onLayerSelect={changeLayer}
      onInstrumentAdd={addInstrument}
      onInstrumentChange={editInstrument}
      onInstrumentDelete={removeInstrument}
      onChangePosition={switchLayerPosition}
    />
  </div>
  <div class="top-panel-composer" style="grid-area:b">
    <!-- THE CANVAS AND THE TOOL COLUMN'S ROW. `fit-content` is as tall as the CANVAS, which is what
         the Compressed View wants (the keyboard follows underneath) and what held the Pro View's
         tool column - and with it the tempo changers at its foot - to the canvas' bottom edge,
         above the sliver and the song-info row with a band of nothing under them. In the Pro View
         it takes the whole grid row instead, so the column runs to the window's own bottom; the
         canvas keeps its own height either way (App.css gives `.canvas-wrapper` `align-self:
         flex-start` there). Inline rather than in App.css because an inline `height` is exactly
         what a stylesheet rule cannot override. -->
    <div class="row" style="height:{proView ? '100%' : 'fit-content'};width:100%">
      <!--
        BOTH KEYS, AS ONE STRING. A flip of either one changes the canvas' size, every column
        texture in the ComposerCache and (for `proView`) which end of the canvas the mini-timeline
        is drawn at, none of which ComposerRenderer re-derives after construction - so it is
        remounted instead, exactly as `columnsPerCanvas` has always been. A template literal and not
        an array: an array literal is a fresh identity every time it is evaluated, which is not what
        `{#key}` compares.
      -->
      {#key `${settings.columnsPerCanvas.value}|${proView}`}
        <ComposerCanvas
          columns={song.columns}
          structureVersion={song.structureVersion}
          {isPlaying}
          {playbackColumnStartMs}
          {playbackAnchorGeneration}
          {isRecordingAudio}
          instruments={song.instruments}
          songPitch={song.pitch}
          selected={song.selected}
          currentLayer={layer}
          {inPreview}
          {settings}
          breakpoints={song.breakpoints}
          {selectedColumns}
          {viewLocked}
          keyboardRaised={keyboardSheetRaised}
          {selectColumn}
          {toggleBreakpoint}
          onProCellTap={handleProCellTap}
          onProCellLongPress={handleProCellLongPress}
          onProCellLongPressDrag={dragPopoverSpan}
          onProCellLongPressEnd={handleProCellLongPressEnd}
          onCanvasMeasures={(measures) => (canvasMeasures = measures)}
          onKeyboardDismiss={() => (keyboardRaised = false)}
          onViewUnlock={() => (viewLocked = false)}
          {heldNoteKeyCodes}
        />
      {/key}
      <div class="buttons-composer-wrapper-right">
        <CanvasTool
          onclick={() => addColumns(1, song.selected)}
          tooltip={t('composer:add_column')}
          ariaLabel={t('composer:add_column')}
        >
          {@render addColumnIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={() => removeColumns(1, song.selected)}
          tooltip={t('composer:remove_column')}
          ariaLabel={t('composer:remove_column')}
        >
          {@render removeColumnIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={() => addColumns(Number(settings.beatMarks.value) * 4, 'end')}
          tooltip={t('composer:add_new_page')}
          ariaLabel={t('composer:add_new_page')}
        >
          {@render addPageIcon()}
        </CanvasTool>
        <CanvasTool
          onclick={toggleTools}
          toggled={isToolsVisible}
          tooltip={t('composer:open_tools')}
          ariaLabel={t('composer:open_tools')}
        >
          {@render toolsIcon()}
        </CanvasTool>
        <!-- THE VIEW LOCK, a fifth tool in this same column and only in the Pro View - there is no
             frame to lock in the Compressed View, whose canvas shows every row of every column at
             once. Locked (the default), the canvas stays framed on the current layer's Editable Zone
             and a drag scrolls horizontally as it always has; unlocked, that drag pans vertically as
             well and the frame stays where the hand left it, until this button eases it back
             (CONTEXT.md: View Lock). App.css's `.composer-grid-pro` variant of this column is what
             keeps five buttons the size four were. -->
        {#if proView}
          <CanvasTool
            onclick={() => (viewLocked = !viewLocked)}
            toggled={!viewLocked}
            tooltip={viewLocked
              ? t('composer:unlock_view_description')
              : t('composer:lock_view_description')}
            ariaLabel={viewLocked ? t('composer:unlock_view') : t('composer:lock_view')}
          >
            {@render (viewLocked ? lockedViewIcon : unlockedViewIcon)()}
          </CanvasTool>
          <!-- THE TEMPO CHANGERS' PRO SLOT. The same component the keyboard renders in the
               Compressed View (ComposerTempoChangers), rendered HERE instead: in the Pro View the
               keyboard is a bottom SHEET that spends most of its life translated off-screen, and
               these must stay reachable while it is down (spec §8).

               INSIDE THIS COLUMN, as its last row, rather than floated into the corner underneath
               it. "Aligned under the right CanvasTool column" was a coordinate before the phase E
               mobile pass and is a grid row now, because a floated slot only LOOKS aligned while
               the window is tall: the tools pack from the top and the slot is pinned to the
               bottom, so on a landscape phone (850x420) the two met and the tempo buttons covered
               the View Lock. As a row of the same grid they cannot overlap at any height - the
               tools shrink toward it instead (App.css's `repeat(5, ...) 1fr`). -->
          <ComposerTempoChangers
            {isPlaying}
            currentColumn={song.selectedColumn}
            {handleTempoChanger}
          />
        {/if}
      </div>
    </div>
  </div>
  <!-- THE PRO VIEW'S KEYBOARD OVERLAY, in two pieces:

       1. the KEYBOARD itself, unchanged - the same component, still mounted while it is down. What
          a lowered sheet SHOWS turns on whether the song is running: stopped it stays live, which
          is what makes browsing and editing with it down work; playing it shows nothing at all and
          costs nothing per column (`noteStatesCleared` above, spec §4). It paints its own SCRIM
          (App.css's `.composer-keyboard-wrapper::before`), which is why there is no backdrop
          element here any more: the scrim is the sheet's own band plus a fading head, so the canvas
          above it stays bright, live and scrollable, and a settled tap on it is what dismisses the
          sheet (spec §7, composerInput.stageReleaseIntent) - the swallow is that rule rather than
          an element the press cannot get past.
       2. the SLIVER's tap target, in front of the lowered sheet so raising it cannot also press a
          key. It is gone once the sheet is up, where the canvas is what a tap outside means.

       The Compressed View renders neither and the keyboard is simply the bottom of the page. -->
  <ComposerKeyboard
    functions={{
      handleClick,
      handleNoteRelease,
      handleNoteDrag,
      handleNoteLongPress,
      registerNoteElement,
      startRecordingAudio,
      selectColumnFromDirection,
      handleTempoChanger,
    }}
    data={{
      isPlaying,
      settings,
      isRecordingAudio,
      currentLayer: layer,
      instruments: song.instruments,
      keyboard: layers[layer],
      currentColumn: song.selectedColumn,
      heldButtons,
      pitch: song.instruments[layer]?.pitch || song.pitch,
      noteNameType: settings.noteNameType.value,
      proView,
      noteStatesCleared,
    }}
  />
  {#if proView}
    <!-- ...and not while the tools are open: the sheet is forced down then (keyboardSheetRaised),
         so this tap could only write a raise the panel refuses to show. -->
    {#if !keyboardSheetRaised && !isToolsVisible}
      <button
        class="composer-keyboard-sliver"
        aria-label={t('composer:show_keyboard')}
        onclick={() => (keyboardRaised = true)}
      ></button>
    {/if}
  {/if}
  {#if durationPopover && popoverSpan !== null}
    <ComposerDurationPopover
      span={popoverSpan}
      maxSpan={popoverMaxSpan}
      anchor={durationPopover.anchor}
      holdActive={durationPopover.holdActive}
      onChange={setPopoverSpan}
      onClose={closeDurationPopover}
    />
  {/if}
</div>
<ComposerMenu
  data={{
    isRecordingAudio,
    settings,
    hasChanges: changes > 0,
    currentSongId: song.id,
  }}
  functions={{
    loadSong,
    renameSong,
    downloadSong,
    createNewSong,
    changePage,
    updateThisSong,
    handleSettingChange,
    changeVolume,
    changeMidiVisibility,
    startRecordingAudio,
  }}
  {inPreview}
/>
<ComposerTools
  data={{
    isToolsVisible,
    layer,
    hasCopiedColumns: clipboard.columns.length > 0,
    selectedColumns,
    undoHistory,
    proView,
  }}
  functions={{
    toggleTools,
    copyColumns,
    eraseColumns,
    moveNotesBy,
    pasteColumns,
    deleteColumns,
    resetSelection,
    undo,
  }}
/>
<!-- `song-info-pro` and not a descendant selector: this overlay is a SIBLING of `.composer-grid`, so
     `.composer-grid-pro .song-info` would never match it. All it changes is the SHAPE - the name and
     the time side by side across the window's bottom rather than stacked in its corner, so the line
     it floats over the canvas is one row of the axis instead of two. It reserves nothing and is
     under the keyboard sheet, which may cover it (App.css, user revision 2026-08-22). -->
<div class={['song-info', proView && 'song-info-pro']}>
  <div class="text-ellipsis">
    {song.name}
  </div>
  <div>
    {formatMs(songLength.current)}
    /
    {formatMs(songLength.total)}
  </div>
</div>
