<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$i18n/binding.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';

  let {
    data,
    functions,
  }: {
    data: {
      isToolsVisible: boolean;
      hasCopiedColumns: boolean;
      selectedColumns: number[];
      layer: number;
      //only its LENGTH is read here (the undo button's enabled state); what an entry holds is
      //Composer.svelte's business (ComposerHistoryEntry — a compound snapshot since ADR-0007)
      undoHistory: readonly unknown[];
    };
    functions: {
      toggleTools: () => void;
      copyColumns: (layer: number | 'all') => void;
      eraseColumns: (layer: number | 'all') => void;
      moveNotesBy: (amount: number, layer: number | 'all') => void;
      pasteColumns: (insert: boolean, layer: number | 'all') => void;
      deleteColumns: () => void;
      resetSelection: () => void;
      undo: () => void;
    };
  } = $props();

  type SelectionType = 'layer' | 'all';

  let selectionType: SelectionType = $state('all');

  const selectedTarget = $derived(selectionType === 'all' ? ('all' as const) : data.layer);
</script>

{#snippet toolButton(
  opts: {
    disabled: boolean;
    onClick: () => void;
    active?: boolean;
    style?: string;
    tooltip?: string;
    tooltipPosition?: 'top' | 'bottom';
    area?: string;
  },
  content: Snippet
)}
  <button
    disabled={opts.disabled}
    onclick={opts.onClick}
    class={[
      'flex-centered',
      'tools-button',
      opts.active && 'tools-button-highlighted',
      hasTooltip(opts.tooltip),
    ]}
    style="grid-area:{opts.area ?? ''};{opts.style ?? ''}"
  >
    {@render content()}
    {#if opts.tooltip}
      <Tooltip position={opts.tooltipPosition ?? 'top'}>
        {opts.tooltip}
      </Tooltip>
    {/if}
  </button>
{/snippet}

{#snippet copyContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M320 448v40c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V120c0-13.255 10.745-24 24-24h72v296c0 30.879 25.121 56 56 56h168zm0-344V0H152c-13.255 0-24 10.745-24 24v368c0 13.255 10.745 24 24 24h272c13.255 0 24-10.745 24-24V128H344c-13.2 0-24-10.8-24-24zm120.971-31.029L375.029 7.029A24 24 0 0 0 358.059 0H352v96h96v-6.059a24 24 0 0 0-7.029-16.97z"
    /></svg
  >
  {t('common:copy')}
{/snippet}

{#snippet pasteContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M497.941 273.941c18.745-18.745 18.745-49.137 0-67.882l-160-160c-18.745-18.745-49.136-18.746-67.883 0l-256 256c-18.745 18.745-18.745 49.137 0 67.882l96 96A48.004 48.004 0 0 0 144 480h356c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12H355.883l142.058-142.059zm-302.627-62.627l137.373 137.373L265.373 416H150.628l-80-80 124.686-124.686z"
    /></svg
  >
  {selectionType === 'all'
    ? t('composer:tools.paste_all_layers')
    : t('composer:tools.paste_in_layer_n', { layer_number: data.layer + 1 })}
{/snippet}

{#snippet insertContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    viewBox="0 0 24 24"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style="stroke-width:3px"
  >
    <path d="M14 12l-10 0" />
    <path d="M14 12l-4 4" />
    <path d="M14 12l-4 -4" />
    <path d="M20 4l0 16" />
  </svg>
  {selectionType === 'all'
    ? t('composer:tools.insert_all_layers')
    : t('composer:tools.insert_in_layer_n', { layer_number: data.layer + 1 })}
{/snippet}

{#snippet eraseContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M128 184c0-30.879 25.122-56 56-56h136V56c0-13.255-10.745-24-24-24h-80.61C204.306 12.89 183.637 0 160 0s-44.306 12.89-55.39 32H24C10.745 32 0 42.745 0 56v336c0 13.255 10.745 24 24 24h104V184zm32-144c13.255 0 24 10.745 24 24s-10.745 24-24 24-24-10.745-24-24 10.745-24 24-24zm184 248h104v200c0 13.255-10.745 24-24 24H184c-13.255 0-24-10.745-24-24V184c0-13.255 10.745-24 24-24h136v104c0 13.2 10.8 24 24 24zm104-38.059V256h-96v-96h6.059a24 24 0 0 1 16.97 7.029l65.941 65.941a24.002 24.002 0 0 1 7.03 16.971z"
    /></svg
  >
  {t('common:erase')}
{/snippet}

{#snippet deleteContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style="color:var(--red)"
    ><path
      d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
    /></svg
  >
  {t('common:delete')}
{/snippet}

{#snippet moveUpContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M177 159.7l136 136c9.4 9.4 9.4 24.6 0 33.9l-22.6 22.6c-9.4 9.4-24.6 9.4-33.9 0L160 255.9l-96.4 96.4c-9.4 9.4-24.6 9.4-33.9 0L7 329.7c-9.4-9.4-9.4-24.6 0-33.9l136-136c9.4-9.5 24.6-9.5 34-.1z"
    /></svg
  >
  {t('composer:tools.move_notes_up')}
{/snippet}

{#snippet moveDownContent()}
  <svg
    class="tools-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M143 352.3L7 216.3c-9.4-9.4-9.4-24.6 0-33.9l22.6-22.6c9.4-9.4 24.6-9.4 33.9 0l96.4 96.4 96.4-96.4c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9l-136 136c-9.2 9.4-24.4 9.4-33.8 0z"
    /></svg
  >
  {t('composer:tools.move_notes_down')}
{/snippet}

<!-- QUIRK: this repeats the "floating-tools" token when the tools are visible — old built the same duplicate and browsers dedupe it, so keep it rather than tidying the expression. -->
<DecoratedCard
  class="floating-tools {data.isToolsVisible ? 'floating-tools tools-visible' : ''}"
  size="1.2rem"
  isRelative={false}
  offset="0.1rem"
>
  <div class="floating-tools-content">
    <div class="tools-buttons-grid">
      {@render toolButton(
        {
          disabled: data.hasCopiedColumns,
          onClick: () => functions.copyColumns(selectedTarget),
          active: data.hasCopiedColumns,
          tooltip: t('composer:tools.copy_notes'),
          style: 'flex-direction:column;justify-content:center',
          tooltipPosition: 'bottom',
          area: 'a',
        },
        copyContent
      )}
      {@render toolButton(
        {
          disabled: !data.hasCopiedColumns,
          onClick: () => functions.pasteColumns(false, selectedTarget),
          tooltip: t('composer:tools.paste_copied_notes'),
          tooltipPosition: 'bottom',
          area: 'b',
        },
        pasteContent
      )}
      {@render toolButton(
        {
          disabled: !data.hasCopiedColumns,
          onClick: () => functions.pasteColumns(true, selectedTarget),
          tooltip: t('composer:tools.insert_copied_notes'),
          area: 'c',
        },
        insertContent
      )}
      {@render toolButton(
        {
          disabled: data.hasCopiedColumns,
          onClick: () => functions.eraseColumns(selectedTarget),
          tooltip: t('composer:tools.erase_all_selected_notes'),
          area: 'd',
        },
        eraseContent
      )}
      {@render toolButton(
        {
          disabled: data.hasCopiedColumns || selectedTarget !== 'all',
          onClick: functions.deleteColumns,
          tooltip: t('composer:tools.delete_selected_columns'),
          area: 'f',
        },
        deleteContent
      )}
      {@render toolButton(
        {
          disabled: data.hasCopiedColumns,
          tooltip: t('composer:tools.move_notes_up_description'),
          area: 'e',
          onClick: () => functions.moveNotesBy(1, selectedTarget),
        },
        moveUpContent
      )}
      {@render toolButton(
        {
          disabled: data.hasCopiedColumns,
          tooltip: t('composer:tools.move_notes_down_description'),
          onClick: () => functions.moveNotesBy(-1, selectedTarget),
          area: 'g',
        },
        moveDownContent
      )}
    </div>
    <div class="tools-right column">
      <AppButton
        style="margin-bottom:0.2rem"
        class={hasTooltip(true)}
        toggled={selectionType === 'all'}
        onclick={() => (selectionType = 'all')}
      >
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 24 24"
          style="margin-right:0.2rem"
          height="16"
          width="16"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2zM7 17h10V7H7v10zm2-8h6v6H9V9z"
          /></svg
        >
        {t('composer:tools.all_layers')}

        <Tooltip style="left:0">
          {t('composer:tools.all_layers_description')}
        </Tooltip>
      </AppButton>
      <AppButton
        style="margin-bottom:0.2rem"
        class={hasTooltip(true)}
        toggled={selectionType === 'layer'}
        onclick={() => (selectionType = 'layer')}
      >
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 24 24"
          style="margin-right:0.2rem"
          height="16"
          width="16"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            d="M23 15h-2v2h2v-2zm0-4h-2v2h2v-2zm0 8h-2v2c1 0 2-1 2-2zM15 3h-2v2h2V3zm8 4h-2v2h2V7zm-2-4v2h2c0-1-1-2-2-2zM3 21h8v-6H1v4c0 1.1.9 2 2 2zM3 7H1v2h2V7zm12 12h-2v2h2v-2zm4-16h-2v2h2V3zm0 16h-2v2h2v-2zM3 3C2 3 1 4 1 5h2V3zm0 8H1v2h2v-2zm8-8H9v2h2V3zM7 3H5v2h2V3z"
          /></svg
        >
        {t('composer:tools.only_layer')}
        <span style="min-width:0.6rem;margin-left:0.2rem">
          {data.layer + 1}
        </span>
        <Tooltip style="left:0">
          {t('composer:tools.select_layer_description')}
        </Tooltip>
      </AppButton>
      <AppButton
        style="margin-bottom:0.2rem;justify-content:center"
        onclick={functions.resetSelection}
        disabled={data.selectedColumns.length <= 1 && !data.hasCopiedColumns}
        toggled={data.hasCopiedColumns}
      >
        {t('composer:tools.clear_selection')}
      </AppButton>
      <div class="row" style="flex:1;align-items:flex-end">
        <AppButton
          style="flex:1;justify-content:center"
          disabled={data.undoHistory.length === 0}
          onclick={functions.undo}
        >
          {t('common:undo')}
        </AppButton>
        <AppButton
          onclick={functions.toggleTools}
          style="margin-left:0.2rem;flex:1;justify-content:center"
        >
          {t('common:ok')}
        </AppButton>
      </div>
    </div>
  </div>
</DecoratedCard>
