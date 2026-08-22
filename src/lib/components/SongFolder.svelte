<script lang="ts">
  import type { Snippet } from 'svelte';
  import cloneDeep from 'lodash.clonedeep';
  import { Folder, type FolderFilterType } from '$core/Folder';
  import { APP_NAME, FOLDER_FILTER_TYPES } from '$core/legacyConfig';
  import type { SerializedSongKind } from '$core/types';
  import { fileService } from '$core/Services/FileService';
  import { songService } from '$core/Services/SongService';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import FloatingDropdown from './utility/FloatingDropdown.svelte';
  import FloatingDropdownRow from './utility/FloatingDropdownRow.svelte';
  import FloatingDropdownText from './utility/FloatingDropdownText.svelte';
  import Column from './layout/Column.svelte';
  import FaEllipsisH from './icons/FaEllipsisH.svelte';

  // CSS (.folder/.folder-header/.folder-header-button/.folder-name/
  // .folder-overflow* etc.) lives in global App.css; no component-local
  // <style> is needed here.
  //
  // FOLDER_FILTER_TYPES/APP_NAME come from `$core/legacyConfig` even though
  // this is UI code: both are plain literals identical for both games
  // (never touch `$game`), so the two-tier rule's `$game`-only requirement
  // doesn't apply to them.
  //
  // FaEllipsisH is imported as a component (not inlined like the icons
  // below) because FloatingDropdown's `Icon` prop needs a real component
  // reference.
  let {
    children,
    backgroundColor,
    color,
    headerColor,
    data,
    isDefault,
    defaultOpen = false,
  }: {
    children?: Snippet;
    backgroundColor: string;
    headerColor: string;
    color: string;
    data: Folder;
    isDefault?: boolean;
    defaultOpen?: boolean;
  } = $props();

  // A writable $derived: `expanded` starts equal to `defaultOpen` and tracks
  // it, but toggleExpanded() below can still locally reassign it to diverge
  // (Svelte allows assigning to a $derived to override it until its
  // dependency changes again).
  let expanded = $derived(defaultOpen);
  let isRenaming = $state(false);
  let folderName = $derived(data.name);
  let height = $state(0);

  // A ResizeObserver and NOT a remeasure keyed on `data.songs`/`expanded`:
  // the song menu panel is `display:none` while closed (App.css
  // `.menu-panel`), so a song added while it was closed measured 0 and the
  // folder never remeasured when the menu opened again - the songs then
  // overflowed the folder. The observer fires on the display:none -> visible
  // transition (0 -> real size), which is exactly the case data-keyed
  // remeasuring misses, and covers content growth (new songs, a rename
  // wrapping to two lines) too. It also fires once on observe(), so the
  // initial measure is covered. Attachments are client-only, so there is
  // nothing to guard for SSR.
  function measureContentHeight(node: HTMLElement) {
    const observer = new ResizeObserver(() => {
      // +100 of slack so the max-height animation never clips the content
      height = node.getBoundingClientRect().height + 100;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }

  const wrapperStyle = $derived(`background-color:${backgroundColor};color:${color}`);

  function toggleExpanded() {
    if (isRenaming) return;
    expanded = !expanded;
  }

  function handleHeaderKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleExpanded();
  }

  async function deleteFolder() {
    const confirmed = await asyncConfirm(
      t('menu:confirm_delete_folder', { folder_name: data.name })
    );
    if (!confirmed) return;
    folderStore.removeFolder(data);
  }

  function toggleRename() {
    if (isRenaming) {
      folderStore.renameFolder(data, folderName);
      isRenaming = false;
    } else {
      isRenaming = true;
    }
  }

  function changeFilterType(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    const filterType = e.currentTarget.value as FolderFilterType;
    data.set({ filterType });
    folderStore.updateFolder(data);
  }

  async function downloadFolder() {
    const songs = await songService.getManySerializedFromStorable(cloneDeep(data.songs));
    const promises = songs.map((s) => fileService.prepareSongDownload(s as SerializedSongKind));
    const relatedSongs = (await Promise.all(promises)).flat();
    const filtered = relatedSongs.filter(
      (item, pos, self) => self.findIndex((e) => e.id === item.id) === pos
    );
    const files = [...filtered, data.serialize()];
    fileService.downloadFiles(files, `${data.name}-folder.${APP_NAME.toLowerCase()}sheet`);
  }
</script>

<div class={['folder', expanded && 'folder-expanded']} style={wrapperStyle}>
  <div class="folder-header">
    <div
      onclick={toggleExpanded}
      onkeydown={handleHeaderKeydown}
      role="button"
      tabindex="0"
      class="folder-header-button"
      style="color:{headerColor}"
    >
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="2"
        viewBox="0 0 16 16"
        style="transform:rotate({expanded ? 90 : 0}deg);transition:all 0.2s"
        height="18"
        width="18"
        xmlns="http://www.w3.org/2000/svg"
        ><path
          fill-rule="evenodd"
          d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"
        /></svg
      >
      {#if isRenaming}
        <input
          value={folderName}
          oninput={(e) => (folderName = e.currentTarget.value)}
          class="folder-name"
        />
      {:else}
        <div class="folder-name text-ellipsis">{data.name}</div>
      {/if}
    </div>
    {#if !isDefault}
      <FloatingDropdown
        offset={2.3}
        ignoreClickOutside={isRenaming}
        onClose={() => (isRenaming = false)}
        Icon={FaEllipsisH}
      >
        <FloatingDropdownRow onclick={toggleRename}>
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 512 512"
            style="margin-right:0.4rem"
            height="14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M290.74 93.24l128.02 128.02-277.99 277.99-114.14 12.6C11.35 513.54-1.56 500.62.14 485.34l12.7-114.22 277.9-277.88zm207.2-19.06l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.76 18.75-49.16 0-67.91z"
            /></svg
          >
          <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')} />
        </FloatingDropdownRow>
        <FloatingDropdownRow style="padding:0 0.4rem">
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 512 512"
            style="margin-right:0.4rem"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M487.976 0H24.028C2.71 0-8.047 25.866 7.058 40.971L192 225.941V432c0 7.831 3.821 15.17 10.237 19.662l80 55.98C298.02 518.69 320 507.493 320 487.98V225.941l184.947-184.97C520.021 25.896 509.338 0 487.976 0z"
            /></svg
          >
          <select class="dropdown-select" value={data.filterType} onchange={changeFilterType}>
            {#each FOLDER_FILTER_TYPES as folderType (folderType)}
              <option value={folderType}>{t(`menu:filter_${folderType}`)}</option>
            {/each}
          </select>
        </FloatingDropdownRow>
        <FloatingDropdownRow onclick={downloadFolder}>
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 512 512"
            style="margin-right:0.4rem"
            height="14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"
            /></svg
          >
          <FloatingDropdownText text={t('common:download')} />
        </FloatingDropdownRow>
        <FloatingDropdownRow onclick={deleteFolder}>
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 448 512"
            style="color:#ed4557;margin-right:0.4rem"
            height="14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
            ><path
              d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
            /></svg
          >
          <FloatingDropdownText text={t('common:delete')} />
        </FloatingDropdownRow>
      </FloatingDropdown>
    {/if}
  </div>

  <Column class="folder-overflow" style="max-height:{expanded ? height + 'px' : '0'}">
    <div class="column folder-overflow-expandible" {@attach measureContentHeight}>
      {@render children?.()}
    </div>
  </Column>
</div>
