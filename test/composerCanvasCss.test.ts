/**
 * THE COMPOSER CANVAS' STYLESHEET COUPLINGS, each of which is one formula written down twice.
 *
 *  1. `.canvas-wrapper`'s `min-width`/`min-height` vs ComposerRenderer.computeCanvasSize. The canvas
 *     arrives hundreds of ms after the page does (a dynamic pixi import, then Application.init), so
 *     the wrapper has to be the canvas' size in CSS before the canvas exists or the page jumps when
 *     it loads. composerCanvasGeometry emits that size as two custom properties and App.css maxes
 *     them against its original floors; this file evaluates THOSE DECLARATIONS, with those
 *     properties, and checks the result against the JS the renderer actually sizes itself with.
 *  2. `.timeline-button`'s `width: 2.2rem` and `.timeline-controls`'s `padding` / `gap: 0.2rem` vs
 *     TIMELINE_BUTTON_SIZE/MARGIN, which is what ComposerRenderer derives TIMELINE_INSET_LEFT/RIGHT
 *     from - the two ends of the canvas it holds the mini-timeline strip clear of.
 *  3. ComposerCanvas.svelte's own INLINE STYLES, which are the third link of both chains and were
 *     the one link nothing read. The stylesheet and the geometry module agreeing buys nothing if the
 *     component never puts the custom properties on the element, or if the `margin-left: auto`
 *     that makes the right button's footprint 41.6px is dropped in a refactor - both of
 *     which passed the entire suite before the reader below existed. Read as TEXT, because no test
 *     in this repo mounts a Svelte component.
 *
 * WHAT THIS FILE CANNOT SEE: jsdom performs no layout, and nothing here renders the component. It
 * checks that the stylesheet and the template SAY what the TypeScript says, never that a browser
 * lays it out that way. In particular nothing here proves the three buttons really stand on
 * [0, 80px] and [W-41.6, W] - that follows from `flex-shrink: 0` plus the third button's
 * `margin-left: auto`, and is stated in App.css's own comment. What test/composerRenderer.test.ts
 * adds is the other half: that the renderer's hitarea and its drawn strip both stop at exactly
 * those two numbers.
 */
import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {nearestEven} from '$core/utils/Utilities'
import {
    COMPOSER_DESKTOP_MEDIA_QUERY,
    COMPOSER_MOBILE_MAX_WIDTH,
    PRO_KEYBOARD_SLIVER_PX,
    PRO_SONG_INFO_PX,
    TIMELINE_BAND_PADDING,
    TIMELINE_BUTTON_MARGIN,
    TIMELINE_BUTTON_SIZE,
    TIMELINE_INSET_LEFT,
    TIMELINE_INSET_RIGHT,
    composerCanvasCssSize,
    composerCanvasElementHeight,
    composerCanvasSize,
    composerNotesRegionY,
    composerTimelineStripY,
    isComposerDesktopWidth,
} from '$cmp/pages/Composer/composerCanvasGeometry'

//repo-relative, like test/midiConstructor.test.ts's own fixture read - vitest runs from the root
const APP_CSS = readFileSync('src/lib/css/App.css', 'utf8')
const COMPOSER_CANVAS = readFileSync(
    'src/lib/components/pages/Composer/ComposerCanvas.svelte',
    'utf8'
)
//the fourth link of the chain, and only for the Pro View: the modifier class and the `{#key}` that
//remounts the renderer on a flip both live in the PARENT, not in the canvas component
const COMPOSER = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8')

/**
 * One element's markup, from the attribute that identifies it to the `>` that closes the open tag.
 *
 * Deliberately narrow, like declarationsOf below: it throws rather than matching something else if
 * the element is restructured, and it stops at the first `>` so it cannot run into a sibling.
 */
function openTagContaining(marker: string): string {
    const at = COMPOSER_CANVAS.indexOf(marker)
    if (at < 0) throw new Error(`ComposerCanvas.svelte has no \`${marker}\``)
    const open = COMPOSER_CANVAS.lastIndexOf('<', at)
    const close = COMPOSER_CANVAS.indexOf('>', at)
    if (open < 0 || close < 0) throw new Error(`\`${marker}\` is not inside an element`)
    return COMPOSER_CANVAS.slice(open, close + 1)
}

/** App.css with its comments removed, so a `{`, `}` or `;` inside one cannot end a block here. */
const CSS_WITHOUT_COMMENTS = APP_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The declarations of ONE top-level rule, by its exact selector.
 *
 * Deliberately narrow: it finds `\n<selector> {` and reads to the next `}`. A restructuring of the
 * stylesheet - nesting the rule, merging the selector with another, moving it into a media query -
 * makes this throw rather than silently match something else.
 *
 * `mustDeclare` picks between SEVERAL top-level rules sharing one selector, which App.css genuinely
 * has: two `:root` blocks, the palette one first and the `--menu-size` one 1000 lines later. Without
 * it a lookup for the second silently reads the first and finds nothing.
 */
function declarationsOf(selector: string, mustDeclare?: string): Map<string, string> {
    let from = 0
    for (;;) {
        const start = CSS_WITHOUT_COMMENTS.indexOf(`\n${selector} {`, from)
        if (start < 0) {
            const which = mustDeclare ? ` declaring \`${mustDeclare}\`` : ''
            throw new Error(`src/lib/css/App.css has no top-level \`${selector}\` rule${which}`)
        }
        const open = CSS_WITHOUT_COMMENTS.indexOf('{', start)
        const close = CSS_WITHOUT_COMMENTS.indexOf('}', open)
        if (close < 0) throw new Error(`\`${selector}\` is never closed`)
        const declarations = new Map<string, string>()
        for (const piece of CSS_WITHOUT_COMMENTS.slice(open + 1, close).split(';')) {
            const colon = piece.indexOf(':')
            if (colon < 0) continue
            declarations.set(piece.slice(0, colon).trim(), piece.slice(colon + 1).trim())
        }
        if (!mustDeclare || declarations.has(mustDeclare)) return declarations
        from = close
    }
}

/**
 * ONE `@media` BLOCK'S BODY, by its exact prelude, with braces counted so a nested rule cannot end
 * it early. The desktop layout's declarations live inside a query and are therefore out of
 * declarationsOf's reach, but they are half of what the canvas' desktop width is stated against.
 */
function mediaBlock(prelude: string): string {
    const at = CSS_WITHOUT_COMMENTS.indexOf(`@media ${prelude} {`)
    if (at < 0) throw new Error(`src/lib/css/App.css has no \`@media ${prelude}\` block`)
    let depth = 0
    for (let i = CSS_WITHOUT_COMMENTS.indexOf('{', at); i < CSS_WITHOUT_COMMENTS.length; i++) {
        if (CSS_WITHOUT_COMMENTS[i] === '{') depth++
        else if (CSS_WITHOUT_COMMENTS[i] === '}' && --depth === 0) {
            return CSS_WITHOUT_COMMENTS.slice(at, i + 1)
        }
    }
    throw new Error(`\`@media ${prelude}\` is never closed`)
}

interface CssContext {
    viewportWidth: number
    viewportHeight: number
    /** custom properties in scope, as their declared strings */
    vars: Record<string, string>
}

type CssToken =
    | {type: 'number', value: number, unit: string}
    | {type: 'ident', value: string}
    | {type: '(' | ')' | ',' | '+' | '-' | '*' | '/'}

/**
 * A DELIBERATELY TINY CSS VALUE GRAMMAR: `calc()`, `max()`, `min()`, `var()`, `+ - * /`, and the
 * units px / vw / vh / unitless. Anything else throws, so a change to the SHAPE of the declarations
 * this file reads fails the parse instead of quietly evaluating to something plausible.
 *
 * `-` and `+` are always binary operators and never signs, which is what CSS `calc()` itself
 * requires (they must be surrounded by whitespace); no expression here has a negative literal.
 */
function tokenize(source: string): CssToken[] {
    const tokens: CssToken[] = []
    let i = 0
    while (i < source.length) {
        const rest = source.slice(i)
        if (/^\s/.test(rest)) {
            i++
            continue
        }
        //before the operator branch, or `--custom-property` reads as a minus
        const custom = /^--[A-Za-z0-9-]+/.exec(rest)
        if (custom) {
            tokens.push({type: 'ident', value: custom[0]})
            i += custom[0].length
            continue
        }
        const number = /^\d*\.?\d+/.exec(rest)
        if (number) {
            const unit = /^[a-z%]*/.exec(rest.slice(number[0].length))![0]
            tokens.push({type: 'number', value: Number(number[0]), unit})
            i += number[0].length + unit.length
            continue
        }
        const ident = /^[A-Za-z][A-Za-z0-9-]*/.exec(rest)
        if (ident) {
            tokens.push({type: 'ident', value: ident[0]})
            i += ident[0].length
            continue
        }
        const punctuation = rest[0]
        if ('(),+-*/'.includes(punctuation)) {
            tokens.push({type: punctuation as '('})
            i++
            continue
        }
        throw new Error(`unsupported character \`${punctuation}\` in \`${source}\``)
    }
    return tokens
}

/**
 * `<n>vw` is `viewport * (n / 100)` and NOT `(n * viewport) / 100` - the two associate differently
 * in the last bit for about 40% of fractional viewport widths, and the result goes through
 * nearestEven, which turns a 1-ulp difference at an odd-integer input into a 2px one.
 * composerCanvasGeometry states the same association on the TypeScript side; the exactness
 * assertions below are only meaningful because the two agree.
 */
function toPx(token: {value: number, unit: string}, context: CssContext): number {
    if (token.unit === '' || token.unit === 'px') return token.value
    if (token.unit === 'vw') return context.viewportWidth * (token.value / 100)
    if (token.unit === 'vh') return context.viewportHeight * (token.value / 100)
    throw new Error(`unsupported unit \`${token.unit}\``)
}

function evaluateCss(source: string, context: CssContext): number {
    const tokens = tokenize(source)
    let position = 0
    const peek = () => tokens[position]
    const next = () => tokens[position++]
    const expect_ = (type: string) => {
        const token = next()
        if (!token || token.type !== type) {
            throw new Error(`expected \`${type}\` in \`${source}\``)
        }
    }
    function primary(): number {
        const token = next()
        if (!token) throw new Error(`unexpected end of \`${source}\``)
        if (token.type === 'number') return toPx(token, context)
        if (token.type === '(') {
            const value = expression()
            expect_(')')
            return value
        }
        if (token.type !== 'ident') throw new Error(`unexpected \`${token.type}\` in \`${source}\``)
        if (token.value === 'calc') {
            expect_('(')
            const value = expression()
            expect_(')')
            return value
        }
        if (token.value === 'max' || token.value === 'min') {
            expect_('(')
            const args = [expression()]
            while (peek()?.type === ',') {
                next()
                args.push(expression())
            }
            expect_(')')
            return token.value === 'max' ? Math.max(...args) : Math.min(...args)
        }
        if (token.value === 'var') {
            expect_('(')
            const name = next()
            if (!name || name.type !== 'ident') throw new Error(`var() wants a name in \`${source}\``)
            let fallback: number | null = null
            if (peek()?.type === ',') {
                next()
                fallback = expression()
            }
            expect_(')')
            const declared = context.vars[name.value]
            if (declared !== undefined) return evaluateCss(declared, context)
            if (fallback === null) throw new Error(`\`${name.value}\` is unset and has no fallback`)
            return fallback
        }
        throw new Error(`unsupported function \`${token.value}()\` in \`${source}\``)
    }
    function term(): number {
        let value = primary()
        while (peek()?.type === '*' || peek()?.type === '/') {
            const operator = next().type
            const right = primary()
            value = operator === '*' ? value * right : value / right
        }
        return value
    }
    function expression(): number {
        let value = term()
        while (peek()?.type === '+' || peek()?.type === '-') {
            const operator = next().type
            const right = term()
            value = operator === '+' ? value + right : value - right
        }
        return value
    }
    const result = expression()
    if (position !== tokens.length) throw new Error(`trailing tokens in \`${source}\``)
    return result
}

describe('the composer canvas placeholder and the size the renderer computes', () => {
    const wrapper = declarationsOf('.canvas-wrapper')

    it('App.css states the placeholder in the shape this file evaluates', () => {
        //THE SHAPE PIN. Both floors stay inside the max(): `78vw` is the larger value below a
        //~643px viewport, so replacing rather than maxing would NARROW the wrapper on phones, and
        //the `0px` fallback is what makes an unset property degrade to exactly the pre-existing
        //rule (which is what the theme preview gets - composerCanvasCssSize returns null there).
        expect(wrapper.get('min-width')).toBe('max(78vw, var(--composer-canvas-width, 0px))')
        expect(wrapper.get('min-height')).toBe(
            'max(calc(45vh + 14px), var(--composer-canvas-height, 0px))'
        )
        //...and the ONE INDIRECTION between that and the inline properties: the width the max()
        //reads is bound to the mobile inline property here and to the desktop one in the desktop
        //block, so a browser picks the breakpoint before any JS runs. Collapsing this back to a
        //single inline `--composer-canvas-width` reinstates the 79px hydration jump.
        expect(wrapper.get('--composer-canvas-width')).toBe(
            'var(--composer-canvas-width-mobile, 0px)'
        )
        expect(mediaBlock(COMPOSER_DESKTOP_MEDIA_QUERY)).toContain(
            '--composer-canvas-width: var(--composer-canvas-width-desktop, 0px);'
        )
    })

    //`document.body.getBoundingClientRect()` on the composer route is (100vw, 100vh) exactly - see
    //composerCanvasCssSize for the rules that make it so - which is why the same pair drives both
    //sides here.
    const VIEWPORTS = [
        //2560x1440 is here for the HEIGHT FLOOR rather than for the formula: `45vh + 14px` beats
        //`45vh * 0.95 + 36.4px` above a 995.6px-tall viewport, so this is the only row where the
        //placeholder is deliberately NOT the canvas' height on sky - see the dedicated test below.
        {width: 2560, height: 1440},
        {width: 1920, height: 1080},
        {width: 1440, height: 900},
        {width: 1280, height: 800},
        //the two rows either side of COMPOSER_MOBILE_MAX_WIDTH, where the desktop formula starts
        {width: 1001, height: 800},
        {width: 1000, height: 800},
        {width: 900, height: 700},
        {width: 643, height: 900},
        {width: 400, height: 800},
        {width: 360, height: 640},
    ]
    //genshin and sky's game.json `composerRowHeightScale`, and the desktop/mobile timeline heights.
    //Both are build- or UA-time values one run cannot vary on its own, so they are passed in.
    const ROW_HEIGHT_SCALES = [1, 0.95]
    const TIMELINE_HEIGHTS = [36.4, 31.4]

    for (const viewport of VIEWPORTS) {
        for (const rowHeightScale of ROW_HEIGHT_SCALES) {
            for (const timelineHeight of TIMELINE_HEIGHTS) {
                const label =
                    `${viewport.width}x${viewport.height}, scale ${rowHeightScale},` +
                    ` timeline ${timelineHeight}px`

                it(`agrees with computeCanvasSize at ${label}`, () => {
                    //CSS PICKS ONE OF THE TWO WIDTHS, composerCanvasSize derives the same choice
                    //from the body width it is given. Reproducing the cascade below rather than
                    //asking composerCanvasCssSize for one width is what makes a disagreement about
                    //WHERE the boundary is fail here.
                    const isDesktop = viewport.width > COMPOSER_MOBILE_MAX_WIDTH
                    expect(isComposerDesktopWidth(viewport.width)).toBe(isDesktop)
                    const css = composerCanvasCssSize({
                        inPreview: false,
                        rowHeightScale,
                        timelineHeight,
                    })
                    if (!css) throw new Error('composerCanvasCssSize returned null outside preview')
                    const context: CssContext = {
                        viewportWidth: viewport.width,
                        viewportHeight: viewport.height,
                        vars: {
                            //the two inline properties the component sets...
                            '--composer-canvas-width-mobile': css.mobileWidth,
                            '--composer-canvas-width-desktop': css.desktopWidth,
                            //...and what the cascade resolves the one the max() reads to, which is
                            //the declaration this file just pinned, per side of the breakpoint
                            '--composer-canvas-width': isDesktop
                                ? 'var(--composer-canvas-width-desktop, 0px)'
                                : 'var(--composer-canvas-width-mobile, 0px)',
                            '--composer-canvas-height': css.height,
                        },
                    }
                    const js = composerCanvasSize({
                        bodyWidth: viewport.width,
                        bodyHeight: viewport.height,
                        inPreview: false,
                        rowHeightScale,
                    })
                    const jsCanvasHeight = composerCanvasElementHeight(js.height, timelineHeight)

                    //THE FORMULA ITSELF, restated here rather than imported, so that changing 0.85
                    //or 0.45 in composerCanvasGeometry fails instead of moving both sides together.
                    //Above the breakpoint the canvas FILLS THE WINDOW - `100vw` less the `.tool`
                    //column's own `4vw` and the 177.6px of fixed chrome the dedicated test below
                    //reads out of App.css - instead of being a `85vw` card centred in it.
                    expect(evaluateCss(context.vars['--composer-canvas-width'], context)).toBeCloseTo(
                        isDesktop ? viewport.width * 0.96 - 177.6 : viewport.width * 0.85 - 45,
                        6
                    )
                    expect(
                        evaluateCss(css.height, context) -
                            (TIMELINE_BAND_PADDING * 2 + timelineHeight)
                    ).toBeCloseTo(viewport.height * 0.45 * rowHeightScale, 6)

                    //...and EXACTLY the renderer's width once rounded, which is the only thing the
                    //CSS cannot reproduce (nearestEven; see composerCanvasCssSize for why not
                    //`round(nearest, x, 2px)`)
                    expect(nearestEven(evaluateCss(context.vars['--composer-canvas-width'], context))).toBe(js.width)

                    //THE HEIGHT'S TWO ROUNDINGS, restated, because the CSS side cannot see either of
                    //them and `toBeCloseTo` above cannot either: the inner one exists so that the
                    //45vh notes region is EVEN before the game's row-height scale touches it, which
                    //is what keeps `height / NOTES_PER_COLUMN` - the note row height and the
                    //ComposerCache's `noteHeight` - off half-pixels. Dropping it changes nothing at
                    //scale 1 (nearestEven is idempotent) and 2px at scale 0.95 on any viewport where
                    //45vh is odd, e.g. the 900px-tall rows here: 406*0.95 rounds to 386, 405*0.95 to
                    //384.
                    expect(js.height).toBe(
                        nearestEven(nearestEven(viewport.height * 0.45) * rowHeightScale)
                    )

                    //THE LAYOUT SHIFT, which is what all of this is for: the wrapper's size before
                    //the canvas exists against its size after. `min-width`/`min-height` hold both
                    //ends - after the canvas lands the wrapper is `max(floor, canvas)`.
                    const placeholderWidth = evaluateCss(wrapper.get('min-width')!, context)
                    const placeholderHeight = evaluateCss(wrapper.get('min-height')!, context)
                    const loadedWidth = Math.max(placeholderWidth, js.width)
                    const loadedHeight = Math.max(placeholderHeight, jsCanvasHeight)
                    //<=1px: nearestEven on the width, which CSS does not do
                    expect(Math.abs(loadedWidth - placeholderWidth)).toBeLessThanOrEqual(1)
                    //<=1px at scale 1 and <=2px at 0.95, which is the whole of the two nearestEven
                    //roundings the height goes through: |nearestEven(x) - x| <= 1, x0.95, +1 = 1.95
                    expect(Math.abs(loadedHeight - placeholderHeight)).toBeLessThanOrEqual(
                        rowHeightScale === 1 ? 1 : 2
                    )
                })
            }
        }
    }

    it('leaves the wrapper a transparent tail on sky above a ~996px viewport, and no shift', () => {
        //THE ONE PLACE THE PLACEHOLDER IS NOT THE CANVAS' SIZE. `45vh + 14px` beats
        //`45vh * scale + band` whenever `0.0225 * H > 22.4`, i.e. above H = 995.6, and only on sky
        //(scale 0.95; at scale 1 the var's term is the larger of the two everywhere). The floor
        //predates this whole change and is kept because it is also what holds the wrapper up on
        //phones, so what this row states is the CONSEQUENCE: the wrapper stays ~10px taller than the
        //canvas element for good - a transparent strip under the mini-timeline inside the card - and
        //because the same value holds before AND after the canvas lands, the layout shift is 0.
        const context: CssContext = {viewportWidth: 2560, viewportHeight: 1440, vars: {}}
        const css = composerCanvasCssSize({
            inPreview: false,
            rowHeightScale: 0.95,
            timelineHeight: 36.4,
        })
        if (!css) throw new Error('composerCanvasCssSize returned null outside preview')
        context.vars['--composer-canvas-height'] = css.height
        const js = composerCanvasSize({
            bodyWidth: 2560,
            bodyHeight: 1440,
            inPreview: false,
            rowHeightScale: 0.95,
        })
        const canvasHeight = composerCanvasElementHeight(js.height, 36.4)
        const placeholder = evaluateCss(wrapper.get('min-height')!, context)
        expect(placeholder).toBeCloseTo(0.45 * 1440 + 14, 6)
        expect(canvasHeight).toBeCloseTo(652.4, 6)
        expect(placeholder - canvasHeight).toBeCloseTo(9.6, 6)
        //...and nothing moves when the canvas arrives, which is what the placeholder is for
        expect(Math.max(placeholder, canvasHeight)).toBe(placeholder)
    })

    it('emits nothing in the theme preview, so that route keeps its old floors', () => {
        //`.canvas-wrapper-in-preview` unsets both floors anyway. The preview's own branch tests the
        //BODY width against 900 while a media query would test the viewport width including the
        //scrollbar, and /theme genuinely scrolls - so the two would disagree over a scrollbar-wide
        //band of widths. Deliberately out of scope; a null here removes the custom properties and
        //App.css's `0px` fallback restores exactly the pre-existing rule.
        expect(composerCanvasCssSize({inPreview: true})).toBeNull()
    })
})

/**
 * THE PRO VIEW'S HALF OF THE SAME COUPLING (CONTEXT.md: Pro View; spec §6/§8).
 *
 * Everything the block above states about the Compressed View holds here unchanged - this adds the
 * second branch rather than replacing anything. What is new is that the Pro View canvas is sized
 * against the WINDOW rather than as a fraction of it, so the numbers it is the window LESS are the
 * ones that have to be written down twice: `.composer-grid`'s padding and the band the lowered
 * keyboard sheet stands in. The sheet's own transform is read back out of App.css here for that
 * reason - if the sliver ever grows without PRO_KEYBOARD_SLIVER_PX growing with it, the canvas'
 * bottom rows go under it and nothing else in the suite would notice.
 */
describe('the Pro View canvas: the window it fills and the band it stops above', () => {
    const wrapper = declarationsOf('.canvas-wrapper')
    const VIEWPORTS = [
        {width: 2560, height: 1440},
        {width: 1920, height: 1080},
        {width: 1280, height: 800},
        //either side of the composer's desktop breakpoint, where the WIDTH formula changes and the
        //height's must not
        {width: 1001, height: 800},
        {width: 1000, height: 800},
        {width: 900, height: 700},
        {width: 400, height: 800},
        {width: 360, height: 640},
    ]
    const TIMELINE_HEIGHTS = [36.4, 31.4]
    //`.composer-grid`'s 0.2rem padding at both ends plus the BOTTOM BAND - the sliver and the
    //song-info row under it - at the 16px root font size composerCanvasGeometry assumes and states.
    //Restated here rather than imported, so moving a constant fails instead of moving both sides
    //together.
    const PRO_INSET = 0.2 * 16 * 2 + 2.5 * 16 + 1.75 * 16

    it('App.css still declares the bottom band the canvas reserves, and leaves it exactly that', () => {
        //THE THIRD BRIDGE between this stylesheet and composerCanvasGeometry, after the timeline
        //buttons' rem values and the desktop chrome's. The properties are on `:root` and not on
        //`.composer-grid-pro` because `.song-info` - one of the things held clear of the sliver -
        //is a SIBLING of the composer grid rather than a descendant of it.
        expect(declarationsOf(':root', '--pro-sliver-height').get('--pro-sliver-height')).toBe(
            '2.5rem'
        )
        expect(PRO_KEYBOARD_SLIVER_PX).toBe(2.5 * 16)
        expect(declarationsOf(':root', '--pro-song-info-height').get('--pro-song-info-height')).toBe(
            '1.75rem'
        )
        expect(PRO_SONG_INFO_PX).toBe(1.75 * 16)
        //...and the sheet leaves exactly that much of itself on screen. A `100%` in `translateY` is
        //the element's OWN height, so what peeks above the sheet's own box is this term and nothing
        //else, whatever instrument's keyboard is loaded - and that box stands ON the song-info row
        //rather than on the window's edge, so the sliver is never behind the song's name.
        const sheet = declarationsOf('.composer-grid-pro .composer-keyboard-wrapper')
        expect(sheet.get('transform')).toBe('translateY(calc(100% - var(--pro-sliver-height)))')
        expect(sheet.get('bottom')).toBe('var(--pro-song-info-height)')
        //the sliver's tap target is that same band, in the same place, or a tap lands on a key
        //instead of raising - or on the song's name instead of the keyboard
        const sliver = declarationsOf('.composer-keyboard-sliver')
        expect(sliver.get('height')).toBe('var(--pro-sliver-height)')
        expect(sliver.get('bottom')).toBe('var(--pro-song-info-height)')
        //...and the raised state is a class on the GRID, so ComposerKeyboard's three wrappers
        //(loading, recording, keys) all get it without knowing anything about a sheet
        expect(declarationsOf('.composer-grid-pro-raised .composer-keyboard-wrapper').get('transform')).toBe(
            'translateY(0)'
        )
    })

    /**
     * THE BOTTOM BAND (spec §8): the song's name and time at the very bottom of the window, the
     * sliver above them, the canvas above that, and the tool column running past all of it.
     *
     * The band is what the canvas gave up its height for, so the one thing that must hold is that
     * nothing in it overlaps anything else: the info row is the window's own bottom edge, the sheet
     * stands on that row, and PRO_INSET (which the canvas is the window less) is exactly the two of
     * them plus the grid's padding.
     */
    it('puts the song info at the window\'s bottom, in a row of its own', () => {
        const info = declarationsOf('.song-info-pro')
        expect(info.get('bottom')).toBe('0')
        expect(info.get('height')).toBe('var(--pro-song-info-height)')
        //a ROW and not the base rule's column, which is what makes 1.75rem enough for both halves
        expect(info.get('flex-direction')).toBe('row')
        expect(info.get('align-items')).toBe('center')
        //the full width, clear of the sidebar by padding rather than by the base rule's `left`
        expect(info.get('left')).toBe('0')
        expect(info.get('width')).toBe('100%')
        expect(info.get('padding-left')).toBe('calc(4rem + 0.5vw)')
        //above the sheet, which stands on this row rather than over it
        expect(info.get('z-index')).toBe('8')
        //the two bands tile the inset exactly, with the grid's own padding as the only other term
        expect(0.2 * 16 * 2 + PRO_KEYBOARD_SLIVER_PX + PRO_SONG_INFO_PX).toBe(PRO_INSET)
    })

    it('gives the canvas the whole grid row, which is what its height is stated against', () => {
        //composerCanvasGeometry's pro inset assumes the canvas' row IS the grid's content box. The
        //base layout leaves both rows `auto` and splits the free space between them (the keyboard's
        //row is out of flow, so it would take half of it for nothing), which would leave the canvas
        //taller than the row it sits in.
        expect(declarationsOf('.composer-grid-pro').get('grid-template-rows')).toBe('1fr auto')
        //...and the wrapper is the canvas' own size rather than the row's, so `.canvas-relative`'s
        //rounded corners stop where the canvas does
        expect(declarationsOf('.composer-grid-pro .canvas-wrapper').get('align-self')).toBe(
            'flex-start'
        )
        //...and the 1px boundary between the two regions is on the strip's OTHER edge here, since
        //the notes are below it rather than above it. `0 0 auto` is the top edge, `auto 0 0` the
        //bottom; left alone it would run along the canvas' own top edge and mark nothing.
        expect(declarationsOf('.timeline-controls::before').get('inset')).toBe('0 0 auto')
        expect(declarationsOf('.composer-grid-pro .timeline-controls::before').get('inset')).toBe(
            'auto 0 0'
        )
    })

    it('keeps the tempo changers a ROW of the tool column, not a corner of the window', () => {
        //PHASE E's mobile fix, and the one thing here that cannot be seen without layout: floated
        //into the bottom-right corner (which is what phase B did) the slot was pinned to the window
        //while the five tools packed down from the top, so on a landscape phone - 850x420, where the
        //column has ~374px and the tools alone wanted 5x64 - the tempo buttons covered the View
        //Lock. As the sixth row of the same grid the two cannot overlap at any height.
        const tools = declarationsOf('.composer-grid-pro .buttons-composer-wrapper-right')
        expect(tools.get('grid-template-rows')).toBe('repeat(5, minmax(0, 8rem)) 1fr')
        //...which needs the column's height to be DEFINITE, or the six rows would make the flex row
        //(`height: fit-content`) taller than the window instead of the tools shrinking. The cap is
        //the GRID's own content box - the window less its 0.2rem padding at each end - so the
        //column runs past the canvas' bottom edge and the tempo changers sit against the window's,
        //beside the sliver and the song-info row rather than above a band of nothing.
        expect(tools.get('max-height')).toBe('calc(100vh - 0.4rem)')
        //...and the row the column stretches in is the GRID's here, not the canvas'. That height is
        //written inline by Composer.svelte (an inline `height` is the one thing this stylesheet
        //cannot override), and `fit-content` - the Compressed View's - is the canvas' own height,
        //which is where the tempo changers used to stop.
        expect(COMPOSER).toContain(
            `style="height:{proView ? '100%' : 'fit-content'};width:100%"`
        )
        //the same six rows below the breakpoint, with the smaller cap that block already had
        expect(mediaBlock(`only screen and (max-width: ${COMPOSER_MOBILE_MAX_WIDTH}px)`)).toContain(
            'grid-template-rows: repeat(5, minmax(0, 4rem)) 1fr;'
        )
        const tempo = declarationsOf('.composer-grid-pro .tempo-changers-wrapper')
        //`relative` only so the z-index still counts against the backdrop's 5 - the changers stay
        //reachable with the keyboard sheet up, which is the whole reason they left the keyboard
        expect(tempo.get('position')).toBe('relative')
        expect(tempo.get('z-index')).toBe('8')
        //...and the base rule's `right`/`bottom`, which would SHIFT a relatively-positioned box
        expect(tempo.get('inset')).toBe('auto')
        expect(tempo.get('align-self')).toBe('end')
        //never wider than the column: a grid item's automatic minimum is its content's, and the
        //"Tempo" caption's would push this column off the right edge below ~610px of window
        expect(tempo.get('min-width')).toBe('0')
        //playing still hides them, without collapsing the row and resizing every tool above it
        const hidden = declarationsOf('.composer-grid-pro .tempo-changers-wrapper-hidden')
        expect(hidden.get('display')).toBe('flex')
        expect(hidden.get('visibility')).toBe('hidden')
        //...and the row is real: Composer.svelte renders the component INSIDE that column in the
        //Pro View (ComposerKeyboard renders the same component in the Compressed View)
        const column = COMPOSER.indexOf('<div class="buttons-composer-wrapper-right">')
        const tempoTag = COMPOSER.indexOf('<ComposerTempoChangers')
        expect(column).toBeGreaterThan(-1)
        expect(tempoTag).toBeGreaterThan(column)
        //...and before the sheet itself, which is the stacking order App.css's z-indexes state:
        //the changers are reachable with the keyboard up, which is the whole reason they left it
        expect(tempoTag).toBeLessThan(COMPOSER.indexOf('<ComposerKeyboard'))
    })

    /**
     * THE RAISED SHEET'S SCRIM, and the one thing it must not be: the window.
     *
     * It was an `inset: 0` backdrop div, so raising the keyboard dimmed and disabled the whole Pro
     * View canvas - the surface being edited. It is the SHEET'S OWN pseudo-element now, so the band
     * is the keyboard's box whatever instrument is loaded, with `--pro-scrim-head` of gradient above
     * it fading to nothing; the canvas above that is at full brightness and takes its own pointers,
     * which is what lets a drag scroll the song while the sheet is up (composerInput's
     * `dismiss-sheet` is what a settled TAP means instead).
     */
    it('scrims the keyboard\'s own band and leaves the canvas alone', () => {
        const scrim = declarationsOf('.composer-grid-pro .composer-keyboard-wrapper::before')
        //the sheet's box plus the head above it, and nothing else of the window
        expect(scrim.get('inset')).toBe('calc(-1 * var(--pro-scrim-head)) 0 0 0')
        expect(declarationsOf(':root', '--pro-scrim-head').get('--pro-scrim-head')).toBe('5rem')
        //a gradient that dies out upward, so there is no edge where the scrim stops
        expect(scrim.get('background')).toContain('linear-gradient(')
        expect(scrim.get('background')).toContain('rgba(0, 0, 0, 0)')
        //behind the keys, in front of the canvas - the wrapper's own stacking context
        expect(scrim.get('z-index')).toBe('-1')
        //fades in and out with the raise, rather than appearing with it
        expect(scrim.get('opacity')).toBe('0')
        expect(scrim.get('transition')).toBe('opacity 0.28s ease')
        expect(
            declarationsOf('.composer-grid-pro-raised .composer-keyboard-wrapper::before').get(
                'opacity'
            )
        ).toBe('1')
        //THE SCRIM IS NOT A HIT TARGET, and neither is the sheet's own empty air: a tap beside the
        //keyboard has to reach the canvas to dismiss the sheet, so only the wrapper's CHILDREN
        //(the keys, the side chevrons, the recording UI) take pointers
        expect(scrim.get('pointer-events')).toBe('none')
        expect(
            declarationsOf('.composer-grid-pro-raised .composer-keyboard-wrapper').get(
                'pointer-events'
            )
        ).toBe('none')
        expect(
            declarationsOf('.composer-grid-pro-raised .composer-keyboard-wrapper > *').get(
                'pointer-events'
            )
        ).toBe('auto')
        //...and the canvas says "press me" on its own, in both views - which is why removing the
        //backdrop is the whole of the dismiss affordance: that div sat between the mouse and this
        //declaration with a `cursor: default` of its own.
        expect(declarationsOf('.canvas-relative canvas').get('cursor')).toBe('pointer !important')
        //there is no backdrop element left to cover anything
        expect(CSS_WITHOUT_COMMENTS).not.toContain('.composer-keyboard-backdrop')
        expect(COMPOSER).not.toContain('composer-keyboard-backdrop')
    })

    for (const viewport of VIEWPORTS) {
        for (const timelineHeight of TIMELINE_HEIGHTS) {
            const label = `${viewport.width}x${viewport.height}, timeline ${timelineHeight}px`

            it(`agrees with composerCanvasSize at ${label}`, () => {
                const css = composerCanvasCssSize({
                    inPreview: false,
                    proView: true,
                    rowHeightScale: 1,
                    timelineHeight,
                })
                if (!css) throw new Error('composerCanvasCssSize returned null outside preview')
                const context: CssContext = {
                    viewportWidth: viewport.width,
                    viewportHeight: viewport.height,
                    vars: {'--composer-canvas-height': css.height},
                }
                const js = composerCanvasSize({
                    bodyWidth: viewport.width,
                    bodyHeight: viewport.height,
                    inPreview: false,
                    proView: true,
                    timelineHeight,
                })
                const band = TIMELINE_BAND_PADDING * 2 + timelineHeight
                //THE FORMULA ITSELF, restated: the window, less the grid's padding and the sliver
                //band, less the strip's band - with the floor `max()` reproduces on the CSS side
                //(unlike nearestEven) so the two agree even where it engages.
                const expected = Math.max(2, viewport.height - PRO_INSET - band)
                expect(evaluateCss(css.height, context) - band).toBeCloseTo(expected, 6)
                expect(js.height).toBe(nearestEven(expected))

                //THE LAYOUT SHIFT, which is what the placeholder is for, exactly as above: the
                //wrapper is `max(floor, canvas)` before and after the canvas lands, and the pro
                //height beats the `45vh + 14px` floor on every viewport taller than ~81px.
                const jsCanvasHeight = composerCanvasElementHeight(js.height, timelineHeight)
                const placeholderHeight = evaluateCss(wrapper.get('min-height')!, context)
                expect(placeholderHeight).toBeCloseTo(viewport.height - PRO_INSET, 6)
                expect(
                    Math.abs(Math.max(placeholderHeight, jsCanvasHeight) - placeholderHeight)
                ).toBeLessThanOrEqual(1)

                //THE WIDTH IS THE COMPRESSED VIEW'S, UNTOUCHED. Pro View changes the composer's
                //vertical layout only - both side columns keep their widths - so the same body
                //width must give the same canvas width in either view, on both sides of the
                //desktop breakpoint.
                const compressed = composerCanvasSize({
                    bodyWidth: viewport.width,
                    bodyHeight: viewport.height,
                    inPreview: false,
                    timelineHeight,
                })
                expect(js.width).toBe(compressed.width)
                expect(css.mobileWidth).toBe(
                    composerCanvasCssSize({inPreview: false, timelineHeight})!.mobileWidth
                )
                expect(css.desktopWidth).toBe(
                    composerCanvasCssSize({inPreview: false, timelineHeight})!.desktopWidth
                )

                //...AND THE GAME'S ROW-HEIGHT SCALE DOES NOT APPLY. It shortens the Compressed
                //View's 45vh card so sky's rows are a little tighter; here it would only open a gap
                //under a canvas that is supposed to reach the sliver, and the Pro View derives its
                //row height from the region instead (proViewGeometry.proRowHeight).
                expect(
                    composerCanvasSize({
                        bodyWidth: viewport.width,
                        bodyHeight: viewport.height,
                        inPreview: false,
                        proView: true,
                        rowHeightScale: 0.95,
                        timelineHeight,
                    }).height
                ).toBe(js.height)
                expect(
                    composerCanvasCssSize({
                        inPreview: false,
                        proView: true,
                        rowHeightScale: 0.95,
                        timelineHeight,
                    })!.height
                ).toBe(css.height)
            })
        }
    }

    it('keeps the theme preview on the Compressed View, canvas and placeholder alike', () => {
        //A canvas sized to the WINDOW inside /theme's little composer box would overrun the page it
        //is previewed in, so `proView` is declined there on both sides - and the CSS side returns
        //null in preview regardless, which is what leaves that route on its old floors.
        expect(composerCanvasCssSize({inPreview: true, proView: true})).toBeNull()
        const preview = {bodyWidth: 1920, bodyHeight: 1080, inPreview: true, timelineHeight: 36.4}
        expect(composerCanvasSize({...preview, proView: true})).toEqual(
            composerCanvasSize(preview)
        )
        //...and ComposerCanvas.svelte is where that AND lives, once, so every consumer downstream -
        //the placeholder, the renderer's state, the geometry module's own branch - is handed the
        //same already-excluded flag
        expect(COMPOSER_CANVAS).toContain(
            'const proView = $derived(Boolean(settings.proView.value) && !inPreview);'
        )
    })

    it('puts the two regions at opposite ends of the same canvas, and tiles it either way', () => {
        //THE PRO VIEW'S LAYOUT IN FULL: the same canvas height, with the strip and the notes region
        //swapping places inside it. composerCanvasElementHeight takes no view for exactly that
        //reason, and these two are what say which end each region is at.
        const notesHeight = 500
        for (const timelineHeight of [36.4, 31.4]) {
            const canvas = composerCanvasElementHeight(notesHeight, timelineHeight)
            //compressed: notes from 0, strip below them - the formula the DOM button row used to
            //carry inline (`height + timelinePadding`)
            expect(composerNotesRegionY(false, timelineHeight)).toBe(0)
            expect(composerTimelineStripY(false, notesHeight)).toBe(
                notesHeight + TIMELINE_BAND_PADDING
            )
            //pro: strip at the top, notes region under its whole band
            expect(composerTimelineStripY(true, notesHeight)).toBe(TIMELINE_BAND_PADDING)
            expect(composerNotesRegionY(true, timelineHeight)).toBe(
                TIMELINE_BAND_PADDING * 2 + timelineHeight
            )
            //...and in BOTH views the two regions tile the canvas exactly, with neither overrunning
            //it: a strip drawn past the bottom edge is invisible, and a notes region that does it
            //silently loses its lowest rows
            for (const proView of [false, true]) {
                const notesY = composerNotesRegionY(proView, timelineHeight)
                const stripY = composerTimelineStripY(proView, notesHeight)
                expect(notesY + notesHeight).toBeLessThanOrEqual(canvas)
                expect(stripY + timelineHeight).toBeLessThanOrEqual(canvas)
                //disjoint: one starts where the other's band ends
                expect(proView ? stripY + timelineHeight <= notesY : notesY + notesHeight <= stripY).toBe(true)
            }
        }
    })

    it('remounts the canvas on a flip, because its size and every texture depend on it', () => {
        //A `{#key}` on BOTH settings, as one string. ComposerRenderer reads `proView` once, at
        //construction (like columnsPerCanvas), because a flip changes the canvas' size, the
        //ComposerCache's texture sizes and which end the strip is drawn at - none of which update()
        //re-derives. An array literal here would be a fresh identity on every evaluation, which is
        //not what `{#key}` compares.
        expect(COMPOSER).toContain('{#key `${settings.columnsPerCanvas.value}|${proView}`}')
        //...and the modifier class that reshapes the page around it, never in the preview
        expect(COMPOSER).toContain(`proView && 'composer-grid-pro',`)
        expect(COMPOSER).toContain(
            'const proView = $derived(Boolean(settings.proView.value) && !inPreview);'
        )
    })

    it('holds the canvas side buttons to the notes region, which has moved down under the strip', () => {
        //`.canvas-buttons` is `top: 0` in App.css, which is the notes region's top only in the
        //Compressed View. The inline `top` is the override, and it comes from the same function the
        //renderer places the region with rather than a second `proView ? ... : 0` in the template.
        expect(COMPOSER_CANVAS).toContain(
            'const notesTop = $derived(composerNotesRegionY(proView, timelineHeight));'
        )
        expect(declarationsOf('.canvas-buttons').get('top')).toBe('0')
        const chevrons = [...COMPOSER_CANVAS.matchAll(/style="height:\{height\}px;([^"]*)"/g)]
        expect(chevrons).toHaveLength(2)
        for (const chevron of chevrons) expect(chevron[1]).toContain('top:{notesTop}px;')
    })
})

describe('the desktop layout the canvas fills, and the chrome it fills around', () => {
    const DESKTOP = mediaBlock(COMPOSER_DESKTOP_MEDIA_QUERY)

    it('states the desktop breakpoint as the exact complement of the composer mobile block', () => {
        //Two queries, one boundary. `not all and (max-width: 1000px)` rather than
        //`(min-width: 1001px)` so no viewport - including a fractional one under browser zoom -
        //can fall between them and get the desktop base rules with none of either block's
        //overrides.
        expect(COMPOSER_DESKTOP_MEDIA_QUERY).toBe(`not all and (max-width: ${COMPOSER_MOBILE_MAX_WIDTH}px)`)
        expect(APP_CSS).toContain(`@media only screen and (max-width: ${COMPOSER_MOBILE_MAX_WIDTH}px) {`)
        expect(APP_CSS).toContain(`@media ${COMPOSER_DESKTOP_MEDIA_QUERY} {`)
        //...and the JS predicate ComposerRenderer reaches the same boundary through
        expect(isComposerDesktopWidth(COMPOSER_MOBILE_MAX_WIDTH)).toBe(false)
        expect(isComposerDesktopWidth(COMPOSER_MOBILE_MAX_WIDTH + 1)).toBe(true)
    })

    it('pins the sidebar open and takes away both controls that used to toggle it', () => {
        //What makes the sidebar a COLUMN rather than an overlay, and therefore what makes the
        //176px of fixed chrome below start with `--menu-size`. ComposerMenu.svelte pins the same
        //thing in state; this is the half that holds before hydration.
        expect(DESKTOP).toContain('.composer-menu-sidebar .menu {\n    margin-left: 0;\n  }')
        expect(DESKTOP).toMatch(
            /\.composer-menu-sidebar \.hamburger,\s*\.composer-menu-sidebar \.close-menu \{\s*display: none;/
        )
    })

    it('pushes the grid and the keyboard clear of the sidebar, by the same two terms', () => {
        //The canvas is sized to fill what is LEFT of the window, so the row it sits in has to start
        //where the sidebar ends plus the gap - `85vw` used to leave room for an overlay instead.
        //Both offsets are `--menu-size + DESKTOP_SIDEBAR_GAP_REM`, and the keyboard's width gives
        //back exactly what its `left` took, so it stays centred on the composer rather than on the
        //window.
        expect(DESKTOP).toMatch(
            /\.composer-grid:not\(\.composer-grid-in-preview\) \{\s*margin-left: calc\(var\(--menu-size\) \+ 0\.1rem\);\s*margin-right: auto;/
        )
        expect(DESKTOP).toContain('left: calc(var(--menu-size) + 0.1rem);')
        expect(DESKTOP).toContain('width: calc(100% - var(--menu-size) - 0.1rem);')
    })

    it('still declares every value DESKTOP_CANVAS_INSET_PX is the sum of', () => {
        //THE SECOND BRIDGE between this stylesheet and composerCanvasGeometry (the timeline
        //buttons' rem values are the first). The desktop canvas is `100vw` less `.tool`'s own
        //column and less these fixed widths; edit any of them alone and the canvas either
        //overflows the window or leaves a gap at its right edge, with nothing else failing.
        expect(declarationsOf(':root', '--menu-size').get('--menu-size')).toBe('4rem')
        const grid = declarationsOf('.composer-grid')
        expect(grid.get('padding')).toBe('0.2rem')
        expect(grid.get('gap')).toBe('0.2rem')
        expect(declarationsOf('.composer-left-control').get('width')).toBe('6.2rem')
        const rightButtons = declarationsOf(
            '.buttons-composer-wrapper,\n.buttons-composer-wrapper-right'
        )
        expect(rightButtons.get('margin-left')).toBe('0.2rem')
        //...and the ONE non-fixed term, which is why the desktop width is 96vw and not 100vw.
        //`mustDeclare` skips the `.tool-slim, .tool` rule that shares this selector and carries
        //only the shape/colour the two buttons have in common.
        expect(declarationsOf('.tool', 'width').get('width')).toBe('4vw')
        //...and the gap between the sidebar and the composer, the one term of the sum that is not a
        //pre-existing width but a deliberate piece of spacing (asserted in full above)
        expect(DESKTOP).toContain('+ 0.1rem)')
        //the sum, at the 16px root font size composerCanvasGeometry assumes and states
        expect((4 + 0.1 + 0.2 * 2 + 6.2 + 0.2 + 0.2) * 16).toBeCloseTo(177.6, 6)
    })

    it('leaves the mobile layout on the formula and the chrome it always had', () => {
        //The whole point of the exclusion: below the breakpoint App.css reshapes this row
        //completely (the left control narrows, `.tool` goes full-width, `.composer-grid` takes the
        //whole window) and none of the numbers above hold there - so the canvas keeps `85vw - 45`.
        const mobile = mediaBlock(`only screen and (max-width: ${COMPOSER_MOBILE_MAX_WIDTH}px)`)
        expect(mobile).toContain('.composer-left-control {\n    width: 5.4rem;\n  }')
        expect(mobile).toMatch(/\.tool \{\s*flex: 1;\s*width: 100%;/)
        expect(mobile).toContain('.composer-grid {\n    width: 100%;\n  }')
        expect(composerCanvasCssSize({inPreview: false})?.mobileWidth).toBe('calc(85vw - 45px)')
    })
})

describe("the timeline buttons' declared size and the inset the strip is drawn at", () => {
    const button = declarationsOf('.timeline-button')
    const controls = declarationsOf('.timeline-controls')
    const separator = declarationsOf('.timeline-controls::before')

    it('App.css still declares the rem values composerCanvasGeometry converts', () => {
        //THE ONLY BRIDGE between the stylesheet and the pixi side. The renderer draws its strip
        //inside `TIMELINE_INSET_LEFT..width - TIMELINE_INSET_RIGHT`, which is where these
        //declarations put the three buttons; edit either side alone and they overlap.
        expect(button.get('width')).toBe('2.2rem')
        expect(controls.get('padding')).toBe('0.2rem')
        expect(controls.get('gap')).toBe('0.2rem')
        //...at the 16px root font size composerCanvasGeometry assumes and states
        expect(TIMELINE_BUTTON_SIZE).toBe(2.2 * 16)
        expect(TIMELINE_BUTTON_MARGIN).toBe(0.2 * 16)
        //no shrink, or the browser would narrow the buttons out from under a strip that is inset by
        //a fixed 121.6px whatever the row is
        expect(button.get('flex-shrink')).toBe('0')
    })

    it('the two insets are the two bands the three buttons stand on', () => {
        //left: leading padding + button + gap + button + trailing padding
        expect(TIMELINE_INSET_LEFT).toBe(80)
        //right: gap + button + trailing padding; `margin-left: auto` absorbs the free space before it
        expect(TIMELINE_INSET_RIGHT).toBe(41.6)
        expect(TIMELINE_INSET_LEFT + TIMELINE_INSET_RIGHT).toBe(121.6)
        //No vertical dead band remains; its former 6.4px total is included in the timeline heights.
        expect(TIMELINE_BAND_PADDING).toBe(0)
        expect(36.4 - 30).toBeCloseTo(TIMELINE_BUTTON_MARGIN * 2, 6)
    })

    it('draws a dark full-width separator above the canvas and its opaque buttons', () => {
        expect(separator.get('inset')).toBe('0 0 auto')
        expect(separator.get('height')).toBe('1px')
        expect(separator.get('z-index')).toBe('1')
        expect(separator.get('background-color')).toBe('var(--primary-darken-10)')
        expect(separator.get('pointer-events')).toBe('none')
    })
})

describe('the inline styles in ComposerCanvas.svelte that both couplings actually run through', () => {
    const wrapper = declarationsOf('.canvas-wrapper')

    it('puts composerCanvasCssSize on .canvas-wrapper under the names App.css reads', () => {
        //THE MISSING LINK OF A THREE-LINK CHAIN. The two tests above pin App.css against
        //composerCanvasGeometry; composerCanvasCssSize has exactly one production caller, and it is
        //this element. Delete the two directives - or typo either property name on one side only -
        //and `var(..., 0px)` takes over: the wrapper silently reverts to `78vw`/`calc(45vh + 14px)`
        //and the whole +90.4px/+22.4px jump at 1920x1080 comes back, with every other test green.
        const names = [
            wrapper.get('--composer-canvas-width')!,
            wrapper.get('min-height')!,
        ].map(declaration => {
            const found = /var\(\s*(--[A-Za-z0-9-]+)/.exec(declaration)
            if (!found) throw new Error(`\`${declaration}\` reads no custom property`)
            return found[1]
        })
        expect(names).toEqual(['--composer-canvas-width-mobile', '--composer-canvas-height'])
        const tag = openTagContaining(`'canvas-wrapper'`)
        expect(tag).toContain(`style:${names[0]}={cssSize?.mobileWidth}`)
        expect(tag).toContain(`style:${names[1]}={cssSize?.height}`)
        //BOTH widths, or the desktop block's `var(--composer-canvas-width-desktop, 0px)` resolves
        //to its 0px fallback and every desktop viewport silently drops to the `78vw` floor
        expect(tag).toContain('style:--composer-canvas-width-desktop={cssSize?.desktopWidth}')
        //...and `cssSize` is the geometry module's, not a second formula written in the template.
        //`proView` chooses the HEIGHT expression inside it (the Pro View canvas fills the window);
        //both widths are still emitted either way, which is what the assertion above covers.
        expect(COMPOSER_CANVAS).toContain(
            'const cssSize = $derived(composerCanvasCssSize({ inPreview: Boolean(inPreview), proView }));'
        )
        //NO BREAKPOINT IN THE TEMPLATE. The component emitting one width from a `matchMedia` read
        //is what caused the 79px jump at hydration: a prerender has no `matchMedia`, so the served
        //HTML carried the mobile width on every viewport.
        expect(COMPOSER_CANVAS).not.toContain('createMediaQuery')
    })

    it('places the three timeline buttons in the bands the insets reserve', () => {
        //Padding and gap establish the left band's fixed footprint. The third button's `auto`
        //margin is the one inline position that matters: dropping it packs all three buttons at the
        //left, over the strip's first 35.2px. The middle button's zero is retained but neutral now
        //that spacing belongs to the parent rather than per-button margins.
        const controls = COMPOSER_CANVAS.slice(
            COMPOSER_CANVAS.indexOf('class="timeline-controls"')
        )
        const styles = [...controls.matchAll(/\n\s*style="([^"]*)"/g)].map(match => match[1])
        expect(styles).toEqual([
            //the overlay itself, held to the CANVAS box rather than to the wrapper: all three
            //numbers come from the renderer's geometry report, which is the only channel that knows
            //where the strip band starts and how tall it is - `timelineTop` because WHICH END of
            //the canvas the strip is at is the Pro View's one layout difference here, and the
            //renderer is the side that placed it (composerTimelineStripY)
            'top:{timelineTop}px;width:{width}px;height:{timelineHeight}px',
            'background-color:{timelineHex}',
            'margin-left:0;background-color:{timelineHex}',
            'margin-left:auto;background-color:{timelineHex}',
        ])
    })

    it('backs the buttons with the alpha-STRIPPED theme layer, not the CSS custom property', () => {
        //`--primary-layer-10` is the same colour with the theme's alpha still on it - ThemeVars
        //emits it through `.toString()`, and `ThemeProvider.layer` is lighten/darken, both of which
        //preserve alpha. These buttons must be opaque: the strip they used to sit on has been inset
        //out from under them, so behind them is the canvas element (itself composited at
        //`max(primary.alpha, 0.8)`) and through it the page - on "Sky Music" (alpha 0.72) the
        //alpha-preserving form would leak 5.6% of the backdrop through each icon, on "Eons of times"
        //(0.85) 2.2%. `.hex()` drops it, which is what these buttons carried before the two canvases
        //were merged and what ComposerRenderer fills the strip with (`.rgb().rgbNumber()`).
        expect(COMPOSER_CANVAS).toContain(
            `const timelineHex = $derived(ThemeProvider.layer('primary', 0.1).hex());`
        )
        //...and App.css must not put one back, which would win for any button whose inline style is
        //ever dropped and would do it in the alpha-preserving form
        expect(declarationsOf('.timeline-button').get('background-color')).toBeUndefined()
    })
})
