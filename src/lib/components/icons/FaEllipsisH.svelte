<script lang="ts">
</script>

<!--
    Old: react-icons/fa's FaEllipsisH, fetched from unpkg.com/react-icons@5.6.0/fa/index.mjs.

    A dedicated one-off Component file, NOT the usual local-snippet-icon convention (see
    SimpleMenu.svelte/changelog's own githubIcon snippet) - this is the first real consumer of
    FloatingDropdown.svelte's `Icon: Component` prop (SongFolder.svelte, below), which renders it
    as a dynamic component tag (`<Icon />`), not `{@render ...}`. A #snippet can't satisfy a prop
    typed `Component`, so an actual .svelte file is required here; placed under a new `icons/`
    folder as the natural home for any future FloatingDropdown consumer that needs the same thing.

    Old call site (Folder.tsx) passed this bare (`Icon={FaEllipsisH}`, no size/color props), and
    FloatingDropdown.svelte's own template also renders it bare (`<Icon />`) - so this renders with
    the react-icons default height/width ("1em") and no color override, matching exactly.
-->
<svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
><path d="M328 256c0 39.8-32.2 72-72 72s-72-32.2-72-72 32.2-72 72-72 72 32.2 72 72zm104-72c-39.8 0-72 32.2-72 72s32.2 72 72 72 72-32.2 72-72-32.2-72-72-72zm-352 0c-39.8 0-72 32.2-72 72s32.2 72 72 72 72-32.2 72-72-32.2-72-72-72z" /></svg>
