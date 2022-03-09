import { EMPTY_LAYER, TempoChanger, TEMPO_CHANGERS } from "appConfig"
import { CombinedLayer, LayerIndex } from "types/GeneralTypes"

export class Column {
	notes: ColumnNote[]
	tempoChanger : number //TODO put the keys of the tempo changers here
	constructor() {
		this.notes = []
		this.tempoChanger = 0
	}
    clone = () => {
        const clone = new Column()
        clone.tempoChanger = this.tempoChanger
        clone.notes = this.notes.map(note => note.clone())
        return clone
    }
	addNote = (index: number) => {
		const note = new ColumnNote(index)
		this.notes.push(note)
		return note
	}
	setTempoChanger(changer:TempoChanger){
		this.tempoChanger = changer.id
	}
	getTempoChanger(){
		return TEMPO_CHANGERS[this.tempoChanger]
	}
	getNoteIndex = (index: number): number | null => {
		const result = this.notes.findIndex((n) => {
            return index === n.index
        })
		return result === -1 ? null : result
	}
}
export class ColumnNote {
	index: number
	layer: CombinedLayer
	constructor(index: number, layer: CombinedLayer = EMPTY_LAYER) {
		this.index = index
		this.layer = layer
	}
	setLayer(layerIndex: LayerIndex, value: '0' | '1'){
		if(layerIndex > this.layer.length) return
		const split = this.layer.split('')
		split[layerIndex] = value
		this.layer = split.join('') as CombinedLayer
		return this.layer
	}
	toggleLayer(layerIndex: LayerIndex){
		const split = this.layer.split('')
		const toToggle = split[layerIndex]
		split[layerIndex] = toToggle === '0' ? '1' : '0'
		this.layer = split.join('') as CombinedLayer
		return this.layer
	}
	isLayerToggled(layerIndex: LayerIndex){
		return this.layer[layerIndex] === '1'
	}
    clone = () => {
        return new ColumnNote(this.index, this.layer)
    }
}

interface ApproachingNoteProps{
	time: number
	index: number
	clicked?: boolean
	id?: number
}
export class ApproachingNote{
	time: number
	index: number
	clicked: boolean
	id: number
	constructor({time, index, clicked = false, id = 0}: ApproachingNoteProps){
		this.time = time
		this.index = index
		this.clicked = clicked
		this.id = id
	}
}
export type RecordedNote = [index:number, time:number,layer: LayerIndex]
export class Recording {
	start: number
	notes: RecordedNote[]
	constructor() {
		this.start = new Date().getTime()
		this.notes = []
	}
	init = () => {
		this.start = new Date().getTime() - 100
		console.log("Started new recording")
	}
	addNote = (index:number) => {
		if (this.notes.length === 0) this.init()
		const currentTime = new Date().getTime()
		const note:RecordedNote = [index, currentTime - this.start,0]
		this.notes.push(note)
	}
}


export type SongDataType = {
    isComposed: boolean
    isComposedVersion: boolean,
    appName: string
}