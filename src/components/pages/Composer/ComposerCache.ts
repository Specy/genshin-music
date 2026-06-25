import { CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS } from "$config"
import Color, { ColorInstance } from "color"
import { Application, Graphics, Rectangle, Texture } from 'pixi.js'
import { NoteLayer } from "$lib/Songs/Layer";

const { horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA

interface ComposerCacheProps {
    width: number
    height: number
    margin: number
    timelineHeight: number
    app: Application
    breakpointsApp: Application
    colors: {
        accent: ColorInstance,
        mainLayer: ColorInstance,
        secondLayer: ColorInstance,
        bars: typeof standards
    }
}

export type ComposerCacheData = {
    columns: Texture[]
    notes: {
        [key in string]: Texture
    }
    standard: Texture[]
    columnsLarger: Texture[]
    standardLarger: Texture[]
    breakpoints: Texture[]
}

export class ComposerCache {
    width: number
    height: number
    cache: ComposerCacheData
    timelineHeight: number
    margin: number
    noteWidth: number
    noteHeight: number
    app: Application | null
    breakpointsApp: Application | null
    colors: {
        accent: ColorInstance,
        mainLayer: ColorInstance,
        secondLayer: ColorInstance,
        bars: { color: number }[]
    }

    constructor({
        width,
        height,
        margin = 4,
        timelineHeight = 30,
        app,
        breakpointsApp,
        colors
    }: ComposerCacheProps) {

        this.cache = {
            columns: [],
            notes: {},
            standard: [],
            columnsLarger: [],
            standardLarger: [],
            breakpoints: []
        }
        this.width = width
        this.height = height
        this.timelineHeight = timelineHeight
        this.margin = margin
        this.noteWidth = this.width
        this.noteHeight = this.height / NOTES_PER_COLUMN
        this.colors = colors
        this.app = app
        this.breakpointsApp = breakpointsApp
        this.generate()
    }

    destroy = () => {
        this.cache.columns.forEach(e => e.destroy(true))
        this.cache.standard.forEach(e => e.destroy(true))
        this.cache.columnsLarger.forEach(e => e.destroy(true))
        this.cache.standardLarger.forEach(e => e.destroy(true))
        this.cache.breakpoints.forEach(e => e.destroy(true))
        Object.values(this.cache.notes).forEach(e => e.destroy(true))
        this.app = null
        this.breakpointsApp = null
    }
    generate = () => {
        TEMPO_CHANGERS.forEach(tempoChanger => {
            const texture = this.drawColumn(tempoChanger, 1)
            if (texture) this.cache.columns.push(texture)
        })
        this.colors.bars.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 1)
            if (texture) this.cache.standard.push(texture)
        })
        this.colors.bars.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 3)
            if (texture) this.cache.standardLarger.push(texture)
        })
        layersCombination.forEach(note => {
            const noteWidth = this.noteWidth
            const noteHeight = this.noteHeight
            const radius = this.noteWidth > 20 ? 3 : 2
            const layer = new NoteLayer(note)
            const g = new Graphics()
            if (layer.test(0)) { //layer 1
                g.roundRect(
                    this.margin / 2 - 0.25,
                    this.margin / 2,
                    Math.ceil(noteWidth - this.margin),
                    Math.ceil(noteHeight - this.margin),
                    radius
                ).fill(new Color(this.colors.mainLayer).rgb().rgbNumber())
                    .stroke({ width: 1, color: new Color(this.colors.mainLayer).rgb().rgbNumber() })
            }
            if (layer.test(1)) { //layer 2
                g.roundRect(
                    this.margin / 2 - 0.25,
                    this.margin / 2,
                    Math.ceil(noteWidth - this.margin),
                    Math.ceil(noteHeight - this.margin),
                    radius
                ).stroke({ width: this.margin === 4 ? 3 : 2, color: new Color(this.colors.secondLayer).rgb().rgbNumber() })
            }
            if (layer.test(2)) { //layer 3
                g.circle(
                    noteWidth / 2 - 0.25,
                    noteHeight / 2,
                    noteHeight / 3 - 0.5
                ).fill(new Color(this.colors.secondLayer).rgb().rgbNumber())
                    .stroke({ width: 1, color: new Color(this.colors.secondLayer).rgb().rgbNumber() })
            }

            if (layer.test(3)) { //layer 4
                const lineWidth = this.margin === 4 ? 3 : 2
                g.moveTo(this.margin / 2 + 0.5, noteHeight / 2)
                    .lineTo(noteWidth - this.margin + 0.5, noteHeight / 2)
                    .stroke({ width: lineWidth, color: new Color(this.colors.secondLayer).darken(0.15).rgb().rgbNumber() })
            }
            if (!this.app) return
            const texture = this.app.renderer.generateTexture({
                target: g,
                resolution: 2,
                frame: new Rectangle(0, 0, this.noteWidth, this.noteHeight),
                textureSourceOptions: { scaleMode: 'linear' },
            });
            this.cache.notes[note] = texture
            g.destroy(true)
        })
        TEMPO_CHANGERS.forEach(tempoChanger => {
            const texture = this.drawColumn(tempoChanger, 2)
            if (texture) this.cache.columnsLarger.push(texture)
        })
        breakpoints.forEach(breakpoint => {
            const g = new Graphics()
            const size = this.timelineHeight / 6
            if (breakpoint.type === "short") {
                g.circle(
                    size,
                    this.timelineHeight / 2,
                    size
                ).fill(this.colors.accent.rgb().rgbNumber())
                if (!this.breakpointsApp) return
                const texture = this.breakpointsApp.renderer.generateTexture({
                    target: g,
                    resolution: 2,
                    frame: new Rectangle(0, 0, size * 2, this.timelineHeight),
                    textureSourceOptions: { scaleMode: 'linear' },
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            } else {
                g.moveTo(0, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(0, this.height - this.noteHeight)
                    .fill(this.colors.accent.rgb().rgbNumber())
                g.moveTo(this.width, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(this.width, this.height - this.noteHeight)
                    .fill(this.colors.accent.rgb().rgbNumber())
                g.moveTo(0, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(0, this.noteHeight)
                    .fill(this.colors.accent.rgb().rgbNumber())
                g.moveTo(this.width, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(this.width, this.noteHeight)
                    .fill(this.colors.accent.rgb().rgbNumber())
                if (!this.app) return
                const texture = this.app.renderer.generateTexture({
                    target: g,
                    resolution: 2,
                    textureSourceOptions: { scaleMode: 'linear' },
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            }
        })
    }
    drawColumn = (data: { color: number }, borderWidth: number) => {
        const g = new Graphics()
        g.rect(0, 0, this.width, this.height).fill(data.color)
        g.moveTo(this.width, 0)
            .lineTo(this.width, this.height)
            .stroke({ width: borderWidth, color: 0x333333 })
        const linesMid: Array<[number, number, number, number]> = []
        for (let i = 1; i < 3; i++) {
            const y = this.noteHeight * horizontalLineBreak * i
            linesMid.push([0, y, this.width, y])
        }
        for (const [x1, y1, x2, y2] of linesMid) {
            g.moveTo(x1, y1).lineTo(x2, y2)
        }
        g.stroke({ width: 1, color: 0x333333 })
        if (!this.app) return
        const texture = this.app.renderer.generateTexture({
            target: g,
            resolution: window?.devicePixelRatio || 1,
            frame: new Rectangle(0, 0, this.width, this.height),
            textureSourceOptions: { scaleMode: 'linear' },
        })
        g.destroy(true)
        return texture
    }
}
