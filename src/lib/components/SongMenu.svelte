<script module lang="ts">
  import type { SongStorable } from '$core/Songs/Song.svelte';

  // Named separately, not inlined into the `generics` attribute below: that
  // attribute is a plain string Svelte's tokenizer brace-balance-scans
  // before the type-checker sees it, and a literal `{...}` object type
  // inside the string breaks that scan (misreports the script tag as left
  // open). A named type reference avoids the collision.
  export type SongMenuRowProps = { data: SongStorable };

  // `SongComponent` is a component reference (`Component<T>`), not a
  // snippet: every call site passes an actual component with its own local
  // state (e.g. a SongRow that resolves data async), which a snippet can't
  // own the way a component can.
  //
  // MIND THE COMMENTS IN THIS FILE: a svelte-check bug misreports a phantom
  // "script left open" error on a generics-attributed component when the same
  // file has both a style block and a comment that spells out a literal
  // script or style tag name in brackets. This file now carries its own style
  // block (the .create-folder button at the bottom), so every comment here is
  // deliberately worded to keep those tag names out of brackets - keep it
  // that way. SongMenuSearch.svelte holds its own styles for the same reason.
</script>

<script lang="ts" generics="T extends SongMenuRowProps">
  import type { Component, Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import FuzzySearch from 'fuzzy-search';
  import { Folder } from '$core/Folder';
  import type { SongType } from '$core/Songs/Song.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import Row from './layout/Row.svelte';
  import SongFolder from './SongFolder.svelte';
  import SongFolderContent from './SongFolderContent.svelte';
  import SongMenuSearch from './SongMenuSearch.svelte';

  let {
    songs,
    SongComponent,
    componentProps,
    class: cls = '',
    style = '',
    baseType,
    exclude,
    onCreateFolder,
    importButton,
  }: {
    songs: SongStorable[];
    SongComponent: Component<T>;
    componentProps: Omit<T, 'data'>;
    class?: ClassValue;
    style?: string;
    baseType?: SongType;
    exclude?: SongType[];
    onCreateFolder?: () => void;
    //the page's own import control (each page imports a different song kind),
    //rendered in the search row where the create-folder button used to sit
    importButton?: Snippet;
  } = $props();

  let searchValue = $state('');

  function isInFolder(folders: Folder[], song: SongStorable) {
    return folders.some((f) => f.id === song.folderId);
  }

  const filteredSongs = $derived.by(() => {
    const excluded = songs.filter((s) => !exclude?.includes(s.type));
    if (searchValue === '') return excluded;
    const searcher = new FuzzySearch(excluded, ['name'], { caseSensitive: false, sort: true });
    return searcher.search(searchValue);
  });

  // filterType has 3 possible values, but only 'alphabetical' sorts - the
  // other two are equivalent, so they collapse into the one ternary below
  // rather than a 3-way branch.
  const folders = $derived.by(() => {
    return folderStore.folders.map((folder) => {
      const clone = folder.clone();
      const filtered = filteredSongs.filter((song) => song.folderId === folder.id);
      clone.songs =
        folder.filterType === 'alphabetical'
          ? filtered.sort((a, b) => a.name.localeCompare(b.name))
          : filtered;
      return clone;
    });
  });

  const noFolderComposed = $derived(
    new Folder(
      t('menu:composed'),
      null,
      filteredSongs.filter((song) => !isInFolder(folders, song) && song.type === 'composed')
    )
  );
  const noFolderRecorded = $derived(
    new Folder(
      t('menu:recorded'),
      null,
      filteredSongs.filter((song) => !isInFolder(folders, song) && song.type === 'recorded')
    )
  );
  // QUIRK: this name is the literal, untranslated string "Vsrg" - the other
  // two folders above use t('menu:composed')/t('menu:recorded').
  const noFolderVsrg = $derived(
    new Folder(
      'Vsrg',
      null,
      filteredSongs.filter((song) => !isInFolder(folders, song) && song.type === 'vsrg')
    )
  );

  const unselectedColor = $derived(ThemeProvider.layer('menu_background', 0.35).lighten(0.2));
  const unselectedColorText = $derived(
    ThemeProvider.getTextColorFromBackground(unselectedColor).toString()
  );
  const folderColor = $derived(ThemeProvider.getText('menu_background').toString());

  // `{...componentProps, data: song}` structurally equals T for any real
  // instantiation (the generic bound `T extends {data: SongStorable}`
  // guarantees it), but TypeScript can't prove that reduction for an
  // unresolved generic - hence the cast, done once here and reused at
  // every SongComponent call site below.
  function rowProps(song: SongStorable): T {
    return { ...componentProps, data: song } as T;
  }
</script>

<div class={cls} {style}>
  <Row justify="between" gap="0.5rem">
    <SongMenuSearch
      value={searchValue}
      onInput={(v) => (searchValue = v)}
      backgroundColor={unselectedColor.toString()}
      textColor={unselectedColorText}
    />
    {@render importButton?.()}
  </Row>

  {#if !exclude?.includes('composed')}
    <SongFolder
      backgroundColor={unselectedColor.toString()}
      headerColor={unselectedColorText}
      color={folderColor}
      data={noFolderComposed}
      isDefault={true}
      defaultOpen={baseType === 'composed'}
    >
      <SongFolderContent>
        {#each noFolderComposed.songs as song (song.id)}
          <SongComponent {...rowProps(song)} />
        {/each}
        {#if noFolderComposed.songs.length === 0}
          <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_recorded_songs')}</div>
        {/if}
      </SongFolderContent>
    </SongFolder>
  {/if}

  {#if !exclude?.includes('recorded')}
    <SongFolder
      backgroundColor={unselectedColor.toString()}
      headerColor={unselectedColorText}
      color={folderColor}
      data={noFolderRecorded}
      isDefault={true}
      defaultOpen={baseType === 'recorded'}
    >
      <SongFolderContent>
        {#each noFolderRecorded.songs as song (song.id)}
          <SongComponent {...rowProps(song)} />
        {/each}
        {#if noFolderRecorded.songs.length === 0}
          <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_recorded_songs')}</div>
        {/if}
      </SongFolderContent>
    </SongFolder>
  {/if}

  {#if !exclude?.includes('vsrg')}
    <!-- QUIRK: defaultOpen checks baseType === 'recorded', the same
             condition as the Recorded folder above, not baseType === 'vsrg' -
             a copy-paste bug in the original app, reproduced rather than
             corrected. -->
    <SongFolder
      backgroundColor={unselectedColor.toString()}
      headerColor={unselectedColorText}
      color={folderColor}
      data={noFolderVsrg}
      isDefault={true}
      defaultOpen={baseType === 'recorded'}
    >
      <SongFolderContent>
        {#each noFolderVsrg.songs as song (song.id)}
          <SongComponent {...rowProps(song)} />
        {/each}
        {#if noFolderVsrg.songs.length === 0}
          <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_songs_in_folder')}</div>
        {/if}
      </SongFolderContent>
    </SongFolder>
  {/if}

  {#each folders as folder (folder.id)}
    {@const composed = folder.songs.filter((song) => song.type === 'composed')}
    {@const recorded = folder.songs.filter((song) => song.type === 'recorded')}
    {@const vsrg = folder.songs.filter((song) => song.type === 'vsrg')}
    <SongFolder
      backgroundColor={unselectedColor.toString()}
      headerColor={unselectedColorText}
      color={folderColor}
      data={folder}
    >
      {#if !exclude?.includes('composed') && composed.length > 0}
        <SongFolderContent title="Composed">
          {#each composed as song (song.id)}
            <SongComponent {...rowProps(song)} />
          {/each}
        </SongFolderContent>
      {/if}
      {#if !exclude?.includes('recorded') && recorded.length > 0}
        <SongFolderContent title="Recorded">
          {#each recorded as song (song.id)}
            <SongComponent {...rowProps(song)} />
          {/each}
        </SongFolderContent>
      {/if}
      {#if !exclude?.includes('vsrg') && vsrg.length > 0}
        <SongFolderContent title="Vsrg">
          {#each vsrg as song (song.id)}
            <SongComponent {...rowProps(song)} />
          {/each}
        </SongFolderContent>
      {/if}
      <!-- QUIRK: this emptiness check ignores `exclude` - it looks at
                 raw composed/recorded/vsrg counts, not whether those types are
                 individually excluded above. A folder containing only an
                 excluded type shows neither the type's content nor this empty
                 message, leaving a blank body. Reproduced exactly. -->
      {#if composed.length === 0 && recorded.length === 0 && vsrg.length === 0}
        <div style="padding:0.7rem;padding-top:0;font-size:0.9rem">{t('menu:folder_empty')}</div>
      {/if}
    </SongFolder>
  {/each}

  <!-- Outlined in the folders' own background color and left transparent, so
       it reads as the empty slot at the end of the folder list rather than as
       another control in the search row. -->
  {#if onCreateFolder}
    <button
      class="create-folder"
      onclick={onCreateFolder}
      style="--create-folder-color:{unselectedColor.toString()};color:{folderColor}"
    >
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
      {t('menu:create_folder')}
    </button>
  {/if}
</div>

<style>
  /* --create-folder-color is set inline to the same color the folders are
     filled with, so the outline matches them under any theme. */
  .create-folder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    margin: 0.4rem 0;
    padding: 0.5rem;
    border: solid 0.15rem var(--create-folder-color);
    border-radius: 0.4rem;
    background-color: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 1rem;
    cursor: pointer;
    transition:
      background-color 0.2s,
      filter 0.2s;
  }

  .create-folder:hover {
    background-color: var(--create-folder-color);
  }
</style>
