<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import {game} from '$game'
    import kofi from '$lib/assets/images/donate/kofi.png'
    import paypalme from '$lib/assets/images/donate/paypalme.png'

    // Old: src/app/_client-pages/donate/index.tsx (18 lines) + Donate.module.css (23 lines).
    //
    // next/image → plain <img> with Vite asset imports. Donate.module.css inlined.
    // i18n ns donate+home via the reactive `t`. game.id used instead of APP_NAME.toLowerCase()
    // (game.id = 'genshin' | 'sky', same as old APP_NAME.toLowerCase()).
    // setPageVisited('donate') verified in PAGES_VERSIONS (PagesVersions.ts, v0).

    onMount(() => {
        setPageVisited('donate')
    })
</script>

<DefaultPage>
    <PageMetadata
        text={t('home:donate_name')}
        description={`Help the development of ${game.id} with a donation.`}
    />
    <div class="donate-text">
        {t('donate_message')}
    </div>
    <div class="donation-wrapper">
        <a href="https://paypal.me/specyDev" target="_blank" class="paypal" rel="noreferrer">
            <img src={paypalme} alt="paypalme" loading="lazy" style="height: 3rem; width: auto;" />
        </a>
        <a href="https://ko-fi.com/specy" target="_blank" class="kofi" rel="noreferrer">
            <img src={kofi} alt="kofi" loading="lazy" style="height: 2rem; width: auto;" />
        </a>
    </div>
</DefaultPage>

<style>
    /* Old: src/app/_client-pages/donate/Donate.module.css */
    .donate-text {
        margin: 0 1rem;
        line-height: 1.3rem;
    }

    .donation-wrapper {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        width: 100%;
        justify-content: space-around;
        margin-top: 2rem;
    }

    .donation-wrapper a {
        margin-top: 0.5rem;
    }

    .paypal,
    .kofi {
        background-color: #efefef;
        padding-left: 1rem;
        height: 3rem;
        border-radius: 0.8rem;
    }

    .kofi {
        background-color: white;
        padding: 0.5rem 1rem;
    }
</style>
