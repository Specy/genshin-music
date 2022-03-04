import { CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS } from "appConfig"
import Color from "color"
import { Application, Graphics, Sprite, Texture } from 'pixi.js'

const { noteData, horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA
interface ComposerCacheProps{
    width: number
    height: number
    margin: number
    timelineHeight: number
    standardsColors: typeof standards
}
export class ComposerCache {
    width: number
    height: number
    cache: {
        columns: Texture[]
        notes: any
        standard: Texture[]
        columnsLarger: Texture[]
        standardLarger: Texture[]
        breakpoints: Texture[]
    }
    notesFigures: any[]
    timelineHeight: number
    margin: number
    noteWidth: number
    noteHeight: number
    standardsColors: typeof standards
    app: Application
    view: HTMLCanvasElement
    constructor({width, height, margin = 4, timelineHeight = 30, standardsColors}: ComposerCacheProps) {
        this.width = width
        this.height = height
        this.cache = {
            columns: [],
            notes: {},
            standard: [],
            columnsLarger: [],
            standardLarger: [],
            breakpoints: []
        }
        this.notesFigures = []
        this.timelineHeight = timelineHeight
        this.margin = margin
        this.noteWidth = this.width
        this.noteHeight = this.height / NOTES_PER_COLUMN
        this.standardsColors = standardsColors || standards
        this.view = document.createElement('canvas')

        this.app = new Application({
            view: this.view,
            width: this.width,
            height: this.height,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            antialias: true
        })
        this.generate()
        this.app.stage.addChild(Sprite.from(this.cache.notes['100']))
    }
    destroy = () => {

        this.view.remove()
        this.app.destroy(true);
    }
    generate = () => {
        TEMPO_CHANGERS.forEach(tempoChanger => {
            this.cache.columns.push(this.drawColumn(tempoChanger, 1))
        })
        this.standardsColors.forEach(standardColumn => {
            this.cache.standard.push(this.drawColumn(standardColumn, 1))
        })
        this.standardsColors.forEach(standardColumn => {
            this.cache.standardLarger.push(this.drawColumn(standardColumn, 3))
        })
        layersCombination.forEach(note => {
            const radius = this.noteWidth > 20 ? 4 : 2
            const g = new Graphics()
        
            if (note[0] === "1") {
                g.beginFill(new Color(noteData.background).rgbNumber())
                g.drawRoundedRect(
                    this.margin / 2,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin - 1),
                    Math.floor(this.noteHeight - this.margin - 1),
                    radius
                ).endFill()
            }
            if (note[1] === "1") {
                g.beginFill(new Color(noteData.border).rgbNumber())
                g.lineStyle({
                    width: 2
                })
                g.drawRoundedRect(
                    this.margin / 2,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin - 1),
                    Math.floor(this.noteHeight - this.margin - 1),
                    radius
                ).endFill()
            }
            if (note[2] === "1") {
                g.beginFill(new Color(noteData.center).rgbNumber())
                g.drawCircle(
                    this.noteWidth / 2 - 0.5,
                    this.noteHeight / 2 - 0.5,
                    this.noteHeight / 4
                ).endFill()
            }
            const texture = this.app.renderer.generateTexture(g);
            this.cache.notes[note] = texture
        })
        TEMPO_CHANGERS.forEach(tempoChanger => {
            this.cache.columnsLarger.push(this.drawColumn(tempoChanger, 2))
        })
        breakpoints.forEach(breakpoint => {
            const g = new Graphics()
            const size = this.timelineHeight / 6
            if (breakpoint.type === "short") {
                g.beginFill(new Color(breakpoint.color).rgbNumber())
                g.drawCircle(
                    size,
                    this.timelineHeight / 2,
                    size
                ).endFill()
                const texture = this.app.renderer.generateTexture(g);
                this.cache.breakpoints.push(texture)
            } else {
                g.beginFill(new Color(breakpoint.color).rgbNumber())
                .moveTo(0, this.height)
                .lineTo(this.noteWidth / 2, this.height)
                .lineTo(0, this.height - this.noteHeight)
                .endFill();
                g.beginFill(new Color(breakpoint.color).rgbNumber())
                .moveTo(this.width, this.height)
                .lineTo(this.noteWidth / 2, this.height)
                .lineTo(this.width, this.height - this.noteHeight)
                .endFill();
                g.beginFill(new Color(breakpoint.color).rgbNumber())
                .moveTo(0, 0)
                .lineTo(this.noteWidth / 2, 0)
                .lineTo(0, this.noteHeight)
                .endFill();
                g.beginFill(new Color(breakpoint.color).rgbNumber())
                .moveTo(this.width, 0)
                .lineTo(this.noteWidth / 2, 0)
                .lineTo(this.width, this.noteHeight)
                .endFill();
                const texture = this.app.renderer.generateTexture(g);
                this.cache.breakpoints.push(texture)
            }
        })
    }
    drawColumn = (data: { color: number}, borderWidth: number) => {
        const g = new Graphics()
        g.beginFill(data.color)
        g.drawRect(0, 0, this.width, this.height)
        g.lineStyle({
            color: borderWidth === 2 ? 0x000000 : 0x333333,
            width: borderWidth
        }).moveTo(this.width, 0)
          .lineTo(this.width, this.height)
        g.lineStyle({
            color: 0x333333,
            width: 1
        })
        for (let i = 1; i < 3; i++) {
            const y = this.noteHeight * horizontalLineBreak * i
            g.moveTo(0, y)
            g.lineTo(this.width, y)
        }
        return this.app.renderer.generateTexture(g);
    }
}
