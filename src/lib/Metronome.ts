import { AUDIO_CONTEXT } from "appConfig";
import { fetchAudioBuffer } from "./Instrument";
import { delay } from "./Tools";


const emptyBuffer = AUDIO_CONTEXT.createBuffer(2, AUDIO_CONTEXT.sampleRate, AUDIO_CONTEXT.sampleRate)
class Metronome{
    bpm: number
    beats: number = 4
    volume: number = 50
    currentTick: number = 0
    running: boolean = false 
    indicatorBuffer: AudioBuffer = emptyBuffer
    crochetBuffer: AudioBuffer = emptyBuffer
    volumeNode: GainNode = AUDIO_CONTEXT.createGain()
    constructor(bpm?: number){
        this.bpm = bpm ?? 220
        this.loadBuffers()

        this.volumeNode.connect(AUDIO_CONTEXT.destination)
    }
    destroy(){
        this.volumeNode.disconnect()

    }
    changeVolume(volume: number){
        this.volume = volume
        this.volumeNode.gain.value = volume / 100
    }
    async loadBuffers(){
        const promises = [
            fetchAudioBuffer("./assets/audio/Drum/1.mp3").catch(() => emptyBuffer),
            fetchAudioBuffer("./assets/audio/Drum/0.mp3").catch(() => emptyBuffer)
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
        const source = AUDIO_CONTEXT.createBufferSource()
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


