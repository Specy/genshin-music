import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerCanvas";
import { clamp } from "$lib/Utilities";
import { PLAY_BAR_OFFSET } from "$/appConfig";
import isMobile from "is-mobile";

settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL

interface VsrgCacheProps {
    app: Application
    colors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    trackColors: string[]
    isHorizontal: boolean
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
    colors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    trackColors: string[]
    isHorizontal: boolean
    constructor({
        app,
        colors,
        sizes,
        trackColors,
        isHorizontal
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
        this.sizes = sizes
        this.app = app
        this.generate()
    }
    destroy = () => {
        this.textures.snapPoints.small?.destroy()
        this.textures.snapPoints.large?.destroy()
        this.textures.snapPoints.empty?.destroy()
        Object.values(this.textures.hitObjects).forEach(texture => texture?.destroy())
        Object.values(this.textures.heldHitObjects).forEach(texture => texture?.destroy())
        Object.values(this.textures.trails).forEach(texture => texture?.destroy())
        Object.values(this.textures.selectionRings).forEach(texture => texture?.destroy())
        Object.values(this.textures.timeline).forEach(texture => texture?.destroy())
        this.textures.buttons.time?.destroy()

        this.app = null
    }
    generate() {
        const { app } = this
        if (!app) return
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
        square.beginFill(this.colors.background_plain[1])
            .drawRect(0, 0, this.sizes.width, this.sizes.timelineSize)
            .lineStyle(3, this.colors.secondary[1], 1)
            .moveTo(0, sizes.timelineSize)
            .lineTo(this.sizes.width, sizes.timelineSize)
        const squareTexture = app.renderer.generateTexture(square, {
            resolution: 1,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, this.sizes.width, this.sizes.timelineSize)
        })
        this.textures.timeline.square = squareTexture
        const margin = isHorizontal ? sizes.height / 16 : sizes.width / 16

        const thumbSize = clamp(sizes.timelineSize / 4, 8, 100)
        const thumb = new Graphics()
        //draw a line with two triangles on top and bottom
        thumb.beginFill(colors.accent[1])
            .moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, thumbSize)
            .lineTo(0, 0)
            .moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, -thumbSize)
            .lineTo(0, 0)
            .endFill()
            .lineStyle(3, colors.accent[1], 1)
            .moveTo(thumbSize / 2, 0)
            .lineTo(thumbSize / 2, sizes.timelineSize)
            .lineStyle(0)
            .beginFill(colors.accent[1])
            .moveTo(0, sizes.timelineSize)
            .lineTo(thumbSize, sizes.timelineSize)
            .lineTo(thumbSize / 2, sizes.timelineSize)
            .lineTo(0, sizes.timelineSize)
            .moveTo(0, sizes.timelineSize)
            .lineTo(thumbSize, sizes.timelineSize)
            .lineTo(thumbSize / 2, sizes.timelineSize - thumbSize)
            .lineTo(0, sizes.timelineSize)

        const noteSize = sizes.timelineSize / 2
        const note = new Graphics()
        note.lineStyle(isMobile() ? 2 : 3 , colors.secondary[1], 1)
            .drawCircle(sizes.timelineSize / 2 + 1, sizes.timelineSize / 2, noteSize / 2)
        const noteTexture = app.renderer.generateTexture(note, {
            resolution: 1,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, sizes.timelineSize, sizes.timelineSize)
        })
        this.textures.timeline.note = noteTexture
        const currentTime = new Graphics()
        currentTime.lineStyle(12, colors.accent[1], 1)
            .moveTo(0, 0)
            .lineTo(0, sizes.timelineSize)
        const currentTimeTexture = app.renderer.generateTexture(currentTime, {
            resolution: 1,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, 12, sizes.timelineSize)
        })
        this.textures.timeline.currentTime = currentTimeTexture
        const thumbTexture = app.renderer.generateTexture(thumb, {
            resolution: 2,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, thumbSize, sizes.timelineSize)
        })
        this.textures.timeline.thumb = thumbTexture

        const breakpoint = new Graphics()
        breakpoint.beginFill(colors.accent[1])
            .moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, thumbSize)
            .lineTo(0, 0)
            .moveTo(0, 0)
            .lineTo(thumbSize, 0)
            .lineTo(thumbSize / 2, -thumbSize)
            .lineTo(0, 0)
        const breakpointTexture = app.renderer.generateTexture(breakpoint, {
            resolution: 1,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, thumbSize, thumbSize)
        })
        this.textures.timeline.breakpoint = breakpointTexture
        //buttons
        const time = new Graphics()
        time.beginFill(colors.background_10[1])
        if (isHorizontal) {
            time.drawRoundedRect(margin / 2, margin / 2, sizes.width / 2 - margin, sizes.height / 2 - margin, 16)
            const timeTexture = app.renderer.generateTexture(time, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width / 2, sizes.height / 2)
            })
            this.textures.buttons.width = sizes.width / 2
            this.textures.buttons.height = sizes.height / 2
            this.textures.buttons.time = timeTexture
        } else {
            time.drawRoundedRect(margin / 2, margin / 2, sizes.width / 2 - margin, sizes.height / 3 - margin, 8)
            const timeTexture = app.renderer.generateTexture(time, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width / 2, sizes.height / 3)
            })
            this.textures.buttons.width = sizes.width / 2
            this.textures.buttons.height = sizes.height / 3
            this.textures.buttons.time = timeTexture
        }
    }


    generateTrails(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = clamp(sizes.keyHeight / 2 * sizes.scaling, sizes.keyHeight / (isMobile() ? 3 : 4), 100)
        const margin = hitObjectHeight / 2
        withError.forEach(color => {
            const trail = new Graphics()
            if (this.isHorizontal) {
                trail.beginFill(Color(color).rgbNumber())
                    .drawRect(0, margin / 2, hitObjectHeight, hitObjectHeight - margin)

            } else {
                trail.beginFill(Color(color).rgbNumber())
                    .drawRect(margin / 2, 0, hitObjectHeight - margin, hitObjectHeight)
            }
            const trailTexture = app.renderer.generateTexture(trail, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight)
            });
            this.textures.trails[color] = trailTexture
            trail.destroy(true)
        })
        this.textures.sizes.trail = hitObjectHeight
    }
    generateSelectionRings(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = clamp(sizes.keyHeight / 1.5 * sizes.scaling, sizes.keyHeight / (isMobile() ? 2 : 3), 150)
        withError.forEach(color => {
            const ring = new Graphics()
            ring.lineStyle(3, Color(color).rgbNumber())
                .drawCircle(hitObjectHeight / 2, hitObjectHeight / 2, hitObjectHeight / 2 - 3)
            const ringTexture = app.renderer.generateTexture(ring, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight)
            });
            this.textures.selectionRings[color] = ringTexture
            ring.destroy(true)
        })
    }
    generateTrackCache(app: Application) {
        const { colors, sizes, trackColors } = this
        const hitObjectHeight = clamp(sizes.keyHeight / 1.8 * sizes.scaling, sizes.keyHeight / (isMobile() ? 2 : 3.5), 100)
        const withError = [...trackColors, '#FF0000']
        withError.forEach(color => {
            const hitObject = new Graphics()
            const circleSize = hitObjectHeight / 2
            hitObject.lineStyle(5, Color(color).rgbNumber())
                .beginFill(colors.background_10[1])
                .drawCircle(circleSize, circleSize, circleSize - 5)
            const texture = app.renderer.generateTexture(hitObject, {
                resolution: 2,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight)
            });
            this.textures.hitObjects[color] = texture
            hitObject.destroy(true)

            const heldHitObject = new Graphics()
            const diamondSize = hitObjectHeight * 0.7
            const margin = (hitObjectHeight - diamondSize) / 2
            heldHitObject.width = diamondSize
            heldHitObject.height = diamondSize
            heldHitObject.lineStyle(5, Color(color).rgbNumber())
                .beginFill(colors.background_10[1])
                .drawRoundedRect(margin, margin, diamondSize, diamondSize, 6)
            const heldTexture = app.renderer.generateTexture(heldHitObject, {
                resolution: 2,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight)
            });
            this.textures.heldHitObjects[color] = heldTexture
            heldHitObject.destroy(true)
        })
        this.textures.sizes.hitObject = hitObjectHeight

    }
    generateSnapPoints(app: Application) {
        const { colors, sizes, isHorizontal } = this
        const small = new Graphics()
        const large = new Graphics()
        const empty = new Graphics()
        if (isHorizontal) {
            small.lineStyle(2, colors.lineColor[1])
                .moveTo(0, 0)
                .lineTo(0, sizes.height)
            const smallTexture = app.renderer.generateTexture(small, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
            });
            large.lineStyle(4, colors.secondary[1])
                .moveTo(0, 0)
                .lineTo(0, sizes.height)
            const largeTexture = app.renderer.generateTexture(large, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
            });
            const lines = 10
            const lineSize = sizes.height / lines
            // empty.rotation = rotation
            empty.lineStyle(2, colors.secondary[1])
            for (let i = 0; i < lines + 2; i++) {
                const size = lineSize * i - lineSize
                const y1 = size
                empty.moveTo(PLAY_BAR_OFFSET, y1)
                empty.lineTo(0, y1 + lineSize)
            }
            const emptyTexture = app.renderer.generateTexture(empty, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, PLAY_BAR_OFFSET, sizes.height)
            });
            this.textures.snapPoints.size = sizes.snapPointWidth
            this.textures.snapPoints.small = smallTexture
            this.textures.snapPoints.large = largeTexture
            this.textures.snapPoints.empty = emptyTexture
        } else {
            small.lineStyle(2, colors.lineColor[1])
                .moveTo(0, sizes.snapPointWidth)
                .lineTo(sizes.width, sizes.snapPointWidth)
            const smallTexture = app.renderer.generateTexture(small, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });

            large.lineStyle(4, colors.secondary[1])
                .moveTo(0, sizes.snapPointWidth)
                .lineTo(sizes.width, sizes.snapPointWidth)
            const largeTexture = app.renderer.generateTexture(large, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });
            const lines = 20
            const lineSize = sizes.width / lines
            // empty.rotation = rotation
            empty.lineStyle(2, colors.secondary[1])
            for (let i = 0; i < lines + 2; i++) {
                const size = lineSize * i - lineSize
                const y1 = size
                empty.moveTo(y1, PLAY_BAR_OFFSET)
                empty.lineTo(y1 + lineSize, 0)
            }
            const emptyTexture = app.renderer.generateTexture(empty, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, PLAY_BAR_OFFSET)
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






