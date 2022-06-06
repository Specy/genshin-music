import { APP_NAME, PITCHES, NOTE_NAMES, LAYOUT_DATA, Pitch, TEMPO_CHANGERS, isTwa } from "appConfig"
import * as workerTimers from 'worker-timers';
import { Column, RecordedNote } from "./SongClasses";
import { ComposedSong } from "./ComposedSong";
import { Song } from "./Song";
import { ColumnNote } from "./SongClasses";
import { LayerIndex, NoteNameType } from "types/GeneralTypes";
import { NoteLayer } from "./Layer";

class FileDownloader {
	static download(file: string | Blob, name: string, as: string = "text/json"){
		const a = document.createElement("a")
		a.style.display = 'none'
		a.download = name
		document.body.appendChild(a)

		if(typeof file === "string"){
			a.href = `data:${as};charset=utf-8,${encodeURIComponent(file)}`
			a.click();
		}
		if(file instanceof Blob){
			const url = URL.createObjectURL(file)
			a.href = url
			a.click();
			URL.revokeObjectURL(url)
		}
		a.remove();
	}
}





class MIDINote {
	index: number
	midi: number
	status: 'wrong' | 'right' | 'clicked'
	constructor(index: number = 0, midi: number = 0) {
		this.index = index
		this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
	}
}

class MIDIShortcut {
	type: string
	midi: number
	status: 'wrong' | 'right' | 'clicked'
	constructor(type: string, midi: number) {
		this.type = type
		this.midi = midi
		this.status = midi < 0 ? 'wrong' : 'right'
	}
}



function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function getNoteText(
	noteNameType: NoteNameType,
	index: number,
	pitch: Pitch,
	layoutLength: keyof typeof LAYOUT_DATA
) {
	try {
		const layout = LAYOUT_DATA[layoutLength]
		//@ts-ignore
		if (noteNameType === "Note name") return NOTE_NAMES[APP_NAME][PITCHES.indexOf(pitch)][index]
		if (noteNameType === "Keyboard layout") return layout.keyboardLayout[index]
		if (noteNameType === "Do Re Mi") return layout.mobileLayout[index]
		if (noteNameType === "ABC") return layout.abcLayout[index]
		if (noteNameType === "No Text") return ''
	} catch (e) { }
	return ''
}

class Array2d {
	static from(height: number) {
		return new Array(height).fill(0).map(() => { return [] })
	}
}


function formatMs(ms: number) {
	const minutes = Math.floor(ms / 60000);
	const seconds = Number(((ms % 60000) / 1000).toFixed(0))
	return (
		seconds === 60
			? (minutes + 1) + ":00"
			: minutes + ":" + (seconds < 10 ? "0" : "") + seconds
	)
}

function setIfInTWA() {
	if (isTwa()) return console.log('inTWA')
	const isInTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', JSON.stringify(isInTwa))
}

function parseSong(song: any): Song | ComposedSong {
	song = Array.isArray(song) ? song[0] : song
	const type = getSongType(song)
	if (type === "none") {
		throw new Error("Error Invalid song")
	}
	if (type === "oldSky") {
		const parsed = Song.fromOldFormat(song)
		if (parsed === null) {
			throw new Error("Error Invalid song")
		}
		return parsed
	}
	if (APP_NAME === 'Sky' && song.data?.appName !== 'Sky') {
		throw new Error("Error Invalid song")
	}
	if (APP_NAME === 'Genshin' && song.data?.appName === 'Sky') {
		if (song.data?.isComposedVersion) return ComposedSong.deserialize(song).toGenshin()
		return Song.deserialize(song).toGenshin()
	}
	if (type === 'newComposed') return ComposedSong.deserialize(song)
	if (type === 'newRecorded') return Song.deserialize(song)
	throw new Error("Error Invalid song")
}

//TODO improve this detection
function getSongType(song: any): 'oldSky' | 'none' | 'newComposed' | 'newRecorded' {
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
						const column = song.columns[0]
						if (typeof column[0] !== "number") return "none"
					}
					return "newComposed"
				} else {
					return "none"
				}
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


function groupByNotes(notes: RecordedNote[], threshold: number) {
	const result = []
	while (notes.length > 0) {
		const row = [notes.shift() as RecordedNote]
		let amount = 0
		for (let i = 0; i < notes.length; i++) {
			if (row[0].time > notes[i].time - threshold) amount++
		}
		result.push([...row, ...notes.splice(0, amount)])
	}
	return result
}

function getPitchChanger(pitch: Pitch) {
	let index = PITCHES.indexOf(pitch)
	if (index < 0) index = 0
	return Number(Math.pow(2, index / 12).toFixed(4))
}
function calculateSongLength(columns: Column[], bpm: number, end: number) {
	const bpmPerMs = Math.floor(60000 / bpm)
	let totalLength = 0
	let currentLength = 0
	let increment = 0
	for (let i = 0; i < columns.length; i++) {
		increment = bpmPerMs * TEMPO_CHANGERS[columns[i].tempoChanger].changer
		if (i < end) currentLength += increment
		totalLength += increment
	}
	return {
		total: totalLength,
		current: currentLength
	}
}
const NUMBER_TO_LAYER_MAP = {
	0: "1000",
	1: "0100",
	2: "0010",
	3: "0001"
}

function mergeLayers(notes: ColumnNote[]) {
	const merged = new NoteLayer()
	notes.forEach(note => {
		note.layer.toArray().forEach((e, i) => {
			if (e === 1) merged.set(i, true)
		})
	})
	return merged
}
function groupNotesByIndex(column: Column) {
	const notes: ColumnNote[][] = []
	column.notes.forEach(note => {
		if (notes[note.index]) {
			notes[note.index].push(note)
		} else {
			notes[note.index] = [note]
		}
	})
	return notes.filter(e => Array.isArray(e))
}

function delay(ms: number) {
	return new Promise(resolve => {
		workerTimers.setTimeout(resolve, ms)
	})
}

function nearestEven(num: number) {
	return 2 * Math.round(num / 2);
}

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

export {
	FileDownloader,
	getPitchChanger,
	getSongType,
	parseSong,
	groupByNotes,
	mergeLayers,
	groupNotesByIndex,
	delay,
	Array2d,
	MIDINote,
	getNoteText,
	MIDIShortcut,
	capitalize,
	clamp,
	nearestEven,
	formatMs,
	calculateSongLength,
	setIfInTWA
}