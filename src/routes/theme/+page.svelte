<script lang="ts">
  import { onMount } from 'svelte';
  import cloneDeep from 'lodash.clonedeep';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Card from '$cmp/layout/Card.svelte';
  import Header from '$cmp/header/Header.svelte';
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import Player from '$cmp/pages/Player/Player.svelte';
  import Composer from '$cmp/pages/Composer/Composer.svelte';
  import ThemePropriety from '$cmp/pages/theme/ThemePropriety.svelte';
  import ThemeInput from '$cmp/pages/theme/ThemeInput.svelte';
  import ThemePreview from '$cmp/pages/theme/ThemePreview.svelte';
  import {
    BaseTheme,
    ThemeProvider as theme,
    defaultThemes,
    type SerializedTheme,
    type ThemeKeys,
  } from '$core/theme/ThemeProvider.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { themeStore } from '$stores/ThemeStore.svelte';
  import { fileService } from '$core/Services/FileService';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';

  onMount(() => {
    setPageVisited('theme');
  });

  let selectedProp = $state<ThemeKeys | ''>('');
  let selectedPagePreview = $state<'player' | 'composer'>('player');

  async function handleChange(name: ThemeKeys, value: string) {
    if (!theme.isEditable()) {
      if (value === theme.get(name).toString()) return;
      const themeName = await asyncPrompt(
        'Creating a new theme from this default theme, write the name:'
      );
      if (themeName === null) return;
      await cloneTheme(themeName);
    }
    theme.set(name, value);
    await theme.save();
  }

  async function handlePropReset(key: ThemeKeys) {
    theme.reset(key);
    await theme.save();
  }

  async function handleImport(files: FileElement<SerializedTheme>[]) {
    for (const file of files) {
      const importedTheme = file.data;
      try {
        await fileService.importAndLog(importedTheme);
      } catch (e) {
        logImportError(e);
      }
    }
  }

  function logImportError(error?: unknown) {
    if (error) console.error(error);
    logger.error(t('theme:error_importing_theme'), 4000);
  }

  async function cloneTheme(name: string) {
    const newTheme = new BaseTheme(name);
    newTheme.state = cloneDeep(theme.state);
    newTheme.state.other.name = name;
    newTheme.state.editable = true;
    await addNewTheme(newTheme);
  }

  async function handleNewThemeClick() {
    const name = await asyncPrompt(t('theme:choose_theme_name'));
    if (name !== null && name !== undefined) {
      const newTheme = new BaseTheme(name);
      await addNewTheme(newTheme);
    }
  }

  async function addNewTheme(newTheme: BaseTheme) {
    const serialized = newTheme.serialize();
    const id = await themeStore.addTheme(serialized);
    serialized.id = id;
    theme.loadFromJson(serialized, id);
    theme.save();
    return id;
  }

  async function handleThemeDelete(savedTheme: SerializedTheme) {
    if (
      await asyncConfirm(t('theme:confirm_delete_theme', { theme_name: savedTheme.other.name }))
    ) {
      if (theme.getId() === savedTheme.id) {
        theme.wipe();
      }
      await themeStore.removeThemeById(savedTheme.id!);
    }
  }

  function loadSavedTheme(savedTheme: SerializedTheme) {
    theme.loadFromTheme(savedTheme);
    theme.save();
  }
</script>

<DefaultPage>
  <PageMetadata
    text={t('home:themes_name')}
    description="Change the theme of the app, set all colors and backgrounds, make elements translucent and share/import themes"
  />
  <Column gap="1rem" style="padding-bottom:1rem">
    <div>
      <Header type="h2">
        {t('theme:default_themes')}
      </Header>
      <div class="theme-preview-wrapper">
        {#each defaultThemes as savedTheme (savedTheme.id)}
          <ThemePreview
            theme={savedTheme}
            current={savedTheme.id === theme.getId()}
            onClick={loadSavedTheme}
          />
        {/each}
      </div>
    </div>

    <!-- One card for both: the saved themes and the color keys act on the SAME selected theme,
         so they share an outline. The import picker rides the header row because an import lands
         in the saved themes right below it. -->
    <Card background="none" border="secondary" gap="0.8rem">
      <Row justify="between" align="center" gap="1rem" style="flex-wrap:wrap">
        <Header type="h2">
          {t('theme:your_themes')}
        </Header>
        <FilePicker onPick={handleImport} as="json" onError={logImportError}>
          <AppButton>
            {t('theme:import_theme')}
          </AppButton>
        </FilePicker>
      </Row>
      <div class="theme-preview-wrapper" style="margin-top:0">
        {#each themeStore.themes as savedTheme (savedTheme.id)}
          <ThemePreview
            onDelete={handleThemeDelete}
            current={savedTheme.id === theme.getId()}
            theme={savedTheme}
            downloadable={true}
            onClick={loadSavedTheme}
          />
        {/each}
        <button class="new-theme" onclick={handleNewThemeClick}>
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 448 512"
            height="30"
            width="30"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"
            /></svg
          >
          {t('theme:new_theme')}
        </button>
      </div>
      <!-- h3 under the card's own h2: the color keys are a section INSIDE "Your Themes", not a
           sibling card. -->
      <Header type="h3" margin="0.4rem 0 0 0">
        {t('theme:edit_colors')}
      </Header>
      <div>
        {theme.getOther('name')}
      </div>
      {#each theme.toArray() as prop (prop.name)}
        <ThemePropriety
          name={prop.name}
          value={prop.value}
          isSelected={selectedProp === prop.name}
          canReset={theme.isEditable()}
          isModified={!theme.isDefault(prop.name)}
          onChange={handleChange}
          setSelectedProp={(name) => (selectedProp = name)}
          {handlePropReset}
        />
      {/each}
      <ThemeInput
        name={t('theme:theme_prop.background_image')}
        value={theme.getOther('backgroundImageMain')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setBackground(e, 'Main')}
      />
      <ThemeInput
        name={t('theme:theme_prop.composer_background_image')}
        value={theme.getOther('backgroundImageComposer')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setBackground(e, 'Composer')}
      />
      <ThemeInput
        name={t('theme:theme_prop.theme_name')}
        value={theme.getOther('name')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setOther('name', e)}
        onLeave={() => theme.save()}
      />
      <div style="text-align:center">
        <span style="color:var(--red)">{t('common:warning')}</span>: {t(
          'theme:opaque_performance_warning'
        )}
      </div>
    </Card>

    <div>
      <Header type="h2">
        {t('theme:preview')}
      </Header>
      <div class="theme-app-preview">
        <AppButton
          class="box-shadow"
          toggled={true}
          style="position:absolute;right:0;top:0;z-index:90"
          onclick={() =>
            (selectedPagePreview = selectedPagePreview === 'composer' ? 'player' : 'composer')}
        >
          {selectedPagePreview === 'composer' ? t('theme:view_player') : t('theme:view_composer')}
        </AppButton>
        {#if selectedPagePreview === 'player'}
          <AppBackground page="Main">
            <Player inPreview />
          </AppBackground>
        {:else}
          <AppBackground page="Composer">
            <Composer inPreview />
          </AppBackground>
        {/if}
      </div>
    </div>
  </Column>
  <!-- QUIRK (load-bearing, read before restructuring this page): must stay at the bottom, after
         both preview branches. Svelte compiles a <title> inside <svelte:head> to a plain
         document.title assignment in that component's own mount effect, so when several
         PageMetadata instances mount together, the LAST one to run wins - this trailing instance
         being last is what makes "Themes" the final title on a fresh load.
         That alone isn't enough once toggling `selectedPagePreview` is possible: neither preview
         branch is a stub, so each one has its OWN PageMetadata too. Swapping the {#if} branch
         re-runs the newly-mounted branch's title effect, but this trailing PageMetadata is
         already mounted with an unchanged `text` prop, so its own effect never re-runs - the tab
         title stays stuck on whatever the branch just switched to. {#key selectedPagePreview}
         below forces this PageMetadata to unmount+remount (re-running its title effect) on every
         toggle, strictly after the branch swap in template order, restoring "Themes". -->
  {#key selectedPagePreview}
    <PageMetadata
      text={t('home:themes_name')}
      description="Change the app theme, set the different colors, backgrounds, opacity and customisations"
    />
  {/key}
</DefaultPage>

<style>
  /* PORTRAIT. The page is already a single scrolling column, so nothing here has to be
     un-stacked - what breaks on a phone is density. Both fixes live in this scoped block rather
     than in Theme.css because that file is loaded globally and its `.color-picker-*` rules are
     shared with the Settings pane's picker; a scoped rule on markup this file owns also outranks
     the global one on specificity alone, so source order between the two files stops mattering. */
  @media (orientation: portrait) {
    /* Four cards across 361px leaves ~80px each and every name ellipses down to "Rai. . .".
       auto-fill rather than a hard `repeat(2, ...)` so a portrait TABLET, which is wide enough
       for three or four, still fills its row instead of showing two enormous tiles. */
    .theme-preview-wrapper {
      grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    }

    /* Theme.css's phone tier sizes this box at `100vh - 3rem`, which in portrait is taller than
       the screen minus the shell's bottom bar: the box's own bottom edge - and the mini-app's
       menu, which `inPreview` parks at the bottom of it - end up underneath that bar. Reserving
       the bar plus the "Preview" heading brings the whole preview into one screen, and the cap
       keeps a tall tablet from turning it into a page of its own. svh, not vh, so a mobile
       browser's collapsing toolbar cannot push the bottom edge back under the bar. */
    .theme-app-preview {
      height: min(calc(100svh - var(--menu-size) - 6rem), 40rem);
    }
  }
</style>
