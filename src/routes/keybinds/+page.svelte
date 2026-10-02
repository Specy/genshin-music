<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import PageHeading from '$cmp/shell/PageHeading.svelte';
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

<!-- `keybinds-page` is a scoping handle, not a style: it rides DefaultPage's own class prop onto
     the page root so the :global() overrides at the bottom of this file (classes that live in
     App.css, or on elements child components write) can be confined to this page's subtree
     instead of leaking to every page that uses the same class. -->
<DefaultPage class="keybinds-page">
  <PageMetadata
    text={t('home:keybinds_or_midi_name')}
    description="Change the app keyboard keybinds and MIDI input keys"
  />
  <PageHeading text={t('home:keybinds_or_midi_name')} />
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
            class="keyboard keybinds-keyboard"
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
             editor: they are not key combos and cannot be rebound (see COMPOSER_WHEEL_SHORTCUTS).
             The wrapper is `display:contents` outside portrait (see the style block) so it is not
             a box at all there and the table stays the card's own flex child, exactly as before;
             in portrait it becomes the table's own scroll container. -->
        <div class="table-scroller">
          {@render fixedShortcutsTable(COMPOSER_WHEEL_SHORTCUTS)}
        </div>
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
  <div class="row vsrg-key-row">
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

<style>
  /* Outside portrait this element must not exist as far as layout is concerned: the table it
     wraps was a direct flex child of its Card, and `display:contents` keeps it one. */
  .table-scroller {
    display: contents;
  }

  /* PORTRAIT. Nothing on this page is side-by-side by nature - it is a stack of cards holding
     label/control pairs - so adapting it is mostly a matter of letting each of those pairs use
     the full ~330px a phone gives instead of a width that was picked for a desktop window.
     Landscape (and every window wider than it is tall) is untouched by design. */
  @media (orientation: portrait) {
    /* Where the wrapper turns into a real box: if the table ever does outgrow the card (a long
       key combo in some locale), it scrolls here rather than widening the page. */
    .table-scroller {
      display: block;
      max-width: 100%;
      overflow-x: auto;
    }

    /* The wheel-gesture table's key badge is a fixed 10rem in App.css, which left its
       description column ~150px and four lines tall. Sized to its content it gives that space
       back; nowrap because a flex row shrank the badge until the combo itself wrapped instead.
       The badge keeps App.css's own min-width, so short keys stay aligned. */
    :global(.keybinds-page .keyboard-key) {
      width: auto;
      white-space: nowrap;
    }

    /* Same reasoning as MidiSetup's own note grid: `.note` is sized in vw, so it gets SMALLER
       as the viewport narrows - backwards for a touch target. The grid is repeat(columns, 1fr),
       so giving it the card's width is enough for the cells to divide it evenly whatever the
       Shape's column count is, and the note is addressed as the hitbox's only child rather than
       by the game-config-supplied class name it carries. The 26rem ceiling is for the wide kind
       of portrait viewport (rotated monitor, portrait tablet), where filling the card would blow
       each button up to something absurd. */
    :global(.keyboard.keybinds-keyboard) {
      width: min(100%, 26rem);
    }

    :global(.keybinds-keyboard .button-hitbox-bigger) {
      width: 100%;
    }

    :global(.keybinds-keyboard .button-hitbox-bigger > div) {
      width: 100%;
      height: auto;
      aspect-ratio: 1;
    }

    /* Six 3.5rem circles do not fit across a phone, and a flex row's default shrink squashed
       them into ellipses rather than overflowing. They wrap instead, at full size. */
    .vsrg-key-row {
      flex-wrap: wrap;
    }

    .vsrg-key-row :global(.vsrg-player-key-circle) {
      flex-shrink: 0;
    }
  }
</style>
