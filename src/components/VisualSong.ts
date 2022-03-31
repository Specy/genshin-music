import { APP_NAME } from "appConfig"
import { ComposedSong } from "lib/ComposedSong"
import { Song } from "lib/Song"
import { RecordedNote } from "lib/SongClasses"
import { getNoteText } from "lib/Tools"

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}
type NoteDifference = {
    delay: number
    index: number
    layer: number
    time: number
}
function getChunkNoteText(i: number) {  
    const text = getNoteText(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', APP_NAME === "Genshin" ? 21 : 15)
    return APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
}
export class VisualSong{
    chunks: Chunk[] = []
    text: string = ''

    static noteDifferences(notes: RecordedNote[]){
        const parsed: NoteDifference[] = []
        //calculate the difference in time between the notes and push to the array 
        for (let i = 0; i < notes.length - 1; i++) {
            const delay = notes[i + 1][1] - notes[i][1]
            parsed.push({
                delay,
                index: notes[i][0],
                time: notes[i][1],
                layer: notes[i][2]
            })
        }
        return parsed
    }
    static from(song: Song | ComposedSong){
        const visualSong = new VisualSong()
        const parsed = song instanceof Song ? song : song.toSong()
        const notes = VisualSong.noteDifferences(parsed.notes)
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            const chunk = new Chunk([notes.shift() as NoteDifference])
            const startTime = chunk.notes.length > 0 ? chunk.notes[0].time : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                const difference = notes[j].delay - THRESHOLDS.joined //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift() as NoteDifference)
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0].delay - startTime : 0
            const emptyChunks = Math.floor(chunk.delay / THRESHOLDS.pause)
            visualSong.chunks.push(...new Array(emptyChunks).fill(0).map(() => new Chunk()))
            visualSong.chunks.push(chunk)
            visualSong.text += emptyChunks > 2 ? ' \n\n' : "- ".repeat(emptyChunks)
            if (chunk.notes.length > 1) {
                const text = chunk.notes.map(e => getChunkNoteText(e.index)).join('')
                visualSong.text  += APP_NAME === "Genshin" ? `[${text}] ` : `${text} `
            } else if (chunk.notes.length > 0) {
                visualSong.text  += `${getChunkNoteText(chunk.notes[0].index)} `
            }
        }
        return visualSong
    }
    addChunk(chunk: Chunk){
        this.chunks.push(chunk)

    }
}


export class Chunk {
    notes: NoteDifference[] = []
    delay = 0
    constructor(notes:NoteDifference[]  = [], delay:number = 0) {
        this.notes = notes
        this.delay = delay
    }

    
}