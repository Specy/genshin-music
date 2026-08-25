<script lang="ts">
  // DORMANT. This is the home screen's old wrapper: a full-screen overlay that AppInit auto-opened
  // on load and every page menu's home button re-opened. Home is a real page now
  // (routes/+page.svelte -> HomePage.svelte) and nothing calls homeStore.open() any more, so this
  // component still mounts in the root layout but never becomes visible. It is kept whole, and
  // still compiling, so the popup can be brought back without rewriting it - HomeContent.svelte's
  // header holds the step-by-step revert.
  import { onMount } from 'svelte';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import { APP_NAME } from '$core/legacyConfig';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import MenuButton from '../menu/MenuButton.svelte';
  import HomeContent from './HomeContent.svelte';

  const homeClass = $derived(homeStore.state.isInPosition ? 'home' : 'home home-visible');
  const backgroundColor = $derived(ThemeProvider.get('background').fade(0.1).toString());

  function setDontShowHome(override = false) {
    localStorage.setItem(APP_NAME + '_ShowHome', JSON.stringify(override));
    homeStore.setState({ canShow: override });
  }

  onMount(() => {
    KeyboardProvider.register(
      'Escape',
      () => {
        if (homeStore.state.visible) homeStore.close();
      },
      { id: 'home' }
    );
    return () => KeyboardProvider.unregisterById('home');
  });
</script>

{#snippet faTimesIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="25"
    width="25"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

{#snippet faCheckIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="0.7em"
    width="0.7em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"
    /></svg
  >
{/snippet}

{#snippet hideOnOpenToggle()}
  <button
    class="home-dont-show-again row-centered"
    onclick={() => setDontShowHome(!homeStore.state.canShow)}
  >
    <span
      class={[
        'home-dont-show-again-box',
        !homeStore.state.canShow && 'home-dont-show-again-box-checked',
      ]}
    >
      {#if !homeStore.state.canShow}
        {@render faCheckIcon()}
      {/if}
    </span>
    <span>
      {t('home:hide_on_open')}
    </span>
  </button>
{/snippet}

<div
  class={[homeClass, 'ignore_click_outside', 'column']}
  style="{!homeStore.state.visible
    ? 'display:none;'
    : ''}background-color:{backgroundColor};overflow-x:hidden"
>
  <!-- Gated, unlike the rest of this file, which the display:none above already hides: HomeContent
       is shared with the page variant and owns real side effects (the app-scale $effect, the
       first-visit localStorage read). A hidden second copy of it would run them alongside the one
       on '/'. `visible` stays true for the whole 150ms close animation, so nothing disappears
       mid-transition. -->
  {#if homeStore.state.visible}
    <MenuButton class="close-home" onclick={homeStore.close} ariaLabel={t('home:close_home_menu')}>
      {@render faTimesIcon()}
    </MenuButton>
    <HomeContent
      onNavigate={homeStore.close}
      highlightCurrentPage
      bottomControls={hideOnOpenToggle}
    />
  {/if}
</div>

<style>
  /* The hide-on-open control is a real <button> whose leading square only
     *looks* like a checkbox (a readonly <input type="checkbox"> read as
     interactive but wasn't). The surface itself stays a plain subtle button
     matching the LanguageSelector sitting next to it - only the square goes
     accent. It lives here rather than in HomeContent because the setting it
     writes (auto-open on load) only ever meant anything to this popup. The
     overlay's own CSS follows below; the shared home CONTENT's CSS lives in
     HomeContent.svelte, which owns the markup it styles. */
  .home-dont-show-again {
    gap: 0.4rem;
    padding: 0.5rem;
    border: none;
    border-radius: 0.4rem;
    background-color: var(--primary);
    color: var(--primary-text);
    /* buttons don't inherit typography from .home-bottom on their own */
    font-family: inherit;
    cursor: pointer;
    font-size: 0.7rem;
    transition: filter 0.1s linear;
  }

  .home-dont-show-again:hover {
    filter: brightness(1.1);
  }

  .home-dont-show-again-box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
    /* unchecked: an empty outline, dimmed so it reads as "off" */
    border: solid 2px currentColor;
    opacity: 0.6;
  }

  .home-dont-show-again-box-checked {
    background-color: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    opacity: 1;
  }

  /* ==================================================================================
     THE OVERLAY SHELL ITSELF. Old: src/components/pages/Index/Home.css, by way of App.css's
     "Home overlay" block; the rest of that block styled the shared content and moved to
     HomeContent.svelte instead. `.home`/`.home-visible` reach the root <div> below through the
     `homeClass` string, which Svelte cannot read statically - it does not prune them for exactly
     that reason, and the scoping hash IS on that div, so they stay plain selectors.
     `delayBackdrop` is Utility.scss's keyframe and stays global; `home-appear` is only ever named
     by these two rules, so it comes along scoped.
     ================================================================================== */
  .home {
    height: 100%;
    justify-content: space-between;
    overflow-y: auto;
    position: fixed;
    width: 100%;
    background-color: var(--background);
    color: var(--background-text);
    z-index: 100;
    transition: all 0.2s ease-out;
    animation: 0.15s home-appear ease-out;
    opacity: 0;
    transform: scale(0.98);
    will-change: opacity, transform, backdrop-filter;
  }

  .home-visible {
    opacity: 1;
    --backdrop-amount: 4px;
    animation:
      forwards delayBackdrop calc(0.2s * 1.2),
      0.15s home-appear ease-out;
    transform: scale(1);
  }

  @keyframes home-appear {
    0% {
      opacity: 0.5;
      backdrop-filter: none;
      transform: scale(0.98);
    }
    100% {
      opacity: 1;
      backdrop-filter: none;
      transform: scale(1);
    }
  }

  /* GLOBAL, and it has to be: this class is handed to MenuButton, which renders
     `<button class={['menu-item', cls]}>` in ITS file, so the button never carries this
     component's scoping hash. Bare `:global(...)` rather than `.home :global(.close-home)` so the
     one-class specificity is exactly what App.css had - `.menu-item` sets the same
     `border-radius` and `cursor` values on the same button, and a tie there must stay a tie. */
  :global(.close-home) {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  /* Was one rule with `.home-app-scaling *` in App.css; that half went to HomeContent.svelte with
     the Row it sits on. The two <span>s inside the button are this file's own markup. */
  .home-dont-show-again * {
    white-space: nowrap;
  }

  /* Home.css's own mobile block, the `.close-home` half of it. The rest went to
     HomeContent.svelte's copy of the same query. */
  @media only screen and (max-width: 920px) {
    :global(.close-home) {
      left: 0.4rem;
    }
  }
</style>
