import {TempoChangers} from "../SongUtils"
import * as PIXI from "pixi.js"
let notes = [
    {   
        id:0,
        color: "#d3bd8e"
    }

]
let standards = [

    {
        color: 0x515c6f
    },
    {
        color: 0x414a59
    },
    {
        color: 0x1a968b
    }
]
class ComposerCache{
    constructor(width,height){
        this.width = width
        this.height = height
        this.cache = {
            columns: [],
            notes: [],
            standard: []
        }
        this.app = new PIXI.Application({
            width: width,
            height:height,
        })
        this.generate()
    }
    generate = () => {
        TempoChangers.forEach(tempoChanger => {
            let canvas = drawColumn(tempoChanger,this)
            this.cache.columns.push(canvas.toDataURL())
        })
        standards.forEach(standardColumn => {
            let canvas = drawColumn(standardColumn,this)
            this.cache.standard.push(canvas.toDataURL())
        })
        notes.forEach(note => {
            let canvas = document.createElement("canvas")
            canvas.height = this.height / 21 - 2
            canvas.width = this.width - 8
            let ctx = canvas.getContext("2d")
            ctx.fillStyle = note.color
            roundRect(ctx,0,0,canvas.width,canvas.height,4,true,false)


            this.cache.notes.push(canvas.toDataURL())
        })
    }
}
function drawColumn(tempoChanger,self){
    let canvas = document.createElement("canvas")
    canvas.height = self.height
    canvas.width = self.width
    let ctx = canvas.getContext("2d")
    ctx.fillStyle = "#"+tempoChanger.color.toString(16)
    ctx.fillRect(0, 0, self.width, self.height)
    ctx.strokeStyle = "black"
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(self.width, 0)
    ctx.lineTo(self.width, self.height)
    ctx.moveTo(0, 0)
    ctx.lineTo(0, self.height)
    ctx.stroke()
    return canvas
}
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke === 'undefined') {
      stroke = true;
    }
    if (typeof radius === 'undefined') {
      radius = 5;
    }
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
      var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
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
export {
    ComposerCache
}