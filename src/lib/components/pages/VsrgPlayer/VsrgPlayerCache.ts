// Old: src/components/pages/VsrgPlayer/VsgPlayerCache.ts (174 lines) - the old FILENAME is
// missing an "r" (`VsgPlayerCache.ts` instead of `VsrgPlayerCache.ts`), a plain old typo (the
// exported class inside it was always correctly spelled `VsrgPlayerCache`). This port corrects
// the file name only - the class name, every method body and every Graphics/Rectangle/
// generateTexture call is byte-verbatim, same "port AS-IS" treatment VsrgComposerCache.ts's own
// header comment already established for its own sibling file. No game-dependent data here either
// (every value arrives via constructor props), so there is nothing to swap for a `$game`/
// `$config` import.
//
// Only import changes:
// - `./VsrgPlayerCanvas` -> `./VsrgPlayerRenderer` (type-only): old's three-file collapse
//   (VsrgPlayerCanvas.tsx + VsrgHitObjectsRenderer.tsx + VsrgPlayerAccuracyRenderer.tsx) into one
//   `VsrgPlayerRenderer.ts` this same task - see that file's header comment. `VsrgPlayerCanvasColors`/
//   `VsrgPlayerCanvasSizes` now live there. This is a type-only import so the mutual reference back
//   (VsrgPlayerRenderer.ts imports the `VsrgPlayerCache` VALUE from here) stays a compile-time-only
//   cycle, same shape VsrgComposerCache.ts/VsrgComposerRenderer.ts already established.
import Color from "color"
import { Application, Graphics, Rectangle, Texture } from 'pixi.js'
import type { VsrgPlayerCanvasColors, VsrgPlayerCanvasSizes } from "./VsrgPlayerRenderer";

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
    lines: {
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
            lines: {},
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
        Object.values(this.textures.hitObjects).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.heldHitObjects).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.trails).forEach(texture => texture?.destroy(true))
        Object.values(this.textures.lines).forEach(texture => texture?.destroy(true))

        this.app = null
    }

    generate() {
        const { app } = this
        if (!app) return
        this.generateTrackCache(app)
        this.generateTrailsCache(app)
        this.generateLinesCache(app)
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

    getLinesCache(color: string) {
        return this.textures.lines[color] || this.textures.lines['#FF0000']
    }

    generateTrailsCache(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const hitObjectHeight = sizes.hitObjectSize
        const margin = hitObjectHeight / 3
        withError.forEach(color => {
            const trail = new Graphics()
            trail.rect(margin / 2, 0, hitObjectHeight - margin, hitObjectHeight)
                .fill({ color: Color(color).rgb().rgbNumber() })
            const trailTexture = app.renderer.generateTexture({
                target: trail,
                resolution: 1,
                frame: new Rectangle(0, 0, hitObjectHeight, hitObjectHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.trails[color] = trailTexture
            trail.destroy(true)
        })
        this.textures.sizes.trail = hitObjectHeight
    }

    generateLinesCache(app: Application) {
        const { sizes, trackColors } = this
        const withError = [...trackColors, '#FF0000']
        const lineHeight = 5
        withError.forEach(color => {
            const line = new Graphics()
            line.moveTo(0, 0)
                .lineTo(sizes.width, 0)
                .stroke({ width: lineHeight, color: Color(color).rgb().rgbNumber() })
            const lineTexture = app.renderer.generateTexture({
                target: line,
                resolution: 2,
                frame: new Rectangle(0, 0, sizes.width, lineHeight),
                textureSourceOptions: { scaleMode: 'linear' }
            });
            this.textures.lines[color] = lineTexture
            line.destroy(true)
        })
    }

    generateTrackCache(app: Application) {
        const { colors, sizes, trackColors } = this
        const hitObjectHeight = sizes.hitObjectSize
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
}
