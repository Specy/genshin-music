<script lang="ts">
    // Old: src/components/shared/SvgNotes/sky/cr.tsx (React). `color` restored P4c Task 2
    // (default 'currentColor') - old applied `style={{fill: color, stroke: color}}` to this
    // glyph's root <svg> (SvgNotes/index.tsx:48-52). `background` stays unused here - this glyph
    // has no matching sub-path that needs a background matte (Genshin's flat glyphs - reb/mib/
    // lab/tib - are the only ones that do).
    let {color = 'currentColor'}: {background?: string; color?: string} = $props()
</script>

<svg class="svg-note" viewBox="0 0 63.87 63.87" xmlns="http://www.w3.org/2000/svg" style="fill:{color};stroke:{color}">
    <path
        d="M 31.939164,9.4384766 A 22.500162,22.500162 0 0 0 9.4384767,31.939165 22.500162,22.500162 0 0 0 31.939164,54.438477 22.500162,22.500162 0 0 0 54.438476,31.939165 22.500162,22.500162 0 0 0 31.939164,9.4384766 Z m 0,2.5303484 A 19.969496,19.969496 0 0 1 51.908129,31.939165 19.969496,19.969496 0 0 1 31.939164,51.90813 19.969496,19.969496 0 0 1 11.968824,31.939165 19.969496,19.969496 0 0 1 31.939164,11.968825 Z"
    />
</svg>
