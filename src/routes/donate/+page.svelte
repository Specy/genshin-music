<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import { game } from '$game';
  import kofi from '$lib/assets/images/donate/kofi.png';
  import paypalme from '$lib/assets/images/donate/paypalme.png';
  import Header from '$cmp/header/Header.svelte';

  onMount(() => {
    setPageVisited('donate');
  });
</script>

<DefaultPage>
  <PageMetadata
    text={t('home:donate_name')}
    description={`Help the development of ${game.id} with a donation.`}
  />
  <Header style="margin-bottom: 1rem;">
      {t('common:donate')}
  </Header>
  <div class="donate-text">
    {t('donate:donate_message')}
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

  /* PORTRAIT: the row above puts the two badges at opposite ends of a ~360px line, each a
     narrow island with a gulf of empty page between them. Stacked full-width cards read as a
     deliberate pair of buttons instead, and hand the thumb the whole width of the screen.
     The text loses its own 1rem side margin too - the page wrapper already insets it that
     much in portrait, and doubling it squeezed the paragraph to ~329px of measure. */
  @media (orientation: portrait) {
    .donate-text {
      margin: 0;
    }

    .donation-wrapper {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .donation-wrapper a {
      margin-top: 0;
    }

    .paypal,
    .kofi {
      display: flex;
      align-items: center;
      justify-content: center;
      /* height gives way to the padding: the badge images keep their own inline heights
         (3rem / 2rem) and the card grows around them to one consistent size. */
      height: auto;
      min-height: 4rem;
      padding: 0.5rem 1rem;
    }
  }
</style>
