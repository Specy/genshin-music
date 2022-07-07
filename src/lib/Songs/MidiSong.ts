import { Midi, MidiJSON } from "@tonejs/midi";
import { ComposedSong } from "./ComposedSong";
import { RecordedSong } from "./RecordedSong";
import { SerializedSong, Song } from "./Song";


type SerializedMidiSong = SerializedSong & {
    song: MidiJSON
}



export class MidiSong extends Song{
    song: Midi
    constructor(song?: Midi){
        super(song?.name || "Untitled", 1, "midi")
        this.song = song || new Midi()
    }

    static deserialize(data: SerializedMidiSong): MidiSong{
        const parsed = new MidiSong()
        parsed.song.fromJSON(data.song)
        return parsed
    }
    toMidi(): Midi {
        return this.song
    }
    toRecordedSong(): RecordedSong {
        return new RecordedSong(this.name)
    }
    toComposedSong(): ComposedSong {
        return new ComposedSong(this.name)
    }
    toGenshin() {
        
    }
    clone(){

    }
    serialize(): SerializedMidiSong {
        return {
            id: this.id,
            type: "midi",
            folderId: this.folderId,
            name: this.name,
            data: this.data,
            bpm: this.bpm,
            pitch: this.pitch,
            version: 1,
            song: this.song.toJSON()
        }
    }
}