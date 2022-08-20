import { InstrumentName } from "$types/GeneralTypes";
import { RecordedSong } from "./RecordedSong";
import { SerializedSong, Song } from "./Song";
import { InstrumentData, RecordedNote, SerializedInstrumentData } from "./SongClasses";

export type VsrgSongKeys = 4 | 6
export type SerializedVsrgSong = SerializedSong & {
    type: "vsrg"
    trackModifiers: SerializedTrackModifier[]
    tracks: SerializedVsrgTrack[]
    keys: VsrgSongKeys
    duration: number
    audioSongId: string | null
    breakpoints: number[]
    difficulty: number
}
export class VsrgSong extends Song<VsrgSong, SerializedVsrgSong, 1>{
    tracks: VsrgTrack[] = []
    keys: VsrgSongKeys = 4
    duration: number = 60000
    audioSongId: string | null = null
    trackModifiers: VsrgTrackModifier[] = []
    breakpoints: number[] = []
    difficulty: number = 5
    constructor(name: string){
        super(name, 1, "vsrg")
        this.bpm = 100
    }
    static deserialize(obj: SerializedVsrgSong): VsrgSong {
        const song = Song.deserializeTo(new VsrgSong(obj.name), obj)
        song.tracks = (obj.tracks ?? []).map(track => VsrgTrack.deserialize(track))
        song.audioSongId = obj.audioSongId ?? null
        song.trackModifiers = (obj.trackModifiers ?? []).map(modifier => VsrgTrackModifier.deserialize(modifier))
        song.duration = obj.duration ?? 60000
        song.keys = obj.keys ?? 4
        song.breakpoints = obj.breakpoints ?? []
        return song
    }

    setAudioSong(song: Song){
        if(this.audioSongId === song.id) return
        this.audioSongId = song.id
        this.trackModifiers = song.instruments.map(ins => {
            const modifier = new VsrgTrackModifier()
            modifier.alias = ins.alias || ins.name
            return modifier
        })
    }
    setDurationFromNotes(notes: RecordedNote[]){
        const duration = notes.reduce((max, note) => Math.max(max, note.time), 0)
        this.duration = this.duration < duration ? duration : this.duration
        return duration
    }
    toGenshin() {
        return this
        //TODO implement
    }
    startPlayback(timestamp: number){
        this.tracks.forEach(track => track.startPlayback(timestamp))
    }
    tickPlayback(timestamp: number){
        return this.tracks.map(track => track.tickPlayback(timestamp))
    }
    addTrack(instrument?: InstrumentName){
        const track = new VsrgTrack(instrument ?? "DunDun")
        this.tracks.push(track)
        this.tracks = [...this.tracks]
        return track
    }
    validateBreakpoints(){
        const breakpoints = this.breakpoints.filter(breakpoint => breakpoint < this.duration)
        breakpoints.sort((a,b) => a - b)
        this.breakpoints = breakpoints
    }
    setBreakpoint(timestamp: number, set: boolean){
        const index = this.breakpoints.findIndex(breakpoint => breakpoint === timestamp)
        if(index === -1 && set) this.breakpoints.push(timestamp)
        else if(index !== -1 && !set) this.breakpoints.splice(index, 1)
        this.validateBreakpoints()
    }
    getClosestBreakpoint(timestamp: number, direction: -1 | 1){
        const { breakpoints } = this
        const breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > timestamp)
            : breakpoints.filter((v) => v < timestamp)
        if (breakpoint.length === 0) {
            return direction === 1 ? this.duration : 0
        }
        return breakpoint[direction === 1 ? 0 : breakpoint.length - 1]
    }
    getRenderableNotes(song: RecordedSong){
        const notes:RecordedNote[] = []
        const trackModifiers = this.trackModifiers.map(modifier => !modifier.hidden)
        song.notes.forEach(note => {
            const renderable = trackModifiers.some((value, i) => {
                if(value) return note.layer.test(i)
                return false
            })
            if(renderable) notes.push(note)
        })
        return notes
    }
    getHitObjectsAt(timestamp: number, key: number){
        return this.tracks.map(track => track.getHitObjectAt(timestamp, key))
    }
    getHitObjectsBetween(start: number, end: number, key?:number) {
        return this.tracks.map(track => track.getObjectsBetween(start, end, key))
    }
    removeHitObjectsBetween(start: number, end: number, key?: number){
        this.tracks.forEach(track => track.removeObjectsBetween(start, end, key))
    }
    getHitObjectInTrack(trackIndex: number, timestamp: number, index: number){
        return this.tracks[trackIndex].getHitObjectAt(timestamp, index)
    }
    addHitObjectInTrack(trackIndex: number, hitObject: VsrgHitObject){
        this.tracks[trackIndex].addHitObject(hitObject)
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
        this.tracks.forEach((t,i) => i !== trackIndex && t.removeObjectsBetween(hitObject.timestamp, hitObject.timestamp + duration, hitObject.index))
        this.tracks[trackIndex].setHeldHitObjectTail(hitObject, duration)
    }
    removeHitObjectInTrack(trackIndex:number, hitObject: VsrgHitObject){
        this.tracks[trackIndex].removeHitObject(hitObject)
    }
    removeHitObjectInTrackAtTimestamp(trackIndex: number, timestamp: number, index: number){
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
            name: this.name,
            type: "vsrg",
            bpm: this.bpm,
            pitch: this.pitch,
            version: 1,
            keys: this.keys,
            data: this.data,
            id: this.id,
            audioSongId: this.audioSongId,
            folderId: this.folderId,
            duration: this.duration,
            tracks: this.tracks.map(track => track.serialize()),
            instruments: this.instruments.map(instrument => instrument.serialize()),
            trackModifiers: this.trackModifiers.map(modifier => modifier.serialize()),
            breakpoints: [...this.breakpoints],
            difficulty: this.difficulty,
        }
    }
    set(data: Partial<VsrgSong>){
		Object.assign(this, data)
		return this
	}
    clone(): VsrgSong {
        const clone = new VsrgSong(this.name)
        clone.set({
            id: this.id,
            folderId: this.folderId,
            bpm: this.bpm,
            data: {...this.data},
            version: this.version,
            pitch: this.pitch,
            keys: this.keys,
            duration: this.duration,
            audioSongId: this.audioSongId,
            trackModifiers: this.trackModifiers.map(modifier => modifier.clone()),
            tracks: this.tracks.map(track => track.clone()),
            instruments: this.instruments.map(instrument => instrument.clone()),
            breakpoints: [...this.breakpoints],
            difficulty: this.difficulty,
        })
        return clone
    }
}


interface SerializedTrackModifier{
    hidden: boolean
    muted: boolean
    alias: string
}
export class VsrgTrackModifier{
    hidden: boolean = false
    muted: boolean = false
    alias: string = ""

    static deserialize(obj: SerializedTrackModifier){
        return new VsrgTrackModifier().set({
            hidden: obj.hidden,
            muted: obj.muted,
            alias: obj.alias
        })
    }
    serialize(): SerializedTrackModifier{
        return {
            hidden: this.hidden,
            muted: this.muted,
            alias: this.alias
        }
    }
    clone(){
        return new VsrgTrackModifier().set({
            hidden: this.hidden,
            muted: this.muted
        })
    }
    set(data: Partial<VsrgTrackModifier>){
        Object.assign(this, data)
        return this
    }
}

interface SerializedVsrgTrack{
    instrument: SerializedInstrumentData
    hitObjects: SerializedVsrgHitObject[]
    color: string
}
export class VsrgTrack{
    instrument: InstrumentData
    hitObjects: VsrgHitObject[]
    color: string = '#FFFFFF'
    private lastPlayedHitObjectIndex: number = -1
    constructor(instrument?: InstrumentName, alias?:string,  hitObjects?: VsrgHitObject[]){
        this.instrument = new InstrumentData({ name: instrument ?? "DunDun", alias })
        this.hitObjects = hitObjects ?? []
    }
    static deserialize(data: SerializedVsrgTrack){
        const track = new VsrgTrack()
        track.instrument = InstrumentData.deserialize(data.instrument ?? {})
        track.hitObjects = (data.hitObjects ?? []).map(x => VsrgHitObject.deserialize(x))
        track.color = data.color ?? '#FFFFFF'
        return track
    }
    startPlayback(timestamp:number){
        this.lastPlayedHitObjectIndex = -1
        for(let i = 0; i < this.hitObjects.length; i++){
            if(this.hitObjects[i].timestamp >= timestamp) break
            this.lastPlayedHitObjectIndex = i
        }
    }
    tickPlayback(timestamp: number){
        const surpassed = []
        for(let i = this.lastPlayedHitObjectIndex + 1; i < this.hitObjects.length; i++){
            if(this.hitObjects[i].timestamp <= timestamp) {
                surpassed.push(this.hitObjects[i])
                this.lastPlayedHitObjectIndex = i
                continue
            }
            break
        }
        return surpassed
    }
    serialize(): SerializedVsrgTrack{
        return {
            instrument: this.instrument.serialize(),
            hitObjects: this.hitObjects.map(x => x.serialize()),
            color: this.color,
        }
    }
    sortTrack(){
        this.hitObjects.sort((a, b) => a.timestamp - b.timestamp)
    }
    getHitObjectAt(time: number, index: number){
        return this.hitObjects.find(x => x.timestamp === time && x.index === index) || null
    }
    addHitObject(hitObject: VsrgHitObject){
        this.hitObjects.push(hitObject)
        this.sortTrack()
    }
    createHitObjectAt(time: number, index: number){
        const exists = this.hitObjects.findIndex(x => x.timestamp === time && x.index === index)
        if(exists !== -1) return this.hitObjects[exists]
        const hitObject = new VsrgHitObject(index, time)
        this.addHitObject(hitObject)
        return hitObject
    }
    getObjectsBetween(start: number, end: number, key?: number){
        if(start > end) {
            const t = start
            start = end
            end = t
        }
        return this.hitObjects.filter(x => 
            x.timestamp >= start 
         && x.timestamp <= end 
         && (key === undefined || x.index === key))
    }
    removeObjectsBetween(start: number, end: number, key?: number){
        const objects = this.getObjectsBetween(start, end, key)
        objects.forEach(x => this.removeHitObjectAt(x.timestamp, x.index))
    }
    setHeldHitObjectTail(hitObject: VsrgHitObject,  duration: number){
        const removeBound = hitObject.timestamp + duration
        const toRemove = this.getObjectsBetween(hitObject.timestamp, removeBound, hitObject.index)
        toRemove.forEach(x => x !== hitObject && this.removeHitObjectAt(x.timestamp, x.index))
        if(duration < 0){
            hitObject.holdDuration = Math.abs(duration)
            hitObject.timestamp = removeBound
        }else{
            hitObject.holdDuration = duration
        }
    }
    removeHitObject(hitObject: VsrgHitObject){
        const index = this.hitObjects.indexOf(hitObject)
        if(index === -1) return
        this.hitObjects.splice(index, 1)
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
        const track = new VsrgTrack()
        track.instrument = this.instrument.clone()
        track.hitObjects = this.hitObjects.map(x => x.clone())
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

export class VsrgHitObject{
    index: number
    isHeld: boolean = false
    timestamp: number
    notes: number[] = []
    holdDuration: number = 0
    renderId: number = 0
    static globalRenderId: number = 0
    constructor(index:number, timestamp: number) {
        this.index = index
        this.timestamp = timestamp
        this.renderId = VsrgHitObject.globalRenderId++
    }
    static deserialize(data: SerializedVsrgHitObject): VsrgHitObject {
        const hitObject = new VsrgHitObject(data[0], data[1])
        hitObject.holdDuration = data[2]
        hitObject.notes = [...data[3]]
        hitObject.isHeld = hitObject.holdDuration > 0
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
        hitObject.isHeld = this.isHeld

        return hitObject
    }
}
