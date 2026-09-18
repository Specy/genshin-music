<script lang="ts">
  // THE RUNNING MODE, AS ONE CONTROL (CONTEXT.md: Section) - the player's counterpart of the
  // composer's view selector, and the same shape: a domain question turned into MultipleOptionSlider
  // options. It is a PICKER OF THE CURRENT RUN'S MODE and never a way to start one, which is why the
  // host renders it only while a run exists and why the three options are the three modes a run can
  // be in - `stop` is not among them.
  //
  // ICONS AND NOT LABELS, deliberately: the three names are long enough in every locale to make a
  // labelled pill wider than the column it stands in, and the same three glyphs already name these
  // modes on every row of the song menu (PlayerSongRow), so the pairing is one the user has already
  // been taught. Each option's name survives as its tooltip and its accessible name.
  import MultipleOptionSlider, { type Option } from '$cmp/MultipleOptionSlider.svelte';
  import { t } from '$i18n/binding.svelte';
  import IconMusic from '~icons/fa6-solid/music';
  import IconCrosshairs from '~icons/fa6-solid/crosshairs';
  import IconCircle from '~icons/fa6-regular/circle';

  type PlayerMode = 'play' | 'practice' | 'approaching';

  let {
    selected,
    onSelect,
  }: {
    selected: PlayerMode;
    /** Every press is handed over, INCLUDING the mode already running - the host decides it is a no-op. */
    onSelect: (mode: PlayerMode) => void;
  } = $props();
</script>

<!-- The options are built HERE rather than in the script because that is where the icon snippets
     are in scope; the array is a literal per render, which the slider's keyed each and its
     `option.value` lookups are indifferent to. -->
{#snippet playIcon()}
  <IconMusic />
{/snippet}

{#snippet practiceIcon()}
  <IconCrosshairs />
{/snippet}

{#snippet approachIcon()}
  <IconCircle />
{/snippet}

<div class="player-mode-selector">
  <MultipleOptionSlider
    {selected}
    style="width:100%"
    onChange={onSelect}
    options={[
      {
        value: 'play',
        text: t('menu:play_song'),
        color: 'var(--accent)',
        icon: playIcon,
      },
      {
        value: 'practice',
        text: t('player:practice_mode'),
        color: 'var(--accent)',
        icon: practiceIcon,
      },
      {
        value: 'approaching',
        text: t('player:approach_mode'),
        color: 'var(--accent)',
        icon: approachIcon,
        //THE LAST OPTION OF A PILL PARKED AT THE WINDOW'S RIGHT EDGE: a tooltip opening below it is
        //centred on the button and runs off the page, taking the document's width with it. This one
        //opens inward instead. The first two have the rest of the row to their right and do not.
        tooltipPosition: 'left',
      },
    ] satisfies Option<PlayerMode>[]}
  />
</div>

<style>
  /* The slider sizes itself `height: 100%`, so its height is this row's to state - 2rem, the height
     of the icon buttons the rest of the controls column is built from. */
  .player-mode-selector {
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    height: 2rem;
    min-height: 2rem;
    flex-shrink: 0;
  }
</style>
