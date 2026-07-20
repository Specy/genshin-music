<script lang="ts">
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'

    // Old: src/components/shared/Inputs/Switch/index.tsx + Switch.module.css
    // `useTheme()` replaced by a direct import of the reactive ThemeProvider
    // singleton, same as Select.svelte. The old CSS module was dedicated
    // entirely to this component, so it inlines below verbatim - Svelte's
    // own per-component style scoping is the direct equivalent of the CSS
    // Modules hashing the old file relied on, so the plain class names below
    // stay local to this component without any import machinery.
    let {
        checked,
        onchange,
        styleOuter = '',
    }: {
        checked: boolean
        onchange: (change: boolean) => void
        styleOuter?: string
    } = $props()
</script>

<button
    class="switch-wrapper"
    onclick={() => onchange(!checked)}
    style={styleOuter}
    aria-label={checked ? 'Switch to off' : 'Switch to on'}
>
    <div
        class="switch-inner {checked ? 'switch-inner-on' : ''}"
        style="background-color:{(checked ? theme.get('accent') : theme.layer('primary', 0.4)).toString()}"
    ></div>
</button>

<style>
    .switch-wrapper {
        border-radius: 10rem;
        width: 2.4rem;
        height: 1.4rem;
        padding: 0.15rem;
        cursor: pointer;
        border: 0;
        background: var(--primary);
        color: var(--primary-text);
    }

    .switch-inner {
        background-color: var(--hint-main);
        border: 0.1rem solid var(--accent);
        width: 1.1rem;
        height: 1.1rem;
        border-radius: 100%;
        transition: all 0.2s cubic-bezier(0, 0, 0.14, 0.88);
    }

    .switch-inner-on {
        background-color: var(--accent);
        margin-left: calc(100% - 1.1rem);
    }
</style>
