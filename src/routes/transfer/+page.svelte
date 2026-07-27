<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import Select from '$cmp/inputs/Select.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import {protocol, setupProtocol} from '$lib/protocol/appProtocol'
    import {logger} from '$stores/LoggerStore.svelte'
    import {fileService, type UnknownFileTypes} from '$core/Services/FileService'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {IS_DEV} from '$core/legacyConfig'
    import {game} from '$game'
    import {t} from '$i18n/binding.svelte'

    // game.display.transferOrigins (the dropdown list below) and appProtocol.ts's own
    // validDomains allowlist are two separate lists for two separate purposes - this page's
    // dropdown is env-independent GameDefinition data, while validDomains is a wider,
    // IS_DEV-derived list. Both are correct for their own purpose, not a duplicate to merge.
    const domains = [...game.display.transferOrigins, ...(IS_DEV ? ['http://localhost:3000'] : [])]

    let selectedDomain = $state('')
    let validDomains = $state<string[]>([])
    let error = $state<string | undefined>(undefined)
    let importedData = $state<UnknownFileTypes[] | null>(null)

    async function fetchData() {
        const frame = document.createElement('iframe')
        frame.src = selectedDomain
        frame.style.display = 'none'
        document.body.appendChild(frame)
        logger.showPill(t('transfer:connecting_please_wait'))
        try {
            await new Promise<void>((res, rej) => {
                frame.onload = () => res()
                frame.onerror = () => rej()
            })
            error = ''
            importedData = null
            await protocol.connect(frame.contentWindow!)
            console.warn('connected')
            const data = await protocol.ask('getAppData', undefined)
            importedData = Array.isArray(data) ? data : [data]
        } catch (e) {
            logger.error(t('transfer:error_connecting'))
            error = `Error fetching: ${e}`
        }
        logger.hidePill()
        frame.remove()
        // QUIRK: this cleanup closure is dead code - fetchData is a plain onClick handler, not an
        // effect, so its return value is never used or invoked. Preserved rather than dropped.
        return () => {
            logger.hidePill()
            frame.remove()
        }
    }

    onMount(() => {
        setPageVisited('transfer')
        const filtered = domains.filter(d => d !== window.location.origin)
        selectedDomain = filtered[0]
        validDomains = filtered
        setupProtocol().catch(console.error)
    })

    // UnknownFileTypes's non-theme members don't uniformly carry a `.name` field TS can prove
    // across the whole union, so a narrowly-scoped `any` escape hatch is used here instead of
    // fighting the union type.
    function importedRowName(data: UnknownFileTypes): string {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
        const anyData = data as any
        return anyData.type === 'theme' ? anyData.other?.name : anyData.name
    }
</script>

{#snippet importedRow(data: UnknownFileTypes, onImport: (data: UnknownFileTypes) => void)}
    <Row align="center" className="import-row">
        <div class="import-type">
            {data.type}
        </div>
        <Row padding="0 0.5rem">
            {importedRowName(data)}
        </Row>
        <AppButton cssVar="accent" style="margin-left:auto" onclick={() => onImport(data)}>
            {t('common:import')}
        </AppButton>
    </Row>
{/snippet}

<DefaultPage>
    <PageMetadata text="Import data" description="A tool to import the data you have in other domains" />
    <div class="column">
        <h1>{t('transfer:import_data_from_other_domains_title')}</h1>
        <p style="margin-left:1rem">
            {t('transfer:import_data_from_other_domains_description')}
        </p>
        <h2>
            {t('transfer:select_a_website_to_import_data')}
        </h2>
        <div class="row" style="gap:0.5rem;margin-left:1rem">
            <Select value={selectedDomain} style="min-width:12rem" onchange={(e) => selectedDomain = e.currentTarget.value}>
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
                                    await fileService.importAndLog(importedData!)
                                    importedData = []
                                }}
                            >
                                {t('transfer:import_all')}
                            </AppButton>
                        </Row>
                        <Column style="gap:0.3rem">
                            {#each importedData as data, i (data.id ?? i)}
                                {@render importedRow(data, async (picked) => {
                                    await fileService.importAndLog(picked)
                                    importedData = importedData!.filter(d => d !== picked)
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
</style>
