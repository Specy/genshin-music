<script lang="ts">
  // THE HOME SCREEN'S CONTENT, rendered by two wrappers: HomePage.svelte (the live one, mounted by
  // routes/+page.svelte at '/') and Home.svelte (the old floating popup, kept mounted in the root
  // layout but dormant - nothing opens it any more). Everything that differs between the two is a
  // prop below; there is no runtime flag anywhere.
  //
  // WHAT CHANGED: '/' used to be a second copy of the player page and the home screen was an
  // overlay that auto-opened on load. Now '/' IS the home screen, the player lives only at
  // '/player', and no auto-open exists.
  //
  // TO REVERT TO THE POPUP:
  //   1. AppInit.svelte - restore the auto-open block (its own comment holds the removed code's
  //      shape: seed homeStore.canShow/visible from APP_NAME + '_ShowHome', skipping /blog).
  //   2. The menus - PlayerMenu, ComposerMenu, VsrgComposerMenu, VsrgPlayerMenu, ZenKeyboardMenu,
  //      SheetVisualizerMenu and SimpleMenu each render a home MenuButton; swap its
  //      `onclick={() => goto(resolve('/'))}` back for `onclick={homeStore.open}` (and drop the
  //      goto/resolve imports where nothing else in the file uses them).
  //   3. routes/+page.svelte - restore the byte-for-byte copy of routes/player/+page.svelte
  //      (setPageVisited('player') included), and point the player card below back at '/'.
  //   4. HomePage.svelte becomes unused and can be deleted; Home.svelte is already complete.
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { pwaStore } from '$stores/PwaStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
  import { hasVisitedPage } from '$stores/PageVisitStore.svelte';
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
  import LanguageSelector from '../i18n/LanguageSelector.svelte';
  import PromotionCard from '../PromotionCard.svelte';

  let {
    // Popup only: every link closes the overlay it floats over. The page variant leaves this
    // undefined - its links are plain navigations with nothing to dismiss.
    onNavigate,
    // Popup only: it floats over some OTHER page, so marking which one is useful. The page
    // variant IS the target of none of these links' siblings and always sits at '/', so it
    // highlights nothing.
    highlightCurrentPage = false,
    // The popup drops the title block on small screens to buy vertical room over the page it
    // covers; the page variant owns the whole viewport and the title is its identity.
    alwaysShowTitle = false,
    // Rendered in the bottom bar beside the language selector. The popup puts its
    // "hide on open" checkbox here - that setting only means anything to the popup.
    bottomControls,
  }: {
    onNavigate?: () => void;
    highlightCurrentPage?: boolean;
    alwaysShowTitle?: boolean;
    bottomControls?: Snippet;
  } = $props();

  // hasVisited/isTwa/breakpoint/appScale below are local $state, not on a
  // shared store: nothing else in the app reads them (AppInit.svelte owns
  // every other piece of shared init state - homeStore's hasPersistentStorage,
  // update-check, language detection).
  // DEFAULTS TO VISITED, i.e. to the returning user. This value is only truthful once onMount has
  // read localStorage, so whatever it starts as is what the prerendered HTML and the first paint
  // commit to. Two blocks below swing on it in opposite directions - the welcome card
  // ({#if !hasVisited}) and the PromotionCard ({#if hasVisited}) - so starting at false shipped
  // every load a tall welcome card that then vanished and a promotion card that then appeared,
  // shoving the card grid twice. Measured on the dev server: CLS 0.074 before, 0.0005 after.
  //
  // Guessing wrong now costs a first-time visitor one shift, once, on the only load where they
  // have never seen the app anyway. Guessing wrong the other way cost every returning user a
  // shift on every load.
  let hasVisited = $state(true);
  let isTwa = $state(false);
  let breakpoint = $state(false);
  let appScale = $state(100);

  // page.url.pathname includes the SvelteKit base prefix on no-root builds
  // - appPathname() strips it before the route-literal comparisons below.
  // Empty when highlighting is off, so no route literal below can match.
  const currentPage = $derived(highlightCurrentPage ? appPathname(page.url.pathname) : '');
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

    breakpoint = window.innerWidth > 1000;
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
    onclick={onNavigate}
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
    onclick={onNavigate}
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

<div class="home-padded column">
  {#if alwaysShowTitle || breakpoint || !hasVisited}
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
              onclick={onNavigate}
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

        <!-- hasPersistentStorage is still seeded by AppInit.svelte - it is a browser-capability
             probe, not part of the auto-open wiring that block lost. -->
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
            onclick={onNavigate}
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
    <PromotionCard style="margin-bottom:0.5rem" onclick={onNavigate} />
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
      onclick={onNavigate}
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
    <!-- '/player', not '/': the root is this home screen now, the player has exactly one route. -->
    <AppLink
      class={[
        !hasVisitedPage('player') && 'non-visited',
        'home-content-element',
        currentPage === '/player' && 'current-page',
      ]}
      href="/player"
      style={hasVisitedPage('player') ? undefined : `--new-text:"${t('common:new')}!"`}
      onclick={onNavigate}
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
    {@render pageRedirect(
      'blog',
      '/blog',
      currentPage.startsWith('/blog'),
      t('home:blog_and_guides_name')
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
  <span class="home-rights">
    {t('home:rights', { company_name: game.display.company.shortName })}
  </span>
  <Row gap="0.5rem">
    {@render bottomControls?.()}
    <LanguageSelector />
  </Row>
</div>
{#if IS_BETA}
  <div class="top-right-home-label">
    {t('home:beta')}
  </div>
{/if}

<style>
  /* Was an inline style on this span; it needs a class of its own so the page variant can let it
     take a row of its own when the bottom bar wraps in portrait (see HomePage.svelte). The rest of
     the home CSS follows below - it used to live in the global App.css ("Home overlay" block). */
  .home-rights {
    padding: 0 1rem;
    text-align: center;
  }

  /* ==================================================================================
     THE HOME SCREEN'S OWN CSS. Old: src/components/pages/Index/Home.css, which the SvelteKit port
     parked in the global App.css ("Home overlay" block) and the App.css break-up brought here.
     Ported verbatim MINUS lines 41-157 of the old file (the `.logger-*`/`.pill*` block) - that
     block was already relocated into App.css during P3 Task 6, ahead of that port, for
     Logger.svelte's own needs. The old file's own @media block is merged into the single mobile
     query at the end of this style block instead of duplicated per rule.

     WHY SOME HALVES ARE `:global(...)`: everything this component writes in its OWN markup is
     scoped normally. The `:global` halves are the classes that land on a CHILD component's
     element - AppLink's <a> (`.home-content-element`, `.current-page`, `.non-visited`), Row's
     <div> (`.home-app-scaling`) and AppButton's <button>. Svelte never puts this component's
     scoping hash on a child component's markup, and it does NOT warn about it either: a plain
     selector there compiles to a hash-scoped rule that silently matches nothing. Each `:global`
     below is written to keep the ORIGINAL specificity, so nothing it used to lose to starts
     losing to it.

     `.middle-size-page` and `.middle-size-page:hover` deliberately stayed in App.css - see the
     note next to them there.
     ================================================================================== */
  .home-padded {
    padding: 0.6rem;
    max-width: 48rem;
    margin: 0 auto;
  }

  .home-spacing {
    margin-bottom: 0.3rem;
  }

  .home-bottom {
    width: 100%;
    padding: 0.4rem;
    color: var(--background-text);
    padding-top: 0rem;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .home-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
    gap: 1rem;
    justify-items: center;
    width: 100%;
  }

  :global(.home-content-element) {
    width: 100%;
    min-height: 10rem;
    color: var(--primary-text);
    border-radius: 0.5rem;
    position: relative;
    transition: all 0.15s ease-out;

    cursor: pointer;
  }

  :global(.home-content-element:hover) {
    transform: scale(1.02);
    filter: brightness(1.1);
  }

  .home-welcome {
    font-size: 0.9rem;
    background-color: var(--primary-darken-10);
    padding: 0.5rem;
    border-radius: 0.5rem;
    margin: 0.8rem;
    outline: 2px dashed var(--secondary);
    outline-offset: 2px;
  }

  .home-accept-storage {
    border: none;
    padding: 0.4rem 1rem;
    border-radius: 0.2rem;
    background-color: limegreen;
    color: white;
    margin-top: 0.5rem;
    cursor: pointer;
  }

  .home-content-main {
    padding: 0.5rem;
    display: flex;
    position: absolute;
    flex-direction: column;
    align-items: center;
    border-radius: 0.5rem;
    background-color: var(--primary);
    color: var(--primary-text);
    width: 100%;
    height: 100%;
    transition: all 0.2s ease-out;
  }

  :global(.home-content-element:active) {
    transform: scale(0.97);
    transition: all 0.1s ease-out;
  }

  /* BOTH HALVES GLOBAL, not `:global(.home-content-element) > .home-content-main`: the direct
     parent of `.home-content-main` in this file's markup is the <AppLink> COMPONENT, and Svelte
     cannot follow a child combinator across that boundary - it prunes the rule as unused. */
  :global(.home-content-element > .home-content-main) {
    background-color: rgba(53, 58, 70, 0.9);
  }

  .home-content-background {
    position: absolute;
    height: 100%;
    border-radius: 0.5rem;
    width: 100%;
    background-size: cover;
    overflow: hidden;
  }

  .home-content-title {
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: solid 1px var(--secondary);
    width: 94%;
    padding-bottom: 0.3rem;
    font-size: 1.2rem;
  }

  .home-content-title svg {
    margin-right: 0.5rem;
  }

  .home-content-text {
    font-size: 0.8rem;
    margin-top: 0.25rem;
    padding: 0.25rem;
    text-align: center;
    line-height: 1rem;
  }

  .home-content-open {
    display: flex;
    justify-content: center;
    margin-top: auto;
  }

  /* Was one rule with `.home-dont-show-again *`; that half moved to Home.svelte, which owns the
     hide-on-open button, and this half stayed with the Row it sits on here. */
  :global(.home-app-scaling *) {
    white-space: nowrap;
  }

  .top-right-home-label {
    background-color: var(--accent);
    color: var(--accent-text);
    display: flex;
    justify-content: center;
    align-items: flex-end;
    position: fixed;
    top: 0;
    z-index: 2;
    padding: 0rem 3rem;
    height: 4rem;
    font-size: 1.5rem;
    right: 0;
    /*kinda hacky way to make this but eh */
    transform: rotate(45deg) translate(20%, -70%);
  }

  :global(.home-app-scaling button) {
    margin-left: 0.2rem;
    min-width: unset;
    padding: 0rem;
    width: 1.5rem;
    font-size: 0.6rem;
    font-weight: bold;
    height: 1.5rem;
  }

  .page-redirect-wrapper {
    margin-top: 0.8rem;
    display: flex;
    flex-wrap: wrap;
    width: 100%;
  }

  .page-redirect-wrapper :global(a),
  .page-redirect-wrapper :global(button) {
    background-color: var(--primary);
    margin: 0.2rem;
    color: var(--primary-text);
    border-radius: 0.5rem;
    border: none;
    padding: 0.4rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.1s linear;
  }

  /* Pointer-only (see App.css's `.app-button:hover`), and this one had to be guarded HERE: Svelte
     scopes the wrapper half of the selector, so it lands at (0,3,1) and out-specifies the (0,2,0)
     `.app-button:hover` guarded upstream - the Install button in the markup above is an AppButton,
     so the upstream guard never reached it. Two controls in this wrapper survive their own tap and would
     have kept the brightness afterwards: Install stays mounted when the native prompt is DISMISSED
     (PwaStore.install only clears `installEvent` on `accepted`), and the specy.app link
     preventDefaults itself to raise a confirm instead of navigating. The rest are AppLinks that
     navigate away and unmount, which is why only those two ever showed it. */
  @media (hover: hover) {
    .page-redirect-wrapper :global(a:hover),
    .page-redirect-wrapper :global(button:hover) {
      filter: brightness(1.1);
    }
  }

  .middle-size-pages-wrapper {
    margin-top: 1rem;
    gap: 1rem;
  }

  .middle-size-page-icon {
    color: var(--primary-text);
    font-size: 1.6rem;
  }

  :global(.current-page) {
    /* Could be added */
    outline: var(--accent) solid 2px;
    filter: none;
  }

  .home-content-open button {
    padding: 0.4rem 1.5rem;
    background-color: var(--accent);
    color: var(--accent-text);
    border-radius: 0.5rem;
    font-size: 0.8rem;
    border: none;
    cursor: pointer;
  }

  .home-top {
    text-align: center;
    margin-bottom: 1rem;
  }

  /* THE TITLE BLOCK IS THE FIRST THING TO GO ON A SHORT SCREEN. It is pure identity - the app's name
     and its one-line description - while everything under it is navigation, so on a window too short
     to hold both (a phone held in landscape is ~390px tall) the cards win. Height, not width or
     orientation: the same 2.5rem of title is the problem on a short landscape phone and on a desktop
     window dragged flat, and neither of the other two axes tells those apart. HomeContent renders
     this block whenever the page variant asks for it (`alwaysShowTitle`), so the room has to be
     bought back here. */
  @media (max-height: 460px) {
    .home-top {
      display: none;
    }
  }

  .home-title {
    font-size: 2rem;
  }

  .home-top-text {
    font-size: 0.8rem;
    color: #b0ada8;
  }

  .home-separator {
    border-top: 1px solid var(--secondary);
    margin-top: 1rem;
    font-size: 1.1rem;
    width: 100%;
  }

  /* pageVisit "new" badge. Old: src/components/shared/PageVisit/pageVisit.module.scss. Consumed
     by this file's nav cards via hasVisitedPage() (PageVisitStore.svelte.ts, ported ahead of
     this task - see that file's own comment deferring this exact badge CSS/markup to Task 8). */
  :global(.non-visited) {
    position: relative;
  }

  :global(.non-visited)::after {
    content: var(--new-text);
    position: absolute;
    top: 0;
    transform: rotate(45deg) translate(20%, -80%);
    right: 0;
    background-color: var(--accent);
    color: var(--accent-text);
    font-size: 0.7rem;
    z-index: 4;
    border-radius: 0.2rem;
    padding: 0.1rem 0.3rem;
  }

  /* Home.css's own mobile block. It has to stay AFTER every base rule above and BEFORE the
     portrait block below - that is the order it had in App.css, and `.home-content`'s `gap` is
     set by both, so a portrait phone narrower than 920px depends on the portrait one landing
     last. `.home-dont-show-again` shared the font-size rule here; that half is gone, because
     Home.svelte's own scoped `.home-dont-show-again` already out-specifies it. */
  @media only screen and (max-width: 920px) {
    .home-padded {
      padding: 0.6rem 0.6rem 0.2rem 3.6rem;
    }

    :global(.home-app-scaling) {
      font-size: 0.8rem;
    }

    .home-separator {
      margin-top: 0.6rem;
    }

    :global(.home-content-element) {
      min-height: 8.5rem;
    }

    .home-content-title {
      font-size: 1.1rem;
    }

    .page-redirect-wrapper {
      margin-top: 0.4rem;
    }

    .middle-size-pages-wrapper {
      margin-top: 0.8rem;
      gap: 0.8rem;
    }

    .home-content {
      gap: 0.8rem;
    }

    .home-top {
      margin: 1rem 0;
    }

    .home-bottom {
      font-size: 0.6rem;
    }

    .page-redirect-wrapper :global(a),
    .page-redirect-wrapper :global(button) {
      padding: 0.4rem 0.7rem;
    }
  }

  /* The orientation half of the old rotate-screen media block in App.css - only the two home
     rules came along, `.rotate-screen` itself is still there. */
  @media screen and (orientation: portrait) {
    .home-content,
    .middle-size-pages-wrapper {
      gap: 0.5rem;
    }
    .middle-size-pages-wrapper {
      margin-top: 0.5rem;
    }
  }
</style>
