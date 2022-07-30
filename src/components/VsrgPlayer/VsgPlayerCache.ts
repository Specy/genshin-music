import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { VsrgPlayerCanvasColors, VsrgPlayerCanvasSizes } from "./VsrgPlayerCanvas";

settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL

interface VsrgCacheProps {
    app: Application
    colors: VsrgPlayerCanvasColors
    sizes: VsrgPlayerCanvasSizes
    trackColors: string[]
}

export type VsrgPlayerCacheKinds = {
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

export class VsrgPlayerCache {
    textures: VsrgPlayerCacheKinds
    app: Application | null
    colors: VsrgPlayerCanvasColors
    sizes: VsrgPlayerCanvasSizes
    trackColors: string[]
    constructor({
        app,
        colors,
        sizes,
        trackColors,
    }: VsrgCacheProps) {

        this.textures = {
            hitObjects: {},
            heldHitObjects: {},
            trails: {},
            sizes: {
                hitObject: 0,
                trail: 0
            }
        }
        this.trackColors = trackColors
        this.colors = colors
        this.sizes = sizes
        this.app = app
        this.generate()
    }
    destroy = () => {
        Object.values(this.textures.hitObjects).forEach(texture => texture?.destroy())
        Object.values(this.textures.heldHitObjects).forEach(texture => texture?.destroy())
        Object.values(this.textures.trails).forEach(texture => texture?.destroy())
        this.app = null
    }
    generate() {
        const { app } = this
        if (!app) return
        this.generateTrackCache(app)
        this.generateTrails(app)
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
        const hitObjectHeight = sizes.hitObjectSize * sizes.scaling
        const margin = hitObjectHeight / 3
        withError.forEach(color => {
            const trail = new Graphics()
            trail.beginFill(Color(color).rgbNumber())
            .drawRect(margin / 2, 0, hitObjectHeight - margin, hitObjectHeight)
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
        const hitObjectHeight = sizes.hitObjectSize
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
}

