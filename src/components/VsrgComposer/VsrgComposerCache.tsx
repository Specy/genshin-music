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
}

export type VsrgComposerCanvasCache = {
    snapPoints: {
        width: number
        small: Texture | null
        large: Texture | null
    }
    hitObjects: {
        [key: string]: Texture
    }
}

export class VsrgCanvasCache {
    textures: VsrgComposerCanvasCache
    app: Application | null
    colors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    trackColors: string[]
    constructor({
        app,
        colors,
        sizes,
        trackColors
    }: VsrgCacheProps) {

        this.textures = {
            hitObjects: {},
            snapPoints: {
                width: 0,
                small: null,
                large: null
            }
        }
        this.trackColors = trackColors
        this.colors = colors
        this.sizes = sizes
        this.app = app
        this.generate()
    }
    destroy = () => {
        this.textures.snapPoints.small?.destroy()
        this.textures.snapPoints.large?.destroy()
        Object.values(this.textures.hitObjects).forEach(texture => texture.destroy())
        this.app = null
    }
    generate() {
        const { app } = this
        this.generateSnapPoints(app!)
        this.generateTrackCache(app!)
    }

    getHitObjectCache(color: string) {
        return this.textures.hitObjects[color] || this.textures.hitObjects['#000000']
    }
    generateTrackCache(app: Application) {
        const { colors, sizes, trackColors } = this
        const hitObjectHeight = clamp(sizes.keyHeight / 2, 0, 100)
        const withError = [...trackColors, '#000000']
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
        })
    }
    generateSnapPoints(app: Application) {
        const { colors, sizes } = this
        const small = new Graphics()
        small.lineStyle(2, colors.lineColor[1])
            .moveTo(0, 0)
            .lineTo(0, sizes.height)
        const smallTexture = app.renderer.generateTexture(small, {
            resolution: 2,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
        });
        this.textures.snapPoints.small = smallTexture
        const large = new Graphics()
        large.lineStyle(4, colors.secondary[1])
            .moveTo(0, 0)
            .lineTo(0, sizes.height)
        const largeTexture = app.renderer.generateTexture(large, {
            resolution: 2,
            scaleMode: SCALE_MODES.LINEAR,
            region: new Rectangle(0, 0, sizes.snapPointWidth, sizes.height)
        });
        this.textures.snapPoints.width = sizes.snapPointWidth
        this.textures.snapPoints.large = largeTexture
    }
}






