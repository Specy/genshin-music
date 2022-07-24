import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { clamp } from "lib/Utilities";
import { PLAY_BAR_OFFSET } from "appConfig";

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
    timeline: {
        square: Texture | null
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
            snapPoints: {
                size: 0,
                small: null,
                large: null,
                empty: null
            },
            timeline: {
                square: null
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
        Object.values(this.textures.hitObjects).forEach(texture => texture.destroy())
        Object.values(this.textures.heldHitObjects).forEach(texture => texture.destroy())
        Object.values(this.textures.trails).forEach(texture => texture.destroy())
        Object.values(this.textures.selectionRings).forEach(texture => texture.destroy())
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
        const square = new Graphics()
        square.beginFill(this.colors.background_10[1])
        square.drawRect(0, 0, this.sizes.width, this.sizes.timelineSize)
        const squareTexture = app.renderer.generateTexture(square, {
            resolution: 1,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, this.sizes.width, this.sizes.timelineSize)
        })
        this.textures.timeline.square = squareTexture
    }


    generateTrails(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = clamp(sizes.keyHeight / 2, 0, 100)
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
        const hitObjectHeight = sizes.keyHeight / 1.5
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
        const hitObjectHeight = clamp(sizes.keyHeight / 2, 0, 100)
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
                .moveTo(0, 0)
                .lineTo(sizes.width, 0)
            const smallTexture = app.renderer.generateTexture(small, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });

            large.lineStyle(4, colors.secondary[1])
                .moveTo(0, 0)
                .lineTo(sizes.width, 0)
            const largeTexture = app.renderer.generateTexture(large, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });
            const lines = 10
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






