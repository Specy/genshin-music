import { LayerIndexes } from "types/GeneralTypes"

export class Column {
	notes: ColumnNote[] //TODO make sure its this
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
}
export class ColumnNote {
	index: number
	layer: string //TODO put this as combination of layers
	constructor(index: number, layer = "000") {
		this.index = index
		this.layer = layer
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
export type RecordedNote = [index:number, time:number,layer: LayerIndexes] //TODO make this better
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