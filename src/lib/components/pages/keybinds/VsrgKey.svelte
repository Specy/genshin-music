<script lang="ts">
    import {clickOutside} from '$lib/utils/clickOutside'

    // Old: the local (non-exported) `VsrgKey` function component at the bottom of
    // src/app/_client-pages/keybinds/index.tsx - split into its own file per this task's brief
    // (same extraction the brief applies to `ShortcutElement`, `keybinds/+page.svelte`'s own
    // local sub-component below the main export).
    //
    // `useClickOutside<HTMLButtonElement>(() => handleClick(false), {ignoreFocusable: true, active:
    // isActive})` (a hook returning a ref to attach) -> the `clickOutside` Svelte action (ported
    // Phase-4a Task 1), attached directly via `use:clickOutside` - no ref plumbing needed, Svelte
    // hands the action its own node.
    let {letter, isActive, handleClick}: {
        letter: string
        isActive: boolean
        handleClick: (status: boolean) => void
    } = $props()
</script>

<button
    class="vsrg-player-key-circle"
    use:clickOutside={{active: isActive, ignoreFocusable: true, onOutside: () => handleClick(false)}}
    style="width:3.5rem;font-size:1rem;height:3.5rem;margin:0.4rem;border:none;background-color:{isActive ? 'var(--accent)' : 'var(--primary)'};color:{isActive ? 'var(--accent-text)' : 'var(--primary-text)'};cursor:pointer"
    onclick={() => handleClick(!isActive)}
>
    {letter}
</button>

<style>
    /* Old: `svs['vsrg-player-key-circle']` where `svs` is the CSS Module import of
       src/components/pages/VsrgPlayer/VsrgPlayerKeyboard.module.css - this is the ONLY selector
       from that 96-line module the old keybinds page ever referenced (grepped: `svs` is used
       exactly once, for this exact class). The module's other rules (combinators targeting
       `.vsrg-player-keyboard-control-left`/`-right`, hitbox circles/lines, etc) belong to the real
       VSRG player page, ported in Phase 4c as
       src/lib/components/pages/VsrgPlayer/VsrgPlayerKeyboard.svelte.
       OWNERSHIP NOTE (was a "SKIP re-adding this rule" delimiter for 4c while that page didn't
       exist yet; REVERSED once it landed - see VsrgPlayerKeyboard.svelte's own header comment,
       "fix round 2", for the full story): Svelte scopes each component's <style> block
       independently (a private per-component hash suffix), unlike old's CSS Modules where every
       importer of VsrgPlayerKeyboard.module.css shared ONE compiled global class - so that file
       cannot reach elements rendered by THIS one and legitimately carries its own copy of this
       exact rule instead of reusing this one. Re-verified byte-identical this round (`diff` on
       both rule bodies: 0 output, 388 bytes each). This file's own copy below stays regardless -
       VsrgKey.svelte remains a real, independent consumer (the keybinds page).

       Most of this rule's own declarations (font-size/background-color/color/width/height/margin/
       border) are overridden by this component's own inline `style` above, which wins on
       specificity - only display/justify-content/align-items/border-radius end up visually
       effective, exactly as in the old React version (an inline `style` attribute always won there
       too). Ported byte-verbatim anyway rather than pruning to "only the effective properties",
       matching the old CSS as-authored. */
    .vsrg-player-key-circle {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.4rem;
        background-color: var(--background-layer-10);
        color: var(--background-text);
        width: 100%;
        height: 100%;
        border-radius: 50rem;
        margin: -0.15rem;
        border: solid 0.15rem var(--secondary);
    }
</style>
