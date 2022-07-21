import { Pitch } from "appConfig";
import { InstrumentName } from "types/GeneralTypes";
import { SerializedSong, Song } from "./Song";

export type VsrgSongKeys = 4 | 6 | 8
type SerializedVsrgSong = SerializedSong & {
    type: "vsrg"
    tracks: SerializedVsrgTrack[]
    keys: VsrgSongKeys
}
export class VsrgSong extends Song<VsrgSong, SerializedVsrgSong, 1>{
    tracks: VsrgTrack[] = []
    keys: VsrgSongKeys = 4
    duration: number = 2000
    constructor(name: string){
        super(name, 1, "vsrg")
        this.bpm = 100
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
    getHitObjectInTrack(trackIndex: number, timestamp: number, index: number){
        return this.tracks[trackIndex].getHitObjectAt(timestamp, index)
    }
    createHitObjectInTrack(trackIndex: number, timestamp: number, index: number){
        const hitObject = this.tracks[trackIndex].createHitObjectAt(timestamp, index)
        this.duration = Math.max(this.duration, timestamp)
        return hitObject
    }
    createHeldHitObject(trackIndex: number, timestamp: number, index: number){
        const hitObject = this.createHitObjectInTrack(trackIndex, timestamp, index)
        hitObject.isHeld = true
        return hitObject
    }
    setHeldHitObjectTail(trackIndex: number, hitObject: VsrgHitObject, duration: number){
        this.tracks[trackIndex].setHeldHitObjectTail(hitObject, duration)
    }
    removeHitObjectAt(trackIndex: number, timestamp: number, index: number){
        this.tracks[trackIndex].removeHitObjectAt(timestamp, index)
    }
    deleteTrack(index:number){
        this.tracks.splice(index, 1)
        this.tracks = [...this.tracks]
    }
    changeKeys(keys: VsrgSongKeys){
        this.keys = keys
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
            instruments: this.instruments.map(instrument => instrument.serialize()),
            keys: this.keys
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
        clone.keys = this.keys
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
    sortTrack(){
        this.hitObjects.sort((a, b) => a.timestamp - b.timestamp)
    }
    static deserialize(data: SerializedVsrgTrack){
        const track = new VsrgTrack(data.instrument)
        track.hitObjects = data.hitObjects.map(x => VsrgHitObject.deserialize(x))
        track.volume = data.volume
        track.color = data.color
        return track
    }
    getHitObjectAt(time: number, index: number){
        return this.hitObjects.find(x => x.timestamp === time && x.index === index) || null
    }
    createHitObjectAt(time: number, index: number){
        const exists = this.hitObjects.findIndex(x => x.timestamp === time && x.index === index)
        if(exists !== -1) return this.hitObjects[exists]
        const hitObject = new VsrgHitObject(index, time)
        this.hitObjects.push(hitObject)
        this.sortTrack()
        return hitObject
    }
    selectObjectsBetween(start: number, end: number, key?: number){
        return this.hitObjects.filter(x => 
            x.timestamp >= start 
         && x.timestamp <= end 
         && (key === undefined || x.index === key))
    }
    removeObjectsBetween(start: number, end: number, key?: number){
        const objects = this.selectObjectsBetween(start, end, key)
        objects.forEach(x => this.removeHitObjectAt(x.timestamp, x.index))
    }
    setHeldHitObjectTail(hitObject: VsrgHitObject,  duration: number){
        const removeBound = hitObject.timestamp + duration
        const toRemove = this.selectObjectsBetween(hitObject.timestamp, removeBound, hitObject.index)
        toRemove.forEach(x => x !== hitObject && this.removeHitObjectAt(x.timestamp, x.index))
        if(duration < 0){
            hitObject.holdDuration = Math.abs(duration)
            hitObject.timestamp = removeBound
        }else{
            hitObject.holdDuration = duration
        }
    }
    removeHitObjectAt(time: number, index:number){
        const indexOf = this.hitObjects.findIndex(x => x.timestamp === time && x.index === index)
        if(indexOf === -1) return
        this.hitObjects.splice(indexOf, 1)
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
    isHeld: boolean = false
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
    toggleNote(note: number){
        const exists = this.notes.find(x => x === note)
        if(exists !== undefined) return this.removeNote(note)
        this.setNote(note)
    }
    setNote(note: number){
        if(this.notes.includes(note)) return
        this.notes = [...this.notes, note]
    }
    removeNote(note: number){
        const index = this.notes.indexOf(note)
        if(index === -1) return
        this.notes.splice(index, 1)
        this.notes = [...this.notes]
    }
    clone(): VsrgHitObject {
        const hitObject = new VsrgHitObject(this.index, this.timestamp)
        hitObject.notes = [...this.notes]
        hitObject.holdDuration = this.holdDuration
        return hitObject
    }
}
