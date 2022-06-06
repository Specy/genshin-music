import { IMPORT_NOTE_POSITIONS, APP_NAME, PITCHES, Pitch } from "appConfig"
import { Column, ColumnNote, RecordedNote,SerializedRecordedNote,SongData } from "./SongClasses"
import { ComposedSong } from "./ComposedSong"
import { groupNotesByIndex, mergeLayers, groupByNotes } from 'lib/Tools'
import clonedeep from 'lodash.clonedeep'
import { NoteLayer } from "./Layer"

type OldNote = {
    key: string
    time: number
    l?: number
}
interface SongProps {
    id:string | null

    //TODO add tempo changer type
    name: string
    data: SongData
    bpm: number
    pitch: Pitch
    version: number,
}
export type SerializedSong = SongProps & {
    notes: SerializedRecordedNote[]
}

export type OldFormatSong = SerializedSong & {
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
    id: string | null
	name: string
	version: number
	notes: RecordedNote[] 
	bpm: number
	pitch: Pitch
	data: SongData
    timestamp: number
	constructor(name: string, notes? : RecordedNote[]) {
		this.name = name
		this.version = 1
		this.notes = notes || []
		this.bpm = 220
        this.id = null
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
                    time: note.time,
                    key: "1Key" + note.index
                }
            })
        } 
        return song
    }
    static deserialize(obj:SerializedSong): Song{
        const { version, data, pitch, bpm, notes, name, id} = obj
        const song = new Song(name || 'Untitled')
        song.version = version || song.version
        song.data = {...song.data, ...data}
        song.pitch = pitch || song.pitch
        song.bpm = bpm || song.bpm
        song.notes = Array.isArray(notes) ? clonedeep(notes) : []
        song.id = id
        return song
    }
    serialize = () => {
        const data: SerializedSong = {
            name: this.name,
            version: this.version,
            pitch: this.pitch,
            bpm: this.bpm,
            data: {...this.data},
            notes: this.notes.map(note => note.serialize()),
            id: this.id
        }
        return data
    }
    toComposed = (precision = 4) => {
        const bpmToMs = Math.floor(60000 / this.bpm)
        const song = new ComposedSong(this.name)
        song.bpm = this.bpm
        song.pitch = this.pitch
        const notes = this.notes
        //remove duplicates
        let converted = []
        if(precision === 1 ){
            const groupedNotes: RecordedNote[][] = []
            let previousTime = notes[0].time
            while (notes.length > 0) {
                const row: RecordedNote[] = notes.length > 0 ? [notes.shift() as RecordedNote] : []
                let amount = 0
                if(row[0] !== undefined){
                    for (let i = 0; i < notes.length; i++) {
                        if (row[0].time > notes[i].time - bpmToMs / 9) amount++
                    }
                }
                groupedNotes.push([...row, ...notes.splice(0, amount)])
            }
            const columns:Column[] = [] 
            groupedNotes.forEach(notes => {
                const note = notes[0]
                if (!note) return
                const elapsedTime = note.time - previousTime
                previousTime = note.time
                const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
                const noteColumn = new Column()
                noteColumn.notes = notes.map(note => {
                    return new ColumnNote(note.index, note.layer)
                })
                columns.push(noteColumn)
            })
            columns.forEach(column => { //merges notes of different layer
                const groupedNotes = groupNotesByIndex(column)
                column.notes = groupedNotes.map(group => {
                    group[0].layer = mergeLayers(group)
                    return group[0]
                })
            })
            converted = columns
        }else{
            const grouped = groupByNotes(notes, bpmToMs / 9)
            const combinations = [bpmToMs, Math.floor(bpmToMs / 2), Math.floor(bpmToMs / 4), Math.floor(bpmToMs / 8)]
            for (let i = 0; i < grouped.length; i++) {
                const column = new Column()
                column.notes = grouped[i].map(note => {
                    return new ColumnNote(note.index, note.layer.clone())
                })
                const next = grouped[i + 1] || [[0, 0, 0]]
                const paddingColumns = []
                let difference = next[0].time - grouped[i][0].time
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
        song.columns = converted
        return song
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
                const layer = new NoteLayer((note.l ?? Number(data[0])))
                const recordedNote = new RecordedNote(IMPORT_NOTE_POSITIONS[Number(data[1])], note.time,  layer)
                converted.notes.push(recordedNote)
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
        const clone = this.clone()
        if(clone.data.appName === 'Genshin') {
            console.warn("Song already in Genshin format")
            return clone
        }
        clone.data.appName = "Genshin"
        clone.notes = clone.notes.map(note => {
			note.index = IMPORT_NOTE_POSITIONS[note.index]
			return note
		})
        return clone
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
