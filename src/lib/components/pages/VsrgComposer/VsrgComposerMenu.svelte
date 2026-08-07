<script lang="ts">
  import { homeStore } from '$stores/HomeStore.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { clickOutside } from '$lib/utils/clickOutside';
  import type { RecordedSong } from '$core/Songs/RecordedSong';
  import type { SerializedSong, SongType } from '$core/Songs/Song.svelte';
  import type {
    VsrgSong,
    VsrgTrackModifier,
    VsrgTrackModifierPatch,
  } from '$core/Songs/VsrgSong.svelte';
  import type { VsrgComposerSettingsDataType } from '$core/BaseSettings';
  import type { SettingUpdate } from '$core/types/SettingsPropriety';
  import { t } from '$i18n/binding.svelte';
  import MenuSidebar from '$cmp/menu/MenuSidebar.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import MenuItem from '$cmp/menu/MenuItem.svelte';
  import MenuPanel from '$cmp/menu/MenuPanel.svelte';
  import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte';
  import SongMenu from '$cmp/SongMenu.svelte';
  import VsrgComposerSongRow from './VsrgComposerSongRow.svelte';
  import VsrgComposerAudioSongRow from './VsrgComposerAudioSongRow.svelte';
  import TrackModifier from './TrackModifier.svelte';
  import VsrgComposerHelp from './VsrgComposerHelp.svelte';
  import SettingsPane from '$cmp/settings/SettingsPane.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import SongActionButton from '$cmp/inputs/SongActionButton.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import Separator from '$cmp/Separator.svelte';
  import AppLink from '$cmp/AppLink.svelte';

  let {
    data,
    functions,
  }: {
    data: {
      settings: VsrgComposerSettingsDataType;
      hasChanges: boolean;
      audioSong: RecordedSong | null;
      trackModifiers: VsrgTrackModifier[];
    };
    functions: {
      setAudioSong: (song: SerializedSong | null) => void;
      handleSettingChange: (data: SettingUpdate) => void;
      onSave: () => void;
      onSongOpen: (song: VsrgSong) => void;
      onCreateSong: () => void;
      onTrackModifierChange: (
        index: number,
        patch: VsrgTrackModifierPatch,
        recalculate: boolean
      ) => void;
    };
  } = $props();

  const excludedSongsForSongsList: SongType[] = ['composed', 'recorded'];
  const excludedSongsForAudioPicker: SongType[] = ['vsrg'];

  let isOpen = $state(false);
  let isVisible = $state(false);
  let selectedMenu = $state('Settings');
  let wrapperEl: HTMLDivElement | undefined = $state();

  // QUIRK: no isMobile() branch here (unlike ComposerMenu.svelte's click-outside callback) - a
  // real difference from old, not an inconsistency to unify.
  $effect(() => {
    if (!wrapperEl) return;
    const action = clickOutside(wrapperEl, {
      active: isOpen && isVisible,
      ignoreFocusable: true,
      onOutside: () => {
        isVisible = false;
      },
    });
    return () => action.destroy?.();
  });
</script>

{#snippet faBarsIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M16 132h416c8.837 0 16-7.163 16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16z"
    /></svg
  >
{/snippet}

{#snippet faTimesIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

{#snippet faTimesIconBare()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

{#snippet faSaveIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM224 416c-35.346 0-64-28.654-64-64 0-35.346 28.654-64 64-64s64 28.654 64 64c0 35.346-28.654 64-64 64zm96-304.52V212c0 6.627-5.373 12-12 12H76c-6.627 0-12-5.373-12-12V108c0-6.627 5.373-12 12-12h228.52c3.183 0 6.235 1.264 8.485 3.515l3.48 3.48A11.996 11.996 0 0 1 320 111.48z"
    /></svg
  >
{/snippet}

{#snippet faQuestionIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 384 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M202.021 0C122.202 0 70.503 32.703 29.914 91.026c-7.363 10.58-5.093 25.086 5.178 32.874l43.138 32.709c10.373 7.865 25.132 6.026 33.253-4.148 25.049-31.381 43.63-49.449 82.757-49.449 30.764 0 68.816 19.799 68.816 49.631 0 22.552-18.617 34.134-48.993 51.164-35.423 19.86-82.299 44.576-82.299 106.405V320c0 13.255 10.745 24 24 24h72.471c13.255 0 24-10.745 24-24v-5.773c0-42.86 125.268-44.645 125.268-160.627C377.504 66.256 286.902 0 202.021 0zM192 373.459c-38.196 0-69.271 31.075-69.271 69.271 0 38.195 31.075 69.27 69.271 69.27s69.271-31.075 69.271-69.271-31.075-69.27-69.271-69.27z"
    /></svg
  >
{/snippet}

{#snippet faMusicIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M470.38 1.51L150.41 96A32 32 0 0 0 128 126.51v261.41A139 139 0 0 0 96 384c-53 0-96 28.66-96 64s43 64 96 64 96-28.66 96-64V214.32l256-75v184.61a138.4 138.4 0 0 0-32-3.93c-53 0-96 28.66-96 64s43 64 96 64 96-28.65 96-64V32a32 32 0 0 0-41.62-30.49z"
    /></svg
  >
{/snippet}

{#snippet faCogIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
    /></svg
  >
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
    ><path
      d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"
    /></svg
  >
{/snippet}

<MenuSidebar
  bind:wrapperEl
  current={selectedMenu}
  setCurrent={(c) => (selectedMenu = c)}
  open={isOpen}
  setOpen={(o) => (isOpen = o)}
  visible={isVisible}
  setVisible={(v) => (isVisible = v)}
>
  {#snippet hamburger()}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="hamburger vsrg-hamburger" onclick={() => (isVisible = !isVisible)}>
      {@render faBarsIcon()}
    </div>
  {/snippet}
  <MenuButton onclick={() => (isVisible = !isVisible)} class="close-menu" ariaLabel="Close menu">
    {@render faTimesIcon()}
  </MenuButton>
  <MenuButton
    onclick={functions.onSave}
    style="margin-top:auto"
    class={data.hasChanges ? 'not-saved' : ''}
    ariaLabel={t('common:save')}
  >
    {@render faSaveIcon()}
  </MenuButton>
  <MenuItem id="Help" ariaLabel={t('menu:help')}>
    {@render faQuestionIcon()}
  </MenuItem>
  <MenuItem id="Songs" ariaLabel={t('menu:song_menu')}>
    {@render faMusicIcon()}
  </MenuItem>
  <MenuItem id="Settings" ariaLabel={t('menu:settings_menu')}>
    {@render faCogIcon()}
  </MenuItem>
  <MenuButton
    onclick={homeStore.open}
    ariaLabel={t('menu:open_home_menu')}
    style="border:solid 0.1rem var(--secondary)"
  >
    {@render faHomeIcon()}
  </MenuButton>

  {#snippet panel()}
    <MenuPanelWrapper>
      <MenuPanel id="Help">
        <VsrgComposerHelp />
      </MenuPanel>
      <MenuPanel id="Songs">
        <div class="row">
          <AppButton onclick={functions.onCreateSong}>
            {t('common:create_song')}
          </AppButton>
        </div>
        <SongMenu
          songs={songsStore.songs}
          exclude={excludedSongsForSongsList}
          style="margin-top:0.6rem"
          SongComponent={VsrgComposerSongRow}
          componentProps={{
            folders: folderStore.folders,
            functions: {
              onClick: functions.onSongOpen,
              toggleMenu: (v) => (isVisible = v),
            },
          }}
        />
      </MenuPanel>
      <MenuPanel id="Settings">
        <SettingsPane settings={data.settings} onUpdate={functions.handleSettingChange} />
        <div class="column vsrg-select-song-wrapper">
          <Row align="center">
            <h1 class="settings-group-title row-centered">
              {t('vsrg_composer:background_song')}
            </h1>
            <HelpTooltip
              buttonStyle="width:1.2rem;height:1.2rem;margin-left:0.5rem"
              position="middle"
            >
              {t('vsrg_composer:background_song_info')}
            </HelpTooltip>
          </Row>

          {#if data.audioSong === null}
            <span>
              {t('vsrg_composer:no_background_song_selected')}
            </span>
          {:else}
            <div class="column vsrg-composer-selected-song">
              <div
                class="row"
                style="border-bottom:2px solid var(--secondary);padding-bottom:0.4rem;margin-bottom:0.4rem"
              >
                <span class="song-name" style="cursor:default">
                  {data.audioSong.name}
                </span>
                <SongActionButton
                  onclick={() => functions.setAudioSong(null)}
                  ariaLabel={t('vsrg_composer:remove_background_song')}
                  tooltip={t('vsrg_composer:remove_background_song')}
                  style="background-color:var(--red-bg);margin:0"
                >
                  {@render faTimesIconBare()}
                </SongActionButton>
              </div>
              <Row justify="between" align="center">
                <span>
                  {t('common:pitch')}
                </span>
                <span>
                  {data.audioSong.pitch}
                </span>
              </Row>
              <Row justify="between" align="center">
                <span>
                  {t('common:bpm')}
                </span>
                <span>
                  {data.audioSong.bpm}
                </span>
              </Row>
              <span style="margin-top:0.4rem">
                {t('vsrg_composer:instrument_modifiers')}
              </span>
              <!-- QUIRK: the visible param below is consumed directly as the new
                                 hidden value (hidden: visible, not !visible) - confusing but
                                 correct, since TrackModifier already passes !data.hidden. Any
                                 rename here needs care not to flip the boolean. -->
              {#each data.trackModifiers as trackModifier, i (i)}
                <TrackModifier
                  data={trackModifier}
                  onChange={(patch) => functions.onTrackModifierChange(i, patch, false)}
                  onVisibilityChange={(visible) => {
                    functions.onTrackModifierChange(i, { hidden: visible }, true);
                  }}
                />
              {/each}
            </div>
          {/if}
          <SongMenu
            songs={songsStore.songs}
            exclude={excludedSongsForAudioPicker}
            style="margin-top:0.6rem"
            SongComponent={VsrgComposerAudioSongRow}
            componentProps={{
              onClick: functions.setAudioSong,
            }}
          />
        </div>
        {#if !globalConfigStore.state.IS_MOBILE}
          <Separator background="var(--secondary)" height="0.1rem" verticalMargin="0.5rem" />
          <AppLink href="/keybinds" style="margin-left:auto">
            <AppButton>
              {t('settings:change_keybinds')}
            </AppButton>
          </AppLink>
        {/if}
      </MenuPanel>
    </MenuPanelWrapper>
  {/snippet}
</MenuSidebar>

<style>
  /* Intentionally duplicated in SettingsPane.svelte too: Svelte's scoped CSS doesn't share
       classes across files, so each consumer keeps its own copy rather than depending on
       another file's <style> block. */
  .settings-group-title {
    font-size: 1.3rem;
    margin: 0.5rem 0;
  }
</style>
