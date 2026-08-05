<script lang="ts">
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import { onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from '$i18n/binding.svelte';
  import { i18n } from '$i18n/i18n';
  import ZenKeypad from '$cmp/pages/ZenKeyboard/ZenKeypad.svelte';
  import ZenKeyboardMenu from '$cmp/pages/ZenKeyboard/ZenKeyboardMenu.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import { ZenKeyboardSettings, type ZenKeyboardSettingsDataType } from '$core/BaseSettings';
  import { Instrument, type ObservableNote } from '$lib/audio/Instrument.svelte';
  import { metronome } from '$lib/audio/Metronome';
  import { AudioProvider } from '$lib/providers/AudioProvider';
  import { MIDIProvider } from '$lib/providers/MIDIProvider';
  import { settingsService } from '$core/Services/SettingsService';
  import { logger } from '$stores/LoggerStore.svelte';
  import { zenKeyboardStore } from '$stores/ZenKeyboardStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import type { InstrumentName } from '$core/types';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';

  let settings: ZenKeyboardSettingsDataType = $state(ZenKeyboardSettings.data);
  let instrument: Instrument = $state(new Instrument());
  let isMetronomePlaying = $state(false);
  //buttons physically held right now (pointer or bound key) — rendered pressed-down
  const heldNotes = new SvelteSet<number>();

  onMount(() => {
    setPageVisited('zenKeyboard');
  });

  onMount(() => {
    const loaded = settingsService.getZenKeyboardSettings();
    metronome.bpm = loaded.metronomeBpm.value;
    instrument = new Instrument(loaded.instrument.value);
    settings = loaded;
    AudioProvider.setReverb(loaded.reverb.value);
    return () => {
      logger.hidePill();
      //the metronome is app-global, so leaving the page has to silence it explicitly
      metronome.stop();
    };
  });

  $effect(() => {
    const currentInstrument = instrument;
    // QUIRK (load-bearing): zenKeyboardStore.setKeyboardLayout does a splice that reads
    // keyboard.length (for the delete count) and writes to that same $state array in one
    // call. Svelte auto-tracks any reactive read anywhere in an $effect's call stack, so that
    // .length read became a tracked dependency of THIS effect too, and the splice's own write
    // immediately invalidated it - an infinite effect_update_depth_exceeded reschedule loop.
    // untrack() confines tracking to the explicit `instrument` read above, so this still
    // reruns whenever `instrument` is reassigned without also tracking setKeyboardLayout's
    // own internal bookkeeping read.
    untrack(() => {
      zenKeyboardStore.setKeyboardLayout(currentInstrument.notes);
    });
  });

  $effect(() => {
    // Snapshots `instrument` here (not read fresh inside load()/the cleanup) - otherwise the
    // cleanup below would read whatever `instrument` has ALREADY been reassigned to by the
    // time it runs (a brand-new, not-yet-loaded Instrument whose .endNode is still null),
    // silently leaking the true previous instrument's connected audio nodes on every swap.
    const currentInstrument = instrument;
    async function load() {
      // QUIRK: 'instruments.' + ... below is a literal dot, not the ':' namespace separator
      // every other instrument-label lookup in this codebase uses - i18next resolves this
      // as a literal key path instead of the `instruments` namespace, so the pill likely
      // shows a raw untranslated key fragment. Preserved from old, not "fixed" to a colon.
      logger.showPill(
        i18n.t('zen_keyboard:loading_instrument', {
          instrument: i18n.t('instruments.' + settings.instrument.value),
        })
      );
      await currentInstrument.load(AudioProvider.getAudioContext());
      logger.hidePill();
      AudioProvider.connect(currentInstrument.endNode, null);
    }

    load();
    return () => {
      //hard-release held voices before the node is disconnected (instrument swap mid-hold)
      currentInstrument.releaseAllNotes(true);
      heldNotes.clear();
      AudioProvider.disconnect(currentInstrument.endNode);
    };
  });

  $effect(() => {
    //missed key-up guard: leaving the tab releases only LIVE held keys (audio is
    //otherwise allowed to keep sounding in a background tab)
    const currentInstrument = instrument;
    const releaseOnLeave = () => {
      currentInstrument.releaseHeldNotes();
      heldNotes.clear();
    };
    window.addEventListener('blur', releaseOnLeave);
    document.addEventListener('visibilitychange', releaseOnLeave);
    return () => {
      window.removeEventListener('blur', releaseOnLeave);
      document.removeEventListener('visibilitychange', releaseOnLeave);
    };
  });

  $effect(() => {
    // No cleanup here on purpose: this reruns on every toggle, so a cleanup would stop and
    // immediately restart the metronome. Leaving the page is handled by the onMount cleanup
    // above (old had neither, and left it ticking in the background forever).
    if (isMetronomePlaying) metronome.start();
    else metronome.stop();
  });

  function updateSettings(settings: ZenKeyboardSettingsDataType) {
    settingsService.updateZenKeyboardSettings(settings);
  }

  function handleSettingChange(setting: SettingUpdate) {
    const { data } = setting;
    // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
    settings[setting.key] = { ...settings[setting.key], value: data.value };
    if (setting.key === 'instrument') {
      instrument = new Instrument(data.value as InstrumentName);
    }
    if (setting.key === 'reverb') {
      AudioProvider.setReverb(data.value as boolean);
    }
    if (setting.key === 'metronomeBpm') metronome.bpm = data.value as number;
    if (setting.key === 'metronomeBeats') metronome.beats = data.value as number;
    if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number);
    updateSettings(settings);
  }

  function onNoteClick(note: ObservableNote) {
    //one-shot on non-sustaining instruments (exact old path), held Voice on sustaining ones
    instrument.pressNote(note.index, settings.pitch.value);
    //the pressed-down visual only applies where holding means something
    if (instrument.supportsSustain) heldNotes.add(note.index);
    zenKeyboardStore.animateNote(note.index);
    MIDIProvider.broadcastNoteClick(note.midiNote);
  }

  function onNoteRelease(note: ObservableNote) {
    heldNotes.delete(note.index);
    instrument.releaseNote(note.index);
  }

  function onVolumeChange(data: SettingVolumeUpdate) {
    instrument.changeVolume(data.value);
  }
</script>

<AppBackground page="Main">
  <PageMetadata
    text={t('home:zen_keyboard_name')}
    description="The simplest keyboard in the app, focus only on playing manually with all the features of the player, instrument and pitch selection, animations and metronome"
  />
  <ZenKeyboardMenu
    {settings}
    {isMetronomePlaying}
    setIsMetronomePlaying={(val) => (isMetronomePlaying = val)}
    {onVolumeChange}
    {handleSettingChange}
  />
  <div class="flex-centered">
    <ZenKeypad
      {onNoteRelease}
      {heldNotes}
      {instrument}
      {onNoteClick}
      noteNameType={settings.noteNameType.value}
      pitch={settings.pitch.value}
      scale={settings.keyboardSize.value}
      keySpacing={settings.keyboardSpacing.value}
      verticalOffset={settings.keyboardYPosition.value}
    />
  </div>
</AppBackground>
