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

export type RecordedNote = [index:number, time:number,layer: 0 | 1 | 2] //TODO make this better
export class Recording {
	start: number
	notes: RecordedNote[] //TODO not sure
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