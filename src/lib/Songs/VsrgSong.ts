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
        const song = new VsrgSong(obj.name)
        Song.deserializeTo(song, obj)
        song.tracks = obj.tracks.map(track => VsrgTrack.deserialize(track))
        return song
    }
    serialize(): SerializedVsrgSong {
        throw new Error("Method not implemented.");
    }
    clone(): VsrgSong {
        throw new Error("Method not implemented.");
    }
}



interface SerializedVsrgTrack{
    instrument: InstrumentName
    hitObjects: SerializedVsrgHitObject[]
    volume: number
    color: string
}
class VsrgTrack{
    instrument: InstrumentName
    hitObjects: VsrgHitObject[]
    volume: number = 100
    color: string = "white"
    constructor(instrument: InstrumentName, hitObjects?: VsrgHitObject[]){
        this.instrument = instrument ?? "Drum"
        this.hitObjects = hitObjects ?? []
    }
    serialize(): SerializedVsrgTrack{
        return {
            instrument: this.instrument,
            hitObjects: this.hitObjects.map(x => x.serialize()),
            volume: this.volume,
            color: this.color
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
    
    clone(){
        const track = new VsrgTrack(this.instrument, this.hitObjects.map(x => x.clone()))
        track.volume = this.volume
        track.color = this.color
        return track
    }
}


type SerializedVsrgHitObject = [
    index: number,
    timestamp: number,
    holdDuration: number,
    notes: number[]
]
class VsrgHitObject{
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
