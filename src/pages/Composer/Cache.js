import { TempoChangers } from "lib/Utils"
import { CACHE_DATA, NOTES_PER_COLUMN } from "appConfig"
const { noteData, horizontalLineBreak, standards, layersCombination, breakpoints } = CACHE_DATA

export class ComposerCache {
    constructor(width, height, margin = 4, timelineHeight = 30) {
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
        //TODO reuse the same canvas instead of remaking one for each element
        /*
        this.app = new PIXI.Application({
            width: width,
            height: height,
            resolution: 2
        })
        */
        this.generate()
    }
    destroy = () => {
        //this.app.destroy()
    }
    generate = () => {
        TempoChangers.forEach(tempoChanger => {
            let canvas = drawColumn(tempoChanger, this, 1)
            this.cache.columns.push(canvas.toDataURL())
        })
        standards.forEach(standardColumn => {
            let canvas = drawColumn(standardColumn, this, 1)
            this.cache.standard.push(canvas.toDataURL())
        })
        standards.forEach(standardColumn => {
            let canvas = drawColumn(standardColumn, this, 3)
            this.cache.standardLarger.push(canvas.toDataURL())
        })
        layersCombination.forEach(note => {
            let roundNess = this.noteWidth > 20 ? 4 : 2
            let canvas = document.createElement("canvas")
            canvas.height = this.noteHeight
            canvas.width = this.noteWidth
            let ctx = canvas.getContext("2d")
            if (note[0] === "1") {
                ctx.fillStyle = noteData.background
                roundRect(
                    ctx,
                    this.margin / 2,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin - 1),
                    Math.floor(this.noteHeight - this.margin - 1),
                    roundNess,
                    true,
                    false
                )
            }
            if (note[1] === "1") {
                ctx.strokeStyle = noteData.border
                ctx.lineWidth = 2
                roundRect(
                    ctx,
                    this.margin / 2,
                    this.margin / 2,
                    Math.ceil(this.noteWidth - this.margin - 1),
                    Math.floor(this.noteHeight - this.margin - 1),
                    roundNess,
                    false,
                    true
                )
            }
            if (note[2] === "1") {
                ctx.beginPath()
                ctx.fillStyle = noteData.center
                let ballHeight = this.noteHeight / 4
                ctx.arc(this.noteWidth / 2 - 0.5, this.noteHeight / 2 - 0.5, ballHeight, 0, 2 * Math.PI);
                ctx.fill()
            }
            this.cache.notes[note] = canvas.toDataURL()
        })
        TempoChangers.forEach(tempoChanger => {
            let canvas = drawColumn(tempoChanger, this, 2)
            this.cache.columnsLarger.push(canvas.toDataURL())
        })
        breakpoints.forEach(breakpoint => {
            let canvas = document.createElement("canvas")
            if (breakpoint.type === "short") {
                let size = this.timelineHeight / 6
                canvas.height = this.timelineHeight
                canvas.width = size * 2
                let ctx = canvas.getContext("2d")
                ctx.fillStyle = breakpoint.color
                ctx.arc(size, this.timelineHeight / 2, size, 0, 2 * Math.PI);
                ctx.fill()
                this.cache.breakpoints.push(canvas.toDataURL())
            } else {
                canvas.height = this.height
                canvas.width = this.width
                let ctx = canvas.getContext("2d")
                ctx.fillStyle = breakpoint.color
                /*
               ctx.strokeStyle = breakpoint.color
               ctx.lineWidth = 3
                ctx.strokeRect(1,1,this.width - 3,this.height - 2)
                */
                ctx.beginPath();
                ctx.moveTo(0, this.height)
                ctx.lineTo(this.noteWidth / 2, this.height)
                ctx.lineTo(0, this.height - this.noteHeight)
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(this.width, this.height)
                ctx.lineTo(this.noteWidth / 2, this.height)
                ctx.lineTo(this.width, this.height - this.noteHeight)
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(0, 0)
                ctx.lineTo(this.noteWidth / 2, 0)
                ctx.lineTo(0, this.noteHeight)
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(this.width, 0)
                ctx.lineTo(this.noteWidth / 2, 0)
                ctx.lineTo(this.width, this.noteHeight)
                ctx.fill();

                this.cache.breakpoints.push(canvas.toDataURL())
            }
        })
    }
}


function drawColumn(tempoChanger, self, borderWidth) {
    let canvas = document.createElement("canvas")
    canvas.height = self.height
    canvas.width = self.width
    let ctx = canvas.getContext("2d")
    ctx.fillStyle = "#" + tempoChanger.color.toString(16)
    ctx.fillRect(0, 0, self.width, self.height)
    ctx.strokeStyle = borderWidth === 2 ? "black" : "#333333"
    ctx.lineWidth = borderWidth
    ctx.beginPath()
    ctx.moveTo(self.width, 0)
    ctx.lineTo(self.width, self.height)
    ctx.stroke()
    ctx.strokeStyle = "#333333"
    for (let i = 1; i < 3; i++) {
        ctx.lineWidth = 1
        let y = self.noteHeight * horizontalLineBreak * i
        ctx.moveTo(0, y)
        ctx.lineTo(self.width, y)
    }
    ctx.stroke()
    return canvas
}

function roundRect(ctx, x, y, width, height, radius = 5, fill, stroke = true) {
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (var side in defaultRadius) {
            radius[side] = radius[side] || defaultRadius[side];
        }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }

}
