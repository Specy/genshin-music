import { CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS } from "appConfig"
import Color from "color"
import { Application, Graphics, Texture , SCALE_MODES, Rectangle} from 'pixi.js'

const { noteData, horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA
interface ComposerCacheProps{
    width: number
    height: number
    margin: number
    timelineHeight: number
    standardsColors: typeof standards
    app: Application
    breakpointsApp: Application
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
    breakpointsApp: Application
    constructor({
            width, 
            height, 
            margin = 4, 
            timelineHeight = 30, 
            standardsColors,
            app,
            breakpointsApp
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
        this.notesFigures = []
        this.timelineHeight = timelineHeight
        this.margin = margin
        this.noteWidth = this.width
        this.noteHeight = this.height / NOTES_PER_COLUMN
        this.standardsColors = standardsColors || standards
        this.app = app
        this.breakpointsApp = breakpointsApp
        this.generate()
    }
    destroy = () => {
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
            if (note[0] === "1") { //layer 1
                g.beginFill(new Color(noteData.background).rgbNumber())
                g.drawRoundedRect(
                    this.margin / 2 - 0.5,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin),
                    Math.ceil(this.noteHeight - this.margin),
                    radius
                ).endFill()
            }
            if (note[1] === "1") { //layer 2
                g.lineStyle({
                    width: 2,
                    color: new Color(noteData.border).rgbNumber()
                })
                g.drawRoundedRect(
                    this.margin / 2 - 0.5,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin),
                    Math.ceil(this.noteHeight - this.margin),
                    radius
                ).endFill().lineStyle()
            }
            if (note[2] === "1") { //layer 3
                g.beginFill(new Color(noteData.center).rgbNumber())
                g.drawCircle(
                    this.noteWidth / 2 - 0.5,
                    this.noteHeight / 2,
                    this.noteHeight / 3
                ).endFill()
            }
            const texture = this.app.renderer.generateTexture(g,{
                resolution: 2,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0,0,this.noteWidth, this.noteHeight)
            });
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
                    this.timelineHeight/2,
                    size
                ).endFill()
                const texture = this.breakpointsApp.renderer.generateTexture(g,{
                        scaleMode: SCALE_MODES.LINEAR,
                        resolution: 2,
                        region: new Rectangle(0,0,size*2,this.timelineHeight)
                    });
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
                const texture = this.app.renderer.generateTexture(g,{
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: window.devicePixelRatio || 1
                });
                this.cache.breakpoints.push(texture)
            }
        })
    }
    drawColumn = (data: { color: number}, borderWidth: number) => {
        const g = new Graphics()
        
        g.beginFill(data.color)
        g.drawRect(0, 0, this.width, this.height)
        g.lineStyle({
            color: borderWidth === 2 ? 0x333333 : 0x333333,
            width: borderWidth
        }).moveTo(this.width , 0)
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
        return this.app.renderer.generateTexture(g,{
            scaleMode: SCALE_MODES.LINEAR,
            resolution: window.devicePixelRatio || 1,
            region: new Rectangle(0,0,this.width, this.height)
        });
    }
}
