import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, NOTE_NAMES, LAYOUT_DATA, PitchesType } from "appConfig"
import LoggerStore from "stores/LoggerStore";
import * as workerTimers from 'worker-timers';
import cloneDeep from 'lodash.clonedeep'
import { Column } from "./SongClasses";


function capitalize(str:string){
	return str.charAt(0).toUpperCase() + str.slice(1);
}
class FileDownloader {
	dataType: string
	constructor(type:string = "text/json") {
		this.dataType = "data:" + type + ";charset=utf-8,"
	}
	download = (file:any, name:string) => {
		let data = this.dataType + encodeURIComponent(file)
		const el = document.createElement("a")
		el.style.display = 'none'
		document.body.appendChild(el)
		el.setAttribute("href", data)
		el.setAttribute("download", name)
		el.click();
		el.remove();
	}
	static download = (file:any, name:string, as: string = "text/json") => {
		const data = as + encodeURIComponent(file)
		const el = document.createElement("a")
		el.style.display = 'none'
		document.body.appendChild(el)
		el.setAttribute("href", data)
		el.setAttribute("download", name)
		el.click();
		el.remove();
	}
}

const TempoChangers = [
	{
		id: 0,
		text: "1",
		changer: 1,
		color: 0x515c6f
	}, {
		id: 1,
		text: "1/2",
		changer: 1 / 2,
		color: 0x517553
	}, {
		id: 2,
		text: "1/4",
		changer: 1 / 4,
		color: 0x434c7d
	}, {
		id: 3,
		text: "1/8",
		changer: 1 / 8,
		color: 0x774D6D
	}
]



class MIDINote{
	index:number
	midi:number
	status: 'wrong' | 'right'
	constructor(index: number = 0,midi:number = 0){
		this.index = index
		this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
	}
}

class MIDIShortcut{
	type: any //TODO what is this
	midi:number
	status: 'wrong' | 'right'
    constructor(type: any, midi:number){
        this.type = type
        this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
    }
}
export type NoteNameTypes = 'Note name' | 'Keyboard layout' | 'Do Re Mi' | 'ABC' | 'No Text'
function getNoteText(
		noteNameType:NoteNameTypes, 
		index: number, 
		pitch: PitchesType, 
		layoutLength: keyof typeof LAYOUT_DATA
	) {
    try {
		const layout = LAYOUT_DATA[layoutLength]
		//@ts-ignore
        if (noteNameType === "Note name") return NOTE_NAMES[APP_NAME][PITCHES.indexOf(pitch)][index]
        if (noteNameType === "Keyboard layout") return layout.keyboardLayout[index]
        if (noteNameType === "Do Re Mi") return layout.mobileLayout[index]
		if (noteNameType === "ABC") return layout.abcLayout[index]
		if( noteNameType === "No Text") return ''
    } catch (e) { }
    return ''
}

function NotesTable(length: number){
	return new Array(length).fill(0).map(() => {return []})
}


function prepareSongImport(song: any): Song | ComposedSong {
	if (Array.isArray(song) && song.length > 0) song = song[0]
	const type = getSongType(song)
	if (type === "none") {
		//TODO maybe not the best place to have these
		LoggerStore.error("Invalid song")
		throw new Error("Error Invalid song")
	}
	if (type === "oldSky") {
		song = oldSkyToNewFormat(song)
	}
	if (APP_NAME === 'Sky' && song.data?.appName !== 'Sky') {
		LoggerStore.error("Invalid song")
		throw new Error("Error Invalid song")
	}
	if (APP_NAME === 'Genshin' && song.data?.appName === 'Sky') {
		song = newSkyFormatToGenshin(song)
	}
	return song
}


function getSongType(song:any): 'oldSky' | 'none' | 'newComposed' | 'newRecorded' {
	try {
		if (song.data === undefined) {
			//oldSky format
			song.pitchLevel = song.pitchLevel || 0
			if (song.songNotes !== undefined) {
				return "oldSky"
			}
		} else {
			//current format
			if (song.data.isComposedVersion) {
				if (typeof song.name !== "string") return "none"
				if (typeof song.bpm !== "number") return "none"
				if (!PITCHES.includes(song.pitch)) return "none"
				if (Array.isArray(song.breakpoints)) {
					if (song.breakpoints.length > 0) {
						if (typeof song.breakpoints[0] !== "number") return "none"
					}
				} else {
					return "none"
				}
				if (Array.isArray(song.columns)) {
					if (song.columns.length > 0) {
						let column = song.columns[0]
						if (typeof column[0] !== "number") return "none"
					}
				} else {
					return "none"
				}
				return "newComposed"
			} else {
				if (typeof song.name !== "string") return "none"
				if (typeof song.bpm !== "number") return "none"
				if (!PITCHES.includes(song.pitch)) return "none"
				return "newRecorded"
			}
		}

	} catch (e) {
		console.log(e)
		return "none"
	}
	return "none"
}

function newSkyFormatToGenshin(song: Song | ComposedSong) {
	if (song.data.isComposedVersion) {
		//TODO add these to the classes of the songs
		song.instruments = song.instruments.map(instrument => INSTRUMENTS[0])
		song.columns.forEach(column => {
			column[1] = column[1].map(note => {
				return [IMPORT_NOTE_POSITIONS[note[0]], note[1]]
			})

		})
	}
	if (!song.data.isComposedVersion) {
		song.notes = song.notes.map(note => {
			note[0] = IMPORT_NOTE_POSITIONS[note[0]]
			return note
		})
	}
	return song
}



function groupByNotes(notes, threshold) {
	let result = []
	while (notes.length > 0) {
		let row = [notes.shift()]
		let amount = 0
		for (let i = 0; i < notes.length; i++) {
			if (row[0][1] > notes[i][1] - threshold) amount++
		}
		result.push([...row, ...notes.splice(0, amount)])
	}
	return result
}



function getPitchChanger(pitch: PitchesType) {
	let index = PITCHES.indexOf(pitch)
	if (index < 0) index = 0
	return Number(Math.pow(2, index / 12).toFixed(4))
}

//TODO make this return actual type of layers
function numberToLayer(number: 0 | 1 | 2) : string {
	let layer = "100"
	if (number === 0) layer = "100"
	if (number === 1) layer = "010"
	if (number === 2) layer = "001"
	return layer
}

function mergeLayers(notes: ColumnNote[]) {
	let final = "000".split("")
	notes.forEach(note => {
		note.layer.split("").forEach((e, i) => {
			if (e === "1") final[i] = "1"
		})
	})
	return final.join("")
}

//TODO do this
function groupByIndex(column: Column) {
	const notes = []
	column.notes.forEach(note => {
		if (notes[note.index]) {
			notes[note.index].push(note)
		} else {
			notes[note.index] = [note]
		}
	})
	return notes.filter(e => Array.isArray(e))
}

function delayMs(ms: number) {
    return new Promise(resolve => {
        workerTimers.setTimeout(resolve, ms)
    })
}

export {
	FileDownloader,
	TempoChangers,
	getPitchChanger,
	getSongType,
	newSkyFormatToGenshin,
	prepareSongImport,
	groupByNotes,
	numberToLayer,
	mergeLayers,
	groupByIndex,
	delayMs,
	NotesTable,
	MIDINote,
	getNoteText,
	MIDIShortcut,
	capitalize
}