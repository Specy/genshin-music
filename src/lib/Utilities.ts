import { APP_NAME, PITCHES, NOTE_NAMES, LAYOUT_DATA, Pitch, TEMPO_CHANGERS, isTwa } from "appConfig"
import * as workerTimers from 'worker-timers';
import { Column, RecordedNote } from "./Songs/SongClasses";
import { ColumnNote } from "./Songs/SongClasses";
import { NoteNameType } from "types/GeneralTypes";
import { NoteLayer } from "./Layer";

class FileDownloader {
	static download(file: string | Blob, name: string, as: string = "text/json"){
		const a = document.createElement("a")
		a.style.display = 'none'
		a.className = 'ignore_click_outside'
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

function blurEvent(e: any) {
	//@ts-ignore
	e?.target?.blur?.()
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
			if ((song.data.isComposedVersion === true) || song.type === 'composed') {
				if (typeof song.name !== "string") return "none"
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
			} else if((song.data.isComposedVersion === false) || song.type === 'recorded'){
				if (typeof song.name !== "string") return "none"
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
	setIfInTWA,
	blurEvent
}