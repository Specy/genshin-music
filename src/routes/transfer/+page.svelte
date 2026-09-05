<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import Select from '$cmp/inputs/Select.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import { protocol, setupProtocol } from '$lib/protocol/appProtocol';
  import { logger } from '$stores/LoggerStore.svelte';
  import { fileService, type UnknownFileTypes } from '$core/Services/FileService';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { IS_DEV } from '$core/legacyConfig';
  import { game } from '$game';
  import { t } from '$i18n/binding.svelte';

  // game.display.transferOrigins (the dropdown list below) and appProtocol.ts's own
  // validDomains allowlist are two separate lists for two separate purposes - this page's
  // dropdown is env-independent GameDefinition data, while validDomains is a wider,
  // IS_DEV-derived list. Both are correct for their own purpose, not a duplicate to merge.
  const domains = [...game.display.transferOrigins, ...(IS_DEV ? ['http://localhost:3000'] : [])];

  let selectedDomain = $state('');
  let validDomains = $state<string[]>([]);
  let error = $state<string | undefined>(undefined);
  let importedData = $state<UnknownFileTypes[] | null>(null);

  async function fetchData() {
    const frame = document.createElement('iframe');
    frame.src = selectedDomain;
    frame.style.display = 'none';
    document.body.appendChild(frame);
    logger.showPill(t('transfer:connecting_please_wait'), { spinner: true });
    try {
      await new Promise<void>((res, rej) => {
        frame.onload = () => res();
        frame.onerror = () => rej();
      });
      error = '';
      importedData = null;
      await protocol.connect(frame.contentWindow!);
      console.warn('connected');
      const data = await protocol.ask('getAppData', undefined);
      importedData = Array.isArray(data) ? data : [data];
    } catch (e) {
      logger.error(t('transfer:error_connecting'));
      error = `Error fetching: ${e}`;
    }
    logger.hidePill();
    frame.remove();
    // QUIRK: this cleanup closure is dead code - fetchData is a plain onClick handler, not an
    // effect, so its return value is never used or invoked. Preserved rather than dropped.
    return () => {
      logger.hidePill();
      frame.remove();
    };
  }

  onMount(() => {
    setPageVisited('transfer');
    const filtered = domains.filter((d) => d !== window.location.origin);
    selectedDomain = filtered[0];
    validDomains = filtered;
    setupProtocol().catch(console.error);
  });

  // UnknownFileTypes's non-theme members don't uniformly carry a `.name` field TS can prove
  // across the whole union, so a narrowly-scoped `any` escape hatch is used here instead of
  // fighting the union type.
  function importedRowName(data: UnknownFileTypes): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    const anyData = data as any;
    return anyData.type === 'theme' ? anyData.other?.name : anyData.name;
  }
</script>

{#snippet importedRow(data: UnknownFileTypes, onImport: (data: UnknownFileTypes) => void)}
  <Row align="center" class="import-row">
    <div class="import-type">
      {data.type}
    </div>
    <Row padding="0 0.5rem" class="import-row-name">
      {importedRowName(data)}
    </Row>
    <AppButton cssVar="accent" class="import-row-button" onclick={() => onImport(data)}>
      {t('common:import')}
    </AppButton>
  </Row>
{/snippet}

<DefaultPage>
  <PageMetadata
    text="Import data"
    description="A tool to import the data you have in other domains"
  />
  <div class="column">
    <h1>{t('transfer:import_data_from_other_domains_title')}</h1>
    <p class="transfer-description">
      {t('transfer:import_data_from_other_domains_description')}
    </p>
    <h2>
      {t('transfer:select_a_website_to_import_data')}
    </h2>
    <div class="row transfer-connect">
      <Select
        value={selectedDomain}
        style="min-width:12rem"
        onchange={(e) => (selectedDomain = e.currentTarget.value)}
      >
        {#each validDomains as d (d)}
          <option value={d}>{d.replace(/https?:\/\//g, '')}</option>
        {/each}
      </Select>
      <AppButton cssVar="accent" onclick={fetchData}>
        {t('common:connect')}
      </AppButton>
    </div>

    {#if importedData}
      {#if importedData.length === 0}
        <h2>{t('transfer:no_data_to_import')}</h2>
      {/if}
      {#if importedData.length > 0}
        {#if error}
          <h2>{t('common:error')}:</h2>
          <p>{error}</p>
        {:else}
          <Column>
            <Row align="center" style="gap:1rem">
              <h2>{t('transfer:data')}</h2>
              <AppButton
                cssVar="accent"
                onclick={async () => {
                  await fileService.importAndLog(importedData!);
                  importedData = [];
                }}
              >
                {t('transfer:import_all')}
              </AppButton>
            </Row>
            <Column style="gap:0.3rem">
              {#each importedData as data, i (data.id ?? i)}
                {@render importedRow(data, async (picked) => {
                  await fileService.importAndLog(picked);
                  importedData = importedData!.filter((d) => d !== picked);
                })}
              {/each}
            </Column>
          </Column>
        {/if}
      {/if}
    {/if}
  </div>
</DefaultPage>

<style>
  /* :global() because "import-row" is handed to Row's class prop and lands on Row's OWN root
       element, which carries that component's scoping hash, not this page's. */
  :global(.import-row) {
    background-color: var(--primary);
    color: var(--primary-text);
    flex: 1;
    border-radius: 0.4rem;
    padding: 0.6rem;
  }

  .import-type {
    min-width: 6rem;
    border-right: solid 0.1rem var(--primary-text);
    padding: 0 0.4rem;
  }

  /* Both were inline `margin-left:1rem` (plus the row's `gap`) until the portrait query below
     needed to take that indent back - an inline declaration outranks any stylesheet rule short
     of !important. Same values, just moved here. */
  .transfer-description {
    margin-left: 1rem;
  }

  .transfer-connect {
    gap: 0.5rem;
    margin-left: 1rem;
  }

  /* Same reason for the button: it carried `style="margin-left:auto"`. */
  :global(.import-row-button) {
    margin-left: auto;
  }

  /* PORTRAIT ONLY - the landscape layout above is untouched.
     Two things break on a ~360px line. The 1rem indents are a luxury a phone column can't
     afford, and the import row's three flex children (fixed 6rem type + name + button) squeeze
     the name down to a four-line sliver. The row becomes a two-line grid instead: type and name
     share the top line, the Import button takes the full width underneath as one wide target.

     :global() is unavoidable for the two row children - "import-row-name"/"import-row-button"
     are handed to Row's and AppButton's class props and land on THOSE components' root
     elements, carrying their scoping hash and not this file's (same story as `.import-row`
     above). The unique class names are what keep the rules from leaking off this page. */
  @media (orientation: portrait) {
    .transfer-description,
    .transfer-connect {
      margin-left: 0;
    }

    /* the domain names are long; let the select take the line and the button drop below it
       rather than either one shrinking below its label */
    .transfer-connect {
      flex-wrap: wrap;
    }

    .transfer-connect :global(.select) {
      flex: 1;
    }

    :global(.import-row) {
      display: grid;
      /* minmax(0, ...) rather than a bare 1fr: a track's automatic minimum is min-content, so
         one long unbreakable file name would otherwise push the row past the screen edge. */
      grid-template-columns: auto minmax(0, 1fr);
      row-gap: 0.5rem;
    }

    :global(.import-row-name) {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    :global(.import-row-button) {
      grid-column: 1 / -1;
      margin-left: 0;
      justify-content: center;
      min-height: 2.75rem;
    }
  }
</style>
