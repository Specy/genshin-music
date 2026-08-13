/**
 * THE COMPOSER CANVAS' STYLESHEET COUPLINGS, each of which is one formula written down twice.
 *
 *  1. `.canvas-wrapper`'s `min-width`/`min-height` vs ComposerRenderer.computeCanvasSize. The canvas
 *     arrives hundreds of ms after the page does (a dynamic pixi import, then Application.init), so
 *     the wrapper has to be the canvas' size in CSS before the canvas exists or the page jumps when
 *     it loads. composerCanvasGeometry emits that size as two custom properties and App.css maxes
 *     them against its original floors; this file evaluates THOSE DECLARATIONS, with those
 *     properties, and checks the result against the JS the renderer actually sizes itself with.
 *  2. `.timeline-button`'s `width: 2.2rem` / `margin: 0.2rem` vs TIMELINE_BUTTON_SIZE/MARGIN, which
 *     is what ComposerRenderer derives TIMELINE_INSET_LEFT/RIGHT from - the two ends of the canvas
 *     it holds the mini-timeline strip clear of, so that the buttons and the strip do not overlap.
 *  3. ComposerCanvas.svelte's own INLINE STYLES, which are the third link of both chains and were
 *     the one link nothing read. The stylesheet and the geometry module agreeing buys nothing if the
 *     component never puts the custom properties on the element, or if the two `margin-left`
 *     overrides that make the buttons' footprint 80px/41.6px are dropped in a refactor - both of
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
    TIMELINE_BAND_PADDING,
    TIMELINE_BUTTON_MARGIN,
    TIMELINE_BUTTON_SIZE,
    TIMELINE_INSET_LEFT,
    TIMELINE_INSET_RIGHT,
    composerCanvasCssSize,
    composerCanvasElementHeight,
    composerCanvasSize,
} from '$cmp/pages/Composer/composerCanvasGeometry'

//repo-relative, like test/midiConstructor.test.ts's own fixture read - vitest runs from the root
const APP_CSS = readFileSync('src/lib/css/App.css', 'utf8')
const COMPOSER_CANVAS = readFileSync(
    'src/lib/components/pages/Composer/ComposerCanvas.svelte',
    'utf8'
)

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
 */
function declarationsOf(selector: string): Map<string, string> {
    const start = CSS_WITHOUT_COMMENTS.indexOf(`\n${selector} {`)
    if (start < 0) throw new Error(`src/lib/css/App.css has no top-level \`${selector}\` rule`)
    const open = CSS_WITHOUT_COMMENTS.indexOf('{', start)
    const close = CSS_WITHOUT_COMMENTS.indexOf('}', open)
    if (close < 0) throw new Error(`\`${selector}\` is never closed`)
    const declarations = new Map<string, string>()
    for (const piece of CSS_WITHOUT_COMMENTS.slice(open + 1, close).split(';')) {
        const colon = piece.indexOf(':')
        if (colon < 0) continue
        declarations.set(piece.slice(0, colon).trim(), piece.slice(colon + 1).trim())
    }
    return declarations
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
        {width: 900, height: 700},
        {width: 643, height: 900},
        {width: 400, height: 800},
        {width: 360, height: 640},
    ]
    //genshin and sky's game.json `composerRowHeightScale`, and the desktop/mobile timeline heights.
    //Both are build- or UA-time values one run cannot vary on its own, so they are passed in.
    const ROW_HEIGHT_SCALES = [1, 0.95]
    const TIMELINE_HEIGHTS = [30, 25]

    for (const viewport of VIEWPORTS) {
        for (const rowHeightScale of ROW_HEIGHT_SCALES) {
            for (const timelineHeight of TIMELINE_HEIGHTS) {
                const label =
                    `${viewport.width}x${viewport.height}, scale ${rowHeightScale},` +
                    ` timeline ${timelineHeight}px`

                it(`agrees with computeCanvasSize at ${label}`, () => {
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
                            '--composer-canvas-width': css.width,
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
                    //or 0.45 in composerCanvasGeometry fails instead of moving both sides together
                    expect(evaluateCss(css.width, context)).toBeCloseTo(
                        viewport.width * 0.85 - 45,
                        6
                    )
                    expect(
                        evaluateCss(css.height, context) -
                            (TIMELINE_BAND_PADDING * 2 + timelineHeight)
                    ).toBeCloseTo(viewport.height * 0.45 * rowHeightScale, 6)

                    //...and EXACTLY the renderer's width once rounded, which is the only thing the
                    //CSS cannot reproduce (nearestEven; see composerCanvasCssSize for why not
                    //`round(nearest, x, 2px)`)
                    expect(nearestEven(evaluateCss(css.width, context))).toBe(js.width)

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
        const css = composerCanvasCssSize({inPreview: false, rowHeightScale: 0.95, timelineHeight: 30})
        if (!css) throw new Error('composerCanvasCssSize returned null outside preview')
        context.vars['--composer-canvas-height'] = css.height
        const js = composerCanvasSize({
            bodyWidth: 2560,
            bodyHeight: 1440,
            inPreview: false,
            rowHeightScale: 0.95,
        })
        const canvasHeight = composerCanvasElementHeight(js.height, 30)
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

describe("the timeline buttons' declared size and the inset the strip is drawn at", () => {
    const button = declarationsOf('.timeline-button')

    it('App.css still declares the rem values composerCanvasGeometry converts', () => {
        //THE ONLY BRIDGE between the stylesheet and the pixi side. The renderer draws its strip
        //inside `TIMELINE_INSET_LEFT..width - TIMELINE_INSET_RIGHT`, which is where these two
        //declarations put the three buttons' margin boxes; edit either alone and they overlap.
        expect(button.get('width')).toBe('2.2rem')
        expect(button.get('margin')).toBe('0.2rem')
        //...at the 16px root font size composerCanvasGeometry assumes and states
        expect(TIMELINE_BUTTON_SIZE).toBe(2.2 * 16)
        expect(TIMELINE_BUTTON_MARGIN).toBe(0.2 * 16)
        //no shrink, or the browser would narrow the buttons out from under a strip that is inset by
        //a fixed 121.6px whatever the row is
        expect(button.get('flex-shrink')).toBe('0')
    })

    it('the two insets are the two bands the three buttons stand on', () => {
        //left: margin + button + margin + button + margin (the middle button carries
        //`margin-left: 0` inline, so there is ONE margin between the two and not two)
        expect(TIMELINE_INSET_LEFT).toBe(80)
        //right: clearance + button + margin. Not that button's margin box, though it is the same
        //width: `margin-left: auto` absorbs the row's whole free space, so its margin box runs from
        //TIMELINE_INSET_LEFT to the right edge and the leading 0.2rem here is the gap the auto
        //margin leaves in front of it rather than a declared margin.
        expect(TIMELINE_INSET_RIGHT).toBe(41.6)
        expect(TIMELINE_INSET_LEFT + TIMELINE_INSET_RIGHT).toBe(121.6)
        //the band above and below the strip is the same 0.2rem, which is why the buttons'
        //`height: 100%` plus their vertical margins exactly fills it
        expect(TIMELINE_BAND_PADDING).toBe(TIMELINE_BUTTON_MARGIN)
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
        const names = [wrapper.get('min-width')!, wrapper.get('min-height')!].map(declaration => {
            const found = /var\(\s*(--[A-Za-z0-9-]+)/.exec(declaration)
            if (!found) throw new Error(`\`${declaration}\` reads no custom property`)
            return found[1]
        })
        expect(names).toEqual(['--composer-canvas-width', '--composer-canvas-height'])
        const tag = openTagContaining(`'canvas-wrapper'`)
        expect(tag).toContain(`style:${names[0]}={cssSize?.width}`)
        expect(tag).toContain(`style:${names[1]}={cssSize?.height}`)
        //...and `cssSize` is the geometry module's, not a second formula written in the template
        expect(COMPOSER_CANVAS).toContain(
            'const cssSize = $derived(composerCanvasCssSize({ inPreview: Boolean(inPreview) }));'
        )
    })

    it('gives the three timeline buttons exactly the margins the insets are derived from', () => {
        //TIMELINE_INSET_LEFT is `MARGIN * 3 + SIZE * 2` and not `MARGIN * 4 + SIZE * 2` only because
        //the middle button zeroes its left margin here, and TIMELINE_INSET_RIGHT is a band at the
        //ROW'S RIGHT EDGE only because the third button's left margin is `auto`. Neither is declared
        //in App.css, and dropping either passed the entire suite before this test: the first makes
        //the left band 83.2px while the renderer still draws and hit-tests from 80, the second packs
        //all three buttons at the left, over the strip's first 35.2px.
        const controls = COMPOSER_CANVAS.slice(
            COMPOSER_CANVAS.indexOf('class="timeline-controls"')
        )
        const styles = [...controls.matchAll(/\n\s*style="([^"]*)"/g)].map(match => match[1])
        expect(styles).toEqual([
            //the overlay itself, held to the CANVAS box rather than to the wrapper: all three
            //numbers come from the renderer's geometry report, which is the only channel that knows
            //where the strip band starts and how tall it is
            'top:{height + timelinePadding}px;width:{width}px;height:{timelineHeight}px',
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
