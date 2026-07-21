<script lang="ts">
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/Changelog/ChangelogRow.tsx (53 lines).
    interface ChangelogRowProps {
        version: string | number
        changes: string[]
        date: Date
    }

    let {version, date, changes: rawChanges}: ChangelogRowProps = $props()

    const v = $derived(`${version}`.replaceAll('.', '-'))
    // old: `t(\`${v}.title\`)` under `useTranslation('versions')` (a single-string namespace, so
    // the implicit default ns *is* 'versions') -> explicit colon-namespace form.
    const title = $derived(t(`versions:${v}.title`))

    // old only ever reads `_changes`' LENGTH (via `.map((_, i) => ...)`, discarding each element) -
    // the actually-displayed text comes entirely from the `versions:<v>.change-<N>` locale keys,
    // never from the `changes` prop's own string values. Preserved exactly: `rawChanges` here is
    // used purely as a counter, same as old's underscore-discarded `_`.
    const changes = $derived(rawChanges.map((_, i) => t(`versions:${v}.change-${i + 1}`)))

    // old: `useMemo(() => new Intl.DateTimeFormat(...).format(date), [date])`. A plain $derived is
    // the direct Svelte 5 equivalent of a memo keyed on one dependency.
    const localDate = $derived(new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(date))
    // old also passed `suppressHydrationWarning={true}` on the date div - a React-only escape
    // hatch for a locale-format SSR/hydration text mismatch (server locale vs browser locale can
    // legitimately differ). Svelte's hydration reconciliation has no per-element opt-out to port
    // this to; dropped as a React-specific mechanism with nothing on the other side to attach it
    // to (same class of decision as SettingsInput's dropped `el.value = ""` React-reconciliation
    // workaround).
</script>

<div>
    <div class="changelog-title">
        <div class="clt-1">{version}</div>
        <div class="clt-2">{localDate}</div>
    </div>
    <div class="changelog-list">
        <div class="cll-1">{title}</div>
        <ul>
            {#each changes as change, i (i)}
                <li>
                    <!-- old: e.split('$l').map((item, i) => i === 0 ? <div>{item}</div> : <p class="cll-new-line">{item}</p>) -
                         a custom in-string line-break marker; currently inert against the EN bundle
                         (no versions:*.change-* value contains "$l" today) but preserved so a future
                         translation using the marker still renders correctly. -->
                    {#each change.split('$l') as part, j (j)}
                        {#if j === 0}
                            <div>{part}</div>
                        {:else}
                            <p class="cll-new-line">{part}</p>
                        {/if}
                    {/each}
                </li>
            {/each}
        </ul>
    </div>
</div>

<style>
    /* Old: src/app/_client-pages/changelog/Changelog.module.css - only the 6 selectors this
       component actually references (the sibling page owns the other 2, .changelog-page-title/
       .changelog-ending - see changelog/+page.svelte's own <style>). */
    .changelog-title {
        display: flex;
        width: 100%;
        align-items: center;
        margin: 0.4rem;
        margin-left: 0;
    }

    .clt-1 {
        background-color: var(--accent);
        color: var(--accent-text);
        padding: 0.2rem;
        border-radius: 0.2rem;
        width: 5rem;
        text-align: center;
    }

    .clt-2 {
        margin-left: 1rem;
        color: var(--background-text);
    }

    .cll-1 {
        font-size: 1.5rem;
        color: var(--accent);
    }

    .changelog-list {
        margin: 0;
        margin-left: 2.5rem;
        border-left: solid 2px var(--secondary);
        padding: 1rem 2rem;
        padding-right: 1rem;
    }

    .changelog-list ul li {
        margin-top: 0.4rem;
    }

    .cll-new-line {
        margin: 0;
        margin-top: 0.2rem;
        margin-left: 1rem;
    }
</style>
