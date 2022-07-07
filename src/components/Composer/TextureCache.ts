import { CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS } from "appConfig"
import Color from "color"
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';
import { Application, Texture, SCALE_MODES, Rectangle } from 'pixi.js'
import { NoteLayer } from "lib/Layer";

settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL
const { noteData, horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA
interface ComposerCacheProps {
    width: number
    height: number
    margin: number
    timelineHeight: number
    standardsColors: typeof standards
    app: Application
    breakpointsApp: Application
    composerAccent: Color
}

export type ComposerCacheData =  {
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
    standardsColors: typeof standards
    app: Application | null
    breakpointsApp: Application | null
    composerAccent: Color
    constructor({
        width,
        height,
        margin = 4,
        timelineHeight = 30,
        standardsColors,
        app,
        breakpointsApp,
        composerAccent
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
        this.standardsColors = standardsColors || standards
        this.app = app
        this.breakpointsApp = breakpointsApp
        this.composerAccent = composerAccent
        this.generate()
    }
    destroy = () => {
        this.cache.columns.forEach(e => e.destroy(true))
        this.cache.standard.forEach(e => e.destroy(true))
        this.cache.columnsLarger.forEach(e => e.destroy(true))
        this.cache.standardLarger.forEach(e => e.destroy(true))
        this.cache.breakpoints.forEach(e => e.destroy(true))
        Object.entries(this.cache.notes).forEach(([_, value]) => {
            value.destroy(true)
        })
        this.app = null
        this.breakpointsApp = null
    }
    generate = () => {
        TEMPO_CHANGERS.forEach(tempoChanger => {
            const texture = this.drawColumn(tempoChanger, 1)
            if(texture) this.cache.columns.push(texture)
        })
        this.standardsColors.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 1)
            if(texture) this.cache.standard.push(texture)
        })
        this.standardsColors.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 3)
            if(texture) this.cache.standardLarger.push(texture)
        })
        layersCombination.forEach(note => {
            const radius = this.noteWidth > 20 ? 3 : 2
            const layer = new NoteLayer(note)
            const g = new Graphics()
            if (layer.test(0)) { //layer 1
                g.beginFill(new Color(noteData.background).rgbNumber())
                .lineStyle(1, new Color(noteData.background).rgbNumber())
                    .drawRoundedRect(
                        this.margin / 2 - 0.25,
                        this.margin / 2,
                        Math.ceil(this.noteWidth - this.margin),
                        Math.ceil(this.noteHeight - this.margin),
                        radius
                    ).endFill()
            }
            if (layer.test(1)) { //layer 2
                g.lineStyle(this.margin === 4 ? 3 : 2,new Color(noteData.border).rgbNumber())
                    .drawRoundedRect(
                        this.margin / 2 - 0.25,
                        this.margin / 2,
                        Math.ceil(this.noteWidth - this.margin),
                        Math.ceil(this.noteHeight - this.margin),
                        radius
                    ).endFill()
            }
            if (layer.test(2)) { //layer 3
                g.beginFill(new Color(noteData.center).rgbNumber())
                    .lineStyle(1,new Color(noteData.center).rgbNumber())
                    .drawCircle(
                        this.noteWidth / 2 - 0.25,
                        this.noteHeight / 2,
                        this.noteHeight / 3 - 0.5
                    ).endFill()
            }
            if (layer.test(3)) { //layer 4
                const lineWidth = this.margin === 4 ? 3 : 2
                g.lineStyle(lineWidth, new Color(noteData.border).rgbNumber())
                    .moveTo(this.margin / 2 + 0.5, this.noteHeight / 2)
                    .lineTo(this.noteWidth - this.margin + 0.5, this.noteHeight / 2)
                    .endFill()
            }
            if(!this.app) return
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
            if(texture) this.cache.columnsLarger.push(texture)
        })
        breakpoints.forEach(breakpoint => {
            const g = new Graphics()
            const size = this.timelineHeight / 6
            if (breakpoint.type === "short") {
                g.beginFill(this.composerAccent.rgbNumber())
                g.drawCircle(
                    size,
                    this.timelineHeight / 2,
                    size
                ).endFill()
                if(!this.breakpointsApp) return
                const texture = this.breakpointsApp.renderer.generateTexture(g, {
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: 2,
                    region: new Rectangle(0, 0, size * 2, this.timelineHeight)
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            } else {
                g.beginFill(this.composerAccent.rgbNumber())
                    .moveTo(0, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(0, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.composerAccent.rgbNumber())
                    .moveTo(this.width, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(this.width, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.composerAccent.rgbNumber())
                    .moveTo(0, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(0, this.noteHeight)
                    .endFill();
                g.beginFill(this.composerAccent.rgbNumber())
                    .moveTo(this.width, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(this.width, this.noteHeight)
                    .endFill();
                if(!this.app) return
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
        g.lineStyle(1,0x333333)
        for (let i = 1; i < 3; i++) {
            const y = this.noteHeight * horizontalLineBreak * i
            g.moveTo(0, y)
            g.lineTo(this.width, y)
        }
        if(!this.app) return
        const texture = this.app.renderer.generateTexture(g, {
            scaleMode: SCALE_MODES.LINEAR,
            resolution: window.devicePixelRatio || 1,
            region: new Rectangle(0, 0, this.width, this.height)
        })
        g.destroy(true)
        return texture
    }
}
