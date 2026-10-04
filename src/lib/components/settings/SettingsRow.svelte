<script lang="ts">
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { hasTooltip } from '../utility/tooltip';
  import Tooltip from '../utility/Tooltip.svelte';
  import Switch from '../inputs/Switch.svelte';
  import SettingsSelect from './SettingsSelect.svelte';
  import SettingsInput from './SettingsInput.svelte';
  import SettingsSlider from './SettingsSlider.svelte';
  import InstrumentInput from './InstrumentInput.svelte';
  import { slide } from 'svelte/transition';
  import IconCircleInfo from '~icons/fa6-solid/circle-info';
  import IconTriangleExclamation from '~icons/fa6-solid/triangle-exclamation';
  import { t, tNoteNameType } from '$i18n/binding.svelte';
  import type {
    SettingInstrumentSettingsUpdate,
    SettingUpdate,
    SettingUpdateKey,
    SettingVolumeUpdate,
    SettingsNote,
    SettingsPropriety,
  } from '$core/types/SettingsPropriety';

  let {
    data,
    update,
    objKey,
    changeVolume,
    changeInstrumentSettings,
  }: {
    data: SettingsPropriety;
    update: (data: SettingUpdate) => void;
    objKey: SettingUpdateKey;
    changeVolume?: (data: SettingVolumeUpdate) => void;
    changeInstrumentSettings?: (data: SettingInstrumentSettingsUpdate) => void;
  } = $props();

  // A writable $derived: reading `currentValue` tracks `data.value`, but
  // the branches below can still locally reassign it to diverge (e.g.
  // while the user is mid-edit) until `data.value` itself changes again.
  let currentValue = $derived(data.value);
  // QUIRK: deliberately a plain one-time-read $state, NOT a $derived like
  // currentValue above - data.volume changing later must NOT overwrite an
  // in-progress local volume drag.
  // svelte-ignore state_referenced_locally
  let volume = $state(data.type === 'instrument' ? data.volume : 0);

  function handleCheckbox(value: boolean) {
    if (data.type === 'checkbox') {
      update({
        key: objKey,
        data: { ...data, value },
      });
    }
  }

  const rowBackground = $derived(theme.layer('menu_background', 0.15).toString());

  // The notes for the value as SAVED (`data.value`), not for an edit still in progress in
  // `currentValue`: a note describes what the setting does, and an edit does nothing until it is
  // committed. Widened to `unknown` because each setting type types its own notes' `when`.
  const visibleNotes = $derived(
    ((data.notes ?? []) as readonly SettingsNote<unknown>[]).filter(
      (note) => note.when === undefined || note.when === data.value
    )
  );
</script>

{#snippet label()}
  <div class={hasTooltip(data.tooltip)} style="flex:1">
    {t(`settings:props.${data.name}`)}
    {#if data.tooltip}
      <Tooltip style="width:12rem">
        {t(`settings:props.${data.tooltip}`)}
      </Tooltip>
    {/if}
  </div>
{/snippet}

<!-- Under the row, full width. Only a setting that declares notes gets the list, and each note
     slides in and out on its own as the value it belongs to comes and goes. -->
{#snippet notes()}
  {#if data.notes}
    <ul class="settings-row-notes">
      {#each visibleNotes as note (`${note.kind}:${note.text}`)}
        <li class="settings-row-note" transition:slide={{ duration: 150 }}>
          {#if note.kind === 'warning'}
            <IconTriangleExclamation
              class="settings-row-note-icon settings-row-note-icon-warning"
              aria-hidden="true"
            />
          {:else}
            <IconCircleInfo class="settings-row-note-icon" aria-hidden="true" />
          {/if}
          <span class="settings-row-note-text">{t(`settings:props.${note.text}`)}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#if data.type === 'instrument' && changeVolume}
  <!-- A block, not a row: the instrument on top, then what tunes it under a divider - the settings
       every instrument has, and below those the ones only this instrument declares. -->
  <div class="settings-row settings-row-block" style="background-color:{rowBackground}">
    <InstrumentInput
      title={label}
      {volume}
      onInstrumentPick={update}
      onSettingsPick={changeInstrumentSettings}
      onVolumeChange={(v) => (volume = v)}
      onVolumeComplete={changeVolume}
      instrument={data.value}
      {data}
      objectKey={objKey}
    />
    {@render notes()}
  </div>
{:else}
  <div class="settings-row" style="background-color:{rowBackground}">
    {@render label()}
    {#if data.type === 'select'}
      <SettingsSelect {data} onChange={update} value={data.value} objectKey={objKey}>
        <!-- Note name types are the only options with a translation, and tNoteNameType hands back
           anything else unchanged, so every select can go through it. The option's VALUE is never
           translated: it stays the stored setting value the app switches on, and only the text
           the user reads changes. -->
        {#each data.options as option (option)}
          <option value={option}>{tNoteNameType(option)}</option>
        {/each}
      </SettingsSelect>
    {/if}
    {#if data.type === 'number' || data.type === 'text'}
      <SettingsInput
        {data}
        value={currentValue as string | number}
        onChange={(v) => (currentValue = v)}
        onComplete={update}
        objectKey={objKey}
      />
    {/if}
    {#if data.type === 'checkbox'}
      <Switch checked={currentValue as boolean} onchange={handleCheckbox} />
    {/if}
    {#if data.type === 'slider'}
      <SettingsSlider objectKey={objKey} {data} value={currentValue as number} onChange={update} />
    {/if}
    {@render notes()}
  </div>
{/if}

<style>
  .settings-row {
    display: flex;
    /* lets the notes list take a line of its own under the label and the control */
    flex-wrap: wrap;
    justify-content: space-between;
    padding: 0.4rem;
    border-radius: 0.2rem;
    color: var(--menu-background-text);
    align-items: center;
    margin-bottom: 0.3rem;
  }

  .settings-row-notes {
    /* a whole line in the wrapping row, the whole width in the instrument's column block */
    width: 100%;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .settings-row-note {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding-top: 0.35rem;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  /* Muted: a note informs, the setting above it is what the row is for. The warning icon keeps
     its full colour so the two kinds still tell apart at a glance. */
  .settings-row-note-text,
  .settings-row-note :global(.settings-row-note-icon) {
    opacity: 0.75;
  }

  .settings-row-note :global(.settings-row-note-icon) {
    flex-shrink: 0;
    /* optically centred on the first text line (line-height 1.35 x 0.8rem) */
    margin-top: 0.1rem;
  }

  .settings-row-note :global(.settings-row-note-icon-warning) {
    color: var(--red);
    opacity: 1;
  }

  .settings-row div {
    display: flex;
    align-items: center;
  }

  .settings-row-block {
    flex-direction: column;
    align-items: stretch;
  }

  /* :global() because the input/select this reaches is rendered by a child
       component's own template (SettingsInput, SettingsSelect, SettingsSlider,
       InstrumentInput) - not by this component's, so scoped CSS can't cross
       that component boundary on its own. */
  .settings-row :global(:is(input, select)) {
    background-color: var(--primary);
    color: var(--primary-text);
    border: none;
    text-align: center;
    width: 8rem;
    padding: 0.2rem;
    border-radius: 0.2rem;
  }

  /* Same cross-component reason as above, for SettingsSlider/InstrumentInput's range input. */
  .settings-row :global(input[type='range']) {
    padding: 0;
    margin: 0;
  }

  /* QUIRK: `.invalid` below is unused - no current template applies that
       class near a settings row - but is kept, wrapped in :global(), so
       svelte-check's unused-selector check doesn't flag it. Not dead code
       to prune. */
  .settings-row :global(.invalid) {
    background-color: var(--red) !important;
  }
</style>
