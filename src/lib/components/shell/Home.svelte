<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { pwaStore } from '$stores/PwaStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
  import { hasVisitedPage } from '$stores/PageVisitStore.svelte';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import { isTWA } from '$core/utils/Utilities';
  import { appPathname } from '$lib/utils/appPathname';
  import { APP_NAME } from '$core/legacyConfig';
  import { IS_BETA } from '$lib/env';
  import type { PagesVersionsKeys } from '$core/PagesVersions';
  import { game } from '$game';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import AppLink from '../AppLink.svelte';
  import AppButton from '../inputs/AppButton.svelte';
  import Row from '../layout/Row.svelte';
  import MenuButton from '../menu/MenuButton.svelte';
  import LanguageSelector from '../i18n/LanguageSelector.svelte';
  import PromotionCard from '../PromotionCard.svelte';

  // hasVisited/isTwa/breakpoint/appScale below are local $state, not on a
  // shared store: nothing else in the app reads them (AppInit.svelte owns
  // every other piece of shared init state - homeStore's canShow/visible/
  // isInPosition/hasPersistentStorage, update-check, language detection).
  let hasVisited = $state(false);
  let isTwa = $state(false);
  let breakpoint = $state(false);
  let appScale = $state(100);

  // page.url.pathname includes the SvelteKit base prefix on no-root builds
  // - appPathname() strips it before the route-literal comparisons below.
  const currentPage = $derived(appPathname(page.url.pathname));
  const homeClass = $derived(homeStore.state.isInPosition ? 'home' : 'home home-visible');
  const backgroundColor = $derived(ThemeProvider.get('background').fade(0.1).toString());
  const cardBackground = $derived(ThemeProvider.layer('primary', 0.15, 0.2).fade(0.15).toString());

  function closeWelcomeScreen() {
    localStorage.setItem(APP_NAME + '_Visited', JSON.stringify(true));
    hasVisited = true;
  }

  async function askForStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        if (await navigator.storage.persist()) {
          logger.success(t('logs:storage_persisted'), 5000);
        }
      }
    } catch (e) {
      console.error(e);
      logger.error(t('logs:storage_persisted_error'), 5000);
    }
    closeWelcomeScreen();
  }

  function setDontShowHome(override = false) {
    localStorage.setItem(APP_NAME + '_ShowHome', JSON.stringify(override));
    homeStore.setState({ canShow: override });
  }

  function handleDontShowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setDontShowHome(!homeStore.state.canShow);
  }

  async function handleSpecyClick(e: MouseEvent) {
    e.preventDefault();
    const confirmed = await asyncConfirm(t('home:about_to_leave_warning', { to: 'specy.app' }));
    if (!confirmed) return;
    window.open('https://specy.app', '_blank');
  }

  function decreaseScale() {
    const newScale = appScale - 2;
    if (newScale < 75) return;
    appScale = newScale;
  }

  function increaseScale() {
    const newScale = appScale + 2;
    if (newScale > 125) return;
    appScale = newScale;
  }

  onMount(() => {
    const storedHasVisited = localStorage.getItem(APP_NAME + '_Visited');
    hasVisited = storedHasVisited === 'true';

    const storedFontScale = JSON.parse(localStorage.getItem(APP_NAME + '-font-size') || '100');
    isTwa = isTWA();
    if (storedFontScale < 75 || storedFontScale > 125) {
      appScale = 100;
    } else {
      appScale = storedFontScale;
    }

    breakpoint = window.innerWidth > 900;
    KeyboardProvider.register(
      'Escape',
      () => {
        if (homeStore.state.visible) homeStore.close();
      },
      { id: 'home' }
    );
    return () => KeyboardProvider.unregisterById('home');
  });

  $effect(() => {
    localStorage.setItem(APP_NAME + '-font-size', `${appScale}`);
    if (appScale === 100) {
      document.documentElement.style.removeProperty('font-size');
    } else {
      document.documentElement.style.fontSize = `${appScale}%`;
    }
  });
</script>

{#snippet middleSizePage(href: string, isCurrent: boolean, label: string, icon: Snippet)}
  <AppLink
    {href}
    onclick={homeStore.close}
    class={['middle-size-page', 'row', isCurrent && 'current-page']}
  >
    {@render icon()}
    <span class="row-centered" style="font-size:1rem">{label}</span>
  </AppLink>
{/snippet}

{#snippet pageRedirect(pageKey: PagesVersionsKeys, href: string, isCurrent: boolean, label: string)}
  {@const visited = hasVisitedPage(pageKey)}
  <AppLink
    {href}
    onclick={homeStore.close}
    class={[!visited && 'non-visited', isCurrent && 'current-page']}
    style={visited ? undefined : `--new-text:"${t('common:new')}!"`}
  >
    {label}
  </AppLink>
{/snippet}

{#snippet vsrgComposerIcon()}
  <svg
    class="middle-size-page-icon"
    width="1em"
    height="1em"
    viewBox="0 0 192 177"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M71 129C71 141.15 61.1503 151 49 151C36.8497 151 27 141.15 27 129C27 116.85 36.8497 107 49 107C61.1503 107 71 116.85 71 129Z"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M16.7385 0H175.262C184.506 0 192 7.36161 192 16.4426V160.557C192 169.638 184.506 177 175.262 177H16.7385C7.49406 177 0 169.638 0 160.557V16.4426C0 7.36161 7.49407 0 16.7385 0ZM15.7538 75.9262V20.3115C15.7538 17.6406 17.958 15.4754 20.6769 15.4754H171.323C174.042 15.4754 176.246 17.6406 176.246 20.3115V75.9262C176.246 78.5971 174.042 80.7623 171.323 80.7623H20.6769C17.958 80.7623 15.7538 78.5971 15.7538 75.9262ZM171.323 96.2377H20.6769C17.958 96.2377 15.7538 98.4029 15.7538 101.074V156.689C15.7538 159.359 17.958 161.525 20.6769 161.525H171.323C174.042 161.525 176.246 159.359 176.246 156.689V101.074C176.246 98.4029 174.042 96.2377 171.323 96.2377Z"
    />
    <path
      d="M167 46.5C167 58.6503 157.15 68.5 145 68.5C132.85 68.5 123 58.6503 123 46.5C123 34.3497 132.85 24.5 145 24.5C157.15 24.5 167 34.3497 167 46.5Z"
    />
  </svg>
{/snippet}

{#snippet vsrgIcon()}
  <svg
    class="middle-size-page-icon"
    width="1em"
    height="1em"
    viewBox="0 0 222 211"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M190 176C190 191.464 177.464 204 162 204C146.536 204 134 191.464 134 176C134 160.536 146.536 148 162 148C177.464 148 190 160.536 190 176Z"
    />
    <path
      d="M32.4832 178.489C31.1118 177.118 31.1118 174.894 32.4832 173.523L63.5229 142.483C64.8943 141.112 67.1179 141.112 68.4893 142.483L99.529 173.523C100.9 174.894 100.9 177.118 99.529 178.489L68.4893 209.529C67.1179 210.9 64.8943 210.9 63.5229 209.529L32.4832 178.489Z"
    />
    <path
      d="M41 3.51175C41 1.57226 42.5723 0 44.5117 0H88.4086C90.3481 0 91.9203 1.57226 91.9203 3.51175V47.4086C91.9203 49.3481 90.3481 50.9203 88.4086 50.9203H44.5117C42.5723 50.9203 41 49.3481 41 47.4086V3.51175Z"
    />
    <path
      d="M49 36C49 34.8954 49.8954 34 51 34H81C82.1046 34 83 34.8954 83 36V162C83 163.105 82.1046 164 81 164H51C49.8954 164 49 163.105 49 162V36Z"
    />
    <path
      d="M33.551 160.54C34.0997 159.957 33.6863 159 32.8858 159H17C7.61116 159 0 166.611 0 176C0 185.389 7.61116 193 17 193H32.8858C33.6863 193 34.0997 192.043 33.551 191.46L19.6451 176.685C19.2827 176.3 19.2827 175.7 19.6451 175.315L33.551 160.54Z"
    />
    <path
      d="M98.5862 160.685C97.9856 160.047 98.4381 159 99.3144 159H128.338C129.064 159 129.508 159.796 129.127 160.414C123.226 169.967 123.226 182.033 129.127 191.586C129.508 192.204 129.064 193 128.338 193H99.3144C98.4381 193 97.9856 191.953 98.5862 191.315L112.355 176.685C112.717 176.3 112.717 175.7 112.355 175.315L98.5862 160.685Z"
    />
    <path
      d="M221.5 176C221.5 166.611 213.889 159 204.5 159H195.662C194.936 159 194.492 159.796 194.873 160.414C200.774 169.967 200.774 182.033 194.873 191.586C194.492 192.204 194.936 193 195.662 193H204.5C213.889 193 221.5 185.389 221.5 176Z"
    />
  </svg>
{/snippet}

{#snippet mdOutlinePianoIcon()}
  <svg
    class="middle-size-page-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 24 24"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path fill="none" d="M0 0h24v24H0z" /><path
      d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 11.5h.25V19h-4.5v-4.5H10c.55 0 1-.45 1-1V5h2v8.5c0 .55.45 1 1 1zM5 5h2v8.5c0 .55.45 1 1 1h.25V19H5V5zm14 14h-3.25v-4.5H16c.55 0 1-.45 1-1V5h2v14z"
    /></svg
  >
{/snippet}

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

{#snippet faDownloadIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"
    /></svg
  >
{/snippet}

{#snippet faMinusIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet faPlusIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet faCompactDiscIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 496 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zM88 256H56c0-105.9 86.1-192 192-192v32c-88.2 0-160 71.8-160 160zm160 96c-53 0-96-43-96-96s43-96 96-96 96 43 96 96-43 96-96 96zm0-128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32z"
    /></svg
  >
{/snippet}

{#snippet bsMusicPlayerFillIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 16 16"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path d="M8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2" /><path
      d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm1 2h6a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1m3 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6"
    /></svg
  >
{/snippet}

<div
  class={[homeClass, 'ignore_click_outside', 'column']}
  style="{!homeStore.state.visible
    ? 'display:none;'
    : ''}background-color:{backgroundColor};overflow-x:hidden"
>
  <MenuButton class="close-home" onclick={homeStore.close} ariaLabel={t('home:close_home_menu')}>
    {@render faTimesIcon()}
  </MenuButton>
  <div class="home-padded column">
    {#if breakpoint || !hasVisited}
      <div class="home-top">
        <div class="home-title">
          {game.meta.title}
        </div>
        <div class="home-top-text">
          {t('home:app_description', { APP_NAME })}
        </div>
      </div>
    {/if}

    {#if !hasVisited}
      <div class="home-welcome">
        <div>
          {#if !isTwa}
            <div class="home-spacing">
              {t('home:add_to_home_screen')}. <AppLink
                href="/blog/posts/add-to-home-screen"
                onclick={homeStore.close}
                style="text-decoration:underline;color:var(--accent)"
              >
                {t('home:how_to_install')}
              </AppLink>
            </div>
          {/if}
          <div class="home-spacing">
            <div class="red-text">{t('common:warning')}</div>
            : {t('home:clear_cache_warning')}
          </div>

          {#if homeStore.state.hasPersistentStorage}
            <div>
              <div class="red-text">{t('common:warning')}</div>
              : {t('home:persistent_storage_button')}
            </div>
          {/if}
          <div>
            <span style="margin-right:0.2rem">
              {t('home:privacy_policy')}
            </span>
            <AppLink
              href="/privacy"
              style="color:var(--primary-text);text-decoration:underline"
              onclick={homeStore.close}
            >
              {t('common:privacy')}
            </AppLink>
          </div>
          <div>
            {t('home:no_affiliation', { company_name: game.display.company.name })}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button
            class="home-accept-storage"
            onclick={() => {
              closeWelcomeScreen();
              askForStorage();
            }}
          >
            {t('common:confirm')}
          </button>
        </div>
      </div>
    {/if}
    {#if hasVisited}
      <PromotionCard style="margin-bottom:0.5rem" onclick={() => homeStore.close()} />
    {/if}
    <div class="home-content">
      <AppLink
        class={[
          !hasVisitedPage('composer') && 'non-visited',
          'home-content-element',
          currentPage === '/composer' && 'current-page',
        ]}
        href="/composer"
        style={hasVisitedPage('composer') ? undefined : `--new-text:"${t('common:new')}!"`}
        onclick={homeStore.close}
      >
        <div
          class="home-content-background"
          style="background-image:url('{base}/manifestData/composer.webp')"
        ></div>
        <div class="home-content-main" style="background-color:{cardBackground}">
          <div class="home-content-title">
            {@render faCompactDiscIcon()}
            {t('home:composer_name')}
          </div>
          <div class="home-content-text">
            {t('home:composer_description')}
          </div>
          <div class="home-content-open">
            <button>{t('common:open').toUpperCase()}</button>
          </div>
        </div>
      </AppLink>
      <AppLink
        class={[
          !hasVisitedPage('player') && 'non-visited',
          'home-content-element',
          (currentPage === '/' || currentPage === '/player') && 'current-page',
        ]}
        href="/"
        style={hasVisitedPage('player') ? undefined : `--new-text:"${t('common:new')}!"`}
        onclick={homeStore.close}
      >
        <div
          class="home-content-background"
          style="background-image:url('{base}/manifestData/player.webp')"
        ></div>
        <div class="home-content-main" style="background-color:{cardBackground}">
          <div class="home-content-title">
            {@render bsMusicPlayerFillIcon()}
            {t('home:player_name')}
          </div>
          <div class="home-content-text">
            {t('home:player_description')}
          </div>
          <div class="home-content-open">
            <button>{t('common:open').toUpperCase()}</button>
          </div>
        </div>
      </AppLink>
    </div>
    <div class="row space-around middle-size-pages-wrapper">
      {@render middleSizePage(
        '/vsrg-composer',
        currentPage === '/vsrg-composer',
        t('home:vsrg_composer_name'),
        vsrgComposerIcon
      )}
      {@render middleSizePage(
        '/vsrg-player',
        currentPage === '/vsrg-player',
        t('home:vsrg_player_name'),
        vsrgIcon
      )}
      {@render middleSizePage(
        '/zen-keyboard',
        currentPage === '/zen-keyboard',
        t('home:zen_keyboard_name'),
        mdOutlinePianoIcon
      )}
    </div>
    <div class="home-separator"></div>
    <div class="page-redirect-wrapper">
      {#if !isTwa}
        {@render pageRedirect('donate', '/donate', currentPage === '/donate', t('common:donate'))}
      {/if}

      {@render pageRedirect(
        'sheetVisualizer',
        '/sheet-visualizer',
        currentPage === '/sheet-visualizer',
        t('home:sheet_visualizer_name')
      )}
      {@render pageRedirect('theme', '/theme', currentPage === '/theme', t('home:themes_name'))}
      {@render pageRedirect(
        'blog',
        '/blog',
        currentPage.startsWith('/blog'),
        t('home:blog_and_guides_name')
      )}
      {@render pageRedirect(
        'keybinds',
        '/keybinds',
        currentPage === '/keybinds',
        t('home:keybinds_or_midi_name')
      )}

      {@render pageRedirect('backup', '/backup', currentPage === '/backup', t('home:backup_name'))}
      {@render pageRedirect(
        'changelog',
        '/changelog',
        currentPage === '/changelog',
        t('home:changelog_name')
      )}

      <a href="https://specy.app" target="_blank" onclick={handleSpecyClick}>
        {t('home:other_apps_name')}
      </a>
      {#if pwaStore.state.installEvent}
        <AppButton onclick={pwaStore.install} cssVar="accent">
          {@render faDownloadIcon()}
          {t('home:install_app')}
        </AppButton>
      {/if}
    </div>
  </div>

  <div class="home-bottom">
    <Row align="center" class="home-app-scaling">
      <span>
        {t('home:scale')}
      </span>
      <AppButton ariaLabel="Decrease app scale" class="flex-centered" onclick={decreaseScale}>
        {@render faMinusIcon()}
      </AppButton>
      <AppButton
        class="flex-centered"
        ariaLabel="Increase app scale"
        style="margin-right:0.5rem"
        onclick={increaseScale}
      >
        {@render faPlusIcon()}
      </AppButton>
      {appScale}%
    </Row>
    <span style="padding:0 1rem;text-align:center">
      {t('home:rights', { company_name: game.display.company.shortName })}
    </span>
    <Row gap="0.5rem">
      <div
        class="home-dont-show-again row-centered"
        onclick={() => setDontShowHome(!homeStore.state.canShow)}
        role="button"
        tabindex="0"
        onkeydown={handleDontShowKeydown}
      >
        <input
          type="checkbox"
          checked={!homeStore.state.canShow}
          readonly
          id="hide-on-open-checkbox"
        />
        <label for="hide-on-open-checkbox">
          {t('home:hide_on_open')}
        </label>
      </div>
      <LanguageSelector />
    </Row>
  </div>
  {#if IS_BETA}
    <div class="top-right-home-label">
      {t('home:beta')}
    </div>
  {/if}
</div>
