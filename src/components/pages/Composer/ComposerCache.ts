import { CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS } from "$config"
import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { NoteLayer } from "$lib/Layer";

settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL
const { horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA
interface ComposerCacheProps {
    width: number
    height: number
    margin: number
    timelineHeight: number
    app: Application
    breakpointsApp: Application
    colors: {
        accent: Color,
        mainLayer: Color,
        secondLayer: Color, 
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
        accent: Color,
        mainLayer: Color,
        secondLayer: Color, 
        bars: {color: number}[]
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
                g.beginFill(new Color(this.colors.mainLayer).rgbNumber())
                    .lineStyle(1, new Color(this.colors.mainLayer).rgbNumber())
                    .drawRoundedRect(
                        this.margin / 2 - 0.25,
                        this.margin / 2,
                        Math.ceil(noteWidth - this.margin),
                        Math.ceil(noteHeight - this.margin),
                        radius
                    ).endFill()
            }
            if (layer.test(1)) { //layer 2
                g.lineStyle(this.margin === 4 ? 3 : 2, new Color(this.colors.secondLayer).rgbNumber())
                    .drawRoundedRect(
                        this.margin / 2 - 0.25,
                        this.margin / 2,
                        Math.ceil(noteWidth - this.margin),
                        Math.ceil(noteHeight - this.margin),
                        radius
                    ).endFill()
            }
            if (layer.test(2)) { //layer 3
                g.beginFill(new Color(this.colors.secondLayer).rgbNumber())
                    .lineStyle(1, new Color(this.colors.secondLayer).rgbNumber())
                    .drawCircle(
                        noteWidth / 2 - 0.25,
                        noteHeight / 2,
                        noteHeight / 3 - 0.5
                    ).endFill()
            }

            if (layer.test(3)) { //layer 4
                const lineWidth = this.margin === 4 ? 3 : 2
                g.lineStyle(lineWidth, new Color(this.colors.secondLayer).darken(0.15).rgbNumber())
                    .moveTo(this.margin / 2 + 0.5, noteHeight / 2)
                    .lineTo(noteWidth - this.margin + 0.5, noteHeight / 2)
                    .endFill()
            }
            if (!this.app) return
            const texture = this.app.renderer.generateTexture(g, {
                resolution: 2,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, this.noteWidth, this.noteHeight)
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
                g.beginFill(this.colors.accent.rgbNumber())
                g.drawCircle(
                    size,
                    this.timelineHeight / 2,
                    size
                ).endFill()
                if (!this.breakpointsApp) return
                const texture = this.breakpointsApp.renderer.generateTexture(g, {
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: 2,
                    region: new Rectangle(0, 0, size * 2, this.timelineHeight)
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            } else {
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(0, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(0, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(this.width, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(this.width, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(0, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(0, this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(this.width, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(this.width, this.noteHeight)
                    .endFill();
                if (!this.app) return
                const texture = this.app.renderer.generateTexture(g, {
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: 2
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            }
        })
    }
    drawColumn = (data: { color: number }, borderWidth: number) => {
        const g = new Graphics()
        g.beginFill(data.color)
        g.drawRect(0, 0, this.width, this.height)
        g.lineStyle(borderWidth, borderWidth === 2 ? 0x333333 : 0x333333)
            .moveTo(this.width, 0)
            .lineTo(this.width, this.height)
        g.lineStyle(1, 0x333333)
        for (let i = 1; i < 3; i++) {
            const y = this.noteHeight * horizontalLineBreak * i
            g.moveTo(0, y)
            g.lineTo(this.width, y)
        }
        if (!this.app) return
        const texture = this.app.renderer.generateTexture(g, {
            scaleMode: SCALE_MODES.LINEAR,
            resolution: window?.devicePixelRatio || 1,
            region: new Rectangle(0, 0, this.width, this.height)
        })
        g.destroy(true)
        return texture
    }
}
