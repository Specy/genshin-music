<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import BaseNote from '$cmp/BaseNote.svelte';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import type { KeyboardCode } from '$lib/providers/KeyboardProvider/KeyboardTypes';
  import type { VsrgSongKeys } from '$core/Songs/VsrgSong.svelte';
  import { keyBinds, type Shortcut } from '$stores/KeybindsStore.svelte';
  import { Instrument, type ObservableNote } from '$lib/audio/Instrument.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import ShapeKeyboard from '$lib/games/shapes/ShapeKeyboard.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Card from '$cmp/layout/Card.svelte';
  import Header from '$cmp/header/Header.svelte';
  import ShortcutEditor from '$cmp/pages/keybinds/ShortcutEditor.svelte';
  import { COMPOSER_WHEEL_SHORTCUTS, fixedShortcutsTable } from '$cmp/pages/ShortcutsTable.svelte';
  import VsrgKey from '$cmp/pages/keybinds/VsrgKey.svelte';
  import MidiSetup from '$cmp/pages/keybinds/MidiSetup.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';

  // KeyboardProvider.listen() is registered once in onMount (not re-subscribed per selection
  // change) - both selections below are $state, so the closure always reads their latest value
  // regardless of when the listener was registered.
  const baseInstrument = new Instrument();

  // Two selections, because they select two different KINDS of thing. The note grid selects a
  // NOTE: per-note UI state is addressed through the note object (ADR-0005), and the rebind it
  // arms attaches to that note's default label, so a screen position never enters the picture.
  // The VSRG rows select a numbered LANE, which really is an index and stays one. They remain
  // mutually exclusive - arming either clears the other - exactly like the single `selected`
  // state they replace, which compared a bare index across both kinds (clicking note 3 while
  // VSRG lane 3 was armed used to read as "deselect").
  let selectedNote = $state<ObservableNote | null>(null);
  let selectedVsrg = $state<{ type: '' | 'k4' | 'k6' | 'k8'; index: number }>({
    type: '',
    index: -1,
  });

  // setShortcut returns the whole conflicting Shortcut object, not its name - interpolating it
  // directly rendered "[object Object]". `shortcuts:props.<name>` is the same key
  // ShortcutElement.svelte labels each row with, so the warning names the action the user sees.
  function shortcutInUseMessage(existing: Shortcut<string>) {
    return t('keybinds:already_used_shortcut', {
      shortcut_name: t(`shortcuts:props.${existing.name}`),
    });
  }

  const composerShortcuts = keyBinds.getShortcutMap('composer');
  const playerShortcuts = keyBinds.getShortcutMap('player');
  const vsrgComposerShortcuts = keyBinds.getShortcutMap('vsrg_composer');
  const vsrgPlayerShortcuts = keyBinds.getShortcutMap('vsrg_player');

  onMount(() => {
    setPageVisited('keybinds');
    KeyboardProvider.listen(
      ({ letter, code }) => {
        if (letter === 'Escape') {
          selectedNote = null;
          selectedVsrg = { type: '', index: -1 };
          return;
        }
        if (selectedNote) {
          // A rebind attaches to the note's DEFAULT LABEL - the Shape's label for the position
          // it drew that note at (ADR-0005 §2) - which is why the armed note itself, and not
          // where it sits on screen, is all this needs.
          const existing = keyBinds.setKeyboardKeybind(selectedNote.noteNames.keyboard, code);
          if (existing !== undefined)
            logger.warn(t('keybinds:already_used_keybind', { note_name: existing.name }));
          selectedNote = null;
          return;
        }
        const { type, index } = selectedVsrg;
        if (['k4', 'k6', 'k8'].includes(type) && index !== -1) {
          const kind = Number(type.replace('k', '')) as VsrgSongKeys;
          keyBinds.setVsrgKeybind(kind, index, letter);
          selectedVsrg = { type: '', index: -1 };
        }
      },
      { id: 'keybinds' }
    );
    return () => KeyboardProvider.unregisterById('keybinds');
  });
</script>

<DefaultPage>
  <PageMetadata
    text={t('home:keybinds_or_midi_name')}
    description="Change the app keyboard keybinds and MIDI input keys"
  />
  <Column gap="1rem" style="padding-bottom:1rem">
    <Card background="none" border="secondary" gap="0.8rem">
      <Header type="h2">
        {t('keybinds:midi_keybinds')}
      </Header>
      <MidiSetup />
    </Card>
    {#if !globalConfigStore.state.IS_MOBILE}
      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('keybinds:keyboard_keybinds')}
        </Header>
        <div>
          {t('keybinds:keyboard_keybinds_description')}
        </div>
        <div class="flex-centered">
          <!-- The Shape places the instrument's notes and hands each one back (ADR-0005 §1/§3);
               `note.noteNames.keyboard` is that note's default label, resolved by the engine
               through the Shape's own assignment, so the key shown on a button is always the key
               that button's rebind writes to. -->
          <ShapeKeyboard
            shape={baseInstrument.shape}
            notes={baseInstrument.notes}
            class="keyboard"
            style="margin:1rem 0"
          >
            {#snippet button(note)}
              {@const key = keyBinds.getKeyOfShortcut('keyboard', note.noteNames.keyboard)}
              <BaseNote
                data={{ status: selectedNote === note ? 'clicked' : '' }}
                noteImage={note.icon}
                noteText={key
                  ? (KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key)
                  : '???'}
                handleClick={() => {
                  selectedNote = selectedNote === note ? null : note;
                  selectedVsrg = { type: '', index: -1 };
                }}
              />
            {/snippet}
          </ShapeKeyboard>
        </div>
      </Card>

      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('keybinds:composer_shortcuts')}
        </Header>
        <ShortcutEditor
          map={composerShortcuts}
          onChangeShortcut={(oldKey, newKey) => {
            if (oldKey === newKey) return;
            const existing = keyBinds.setShortcut('composer', oldKey, newKey);
            if (existing) logger.warn(shortcutInUseMessage(existing));
          }}
        />
        <!-- Wheel gestures listed with the shortcuts they live beside, but not through the
             editor: they are not key combos and cannot be rebound (see COMPOSER_WHEEL_SHORTCUTS). -->
        {@render fixedShortcutsTable(COMPOSER_WHEEL_SHORTCUTS)}
      </Card>

      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('keybinds:player_shortcuts')}
        </Header>
        <ShortcutEditor
          map={playerShortcuts}
          onChangeShortcut={(oldKey, newKey) => {
            if (oldKey === newKey) return;
            const existing = keyBinds.setShortcut('player', oldKey, newKey);
            if (existing) logger.warn(shortcutInUseMessage(existing));
          }}
        />
      </Card>

      <!-- One card, three h3 sections: the vsrg composer's shortcuts, the vsrg player's, and the
           lane keybinds both read, are three views of the same feature. `menu:vsrg` is the
           catalog's only standalone "VSRG" string - borrowed rather than adding a fourth key
           whose value would be that same word. -->
      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('menu:vsrg')}
        </Header>
        <Header type="h3">
          {t('keybinds:vsrg_composer_shortcuts')}
        </Header>
        <ShortcutEditor
          map={vsrgComposerShortcuts}
          onChangeShortcut={(oldKey, newKey) => {
            if (oldKey === newKey) return;
            const existing = keyBinds.setShortcut('vsrg_composer', oldKey, newKey);
            if (existing) logger.warn(shortcutInUseMessage(existing));
          }}
        />
        <Header type="h3">
          {t('keybinds:vsrg_player_shortcuts')}
        </Header>
        <ShortcutEditor
          map={vsrgPlayerShortcuts}
          onChangeShortcut={(oldKey, newKey) => {
            if (oldKey === newKey) return;
            const existing = keyBinds.setShortcut('vsrg_player', oldKey, newKey);
            if (existing) logger.warn(shortcutInUseMessage(existing));
          }}
        />
        <Header type="h3">
          {t('keybinds:vsrg_keybinds')}
        </Header>
        <div class="column" style="margin-left:1rem;gap:0.5rem">
          {@render vsrgKeyGroup('k4', keyBinds.getVsrgKeybinds(4))}
          {@render vsrgKeyGroup('k6', keyBinds.getVsrgKeybinds(6))}
        </div>
      </Card>
    {/if}
  </Column>
</DefaultPage>

{#snippet vsrgKeyGroup(type: 'k4' | 'k6', keys: string[])}
  <!-- Fixed Svelte-specific reactivity bug, flagged so it isn't reintroduced: wrapping
         keyBinds.getVsrgKeybinds(n)'s live $state-backed array in an intermediate literal (e.g. a
         local `[k4, k6]`) broke Svelte's fine-grained per-element tracking through nested
         each-blocks - the store update persisted correctly but the rendered letter stayed stale
         until a full reload. Calling getVsrgKeybinds(n) directly at each {@render} call site
         (this snippet takes the array as a plain parameter) keeps the reactive read at a tracked
         template position with nothing between it and the {#each keys as key, i (i)} that indexes
         it. One snippet + two call sites, since Svelte has no equivalent of iterating over named
         local variables the way [k4, k6].map(...) does. -->
  <Header type="h4">
    {keys.length} keys
  </Header>
  <div class="row">
    {#each keys as key, i (i)}
      <VsrgKey
        letter={key}
        isActive={selectedVsrg.type === type && selectedVsrg.index === i}
        handleClick={(willBeSelected) => {
          selectedVsrg = { type, index: willBeSelected ? i : -1 };
          selectedNote = null;
        }}
      />
    {/each}
  </div>
{/snippet}
