<script lang="ts">
    // Old: src/components/shared/SvgNotes/sky/dm.tsx (React). `color` restored P4c Task 2
    // (default 'currentColor') - old applied `style={{fill: color, stroke: color}}` to this
    // glyph's root <svg> (SvgNotes/index.tsx:48-52). `background` stays unused here - this glyph
    // has no matching sub-path that needs a background matte (Genshin's flat glyphs - reb/mib/
    // lab/tib - are the only ones that do).
    // `version="0.0"` is a harmless leftover from the original export tool — preserved
    // verbatim rather than "fixed" (old code is the behavior spec; not observably harmful).
    let {color = 'currentColor'}: {background?: string; color?: string} = $props()
</script>

<svg class="svg-note" version="0.0" viewBox="0 0 63.97 63.87" xmlns="http://www.w3.org/2000/svg" style="fill:{color};stroke:{color}">
    <path
        d="M 30.878793,1.0626133 1.0626133,30.878793 a 1.4999541,1.4999541 89.999124 0 0 3.24e-5,2.121288 L 30.87876,62.814372 a 1.5000459,1.5000459 179.99912 0 0 2.121353,-3.2e-5 L 62.81434,33.000113 a 1.5000459,1.5000459 90.000876 0 0 3.2e-5,-2.121353 L 33.000081,1.0626457 a 1.4999541,1.4999541 8.7588976e-4 0 0 -2.121288,-3.24e-5 z m 2.121284,3.400427 26.413908,26.4157167 a 1.5000513,1.5000513 90.00098 0 1 -3.6e-5,2.121356 L 33.000113,59.413949 a 1.5000513,1.5000513 179.99902 0 1 -2.121356,3.6e-5 L 4.4630403,33.000077 A 1.4999487,1.4999487 89.99902 0 1 4.463004,30.878793 L 30.878793,4.463004 a 1.4999487,1.4999487 9.804247e-4 0 1 2.121284,3.63e-5 z"
    />
</svg>
