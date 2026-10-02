<script lang="ts" generics="K extends string, V extends Shortcut<string>">
  import { cn } from '$core/utils/Utilities';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Row from '$cmp/layout/Row.svelte';
  import { createKeyComboComposer, type Shortcut } from '$stores/KeybindsStore.svelte';
  import { t } from '$i18n/binding.svelte';

  let {
    mapKey,
    value,
    selected,
    setSelected,
    onChangeShortcut,
  }: {
    mapKey: K;
    value: V;
    selected: boolean;
    setSelected: (key: K) => void;
    onChangeShortcut: (key: K, shortcut: V) => void;
  } = $props();

  // newKey is a writable $derived.by: it normally mirrors mapKey, but the void selected read
  // forces it to also reset whenever selected changes (discarding any in-progress, unconfirmed
  // key-combo edit when this row is deselected). The effect below can still assign newKey
  // directly while the user types a new combo; that override is itself discarded next time
  // mapKey/selected change.
  let newKey: K = $derived.by(() => {
    void selected;
    return mapKey;
  });

  $effect(() => {
    if (!selected) return;
    // QUIRK: value here is the whole Shortcut object, not value.name, so this interpolates to
    // the literal "shortcut_[object Object]" for every row instead of a per-row-unique id
    // (almost certainly meant value.name). Harmless: only one row is ever selected at a time,
    // so at most one listener is registered under this id. Flagged, not fixed.
    return createKeyComboComposer(`shortcut_${value}`, ({ keyCombo }) => {
      newKey = keyCombo.join('+') as K;
    });
  });
</script>

{#snippet faCheckIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"
    /></svg
  >
{/snippet}

<div
  class={cn(
    'row shortcut-element',
    [selected, 'shortcut-element-selected'],
    hasTooltip(value.description)
  )}
>
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
    <AppButton class="shortcut-button" onclick={() => setSelected(mapKey)}>
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

  /* PORTRAIT: 50vw of a phone is ~200px, which the shrink-to-fit width above then turns into a
     ragged column of rows each as wide as its own label happened to be, with the key button
     landing in a different place on every line. One full-width row per shortcut instead - the
     label reads on the left, every key button lines up on the right edge, and long labels wrap
     inside the row rather than widening it. Must stay AFTER the max-width block above, which it
     overrides at equal specificity. */
  @media (orientation: portrait) {
    .shortcut-element {
      width: 100%;
      min-width: 0;
    }
  }

  /* SMALLEST PHONES ONLY. The label half is a <Row>, i.e. a nested flex box, so its min-content
     floor is the label AND the "(Holdable)" chip side by side, and it refuses to shrink below
     that. Under ~353px that floor plus the widest key badge stops fitting the line and the badge
     is pushed clean out of the row's rounded background - by 35px at 320px, where it also takes
     2px past the right edge of the document and gives the whole page a sideways scroll (worst
     rows: "Previous/Next breakpoint" with ArrowLeft/ArrowRight). Letting the label wrap fixes it,
     but wrapping also RE-BREAKS labels at widths where they already fit, so this is capped to the
     sub-360px tier rather than applied to all of portrait: 360px and up keeps exactly the line
     breaks the rest of this page was laid out around (verified pixel-identical at 360, 393 and
     852). :global is required because Row writes the .row class onto markup of its own. */
  @media (orientation: portrait) and (max-width: 359px) {
    .shortcut-element > :global(.row:first-child) {
      min-width: 0;
      flex-wrap: wrap;
    }
  }

  .shortcut-element-selected {
    outline: solid 0.1rem var(--accent);
  }

  /* QUIRK: :global() below is REQUIRED, not a scoping violation to "fix". This class is threaded
       through AppButton's class prop and lands on a <button> that AppButton.svelte's own
       template writes - a plain scoped selector here could never reach it. Same reasoning as
       MidiShortcut.svelte's own comment. */
  :global(.shortcut-button) {
    background-color: var(--secondary);
    color: var(--secondary-text);
  }
</style>
