<script lang="ts">
    import '$lib/css/App.css'
    import '$lib/css/Utility.scss'
    import ThemeVars from '$lib/components/theme/ThemeVars.svelte'

    // P3 Task 5: wires the global CSS live for verification and adds the
    // ThemeVars wrapper skeleton. The full shell assembly (BodyDropper,
    // Logger, AsyncPrompt, AppInit, error boundary) is P3 Task 7.
    let {children} = $props()
</script>

<ThemeVars>
    {@render children()}
</ThemeVars>
