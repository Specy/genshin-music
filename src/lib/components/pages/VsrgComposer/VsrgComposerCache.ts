// Old: src/components/pages/VsrgComposer/VsrgComposerCache.ts (458 lines) - `VsrgCanvasCache`
// ports AS-IS per spec section 6.2 (every Graphics call, Rectangle and
// app.renderer.generateTexture frame computation kept at parity, incl. the `destroy()` texture
// teardown). This file has NO game-dependent data at all (unlike ComposerCache.ts) - every value
// it needs (`colors`, `sizes`, `trackColors`, `isHorizontal`, `playbarOffset`) arrives via its own
// constructor props, so there is no `$config`/`$game` import to swap here. Only import changes:
// - `$lib/utils/Utilities` -> `$core/utils/Utilities` (`clamp`).
// - `is-mobile`: old used the default import (`import isMobile from "is-mobile"`); this port uses
//   the NAMED import (`import {isMobile} from 'is-mobile'`), matching the established convention
//   (ComposerRenderer.ts, AppInit.svelte, BaseSettings.ts, GlobalConfigStore.svelte.ts).
// - `VsrgCanvasColors`/`VsrgCanvasSizes` now come from `./VsrgComposerRenderer` (old's six-file
//   VsrgComposerCanvas.tsx + VsrgKeysRenderer.tsx + VsrgScrollableTrackRenderer.tsx +
//   VsrgTrackRenderer.tsx + VsrgTimelineRenderer.tsx + VsrgTimelineBreakpointsRenderer.tsx collapse
//   into that ONE renderer file this same task - see its header comment) instead of
//   `./VsrgComposerCanvas`; this is a type-only import so the mutual reference back (that file
//   imports the `VsrgCanvasCache` VALUE from here) stays a compile-time-only cycle, same shape old
//   already had between VsrgComposerCache.ts and VsrgComposerCanvas.tsx.
import Color from "color"
import { Application, Graphics, Rectangle, Texture, } from 'pixi.js'
import type { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerRenderer";
import { clamp } from "$core/utils/Utilities";
import { isMobile } from "is-mobile";

interface VsrgCacheProps {
    app: Application
    colors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    trackColors: string[]
    isHorizontal: boolean
    playbarOffset: number
}

export type VsrgComposerCanvasCache = {
    snapPoints: {
        size: number
        small: Texture | null
        large: Texture | null
        empty: Texture | null
    }
    buttons: {
        width: number
        height: number
        time: Texture | null
    }
    timeline: {
        currentTime: Texture | null
        breakpoint: Texture | null
        note: Texture | null
        square: Texture | null
        thumb: Texture | null
    }
    sizes: {
        hitObject: number
        trail: number
    }
    selectionRings: {
        [key: string]: Texture
    }
    hitObjects: {
        [key: string]: Texture
    }
    heldHitObjects: {
        [key: string]: Texture
    }
    trails: {
        [key: string]: Texture
    }
}

export class VsrgCanvasCache {
    textures: VsrgComposerCanvasCache
    app: Application | null
    playbarOffset: number
    isMobile: boolean = false
    colors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    trackColors: string[]
    isHorizontal: boolean

    constructor({
        app,
        colors,
        sizes,
        trackColors,
        isHorizontal,
        playbarOffset
    }: VsrgCacheProps) {

        this.textures = {
            hitObjects: {},
            heldHitObjects: {},
            selectionRings: {},
            trails: {},
            buttons: {
                width: 0,
                height: 0,
                time: null
            },
            snapPoints: {
                size: 0,
                small: null,
                large: null,
                empty: null
            },
            timeline: {
                breakpoint: null,
                currentTime: null,
                note: null,
                square: null,
                thumb: null
            },
            sizes: {
                hitObject: 0,
                trail: 0
            }
        }
        this.trackColors = trackColors
        this.colors = colors
        this.isHorizontal = isHorizontal
        this.playbarOffset = playbarOffset
        this.sizes = sizes
        this.app = app
        this.generate()
    }

    destroy = () => {
        this.textures.snapPoints.small?.destroy(true)
        this.textures.snapPoints.large?.destroy(true)
        this.textures.snapPoints.empty?.destroy(true)
        Object.values(this.textures.hitObjects).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.heldHitObjects).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.trails).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.selectionRings).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.timeline).forEach(texture => texture?.destroy(true))
        this.textures.buttons.time?.destroy(true)
        this.app = null
    }

    generate() {
        const { app } = this
        if (!app) return
        this.isMobile = isMobile()
        this.generateSnapPoints(app)
        this.generateTrackCache(app)
        this.generateTrails(app)
        this.generateSelectionRings(app)
        this.generateOthers(app)
    }

    getHitObjectCache(color: string) {
        return this.textures.hitObjects[color] || this.textures.hitObjects['#FF0000']
    }

    getHeldTrailCache(color: string) {
        return this.textures.trails[color] || this.textures.trails['#FF0000']
    }

    getHeldHitObjectCache(color: string) {
        return this.textures.heldHitObjects[color] || this.textures.heldHitObjects['#FF0000']
    }

    getSelectionRingsCache(color: string) {
        return this.textures.selectionRings[color] || this.textures.selectionRings['#FF0000']
    }

    generateOthers(app: Application) {
        const { sizes, colors, isHorizontal } = this
        //timeline
        const square = new Graphics()
        square.rect(0, 0, this.sizes.width, this.sizes.timelineSize)
            .fill({ color: this.colors.background_plain[1] })
        square.moveTo(0, sizes.timelineSize)
            .lineTo(this.sizes.width, sizes.timelineSize)
            .stroke({ width: 3, color: this.colors.secondary[1], alpha: 1 })
        const squareTexture = app.renderer.generateTexture({
            target: square,
            resolution: 1,
            frame: new Rectangle(0, 0, this.sizes.width, this.sizes.timelineSize),
            textureSourceOptions: { scaleMode: 'linear' }
        })

        this.textures.timeline.square = squareTexture
        const margin = isHorizontal ? sizes.height / 16 : sizes.width / 16

        const thumbSize = clamp(sizes.timelineSize / 4, 8, 100)
        const thumb = new Graphics()

        // Top triangle group: two triangles sharing one fill
        thumb.moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, thumbSize)
            .lineTo(0, 0)
        thumb.moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, -thumbSize)
            .lineTo(0, 0)
        thumb.fill({ color: colors.accent[1] })

        // Vertical line through thumb
        thumb.moveTo(thumbSize / 2, 0)
            .lineTo(thumbSize / 2, sizes.timelineSize)
            .stroke({ width: 3, color: colors.accent[1], alpha: 1 })

        // Bottom triangle group: two degenerate/collapsed triangles + two real triangles
        thumb.moveTo(0, sizes.timelineSize)
            .lineTo(thumbSize, sizes.timelineSize)
            .lineTo(thumbSize / 2, sizes.timelineSize)
            .lineTo(0, sizes.timelineSize)
        thumb.moveTo(0, sizes.timelineSize)
            .lineTo(thumbSize, sizes.timelineSize)
            .lineTo(thumbSize / 2, sizes.timelineSize - thumbSize)
            .lineTo(0, sizes.timelineSize)
        thumb.fill({ color: colors.accent[1] })

        const noteSize = sizes.timelineSize / 2
        const note = new Graphics()

        note.circle(sizes.timelineSize / 2 + 1, sizes.timelineSize / 2, noteSize / 2)
            .stroke({ width: this.isMobile ? 2 : 3, color: colors.secondary[1], alpha: 1 })
        const noteTexture = app.renderer.generateTexture({
            target: note,
            resolution: 1,
            frame: new Rectangle(0, 0, sizes.timelineSize, sizes.timelineSize),
            textureSourceOptions: { scaleMode: 'linear' }
        })
        this.textures.timeline.note = noteTexture
        const currentTime = new Graphics()

        currentTime.moveTo(0, 0)
            .lineTo(0, sizes.timelineSize)
            .stroke({ width: 12, color: colors.accent[1], alpha: 1 })
        const currentTimeTexture = app.renderer.generateTexture({
            target: currentTime,
            resolution: 1,
            frame: new Rectangle(0, 0, 12, sizes.timelineSize),
            textureSourceOptions: { scaleMode: 'linear' }
        })
        this.textures.timeline.currentTime = currentTimeTexture
        const thumbTexture = app.renderer.generateTexture({
            target: thumb,
            resolution: 2,
            frame: new Rectangle(0, 0, thumbSize, sizes.timelineSize),
            textureSourceOptions: { scaleMode: 'linear' }
        })

        this.textures.timeline.thumb = thumbTexture

        const breakpoint = new Graphics()
        breakpoint.moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, thumbSize)
            .lineTo(0, 0)
        breakpoint.moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, -thumbSize)
            .lineTo(0, 0)
        breakpoint.fill({ color: colors.accent[1] })

        const breakpointTexture = app.renderer.generateTexture({
            target: breakpoint,
            resolution: 1,
            frame: new Rectangle(0, 0, thumbSize, thumbSize),
            textureSourceOptions: { scaleMode: 'linear' }
        })
        this.textures.timeline.breakpoint = breakpointTexture
        //buttons
        const time = new Graphics()

        if (isHorizontal) {
            time.roundRect(margin / 2, margin / 2, sizes.width / 2 - margin, sizes.height / 2 - margin, 16)
                .fill({ color: colors.background_10[1] })
            const timeTexture = app.renderer.generateTexture({
                target: time,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.width / 2, sizes.height / 2),
                textureSourceOptions: { scaleMode: 'linear' }
            })
            this.textures.buttons.width = sizes.width / 2
            this.textures.buttons.height = sizes.height / 2
            this.textures.buttons.time = timeTexture
        } else {
            time.roundRect(margin / 2, margin / 2, sizes.width / 2 - margin, sizes.height / 3 - margin, 8)
                .fill({ color: colors.background_10[1] })
            const timeTexture = app.renderer.generateTexture({
                target: time,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.width / 2, sizes.height / 3),
                textureSourceOptions: { scaleMode: 'linear' }
            })
            this.textures.buttons.width = sizes.width / 2
            this.textures.buttons.height = sizes.height / 3
            this.textures.buttons.time = timeTexture
        }
        square.destroy(true)
        thumb.destroy(true)
        note.destroy(true)
        currentTime.destroy(true)
        breakpoint.destroy(true)
        time.destroy(true)
    }


    generateTrails(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = clamp(sizes.keyHeight / 2 * sizes.scaling, sizes.keyHeight / (this.isMobile ? 3 : 4), 100)
        const margin = hitObjectHeight / 2
        withError.forEach(color => {
            const trail = new Graphics()
            if (this.isHorizontal) {
                trail.rect(0, margin / 2, hitObjectHeight, hitObjectHeight - margin)
                    .fill({ color: Color(color).rgb().rgbNumber() })
            } else {
                trail.rect(margin / 2, 0, hitObjectHeight - margin, hitObjectHeight)
                    .fill({ color: Color(color).rgb().rgbNumber() })
            }
            const trailTexture = app.renderer.generateTexture({
                target: trail,
                resolution: 1,
                frame: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.trails[color] = trailTexture
        })
        this.textures.sizes.trail = hitObjectHeight
    }

    generateSelectionRings(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = clamp(sizes.keyHeight / 1.5 * sizes.scaling, sizes.keyHeight / (this.isMobile ? 1.2 : 2), 150)
        withError.forEach(color => {
            const ring = new Graphics()
            ring.circle(hitObjectHeight / 2, hitObjectHeight / 2, hitObjectHeight / 2 - 3)
                .stroke({ width: 3, color: Color(color).rgb().rgbNumber() })
            const ringTexture = app.renderer.generateTexture({
                target: ring,
                resolution: 1,
                frame: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.selectionRings[color] = ringTexture
            ring.destroy(true)
        })
    }

    generateTrackCache(app: Application) {
        const { colors, sizes, trackColors } = this
        const hitObjectHeight = clamp(sizes.keyHeight / 1.8 * sizes.scaling, sizes.keyHeight / (this.isMobile ? 2 : 3.5), 100)
        const withError = [...trackColors, '#FF0000']
        withError.forEach(color => {
            const hitObject = new Graphics()
            const circleSize = hitObjectHeight / 2
            hitObject.circle(circleSize, circleSize, circleSize - 5)
                .fill({ color: colors.background_10[1] })
                .stroke({ width: 5, color: Color(color).rgb().rgbNumber() })
            const texture = app.renderer.generateTexture({
                target: hitObject,
                resolution: 2,
                frame: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.hitObjects[color] = texture
            hitObject.destroy(true)

            const heldHitObject = new Graphics()
            const diamondSize = hitObjectHeight * 0.7
            const margin = (hitObjectHeight - diamondSize) / 2
            heldHitObject.width = diamondSize
            heldHitObject.height = diamondSize
            heldHitObject.roundRect(margin, margin, diamondSize, diamondSize, 6)
                .fill({ color: colors.background_10[1] })
                .stroke({ width: 5, color: Color(color).rgb().rgbNumber() })
            const heldTexture = app.renderer.generateTexture({
                target: heldHitObject,
                resolution: 2,
                frame: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.heldHitObjects[color] = heldTexture
            heldHitObject.destroy(true)
        })
        this.textures.sizes.hitObject = hitObjectHeight

    }

    generateSnapPoints(app: Application) {
        const { colors, sizes, isHorizontal, playbarOffset } = this
        const small = new Graphics()
        const large = new Graphics()
        const empty = new Graphics()
        if (isHorizontal) {
            small.moveTo(0, 0)
                .lineTo(0, sizes.height)
                .stroke({ width: 2, color: colors.lineColor[1] })
            const smallTexture = app.renderer.generateTexture({
                target: small,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            large.moveTo(0, 0)
                .lineTo(0, sizes.height)
                .stroke({ width: 4, color: colors.secondary[1] })
            const largeTexture = app.renderer.generateTexture({
                target: large,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            const lines = 10
            const lineSize = sizes.height / lines
            for (let i = 0; i < lines + 2; i++) {
                const size = lineSize * i - lineSize
                const y1 = size
                empty.moveTo(playbarOffset, y1)
                empty.lineTo(0, y1 + lineSize)
            }
            empty.stroke({ width: 2, color: colors.secondary[1] })
            const emptyTexture = app.renderer.generateTexture({
                target: empty,
                resolution: 1,
                frame: new Rectangle(0, 0, playbarOffset, sizes.height),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.snapPoints.size = sizes.snapPointWidth
            this.textures.snapPoints.small = smallTexture
            this.textures.snapPoints.large = largeTexture
            this.textures.snapPoints.empty = emptyTexture
        } else {
            small.moveTo(0, sizes.snapPointWidth)
                .lineTo(sizes.width, sizes.snapPointWidth)
                .stroke({ width: 2, color: colors.lineColor[1] })
            const smallTexture = app.renderer.generateTexture({
                target: small,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth),
                textureSourceOptions: { scaleMode: 'linear' }
            });

            large.moveTo(0, sizes.snapPointWidth)
                .lineTo(sizes.width, sizes.snapPointWidth)
                .stroke({ width: 4, color: colors.secondary[1] })
            const largeTexture = app.renderer.generateTexture({
                target: large,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            const lines = 20
            const lineSize = sizes.width / lines
            for (let i = 0; i < lines + 2; i++) {
                const size = lineSize * i - lineSize
                const y1 = size
                empty.moveTo(y1, playbarOffset)
                empty.lineTo(y1 + lineSize, 0)
            }
            empty.stroke({ width: 2, color: colors.secondary[1] })
            const emptyTexture = app.renderer.generateTexture({
                target: empty,
                resolution: 1,
                frame: new Rectangle(0, 0, sizes.width, playbarOffset),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.snapPoints.size = sizes.snapPointWidth
            this.textures.snapPoints.large = largeTexture
            this.textures.snapPoints.empty = emptyTexture
            this.textures.snapPoints.small = smallTexture

        }
        small.destroy(true)
        large.destroy(true)
        empty.destroy(true)
    }
}
