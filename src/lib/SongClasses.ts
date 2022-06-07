import { NOTE_MAP_TO_MIDI, TempoChanger, TEMPO_CHANGERS } from "appConfig"
import { LayerIndex } from "types/GeneralTypes"
import { NoteLayer } from "./Layer"

export type SerializedColumn = [tempoChanger: number, notes: SerializedColumnNote[]]

export class Column {
	notes: ColumnNote[]
	tempoChanger: number //TODO put the keys of the tempo changers here
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
	addNote(note: ColumnNote): ColumnNote
	addNote(index: number, layer?: NoteLayer): ColumnNote
	addNote(indexOrNote: number | ColumnNote, layer?: NoteLayer) {
		if (indexOrNote instanceof ColumnNote) {
			this.notes.push(indexOrNote)
			return indexOrNote
		}
		const note = new ColumnNote(indexOrNote, layer)
		this.notes.push(note)
		return note
	}

	serialize(): SerializedColumn{
		return [this.tempoChanger, this.notes.map(note => note.serialize())]
	}
	static deserialize(data: SerializedColumn): Column {
		const column = new Column()
		column.tempoChanger = data[0]
		column.notes = data[1].map(note => ColumnNote.deserialize(note)).filter(note => !note.layer.isEmpty())
		return column
	}
	addColumnNote = (note: ColumnNote) => {
		this.notes.push(note.clone())
	}
	removeAtIndex = (index: number) => {
		this.notes.splice(index, 1)
	}
	setTempoChanger(changer: TempoChanger) {
		this.tempoChanger = changer.id
	}
	getTempoChanger() {
		return TEMPO_CHANGERS[this.tempoChanger]
	}
	getNoteIndex = (index: number): number | null => {
		const result = this.notes.findIndex((n) => index === n.index)
		return result === -1 ? null : result
	}
}

export type SerializedColumnNote = [index: number, layer: string]
const SPLIT_EMPTY_LAYER = "0000".split("")

export class ColumnNote {
	index: number
	layer: NoteLayer
	constructor(index: number, layer?: NoteLayer) {
		this.index = index
		this.layer = layer || new NoteLayer()
	}
	static deserializeLayer = (layer: string): String => {
		for (let i = 0; i < layer.length; i++) {
			SPLIT_EMPTY_LAYER[i] = layer[i]
		}
		return SPLIT_EMPTY_LAYER.join('')
	}
	static deserialize(serialized: SerializedColumnNote): ColumnNote {
		return  new ColumnNote(serialized[0], NoteLayer.deserializeHex(serialized[1]))
	}

	serialize(): SerializedColumnNote {
		return [this.index, this.layer.serializeHex()]
	}

	clearLayer(){
		this.layer.setData(0)
	}

	setLayer(layerIndex: LayerIndex, value: boolean) {

		this.layer.set(layerIndex, value)
		return this.layer
	}
	toggleLayer(layerIndex: LayerIndex) {
		this.layer.toggle(layerIndex)
		return this.layer
	}
	isLayerToggled(layerIndex: LayerIndex) {
		return this.layer.test(layerIndex)
	}
	clone = () => {
		return new ColumnNote(this.index, this.layer.clone())
	}
}

interface ApproachingNoteProps {
	time: number
	index: number
	clicked?: boolean
	id?: number
}
export class ApproachingNote {
	time: number
	index: number
	clicked: boolean
	id: number
	constructor({ time, index, clicked = false, id = 0 }: ApproachingNoteProps) {
		this.time = time
		this.index = index
		this.clicked = clicked
		this.id = id
	}
}

export type SerializedRecordedNote = [index: number, time: number, layer: string]

export class RecordedNote {
	index: number
	time: number
	layer: NoteLayer
	constructor(index?: number, time?: number, layer?: NoteLayer) {
		this.index = index || 0
		this.time = time || 0
		this.layer = layer || new NoteLayer()
	}
	setLayer(layer: number, value: boolean) {
		this.layer.set(layer, value)
	}
	toMidi(){
		return NOTE_MAP_TO_MIDI.get(this.index)
	}
	serialize(): SerializedRecordedNote {
		return [this.index, this.time, this.layer.serializeHex()]
	}
	static deserialize(data: SerializedRecordedNote) {
		return new RecordedNote(data[0], data[1], NoteLayer.deserializeHex(data[2]))
	}
	clone = () => {
		return new RecordedNote(this.index, this.time, this.layer.clone())
	}
}
export class Recording {
	startTimestamp: number
	notes: RecordedNote[]
	constructor() {
		this.startTimestamp = new Date().getTime()
		this.notes = []
	}
	start = () => {
		this.startTimestamp = new Date().getTime() - 100
		console.log("Started new recording")
	}
	addNote = (index: number) => {
		if (this.notes.length === 0) this.start()
		const currentTime = new Date().getTime()
		const note: RecordedNote = new RecordedNote(index, currentTime - this.startTimestamp)
		this.notes.push(note)
	}
}

export type SongData = {
	isComposed: boolean
	isComposedVersion: boolean,
	appName: string
}
