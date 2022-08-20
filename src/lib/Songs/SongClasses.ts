import { APP_NAME, INSTRUMENTS, MIDI_BOUNDS, MIDI_MAP_TO_NOTE, NOTE_MAP_TO_MIDI, Pitch, TempoChanger, TEMPO_CHANGERS } from "@/appConfig"
import { InstrumentName } from "$types/GeneralTypes"
import { NoteLayer } from "../Layer"
import { InstrumentNoteIcon } from "./ComposedSong"

export type SerializedColumn = [tempoChanger: number, notes: SerializedColumnNote[]]

export class Column {
	notes: ColumnNote[]
	tempoChanger: number //TODO put the keys of the tempo changers here
	constructor() {
		this.notes = []
		this.tempoChanger = 0
	}
	clone(){
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
	getNoteIndex = (index: number): number | null => {
		const result = this.notes.findIndex((n) => index === n.index)
		return result === -1 ? null : result
	}
	getTempoChanger() {
		return TEMPO_CHANGERS[this.tempoChanger]
	}
}
const instrumentNoteMap = new Map([['border', 1], ['circle', 2], ['line', 3]])
export interface SerializedInstrumentData{
    name: InstrumentName
    volume: number
    pitch: Pitch | ""
    visible: boolean
    icon: InstrumentNoteIcon
	alias: string
}
export class InstrumentData{
    name: InstrumentName = INSTRUMENTS[0]
    volume: number = APP_NAME === 'Genshin' ? 90 : 100
    pitch: Pitch | "" = ""
    visible: boolean = true
    icon: InstrumentNoteIcon = 'circle'
	alias = ''
	muted = false
	constructor(data: Partial<InstrumentData> = {}) {
		Object.assign(this, data)
	}
	serialize(): SerializedInstrumentData{
		return {
			name: this.name,
			volume: this.volume,
			pitch: this.pitch,
			visible: this.visible,
			icon: this.icon,
			alias: this.alias
		}
	}
	static deserialize(data: SerializedInstrumentData): InstrumentData{
		return new InstrumentData().set({
			name: data.name ?? INSTRUMENTS[0],
			volume: data.volume ?? 100,
			pitch: data.pitch ?? "C",
			visible: data.visible ?? true,
			icon: data.icon ?? 'circle',
			alias: data.alias ?? ""
		})
	}
	set(data: Partial<InstrumentData>){
		Object.assign(this, data)
		return this
	}
	toNoteIcon(){
		return instrumentNoteMap.get(this.icon) || 0
	}
	clone(){
		return new InstrumentData(this)
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
	switchLayer(from: number, to: number) {
		const isToggled = this.layer.test(from)
		if(isToggled) this.layer.set(to, true)
		this.layer.set(from, false)
	}
	swapLayer(layer1: number, layer2: number){
		const tmp = this.layer.test(layer1)
		this.layer.set(layer1, this.layer.test(layer2))
		this.layer.set(layer2, tmp)
	}
	clearLayer(){
		this.layer.setData(0)
	}

	setLayer(layerIndex: number, value: boolean) {
		this.layer.set(layerIndex, value)
		return this.layer
	}
	toggleLayer(layerIndex: number) {
		this.layer.toggle(layerIndex)
		return this.layer
	}
	isLayerToggled(layerIndex: number) {
		return this.layer.test(layerIndex)
	}
	clone(){
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
		this.layer = layer || new NoteLayer(1)
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
	clone(){
		return new RecordedNote(this.index, this.time, this.layer.clone())
	}
}
export class Recording {
	startTimestamp: number
	notes: RecordedNote[]
	constructor() {
		this.startTimestamp = Date.now()
		this.notes = []
	}
	start = () => {
		this.startTimestamp = Date.now() - 100
		console.log("Started new recording")
	}
	addNote = (index: number) => {
		if (this.notes.length === 0) this.start()
		const currentTime = Date.now()
		const note: RecordedNote = new RecordedNote(index, currentTime - this.startTimestamp)
		this.notes.push(note)
	}
}

export type SongData = {
	isComposed: boolean
	isComposedVersion: boolean,
	appName: string
}
export type ParsedMidiNote = {
    note: number
    isAccidental: boolean
    outOfRangeBound: 1 | -1 | 0
}

export class MidiNote {
    time: number
    data: ParsedMidiNote
    layer: number
    constructor(time: number, layer: number, data?: ParsedMidiNote,) {
        this.time = time
        this.data = data || {
            note: -1,
            isAccidental: false,
            outOfRangeBound: 0
        }
        this.layer = layer
    }
    static fromMidi(layer: number, time: number, midiNote: number){
        const toReturn = new MidiNote(time, layer)
        const note = (MIDI_MAP_TO_NOTE.get(`${midiNote}`) || [-1, false]) as [note: number, isAccidental: boolean]
        toReturn.data = {
            note: note[0],
            isAccidental: note[1],
            outOfRangeBound: 0
        }
        if(midiNote > MIDI_BOUNDS.upper) toReturn.data.outOfRangeBound = 1
        if(midiNote < MIDI_BOUNDS.lower) toReturn.data.outOfRangeBound = -1
        return toReturn
    }
}