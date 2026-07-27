<script lang="ts">
    import type {Snippet} from 'svelte'
    import MenuSidebar from '../menu/MenuSidebar.svelte'
    import MenuButton from '../menu/MenuButton.svelte'
    import {browserHistoryStore} from '$stores/BrowserHistoryStore'
    import {homeStore} from '$stores/HomeStore.svelte'
    import {asyncConfirm} from '$stores/AsyncPromptStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // `window.history.back()` below needs no leave-guard code of its own: the
    // root layout's `beforeNavigate` handler already intercepts this button's
    // popstate like any other in-app navigation (same as AppLink.svelte).
    let {children, className = '', style = ''}: {
        children?: Snippet
        className?: string
        style?: string
    } = $props()

    async function handleDiscordClick(e: MouseEvent) {
        e.preventDefault()
        const confirmed = await asyncConfirm(t('home:about_to_leave_warning', {to: 'discord'}))
        if (!confirmed) return
        window.open('https://discord.gg/Arsf65YYHq', '_blank')
    }
</script>

{#snippet faArrowLeftIcon()}
    <svg
        class="icon"
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 448 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z"/></svg>
{/snippet}

{#snippet faDiscordIcon()}
    <svg
        class="icon"
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 640 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6,447.848,447.848,0,0,0-134.426,0,309.541,309.541,0,0,0-15.135-30.6,1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588,321.173,321.173,0,0,1-45.868-21.853,1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126,301.407,301.407,0,0,1-45.89,21.83,1.875,1.875,0,0,0-1,2.611,391.055,391.055,0,0,0,30.014,48.815,1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z"/></svg>
{/snippet}

{#snippet faHomeIcon()}
    <svg
        class="icon"
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 576 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"/></svg>
{/snippet}

<MenuSidebar {className} {style} menuStyle="justify-content:flex-end">
    {#if browserHistoryStore.hasNavigated}
        <MenuButton
            style="margin-bottom:auto"
            onclick={() => window.history.back()}
            ariaLabel={t('menu:go_back')}
        >
            {@render faArrowLeftIcon()}
        </MenuButton>
    {/if}
    {@render children?.()}
    <a
        href="https://discord.gg/Arsf65YYHq"
        target="_blank"
        rel="noreferrer"
        title="Discord"
        onclick={handleDiscordClick}
    >
        <MenuButton ariaLabel="Discord">
            {@render faDiscordIcon()}
        </MenuButton>
    </a>
    <MenuButton
        onclick={homeStore.open}
        ariaLabel={t('menu:open_home_menu')}
        style="border:solid 0.1rem var(--secondary)"
    >
        {@render faHomeIcon()}
    </MenuButton>
</MenuSidebar>
