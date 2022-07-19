import { Pitch } from "appConfig";
import { InstrumentName } from "types/GeneralTypes";
import { SerializedSong, Song } from "./Song";


type SerializedVsrgSong = SerializedSong & {
    type: "vsrg"
    tracks: SerializedVsrgTrack[]
}

export class VsrgSong extends Song<VsrgSong, SerializedVsrgSong, 1>{
    tracks: VsrgTrack[] = []
    constructor(name: string){
        super(name, 1, "vsrg")
    }
    static deserialize(obj: SerializedVsrgSong): VsrgSong {
        const song = Song.deserializeTo(new VsrgSong(obj.name), obj)
        song.tracks = obj.tracks.map(track => VsrgTrack.deserialize(track))
        return song
    }

    addTrack(instrument?: InstrumentName){
        const track = new VsrgTrack(instrument ?? "DunDun")
        this.tracks.push(track)
        this.tracks = [...this.tracks]
        return track
    }
    deleteTrack(index:number){
        this.tracks.splice(index, 1)
        this.tracks = [...this.tracks]
    }

    serialize(): SerializedVsrgSong {
        return {
            id: this.id,
            type: "vsrg",
            folderId: this.folderId,
            name: this.name,
            data: this.data,
            bpm: this.bpm,
            pitch: this.pitch,
            version: 1,
            tracks: this.tracks.map(track => track.serialize()),
            instruments: this.instruments.map(instrument => instrument.serialize())
        }
    }
    set(data: Partial<VsrgSong>){
		Object.assign(this, data)
		return this
	}
    clone(): VsrgSong {
        const clone = new VsrgSong(this.name)
        clone.id = this.id
        clone.folderId = this.folderId
        clone.bpm = this.bpm
        clone.data = { ...this.data }
        clone.version = this.version
        clone.pitch = this.pitch
        clone.instruments = this.instruments.map(ins => ins.clone())
        clone.tracks = this.tracks.map(track => track.clone())
        return clone
    }
}



interface SerializedVsrgTrack{
    instrument: InstrumentName
    alias: string
    pitch: Pitch
    hitObjects: SerializedVsrgHitObject[]
    volume: number
    color: string
}
export class VsrgTrack{
    instrument: InstrumentName
    pitch: Pitch = "C"
    hitObjects: VsrgHitObject[]
    volume: number = 100
    color: string = "white"
    alias: string = ""
    constructor(instrument: InstrumentName, alias?:string,  hitObjects?: VsrgHitObject[]){
        this.instrument = instrument ?? "Drum"
        this.hitObjects = hitObjects ?? []
        this.alias = alias ?? ""
    }
    serialize(): SerializedVsrgTrack{
        return {
            instrument: this.instrument,
            hitObjects: this.hitObjects.map(x => x.serialize()),
            volume: this.volume,
            color: this.color,
            alias: this.alias,
            pitch: this.pitch
        }
    }
    static deserialize(data: SerializedVsrgTrack){
        const track = new VsrgTrack(data.instrument)
        track.hitObjects = data.hitObjects.map(x => VsrgHitObject.deserialize(x))
        track.volume = data.volume
        track.color = data.color
        return track
    }
    createHitObjectAt(time: number, index: number){
        const hitObject = new VsrgHitObject(index, time)
        this.hitObjects.push(hitObject)
        return hitObject
    }
    set(data: Partial<VsrgTrack>){
		Object.assign(this, data)
		return this
	}
    clone(){
        const track = new VsrgTrack(this.instrument,this.alias, this.hitObjects.map(x => x.clone()))
        track.volume = this.volume
        track.color = this.color
        track.pitch = this.pitch
        track.alias = this.alias
        return track
    }
}


type SerializedVsrgHitObject = [
    index: number,
    timestamp: number,
    holdDuration: number,
    notes: number[]
]
export class VsrgHitObject{
    index: number
    timestamp: number
    notes: number[] = []
    holdDuration: number = 0
    constructor(index:number, timestamp: number) {
        this.index = index
        this.timestamp = timestamp
    }
    static deserialize(data: SerializedVsrgHitObject): VsrgHitObject {
        const hitObject = new VsrgHitObject(data[0], data[1])
        hitObject.holdDuration = data[2]
        hitObject.notes = [...data[3]]
        return hitObject
    }
    serialize(): SerializedVsrgHitObject {
        return [
            this.index,
            this.timestamp,
            this.holdDuration,
            [...this.notes]
        ]
    }
    clone(): VsrgHitObject {
        const hitObject = new VsrgHitObject(this.index, this.timestamp)
        hitObject.notes = [...this.notes]
        hitObject.holdDuration = this.holdDuration
        return hitObject
    }
}
