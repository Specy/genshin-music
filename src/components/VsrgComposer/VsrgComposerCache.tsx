import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { clamp } from "lib/Utilities";

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
    }
    sizes: {
        hitObject: number
        trail: number
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
            trails: {},
            snapPoints: {
                size: 0,
                small: null,
                large: null
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
        Object.values(this.textures.hitObjects).forEach(texture => texture.destroy())
        Object.values(this.textures.trails).forEach(texture => texture.destroy())
        this.app = null
    }
    generate() {
        const { app } = this
        this.generateSnapPoints(app!)
        this.generateTrackCache(app!)
        this.generateTrails(app!)
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
        if (isHorizontal) {
            small.lineStyle(2, colors.lineColor[1])
                .moveTo(0, 0)
                .lineTo(0, sizes.height)
            const smallTexture = app.renderer.generateTexture(small, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
            });
            this.textures.snapPoints.small = smallTexture
            large.lineStyle(4, colors.secondary[1])
                .moveTo(0, 0)
                .lineTo(0, sizes.height)
            const largeTexture = app.renderer.generateTexture(large, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
            });
            this.textures.snapPoints.size = sizes.snapPointWidth
            this.textures.snapPoints.large = largeTexture
        } else {
            small.lineStyle(2, colors.lineColor[1])
                .moveTo(0, 0)
                .lineTo(sizes.width, 0)
            const smallTexture = app.renderer.generateTexture(small, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });
            this.textures.snapPoints.small = smallTexture

            large.lineStyle(4, colors.secondary[1])
                .moveTo(0, 0)
                .lineTo(sizes.width, 0)
            const largeTexture = app.renderer.generateTexture(large, {
                resolution: 1,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, sizes.width, sizes.snapPointWidth)
            });
            this.textures.snapPoints.size = sizes.snapPointWidth
            this.textures.snapPoints.large = largeTexture
        }
        small.destroy(true)
        large.destroy(true)
    }
}






