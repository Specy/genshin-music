import { fetchAudioBuffer } from "./Instrument";
import { delay } from "./Utilities";


class Metronome{
    emptyBuffer: AudioBuffer | null = null
    bpm: number
    beats: number = 4
    volume: number = 50
    currentTick: number = 0
    running: boolean = false 
    indicatorBuffer: AudioBuffer | null = null
    crochetBuffer: AudioBuffer | null = null
    volumeNode: GainNode | null = null
    audioContext: AudioContext | null = null
    constructor(bpm?: number){
        this.bpm = bpm ?? 220

    }
    init(audioContext: AudioContext){
        this.audioContext = audioContext
        this.volumeNode = audioContext.createGain()
        this.loadBuffers()
        this.volumeNode.connect(this.audioContext.destination)
        this.changeVolume(this.volume)
    }
    destroy(){
        this.volumeNode?.disconnect()
    }
    changeVolume(volume: number){
        this.volume = volume
        if(!this.volumeNode) return
        this.volumeNode.gain.value = volume / 100
    }
    async loadBuffers(){
        if(!this.audioContext) return
        this.emptyBuffer = this.audioContext.createBuffer(2, this.audioContext.sampleRate, this.audioContext.sampleRate)
        const promises = [
            fetchAudioBuffer("./assets/audio/MetronomeSFX/bar.mp3", this.audioContext).catch(() => this.emptyBuffer),
            fetchAudioBuffer("./assets/audio/MetronomeSFX/quarter.mp3", this.audioContext).catch(() => this.emptyBuffer)
        ]
        const result = await Promise.all(promises)
        this.indicatorBuffer = result[0]
        this.crochetBuffer = result[1]
    }
    async start(){
        if(this.running) return
        this.running = true
        this.currentTick = 0
        while(this.running){
            this.tick()
            await delay(60000 / this.bpm)
        }
    }
    stop(){
        this.running = false
    }
    toggle(){
        if(this.running){
            this.stop()
        }else{
            this.start()
        }
    }
    tick(){
        if(!this.audioContext || !this.indicatorBuffer || !this.crochetBuffer || !this.volumeNode) return
        const source = this.audioContext.createBufferSource()
        if(this.currentTick % this.beats === 0){
            source.buffer = this.crochetBuffer
            this.currentTick = 0
        }else{
            source.buffer = this.indicatorBuffer
        }
        this.currentTick++
        source.connect(this.volumeNode)
        source.start(0)
        function handleEnd() {
            source.stop()
            source.disconnect()
        }
        source.addEventListener('ended', handleEnd, { once: true })
    }
}

export const metronome = new Metronome()


