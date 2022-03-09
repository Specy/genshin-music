import { IMPORT_NOTE_POSITIONS, APP_NAME, PITCHES, PitchesType } from "appConfig"
import { Column, ColumnNote, RecordedNote,SongDataType } from "./SongClasses"
import { ComposedSong } from "./ComposedSong"
import { numberToLayer, groupByIndex, mergeLayers, groupByNotes } from 'lib/Utils/Tools'
import clonedeep from 'lodash.clonedeep'
import { LayerIndex } from "types/GeneralTypes"

type OldNote = {
    key: string
    time: number
    l?: number
}
interface SongProps {
    //TODO add tempo changer type
    name: string
    data: SongDataType
    bpm: number
    pitch: PitchesType
    version: number,
    notes: RecordedNote[]
}
export type SerializedSong = SongProps 
export type OldFormatSong = SongProps & {
    isComposed: boolean,
    pitchLevel: number,
    songNotes: {
        key: string
        time: number
        l?: number
    }[],
    bitsPerPage: number,
    isEncrypted: boolean
}
export class Song {
	name: string
	version: number
	notes: RecordedNote[] 
	bpm: number
	pitch: PitchesType
	data: SongDataType
    timestamp: number
	constructor(name: string, notes? : RecordedNote[]) {
		this.name = name
		this.version = 1
		this.notes = notes || []
		this.bpm = 220
		this.pitch = "C"
		this.data = {
			isComposed: false,
			isComposedVersion: false,
			appName: APP_NAME
		}
        this.timestamp = 0
	}
    get isComposed(): false{
        return false
    }
    toOldFormat = () => {
        const song: OldFormatSong = {
            ...this.serialize(),
            isComposed: false,
            pitchLevel: PITCHES.indexOf(this.pitch),
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes : this.notes.map(note => {
                return {
                    time: note[1],
                    key: "1Key" + note[0]
                }
            })
        } 
        return song
    }
    static deserialize(obj:SerializedSong): Song{
        const { version, data, pitch, bpm, notes, name} = obj
        const song = new Song(name || 'Untitled')
        song.version = version || song.version
        song.data = {...song.data, ...data}
        song.pitch = pitch || song.pitch
        song.bpm = bpm || song.bpm
        song.notes = Array.isArray(notes) ? clonedeep(notes) : []
        return song
    }
    serialize = () => {
        return {
            name: this.name,
            version: this.version,
            data: {...this.data},
            pitch: this.pitch,
            bpm: this.bpm,
            notes: clonedeep(this.notes)
        }
    }
    toComposed = (precision = 4) => {
        let bpmToMs = Math.floor(60000 / this.bpm)
        let composed = new ComposedSong(this.name)
        composed.bpm = this.bpm
        composed.pitch = this.pitch
        const notes = this.notes
        //remove duplicates
        let converted = []
        if(precision === 1 ){
            const groupedNotes: RecordedNote[][] = []
            let previousTime = notes[0][1]
            while (notes.length > 0) {
                const row: RecordedNote[] = notes.length > 0 ? [notes.shift() as RecordedNote] : []
                let amount = 0
                if(row[0] !== undefined){
                    for (let i = 0; i < notes.length; i++) {
                        if (row[0][1] > notes[i][1] - bpmToMs / 9) amount++
                    }
                }
                groupedNotes.push([...row, ...notes.splice(0, amount)])
            }
            const columns:Column[] = [] 
            groupedNotes.forEach(notes => {
                let note = notes[0]
                if (!note) return
                const elapsedTime = note[1] - previousTime
                previousTime = note[1]
                const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
                const noteColumn = new Column()
                noteColumn.notes = notes.map(note => {
                    return new ColumnNote(note[0], numberToLayer(note[2] || 0))
                })
                columns.push(noteColumn)
            })
            columns.forEach(column => { //merges notes of different layer
                let groupedNotes = groupByIndex(column)
                column.notes = groupedNotes.map(group => {
                    group[0].layer = mergeLayers(group)
                    return group[0]
                })
            })
            converted = columns
        }else{
            let grouped = groupByNotes(notes, bpmToMs / 9)
            let combinations = [bpmToMs, Math.floor(bpmToMs / 2), Math.floor(bpmToMs / 4), Math.floor(bpmToMs / 8)]
            for (let i = 0; i < grouped.length; i++) {
                let column = new Column()
                column.notes = grouped[i].map(note => {
                    let columnNote = new ColumnNote(note[0])
                    if (note[2] === 0) columnNote.layer = "100"
                    else if (note[2] === 1) columnNote.layer = "100"
                    else if (note[2] === 2) columnNote.layer = "010"
                    //if (note[2] === 3) columnNote.layer = "110" //TODO check if layer 3 exists
                    else columnNote.layer = "100"
                    return columnNote
                })
                let next = grouped[i + 1] || [[0, 0, 0]]
                let difference = next[0][1] - grouped[i][0][1]
                let paddingColumns = []
                while (difference >= combinations[3]) {
                    if (difference / combinations[0] >= 1) {
                        difference -= combinations[0]
                        paddingColumns.push(0)
                    } else if (difference / combinations[1] >= 1 ) {
                        difference -= combinations[1]
                        if(precision <= 1) continue
                        paddingColumns.push(1)	
                    } else if (difference / combinations[2] >= 1) {
                        difference -= combinations[2]
                        if(precision <= 2) continue
                        paddingColumns.push(2)
                    } else if (difference / combinations[3] >= 1) {
                        difference -= combinations[3]
                        if(precision <= 3) continue
                        paddingColumns.push(3)
                    }
                }
                column.tempoChanger = paddingColumns.shift() || 0
                const finalPadding = paddingColumns.map((col, i) => {
                    const column = new Column()
                    column.tempoChanger = col
                    return column
                })
                converted.push(column, ...finalPadding)
            }
        }
        composed.columns = converted
        return composed
    }
    static fromOldFormat = (song: any) => {
        try {
            const converted = new Song(song.name || "Untitled")
            const bpm = Number(song.bpm)
            converted.bpm = isNaN(bpm) ? 220 : bpm
            converted.pitch = (PITCHES[song.pitchLevel || 0]) || "C"
            const notes: OldNote[] = song.songNotes.filter((note: OldNote, index: number, self: any) =>
                index === self.findIndex((n: OldNote) => {
                    return n.key.split('Key')[1] === note.key.split('Key')[1] && n.time === note.time
                })
            )
            notes.forEach((note) => {
                const data = note.key.split("Key")
                const layer = (note.l ?? Number(data[0])) as LayerIndex
                converted.notes.push([IMPORT_NOTE_POSITIONS[Number(data[1])], note.time, layer])
            })
    
            if ([true, "true"].includes(song.isComposed)) {
                return converted.toComposed()
            }
            return converted
        } catch (e) {
            console.log(e)
            return null
        }
    }
    toGenshin = () => {
        this.notes = this.notes.map(note => {
			note[0] = IMPORT_NOTE_POSITIONS[note[0]]
			return note
		})
        return this
    }
    clone = () => {
        const clone = new Song(this.name)
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.data = {...this.data}
        clone.notes = clonedeep(this.notes)
        return clone
    }
}
