<script lang="ts">
    // Old: src/components/shared/SvgNotes/sky/cr.tsx (React). `style`/`color` props
    // dropped — GlyphComponent's signature is `{background?: string}` (src/lib/games/types.ts);
    // fill/stroke now come from CSS (Player/Composer `.svg-note` rules, ported in Phase 4).
    // eslint-disable-next-line no-empty-pattern -- unused but required to type-match GlyphComponent
    let {}: {background?: string} = $props()
</script>

<svg class="svg-note" viewBox="0 0 63.87 63.87" xmlns="http://www.w3.org/2000/svg">
    <path
        d="M 31.939164,9.4384766 A 22.500162,22.500162 0 0 0 9.4384767,31.939165 22.500162,22.500162 0 0 0 31.939164,54.438477 22.500162,22.500162 0 0 0 54.438476,31.939165 22.500162,22.500162 0 0 0 31.939164,9.4384766 Z m 0,2.5303484 A 19.969496,19.969496 0 0 1 51.908129,31.939165 19.969496,19.969496 0 0 1 31.939164,51.90813 19.969496,19.969496 0 0 1 11.968824,31.939165 19.969496,19.969496 0 0 1 31.939164,11.968825 Z"
    />
</svg>
